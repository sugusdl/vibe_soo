import "server-only";
import type { BoxOfficeItem, BoxOfficeResult, PeriodType } from "@/lib/box-office";
import { fetchKobisBoxOffice } from "@/lib/server/kobis";
import { saveOriginalSnapshot } from "@/lib/server/original-snapshot";
import { DbError, isFresh, matchesStored, readBoxOfficePeriod, saveBoxOfficePeriod, type StoredBoxOffice } from "@/lib/server/supabase";

const DATA_TTL_MS = 24 * 60 * 60 * 1000;
const EMPTY_TTL_MS = 60 * 60 * 1000;
const refreshes = new Map<string, Promise<BoxOfficeResult>>();

function fromStored(stored: StoredBoxOffice): BoxOfficeResult {
  return {
    data: { status: stored.status, items: stored.items },
    meta: {
      date: stored.date, type: stored.type,
      rangeStart: stored.rangeStart, rangeEnd: stored.rangeEnd,
      source: "cache", fetchedAt: stored.fetchedAt, expiresAt: stored.expiresAt,
      cachePersisted: true, generatedAt: new Date().toISOString(),
    },
  };
}

function fromKobis(type: PeriodType, date: string, result: {
  rangeStart: string; rangeEnd: string; items: BoxOfficeItem[];
}, fetchedAt: string, expiresAt: string | null, persisted: boolean): BoxOfficeResult {
  return {
    data: { status: result.items.length ? "data" : "empty", items: result.items },
    meta: {
      date, type, rangeStart: result.rangeStart, rangeEnd: result.rangeEnd,
      source: "kobis", fetchedAt, expiresAt, cachePersisted: persisted,
      generatedAt: new Date().toISOString(),
      ...(persisted ? {} : { warning: "CACHE_WRITE_FAILED" as const }),
    },
  };
}

async function refresh(type: PeriodType, date: string): Promise<BoxOfficeResult> {
  const requestStartedAt = new Date().toISOString();
  const external = await fetchKobisBoxOffice(type, date);
  const fetchedAt = new Date().toISOString();
  const expiresAt = new Date(Date.parse(fetchedAt) +
    (external.items.length ? DATA_TTL_MS : EMPTY_TTL_MS)).toISOString();

  let outcome: "saved" | "stale";
  try {
    outcome = await saveBoxOfficePeriod({
      type, date, rangeStart: external.rangeStart, rangeEnd: external.rangeEnd,
      items: external.items, requestStartedAt, fetchedAt, expiresAt,
    });
  } catch (cause) {
    if (cause instanceof DbError && cause.code === "DB_WRITE") {
      // 검증된 외부 결과만 제공한다. 저장됐다고 주장하거나 TTL을 부여하지 않는다.
      return fromKobis(type, date, external, fetchedAt, null, false);
    }
    throw cause;
  }

  const stored = await readBoxOfficePeriod(type, date);
  if (!stored) throw new DbError("DB_INVALID_RESPONSE");
  if (outcome === "stale") {
    if (!isFresh(stored)) throw new DbError("DB_INVALID_RESPONSE");
    return fromStored(stored);
  }
  if (Date.parse(stored.fetchedAt) !== Date.parse(fetchedAt) || !matchesStored({
    status: external.items.length ? "data" : "empty",
    rangeStart: external.rangeStart, rangeEnd: external.rangeEnd, items: external.items,
  }, stored)) {
    throw new DbError("DB_INVALID_RESPONSE");
  }
  // 검증용 로컬 원본. 배포 환경의 영속 저장소는 아니므로 실패해도 API 결과를 바꾸지 않는다.
  await saveOriginalSnapshot(type, date, external.original);
  return fromKobis(type, date, stored, stored.fetchedAt, stored.expiresAt, true);
}

export async function getLiveBoxOffice(type: PeriodType, date: string): Promise<BoxOfficeResult> {
  const stored = await readBoxOfficePeriod(type, date);
  if (stored && isFresh(stored)) return fromStored(stored);

  const key = `${type}:${date}`;
  const inProgress = refreshes.get(key);
  if (inProgress) {
    const result = await inProgress;
    if (result.meta.cachePersisted) {
      const updated = await readBoxOfficePeriod(type, date);
      if (updated && isFresh(updated)) return fromStored(updated);
    }
    return result;
  }
  const pending = refresh(type, date);
  refreshes.set(key, pending);
  try { return await pending; }
  finally { if (refreshes.get(key) === pending) refreshes.delete(key); }
}

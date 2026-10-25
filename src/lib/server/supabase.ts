import "server-only";
import { isCalendarDate, type BoxOfficeItem, type PeriodType } from "@/lib/box-office";
import { normalizeMovies } from "@/lib/server/normalize";

const DB_TIMEOUT_MS = 5_000;

export type DbErrorCode = "DB_CONFIG" | "DB_READ" | "DB_WRITE" | "DB_INVALID_RESPONSE";

export class DbError extends Error {
  constructor(readonly code: DbErrorCode) {
    super(code);
    this.name = "DbError";
  }
}

export type StoredBoxOffice = {
  status: "data" | "empty";
  date: string;
  type: PeriodType;
  rangeStart: string;
  rangeEnd: string;
  fetchedAt: string;
  expiresAt: string;
  items: BoxOfficeItem[];
};

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function parseStored(value: unknown, type: PeriodType, date: string): StoredBoxOffice {
  const item = record(value);
  if (!item || (item.status !== "data" && item.status !== "empty") ||
      item.date !== date || item.type !== type ||
      typeof item.rangeStart !== "string" || !isCalendarDate(item.rangeStart) ||
      typeof item.rangeEnd !== "string" || !isCalendarDate(item.rangeEnd) ||
      item.rangeStart > item.rangeEnd ||
      !validTimestamp(item.fetchedAt) || !validTimestamp(item.expiresAt) ||
      Date.parse(item.expiresAt) <= Date.parse(item.fetchedAt) || !Array.isArray(item.items)) {
    throw new DbError("DB_INVALID_RESPONSE");
  }
  try {
    const items = normalizeMovies(item.items.map((raw) => {
      const row = record(raw);
      if (!row || typeof row.rank !== "number" || !Number.isSafeInteger(row.rank)) {
        throw new DbError("DB_INVALID_RESPONSE");
      }
      return { ...row, rank: String(row.rank) };
    }));
    if ((item.status === "empty") !== (items.length === 0)) throw new DbError("DB_INVALID_RESPONSE");
    return {
      status: item.status, date, type, rangeStart: item.rangeStart, rangeEnd: item.rangeEnd,
      fetchedAt: item.fetchedAt, expiresAt: item.expiresAt, items,
    };
  } catch {
    throw new DbError("DB_INVALID_RESPONSE");
  }
}

async function rpc(name: "read_box_office_period" | "save_box_office_period", body: Record<string, unknown>): Promise<unknown> {
  const secret = process.env.SUPABASE_SECRET_KEY;
  const base = process.env.SUPABASE_URL;
  if (!secret?.trim() || !base?.trim()) throw new DbError("DB_CONFIG");
  let url: URL;
  try {
    url = new URL(`/rest/v1/rpc/${name}`, base);
    if (url.protocol !== "https:") throw new Error("INSECURE_DB_URL");
  } catch {
    throw new DbError("DB_CONFIG");
  }
  try {
    const response = await fetch(url, {
      method: "POST", cache: "no-store", redirect: "error",
      headers: { apikey: secret, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body), signal: AbortSignal.timeout(DB_TIMEOUT_MS),
    });
    if (!response.ok) throw new DbError(name === "read_box_office_period" ? "DB_READ" : "DB_WRITE");
    return await response.json();
  } catch (cause) {
    if (cause instanceof DbError) throw cause;
    throw new DbError(name === "read_box_office_period" ? "DB_READ" : "DB_WRITE");
  }
}

export async function readBoxOfficePeriod(type: PeriodType, date: string): Promise<StoredBoxOffice | null> {
  const value = await rpc("read_box_office_period", { p_period_type: type, p_target_date: date });
  if (value === null) return null;
  return parseStored(value, type, date);
}

export async function saveBoxOfficePeriod(input: {
  type: PeriodType;
  date: string;
  rangeStart: string;
  rangeEnd: string;
  items: BoxOfficeItem[];
  requestStartedAt: string;
  fetchedAt: string;
  expiresAt: string;
}): Promise<"saved" | "stale"> {
  const value = await rpc("save_box_office_period", {
    p_period_type: input.type,
    p_target_date: input.date,
    p_range_start: input.rangeStart,
    p_range_end: input.rangeEnd,
    p_status: input.items.length ? "data" : "empty",
    p_request_started_at: input.requestStartedAt,
    p_fetched_at: input.fetchedAt,
    p_expires_at: input.expiresAt,
    p_items: input.items,
  });
  const result = record(value);
  if (result?.saved === true) return "saved";
  if (result?.saved === false && result.reason === "STALE") return "stale";
  throw new DbError("DB_INVALID_RESPONSE");
}

export function isFresh(stored: StoredBoxOffice, now = new Date()): boolean {
  return Date.parse(stored.expiresAt) > now.getTime();
}

export function matchesStored(original: {
  status: "data" | "empty";
  rangeStart: string;
  rangeEnd: string;
  items: BoxOfficeItem[];
}, stored: StoredBoxOffice): boolean {
  if (original.status !== stored.status || original.rangeStart !== stored.rangeStart ||
      original.rangeEnd !== stored.rangeEnd || original.items.length !== stored.items.length) return false;
  const byCode = new Map(stored.items.map((item) => [item.movieCd, item]));
  return original.items.every((item) => {
    const actual = byCode.get(item.movieCd);
    return actual && item.movieNm === actual.movieNm &&
      (item.openDt === null || item.openDt === actual.openDt) &&
      item.rank === actual.rank && item.salesAmt === actual.salesAmt &&
      item.audiCnt === actual.audiCnt && item.salesAcc === actual.salesAcc &&
      item.audiAcc === actual.audiAcc;
  });
}

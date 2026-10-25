import "server-only";
import { isCalendarDate, type BoxOfficeItem, type PeriodType } from "@/lib/box-office";
import { normalizeMovies } from "@/lib/server/normalize";

const API_ROOT = "https://www.kobis.or.kr/kobisopenapi/webservice/rest/boxoffice";
const TIMEOUT_MS = 5_000;

export type KobisErrorCode = "KOBIS_CONFIG" | "KOBIS_TIMEOUT" | "KOBIS_UPSTREAM" | "KOBIS_INVALID_RESPONSE";

export class KobisError extends Error {
  constructor(readonly code: KobisErrorCode) {
    super(code);
    this.name = "KobisError";
  }
}

type ValidatedBoxOffice = {
  items: BoxOfficeItem[];
  rangeStart: string;
  rangeEnd: string;
};

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function parseShowRange(value: unknown, type: PeriodType, targetDate: string) {
  if (typeof value !== "string" || !/^\d{8}~\d{8}$/.test(value)) {
    throw new KobisError("KOBIS_INVALID_RESPONSE");
  }
  const rangeStart = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  const rangeEnd = `${value.slice(9, 13)}-${value.slice(13, 15)}-${value.slice(15, 17)}`;
  if (!isCalendarDate(rangeStart) || !isCalendarDate(rangeEnd) || rangeStart > rangeEnd ||
      (type === "daily" && (rangeStart !== targetDate || rangeEnd !== targetDate))) {
    throw new KobisError("KOBIS_INVALID_RESPONSE");
  }
  return { rangeStart, rangeEnd };
}

export function parseKobisResponse(payload: unknown, type: PeriodType, targetDate: string): ValidatedBoxOffice {
  const root = record(payload);
  const result = record(root?.boxOfficeResult);
  const listName = type === "daily" ? "dailyBoxOfficeList" : "weeklyBoxOfficeList";
  if (!result || typeof result.boxofficeType !== "string" || !result.boxofficeType.trim() ||
      !Array.isArray(result[listName])) {
    throw new KobisError("KOBIS_INVALID_RESPONSE");
  }
  const range = parseShowRange(result.showRange, type, targetDate);
  try {
    return { ...range, items: normalizeMovies(result[listName]) };
  } catch {
    throw new KobisError("KOBIS_INVALID_RESPONSE");
  }
}

export function buildKobisUrl(type: PeriodType, targetDate: string, apiKey: string): URL {
  const name = type === "daily" ? "searchDailyBoxOfficeList.json" : "searchWeeklyBoxOfficeList.json";
  const url = new URL(`${API_ROOT}/${name}`);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("targetDt", targetDate.replaceAll("-", ""));
  url.searchParams.set("itemPerPage", "10");
  if (type !== "daily") url.searchParams.set("weekGb", type === "weekly" ? "0" : "1");
  return url;
}

export async function fetchKobisBoxOffice(type: PeriodType, targetDate: string): Promise<ValidatedBoxOffice & { original: unknown }> {
  const apiKey = process.env.KOBIS_API_KEY;
  if (!apiKey?.trim()) throw new KobisError("KOBIS_CONFIG");

  try {
    // URL에 키가 포함되므로 URL과 원본 오류 객체는 응답이나 로그에 기록하지 않는다.
    const response = await fetch(buildKobisUrl(type, targetDate, apiKey), {
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new KobisError("KOBIS_UPSTREAM");
    let payload: unknown;
    try { payload = await response.json(); }
    catch { throw new KobisError("KOBIS_INVALID_RESPONSE"); }
    const parsed = parseKobisResponse(payload, type, targetDate);
    const source = (payload as { boxOfficeResult: Record<string, unknown> }).boxOfficeResult;
    const listName = type === "daily" ? "dailyBoxOfficeList" : "weeklyBoxOfficeList";
    const original = {
      boxOfficeResult: {
        boxofficeType: source.boxofficeType,
        showRange: source.showRange,
        [listName]: (source[listName] as Record<string, unknown>[]).map((row) => ({
          movieCd: row.movieCd, movieNm: row.movieNm, rank: row.rank, openDt: row.openDt,
          salesAmt: row.salesAmt, audiCnt: row.audiCnt, salesAcc: row.salesAcc, audiAcc: row.audiAcc,
        })),
      },
    };
    return { ...parsed, original };
  } catch (error) {
    if (error instanceof KobisError) throw error;
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new KobisError("KOBIS_TIMEOUT");
    }
    throw new KobisError("KOBIS_UPSTREAM");
  }
}

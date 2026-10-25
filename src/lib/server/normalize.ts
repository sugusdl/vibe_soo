import "server-only";
import { isCalendarDate, type BoxOfficeItem } from "@/lib/box-office";

export function parseInteger(value: unknown): bigint {
  if (typeof value !== "string" || !/^-?\d+$/.test(value)) throw new Error("INVALID_INTEGER");
  const result = BigInt(value);
  if (result < -(2n ** 63n) || result > 2n ** 63n - 1n) throw new Error("INTEGER_OUT_OF_RANGE");
  return result;
}

export function normalizeMovies(value: unknown): BoxOfficeItem[] {
  if (!Array.isArray(value)) throw new Error("INVALID_LIST");
  const seen = new Set<string>();
  return value.map((raw): BoxOfficeItem => {
    if (!raw || typeof raw !== "object") throw new Error("INVALID_MOVIE");
    const item = raw as Record<string, unknown>;
    if (typeof item.movieCd !== "string" || !item.movieCd.trim() ||
        typeof item.movieNm !== "string" || !item.movieNm.trim() || seen.has(item.movieCd)) {
      throw new Error("INVALID_MOVIE");
    }
    seen.add(item.movieCd);
    const rank = parseInteger(item.rank);
    if (rank < 1n || rank > 2_147_483_647n) throw new Error("INVALID_RANK");
    const openDt = item.openDt === "" || item.openDt == null ? null : item.openDt;
    if (openDt !== null && (typeof openDt !== "string" || !isCalendarDate(openDt))) {
      throw new Error("INVALID_OPEN_DATE");
    }
    return {
      movieCd: item.movieCd, movieNm: item.movieNm, rank: Number(rank), openDt,
      salesAmt: parseInteger(item.salesAmt).toString(),
      audiCnt: parseInteger(item.audiCnt).toString(),
      salesAcc: parseInteger(item.salesAcc).toString(),
      audiAcc: parseInteger(item.audiAcc).toString(),
    };
  }).sort((a, b) => a.rank - b.rank);
}

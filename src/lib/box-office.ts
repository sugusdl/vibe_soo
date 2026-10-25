export const periodLabels = { daily: "일간", weekly: "주간", weekend: "주말" } as const;
export type PeriodType = keyof typeof periodLabels;
export type DataMode = "demo" | "live";
export type DemoScenario = "normal" | "slow" | "error";

export interface BoxOfficeItem {
  movieCd: string;
  movieNm: string;
  rank: number;
  openDt: string | null;
  salesAmt: string;
  audiCnt: string;
  salesAcc: string;
  audiAcc: string;
}

export interface BoxOfficeResult {
  data: {
    status: "data" | "empty";
    items: BoxOfficeItem[];
  };
  meta: {
    date: string;
    type: PeriodType;
    rangeStart: string;
    rangeEnd: string;
    source: "fixture" | "kobis";
    fetchedAt: string | null;
    expiresAt: null;
    cachePersisted: false;
    generatedAt: string;
  };
}

export function resolveDataMode(value: string | undefined): DataMode {
  if (value === undefined || value === "demo") return "demo";
  if (value === "live") return "live";
  throw new Error("INVALID_DATA_MODE");
}

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function getKoreaToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

export function getPreviousDate(date: string): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

export function filterMovies(items: BoxOfficeItem[], keyword: string): BoxOfficeItem[] {
  const query = keyword.trim().toLocaleLowerCase("en-US");
  return items.filter((item) => item.movieNm.toLocaleLowerCase("en-US").includes(query));
}

export function formatInteger(value: string): string {
  return new Intl.NumberFormat("ko-KR").format(BigInt(value));
}

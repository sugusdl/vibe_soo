import type { BoxOfficeResult } from "@/lib/box-office";

export type DayState = "loading" | "data" | "empty" | "error";
export type InsightDay = { date: string; state: DayState; result?: BoxOfficeResult };

export function datesEndingAt(endDate: string, days: 7 | 14 | 30): string[] {
  const end = new Date(`${endDate}T00:00:00.000Z`);
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(end);
    date.setUTCDate(end.getUTCDate() - days + index + 1);
    return date.toISOString().slice(0, 10);
  });
}

export function aggregateInsights(days: InsightDay[], topCount: 5 | 10) {
  const counts = { loading: 0, data: 0, empty: 0, error: 0 };
  const movies = new Map<string, { movieCd: string; movieNm: string; sales: bigint; audience: bigint }>();
  let totalSales = 0n;
  let totalAudience = 0n;
  const trend = days.map((day) => {
    counts[day.state]++;
    if (day.state !== "data" || !day.result) return { date: day.date, state: day.state, sales: null, audience: null };
    let sales = 0n;
    let audience = 0n;
    const seen = new Set<string>();
    for (const item of day.result.data.items) {
      if (seen.has(item.movieCd)) throw new Error("DUPLICATE_MOVIE");
      seen.add(item.movieCd);
      const itemSales = BigInt(item.salesAmt);
      const itemAudience = BigInt(item.audiCnt);
      if (itemSales < 0n || itemAudience < 0n) throw new Error("INVALID_NUMBER");
      sales += itemSales;
      audience += itemAudience;
      const current = movies.get(item.movieCd) ?? { movieCd: item.movieCd, movieNm: item.movieNm, sales: 0n, audience: 0n };
      current.sales += itemSales;
      current.audience += itemAudience;
      movies.set(item.movieCd, current);
    }
    totalSales += sales;
    totalAudience += audience;
    return { date: day.date, state: day.state, sales, audience };
  });
  const complete = counts.loading === 0 && counts.error === 0;
  const hasData = counts.data > 0;
  const top = complete && hasData ? [...movies.values()].sort((a, b) =>
    a.sales === b.sales ? a.audience === b.audience ? a.movieCd.localeCompare(b.movieCd) : a.audience > b.audience ? -1 : 1 : a.sales > b.sales ? -1 : 1,
  ).slice(0, topCount) : [];
  return { counts, trend, complete, hasData, top, totalSales: complete && hasData ? totalSales : null, totalAudience: complete && hasData ? totalAudience : null };
}

export function formatScaled(value: bigint, divisor: bigint, unit: string, decimals = 1): string {
  const scale = 10n ** BigInt(decimals);
  const rounded = (value * scale + divisor / 2n) / divisor;
  const whole = rounded / scale;
  const fraction = rounded % scale;
  return `${whole.toLocaleString("ko-KR")}${decimals ? `.${fraction.toString().padStart(decimals, "0")}` : ""}${unit}`;
}

export function formatRevenuePerPerson(sales: bigint | null, audience: bigint | null): string {
  if (sales === null || audience === null || audience <= 0n) return "—";
  return `${((sales + audience / 2n) / audience).toLocaleString("ko-KR")}원`;
}

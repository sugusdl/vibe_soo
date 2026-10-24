import "server-only";
import type { PeriodType } from "@/lib/box-office";

export const DEMO_START = "2026-09-07";
export const DEMO_END = "2026-09-13";

// KOBIS처럼 숫자도 문자열로 보관하는 가상 원본이다. 실제 영화·실적이 아니다.
const movies = [
  { movieCd: "DEMO001", movieNm: "바다의 편지", openDt: "2026-09-02" },
  { movieCd: "DEMO002", movieNm: "별빛 극장", openDt: "2026-09-03" },
  { movieCd: "DEMO003", movieNm: "여름의 끝", openDt: "2026-08-26" },
  { movieCd: "DEMO004", movieNm: "City Lights", openDt: "2026-09-05" },
  { movieCd: "DEMO005", movieNm: "달빛 정류장", openDt: "" },
] as const;

// 행: 9월 7~13일, 열: 위 영화 순서, 값: 일간 관객수 문자열.
const audiences = [
  ["10000", "8000", "6000", "4000", "2000"],
  ["11000", "12000", "6500", "4500", "2200"],
  ["12000", "9000", "7000", "5000", "2400"],
  ["13000", "14000", "7500", "5500", "2600"],
  ["20000", "18000", "10000", "8000", "4000"],
  ["30000", "28000", "15000", "12000", "6000"],
  ["25000", "26000", "13000", "10000", "5000"],
] as const;

export function getRawDemoFixture(date: string, type: PeriodType) {
  if (date < DEMO_START || date > DEMO_END) {
    return { rangeStart: date, rangeEnd: date, items: [] };
  }

  const selectedIndex = Number(date.slice(-2)) - 7;
  const start = type === "daily" ? selectedIndex : type === "weekly" ? 0 : 4;
  const end = type === "daily" ? selectedIndex : 6;
  const totals = movies.map((movie, movieIndex) => {
    const audiCnt = audiences.slice(start, end + 1)
      .reduce((sum, row) => sum + BigInt(row[movieIndex]), 0n);
    const audiAcc = 50000n + audiences.slice(0, end + 1)
      .reduce((sum, row) => sum + BigInt(row[movieIndex]), 0n);
    return {
      ...movie,
      salesAmt: (audiCnt * 10000n).toString(),
      audiCnt: audiCnt.toString(),
      salesAcc: (audiAcc * 10000n).toString(),
      audiAcc: audiAcc.toString(),
    };
  }).sort((a, b) => {
    const left = BigInt(a.salesAmt), right = BigInt(b.salesAmt);
    return left === right ? a.movieCd.localeCompare(b.movieCd) : left > right ? -1 : 1;
  });

  return {
    rangeStart: `2026-09-${String(7 + start).padStart(2, "0")}`,
    rangeEnd: `2026-09-${String(7 + end).padStart(2, "0")}`,
    items: totals.map((movie, index) => ({ ...movie, rank: String(index + 1) })),
  };
}

import { describe, expect, it } from "vitest";
import { aggregateInsights, datesEndingAt, formatLeaderSalesShare, formatRevenuePerPerson, formatScaled, type InsightDay } from "@/lib/insights";
import type { BoxOfficeResult } from "@/lib/box-office";

function day(date: string, values: Array<[string, string, string, string]>): InsightDay {
  const result: BoxOfficeResult = {
    data: { status: "data", items: values.map(([movieCd, movieNm, salesAmt, audiCnt], index) => ({ movieCd, movieNm, rank: index + 1, openDt: null, salesAmt, audiCnt, salesAcc: "999999999999", audiAcc: "999999999999" })) },
    meta: { date, type: "daily", rangeStart: date, rangeEnd: date, source: "fixture", fetchedAt: null, expiresAt: null, cachePersisted: false, generatedAt: "2026-10-25T00:00:00Z" },
  };
  return { date, state: "data", result };
}

describe("인사이트 집계", () => {
  it("두 날짜의 관측값만 합산하고 코드별로 묶는다", () => {
    const result = aggregateInsights([
      day("2026-09-07", [["A", "같은 제목", "100000000", "10000"], ["B", "같은 제목", "80000000", "8000"], ["C", "세 번째", "60000000", "6000"], ["D", "네 번째", "40000000", "4000"], ["E", "다섯 번째", "20000000", "2000"]]),
      day("2026-09-08", [["A", "같은 제목", "110000000", "11000"], ["B", "같은 제목", "120000000", "12000"], ["C", "세 번째", "65000000", "6500"], ["D", "네 번째", "45000000", "4500"], ["E", "다섯 번째", "22000000", "2200"]]),
    ], 5);
    expect(result.trend.map((point) => point.sales)).toEqual([300000000n, 362000000n]);
    expect(result.trend.map((point) => point.audience)).toEqual([30000n, 36200n]);
    expect(result.totalSales).toBe(662000000n);
    expect(result.totalAudience).toBe(66200n);
    expect(result.top.map((movie) => [movie.movieCd, movie.sales])).toEqual([["A", 210000000n], ["B", 200000000n], ["C", 125000000n], ["D", 85000000n], ["E", 42000000n]]);
    expect(formatScaled(result.totalSales!, 100000000n, "억원")).toBe("6.6억원");
    expect(formatRevenuePerPerson(result.totalSales, result.totalAudience)).toBe("10,000원");
  });

  it("빈 날짜는 공백, 실패 날짜는 확정 집계 중단으로 처리한다", () => {
    const normal = day("2026-09-07", [["A", "바다", "100", "10"]]);
    const empty = { date: "2026-09-08", state: "empty" as const };
    const failed = { date: "2026-09-09", state: "error" as const };
    const withEmpty = aggregateInsights([normal, empty], 5);
    expect(withEmpty.trend[1].sales).toBeNull();
    expect(withEmpty.totalSales).toBe(100n);
    const withFailure = aggregateInsights([normal, empty, failed], 5);
    expect(withFailure.totalSales).toBeNull();
    expect(withFailure.top).toEqual([]);
    expect(formatRevenuePerPerson(0n, 0n)).toBe("—");
  });

  it("종료일을 포함하는 날짜 범위를 생성한다", () => {
    expect(datesEndingAt("2026-09-13", 14)).toHaveLength(14);
    expect(datesEndingAt("2026-09-13", 14)[0]).toBe("2026-08-31");
    expect(datesEndingAt("2026-09-13", 30)[0]).toBe("2026-08-15");
  });

  it("Top 동률은 관객수와 영화 코드 순으로 정렬하고 10개 요청에 실제 영화만 반환한다", () => {
    const result = aggregateInsights([day("2026-09-07", [
      ["C", "같은 제목", "100", "10"], ["B", "같은 제목", "100", "20"], ["A", "같은 제목", "100", "20"],
    ])], 10);
    expect(result.top.map((movie) => movie.movieCd)).toEqual(["A", "B", "C"]);
  });

  it("전부 빈 날짜면 가상의 합계·Top을 만들지 않는다", () => {
    const result = aggregateInsights([{ date: "2026-09-06", state: "empty" }], 5);
    expect(result.hasData).toBe(false);
    expect(result.totalSales).toBeNull();
    expect(result.totalAudience).toBeNull();
    expect(result.top).toEqual([]);
  });

  it("1위 점유율을 마지막에 한 자리로 반올림하고 분모 0은 —로 표시한다", () => {
    // 7일 demo 독립 손계산: 바다 121,000명, 전체 374,200명, 1인당 10,000원.
    expect(formatLeaderSalesShare(1210000000n, 3742000000n)).toBe("32.3%");
    expect(formatLeaderSalesShare(0n, 0n)).toBe("—");
    expect(formatLeaderSalesShare(null, 3742000000n)).toBe("—");
  });
});

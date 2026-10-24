// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { filterMovies, formatInteger, getKoreaToday, isCalendarDate, resolveDataMode } from "@/lib/box-office";
import { getRawDemoFixture } from "@/lib/server/demo-fixtures";
import { normalizeMovies, parseInteger } from "@/lib/server/normalize";
import { GET } from "@/app/api/box-office/route";

beforeEach(() => {
  vi.stubEnv("DATA_MODE", "demo");
  // API 내부의 외부 요청이 하나라도 생기면 실패한다.
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("EXTERNAL_CALL_FORBIDDEN"); }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("검증과 숫자 정밀도 (PRD AC 3·4·14)", () => {
  it("정수 문자열을 실제 정수로 비교·합산한다", () => {
    expect(parseInteger("900") + parseInteger("1000")).toBe(1900n);
    expect(parseInteger("1000") > parseInteger("900")).toBe(true);
    expect(formatInteger("9007199254740993")).toBe("9,007,199,254,740,993");
    const raw = getRawDemoFixture("2026-09-13", "daily").items[0];
    const item = normalizeMovies([{ ...raw, salesAmt: "9007199254740993" }])[0];
    expect(JSON.parse(JSON.stringify(item)).salesAmt).toBe("9007199254740993");
  });
  it.each(["", "1.5", "abc", " 900 ", null, undefined, 900, "9223372036854775808"])("잘못된 숫자 %s를 0으로 숨기지 않는다", (value) => {
    expect(() => parseInteger(value)).toThrow();
  });
  it("목록 누락·영화 코드 중복·잘못된 순위·날짜를 거절한다", () => {
    const raw = getRawDemoFixture("2026-09-13", "daily").items[0];
    expect(() => normalizeMovies(undefined)).toThrow();
    expect(() => normalizeMovies([raw, raw])).toThrow();
    expect(() => normalizeMovies([{ ...raw, rank: "0" }])).toThrow();
    expect(() => normalizeMovies([{ ...raw, openDt: "2026-02-30" }])).toThrow();
    expect(normalizeMovies([{ ...raw, openDt: "" }])[0].openDt).toBeNull();
  });
  it("실제 달력 날짜와 한국 시간 경계를 검증한다", () => {
    expect(isCalendarDate("2026-02-29")).toBe(false);
    expect(isCalendarDate("2028-02-29")).toBe(true);
    expect(getKoreaToday(new Date("2026-09-12T15:00:00Z"))).toBe("2026-09-13");
  });
});

describe("fixture·기간·검색 (PRD AC 2·3·5)", () => {
  it.each(["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-12", "2026-09-13"])("%s는 세 유형 모두 검증된 가상 목록을 제공한다", (date) => {
    for (const type of ["daily", "weekly", "weekend"] as const) {
      expect(normalizeMovies(getRawDemoFixture(date, type).items)).toHaveLength(5);
    }
  });
  it("주간·주말은 해당 일간 실적만 더하고 누적값은 마지막 스냅샷을 사용한다", () => {
    const daily = normalizeMovies(getRawDemoFixture("2026-09-13", "daily").items);
    const weekly = getRawDemoFixture("2026-09-07", "weekly");
    const weekend = getRawDemoFixture("2026-09-13", "weekend");
    expect(weekly.rangeStart).toBe("2026-09-07");
    expect(weekly.rangeEnd).toBe("2026-09-13");
    expect(weekend.rangeStart).toBe("2026-09-11");
    const ocean = (items: typeof daily) => items.find((item) => item.movieCd === "DEMO001")!;
    expect(ocean(daily)).toMatchObject({ rank: 2, salesAmt: "250000000", audiCnt: "25000", audiAcc: "171000" });
    expect(ocean(normalizeMovies(weekly.items))).toMatchObject({ rank: 1, salesAmt: "1210000000", audiCnt: "121000", audiAcc: "171000" });
    expect(ocean(normalizeMovies(weekend.items))).toMatchObject({ salesAmt: "750000000", audiCnt: "75000", audiAcc: "171000" });
  });
  it("앞뒤 공백·영문 대소문자를 무시하고 원래 순위를 보존한다", () => {
    const items = normalizeMovies(getRawDemoFixture("2026-09-13", "daily").items);
    expect(filterMovies(items, " 바다 ")[0]).toMatchObject({ movieNm: "바다의 편지", rank: 2 });
    expect(filterMovies(items, "CITY")[0].movieNm).toBe("City Lights");
    expect(filterMovies(items, "없는제목")).toHaveLength(0);
    expect(filterMovies(items, " ")).toHaveLength(5);
  });
});

describe("내부 API 상태·모드와 외부 호출 차단 (PRD AC 11·12·14)", () => {
  it("기본 환경은 demo이고 잘못된 모드는 거절한다", () => {
    expect(resolveDataMode(undefined)).toBe("demo");
    expect(resolveDataMode("live")).toBe("live");
    expect(() => resolveDataMode("typo")).toThrow();
  });
  it("정상 목록과 정상 빈 결과를 HTTP 200으로 구분한다", async () => {
    for (const type of ["daily", "weekly", "weekend"]) {
      const response = await GET(new Request(`http://localhost/api/box-office?date=2026-09-06&type=${type}`));
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toMatchObject({ status: "empty", items: [], mode: "demo" });
    }
    const response = await GET(new Request("http://localhost/api/box-office?date=2026-09-13&type=daily"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "data", mode: "demo" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["date=2026-02-30", "date=9999-01-01", "date=2026-09-13&type=invalid", "date=2026-09-13&demoScenario=invalid"])("잘못된 입력 %s를 거절한다", async (params) => {
    const response = await GET(new Request(`http://localhost/api/box-office?${params}`));
    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("에러 시나리오는 빈 결과가 아니라 502를 반환한다", async () => {
    const response = await GET(new Request("http://localhost/api/box-office?date=2026-09-13&demoScenario=error"));
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ status: "error", code: "DEMO_ERROR" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("느린 응답은 2.5초 후 성공한다", async () => {
    vi.useFakeTimers();
    const pending = GET(new Request("http://localhost/api/box-office?date=2026-09-13&demoScenario=slow"));
    await vi.advanceTimersByTimeAsync(2500);
    expect((await pending).status).toBe(200);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["live", "typo"])("DATA_MODE=%s에서는 외부 호출 없이 503을 반환한다", async (mode) => {
    vi.stubEnv("DATA_MODE", mode);
    const response = await GET(new Request("http://localhost/api/box-office?date=2026-09-13"));
    expect(response.status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });
});

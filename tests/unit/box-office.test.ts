// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/original-snapshot", () => ({ saveOriginalSnapshot: vi.fn(async () => true) }));

import { filterMovies, formatInteger, getKoreaToday, getPreviousDate, isCalendarDate, resolveDataMode } from "@/lib/box-office";
import { getRawDemoFixture } from "@/lib/server/demo-fixtures";
import { buildKobisUrl, KobisError, parseKobisResponse } from "@/lib/server/kobis";
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
    expect(getPreviousDate("2026-10-01")).toBe("2026-09-30");
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
      expect(await response.json()).toMatchObject({
        data: { status: "empty", items: [] },
        meta: { source: "fixture", fetchedAt: null, expiresAt: null, cachePersisted: false },
      });
    }
    const response = await GET(new Request("http://localhost/api/box-office?date=2026-09-13&type=daily"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { status: "data" },
      meta: { source: "fixture", cachePersisted: false },
    });
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
    expect(await response.json()).toMatchObject({ error: { code: "DEMO_ERROR" } });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("느린 응답은 2.5초 후 성공한다", async () => {
    vi.useFakeTimers();
    const pending = GET(new Request("http://localhost/api/box-office?date=2026-09-13&demoScenario=slow"));
    await vi.advanceTimersByTimeAsync(2500);
    expect((await pending).status).toBe(200);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["live", "typo"])("키가 없는 live 또는 잘못된 DATA_MODE=%s는 외부 호출 없이 503을 반환한다", async (mode) => {
    vi.stubEnv("DATA_MODE", mode);
    vi.stubEnv("KOBIS_API_KEY", "");
    const response = await GET(new Request("http://localhost/api/box-office?date=2026-09-13"));
    expect(response.status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });
});

const kobisMovie = {
  movieCd: "20260001", movieNm: "검증용 영화", rank: "1", openDt: "2026-09-01",
  salesAmt: "9007199254740993", audiCnt: "1000", salesAcc: "9007199254740993", audiAcc: "1000",
};
function upstream(type: "daily" | "weekly" | "weekend", items: unknown = [kobisMovie]) {
  return { boxOfficeResult: {
    boxofficeType: type === "daily" ? "일별 박스오피스" : "주말 박스오피스",
    showRange: type === "daily" ? "20260906~20260906" : type === "weekly" ? "20260831~20260906" : "20260904~20260906",
    [type === "daily" ? "dailyBoxOfficeList" : "weeklyBoxOfficeList"]: items,
  } };
}

describe("KOBIS live 어댑터 (PRD AC 2·3·4·11·12)", () => {
  it("세 유형의 경로·필수 파라미터를 서버에서 조립한다", () => {
    for (const [type, expectedWeek] of [["daily", null], ["weekly", "0"], ["weekend", "1"]] as const) {
      const url = buildKobisUrl(type, "2026-09-06", "unit-test-placeholder");
      expect(url.protocol).toBe("https:");
      expect(url.pathname).toContain(type === "daily" ? "searchDailyBoxOfficeList.json" : "searchWeeklyBoxOfficeList.json");
      expect(url.searchParams.get("targetDt")).toBe("20260906");
      expect(url.searchParams.get("itemPerPage")).toBe("10");
      expect(url.searchParams.get("weekGb")).toBe(expectedWeek);
      expect(url.searchParams.has("key")).toBe(true);
    }
  });
  it.each(["daily", "weekly", "weekend"] as const)("%s 응답의 실제 기간과 큰 정수를 정규화한다", (type) => {
    const parsed = parseKobisResponse(upstream(type), type, "2026-09-06");
    expect(parsed.items[0].salesAmt).toBe("9007199254740993");
    expect(parsed.rangeStart).toBe(type === "daily" ? "2026-09-06" : type === "weekly" ? "2026-08-31" : "2026-09-04");
  });
  it("정상 빈 목록과 잘못된 목록을 구분한다", () => {
    expect(parseKobisResponse(upstream("daily", []), "daily", "2026-09-06").items).toEqual([]);
    for (const invalid of [null, [{ ...kobisMovie, salesAmt: "" }], [{ ...kobisMovie, audiCnt: "1.5" }], [kobisMovie, kobisMovie]]) {
      expect(() => parseKobisResponse(upstream("daily", invalid), "daily", "2026-09-06")).toThrow(KobisError);
    }
    expect(() => parseKobisResponse({ faultInfo: { errorCode: "TEST" } }, "daily", "2026-09-06")).toThrow(KobisError);
    expect(() => parseKobisResponse({ boxOfficeResult: { ...upstream("daily").boxOfficeResult, showRange: "20260905~20260905" } }, "daily", "2026-09-06")).toThrow(KobisError);
  });
  it("live는 KOBIS 결과를 반환하고 demo 전용 파라미터를 거절한다", async () => {
    vi.stubEnv("DATA_MODE", "live");
    vi.stubEnv("KOBIS_API_KEY", "unit-test-placeholder");
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "unit-test-placeholder");
    let stored: Record<string, unknown> | null = null;
    let savedTtlMs = 0;
    const fetchMock = vi.fn(async (input: URL, init?: RequestInit) => {
      const path = input.pathname;
      if (path.endsWith("/read_box_office_period")) return { ok: true, json: async () => stored };
      if (path.endsWith("/save_box_office_period")) {
        const params = JSON.parse(String(init?.body));
        savedTtlMs = Date.parse(params.p_expires_at) - Date.parse(params.p_fetched_at);
        stored = {
          date: params.p_target_date, type: params.p_period_type,
          rangeStart: params.p_range_start, rangeEnd: params.p_range_end,
          status: params.p_status, fetchedAt: params.p_fetched_at, expiresAt: params.p_expires_at,
          items: params.p_items.map((item: Record<string, unknown>) => ({ ...item, rank: Number(item.rank) })),
        };
        return { ok: true, json: async () => ({ saved: true }) };
      }
      return { ok: true, json: async () => upstream("daily") };
    });
    vi.stubGlobal("fetch", fetchMock);
    const response = await GET(new Request("http://localhost/api/box-office?date=2026-09-06&type=daily"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { status: "data", items: [{ salesAmt: "9007199254740993" }] }, meta: { source: "kobis", cachePersisted: true } });
    expect(savedTtlMs).toBe(24 * 60 * 60 * 1000);
    expect(fetchMock.mock.calls.filter(([url]) => url.pathname.includes("kobisopenapi"))).toHaveLength(1);
    const cached = await GET(new Request("http://localhost/api/box-office?date=2026-09-06&type=daily"));
    expect(cached.status).toBe(200);
    expect(await cached.json()).toMatchObject({ meta: { source: "cache", cachePersisted: true } });
    expect(fetchMock.mock.calls.filter(([url]) => url.pathname.includes("kobisopenapi"))).toHaveLength(1);
    const invalid = await GET(new Request("http://localhost/api/box-office?date=2026-09-06&demoScenario=error"));
    expect(invalid.status).toBe(400);
  });
  it("외부 실패·시간 초과·형식 오류를 안전한 코드로 분리한다", async () => {
    vi.stubEnv("DATA_MODE", "live");
    vi.stubEnv("KOBIS_API_KEY", "unit-test-placeholder");
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "unit-test-placeholder");
    const request = new Request("http://localhost/api/box-office?date=2026-09-06");
    for (const [upstreamResponse, status, code] of [
      [{ ok: false }, 502, "KOBIS_UPSTREAM"],
      [new DOMException("test", "TimeoutError"), 504, "KOBIS_TIMEOUT"],
      [{ ok: true, json: async () => ({ faultInfo: {} }) }, 502, "KOBIS_INVALID_RESPONSE"],
    ] as const) {
      vi.stubGlobal("fetch", vi.fn((url: URL) => url.pathname.endsWith("/read_box_office_period")
        ? Promise.resolve({ ok: true, json: async () => null })
        : upstreamResponse instanceof Error ? Promise.reject(upstreamResponse) : Promise.resolve(upstreamResponse)));
      const response = await GET(request);
      expect(response.status).toBe(status);
      expect(await response.json()).toMatchObject({ error: { code } });
    }
  });
  it("저장소 읽기 실패는 KOBIS 호출 없이 503으로 반환한다", async () => {
    vi.stubEnv("DATA_MODE", "live");
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "unit-test-placeholder");
    const fetchMock = vi.fn(async () => ({ ok: false }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await GET(new Request("http://localhost/api/box-office?date=2026-09-06"));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: "DB_READ" } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("저장 실패는 검증된 KOBIS 결과와 경고만 반환한다", async () => {
    vi.stubEnv("DATA_MODE", "live");
    vi.stubEnv("KOBIS_API_KEY", "unit-test-placeholder");
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "unit-test-placeholder");
    vi.stubGlobal("fetch", vi.fn(async (url: URL) => {
      if (url.pathname.endsWith("/read_box_office_period")) return { ok: true, json: async () => null };
      if (url.pathname.endsWith("/save_box_office_period")) return { ok: false };
      return { ok: true, json: async () => upstream("daily") };
    }));
    const response = await GET(new Request("http://localhost/api/box-office?date=2026-09-06"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ meta: {
      source: "kobis", cachePersisted: false, expiresAt: null, warning: "CACHE_WRITE_FAILED",
    } });
  });
  it("정상 빈 응답은 1시간 TTL로 저장하고 다음 요청은 캐시에서 읽는다", async () => {
    vi.stubEnv("DATA_MODE", "live");
    vi.stubEnv("KOBIS_API_KEY", "unit-test-placeholder");
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "unit-test-placeholder");
    let stored: Record<string, unknown> | null = null;
    let savedTtlMs = 0;
    const fetchMock = vi.fn(async (url: URL, init?: RequestInit) => {
      if (url.pathname.endsWith("/read_box_office_period")) return { ok: true, json: async () => stored };
      if (url.pathname.endsWith("/save_box_office_period")) {
        const params = JSON.parse(String(init?.body));
        savedTtlMs = Date.parse(params.p_expires_at) - Date.parse(params.p_fetched_at);
        stored = {
          date: params.p_target_date, type: params.p_period_type,
          rangeStart: params.p_range_start, rangeEnd: params.p_range_end,
          status: params.p_status, fetchedAt: params.p_fetched_at, expiresAt: params.p_expires_at,
          items: [],
        };
        return { ok: true, json: async () => ({ saved: true }) };
      }
      return { ok: true, json: async () => upstream("daily", []) };
    });
    vi.stubGlobal("fetch", fetchMock);
    const request = new Request("http://localhost/api/box-office?date=2026-09-06");
    const first = await GET(request);
    expect((await first.json()).data).toMatchObject({ status: "empty", items: [] });
    expect(savedTtlMs).toBe(60 * 60 * 1000);
    const second = await GET(request);
    expect(await second.json()).toMatchObject({ data: { status: "empty" }, meta: { source: "cache" } });
    expect(fetchMock.mock.calls.filter(([url]) => url.pathname.includes("kobisopenapi"))).toHaveLength(1);
  });
  it("만료된 저장본 뒤 KOBIS가 실패하면 오래된 데이터를 성공으로 반환하지 않는다", async () => {
    vi.stubEnv("DATA_MODE", "live");
    vi.stubEnv("KOBIS_API_KEY", "unit-test-placeholder");
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "unit-test-placeholder");
    vi.stubGlobal("fetch", vi.fn(async (url: URL) => url.pathname.endsWith("/read_box_office_period")
      ? { ok: true, json: async () => ({
        date: "2026-09-06", type: "daily", status: "data", rangeStart: "2026-09-06", rangeEnd: "2026-09-06",
        fetchedAt: "2026-09-06T00:00:00.000Z", expiresAt: "2026-09-07T00:00:00.000Z",
        items: [{ ...kobisMovie, rank: 1 }],
      }) }
      : { ok: false }));
    const response = await GET(new Request("http://localhost/api/box-office?date=2026-09-06"));
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: { code: "KOBIS_UPSTREAM" } });
  });
});

import { getKoreaToday, isCalendarDate, resolveDataMode, type BoxOfficeResult, type PeriodType } from "@/lib/box-office";
import { getRawDemoFixture } from "@/lib/server/demo-fixtures";
import { fetchKobisBoxOffice, KobisError } from "@/lib/server/kobis";
import { normalizeMovies } from "@/lib/server/normalize";

export const runtime = "nodejs";

const headers = { "Cache-Control": "no-store" };
function error(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status, headers });
}

export async function GET(request: Request) {
  let mode;
  try { mode = resolveDataMode(process.env.DATA_MODE); }
  catch { return error("INVALID_DATA_MODE", "데이터 모드 설정을 확인해 주세요.", 503); }

  const params = new URL(request.url).searchParams;
  const date = params.get("date") ?? "";
  const type = params.get("type") ?? "daily";
  const scenario = params.get("demoScenario") ?? "normal";
  if (!isCalendarDate(date) || date > getKoreaToday() || !["daily", "weekly", "weekend"].includes(type) ||
      (mode === "demo" ? !["normal", "slow", "error"].includes(scenario) : params.has("demoScenario"))) {
    return error("INVALID_INPUT", "조회 날짜와 기간, 데모 응답 조건을 확인해 주세요.", 400);
  }

  if (mode === "live") {
    try {
      const boxOffice = await fetchKobisBoxOffice(type as PeriodType, date);
      const now = new Date().toISOString();
      const result: BoxOfficeResult = {
        data: { status: boxOffice.items.length ? "data" : "empty", items: boxOffice.items },
        meta: {
          date, type: type as PeriodType,
          rangeStart: boxOffice.rangeStart, rangeEnd: boxOffice.rangeEnd,
          source: "kobis", fetchedAt: now, expiresAt: null,
          cachePersisted: false, generatedAt: now,
        },
      };
      return Response.json(result, { headers });
    } catch (cause) {
      const code = cause instanceof KobisError ? cause.code : "KOBIS_UPSTREAM";
      if (code === "KOBIS_CONFIG") return error(code, "서버의 KOBIS API 설정을 확인해 주세요.", 503);
      if (code === "KOBIS_TIMEOUT") return error(code, "박스오피스 정보 요청 시간이 초과됐습니다. 다시 시도해 주세요.", 504);
      if (code === "KOBIS_INVALID_RESPONSE") return error(code, "박스오피스 응답을 처리하지 못했습니다. 다시 시도해 주세요.", 502);
      return error(code, "박스오피스 정보를 불러오지 못했습니다. 다시 시도해 주세요.", 502);
    }
  }

  // 화면 상태를 확인하기 위한 고정 지연. 외부 API/DB 호출은 전혀 수행하지 않는다.
  await new Promise((resolve) => setTimeout(resolve, scenario === "slow" ? 2500 : 350));
  if (scenario === "error") {
    return error("DEMO_ERROR", "박스오피스 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.", 502);
  }
  try {
    const fixture = getRawDemoFixture(date, type as PeriodType);
    const items = normalizeMovies(fixture.items);
    const result: BoxOfficeResult = {
      data: { status: items.length ? "data" : "empty", items },
      meta: {
        date, type: type as PeriodType,
        rangeStart: fixture.rangeStart, rangeEnd: fixture.rangeEnd,
        source: "fixture", fetchedAt: null, expiresAt: null,
        cachePersisted: false, generatedAt: new Date().toISOString(),
      },
    };
    return Response.json(result, { headers });
  } catch {
    return error("INVALID_FIXTURE", "박스오피스 데모 데이터를 처리하지 못했습니다.", 500);
  }
}

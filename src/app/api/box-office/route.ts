import { getKoreaToday, isCalendarDate, resolveDataMode, type BoxOfficeResult, type PeriodType } from "@/lib/box-office";
import { getRawDemoFixture } from "@/lib/server/demo-fixtures";
import { normalizeMovies } from "@/lib/server/normalize";

export const runtime = "nodejs";

const headers = { "Cache-Control": "no-store" };
function error(code: string, message: string, status: number) {
  return Response.json({ status: "error", code, message }, { status, headers });
}

export async function GET(request: Request) {
  let mode;
  try { mode = resolveDataMode(process.env.DATA_MODE); }
  catch { return error("INVALID_DATA_MODE", "데이터 모드 설정을 확인해 주세요.", 503); }
  if (mode === "live") {
    return error("LIVE_NOT_IMPLEMENTED", "실제 API 연동은 아직 준비 중입니다. DATA_MODE=demo로 실행해 주세요.", 503);
  }

  const params = new URL(request.url).searchParams;
  const date = params.get("date") ?? "";
  const type = params.get("type") ?? "daily";
  const scenario = params.get("demoScenario") ?? "normal";
  if (!isCalendarDate(date) || date > getKoreaToday() || !["daily", "weekly", "weekend"].includes(type) ||
      !["normal", "slow", "error"].includes(scenario)) {
    return error("INVALID_INPUT", "조회 날짜와 기간, 데모 응답 조건을 확인해 주세요.", 400);
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
      status: items.length ? "data" : "empty", mode: "demo", date, type: type as PeriodType,
      rangeStart: fixture.rangeStart, rangeEnd: fixture.rangeEnd, items,
    };
    return Response.json(result, { headers });
  } catch {
    return error("INVALID_FIXTURE", "박스오피스 데모 데이터를 처리하지 못했습니다.", 500);
  }
}

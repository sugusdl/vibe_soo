import { isCalendarDate, type PeriodType } from "@/lib/box-office";
import { fetchKobisBoxOffice, parseKobisResponse } from "@/lib/server/kobis";
import { readOriginalSnapshot } from "@/lib/server/original-snapshot";
import { matchesStored, readBoxOfficePeriod } from "@/lib/server/supabase";

function input(): { date: string; period: PeriodType } | null {
  const args = process.argv.slice(2);
  if (args.length !== 2) return null;
  const date = args.find((arg) => arg.startsWith("--date="))?.slice(7);
  const period = args.find((arg) => arg.startsWith("--period="))?.slice(9);
  if (!date || !isCalendarDate(date) ||
      (period !== "daily" && period !== "weekly" && period !== "weekend")) return null;
  return { date, period };
}

async function main(): Promise<number> {
  const requested = input();
  if (!requested) {
    process.stderr.write("사용법: npm run verify:data -- --date=YYYY-MM-DD --period=daily|weekly|weekend\n");
    return 1;
  }

  let stored;
  try { stored = await readBoxOfficePeriod(requested.period, requested.date); }
  catch {
    process.stderr.write("저장소를 읽거나 응답을 검증하지 못했습니다. 설정과 DB 함수를 확인해 주세요.\n");
    return 1;
  }
  if (!stored) {
    process.stdout.write("저장된 데이터가 아직 없습니다.\n");
    return 2;
  }

  const original = await readOriginalSnapshot(requested.period, requested.date);
  let originalSame = false;
  if (original) {
    try {
      const parsed = parseKobisResponse(original, requested.period, requested.date);
      originalSame = matchesStored({
        status: parsed.items.length ? "data" : "empty",
        rangeStart: parsed.rangeStart, rangeEnd: parsed.rangeEnd, items: parsed.items,
      }, stored);
    } catch { originalSame = false; }
  }
  process.stdout.write(`저장 당시 원본 대조: ${original ? originalSame ? "일치" : "불일치" : "비교 불가 (로컬 원본 없음)"}\n`);

  let currentSame = false;
  let currentAvailable = false;
  try {
    // 읽기 전용: DB 수정 함수는 호출하지 않는다. KOBIS만 한 번 새로 조회한다.
    const current = await fetchKobisBoxOffice(requested.period, requested.date);
    currentAvailable = true;
    currentSame = matchesStored({
      status: current.items.length ? "data" : "empty",
      rangeStart: current.rangeStart, rangeEnd: current.rangeEnd, items: current.items,
    }, stored);
  } catch { currentAvailable = false; }
  process.stdout.write(`KOBIS 새 조회 대조: ${currentAvailable ? currentSame ? "일치" : "불일치" : "비교 불가 (호출 실패)"}\n`);
  process.stdout.write("DB 작업: 읽기만 수행\n");
  return originalSame && currentSame ? 0 : 1;
}

main().then((code) => { process.exitCode = code; }).catch(() => {
  process.stderr.write("검증을 완료하지 못했습니다.\n");
  process.exitCode = 1;
});

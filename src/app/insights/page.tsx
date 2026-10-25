import Link from "next/link";
import { InsightsDashboard } from "@/components/insights-dashboard";
import { getKoreaToday, resolveDataMode, type DataMode } from "@/lib/box-office";

export const dynamic = "force-dynamic";

export default function InsightsPage() {
  let mode: DataMode | "invalid";
  try { mode = resolveDataMode(process.env.DATA_MODE); } catch { mode = "invalid"; }
  return <main className="container">
    <p className="eyebrow">숫자로 보는 흥행 동향</p>
    <h1>박스오피스 인사이트</h1>
    <p className="description">날짜별 관측 매출과 영화별 성과를 살펴보세요.</p>
    <InsightsDashboard mode={mode} today={getKoreaToday()} />
    <Link href="/" className="text-link">박스오피스 목록으로 돌아가기</Link>
  </main>;
}

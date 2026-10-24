import Link from "next/link";
import { BoxOfficeList } from "@/components/box-office-list";
import { getKoreaToday, resolveDataMode, type DataMode } from "@/lib/box-office";

export const dynamic = "force-dynamic";

export default function Home() {
  let mode: DataMode | "invalid";
  try { mode = resolveDataMode(process.env.DATA_MODE); } catch { mode = "invalid"; }
  return (
    <main className="container">
      <p className="eyebrow">영화의 흐름을 한눈에</p>
      <h1>박스오피스 목록</h1>
      <p className="description">날짜와 기간을 골라 영화 순위와 매출·관객수를 살펴보세요.</p>
      <BoxOfficeList mode={mode} today={getKoreaToday()} />
      <section className="feature-grid" aria-label="서비스 안내">
        <article className="feature-card">
          <p className="card-label">BOX OFFICE</p>
          <h2>날짜별 박스오피스</h2>
          <p>일간·주간·주말을 전환하고 현재 조회 목록에서 영화명을 검색할 수 있습니다.</p>
        </article>
        <article className="feature-card">
          <p className="card-label">TRENDS</p>
          <h2>흥행 추이 살펴보기</h2>
          <p>최근 7·14·30일의 매출·관객 추이와 영화 Top 5·10을 제공할 예정입니다.</p>
          <Link href="/insights" className="text-link">인사이트 화면 보기 <span aria-hidden="true">→</span></Link>
        </article>
      </section>
    </main>
  );
}

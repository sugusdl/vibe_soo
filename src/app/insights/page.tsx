import Link from "next/link";
import { SetupNotice } from "@/components/setup-notice";

export default function InsightsPage() {
  return (
    <main className="container">
      <p className="eyebrow">숫자로 보는 흥행 동향</p>
      <h1>박스오피스 인사이트</h1>
      <p className="description">매출·관객 추이와 영화별 성과를 비교할 공간입니다.</p>
      <SetupNotice />
      <Link href="/" className="text-link">박스오피스 목록으로 돌아가기 <span aria-hidden="true">→</span></Link>
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "박스오피스 인사이트",
  description: "영화 박스오피스 순위와 흥행 추이를 살펴보는 대시보드",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <header className="site-header">
          <div className="header-inner">
            <Link href="/" className="brand">BOX OFFICE <span>INSIGHTS</span></Link>
            <nav aria-label="주요 메뉴">
              <Link href="/">박스오피스 목록</Link>
              <Link href="/insights">인사이트</Link>
            </nav>
          </div>
        </header>
        {children}
        <footer className="site-footer">데이터 출처: KOBIS · 영화진흥위원회</footer>
      </body>
    </html>
  );
}

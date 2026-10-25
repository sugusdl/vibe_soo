import { expect, test } from "@playwright/test";

test("AC 3·8: 목록 열과 Top 10의 실제 영화 개수를 확인한다", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("table")).toBeVisible();
  for (const header of ["순위", "영화명", "개봉일", "매출(원)", "관객수(명)", "누적 관객수(명)"]) {
    await expect(page.getByRole("columnheader", { name: header, exact: true })).toBeVisible();
  }
  await page.goto("/insights");
  await page.getByLabel("영화 순위").selectOption("10");
  await expect(page.getByLabel("날짜별 조회 진행률")).toContainText("7/7일 완료");
  await expect(page.locator(".top-bars li")).toHaveCount(5);
  await expect(page.locator(".top-bars li").first()).toContainText("바다의 편지");
  await expect(page.locator(".top-bars li").first()).toContainText("12.1억원");
});

test("AC 11·14: 전체 빈 기간과 미래 날짜를 구분한다", async ({ page }) => {
  await page.goto("/insights");
  await page.getByLabel("종료일").fill("2026-09-06");
  await expect(page.getByLabel("날짜별 조회 진행률")).toContainText("빈 날짜 7일");
  await expect(page.getByText("선택한 분석 기간의 데이터가 없습니다.").first()).toBeVisible();
  await expect(page.getByLabel("보조 수치")).toContainText("—");
  await page.getByLabel("종료일").fill("2099-01-01");
  await expect(page.getByText("오늘까지의 유효한 종료일을 선택해 주세요.")).toBeVisible();
});

test("AC 6: F1 주간 선택과 검색어가 F2의 일간 집계를 바꾸지 않는다", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "주간", exact: true }).click();
  await page.getByRole("searchbox").fill("없는제목");
  await page.getByRole("link", { name: "이 날짜로 인사이트 보기" }).click();
  await expect(page.getByLabel("날짜별 조회 진행률")).toContainText("정상 7일 · 빈 날짜 0일");
  await expect(page.getByLabel("보조 수치")).toContainText("374.2천명");
});

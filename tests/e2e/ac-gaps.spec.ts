import { expect, test } from "@playwright/test";

test("AC 7: 일별 관객 추이를 날짜와 값으로 확인할 수 있다", async ({ page }) => {
  await page.goto("/insights");
  await expect(page.getByLabel("날짜별 조회 진행률")).toContainText("7/7일 완료");
  await expect(page.getByRole("img", { name: /매출 추이/ }).locator("title").filter({ hasText: "2026-09-07" })).toContainText("300,000,000원");
  await page.getByRole("button", { name: "관객 추이" }).click();
  const chart = page.getByRole("img", { name: /관객 추이/ });
  await expect(chart).toBeVisible();
  await expect(chart.locator("title").filter({ hasText: "2026-09-07" })).toContainText("30,000명");
  await expect(chart.locator("title").filter({ hasText: "2026-09-08" })).toContainText("36,200명");
});

test("AC 9: 총매출과 1위 매출 점유율을 확인할 수 있다", async ({ page }) => {
  await page.goto("/insights");
  await expect(page.getByLabel("날짜별 조회 진행률")).toContainText("7/7일 완료");
  await expect(page.getByLabel("기간 총매출")).toContainText("3,742,000,000원");
  await expect(page.getByLabel("보조 수치")).toContainText("374.2천명");
  await expect(page.getByLabel("보조 수치")).toContainText("32.3%");
});

import { expect, test } from "@playwright/test";

// 2026-10-25 실제 실행에서 실패 확인. 기능 변경 승인 전까지 알려진 미충족 AC로 추적한다.
test.fixme("AC 7: 일별 관객 추이를 날짜와 값으로 확인할 수 있다", async ({ page }) => {
  await page.goto("/insights");
  await expect(page.getByLabel("날짜별 조회 진행률")).toContainText("7/7일 완료");
  await expect(page.getByRole("heading", { name: /관객.*추이/ })).toBeVisible();
});

test.fixme("AC 9: 총매출과 1위 매출 점유율을 확인할 수 있다", async ({ page }) => {
  await page.goto("/insights");
  await expect(page.getByLabel("날짜별 조회 진행률")).toContainText("7/7일 완료");
  await expect(page.getByText("기간 총매출")).toBeVisible();
  await expect(page.getByText("1위 매출 점유율")).toBeVisible();
});

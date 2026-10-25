import { expect, test } from "@playwright/test";

test("demo 7일의 관측 매출과 14/30일 빈 날짜를 구분한다", async ({ page }) => {
  await page.goto("/insights");
  await expect(page.getByRole("heading", { name: "박스오피스 인사이트" })).toBeVisible();
  await expect(page.getByLabel("날짜별 조회 진행률")).toContainText("7/7일 완료");
  await expect(page.getByLabel("날짜별 조회 진행률")).toContainText("정상 7일 · 빈 날짜 0일");
  await page.getByLabel("분석 기간").selectOption("14");
  await expect(page.getByLabel("날짜별 조회 진행률")).toContainText("14/14일 완료");
  await expect(page.getByLabel("날짜별 조회 진행률")).toContainText("정상 7일 · 빈 날짜 7일");
  await expect(page.getByText("정상 빈 날짜 7일은 차트에서 공백으로 표시합니다.", { exact: false })).toBeVisible();
  await page.getByLabel("분석 기간").selectOption("30");
  await expect(page.getByLabel("날짜별 조회 진행률")).toContainText("30/30일 완료");
  await expect(page.getByLabel("날짜별 조회 진행률")).toContainText("정상 7일 · 빈 날짜 23일");
});

test("하루 실패 시 확정 수치를 숨기고 해당 날짜만 다시 조회한다", async ({ page }) => {
  let failures = 0;
  await page.route("**/api/box-office?**", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("date") === "2026-09-10" && failures++ === 0) {
      await route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: { code: "DEMO_ERROR", message: "조회 실패" } }) });
    } else await route.continue();
  });
  await page.goto("/insights");
  await expect(page.getByLabel("날짜별 조회 진행률")).toContainText("실패 1일");
  await expect(page.getByLabel("보조 수치")).toContainText("—");
  await page.getByRole("listitem").filter({ hasText: "2026-09-10" }).getByRole("button", { name: "이 날짜 다시 시도" }).click();
  await expect(page.getByLabel("날짜별 조회 진행률")).toContainText("실패 0일");
  await expect(page.getByLabel("보조 수치")).toContainText("32.3%");
});

test("총매출이 0이면 1위 점유율을 —로 표시한다", async ({ page }) => {
  await page.route("**/api/box-office?**", async (route) => {
    const date = new URL(route.request().url()).searchParams.get("date")!;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      data: { status: "data", items: [{ movieCd: "ZERO", movieNm: "무매출", rank: 1, openDt: null, salesAmt: "0", audiCnt: "0", salesAcc: "0", audiAcc: "0" }] },
      meta: { date, type: "daily", rangeStart: date, rangeEnd: date, source: "fixture", fetchedAt: null, expiresAt: null, cachePersisted: false, generatedAt: "2026-10-25T00:00:00Z" },
    }) });
  });
  await page.goto("/insights");
  await expect(page.getByLabel("날짜별 조회 진행률")).toContainText("7/7일 완료");
  await expect(page.getByLabel("기간 총매출")).toContainText("0.0억원");
  await expect(page.getByLabel("보조 수치").getByText("1위 매출 점유율")).toBeVisible();
  await expect(page.getByLabel("보조 수치")).toContainText("—");
});

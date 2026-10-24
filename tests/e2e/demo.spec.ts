import { expect, test } from "@playwright/test";

test("데모 목록: 날짜·기간·검색과 원래 순위를 유지한다", async ({ page }) => {
  const externalRequests: string[] = [];
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://127.0.0.1:3100") {
      externalRequests.push(url.origin);
      return route.abort();
    }
    return route.continue();
  });
  await page.goto("/");
  await expect(page.getByTestId("list-state")).toHaveAttribute("data-state", "success");
  await expect(page.getByRole("row", { name: /바다의 편지/ })).toContainText("250,000,000");
  await page.getByRole("searchbox").fill(" 바다 ");
  await expect(page.getByRole("rowgroup").last().getByRole("row")).toHaveCount(1);
  await expect(page.getByRole("row", { name: /바다의 편지/ }).getByRole("cell").first()).toHaveText("2");
  await page.getByRole("searchbox").fill("없는제목");
  await expect(page.getByTestId("list-state")).toHaveAttribute("data-state", "search-empty");
  await expect(page.getByRole("table")).toHaveCount(0);
  await page.getByRole("button", { name: "검색 초기화" }).click();
  await expect(page.getByRole("rowgroup").last().getByRole("row")).toHaveCount(5);
  await page.getByRole("button", { name: "주간", exact: true }).click();
  await expect(page.getByTestId("list-state")).toContainText("2026-09-07 ~ 2026-09-13");
  await expect(page.getByRole("row", { name: /바다의 편지/ })).toContainText("1,210,000,000");
  await page.getByRole("button", { name: "주말", exact: true }).click();
  await expect(page.getByTestId("list-state")).toContainText("2026-09-11 ~ 2026-09-13");
  await expect(page.getByRole("row", { name: /바다의 편지/ })).toContainText("750,000,000");
  await page.getByRole("button", { name: "일간", exact: true }).click();
  await page.getByLabel("조회 날짜").fill("2026-09-07");
  await expect(page.getByRole("row", { name: /바다의 편지/ })).toContainText("100,000,000");
  await page.getByRole("searchbox").fill("없는제목");
  await page.getByLabel("조회 날짜").fill("2026-09-06");
  await expect(page.getByTestId("list-state")).toHaveAttribute("data-state", "empty");
  await expect(page.getByRole("heading", { name: "선택한 기간의 박스오피스 데이터가 없습니다." })).toBeVisible();
  expect(externalRequests).toEqual([]);
});

test("로딩·오류·재시도·복구 및 이전 응답 폐기를 확인한다", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("list-state")).toHaveAttribute("data-state", "success");
  await page.getByLabel("데모 응답").selectOption("slow");
  await expect(page.getByTestId("list-state")).toHaveAttribute("data-state", "loading");
  await expect(page.getByRole("table")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "박스오피스 정보를 불러오는 중입니다." })).toBeVisible();
  await expect(page.getByTestId("list-state")).toHaveAttribute("data-state", "success");
  await page.getByLabel("데모 응답").selectOption("error");
  await expect(page.getByTestId("list-state")).toHaveAttribute("data-state", "error");
  await expect(page.getByTestId("list-state").getByRole("alert")).toContainText("데이터를 불러오지 못했습니다");
  await page.getByRole("button", { name: "다시 시도" }).click();
  await expect(page.getByTestId("list-state")).toHaveAttribute("data-state", "loading");
  await expect(page.getByTestId("list-state")).toHaveAttribute("data-state", "error");
  await page.getByLabel("데모 응답").selectOption("normal");
  await expect(page.getByTestId("list-state")).toHaveAttribute("data-state", "success");
  await page.getByLabel("데모 응답").selectOption("slow");
  await page.getByLabel("조회 날짜").fill("2026-09-06");
  await page.getByLabel("데모 응답").selectOption("normal");
  await expect(page.getByTestId("list-state")).toHaveAttribute("data-state", "empty");
  // 중단된 느린 응답이 나중에 성공 화면을 복원하면 안 된다.
  await page.waitForTimeout(2700);
  await expect(page.getByTestId("list-state")).toHaveAttribute("data-state", "empty");
});

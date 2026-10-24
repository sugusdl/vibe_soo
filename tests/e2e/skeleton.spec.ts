import { expect, test } from "@playwright/test";

test("목록과 인사이트 사이를 이동할 수 있다", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("박스오피스 인사이트");
  await expect(page.locator("html")).toHaveAttribute("lang", "ko");
  await expect(page.getByRole("heading", { name: "박스오피스 목록", level: 1 })).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  await page.getByRole("navigation").getByRole("link", { name: "인사이트", exact: true }).click();
  await expect(page).toHaveURL(/\/insights$/);
  await expect(page.getByRole("heading", { name: "박스오피스 인사이트", level: 1 })).toBeVisible();
  await page.getByRole("link", { name: /박스오피스 목록으로 돌아가기/ }).click();
  await expect(page).toHaveURL("/");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("생존 확인 API는 비밀값 없이 응답한다", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(await response.json()).toEqual({ status: "ok", service: "box-office" });
});

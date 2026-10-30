import { expect, test } from "@playwright/test";

test.describe("Phase 6 homepage interactions", () => {
  test("search filters registry-backed tool cards and exposes an empty state", async ({ page }) => {
    await page.goto("/");
    const cards = page.locator("[data-tool-card]");
    await expect(cards).toHaveCount(9);
    await page.locator("#toolSearch").fill("rotate");
    await expect(page.locator('[data-tool-card]:visible')).toHaveCount(1);
    await expect(page.locator('[data-tool-card]:visible h3')).toHaveText("Rotate PDF");
    await page.locator("#toolSearch").fill("does-not-exist");
    await expect(page.locator('[data-tool-card]:visible')).toHaveCount(0);
    await expect(page.locator("#emptyTools")).toBeVisible();
  });

  test("shared navigation reaches the tools section and keeps tool routes crawlable", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("header")).toBeVisible();
    await expect(page.locator('header a[href="/#tools"]')).toHaveCount(1);
    await page.locator('header a[href="/#tools"]').click();
    await expect(page.locator("#tools")).toBeVisible();
    await page.goto("/tools/split-pdf/");
    await expect(page.locator("h1")).toHaveText("Split PDF");
    await expect(page.locator('a[href="/#tools"]')).toHaveCount(3);
    await page.goto("/about/");
    await expect(page.locator("h1")).toHaveText(/Simple tools\.\s*Less friction\./);
    await expect(page.locator('a[href="/about/"]')).toHaveCount(1);
  });
});

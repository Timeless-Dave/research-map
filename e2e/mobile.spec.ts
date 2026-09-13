import { expect, test } from "@playwright/test";

test.describe("mobile layout", () => {
  test.skip(({ isMobile }) => !isMobile, "phone-sheet behavior only");

  test("the map is visible on first load, not buried by the panel", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Loading campus map…")).toBeHidden({ timeout: 30_000 });

    const canvas = page.locator(".campus-map-container canvas").first();
    const panel = page.getByRole("complementary", { name: /campus places/i });

    const canvasBox = await canvas.boundingBox();
    const panelBox = await panel.boundingBox();
    expect(canvasBox).not.toBeNull();
    expect(panelBox).not.toBeNull();

    // The regression: the sheet used to be 100vw x full height, leaving no map.
    const visibleMapHeight = panelBox!.y - canvasBox!.y;
    expect(visibleMapHeight).toBeGreaterThan(120);
  });

  test("the sheet handle cycles through its detents", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Loading campus map…")).toBeHidden({ timeout: 30_000 });

    const panel = page.getByRole("complementary", { name: /campus places/i });
    const handle = page.getByRole("button", { name: /places panel/i });

    const half = (await panel.boundingBox())!.height;
    await handle.click();
    await expect(handle).toHaveAttribute('aria-label', 'Collapse places panel');
    await expect.poll(async () => (await panel.boundingBox())!.height).toBeGreaterThan(half + 100);

    await handle.click();
    await expect(handle).toHaveAttribute('aria-label', 'Expand places panel');
    await expect.poll(async () => (await panel.boundingBox())!.height).toBeLessThan(half);
  });

  test("map controls meet the minimum touch target size", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Loading campus map…")).toBeHidden({ timeout: 30_000 });

    const zoomIn = page.getByRole("button", { name: "Zoom in" });
    const box = await zoomIn.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });
});

import { expect, test, type Page } from "@playwright/test";

const MAP_CANVAS = ".campus-map-container canvas";

async function waitForMapReady(page: Page) {
  // The status overlay covers the canvas until the style has loaded.
  await expect(page.getByText("Loading campus map…")).toBeHidden({ timeout: 30_000 });
  await expect(page.locator(MAP_CANVAS).first()).toBeVisible();
}

test.describe("campus map", () => {
  test("renders a WebGL canvas and clears the loading state", async ({ page }) => {
    await page.goto("/");
    await waitForMapReady(page);

    const hasContext = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>(".campus-map-container canvas");
      return Boolean(canvas && canvas.getContext("webgl2"));
    });
    expect(hasContext).toBe(true);
  });

  test("shows an actionable failure state when WebGL2 is unavailable", async ({ page }) => {
    // Simulate an old device: the map must explain itself rather than render blank.
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (type === "webgl2" || type === "webgl") return null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (original as any).call(this, type, ...rest);
      } as typeof original;
    });

    await page.goto("/");
    // Scoped: Next renders its own role="alert" route announcer.
    await expect(
      page.getByRole("alert").filter({ hasText: /campus map/i })
    ).toContainText(/can't display the campus map/i);
  });

  test("map does not rotate or tilt", async ({ page }) => {
    await page.goto("/");
    await waitForMapReady(page);

    const box = await page.locator(MAP_CANVAS).first().boundingBox();
    expect(box).not.toBeNull();
    // A right-drag is the default MapLibre rotate gesture.
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(box!.x + box!.width / 2 + 160, box!.y + box!.height / 2 + 90, { steps: 12 });
    await page.mouse.up({ button: "right" });

    // Nothing should have tilted or spun the north-up campus view. Camera
    // values are exposed as read-only diagnostics on the host after moveend.
    const host = page.getByTestId("map-host");
    await expect(host).toHaveAttribute("data-map-bearing", "0.00");
    await expect(host).toHaveAttribute("data-map-pitch", "0.00");
  });
});

test.describe("deep links", () => {
  test("a valid building deep link opens that place", async ({ page }) => {
    await page.goto("/?building=stem-building");
    await waitForMapReady(page);
    // Scoped to the panel: the header's "Selected:" chip is desktop-only.
    const panel = page.getByRole("complementary", { name: /campus places/i });
    await expect(panel.getByText("STEM Building").first()).toBeVisible();
  });

  test("an unknown building id does not open a blank place card", async ({ page }) => {
    await page.goto("/?building=does-not-exist");
    await waitForMapReady(page);
    await expect(page.getByText("does-not-exist")).toHaveCount(0);
  });

  test("browser back returns to the previous selection", async ({ page }) => {
    await page.goto("/");
    await waitForMapReady(page);
    await page.goto("/?building=stem-building");
    await waitForMapReady(page);
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe("place catalog", () => {
  test("secondary places are findable by name in search", async ({ page }) => {
    await page.goto("/");
    await waitForMapReady(page);

    // Alumni House has map geometry but no API record — it used to be a pin
    // that could never be found in the list.
    await page.getByRole("checkbox", { name: /all campus buildings/i }).check();
    const search = page.getByPlaceholder(/search/i).first();
    await search.fill("Alumni");
    await expect(page.getByText("Alumni House").first()).toBeVisible();
  });
});

test.describe("navigation anchors", () => {
  test("accessible-entrance routing is not offered without a confirmed entrance", async ({ page }) => {
    await page.goto("/");
    await waitForMapReady(page);

    const panel = page.getByRole("complementary", { name: /campus places/i });
    await panel.getByRole("button", { name: /directions/i }).first().click();

    // No place currently has a verified accessible entrance, so the option must
    // be absent everywhere — not present-but-guessing.
    await expect(page.getByRole("button", { name: "Accessible entrance" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Walk" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Drive" })).toBeVisible();
  });
});

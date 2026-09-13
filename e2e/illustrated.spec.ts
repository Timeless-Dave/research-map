import { expect, test, type Page } from '@playwright/test';

async function ready(page: Page, query = '?view=illustrated') {
  await page.goto(`/${query}`);
  test.skip(process.env.NEXT_PUBLIC_ILLUSTRATED_MAP !== 'true', 'Build and test with NEXT_PUBLIC_ILLUSTRATED_MAP=true');
  await expect(page.getByRole('button', { name: 'Illustrated', exact: true })).toBeVisible();
  await expect(page.getByTestId('map-host')).toHaveAttribute('data-models', 'ready', { timeout: 45000 });
  await expect(page.getByTestId('map-host')).toHaveAttribute('data-map-pitch', '35.00');
  // A canvas alone used to pass while the MapLibre 6 worker never loaded.
  await expect.poll(async () => Number(await page.getByTestId('map-host').getAttribute('data-map-features')), { timeout: 30000 }).toBeGreaterThan(0);
}

test('single canvas, URL view switching, selection and browser history', async ({ page }) => {
  let loads = 0;
  page.on('request', r => { if (new URL(r.url()).pathname === '/illustrated/campus.glb') loads++; });
  await ready(page);
  await page.getByPlaceholder('Search buildings…').fill('STEM');
  await page.locator('button[data-id="stem-building"]').click();
  await expect(page).toHaveURL(/building=stem-building/);
  await expect(page.locator('canvas.maplibregl-canvas')).toHaveCount(1);
  expect(loads).toBe(1);
  for (const view of ['Satellite', 'Flat', 'Illustrated']) {
    await page.getByRole('button', { name: view, exact: true }).click();
    await expect(page.getByTestId('map-host')).toHaveAttribute('data-map-view', view.toLowerCase());
    await expect(page).toHaveURL(/building=stem-building/);
    await expect.poll(() => new URL(page.url()).searchParams.get('view')).toBe(view.toLowerCase());
  }
  await expect(page.getByTestId('map-host')).toHaveAttribute('data-models', 'ready');
  await page.goto('/?view=flat&building=woodward-hall');
  await page.goBack();
  await expect(page.getByTestId('map-host')).toHaveAttribute('data-map-view', 'illustrated');
  await page.goForward();
  await expect(page.getByTestId('map-host')).toHaveAttribute('data-map-view', 'flat');
});

test('failed GLB falls back without losing search or selection', async ({ page }) => {
  await page.route('**/illustrated/campus.glb', route => route.abort());
  await page.goto('/?view=illustrated&building=stem-building');
  test.skip(process.env.NEXT_PUBLIC_ILLUSTRATED_MAP !== 'true', 'Feature flag disabled');
  await expect(page.getByText('Illustrated view unavailable. Showing the flat map.')).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('map-host')).toHaveAttribute('data-map-view', 'flat');
  await expect(page).toHaveURL(/building=stem-building/);
  await expect(page.getByPlaceholder('Search buildings…')).toBeEnabled();
});

test('an elevated model surface is clickable, not just its pin', async ({ page }) => {
  await ready(page, '?view=illustrated&building=stem-building');
  const host = page.getByTestId('map-host');
  await expect(host).toHaveAttribute('data-map-zoom', '18.00');
  const [x,y] = JSON.parse((await host.getAttribute('data-selected-screen'))!);
  const box = (await host.boundingBox())!;
  await page.mouse.click(box.x+x-35, box.y+y-5);
  await expect(host).toHaveAttribute('data-last-model-selection', 'stem-building');
});

test('zoom limits and locked illustrated camera', async ({ page }) => {
  await ready(page);
  const host = page.getByTestId('map-host');
  for (let i=0;i<9;i++) { await page.getByRole('button', { name: 'Zoom in', exact: true }).click(); await page.waitForTimeout(300); }
  await expect(host).toHaveAttribute('data-map-zoom', '20.00');
  await expect(host).toHaveAttribute('data-model-detail', 'ready');
  for (let i=0;i<12;i++) { await page.getByRole('button', { name: 'Zoom out', exact: true }).click(); await page.waitForTimeout(300); }
  await expect(host).toHaveAttribute('data-map-zoom', '12.00');
  await expect(host).toHaveAttribute('data-model-detail-visible', 'false');
  await expect(host).toHaveAttribute('data-map-pitch', '35.00');
  await expect(host).toHaveAttribute('data-map-bearing', '0.00');
});

test('detail download failure preserves base models and selection', async ({ page }) => {
  await page.route('**/illustrated/detail.glb', route => route.abort());
  await ready(page, '?view=illustrated&building=stem-building');
  await expect(page.getByText(/Facade details unavailable/)).toBeVisible();
  await expect(page.getByTestId('map-host')).toHaveAttribute('data-models', 'ready');
  await expect(page.getByTestId('map-host')).toHaveAttribute('data-map-view', 'illustrated');
  await expect(page).toHaveURL(/building=stem-building/);
  await page.getByRole('button', { name: 'Satellite', exact: true }).click();
  await expect(page.getByText(/Facade details unavailable/)).toHaveCount(0);
});

test('graphics context interruption is reported with recovery controls', async ({ page }) => {
  await ready(page);
  // Event-path regression, not a claim of physical GPU recovery verification.
  await page.locator('canvas.maplibregl-canvas').dispatchEvent('webglcontextlost');
  await expect(page.getByText('Map graphics were interrupted')).toBeVisible();
  await expect(page.getByPlaceholder('Search buildings…')).toBeEnabled();
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByTestId('map-host')).toHaveAttribute('data-models', 'ready', { timeout: 30000 });
  await expect(page.getByText('Map graphics were interrupted')).toHaveCount(0);
});

test('flat view does not fetch illustrated assets', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', r => { if (new URL(r.url()).pathname.startsWith('/illustrated/')) requests.push(r.url()); });
  await page.goto('/?view=flat');
  await expect.poll(async () => Number(await page.getByTestId('map-host').getAttribute('data-map-features')), { timeout: 30000 }).toBeGreaterThan(0);
  expect(requests).toEqual([]);
});

test('route stays visible through all three views', async ({ page }) => {
  await page.route('https://api.mapbox.com/directions/**', route => route.fulfill({ json: { code: 'Ok', routes: [{ distance: 140, duration: 120, geometry: { type: 'LineString', coordinates: [[-92.024,34.244],[-92.0237,34.2444],[-92.023,34.2444]] }, legs: [{ steps: [{ distance: 140, maneuver: { instruction: 'Test walking segment', location: [-92.024,34.244] } }] }] }] } }));
  await ready(page);
  await page.getByRole('tab', { name: 'Directions', exact: true }).click();
  await page.getByRole('combobox').nth(0).selectOption('stem-building');
  await page.getByRole('combobox').nth(1).selectOption('woodward-hall');
  await page.getByRole('button', { name: 'Get Directions', exact: true }).click();
  for (const view of ['Illustrated', 'Satellite', 'Flat']) {
    await page.getByRole('button', { name: view, exact: true }).click();
    await expect.poll(async () => Number(await page.getByTestId('map-host').getAttribute('data-route-features')), { timeout: 15000 }).toBeGreaterThan(0);
  }
});

test('phone navigation remains reachable at every sheet detent', async ({ page, isMobile }) => {
  test.skip(!isMobile);
  await ready(page);
  const handle = page.getByRole('button', { name: /places panel/i });
  await handle.click(); // full
  await handle.click(); // collapsed
  await expect(page.getByRole('tab', { name: 'Locations', exact: true })).toBeVisible();
  await expect(page.getByPlaceholder('Search buildings…')).toBeVisible();
  await page.getByRole('tab', { name: 'Directions', exact: true }).click();
  await expect(page.getByRole('combobox').first()).toBeVisible();
  await page.waitForTimeout(800);
  await expect(page.getByTestId('map-host')).toHaveAttribute('data-map-pitch', '35.00');
  await page.getByRole('tab', { name: 'Locations', exact: true }).click();
  await expect(page.locator('button[data-id="stem-building"]')).toBeAttached();
});

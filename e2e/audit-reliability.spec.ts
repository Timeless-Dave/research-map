import { expect, test } from '@playwright/test';

test('campus tabs support arrow keys and expose the active panel', async ({ page }) => {
  await page.goto('/');
  const locations = page.getByRole('tab', { name: 'Locations', exact: true });
  await locations.focus();
  await locations.press('ArrowRight');
  const directions = page.getByRole('tab', { name: 'Directions', exact: true });
  await expect(directions).toBeFocused();
  await expect(directions).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'campus-tab-directions');
  await directions.press('Home');
  await expect(locations).toBeFocused();
  await expect(locations).toHaveAttribute('tabindex', '0');
  await expect(directions).toHaveAttribute('tabindex', '-1');
});

test('directory can retry a failed request without reloading', async ({ page }) => {
  let attempts = 0;
  let recovered = false;
  await page.route('**/api/researchers', route => {
    attempts++;
    return route.fulfill(!recovered ? { status: 503, json: {} } : { json: { researchers: [] } });
  });
  await page.goto('/directory');
  await expect(page.getByRole('button', { name: 'Retry directory' })).toBeVisible();
  const beforeRetry = attempts;
  recovered = true;
  await page.getByRole('button', { name: 'Retry directory' }).click();
  await expect(page.getByText('Could not load the directory. Please try again.')).toHaveCount(0);
  expect(attempts).toBeGreaterThan(beforeRetry);
});

test('profile dialog contains keyboard focus and restores it on Escape', async ({ page }) => {
  await page.route('**/api/researchers', route => route.fulfill({ json: { researchers: [{ id: 'audit-person', name: 'Audit Person', email: 'audit@example.invalid', specializations: [], publications: [], awards: [] }] } }));
  await page.goto('/directory');
  const opener = page.getByRole('button', { name: /Audit Person/ });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Profile for Audit Person' });
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('drive/walk handoff reports independently snapped parking transition', async ({ page }) => {
  await page.route('https://api.mapbox.com/directions/**', route => {
    const driving = route.request().url().includes('/driving/');
    const coordinates = driving ? [[-92.024, 34.244], [-92.0237, 34.2444]] : [[-92.023, 34.245], [-92.0228, 34.2452]];
    return route.fulfill({ json: { code: 'Ok', routes: [{ distance: 100, duration: 80, geometry: { type: 'LineString', coordinates }, legs: [{ steps: [] }] }] } });
  });
  await page.goto('/');
  await page.getByRole('tab', { name: 'Directions', exact: true }).click();
  await page.getByRole('combobox').nth(0).selectOption('woodward-hall');
  // Its parking anchor is 109m away, above the 40m handoff threshold.
  await page.getByRole('combobox').nth(1).selectOption('alumni-house');
  await page.getByRole('button', { name: 'Drive', exact: true }).click();
  await page.getByRole('button', { name: 'Get Directions', exact: true }).click();
  await expect(page.getByText(/Parking transition unverified/)).toBeVisible();
  await expect.poll(async () => Number(await page.getByTestId('map-host').getAttribute('data-route-features')), { timeout: 20000 }).toBeGreaterThan(0);
});

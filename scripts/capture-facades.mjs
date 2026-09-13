import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

await mkdir('artifacts/illustrated/facades', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  for (const id of ['stem-building', 'woodward-hall', 'human-sciences-building', 'larrison-hall']) {
    await page.goto(`${process.env.PREVIEW_URL || 'http://127.0.0.1:3000'}/?view=illustrated&building=${id}`);
    await page.waitForSelector('[data-models="ready"][data-map-zoom="18.00"]', { timeout: 45000 });
    await page.waitForSelector('[data-model-detail="ready"]', { timeout: 20000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `artifacts/illustrated/facades/${id}.png` });
  }
} finally {
  await browser.close();
}

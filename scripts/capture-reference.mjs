import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
await mkdir('artifacts/reference', { recursive: true });
const browser = await chromium.launch({ headless: true });
for (const [name, viewport] of Object.entries({ desktop: { width: 1440, height: 1000 }, phone: { width: 390, height: 844 } })) {
  const page = await browser.newPage({ viewport });
  await page.goto('https://map.baylor.edu/?id=2087', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(12000);
  await page.screenshot({ path: `artifacts/reference/baylor-${name}.png` });
  await page.close();
}
await browser.close();

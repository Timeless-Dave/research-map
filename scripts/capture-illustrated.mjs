import { chromium, webkit } from '@playwright/test';
import { mkdir, writeFile, rename } from 'node:fs/promises';
await mkdir('artifacts/illustrated', { recursive: true });
const useWebKit = process.env.CAPTURE_ENGINE === 'webkit';
const prefix = useWebKit ? 'webkit-' : '';
const browser = useWebKit ? await webkit.launch() : await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const report = [];
const baseURL = process.env.PREVIEW_URL || 'http://127.0.0.1:3000';
for (const [name, viewport] of Object.entries({ desktop: { width: 1440, height: 1000 }, phone: { width: 390, height: 844 } })) {
  const context = await browser.newContext({ viewport, isMobile: name === 'phone', hasTouch: name === 'phone', recordVideo: { dir: 'artifacts/illustrated', size: viewport } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${baseURL}/?view=illustrated`);
  await page.waitForSelector('[data-models="ready"]', { timeout: 45000 });
  await page.waitForTimeout(3000);
  const initialLocalTransferBytes = await page.evaluate(() => performance.getEntriesByType('resource').filter(e => new URL(e.name).origin === location.origin).reduce((sum,e) => sum+e.transferSize,0));
  await page.screenshot({ path: `artifacts/illustrated/${prefix}${name}-overview.png` });
  await page.getByPlaceholder('Search buildings…').fill('STEM');
  await page.locator('button[data-id="stem-building"]').click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `artifacts/illustrated/${prefix}${name}-stem.png` });
  const samples = await page.evaluate(() => new Promise(resolve => {
    const times = []; let last = performance.now(); const start = last; let clicks = 0;
    const timer = setInterval(() => document.querySelector(`[aria-label="${clicks++ % 2 ? 'Zoom in' : 'Zoom out'}"]`)?.click(), 350);
    function frame(now) { times.push(now-last); last=now; if(now-start<3000) requestAnimationFrame(frame); else { clearInterval(timer); resolve(times); } }
    requestAnimationFrame(frame);
  }));
  const canvas = await page.locator('canvas.maplibregl-canvas').boundingBox();
  await page.mouse.move(canvas.x+canvas.width*.7, canvas.y+100);
  await page.mouse.down();
  await page.mouse.move(canvas.x+canvas.width*.7-100, canvas.y+150, { steps: 30 });
  await page.mouse.up();
  const sorted = samples.slice(2).sort((a,b)=>a-b);
  report.push({ name, renderer: useWebKit ? `Playwright WebKit ${browser.version()} (not physical iOS)` : `installed Chrome ${browser.version()} / SwiftShader (not physical GPU)`, initialLocalTransferBytes, sample: '3 seconds, alternating zoom controls every 350 ms', errors, frames: sorted.length, frameMedianMs: sorted[Math.floor(sorted.length*.5)], frameP95Ms: sorted[Math.floor(sorted.length*.95)], camera: await page.getByTestId('map-host').evaluate(el => ({...el.dataset})) });
  const video = page.video();
  await context.close();
  await rename(await video.path(), `artifacts/illustrated/${prefix}${name}-pan-zoom.webm`);
}
await browser.close();
await writeFile(`artifacts/illustrated/${prefix}browser-report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

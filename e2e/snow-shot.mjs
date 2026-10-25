// Capture the snowfield HUD with the coach card present, for a visual check
// that the scene stays visible through the panel text.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = `${ROOT}/artifacts/guide`;
const BASE = process.env.BASE ?? 'http://127.0.0.1:5390/';
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__REFLOW__ !== undefined, { timeout: 20000 });
await page.waitForTimeout(1500);
await page.click('#btn-start');
await page.waitForTimeout(700);
if (await page.evaluate(() => !document.getElementById('modal-layer')?.hidden)) {
  await page.click('#modal-resume');
  await page.waitForTimeout(900);
}

// Style preview only: the scene stays the pointer dock, but the snowfield's
// cascade is applied so the card's colours can be judged against a light
// palette. This is NOT a screenshot of the snowfield itself.
await page.evaluate(() => {
  const app = document.getElementById('app');
  app.dataset.city = 'snow';
  document.body.dataset.city = 'snow';
});
await page.waitForTimeout(1200);

await page.screenshot({ path: `${OUT}/28-snow-hud-coach.png` });
console.log('已保存 28-snow-hud-coach.png（雪原配色预览，场景仍是指针港）');

// Same frame with the coach hidden, for a side-by-side comparison.
await page.evaluate(() => { document.getElementById('coach').hidden = true; });
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/29-snow-hud-no-coach.png` });
console.log('已保存 29-snow-hud-no-coach.png');

await browser.close();

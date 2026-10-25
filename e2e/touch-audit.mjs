// Verify whether the small mobile tool buttons qualify for the WCAG 2.5.8
// "spacing" exception (24px target OR 24px spacing to every adjacent target).
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:5390/';
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__REFLOW__ !== undefined);
await page.tap('#btn-start');
await page.waitForTimeout(1200);

const audit = await page.evaluate(() => {
  const ids = ['tool-trace', 'tool-patch', 'tool-map'];
  const boxes = ids.map((id) => {
    const r = document.getElementById(id).getBoundingClientRect();
    return { id, x: r.x, y: r.y, w: r.width, h: r.height,
      cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
  });
  // nearest other target centre for each small button
  const all = [...ids, 'btn-map', 'touch-scan', 'touch-jump', 'touch-stick', 'btn-interact', 'btn-pause', 'btn-sound', 'btn-help', 'brand-button']
    .map((id) => {
      const el = document.getElementById(id);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (r.width === 0) return null;
      return { id, cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
    }).filter(Boolean);

  const gapTo = (a, b) => Math.hypot(a.cx - b.cx, a.cy - b.cy);
  const report = boxes.map((b) => {
    const others = all.filter((o) => o.id !== b.id).map((o) => ({ id: o.id, d: +gapTo(b, o).toFixed(1) }))
      .sort((x, y) => x.d - y.d);
    // nearest edge-to-edge distance (conservative: centre distance minus half sizes)
    return {
      id: b.id,
      size: `${Math.round(b.w)}x${Math.round(b.h)}`,
      meets24pxSize: b.w >= 24 && b.h >= 24,
      nearestCentreGap: others[0],
      passesSpacingException: others[0].d >= 24,
    };
  });

  // Is every action reachable through a larger alternative target?
  const alternatives = {
    'tool-trace (溯源)': 'touch-scan 溯源圆钮 52x52',
    'tool-patch (断点)': '屏幕中央 #btn-interact 交互提示（靠近目标时出现）',
    'tool-map (城市图)': '右下角 mini-map #btn-map 88x119',
  };
  return { report, alternatives };
});
console.log(JSON.stringify(audit, null, 2));
await browser.close();

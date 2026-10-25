// V6 mobile viewport pass — 390×844 CSS pixels, real touch emulation (CDP touch events).
// Verifies the responsive claims in README/QA_REPORT without any state injection.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Repo root = two levels up from e2e/mobile.mjs
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const BASE = process.env.BASE ?? 'http://127.0.0.1:5390/';
const results = [];
const check = (id, ok, detail) => {
  results.push({ id, ok: !!ok, detail: String(detail) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${detail}`);
};

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 1,
});
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

const snap = () => page.evaluate(() => window.__REFLOW__.snapshot());
const sleep = (ms) => page.waitForTimeout(ms);

/** Real touch drag via CDP so pointer capture and pointerId stay valid. */
async function touchDrag(from, to, { hold = 0 } = {}) {
  const point = (p) => ({ x: p.x, y: p.y, radiusX: 12, radiusY: 12, force: 1 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(from)] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(to)] });
  if (hold) await sleep(hold);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

try {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__REFLOW__ !== undefined, { timeout: 20000 });
  await sleep(1500);

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  check('mobile-no-overflow', overflow.scrollWidth <= overflow.innerWidth + 1,
    `scrollWidth=${overflow.scrollWidth} innerWidth=${overflow.innerWidth}`);

  await page.tap('#btn-start');
  await sleep(800);
  const orientation = await page.evaluate(() => ({
    open: !document.getElementById('modal-layer')?.hidden,
    steps: document.querySelectorAll('.coach-steps li').length,
  }));
  check('mobile-orientation', orientation.open && orientation.steps === 4,
    `引导弹出=${orientation.open} 步骤=${orientation.steps}`);
  await page.tap('#modal-resume');
  await sleep(900);
  let s = await snap();
  check('mobile-start', s.mode === 'play', `mode=${s.mode}`);

  // --- touch controls live inside #hud, so they are only measurable in play mode
  const touchUI = await page.evaluate(() => {
    const shown = (id) => {
      const el = document.getElementById(id);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).display !== 'none';
    };
    return { stick: shown('touch-stick'), scan: shown('touch-scan'), jump: shown('touch-jump') };
  });
  check('mobile-touch-controls', touchUI.stick && touchUI.scan && touchUI.jump,
    `摇杆=${touchUI.stick} 溯源=${touchUI.scan} 跳跃=${touchUI.jump}`);

  // WCAG 2.5.8 allows either a 24px target or 24px spacing to every other target.
  const targets = await page.evaluate(() => {
    const ids = ['btn-interact', 'touch-scan', 'touch-jump', 'tool-map', 'tool-trace', 'tool-patch'];
    const boxes = ids.map((id) => {
      const el = document.getElementById(id);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (r.width === 0) return null;
      return { id, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
    }).filter(Boolean);
    return boxes.map((b) => {
      const nearest = boxes.filter((o) => o.id !== b.id)
        .map((o) => ({ id: o.id, d: +Math.hypot(o.cx - b.cx, o.cy - b.cy).toFixed(1) }))
        .sort((x, y) => x.d - y.d)[0];
      const sizeOk = b.w >= 24 && b.h >= 24;
      const spacingOk = nearest.d >= 24;
      return { id: b.id, size: `${Math.round(b.w)}x${Math.round(b.h)}`, sizeOk, nearest, spacingOk,
        pass: sizeOk || spacingOk };
    });
  });
  const bad = targets.filter((t) => !t.pass);
  check('mobile-tap-targets', bad.length === 0,
    bad.length ? `不达标：${bad.map((t) => `${t.id}=${t.size}`).join(', ')}` : targets.map((t) => `${t.id}=${t.size}`).join(' '));

  // --- drive the virtual stick forward (world -Z) toward MIRA
  const stickBox = await page.locator('#touch-stick').boundingBox();
  const cx = stickBox.x + stickBox.width / 2;
  const cy = stickBox.y + stickBox.height / 2;
  await touchDrag({ x: cx, y: cy }, { x: cx, y: cy - 32 }, { hold: 100 });
  // hold the stick down for the duration of the walk
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart', touchPoints: [{ x: cx, y: cy - 32, radiusX: 12, radiusY: 12, force: 1 }],
  });
  let deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    await sleep(120);
    s = await snap();
    if (s.position.z <= 18) break;
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(500);
  s = await snap();

  const prompt = await page.evaluate(() => !document.getElementById('interact-prompt').hidden);
  check('mobile-reach-mira', prompt && s.position.z <= 20, `z=${s.position.z.toFixed(1)} prompt=${prompt}`);

  // the contextual interact prompt only exists once you are close enough
  const interactBox = await page.evaluate(() => {
    const el = document.getElementById('btn-interact');
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), visible: r.width > 0 };
  });
  check('mobile-interact-target', interactBox.visible && interactBox.w >= 24 && interactBox.h >= 24,
    `#btn-interact=${interactBox.w}x${interactBox.h} 可见=${interactBox.visible}`);

  await page.tap('#btn-interact');
  await sleep(500);
  const subtitle = await page.evaluate(() => !document.getElementById('subtitle').hidden);
  check('mobile-dialogue', subtitle, `字幕可见=${subtitle}`);
  for (let i = 0; i < 3; i++) { await page.tap('#btn-dialogue'); await sleep(400); }
  s = await snap();
  check('mobile-chapter-advance', s.chapter === 'reorder', `chapter=${s.chapter}`);

  // --- walk on to the broken platform and scan
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart', touchPoints: [{ x: cx, y: cy - 32, radiusX: 12, radiusY: 12, force: 1 }],
  });
  deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    await sleep(120);
    s = await snap();
    if (s.position.z <= 6) break;
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(400);

  await page.tap('#touch-scan');
  await sleep(700);
  s = await snap();
  check('mobile-scan', s.evidence.includes('Q-01'), `evidence=${JSON.stringify(s.evidence)}`);

  await page.tap('#btn-interact');
  await sleep(800);
  const panel = await page.evaluate(() => {
    const p = document.getElementById('patch-panel');
    const r = p.getBoundingClientRect();
    return {
      visible: !p.hidden && r.width > 0,
      withinViewport: r.right <= window.innerWidth + 1 && r.left >= -1,
      scrollable: p.scrollHeight > p.clientHeight,
    };
  });
  check('mobile-patch-panel', panel.visible && panel.withinViewport,
    `可见=${panel.visible} 未溢出视口=${panel.withinViewport} 可滚动=${panel.scrollable}`);
  await page.screenshot({ path: `${ROOT}/artifacts/e2e-v6-mobile-patch.png` });

  // --- reorder + commit on mobile
  await page.tap('.event-item[data-action="EXIT"] [data-dir="-1"]');
  await sleep(400);
  await page.tap('#btn-verify');
  await sleep(1000);
  s = await snap();
  check('mobile-order-commit', s.chapter === 'rail', `chapter=${s.chapter}`);

  await page.waitForFunction(() => window.__REFLOW__.snapshot().mode === 'play', { timeout: 20000 });
  await sleep(800);
  await page.screenshot({ path: `${ROOT}/artifacts/e2e-v6-mobile-play.png` });

  check('mobile-no-browser-errors', errors.length === 0, `错误 ${errors.length} 条 ${errors.slice(0, 3).join(' | ')}`);
  console.log(`\n最终快照：fps=${s.fps} draw=${s.draw.calls} tris=${s.draw.triangles}`);
} catch (error) {
  console.error('移动端 E2E 中断：', error);
  check('mobile-crash', false, error.message);
  await page.screenshot({ path: `${ROOT}/artifacts/e2e-v6-mobile-crash.png` }).catch(() => {});
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n==== ${results.length - failed.length}/${results.length} PASS ====`);
if (failed.length) console.log('失败项：', failed.map((f) => `${f.id} (${f.detail})`).join(' | '));
process.exit(failed.length ? 1 : 0);

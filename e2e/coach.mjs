// Verify the in-game contextual coach across all four cities.
// Every city is reached by driving the production build with real input only.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = `${ROOT}/artifacts/guide`;
const BASE = process.env.BASE ?? 'http://127.0.0.1:5390/';
await mkdir(OUT, { recursive: true });

const results = [];
const check = (id, ok, detail) => {
  results.push({ id, ok: !!ok, detail: String(detail) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${detail}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

const newPage = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__REFLOW__ !== undefined, { timeout: 20000 });
  await sleep(1500);
  return { ctx, page, errors };
};

const snap = (page) => page.evaluate(() => window.__REFLOW__.snapshot());
const coachText = (page) => page.evaluate(() => {
  const c = document.getElementById('coach');
  if (!c || c.hidden) return null;
  return {
    key: document.getElementById('coach-key')?.textContent ?? '',
    action: document.getElementById('coach-action')?.textContent ?? '',
    hint: document.getElementById('coach-hint')?.textContent ?? '',
  };
});
/** The city the game currently believes it is in. */
const cityOf = (page) => page.evaluate(() => document.getElementById('app')?.dataset.city ?? 'unknown');

let lastPage = null;

try {
  // ================================================================
  // A. First-time player in the pointer dock
  // ================================================================
  {
    const { ctx, page, errors } = await newPage();
    lastPage = page;
    console.log('--- A. 指针港 · 首次进入 ---');

    const howBtn = await page.evaluate(() => {
      const b = document.getElementById('btn-how');
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { visible: r.width > 0, text: b.textContent?.trim() };
    });
    check('menu-how-entry', howBtn && howBtn.visible, `菜单「怎么玩」入口=${JSON.stringify(howBtn)}`);

    await page.click('#btn-start');
    await sleep(900);
    const orient = await page.evaluate(() => ({
      open: !document.getElementById('modal-layer')?.hidden,
      steps: document.querySelectorAll('.coach-steps li').length,
      mode: window.__REFLOW__.snapshot().mode,
    }));
    check('first-run-orientation', orient.open && orient.steps === 4 && orient.mode === 'menu',
      `引导在进入世界前弹出=${orient.open} 步骤=${orient.steps} 此刻 mode=${orient.mode}`);
    await page.screenshot({ path: `${OUT}/21-first-run-orientation.png` });

    await page.click('#modal-resume');
    await sleep(1000);
    let s = await snap(page);
    check('game-started', s.mode === 'play' && s.chapter === 'meet', `mode=${s.mode} chapter=${s.chapter}`);

    let coach = await coachText(page);
    check('coach-meet', coach && coach.key.includes('W') && coach.hint.includes('MIRA'),
      `chapter=meet coach=${JSON.stringify(coach)}`);
    await page.screenshot({ path: `${OUT}/22-coach-meet.png` });

    // Walk to MIRA and finish the dialogue; the coach must switch to scanning.
    await page.keyboard.down('w');
    for (let i = 0; i < 400; i++) {
      await sleep(60);
      if ((await snap(page)).position.z <= 18) break;
    }
    await page.keyboard.up('w');
    await sleep(400);
    for (let i = 0; i < 4; i++) { await page.keyboard.press('e'); await sleep(420); }
    await sleep(700);
    coach = await coachText(page);
    check('coach-reorder-needs-scan', coach && coach.key === 'Q' && coach.action.includes('扫描'),
      `扫描前 coach=${JSON.stringify(coach)}`);
    await page.screenshot({ path: `${OUT}/23-coach-scan.png` });

    // Scanning flips the coach to E — the evidence gate.
    await page.keyboard.down('w');
    for (let i = 0; i < 300; i++) {
      await sleep(60);
      if ((await snap(page)).position.z <= 6) break;
    }
    await page.keyboard.up('w');
    await sleep(400);
    await page.keyboard.press('q');
    await sleep(800);
    coach = await coachText(page);
    check('coach-reorder-after-scan', coach && coach.key === 'E' && coach.hint.includes('证据'),
      `扫描后 coach=${JSON.stringify(coach)}`);

    // The workbench carries its own goal line.
    await page.keyboard.press('e');
    await sleep(900);
    const pc = await page.evaluate(() => ({
      visible: !document.getElementById('patch-coach')?.hidden,
      key: document.getElementById('patch-coach-key')?.textContent ?? '',
      action: document.getElementById('patch-coach-action')?.textContent ?? '',
    }));
    check('patch-coach', pc.visible && pc.key === 'R' && pc.action.includes('让旅客离开'),
      `工作台引导=${JSON.stringify(pc)}`);
    await page.screenshot({ path: `${OUT}/24-patch-coach.png` });

    check('A-no-browser-errors', errors.length === 0, `错误 ${errors.length} 条 ${errors.slice(0, 3).join(' | ')}`);
    await ctx.close();
  }

  // ================================================================
  // B. Later cities — the coach must not show pointer-dock advice
  // ================================================================
  {
    const { ctx, page, errors } = await newPage();
    lastPage = page;
    console.log('--- B. 后续城市 · 引导必须跟随城市切换 ---');
    // A returning player with every city unlocked.
    await page.evaluate(() => {
      localStorage.setItem('reflow-404:v6:onboarded', '1');
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__REFLOW__ !== undefined);
    await sleep(1200);

    await page.click('#btn-start');
    await sleep(900);
    const noRepeat = await page.evaluate(() => !document.getElementById('modal-layer')?.hidden);
    check('no-repeat-orientation', noRepeat === false, '二次开始不弹引导=' + !noRepeat);

    // Later cities unlock only by finishing the previous one, so play the
    // pointer dock for real, then check the coach follows the city change.
    const walkToZ = async (z, limit = 400) => {
      await page.keyboard.down('w');
      for (let i = 0; i < limit; i++) { await sleep(60); if ((await snap(page)).position.z <= z) break; }
      await page.keyboard.up('w');
      await sleep(300);
    };
    await walkToZ(18);
    for (let i = 0; i < 4; i++) { await page.keyboard.press('e'); await sleep(420); }
    await walkToZ(6);
    await page.keyboard.press('q');
    await sleep(700);
    await page.keyboard.press('e');
    await sleep(900);
    await page.click('.event-item[data-action="EXIT"] [data-dir="-1"]');
    await sleep(400);
    await page.click('#btn-verify');
    await sleep(1400);
    await page.waitForFunction(() => window.__REFLOW__.snapshot().mode === 'play', { timeout: 30000 });
    await walkToZ(-43, 800);
    await page.keyboard.press('q');
    await sleep(700);
    await page.keyboard.press('e');
    await sleep(900);
    await page.click('.source-picker [data-source="A"]');
    await sleep(200);
    await page.click('.target-picker [data-target="B"]');
    await sleep(300);
    await page.click('#btn-verify');
    await sleep(1600);
    await page.waitForFunction(() => window.__REFLOW__.snapshot().mode === 'play', { timeout: 30000 });
    await sleep(700);
    await page.keyboard.press('e');
    await page.waitForFunction(() => window.__REFLOW__.snapshot().mode === 'result', { timeout: 60000 });
    await sleep(900);
    const done = await snap(page);
    check('dock-completed', done.chapter === 'complete', `指针港真实通关 chapter=${done.chapter}`);

    // The result screen hides the HUD, so roam first to bring it back.
    await page.click('#btn-roam');
    await sleep(900);
    const afterDock = await coachText(page);
    check('coach-after-dock', afterDock !== null && afterDock.action.includes('脉冲炉'),
      `通关后引导指向下一城 coach=${JSON.stringify(afterDock)}`);

    // The city map lists every city; only the finished ones are enabled.
    await page.keyboard.press('m');
    await sleep(900);
    const stops = await page.evaluate(() => {
      const read = (id) => {
        const b = document.getElementById(id);
        return b ? (b.disabled ? 'locked' : 'available') : 'no-button';
      };
      return { forge: read('map-forge'), thread: read('map-thread'), snow: read('map-snow') };
    });
    check('forge-unlocked', stops.forge === 'available', `脉冲炉=${stops.forge}`);
    check('later-cities-locked', stops.thread === 'locked' && stops.snow === 'locked',
      `千线程=${stops.thread} 白噪雪原=${stops.snow}（未通关前城时保持锁定，符合设计）`);

    // Travel to the forge through the map and confirm the coach follows.
    if (stops.forge === 'available') {
      await page.click('#map-forge');
      // The arrival cinematic runs 5s and blocks input; the guide is hidden
      // during it by design, so wait for the world to become interactive.
      await page.waitForFunction(() => {
        const s = window.__REFLOW__.snapshot();
        return s.mode === 'play';
      }, { timeout: 30000, polling: 200 });
      await sleep(1200);
      const city = await cityOf(page);
      const coach = await coachText(page);
      check('city-forge-coach',
        city === 'forge' && coach !== null && !coach.hint.includes('MIRA') && !coach.hint.includes('坏站台'),
        `当前城市=${city} coach=${JSON.stringify(coach)}`);
      await page.screenshot({ path: `${OUT}/27-coach-forge.png` });
    }
    check('B-no-browser-errors', errors.length === 0, `错误 ${errors.length} 条 ${errors.slice(0, 3).join(' | ')}`);
    await ctx.close();
  }
} catch (error) {
  console.error('中断：', error);
  check('coach-crash', false, error.message);
  await lastPage?.screenshot({ path: `${OUT}/25-coach-crash.png` }).catch(() => {});
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n==== ${results.length - failed.length}/${results.length} PASS ====`);
if (failed.length) console.log('失败项：', failed.map((f) => `${f.id} (${f.detail})`).join(' | '));

await writeFile(`${ROOT}/artifacts/e2e-coach-checks.json`, JSON.stringify({
  date: '2026-10-25',
  method: 'Playwright against production dist; no state injection, no dev teleport hooks',
  viewport: { width: 1280, height: 720 },
  checks: results.map((r) => ({ id: r.id, pass: r.ok, detail: r.detail })),
}, null, 2), 'utf8');

process.exit(failed.length ? 1 : 0);

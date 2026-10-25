// V6 production E2E — reproduces the 15 assertions recorded in
// artifacts/v6-production-ui-checks.json against the built dist.
//
// Rules honored:
//   * no state injection — the production bundle exposes only the read-only
//     window.__REFLOW__.snapshot(); there are no dev warp/teleport hooks.
//   * real input only — keyboard for movement/scan/patch, pointer for 3D drag.
//   * snapshot() is READ ONLY here, used to know where the avatar stands.
import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Repo root = two levels up from e2e/production.mjs
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
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

const snap = () => page.evaluate(() => window.__REFLOW__.snapshot());
const sleep = (ms) => page.waitForTimeout(ms);
const visible = (sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  return !!el && !el.hidden && el.getBoundingClientRect().width > 0;
}, sel);

/** Hold W (world -Z, camera yaw stays 0) until the avatar's Z passes a target. */
async function walkToZ(targetZ, { timeout = 30000 } = {}) {
  await page.keyboard.down('w');
  const deadline = Date.now() + timeout;
  let last = null;
  while (Date.now() < deadline) {
    await sleep(60);
    last = (await snap()).position;
    if (last.z <= targetZ) break;
  }
  await page.keyboard.up('w');
  await sleep(120);
  return last ?? (await snap()).position;
}

try {
  // ---------------------------------------------------------------- menu
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__REFLOW__ !== undefined, { timeout: 20000 });
  await sleep(1500);
  const boot = await snap();
  check('prod-menu', boot.mode === 'menu' && (await visible('#menu')) && (await visible('#btn-start')),
    `mode=${boot.mode} menu=${await visible('#menu')} start=${await visible('#btn-start')}`);
  check('prod-no-dev-hooks', await page.evaluate(() => typeof window.__city === 'undefined'),
    '生产包不含 __city 开发传送钩子');

  // A first-time player meets the orientation before the world loads.
  const orientation = await page.evaluate(() => !document.getElementById('modal-layer')?.hidden);
  check('prod-orientation-gate', orientation === false,
    '主菜单本身不弹引导（引导在点开始后出现）');

  await page.click('#btn-start');
  await sleep(700);
  const coachUp = await page.evaluate(() => ({
    open: !document.getElementById('modal-layer')?.hidden,
    steps: document.querySelectorAll('.coach-steps li').length,
    mode: window.__REFLOW__.snapshot().mode,
  }));
  check('prod-orientation', coachUp.open && coachUp.steps === 4 && coachUp.mode === 'menu',
    `引导弹出=${coachUp.open} 步骤=${coachUp.steps} 此刻仍在菜单=${coachUp.mode === 'menu'}`);

  await page.click('#modal-resume');
  await sleep(1000);
  let s = await snap();
  check('game-started', s.mode === 'play' && s.chapter === 'meet', `mode=${s.mode} chapter=${s.chapter}`);

  // ------------------------------------------------- meet MIRA (dialogue)
  const mira = await walkToZ(18);
  await sleep(400);
  const miraPrompt = await visible('#interact-prompt');
  check('reach-mira', miraPrompt, `z=${mira?.z?.toFixed(1)} interactPrompt=${miraPrompt}`);
  for (let i = 0; i < 4; i++) { await page.keyboard.press('e'); await sleep(450); }
  s = await snap();
  check('mira-dialogue', s.chapter === 'reorder', `chapter=${s.chapter}（4 次 E 后应推进到 reorder）`);

  // ------------------------------------------------ Q-01 scan + patch panel
  await walkToZ(6);
  await sleep(400);
  await page.keyboard.press('q');
  await sleep(600);
  s = await snap();
  check('scan-Q-01', s.evidence.includes('Q-01'), `evidence=${JSON.stringify(s.evidence)}`);

  await page.keyboard.press('e');
  await sleep(700);
  const patchOpen = await visible('#patch-panel');
  const patchCode = await page.textContent('#patch-code');
  check('open-patch-Q01', patchOpen && patchCode.includes('Q-01'), `panel=${patchOpen} code=${patchCode}`);

  // preview is isolated: it must not mutate authority
  await page.click('#btn-preview');
  await sleep(400);
  const previewLabel = await page.textContent('#proof-label');
  s = await snap();
  check('preview-isolated',
    previewLabel.includes('COUNTERFACTUAL') && s.chapter === 'reorder' && s.order.join() === 'DELETE,EXIT,ARCHIVE',
    `label="${previewLabel}" chapter=${s.chapter} order=${s.order.join(',')}`);

  // wrong order must produce a concrete counterexample
  await page.click('#btn-verify');
  await sleep(600);
  const proofTitle = await page.textContent('#proof-title');
  const proofReason = await page.textContent('#proof-reason');
  s = await snap();
  // counterexamples lives in the persisted campaign, not in the read-only snapshot.
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('reflow-404:v6:campaign') ?? 'null'));
  check('order-counterexample',
    proofTitle.includes('反例') && s.chapter === 'reorder' && saved?.counterexamples >= 1 && s.proof && s.proof.passed === false,
    `title="${proofTitle}" reason="${proofReason}" counterexamples=${saved?.counterexamples}`);

  // fix: promote EXIT to the front, then commit
  await page.click('.event-item[data-action="EXIT"] [data-dir="-1"]');
  await sleep(400);
  const firstEvent = await page.getAttribute('.event-item:first-child', 'data-action');
  await page.click('#btn-verify');
  await sleep(900);
  s = await snap();
  check('order-commit-replay',
    firstEvent === 'EXIT' && s.chapter === 'rail' && s.proof && s.proof.passed === true,
    `firstEvent=${firstEvent} chapter=${s.chapter} passed=${s.proof?.passed} route=${s.proof?.route ?? ''}`);
  await page.screenshot({ path: `${ROOT}/artifacts/e2e-v6-order-commit.png` });

  // ------------------------------------------------- walk the ramp up to A
  await page.waitForFunction(() => window.__REFLOW__.snapshot().mode === 'play', { timeout: 20000 });
  const elevated = await walkToZ(-43);
  s = await snap();
  check('walk-to-elevated-A', s.position.y > 12 && s.position.z < -40 && s.chapter === 'rail',
    `y=${s.position.y.toFixed(2)} z=${s.position.z.toFixed(2)} chapter=${s.chapter} bridge=${s.bridge}`);

  // ------------------------------------------------- DS-01 scan + patch
  await page.keyboard.press('q');
  await sleep(600);
  s = await snap();
  check('scan-DS-01', s.evidence.includes('DS-01'), `evidence=${JSON.stringify(s.evidence)}`);

  await page.keyboard.press('e');
  await sleep(800);
  const railCode = await page.textContent('#patch-code');
  check('open-patch-DS01', (await visible('#patch-panel')) && railCode.includes('DS-01'), `code=${railCode}`);

  // self-loop must be rejected by the domain model
  await page.click('.source-picker [data-source="A"]');
  await sleep(200);
  await page.click('.target-picker [data-target="A"]');
  await sleep(300);
  const summary = await page.textContent('.link-summary');
  await page.click('#btn-verify');
  await sleep(700);
  const cycleReason = await page.textContent('#proof-reason');
  s = await snap();
  check('rail-cycle-rejected',
    summary.includes('A') && cycleReason.includes('循环') && s.chapter === 'rail' && s.rail.next.A === 'C',
    `summary="${summary?.trim()}" reason="${cycleReason}" authorityA=${s.rail.next.A}`);

  // ------------------------------------------------- real 3D node drag A -> B
  const nodeBox = await page.evaluate(() => {
    const out = {};
    for (const id of ['A', 'B']) {
      const b = document.querySelector(`.causal-node[data-node="${id}"]`);
      if (!b || b.hidden) return null;
      const r = b.getBoundingClientRect();
      out[id] = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }
    return out;
  });
  if (!nodeBox) {
    check('3d-node-drag', false, '三维节点未渲染到屏幕，无法执行真实拖拽');
  } else {
    await page.mouse.move(nodeBox.A.x, nodeBox.A.y);
    await page.mouse.down();
    await page.mouse.move(nodeBox.B.x, nodeBox.B.y, { steps: 12 });
    await sleep(150);
    await page.mouse.up();
    await sleep(500);
    const dragSummary = await page.textContent('.link-summary');
    s = await snap();
    check('3d-node-drag',
      dragSummary.includes('B') && s.rail.next.A === 'C' && s.chapter === 'rail',
      `拖拽后 summary="${dragSummary?.trim()}"（草案 A.next→B，权威快照仍为 ${s.rail.next.A}）`);
    await page.screenshot({ path: `${ROOT}/artifacts/e2e-v6-3d-drag.png` });
  }

  // undo the self-loop draft, then set A.next = B through the editor
  await page.click('#btn-undo');
  await sleep(400);
  await page.click('.source-picker [data-source="A"]');
  await sleep(200);
  await page.click('.target-picker [data-target="B"]');
  await sleep(300);
  const fixedSummary = await page.textContent('.link-summary');
  await page.click('#btn-verify');
  await sleep(1000);
  s = await snap();
  check('rail-commit-replay',
    fixedSummary.includes('B') && s.chapter === 'board' && s.proof && s.proof.passed === true && s.rail.next.A === 'B',
    `summary="${fixedSummary?.trim()}" chapter=${s.chapter} committedA=${s.rail.next.A} route=${s.proof?.route ?? ''}`);
  await page.screenshot({ path: `${ROOT}/artifacts/e2e-v6-rail-commit.png` });

  // ------------------------------------------------- board the train
  await page.waitForFunction(() => window.__REFLOW__.snapshot().mode === 'play', { timeout: 30000 });
  await sleep(600);
  const boardPrompt = await visible('#interact-prompt');
  await page.keyboard.press('e');
  await page.waitForFunction(() => window.__REFLOW__.snapshot().mode === 'result', { timeout: 60000 });
  s = await snap();
  check('train-to-result',
    boardPrompt && s.mode === 'result' && s.chapter === 'complete' && (await visible('#result')),
    `chapter=${s.chapter} mode=${s.mode} elapsed=${s.elapsed.toFixed(1)}s route=${s.route.join('→')}`);
  await page.screenshot({ path: `${ROOT}/artifacts/e2e-v6-result.png` });

  // ------------------------------------------------- restart resets the world
  await page.click('#btn-restart');
  await sleep(1200);
  s = await snap();
  check('restart-restores-broken-route',
    s.chapter === 'meet' && s.rail.next.A === 'C' && s.evidence.length === 0 && s.order.join() === 'DELETE,EXIT,ARCHIVE',
    `chapter=${s.chapter} A=${s.rail.next.A} evidence=${s.evidence.length} order=${s.order.join(',')}`);

  // ------------------------------------------------- pause / map / sound
  await page.keyboard.press('Escape');
  await sleep(500);
  const pauseText = await page.textContent('#modal-content');
  check('pause-dialog', (await visible('#modal-layer')) && pauseText.includes('城市会等你'),
    `modal="${pauseText?.replace(/\s+/g, ' ').trim().slice(0, 40)}"`);
  await page.click('#modal-resume');
  await sleep(400);

  await page.keyboard.press('m');
  await sleep(600);
  const mapText = await page.textContent('#modal-content');
  check('map-panel', (await visible('#modal-layer')) && mapText.includes('因果地图'),
    `modal="${mapText?.replace(/\s+/g, ' ').trim().slice(0, 40)}" largeMap=${await visible('#large-map')}`);
  // the map modal has no primary resume button; it closes via the header ×
  await page.click('#btn-close-modal');
  await sleep(400);

  await page.click('#btn-sound');
  await sleep(400);
  const onPressed = await page.getAttribute('#btn-sound', 'aria-pressed');
  s = await snap();
  check('sound-enable', onPressed === 'true' && s.audioOn === true, `aria-pressed=${onPressed} audioOn=${s.audioOn}`);

  await page.click('#btn-sound');
  await sleep(400);
  const offPressed = await page.getAttribute('#btn-sound', 'aria-pressed');
  s = await snap();
  check('sound-disable', offPressed === 'false' && s.audioOn === false, `aria-pressed=${offPressed} audioOn=${s.audioOn}`);

  check('no-browser-errors', errors.length === 0, `错误 ${errors.length} 条 ${errors.slice(0, 3).join(' | ')}`);

  const perf = await snap();
  console.log(`\n最终快照：fps=${perf.fps} draw=${perf.draw.calls} tris=${perf.draw.triangles} 掉落=${perf.falls}`);
} catch (error) {
  console.error('E2E 中断：', error);
  check('e2e-crash', false, error.message);
  await page.screenshot({ path: `${ROOT}/artifacts/e2e-v6-crash.png` }).catch(() => {});
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n==== ${results.length - failed.length}/${results.length} PASS ====`);
if (failed.length) console.log('失败项：', failed.map((f) => `${f.id} (${f.detail})`).join(' | '));

// Kept separate from the maintained receipts in artifacts/ so the release
// evidence for the current version is never overwritten.
await writeFile(`${ROOT}/artifacts/e2e-production-checks.json`, JSON.stringify({
  date: '2026-10-25',
  method: 'Playwright against production dist; no state injection, no dev teleport hooks',
  viewport: { width: 1280, height: 720 },
  checks: results.map((r) => ({ id: r.id, pass: r.ok, detail: r.detail })),
  finalConsoleErrors: errors,
}, null, 2), 'utf8');

process.exit(failed.length ? 1 : 0);

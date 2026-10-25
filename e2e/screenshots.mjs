// Capture the key frames of a real playthrough for the illustrated player guide.
// Every frame is produced by driving the production build with real input only.
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
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const snap = () => page.evaluate(() => window.__REFLOW__.snapshot());
const sleep = (ms) => page.waitForTimeout(ms);
const shot = async (name) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  拍摄 ${name}.png`);
};

async function walkToZ(targetZ, timeout = 30000) {
  await page.keyboard.down('w');
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    await sleep(60);
    if ((await snap()).position.z <= targetZ) break;
  }
  await page.keyboard.up('w');
  await sleep(150);
}

try {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__REFLOW__ !== undefined, { timeout: 20000 });
  await sleep(1800);

  console.log('1. 主菜单');
  await shot('01-menu');

  await page.click('#btn-start');
  await sleep(800);
  // A first-time player meets the orientation before the world loads.
  const orientation = await page.evaluate(() => !document.getElementById('modal-layer')?.hidden);
  if (orientation) {
    console.log('0. 首次引导弹窗');
    await page.screenshot({ path: `${OUT}/21-first-run-orientation.png` });
    await page.click('#modal-resume');
    await sleep(900);
  }
  await sleep(400);
  console.log('2. HUD 与任务面板');
  await shot('02-hud-objective');

  await walkToZ(18);
  await sleep(500);
  console.log('3. 靠近 MIRA 的交互提示');
  await shot('03-interact-prompt');

  for (let i = 0; i < 4; i++) { await page.keyboard.press('e'); await sleep(450); }
  await sleep(400);
  console.log('4. MIRA 对话字幕');
  await shot('04-dialogue');

  await walkToZ(6);
  await sleep(500);
  await page.keyboard.press('q');
  await sleep(700);
  console.log('5. Q 扫描取证');
  await shot('05-scan-evidence');

  await page.keyboard.press('e');
  await sleep(900);
  console.log('6. Q-01 工作台');
  await shot('06-workbench-order');

  await page.click('#btn-verify');
  await sleep(800);
  console.log('7. 反例报告');
  await shot('07-counterexample');

  await page.click('#btn-preview');
  await sleep(600);
  console.log('8. 预演未来（隔离草案）');
  await shot('08-preview-isolated');

  await page.click('.event-item[data-action="EXIT"] [data-dir="-1"]');
  await sleep(500);
  console.log('9. 把 EXIT 提到第一位');
  await shot('09-order-fixed');

  await page.click('#btn-verify');
  await sleep(1200);
  console.log('10. 修复通过，进入演出');
  await shot('10-commit-replay');

  await page.waitForFunction(() => window.__REFLOW__.snapshot().mode === 'play', { timeout: 25000 });
  await walkToZ(-43);
  await sleep(500);
  console.log('11. 走上高架');
  await shot('11-elevated-deck');

  await page.keyboard.press('q');
  await sleep(700);
  await page.keyboard.press('e');
  await sleep(1000);
  console.log('12. DS-01 工作台与三维节点');
  await shot('12-workbench-rail');

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
  if (nodeBox) {
    await page.mouse.move(nodeBox.A.x, nodeBox.A.y);
    await page.mouse.down();
    await page.mouse.move(nodeBox.B.x, nodeBox.B.y, { steps: 14 });
    await sleep(200);
    console.log('13. 拖拽三维节点 A → B');
    await shot('13-3d-node-drag');
    await page.mouse.up();
    await sleep(500);
  }

  await page.click('#btn-undo');
  await sleep(400);
  await page.click('.source-picker [data-source="A"]');
  await sleep(200);
  await page.click('.target-picker [data-target="B"]');
  await sleep(400);
  console.log('14. 改写 A.next → B');
  await shot('14-rail-relink');

  await page.click('#btn-verify');
  await sleep(1400);
  console.log('15. 线路恢复');
  await shot('15-rail-restored');

  await page.waitForFunction(() => window.__REFLOW__.snapshot().mode === 'play', { timeout: 30000 });
  await sleep(800);
  await page.keyboard.press('e');
  await sleep(2500);
  console.log('16. 列车返航');
  await shot('16-train-ride');

  await page.waitForFunction(() => window.__REFLOW__.snapshot().mode === 'result', { timeout: 60000 });
  await sleep(900);
  console.log('17. 结算');
  await shot('17-result');

  await page.click('#btn-restart');
  await sleep(1200);
  await page.keyboard.press('m');
  await sleep(700);
  console.log('18. 城市地图');
  await shot('18-city-map');
  await page.click('#btn-close-modal');
  await sleep(500);

  await page.click('#btn-help');
  await sleep(700);
  console.log('19. 操作手册弹窗');
  await shot('19-help-panel');
  await page.click('#btn-close-modal');
  await sleep(400);

  console.log(`\n浏览器错误：${errors.length} 条 ${errors.slice(0, 3).join(' | ')}`);
} catch (error) {
  console.error('截图流程中断：', error);
  await page.screenshot({ path: `${OUT}/99-crash.png` }).catch(() => {});
} finally {
  await browser.close();
}

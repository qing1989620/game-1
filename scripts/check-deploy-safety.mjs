#!/usr/bin/env node
/**
 * Deployment safety check for the Vercel-hosted build.
 *
 * The repository is deployed by Vercel: any push to main triggers a build.
 * This script asserts the things that would silently break that build, so a
 * change can be validated before it ever reaches main.
 *
 * It never mutates anything. Run it from the repository root:
 *   node scripts/check-deploy-safety.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
// Accepts a relative path or an absolute one; path.join would corrupt the latter.
const exists = (file) => fs.existsSync(path.isAbsolute(file) ? file : path.join(root, file));
const problems = [];
const notes = [];

function requireThat(ok, message) {
  if (!ok) problems.push(message);
}

/* ---------------------------------------------------------------- 1. build config */

// The Vercel build command must be reproducible from a clean checkout.
const manifest = JSON.parse(read('package.json'));
requireThat(manifest.scripts?.build, 'package.json 缺少 build 脚本');
requireThat(/tsc/.test(manifest.scripts?.build ?? ''),
  'build 脚本应先跑 tsc --noEmit，类型错误必须在部署前暴露');
requireThat(exists('package-lock.json'), '缺少 package-lock.json，Vercel 无法用 npm ci 复现依赖');
requireThat(exists('vite.config.ts'), '缺少 vite.config.ts');

/* ------------------------------------------------- 2. static hosting contract */

// Vite emits relative asset URLs so the build works at any Vercel path prefix.
const viteConfig = read('vite.config.ts');
requireThat(/base:\s*'\.\/'/.test(viteConfig),
  "vite.config.ts 应保持 base: './'，否则部署到子路径时资源 404");

// The published directory must contain only what a browser needs.
const dist = path.join(root, 'dist');
if (exists(dist)) {
  for (const required of ['index.html', 'character-card.html', 'THIRD_PARTY_NOTICES.txt']) {
    requireThat(fs.existsSync(path.join(dist, required)), `dist/ 缺少 ${required}`);
  }
  // Source, tests and tooling must never be published.
  for (const forbidden of ['src', 'tests', 'scripts', 'e2e', 'qa', 'node_modules']) {
    requireThat(!fs.existsSync(path.join(dist, forbidden)), `dist/ 不应包含 ${forbidden}/`);
  }
  const html = read('dist/index.html');
  const assets = [...html.matchAll(/(?:src|href)="\.\/([^"#]+\.(?:js|css))"/g)].map((m) => m[1]);
  requireThat(assets.some((a) => a.endsWith('.js')) && assets.some((a) => a.endsWith('.css')),
    'dist/index.html 必须引用构建后的 js 与 css');
  for (const asset of assets) {
    requireThat(fs.existsSync(path.join(dist, asset)), `dist/ 缺少被引用的 ${asset}`);
  }
  // Development hooks must never reach production.
  for (const asset of assets.filter((a) => a.endsWith('.js'))) {
    const js = read(path.join('dist', asset));
    requireThat(!js.includes('__city'), '生产包泄漏了开发传送钩子 __city');
    requireThat(!/localhost:538[0-9]|127\.0\.0\.1:538[0-9]/.test(js),
      '生产包泄漏了本地 QA 地址');
  }
} else {
  notes.push('dist/ 不存在：跳过产物检查（先跑 npm run build）');
}

/* ------------------------------------------------------- 3. repository hygiene */

// A large binary directory slows every Vercel clone and build.
const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);
const heavy = tracked.filter((f) => /\.(?:png|jpe?g|gif|webp|mp3|mp4|zip|bin)$/i.test(f));
if (heavy.length > 60) {
  notes.push(`仓库含 ${heavy.length} 个二进制资源（${(heavy.length / 1).toFixed(0)} 个），` +
    '每次 Vercel 克隆都要下载它们；新增截图前先确认必要性');
}

// Browser-driven test scripts need Playwright, which is not a runtime dependency.
const e2eDir = path.join(root, 'e2e');
if (exists(e2eDir)) {
  const scripts = fs.readdirSync(e2eDir).filter((f) => f.endsWith('.mjs'));
  const usesPlaywright = scripts.some((f) => /from\s+'playwright'/.test(read(path.join('e2e', f))));
  if (usesPlaywright) {
    requireThat(manifest.devDependencies?.playwright !== undefined,
      'e2e/ 使用了 playwright，但 devDependencies 里没有声明');
    requireThat(manifest.dependencies?.playwright === undefined,
      'playwright 不应是运行时依赖，会拖慢 Vercel 生产安装');
  }
}

/* ---------------------------------------------------------------- 4. report */

if (notes.length) for (const note of notes) console.log(`note  ${note}`);
if (problems.length) {
  for (const problem of problems) console.error(`FAIL  ${problem}`);
  console.error(`\n${problems.length} 项部署安全问题。`);
  process.exit(1);
}
console.log(JSON.stringify({ deploySafety: 'passed', trackedFiles: tracked.length, notes: notes.length }));

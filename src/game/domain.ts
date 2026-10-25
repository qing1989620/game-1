import { freshForge, parseForge, type ForgeProgress, type Weather } from './forge-domain';
import { freshThread, parseThread, type ThreadProgress } from './thread-domain';
import { freshSnow, parseSnow, type SnowProgress } from './snow-domain';
import { freshDune, parseDune, runDuneAudit, type DuneProgress } from './dune-domain';
import {freshGrove,parseGrove,runGroveAudit,type GroveProgress} from './grove-domain';
/** V6 authority. All experiments are isolated snapshots; only proven results commit. */
export type Station = 'A' | 'B' | 'C' | 'END';
export type EventAction = 'EXIT' | 'DELETE' | 'ARCHIVE';
export interface EventLog { tick: number; kind: string; actor: string; detail: string }
export interface Assertion { name: string; passed: boolean; detail: string }
export interface RunResult {
  runId: string;
  passed: boolean;
  route: Station[];
  log: EventLog[];
  assertions: Assertion[];
  reason: string;
}
export interface RailState { head: Station; next: Record<Station, Station | null> }
export const STATIONS: Station[] = ['A', 'B', 'C', 'END'];
export const INITIAL_RAIL: RailState = { head: 'A', next: { A: 'C', B: 'C', C: 'END', END: null } };
export const INITIAL_ORDER: EventAction[] = ['DELETE', 'EXIT', 'ARCHIVE'];
const own = (o: object, key: string): boolean => Object.prototype.hasOwnProperty.call(o, key);

export function relink(state: RailState, from: string, to: string | null): RailState {
  if (!own(state.next, from) || (to !== null && !own(state.next, to))) throw new Error('悬挂指针：目标站不存在。');
  if (from === 'END') throw new Error('终点哨兵不可修改。');
  return { head: state.head, next: { ...state.next, [from]: to } };
}

export function traverse(state: RailState, head: Station = state.head): { route: Station[]; error: string | null; log: EventLog[] } {
  const route: Station[] = [];
  const log: EventLog[] = [];
  const seen = new Set<string>();
  let node: Station | null = head;
  for (let tick = 0; node !== null && tick < 32; tick++) {
    if (seen.has(node)) return { route, error: `循环发生在 ${node} 站，列车无法抵达终点。`, log };
    if (!own(state.next, node)) return { route, error: `悬挂指针：${node} 站不存在。`, log };
    seen.add(node);
    route.push(node);
    log.push({ tick: tick * 60, kind: 'STATION_VISITED', actor: node, detail: `${node} 站已停靠` });
    node = state.next[node];
  }
  return { route, error: node === null ? null : '执行超过安全步数，已回滚。', log };
}

export function runRail(state: RailState, runId = 'DS-01:observe'): RunResult {
  const result = traverse(state);
  const service = traverse(state, 'B');
  const missing = STATIONS.filter(node => !result.route.includes(node));
  const assertions: Assertion[] = [
    { name: '列车不会陷入循环', passed: result.error === null, detail: result.error ?? '主线遍历正常终止' },
    { name: '每一座车站都被访问', passed: missing.length === 0 && result.route.length === STATIONS.length,
      detail: missing.length ? `被跳过的车站：${missing.join('、')}` : `${result.route.join(' → ')}` },
    { name: 'B 站支线仍能安全抵达终点', passed: service.error === null && service.route.at(-1) === 'END',
      detail: service.error ?? `支线回归：${service.route.join(' → ')}` },
  ];
  const passed = assertions.every(item => item.passed);
  return { runId, route: result.route, passed, assertions, log: result.log,
    reason: passed ? '所有车站恢复可达，主线与支线回归通过。' : assertions.find(item => !item.passed)!.detail };
}

/** Event durations are causal: EXIT completes before the scheduler advances. */
export function runOrder(order: readonly EventAction[], runId = 'Q-01:observe'): RunResult {
  if (order.length !== 3 || new Set(order).size !== 3 || order.some(action => !INITIAL_ORDER.includes(action))) {
    return { runId, passed: false, route: [], log: [], reason: '事件必须各执行一次。',
      assertions: [{ name: '完整事件队列', passed: false, detail: '缺失或重复的事件' }] };
  }
  const log: EventLog[] = [];
  const assertions: Assertion[] = [];
  // Both normal and slow passenger inputs must pass. Animation subscribes to the normal log.
  for (const duration of [120, 240]) {
    let tick = 0;
    let alive = true;
    let evacuated = false;
    let archived = false;
    let deleted = false;
    for (const action of order) {
      if (action === 'EXIT') { tick += duration; evacuated = alive; }
      if (action === 'DELETE') { deleted = true; if (!evacuated) alive = false; tick += 30; }
      if (action === 'ARCHIVE') { archived = evacuated && alive; tick += 15; }
      if (duration === 120) log.push({ tick, kind: action, actor: 'PLATFORM_04',
        detail: action === 'EXIT' ? (evacuated ? '旅客已离开站台' : '旅客坠落，撤离失败') : action === 'DELETE' ? '旧站台已移除' : (archived ? '生还记录已保存' : '没有可保存的生还记录') });
    }
    assertions.push({ name: duration === 120 ? '普通旅客安全撤离' : '行动较慢的旅客也能撤离', passed: alive && evacuated && archived && deleted,
      detail: !alive ? '站台在旅客撤离前被删除。' : !archived ? '归档早于撤离，生还记录丢失。' : `撤离耗时 ${duration / 60} 秒，安全记录完整。` });
  }
  const passed = assertions.every(item => item.passed);
  return { runId, route: [], passed, log, assertions,
    reason: passed ? '两种速度的旅客均安全撤离。维修通道已展开。' : assertions.find(item => !item.passed)!.detail };
}

export type Chapter = 'meet' | 'reorder' | 'rail' | 'board' | 'complete';
export interface Progress {
  version: 6;
  city: 'dock' | 'forge' | 'thread' | 'snow' | 'dune' | 'grove';
  weather: Weather;
  forge: ForgeProgress;
  forgeClearance: ForgeProgress | null;
  thread: ThreadProgress;
  threadClearance: ThreadProgress | null;
  snow: SnowProgress;
  snowClearance: SnowProgress | null;
  dune: DuneProgress;
  duneClearance: DuneProgress | null;
  finalePending: boolean;
  grove: GroveProgress;
  chapter: Chapter;
  elapsed: number;
  attempts: number;
  counterexamples: number;
  order: EventAction[];
  rail: RailState;
  evidence: string[];
}
export const freshProgress = (): Progress => ({ version: 6, city: 'dock', weather: 'rain', forge: freshForge(), forgeClearance:null, thread: freshThread(), threadClearance:null, snow:freshSnow(), snowClearance:null, dune:freshDune(), duneClearance:null, finalePending:false, grove:freshGrove(), chapter: 'meet', elapsed: 0, attempts: 0,
  counterexamples: 0, order: [...INITIAL_ORDER], rail: structuredClone(INITIAL_RAIL), evidence: [] });
export const CHAPTERS: Chapter[] = ['meet', 'reorder', 'rail', 'board', 'complete'];

/** State transitions cannot be triggered by presentation or unchecked save data. */
export class Campaign {
  data: Progress;
  lastRun: RunResult | null = null;
  constructor(progress = freshProgress()) { this.data = structuredClone(progress); }
  meet(): void { if (this.data.chapter === 'meet') this.data.chapter = 'reorder'; }
  observe(id: 'Q-01' | 'DS-01'): void {
    if (!this.data.evidence.includes(id)) this.data.evidence.push(id);
  }
  submitOrder(order: EventAction[]): RunResult {
    if (this.data.chapter !== 'reorder' || !this.data.evidence.includes('Q-01')) throw new Error('先扫描站台，获取事件证据。');
    const result = runOrder(order, `Q-01:${++this.data.attempts}`);
    this.lastRun = result;
    if (result.passed) { this.data.order = [...order]; this.data.chapter = 'rail'; }
    else this.data.counterexamples++;
    return result;
  }
  submitRail(draft: RailState): RunResult {
    if (this.data.chapter !== 'rail' || !this.data.evidence.includes('DS-01')) throw new Error('先扫描高架线路，获取指针证据。');
    if (draft.head !== 'A' || Object.keys(draft.next).length !== 4 || !STATIONS.every(s => own(draft.next, s))) throw new Error('站点快照不完整。');
    for (const value of Object.values(draft.next)) if (value !== null && !STATIONS.includes(value)) throw new Error('悬挂指针：目标站不存在。');
    if (draft.next.END !== null) throw new Error('终点哨兵不可修改。');
    const result = runRail(draft, `DS-01:${++this.data.attempts}`);
    this.lastRun = result;
    if (result.passed) { this.data.rail = structuredClone(draft); this.data.chapter = 'board'; }
    else this.data.counterexamples++;
    return result;
  }
  finish(): boolean {
    if (this.data.chapter !== 'board' || !runRail(this.data.rail).passed || !runOrder(this.data.order).passed) return false;
    this.data.chapter = 'complete';
    return true;
  }
}

const SAVE_KEY = 'reflow-404:v6:campaign';
const SETTINGS_KEY = 'reflow-404:v6:settings';
export interface Settings { sound: boolean; quality: 'high' | 'low'; reducedMotion: boolean; sensitivity: number; best: number | null }
export const defaultSettings = (): Settings => ({ sound: false, quality: 'high', reducedMotion: false, sensitivity: 1, best: null });
export function parseProgress(raw: unknown): Progress | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Progress;
  const forge = parseForge(p.forge);
  const thread = parseThread(p.thread);
  const snow = parseSnow(p.snow);
  const dune = parseDune(p.dune);
  const grove = p.grove===undefined?freshGrove():parseGrove(p.grove);
  const forgeClearance=p.forgeClearance===undefined?(forge?.phase==='complete'?structuredClone(forge):null):p.forgeClearance===null?null:parseForge(p.forgeClearance);
  const threadClearance=p.threadClearance===undefined?(thread?.phase==='complete'?structuredClone(thread):null):p.threadClearance===null?null:parseThread(p.threadClearance);
  const snowClearance=p.snowClearance===undefined?(snow?.phase==='complete'?structuredClone(snow):null):p.snowClearance===null?null:parseSnow(p.snowClearance);
  const duneClearance=p.duneClearance===undefined?(dune?.phase==='complete'?structuredClone(dune):null):p.duneClearance===null?null:parseDune(p.duneClearance);
  const advanced=p.city==='dune'||p.city==='grove'||dune?.phase!=='arrival'||snowClearance!==null;
  if((p.forgeClearance!=null&&!forgeClearance)||(forgeClearance&&forgeClearance.phase!=='complete'))return null;
  if((p.threadClearance!=null&&!threadClearance)||(threadClearance&&threadClearance.phase!=='complete'))return null;
  if((p.snowClearance!=null&&!snowClearance)||(snowClearance&&snowClearance.phase!=='complete'))return null;
  if((p.duneClearance!=null&&!duneClearance)||(duneClearance&&duneClearance.phase!=='complete'))return null;
  if(p.finalePending!==undefined&&(typeof p.finalePending!=='boolean'||(p.finalePending&&(p.city!=='dune'||dune?.phase!=='complete'))))return null;
  if (!forge || !thread || !snow || !dune || !grove || (p.city !== undefined && !['dock','forge','thread','snow','dune','grove'].includes(p.city)) ||
    (p.weather !== undefined && p.weather !== 'rain' && p.weather !== 'clear') ||
    ((advanced || p.city === 'forge' || p.city === 'thread' || p.city === 'snow' || forge.phase !== 'arrival' || forgeClearance!==null || threadClearance!==null || snow.phase!=='arrival') && p.chapter !== 'complete') ||
    ((advanced || p.city === 'thread' || p.city === 'snow' || thread.phase !== 'arrival' || threadClearance!==null || snow.phase!=='arrival') && forge.phase !== 'complete' && !forgeClearance) ||
    ((advanced || p.city === 'snow' || snow.phase!=='arrival') && thread.phase!=='complete' && !threadClearance) ||
    ((p.city==='dune'||p.city==='grove'||dune.phase!=='arrival') && snow.phase!=='complete'&&!snowClearance) ||
    ((p.city==='grove'||grove.phase!=='arrival')&&dune.phase!=='complete'&&!duneClearance)) return null;
  if(dune.audited&&!runDuneAudit(dune,(snow.phase==='complete'?snow:snowClearance!).patches['NET-02']).passed)return null;
  if(duneClearance?.audited&&!runDuneAudit(duneClearance,(snow.phase==='complete'?snow:snowClearance!).patches['NET-02']).passed)return null;
  if(grove.audited&&!runGroveAudit(grove).passed)return null;
  if (p.version !== 6 || !CHAPTERS.includes(p.chapter) || !Number.isFinite(p.elapsed) || p.elapsed < 0 ||
    !Number.isInteger(p.attempts) || p.attempts < 0 || !Number.isInteger(p.counterexamples) || p.counterexamples < 0 ||
    !Array.isArray(p.evidence) || p.evidence.some(e => !['Q-01', 'DS-01'].includes(e)) || !Array.isArray(p.order)) return null;
  if (!p.rail || p.rail.head !== 'A' || !p.rail.next || Object.keys(p.rail.next).length !== 4 ||
    !STATIONS.every(s => own(p.rail.next, s)) || p.rail.next.END !== null ||
    Object.values(p.rail.next).some(value => value !== null && !STATIONS.includes(value))) return null;
  if (p.order.length !== 3 || new Set(p.order).size !== 3 || p.order.some(a => !INITIAL_ORDER.includes(a))) return null;
  if (CHAPTERS.indexOf(p.chapter) >= 2 && (!runOrder(p.order).passed || !p.evidence.includes('Q-01'))) return null;
  if (CHAPTERS.indexOf(p.chapter) >= 3 && (!runRail(p.rail).passed || !p.evidence.includes('DS-01'))) return null;
  // Reconstruct known fields, so prototypes and unrelated data never reach the engine.
  return { version: 6, city: p.city ?? 'dock', weather: p.weather ?? 'rain', forge, forgeClearance, thread, threadClearance, snow, snowClearance, dune, duneClearance, finalePending:p.finalePending??false, grove, chapter: p.chapter, elapsed: p.elapsed, attempts: p.attempts, counterexamples: p.counterexamples,
    order: [...p.order], evidence: [...p.evidence], rail: { head: 'A', next: { ...p.rail.next } } };
}
export function readProgress(): Progress | null {
  try { return parseProgress(JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null')); } catch { return null; }
}
export function saveProgress(progress: Progress): void {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(progress)); } catch { /* private mode: play continues */ }
}
export function readSettings(): Settings {
  const result = defaultSettings();
  try {
    const p = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
    if (typeof p.sound === 'boolean') result.sound = p.sound;
    if (p.quality === 'low' || p.quality === 'high') result.quality = p.quality;
    if (typeof p.reducedMotion === 'boolean') result.reducedMotion = p.reducedMotion;
    if (Number.isFinite(p.sensitivity)) result.sensitivity = Math.min(2, Math.max(0.3, p.sensitivity));
    if (Number.isFinite(p.best) && p.best > 0) result.best = p.best;
  } catch { /* defaults */ }
  return result;
}
export function saveSettings(settings: Settings): void {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* optional persistence */ }
}

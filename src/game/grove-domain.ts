import type {Assertion,EventLog,RunResult} from './domain';
import {runDuneAudit,type DuneProgress} from './dune-domain';
import type {ReliablePatch} from './snow-domain';
export const GROVE_MAIN=['SY-01','SY-02','SY-03','SY-04'] as const;
export type GroveCase=typeof GROVE_MAIN[number];
export type GrovePhase='arrival'|'version'|'dock'|'tide'|'safety'|'audit'|'delivery'|'complete';
export type Destination='old'|'new'|'hold';
export type GroveClue='old-letter'|'receiver-output'|'old-marker'|'new-marker'|'lan-testimony'|'low-gauge'|'high-gauge'|'signal-original';
export const GROVE_REQUIRED:Record<GroveCase,readonly GroveClue[]>={'SY-01':['old-letter','receiver-output'],'SY-02':['old-marker','new-marker','lan-testimony'],'SY-03':['low-gauge','high-gauge'],'SY-04':['signal-original']};
export interface GrovePatches {
 'SY-01':SyntaxPolicy;
 'SY-02':{namespace:'strip'|'preserve';ambiguous:'default'|'hold';replay:'duplicate'|'replace'|'stable'};
 'SY-03':{scale:number;offset:number;limit:number;missing:'assume'|'hold'};
 'SY-04':{rules:{known:'send'|'hold';unknown:'send'|'hold';extension:'send'|'hold'};retain:boolean;confirm:boolean};
}
export interface GroveProgress {phase:GrovePhase;tide:'low'|'high';evidence:GroveCase[];clues:GroveClue[];completed:GroveCase[];patches:GrovePatches;halted:boolean;audited:boolean;ferryBoarded:boolean;delivered:boolean}
export interface GroveRun extends RunResult {traces:{name:string;log:EventLog[]}[]}
const phases:GrovePhase[]=['arrival','version','dock','tide','safety','audit','delivery','complete'];
const defaults=():GrovePatches=>({'SY-01':{parser:'legacy-first',missing:'default',future:'downgrade'},'SY-02':{namespace:'strip',ambiguous:'default',replay:'duplicate'},'SY-03':{scale:1,offset:0,limit:1.6,missing:'assume'},'SY-04':{rules:{known:'send',unknown:'send',extension:'hold'},retain:false,confirm:false}});
export const freshGrove=():GroveProgress=>({phase:'arrival',tide:'low',evidence:[],clues:[],completed:[],patches:defaults(),halted:false,audited:false,ferryBoarded:false,delivered:false});
const ev=(tick:number,kind:string,detail:string):EventLog=>({tick,kind,actor:'汐 / KITE',detail});
const assertion=(name:string,passed:boolean,detail:string):Assertion=>({name,passed,detail});
export type SyntaxRecord={version?:string;note?:string;pickup?:string};
export type SyntaxRule='legacy-first'|'versioned';
export type SyntaxPolicy={parser:SyntaxRule;missing:'default'|'hold';future:'downgrade'|'hold'};
export function evaluateSyntaxRecord(record:SyntaxRecord,rule:SyntaxRule|SyntaxPolicy):GroveRun{
 const policy:SyntaxPolicy=typeof rule==='string'?{parser:rule,missing:'hold',future:'hold'}:rule;
 const raw=JSON.stringify(record),events:EventLog[]=[ev(0,'RECEIVED',`r43 原信 ${raw}`)];
 if(policy.parser==='legacy-first'&&record.version==='v2'&&record.pickup){
  events.push(ev(1,'PARSE_NOTE',`旧解析器先读取 note=${record.note??'∅'}，把它当集合地点`));
  events.push(ev(2,'DROP_PICKUP',`新版 pickup=${record.pickup??'∅'} 被当作普通附注丢弃`));
  events.push(ev(3,'DISPATCH_WRONG_POINT','救援驶向旧 B-07；新版 HIGH-07 的求助者仍在等待'));
  return report('SY-01:parser',[{name:'新版字段不得被旧备注覆盖',ok:false,detail:'错误从 DROP_PICKUP 开始：pickup 被丢弃，旧 note 却决定了集合地点。',events}]);
 }
 const version=record.version;
 const unknown=version!==undefined&&version!=='v1'&&version!=='v2',missing=!version||version==='v1'&&!record.note||version==='v2'&&!record.pickup;
 if(unknown||missing){
  const held=unknown?policy.future==='hold':policy.missing==='hold';
  events.push(ev(1,held?'HOLD_FOR_REVIEW':'UNSAFE_FALLBACK',held?`版本 ${version??'缺失'} 或必需地点字段无法安全解释；保留原文等待人工核对`:`版本 ${version??'缺失'} 或必需字段不明，却沿用旧地点 ${record.note??'B-07'} 自动派发`));
  return report('SY-01:parser',[{name:'含糊报文必须停下求证',ok:held,detail:held?'没有猜填集合地点；原文仍可核对。':'错误回退：无法解释的报文被猜作旧地址并自动派发。',events}]);
 }
 const field=version==='v1'?'note':'pickup',value=record[field]!;
 events.push(ev(1,'SELECT_SCHEMA',`按 ${version} 选择${version==='v1'?'旧版':'新版'}字段 ${field}`));
 events.push(ev(2,'PARSE_LOCATION',`${field}=${value}；保留另一字段但不让它覆盖集合地点`));
 const expected=version==='v1'?'B-07':'HIGH-07',ok=value===expected;
 events.push(ev(3,ok?'DISPATCH_VERIFIED':'HOLD_FOR_REVIEW',ok?`已解释为 ${value}`:`地点 ${value} 与 ${version} 原始约束冲突；停止自动派发`));
 return report('SY-01:parser',[{name:'按报文版本解释集合地点',ok,detail:ok?`${version} 使用 ${field}，目的地 ${value}`:`${version} 的 ${field} 不能解释为安全地点`,events}]);
}
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const one=(v:unknown,list:readonly string[])=>typeof v==='string'&&list.includes(v);
function validPatch<K extends GroveCase>(id:K,p:unknown):p is GrovePatches[K]{
 if(!record(p))return false;
 if(id==='SY-01')return one(p.parser,['legacy-first','versioned'])&&one(p.missing,['default','hold'])&&one(p.future,['downgrade','hold']);
 if(id==='SY-02')return one(p.namespace,['strip','preserve'])&&one(p.ambiguous,['default','hold'])&&one(p.replay,['duplicate','replace','stable']);
 if(id==='SY-03')return typeof p.scale==='number'&&[.001,.01,1,100].includes(p.scale)&&typeof p.offset==='number'&&Number.isFinite(p.offset)&&p.offset>=0&&p.offset<=1.4&&Math.abs(p.offset*10-Math.round(p.offset*10))<1e-8&&typeof p.limit==='number'&&Number.isFinite(p.limit)&&p.limit>=1&&p.limit<=2.2&&Math.abs(p.limit*10-Math.round(p.limit*10))<1e-8&&one(p.missing,['assume','hold']);
 if(id==='SY-04')return record(p.rules)&&one(p.rules.known,['send','hold'])&&one(p.rules.unknown,['send','hold'])&&one(p.rules.extension,['send','hold'])&&typeof p.retain==='boolean'&&typeof p.confirm==='boolean';return false;
}
function report(id:string,cases:{name:string;ok:boolean;detail:string;events:EventLog[]}[]):GroveRun{const failed=cases.find(c=>!c.ok);return {runId:id,passed:!failed,route:[],log:(failed??cases[0])?.events??[],assertions:cases.map(c=>assertion(c.name,c.ok,c.detail)),traces:cases.map(c=>({name:c.name,log:c.events})),reason:failed?.detail??'原文、译文与实际航线在全部情景一致。'};}
export function evaluateGrove<K extends GroveCase>(id:K,patch:GrovePatches[K]):GroveRun{
 if(!validPatch(id,patch))return report(`${id}:invalid`,[{name:'规则格式',ok:false,detail:'接线、坐标或校准数值无效',events:[ev(0,'INVALID','规则无法用于渡口')]}]);
 if(id==='SY-01'){const p=patch as GrovePatches['SY-01'];const fixtures:[string,SyntaxRecord][]=[['旧版完整报文',{version:'v1',note:'B-07'}],['新版字段与旧备注冲突',{version:'v2',note:'B-07',pickup:'HIGH-07'}],['版本缺失须求证',{note:'B-07'}],['新版地点缺失须求证',{version:'v2',note:'B-07'}],['未知未来版本须求证',{version:'v9',pickup:'HIGH-07'}]];return report(id,fixtures.map(([name,input])=>{const run=evaluateSyntaxRecord(input,p);return {name,ok:run.passed,detail:run.reason,events:run.log};}));}
 if(id==='SY-02'){const p=patch as GrovePatches['SY-02'];const fixtures:[string,Destination,string][]=[['old/B-07','old','旧港标识保留原位置'],['new/B-07','new','新版完整地址到阿澜所在高台'],['plain/B-07','hold','短码缺命名空间须求证']];const cases=fixtures.map(([key,expected,name])=>{const actual:Destination=key==='plain/B-07'?(p.ambiguous==='hold'?'hold':'old'):key==='new/B-07'&&p.namespace==='preserve'?'new':'old';const collision=key==='new/B-07'&&p.namespace==='strip';return {name,ok:actual===expected,detail:collision?'命名空间 new 被剥掉，与旧 B-07 碰撞；新版求助者仍在高台等待。':`${key}：解析为 ${actual}；${name}`,events:[ev(0,'MAP_INPUT',`${key} 进入地址解析器`),ev(1,collision?'COLLISION':p.namespace==='preserve'?'KEEP_NAMESPACE':'STRIP_NAMESPACE',collision?'new/B-07 被折叠成 B-07':`命名空间策略 ${p.namespace}`),ev(2,actual==='hold'?'HOLD_FOR_REVIEW':'ROUTE',`解析结果 ${actual}`)]};});cases.push({name:'重复来信仍只对应一座码头',ok:p.replay==='stable',detail:`重复广播策略=${p.replay}；重复报文不能生成新实体或覆盖旧实体。`,events:[ev(0,'REPLAY','new/B-07 连续收到两次'),ev(1,'PIER_COUNT',p.replay==='stable'?'仍是一座新码头':'生成重名或覆盖旧码头')]});return report(id,cases);}
 if(id==='SY-03'){const p=patch as GrovePatches['SY-03'];const fixtures=[{name:'低潮可通行',raw:180,expected:'send'},{name:'高潮淹没低台',raw:240,expected:'hold'},{name:'临界水位也停船',raw:230,expected:'hold'}] as const;const cases:{name:string;ok:boolean;detail:string;events:EventLog[]}[]=fixtures.map(f=>{const actual=Math.round((f.raw*p.scale-p.offset)*100)/100,decision=actual<p.limit?'send':'hold';return {name:f.name,ok:decision===f.expected&&Math.abs(actual-(f.raw*.01-.7))<.001&&Math.abs(p.limit-1.6)<.001,detail:`传感器${f.raw}cm → ${actual}m；安全线1.6m；实际${decision}`,events:[ev(0,'GAUGE',`${f.raw}cm / 本地零点+0.7m`),ev(1,'NORMALIZE',`${actual}m / 共享基准`),ev(2,'TIDE_DECISION',decision)]};});cases.push({name:'读数缺单位先停船',ok:p.missing==='hold',detail:`未知单位时=${p.missing}`,events:[ev(0,'GAUGE','只发出 240，单位缺失'),ev(1,'TIDE_DECISION',p.missing==='hold'?'暂停求证':'猜测后放行')]});return report(id,cases);}
 const p=patch as GrovePatches['SY-04'];const fixtures=[{key:'known',expect:'send',name:'已知安全标记继续救援'},{key:'unknown',expect:'hold',name:'未知关键标记必须停船'},{key:'extension',expect:'send',name:'普通扩展字段不阻断救援'}] as const;const cases:{name:string;ok:boolean;detail:string;events:EventLog[]}[]=fixtures.map(f=>({name:f.name,ok:p.rules[f.key]===f.expect,detail:`${f.key} 实际=${p.rules[f.key]}`,events:[ev(0,'SIGNAL',`${f.key} 字段出现`),ev(1,p.rules[f.key]==='hold'?'STOP_BOAT':'DISPATCH',`${p.rules[f.key]} / ${f.name}`)]}));cases.push({name:'留下原信供两人复核',ok:p.retain,detail:`原文保留=${p.retain}`,events:[ev(0,'COMPARE',p.retain?'原文与译文并列':'原信被覆盖')]});cases.push({name:'汐确认后才解除拦船',ok:p.confirm,detail:`人工确认=${p.confirm}`,events:[ev(0,'HANDOFF',p.confirm?'汐核对高栈桥':'送达灯直接启动船')]});return report(id,cases);
}
export function runGroveAudit(s:GroveProgress,dune?:DuneProgress,network?:ReliablePatch):GroveRun{const runs=GROVE_MAIN.map(id=>evaluateGrove(id,s.patches[id] as never)),assertions=runs.map((r,i)=>assertion(GROVE_MAIN[i],s.completed.includes(GROVE_MAIN[i])&&r.passed,r.reason));if(dune&&network){const prior=runDuneAudit(dune,network);assertions.unshift(assertion('第四城求救信与第五城持久投递',prior.passed,prior.reason));}const failed=assertions.find(a=>!a.passed);return {runId:'SY:AUDIT',passed:!failed,route:[],assertions,traces:runs.flatMap(r=>r.traces),log:runs.find(r=>!r.passed)?.log??runs.at(-1)?.log??[],reason:failed?.detail??'送达链与四份译文重放通过，两条航迹收束至阿澜所在高栈桥。'};}
export function parseGrove(raw:unknown):GroveProgress|null{if(!record(raw)||!one(raw.phase,phases)||!one(raw.tide,['low','high'])||!Array.isArray(raw.evidence)||!Array.isArray(raw.clues)||!Array.isArray(raw.completed)||!record(raw.patches)||['halted','audited','ferryBoarded','delivered'].some(k=>typeof raw[k]!=='boolean'))return null;const s=raw as unknown as GroveProgress,index=phases.indexOf(s.phase);if(s.evidence.some((x,i)=>!GROVE_MAIN.includes(x)||s.evidence.indexOf(x)!==i)||s.clues.some((x,i)=>!Object.values(GROVE_REQUIRED).flat().includes(x)||s.clues.indexOf(x)!==i)||s.completed.some((x,i)=>x!==GROVE_MAIN[i]||!s.evidence.includes(x)))return null;for(const id of GROVE_MAIN)if(!validPatch(id,s.patches[id]))return null;if(s.completed.some(id=>!GROVE_REQUIRED[id].every(c=>s.clues.includes(c))||!evaluateGrove(id,s.patches[id] as never).passed))return null;if(index===0&&(s.clues.length||s.evidence.length||s.completed.length)||index>=5&&s.completed.length!==4||index>=1&&index<=4&&s.completed.length!==index-1)return null;if(s.halted&&index<4||s.completed.includes('SY-04')&&!s.halted||s.audited!==(index>=6)||s.ferryBoarded&&index<6||s.delivered!==(index===7)||s.delivered&&!s.ferryBoarded)return null;if(s.audited&&!runGroveAudit(s).passed)return null;return structuredClone(s);}
export class GroveCampaign{constructor(public data:GroveProgress){}meet(){if(this.data.phase!=='arrival')return false;this.data.phase='version';return true;}collect(clue:GroveClue){const id=GROVE_MAIN.find(id=>GROVE_REQUIRED[id].includes(clue));if(!id||this.data.phase==='arrival'||GROVE_MAIN.indexOf(id)!==this.data.completed.length||clue==='low-gauge'&&this.data.tide!=='low'||clue==='high-gauge'&&this.data.tide!=='high')return false;if(!this.data.clues.includes(clue))this.data.clues.push(clue);if(!this.data.evidence.includes(id))this.data.evidence.push(id);return true;}haltBoat(){if(this.data.phase!=='safety'||!this.data.clues.includes('signal-original'))return false;this.data.halted=true;return true;}preview<K extends GroveCase>(id:K,patch:GrovePatches[K]){return evaluateGrove(id,patch);}submit<K extends GroveCase>(id:K,patch:GrovePatches[K]){const index=GROVE_MAIN.indexOf(id);if(index!==this.data.completed.length||this.data.phase!==phases[index+1]||!GROVE_REQUIRED[id].every(c=>this.data.clues.includes(c))||id==='SY-04'&&!this.data.halted)throw Error('现场证据尚未齐备；末站还必须先拦下危险的船');const result=this.preview(id,patch);if(result.passed){this.data.patches[id]=structuredClone(patch) as never;this.data.completed.push(id);this.data.phase=phases[index+2];}return result;}audit(dune?:DuneProgress,network?:ReliablePatch){if(this.data.phase!=='audit')throw Error('四份译文尚未齐备');const result=runGroveAudit(this.data,dune,network);if(result.passed){this.data.audited=true;this.data.phase='delivery';}return result;}boardFerry(){if(this.data.phase!=='delivery'||!this.data.audited)return false;this.data.ferryBoarded=true;return true;}finish(){if(this.data.phase!=='delivery'||!this.data.audited||!this.data.ferryBoarded)return false;this.data.delivered=true;this.data.phase='complete';return true;}}

import type { Assertion, EventLog, RunResult } from './domain';

export const MIRROR_CASES = ['MEM-01', 'MEM-02', 'MEM-03'] as const;
export type MirrorCase = typeof MIRROR_CASES[number];
export type MirrorPhase = 'arrival' | 'cache' | 'isolation' | 'replica' | 'audit' | 'complete';
export interface MirrorPatches {
  'MEM-01': { mode: 'ttl' | 'invalidate'; version: boolean };
  'MEM-02': { isolation: 'snapshot' | 'serializable'; constraint: boolean };
  'MEM-03': { quorum: 1 | 2 | 3; epoch: boolean };
}
export interface MirrorProgress {
  phase: MirrorPhase;
  evidence: MirrorCase[];
  completed: MirrorCase[];
  patches: MirrorPatches;
  audited: boolean;
}
export const freshMirror = (): MirrorProgress => ({ phase: 'arrival', evidence: [], completed: [], audited: false, patches: {
  'MEM-01': { mode: 'ttl', version: false },
  'MEM-02': { isolation: 'snapshot', constraint: false },
  'MEM-03': { quorum: 1, epoch: false },
} });
export interface MirrorRun extends RunResult { traces: { name: string; log: EventLog[] }[] }
const event = (tick:number, kind:string, actor:string, detail:string):EventLog => ({tick,kind,actor,detail});
function result(id:MirrorCase, traces:MirrorRun['traces'], assertions:Assertion[], runId:string):MirrorRun {
  const failed=assertions.find(a=>!a.passed);
  return {runId,passed:!failed,route:[],log:traces.find(t=>t.name===failed?.name)?.log??traces[0].log,traces,assertions,
    reason:failed?.detail??`${id} 的所有执行情景通过。`};
}

function runCache(p:MirrorPatches['MEM-01'], runId:string):MirrorRun {
  const traces:MirrorRun['traces']=[], assertions:Assertion[]=[];
  for(const delayed of [false,true]) {
    const name=delayed?'乱序失效':'正常失效', log:EventLog[]=[];
    let source=1, cached=1, expiry=10, clock=0;
    log.push(event(clock++,'CACHE_FILL','MIRA','镜像版本 1 已加载'));
    source=2;log.push(event(clock++,'SOURCE_WRITE','MIRA','原件更新为版本 2'));
    if(!delayed&&p.mode==='invalidate'){cached=0;log.push(event(clock++,'INVALIDATE','CACHE','旧镜像失效'));}
    if(delayed){source=3;log.push(event(clock++,'SOURCE_WRITE','MIRA','原件再次更新为版本 3'));if(p.mode==='invalidate')cached=0;}
    if(p.mode==='ttl'&&clock>=expiry)cached=0;
    const read=cached||source;if(!cached)cached=source;
    log.push(event(clock++,'READ','VISITOR',`读到版本 ${read}，原件版本 ${source}，TTL 到 ${expiry}`));
    if(delayed&&p.mode==='invalidate'){
      if(!p.version){cached=1;log.push(event(clock++,'LATE_INVALIDATION','CACHE','旧失效消息让过期副本复活'));}
      else log.push(event(clock++,'LATE_INVALIDATION_IGNORED','CACHE','消息版本低于已知原件版本，丢弃'));
    }
    const finalRead=cached||source;
    log.push(event(clock,'FINAL_READ','VISITOR',`最终读到版本 ${finalRead}，原件版本 ${source}`));
    traces.push({name,log});assertions.push({name,passed:read===source&&finalRead===source,detail:`${name}：访客读到版本 ${finalRead}，原件是版本 ${source}。`});
  }
  return result('MEM-01',traces,assertions,runId);
}
function runIsolation(p:MirrorPatches['MEM-02'],runId:string):MirrorRun {
  const traces:MirrorRun['traces']=[],assertions:Assertion[]=[];
  for(const initial of [2,3]) {
    const name=initial===2?'双人值守':'三人值守',log:EventLog[]=[];
    let onDuty=initial;
    log.push(event(0,'SNAPSHOT','WARD',`${initial} 位医生读取同一份排班快照`));
    const requests=initial===2?2:3;
    for(let i=0;i<requests;i++){
      const canLeave=p.isolation==='serializable'||p.constraint?onDuty>1:initial>1;
      if(canLeave){onDuty--;log.push(event(i+1,'LEAVE',`DOCTOR-${i+1}`,`当前值守 ${onDuty}`));}
      else log.push(event(i+1,'ABORT',`DOCTOR-${i+1}`,'序列化检测到排班冲突'));
    }
    const safe=onDuty>=1;
    const constraintHeld=!p.constraint||safe;
    log.push(event(5,'CHECK','WARD',constraintHeld&&safe?'病房有人值守':'最后一人也离开了'));
    traces.push({name,log});assertions.push({name,passed:safe&&constraintHeld,detail:`${name}：剩余 ${onDuty} 人，必须至少保留 1 人。`});
  }
  return result('MEM-02',traces,assertions,runId);
}
function runReplica(p:MirrorPatches['MEM-03'],runId:string):MirrorRun {
  const traces:MirrorRun['traces']=[],assertions:Assertion[]=[];
  for(const scenario of ['普通故障','旧主归来','网络分区']){
    const delayed=scenario==='旧主归来',partition=scenario==='网络分区';
    const name=scenario,log:EventLog[]=[];
    const votes=partition?1:delayed?2:3, elected=p.quorum<=votes;
    const epoch=elected?2:1;
    log.push(event(0,'FAILURE','PRIMARY','主副本失联'));
    log.push(event(1,elected?'ELECT':'NO_QUORUM','REPLICAS',`${votes} 票可用，要求 ${p.quorum} 票`));
    let value=partition?elected?1:2:elected?2:1;
    if(partition)log.push(event(2,elected?'SPLIT_BRAIN':'REJECT_MINORITY','ISOLATED_REPLICA',elected?'孤立副本自称新主，与多数派冲突':'孤立副本票数不足，不得改写多数派版本 2'));
    if(delayed&&elected){
      if(!p.epoch){value=1;log.push(event(2,'STALE_WRITE','OLD_PRIMARY','旧主用纪元 1 覆盖新版'));
      }else log.push(event(2,'FENCED','OLD_PRIMARY',`旧主纪元 1 低于 ${epoch}，写入被拒绝`));
    }
    const passed=partition?!elected&&value===2:elected&&value===2;
    log.push(event(3,'READ','VISITOR',`最终版本 ${value}`));
    traces.push({name,log});assertions.push({name,passed,detail:`${name}：${elected?'已选出新主':'票数不足'}，最终版本 ${value}${partition&&elected?'；发生双主冲突':''}。`});
  }
  return result('MEM-03',traces,assertions,runId);
}
export function runMirrorCase<K extends MirrorCase>(id:K,patch:MirrorPatches[K],runId=`${id}:preview`):MirrorRun {
  if(id==='MEM-01')return runCache(patch as MirrorPatches['MEM-01'],runId);
  if(id==='MEM-02')return runIsolation(patch as MirrorPatches['MEM-02'],runId);
  return runReplica(patch as MirrorPatches['MEM-03'],runId);
}
const phases:MirrorPhase[]=['arrival','cache','isolation','replica','audit','complete'];
function validPatch(id:MirrorCase,p:unknown):boolean {
  if(!p||typeof p!=='object'||Array.isArray(p))return false;
  const v=p as Record<string,unknown>;
  if(id==='MEM-01')return Object.keys(v).length===2&&['ttl','invalidate'].includes(String(v.mode))&&typeof v.version==='boolean';
  if(id==='MEM-02')return Object.keys(v).length===2&&['snapshot','serializable'].includes(String(v.isolation))&&typeof v.constraint==='boolean';
  return Object.keys(v).length===2&&[1,2,3].includes(v.quorum as number)&&typeof v.epoch==='boolean';
}
export function parseMirror(raw:unknown):MirrorProgress|null {
  if(raw===undefined)return freshMirror();
  if(!raw||typeof raw!=='object')return null;
  const p=raw as MirrorProgress;
  if(!phases.includes(p.phase)||!Array.isArray(p.evidence)||!Array.isArray(p.completed)||typeof p.audited!=='boolean'||!p.patches)return null;
  if(new Set(p.evidence).size!==p.evidence.length||new Set(p.completed).size!==p.completed.length||
     p.evidence.some(id=>!MIRROR_CASES.includes(id))||p.completed.some(id=>!MIRROR_CASES.includes(id)||!p.evidence.includes(id)))return null;
  if(MIRROR_CASES.some(id=>!validPatch(id,p.patches[id])))return null;
  const count=p.completed.filter(id=>MIRROR_CASES.includes(id)).length;
  if(p.completed.some((id,i)=>id!==MIRROR_CASES[i])||p.evidence.some((id,i)=>id!==MIRROR_CASES[i]))return null;
  if(p.evidence.length>Math.min(3,count+1))return null;
  if(p.completed.some(id=>!runMirrorCase(id,p.patches[id]).passed))return null;
  const expected=phases.indexOf(p.phase);
  if(expected===0&&p.evidence.length||expected>0&&expected<4&&count!==expected-1||expected>=4&&count!==3)return null;
  if(p.audited!==(expected===5)||expected===5&&!MIRROR_CASES.every(id=>runMirrorCase(id,p.patches[id]).passed))return null;
  return {phase:p.phase,evidence:[...p.evidence],completed:[...p.completed],audited:p.audited,patches:structuredClone(p.patches)};
}
export class MirrorCampaign {
  data:MirrorProgress;
  constructor(progress=freshMirror()){this.data=structuredClone(progress);}
  meet(){if(this.data.phase==='arrival')this.data.phase='cache';}
  observe(id:MirrorCase){if(this.data.phase!==phases[this.data.completed.length+1]||id!==MIRROR_CASES[this.data.completed.length])throw new Error('先到当前开放的镜像终端。');if(!this.data.evidence.includes(id))this.data.evidence.push(id);}
  submit<K extends MirrorCase>(id:K,patch:MirrorPatches[K],runId=`${id}:verify`):MirrorRun {
    if(this.data.phase!==phases[this.data.completed.length+1]||id!==MIRROR_CASES[this.data.completed.length]||!this.data.evidence.includes(id)||!validPatch(id,patch))throw new Error('先扫描当前设备并提交完整方案。');
    const run=runMirrorCase(id,patch,runId);
    if(run.passed){this.data.patches[id]=structuredClone(patch) as MirrorPatches[K] & MirrorPatches[MirrorCase];this.data.completed.push(id);this.data.phase=phases[this.data.completed.length+1];}
    return run;
  }
  audit():boolean {if(this.data.phase!=='audit')return false;return MIRROR_CASES.every(id=>runMirrorCase(id,this.data.patches[id]).passed);}
  finish():boolean {if(!this.audit())return false;this.data.audited=true;this.data.phase='complete';return true;}
}

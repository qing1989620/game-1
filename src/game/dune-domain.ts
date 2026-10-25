import type { Assertion, EventLog, RunResult } from './domain';
import { evaluateSnow, type ReliablePatch } from './snow-domain';

export const DUNE_MAIN=['DB-01','DB-02','DB-03','DB-04','DB-05','DB-06'] as const;
export const DUNE_SIDE=['DB-S1','DB-S2','DB-S3','DB-S4'] as const;
export const DUNE_CASES=[...DUNE_MAIN,...DUNE_SIDE] as const;
export type DuneCase=typeof DUNE_CASES[number];
export const DUNE_PHASES=['arrival','stock','billing','snapshot','recovery','migration','outbox','audit','rehearsal','descent','complete'] as const;
export type DunePhase=typeof DUNE_PHASES[number];
export const DUNE_WEATHERS=['sun','haze','storm'] as const;
export type DuneWeather=typeof DUNE_WEATHERS[number];
export const DUNE_WEATHER_NAMES:Record<DuneWeather,string>={sun:'烈日',haze:'扬沙',storm:'沙尘暴'};
export const DUNE_BURIED:readonly DuneCase[]=['DB-S1','DB-S3','DB-S4'];
export interface StockPatch {mode:'blind'|'conditional'|'cas';guard:boolean;retry:boolean}
export interface BillingPatch {key:'none'|'payload'|'request';unique:boolean;replay:boolean;fingerprint:boolean}
export interface SnapshotPatch {isolation:'dirty'|'committed'|'snapshot';boundary:'query'|'transaction';source:'mixed'|'pinned'}
export interface RecoveryPatch {flush:'lazy'|'before-ack';replay:'all'|'committed';lsn:boolean}
export interface MigrationPatch {layout:'drop-first'|'expand';paging:'offset'|'keyset';dualWrite:boolean;contractGate:boolean}
export interface OutboxPatch {transport:'direct'|'outbox';retry:boolean;consumerDedup:boolean;ack:'before'|'after'}
export interface CachePatch {strategy:'ttl'|'version-key'|'generation-fence';afterWrite:boolean;negativeTTL:number}
export interface PoolPatch {finally:boolean;cancel:boolean;concurrency:number}
export interface ImportPatch {key:'name'|'number'|'external';upsert:boolean;atomicBatch:boolean;versionGuard:boolean}
export interface MetricsPatch {aggregate:'mean'|'average-p99'|'histogram';includeErrors:boolean;scope:'global'|'route'}
export interface ReleasePatch {canary:number;monitor:'http'|'invariants';rollback:boolean}
export interface DunePatches {'DB-01':StockPatch;'DB-02':BillingPatch;'DB-03':SnapshotPatch;'DB-04':RecoveryPatch;'DB-05':MigrationPatch;'DB-06':OutboxPatch;'DB-S1':CachePatch;'DB-S2':PoolPatch;'DB-S3':ImportPatch;'DB-S4':MetricsPatch}
export interface DuneProgress {phase:DunePhase;weather:DuneWeather;evidence:DuneCase[];completed:DuneCase[];patches:DunePatches;audited:boolean;rehearsed:boolean;release:ReleasePatch}
export interface DuneRun extends RunResult {traces:{name:string;log:EventLog[]}[];metrics:Record<string,number>}
export const freshDune=():DuneProgress=>({phase:'arrival',weather:'sun',evidence:[],completed:[],audited:false,rehearsed:false,release:{canary:100,monitor:'http',rollback:false},patches:{
  'DB-01':{mode:'blind',guard:false,retry:false},'DB-02':{key:'payload',unique:false,replay:false,fingerprint:false},
  'DB-03':{isolation:'committed',boundary:'query',source:'mixed'},'DB-04':{flush:'lazy',replay:'all',lsn:false},
  'DB-05':{layout:'drop-first',paging:'offset',dualWrite:false,contractGate:false},'DB-06':{transport:'direct',retry:false,consumerDedup:false,ack:'before'},
  'DB-S1':{strategy:'ttl',afterWrite:false,negativeTTL:30},'DB-S2':{finally:false,cancel:false,concurrency:6},
  'DB-S3':{key:'number',upsert:false,atomicBatch:false,versionGuard:false},'DB-S4':{aggregate:'mean',includeErrors:false,scope:'global'},
}});
const ev=(tick:number,kind:string,actor:string,detail:string):EventLog=>({tick,kind,actor,detail});
const assertion=(name:string,passed:boolean,detail:string):Assertion=>({name,passed,detail});
function report(runId:string,assertions:Assertion[],traces:DuneRun['traces'],metrics:Record<string,number>,success:string):DuneRun {
  const failed=assertions.find(a=>!a.passed),sample=traces.find(t=>t.name===failed?.name)??traces[0];
  return {runId,passed:!failed,assertions,traces,metrics,log:sample?.log??[],route:[],reason:failed?.detail??success};
}

/** Exhaustive reachable states of bounded read/write workers, not a SQL engine. */
export function exploreStock(p:StockPatch,stock:number,workers:number){
  type Worker={pc:number;seen:number;version:number;retries:number;sold:boolean};
  type State={remaining:number;version:number;workers:Worker[];log:EventLog[]};
  const queue:State[]=[{remaining:stock,version:0,workers:Array.from({length:workers},()=>({pc:0,seen:0,version:0,retries:0,sold:false})),log:[]}],seen=new Set<string>();
  let finals=0,bad:State|null=null,sample:State|null=null;
  for(let cursor=0;cursor<queue.length;cursor++){
    const s=queue[cursor],key=JSON.stringify([s.remaining,s.version,s.workers]);if(seen.has(key))continue;seen.add(key);
    if(seen.size>20000)return {passed:false,states:seen.size,finals,log:[ev(0,'BOUND_EXCEEDED','SEARCH','可达状态超过安全边界，拒绝证明')],remaining:s.remaining,sold:0};
    if(s.workers.every(w=>w.pc===2)){
      finals++;sample??=s;const count=s.workers.filter(w=>w.sold).length;
      if(count>stock||s.remaining<0||s.remaining!==stock-count||count!==Math.min(stock,workers))bad??=s;
      continue;
    }
    s.workers.forEach((worker,i)=>{
      if(worker.pc===2)return;const n=structuredClone(s),w=n.workers[i];let kind='READ_STOCK',detail='';
      if(w.pc===0){w.seen=s.remaining;w.version=s.version;w.pc=1;detail=`读 remaining=${w.seen}, version=${w.version}`;}
      else if(p.mode==='cas'&&w.version!==n.version){
        if(p.retry&&w.retries<3){w.pc=0;w.retries++;kind='CAS_RETRY';detail='版本冲突，重新读取并重试整个片段';}
        else{w.pc=2;kind='CONFLICT_DROPPED';detail='版本冲突后直接结束，尚有库存也不再尝试';}
      }else{
        w.pc=2;
        if(p.guard&&n.remaining<=0){kind='OUT_OF_STOCK';detail='写入条件不成立，不生成订单';}
        else{n.remaining=p.mode==='blind'?w.seen-1:n.remaining-1;n.version++;w.sold=true;kind='ORDER_COMMITTED';detail=`订单与扣减一起提交；remaining=${n.remaining}, version=${n.version}`;}
      }
      n.log.push(ev(n.log.length,kind,`T${i+1}`,detail));queue.push(n);
    });
  }
  const result=bad??sample!;return {passed:!bad,states:seen.size,finals,log:result.log,remaining:result.remaining,sold:result.workers.filter(w=>w.sold).length};
}
export function runStock(p:StockPatch,id='DB-01:preview'):DuneRun{
  const runs=[{stock:1,workers:2},{stock:2,workers:3},{stock:0,workers:2}].map(f=>({...f,name:`库存${f.stock} / ${f.workers}个事务`,...exploreStock(p,f.stock,f.workers)}));
  return report(id,runs.map(r=>assertion(r.name,r.passed,`可达状态${r.states}；终态${r.finals}；样例售出${r.sold}，余量${r.remaining}。要求无超卖、账实一致且可用库存不闲置。`)),runs, {states:runs.reduce((n,r)=>n+r.states,0)},'所有已枚举交错均不超卖，订单与库存一致，可用库存得到服务。');
}

export function runBilling(p:BillingPatch,id='DB-02:preview'):DuneRun{
  const requests=[{id:'r-7',body:'water:1'},{id:'r-7',body:'water:1'},{id:'r-8',body:'water:1'},{id:'r-7',body:'water:9'}];
  const records=new Map<string,{body:string;receipt:string}>(),charges:string[]=[],responses:string[]=[],log:EventLog[]=[];
  for(const [i,r] of requests.entries()){
    const key=p.key==='none'?`copy-${i}`:p.key==='payload'?r.body:r.id;
    // First two callers both passed the application precheck before either committed.
    const existing=i===1&&!p.unique?undefined:records.get(key);
    if(existing){
      const response=p.fingerprint&&existing.body!==r.body?'409':p.replay?existing.receipt:'NO_RESULT';responses.push(response);
      log.push(ev(i,response==='409'?'PAYLOAD_CONFLICT':'IDEMPOTENT_REPLAY',r.id,`${response}；已有${existing.body}，本次${r.body}`));
    }else{
      const receipt=`receipt-${charges.length+1}`;charges.push(r.id);records.set(key,{body:r.body,receipt});responses.push(receipt);
      log.push(ev(i,'BILL_AND_KEY_COMMIT',r.id,`${receipt}；本关假定幂等记录和业务写入在同一事务提交`));
    }
  }
  const checks=[assertion('同请求并发只记一笔',charges.filter(x=>x==='r-7').length===1,`r-7记账${charges.filter(x=>x==='r-7').length}次`),
    assertion('内容相同的独立请求都保留',charges.filter(x=>x==='r-8').length===1,`r-8记账${charges.filter(x=>x==='r-8').length}次`),
    assertion('重试取得原结果',responses[1]===responses[0],`首次${responses[0]} / 重试${responses[1]}`),assertion('同键不同载荷拒绝',responses[3]==='409',`载荷变化返回${responses[3]}，要求409`)];
  return report(id,checks,checks.map(c=>({name:c.name,log})),{charges:charges.length},'请求ID的唯一约束、事务内业务写入、原结果重放与载荷冲突校验共同通过。');
}

export function runSnapshot(p:SnapshotPatch,id='DB-03:preview'):DuneRun{
  const whole=p.isolation==='snapshot'&&p.boundary==='transaction',pinned=p.source==='pinned';
  const pairs=[{name:'两条SELECT之间发生转账',a:100,b:whole?100:140},{name:'尚未提交的转账随后回滚',a:p.isolation==='dirty'?60:100,b:100},{name:'两份副本处于不同版本',a:60,b:pinned?140:100}];
  return report(id,pairs.map(r=>assertion(r.name,r.a+r.b===200,`source=${r.a}, target=${r.b}，合计${r.a+r.b}/200；本关读取由两条SELECT组成`)),
    pairs.map(r=>({name:r.name,log:[ev(0,'SELECT_SOURCE','READER',`source=${r.a}`),ev(1,'CONCURRENT_WRITER','WRITER','转账或回滚在两次读取之间发生'),ev(2,'SELECT_TARGET','READER',`target=${r.b}`)]})),{},'两条SELECT共享事务快照，并固定同一数据源；视图内部约束保持一致。');
}

export const WAL_RECORDS=[{lsn:1,tx:'A',kind:'DATA',delta:40},{lsn:2,tx:'A',kind:'COMMIT',delta:0},{lsn:3,tx:'B',kind:'DATA',delta:9},{lsn:4,tx:'B',kind:'COMMIT',delta:0},{lsn:5,tx:'C',kind:'DATA',delta:99}] as const;
export function recoverWAL(p:RecoveryPatch,cut:number,checkpoint:number,twice:boolean){
  const durable=cut-(p.flush==='lazy'?Math.min(2,cut):0),records=WAL_RECORDS.filter(r=>r.lsn<=durable),committed=new Set<string>(records.filter(r=>r.kind==='COMMIT').map(r=>r.tx));
  let value=checkpoint?40:0,pageLSN=checkpoint,uncommittedApplied=0;const log:EventLog[]=[];
  for(let pass=0;pass<(twice?2:1);pass++)for(const r of records){
    if(r.kind!=='DATA')continue;
    const apply=(p.replay==='all'||committed.has(r.tx))&&(!p.lsn||r.lsn>pageLSN);
    if(apply){value+=r.delta;pageLSN=r.lsn;if(!committed.has(r.tx))uncommittedApplied++;}
    log.push(ev(log.length,apply?'REDO_APPLIED':'REDO_SKIPPED',r.tx,`LSN${r.lsn}；${committed.has(r.tx)?'有提交标记':'未提交'}；value=${value}, pageLSN=${pageLSN}`));
  }
  const expected=(cut>=2?40:0)+(cut>=4?9:0),lostAcknowledged=WAL_RECORDS.filter(r=>r.kind==='COMMIT'&&r.lsn<=cut&&!committed.has(r.tx)).length;return {value,expected,log,durable,uncommittedApplied,lostAcknowledged};
}
export function runRecovery(p:RecoveryPatch,id='DB-04:preview'):DuneRun{
  const runs=[{name:'确认后立刻断电',cut:2,cp:0,twice:false},{name:'尾部留下未提交记录',cut:5,cp:0,twice:false},{name:'旧检查点与重复重放',cut:5,cp:2,twice:true}].map(f=>({...f,...recoverWAL(p,f.cut,f.cp,f.twice)}));
  return report(id,runs.map(r=>assertion(r.name,r.value===r.expected&&r.uncommittedApplied===0&&r.lostAcknowledged===0,`已确认真值${r.expected}；恢复值${r.value}；磁盘WAL到LSN${r.durable}；未提交应用${r.uncommittedApplied}；丢失已确认提交${r.lostAcknowledged}`)),runs,{},'成功确认前刷盘，仅重放已提交事务，并用pageLSN跳过已应用日志。');
}

export function simulateMigration(p:MigrationPatch){
  const rows=Array.from({length:5},(_,i)=>({id:i+1,old:`city-${i+1}`,next:null as string|null}));let cursor=0;const log:EventLog[]=[];
  const oldClientOK=p.layout==='expand'&&p.contractGate;
  for(let page=0;page<5;page++){
    const batch=p.paging==='offset'?rows.slice(cursor,cursor+2):rows.filter(r=>r.id>cursor).slice(0,2);if(!batch.length)break;
    for(const row of batch){row.next=row.old;log.push(ev(log.length,'BACKFILL_ROW',String(row.id),`next=${row.next}`));}
    cursor=p.paging==='offset'?cursor+batch.length:batch.at(-1)!.id;
    if(page===0){rows.splice(0,1);const row=rows.find(r=>r.id===2)!;row.old='oasis-v2';if(p.dualWrite)row.next=row.old;rows.push({id:6,old:'city-6',next:p.dualWrite?'city-6':null});log.push(ev(log.length,'LIVE_WRITE_AND_DELETE','CLIENT','删除id1，更新已回填id2，并插入id6；旧客户端仍在运行'));}
  }
  return {rows,oldClientOK,log,complete:rows.every(r=>r.next!==null),consistent:rows.every(r=>r.next===r.old)};
}
export function runMigration(p:MigrationPatch,id='DB-05:preview'):DuneRun{
  const r=simulateMigration(p),checks=[assertion('旧客户端继续工作',r.oldClientOK,'扩展后双字段并存；所有旧客户端退出且核验完成，才允许收缩'),assertion('删除不让分页漏行',r.complete,`回填${r.rows.filter(x=>x.next!==null).length}/${r.rows.length}行`),assertion('回填期间写入不丢失',r.consistent,r.rows.filter(x=>x.old!==x.next).map(x=>`id${x.id}: old=${x.old},new=${x.next}`).join('；')||'所有存活行的新旧字段一致')];
  return report(id,checks,checks.map(c=>({name:c.name,log:r.log})),{rows:r.rows.length},'扩展→主键游标回填→持续双写→核验并等待旧客户端退出→收缩。');
}

export function runOutbox(p:OutboxPatch,id='DB-06:preview'):DuneRun{
  const scenarios=[{name:'数据库提交后进程崩溃',copies:p.transport==='outbox'&&p.retry?1:0,ack:p.transport==='outbox'&&p.retry},
    {name:'消息已发出但确认丢失',copies:p.retry?2:1,ack:p.retry},{name:'消费者确认后才崩溃',copies:p.ack==='after'&&p.retry?1:0,ack:p.ack==='after'&&p.retry}];
  const runs=scenarios.map(s=>{const effects=p.consumerDedup?Math.min(1,s.copies):s.copies;return {...s,effects,log:[ev(0,'ORDER_COMMIT','DATABASE',p.transport==='outbox'?'订单与outbox记录在同一事务提交':'订单提交，通知仍是另一个系统的写入'),ev(1,'CRASH_WINDOW','RELAY',s.name),ev(2,'DELIVERY_RESULT','CONSUMER',`${s.copies}副本，${effects}次业务，${s.ack?'完成确认':'未完成确认'}`)]};});
  return report(id,runs.map(r=>assertion(r.name,r.effects===1&&r.ack,`${r.copies}副本；业务${r.effects}/1次；${r.ack?'已确认':'未确认'}`)),runs,{},'同事务outbox、可重试投递、消费端事件去重与提交后确认共同通过。');
}

export function runCache(p:CachePatch,id='DB-S1:preview'):DuneRun{
  let epoch=7;if(!p.afterWrite)epoch++;const fillToken=epoch;if(p.afterWrite)epoch++;
  const oldFillAllowed=p.strategy!=='generation-fence'||fillToken===epoch;
  const value=p.strategy==='version-key'||!oldFillAllowed?8:7;
  const checks=[assertion('慢回填不能覆盖新值',value===8,`数据库v8；读到v${value}；慢查询带token=${fillToken},当前=${epoch}`),assertion('新建记录不被旧404遮住',p.negativeTTL<=5,`负缓存${p.negativeTTL}秒；第6秒必须看见新记录`)];
  const log=[ev(0,'SLOW_READ','CACHE','慢查询读到v7，尚未回填'),ev(1,'DATABASE_UPDATE','DB','数据提交为v8'),ev(2,oldFillAllowed?'OLD_FILL_ACCEPTED':'OLD_FILL_REJECTED','CACHE',`使用${p.strategy}；最终可见v${value}`)];
  return report(id,checks,checks.map(c=>({name:c.name,log})),{},'版本化键或正确失效后的代次栅栏阻止旧回填；负缓存保留短有效期。');
}

export function simulatePool(p:PoolPatch){
  const jobs=[2,7,2,7,2,2].map((duration,i)=>({duration,left:duration,state:'pending',age:0,response:false,writes:0,error:i===2}));
  let leased=0,peak=0,rejected=0,late=0,finishedAt=0;const log:EventLog[]=[];
  for(let tick=0;tick<22;tick++){
    let running=jobs.filter(j=>j.state==='active').length;
    for(let i=0;i<jobs.length&&running<p.concurrency;i++){const j=jobs[i];if(j.state!=='pending')continue;if(leased>=3){rejected++;break;}j.state='active';leased++;running++;peak=Math.max(peak,leased);log.push(ev(tick,'ACQUIRE',`job${i}`,`连接${leased}/3`));}
    jobs.forEach((j,i)=>{
      if(j.state!=='active')return;j.age++;j.left--;
      if(j.age===3&&j.left>0){j.response=true;if(p.cancel){j.left=0;j.state='done';if(p.finally)leased--;log.push(ev(tick,'CANCEL_QUERY',`job${i}`,`超时传播到查询；finally${p.finally?'释放':'未释放'}连接`));}}
      if(j.left<=0&&j.state==='active'){j.state='done';if(!j.error){j.writes++;if(j.response)late++;}if(p.finally||!j.error&&!j.response)leased--;log.push(ev(tick,j.error?'QUERY_ERROR':'QUERY_END',`job${i}`,`连接剩余${leased}`));}
    });
    if(jobs.every(j=>j.state==='done')){finishedAt=tick+1;break;}
  }
  return {leased,peak,rejected,late,finishedAt,done:jobs.filter(j=>j.state==='done').length,log};
}
export function runPool(p:PoolPatch,id='DB-S2:preview'):DuneRun{
  const r=simulatePool(p),checks=[assertion('所有路径归还连接',r.done===6&&r.leased===0,`完成${r.done}/6；仍占用${r.leased}连接`),assertion('超时之后没有幽灵写入',r.late===0,`响应超时后继续写入${r.late}次`),assertion('并发与排队都在预算内',r.rejected===0&&r.finishedAt>0&&r.finishedAt<=12,`连接拒绝${r.rejected}次；完成耗时${r.finishedAt}/12周期`)];
  return report(id,checks,checks.map(c=>({name:c.name,log:r.log})),{elapsed:r.finishedAt,leased:r.leased},'finally归还、取消传播与有界并发让六个请求在预算内收尾。');
}

export function runImport(p:ImportPatch,id='DB-S3:preview'):DuneRun{
  const rows=[{id:'001',name:'MIRA',v:1,city:'north'},{id:'1',name:'MIRA',v:1,city:'south'},{id:'001',name:'MIRA',v:3,city:'east'},{id:'002',name:'IRIS',v:2,city:'west'},{id:'001',name:'MIRA',v:2,city:'stale'}];
  const stored:typeof rows=[],log:EventLog[]=[];
  const key=(r:typeof rows[number])=>p.key==='name'?r.name:p.key==='number'?String(Number(r.id)):r.id;
  for(const row of rows){const index=stored.findIndex(r=>key(r)===key(row));if(p.upsert&&index>=0){if(!p.versionGuard||row.v>stored[index].v)stored[index]={...row};}else stored.push({...row});log.push(ev(log.length,'IMPORT_ROW',row.id,`v${row.v}；当前${stored.length}行`));}
  const identity=stored.length===3&&stored.some(r=>r.id==='001')&&stored.some(r=>r.id==='1')&&stored.some(r=>r.id==='002');
  const latest=stored.find(r=>r.id==='001')?.city==='east';
  const badBatch=[{id:'003',name:'NOOR',v:1,city:'dune'},{id:'',name:'INVALID',v:1,city:'dune'}];
  const valid=(r:typeof rows[number])=>r.id.length>0&&r.name.length>0&&r.v>0;
  const inserted:typeof rows=[];
  if(!p.atomicBatch||badBatch.every(valid))for(const r of badBatch){if(!valid(r)){log.push(ev(log.length,'BATCH_REJECTED','IMPORT','非法主键；此前写入是否已经可见，取决于是否在完整批次事务中'));break;}inserted.push({...r});}
  const partial=inserted.length;
  const checks=[assertion('外部主键不能数值化',identity,`有效行${stored.length}/3；001与1必须是两个人，同名也不能合并`),assertion('重放不重复且旧版本不覆盖',latest,`001当前city=${stored.find(r=>r.id==='001')?.city}，要求east/v3`),assertion('坏批次不留下半份导入',partial===0,`一好一坏的批次留下${partial}行；要求先校验整批并原子提交`)];
  return report(id,checks,checks.map(c=>({name:c.name,log})),{rows:stored.length},'保留外部字符串ID、按主键upsert、版本守卫及整批校验/事务通过。');
}

export const METRIC_BUCKETS=[25,100,500,1500,3000] as const;
export const nearestRank=(values:readonly number[],q:number):number=>!values.length||!Number.isFinite(q)||q<0||q>1?NaN:[...values].sort((a,b)=>a-b)[Math.max(0,Math.ceil(values.length*q)-1)];
export function mergedBucketP99(values:readonly number[]):number{
  if(!values.length)return NaN;
  const rank=Math.ceil(values.length*.99);return METRIC_BUCKETS.find(upper=>values.filter(v=>v<=upper).length>=rank)??Infinity;
}
export function runMetrics(p:MetricsPatch,id='DB-S4:preview'):DuneRun{
  const health=Array.from({length:1000},()=>10),a=[...Array.from({length:95},()=>20),...Array.from({length:5},()=>1200)],b=[...Array.from({length:6},()=>25),...(p.includeErrors?[2500,2500,2500,2500]:[])];
  const groups=p.scope==='route'?[a,b]:[health,a,b],values=groups.flat();
  const measured=p.aggregate==='mean'?values.reduce((n,v)=>n+v,0)/values.length:p.aggregate==='average-p99'?groups.reduce((n,g)=>n+mergedBucketP99(g),0)/groups.length:mergedBucketP99(values);
  const expected=METRIC_BUCKETS.find(upper=>upper>=nearestRank([...a,25,25,25,25,25,25,2500,2500,2500,2500],.99))!;
  const checks=[assertion('按路由发现预约尾延迟',p.scope==='route'&&measured>500,`预约观测${measured.toFixed(1)}ms；阈值500ms，不能被大量health请求稀释`),assertion('桶计数合并包含失败请求',measured===expected,`观测所在桶${measured.toFixed(1)}ms；全样本p99所在桶${expected}ms；桶边界近似，不冒充精确分位数`)];
  const log=[ev(0,'INSTANCE_A','METRICS',`100请求，节点p99所在桶${mergedBucketP99(a)}ms`),ev(1,'INSTANCE_B','METRICS',`${b.length}请求，${p.includeErrors?'包含':'丢弃'}4个超时`),ev(2,'AGGREGATE','DASHBOARD',`${p.aggregate} / ${p.scope} = ${measured.toFixed(1)}ms`)];
  return report(id,checks,checks.map(c=>({name:c.name,log})),{p99:measured},'按路由合并直方图桶计数，纳入超时错误，尾延迟得以被看见。');
}

const one=(v:unknown,choices:readonly unknown[])=>choices.includes(v);
const integer=(v:unknown,min:number,max:number)=>Number.isInteger(v)&&(v as number)>=min&&(v as number)<=max;
export function parseDunePatch<K extends DuneCase>(id:K,raw:unknown):DunePatches[K]|null{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;const p=raw as Record<string,unknown>;let clean:unknown=null;
  if(id==='DB-01'&&one(p.mode,['blind','conditional','cas'])&&[p.guard,p.retry].every(v=>typeof v==='boolean'))clean={mode:p.mode,guard:p.guard,retry:p.retry};
  if(id==='DB-02'&&one(p.key,['none','payload','request'])&&[p.unique,p.replay,p.fingerprint].every(v=>typeof v==='boolean'))clean={key:p.key,unique:p.unique,replay:p.replay,fingerprint:p.fingerprint};
  if(id==='DB-03'&&one(p.isolation,['dirty','committed','snapshot'])&&one(p.boundary,['query','transaction'])&&one(p.source,['mixed','pinned']))clean={isolation:p.isolation,boundary:p.boundary,source:p.source};
  if(id==='DB-04'&&one(p.flush,['lazy','before-ack'])&&one(p.replay,['all','committed'])&&typeof p.lsn==='boolean')clean={flush:p.flush,replay:p.replay,lsn:p.lsn};
  if(id==='DB-05'&&one(p.layout,['drop-first','expand'])&&one(p.paging,['offset','keyset'])&&[p.dualWrite,p.contractGate].every(v=>typeof v==='boolean'))clean={layout:p.layout,paging:p.paging,dualWrite:p.dualWrite,contractGate:p.contractGate};
  if(id==='DB-06'&&one(p.transport,['direct','outbox'])&&one(p.ack,['before','after'])&&[p.retry,p.consumerDedup].every(v=>typeof v==='boolean'))clean={transport:p.transport,ack:p.ack,retry:p.retry,consumerDedup:p.consumerDedup};
  if(id==='DB-S1'&&one(p.strategy,['ttl','version-key','generation-fence'])&&typeof p.afterWrite==='boolean'&&integer(p.negativeTTL,0,60))clean={strategy:p.strategy,afterWrite:p.afterWrite,negativeTTL:p.negativeTTL};
  if(id==='DB-S2'&&[p.finally,p.cancel].every(v=>typeof v==='boolean')&&integer(p.concurrency,1,8))clean={finally:p.finally,cancel:p.cancel,concurrency:p.concurrency};
  if(id==='DB-S3'&&one(p.key,['name','number','external'])&&[p.upsert,p.atomicBatch,p.versionGuard].every(v=>typeof v==='boolean'))clean={key:p.key,upsert:p.upsert,atomicBatch:p.atomicBatch,versionGuard:p.versionGuard};
  if(id==='DB-S4'&&one(p.aggregate,['mean','average-p99','histogram'])&&typeof p.includeErrors==='boolean'&&one(p.scope,['global','route']))clean={aggregate:p.aggregate,includeErrors:p.includeErrors,scope:p.scope};
  return clean as DunePatches[K]|null;
}
export function evaluateDune<K extends DuneCase>(id:K,raw:DunePatches[K],runId=`${id}:preview`):DuneRun{
  const p=parseDunePatch(id,raw);if(!p)return report(runId,[assertion('参数结构',false,'类型或范围非法；未提交')],[],{},'');
  switch(id){case 'DB-01':return runStock(p as StockPatch,runId);case 'DB-02':return runBilling(p as BillingPatch,runId);case 'DB-03':return runSnapshot(p as SnapshotPatch,runId);case 'DB-04':return runRecovery(p as RecoveryPatch,runId);case 'DB-05':return runMigration(p as MigrationPatch,runId);case 'DB-06':return runOutbox(p as OutboxPatch,runId);case 'DB-S1':return runCache(p as CachePatch,runId);case 'DB-S2':return runPool(p as PoolPatch,runId);case 'DB-S3':return runImport(p as ImportPatch,runId);case 'DB-S4':return runMetrics(p as MetricsPatch,runId);}throw new Error('未知档案设备');
}
const sidePrerequisite:Partial<Record<DuneCase,DuneCase>>={'DB-S1':'DB-02','DB-S2':'DB-03','DB-S3':'DB-04','DB-S4':'DB-05'};
export function duneUnlocked(s:DuneProgress,id:DuneCase):boolean{return s.completed.includes(id)||!!sidePrerequisite[id]&&s.completed.includes(sidePrerequisite[id]!)||DUNE_MAIN[DUNE_PHASES.indexOf(s.phase)-1]===id;}
export function runDuneAudit(s:DuneProgress,network:ReliablePatch,id='CITY-05:audit'):DuneRun{
  const runs=DUNE_MAIN.map(key=>({name:key,run:evaluateDune(key,s.patches[key],`${id}/${key}`)}));
  const net=evaluateSnow('NET-02',network,`${id}/CITY-04/NET-02`);
  return report(id,[...runs.map(r=>assertion(r.name,s.completed.includes(r.name)&&s.evidence.includes(r.name)&&r.run.passed,r.run.reason)),assertion('第四城可靠消息回归',net.passed,net.reason)],
    [...runs.map(r=>({name:r.name,log:r.run.log})),{name:'第四城可靠消息回归',log:net.log}],{systems:7},'六个数据系统与第四城的消息策略共同通过。下一步用故障版本演练灰度回滚。');
}
export function parseRelease(raw:unknown):ReleasePatch|null{if(!raw||typeof raw!=='object')return null;const p=raw as ReleasePatch;return integer(p.canary,1,100)&&one(p.monitor,['http','invariants'])&&typeof p.rollback==='boolean'?{canary:p.canary,monitor:p.monitor,rollback:p.rollback}:null;}
export function runRehearsal(p:ReleasePatch,s:DuneProgress,id='CANARY:preview'):DuneRun{
  // r42 deliberately reintroduces the concrete DB-06 dual-write defect. r43 uses committed patches.
  const bad=runOutbox({...s.patches['DB-06'],transport:'direct'});
  const latencies=[...Array.from({length:95},()=>20),...Array.from({length:5},()=>bad.passed?40:1800)],p99=nearestRank(latencies,.99);
  const detected=p.monitor==='invariants'&&(!bad.passed||p99>500),rolledBack=detected&&p.rollback;
  const checks=[assertion('控制故障爆炸半径',p.canary<=10,`r42接收${p.canary}%试验流量；要求≤10%`),assertion('200不代表业务完整',detected,`r42业务回归${bad.passed?'通过':'失败'}；${detected?'监控发现数据库/通知不一致':'只看HTTP，故障没有被看见'}`),assertion('故障自动回滚',rolledBack,rolledBack?'r42流量回到0%，r41继续服务':'坏版本仍然留在流量路径中')];
  const log=[ev(0,'CANARY_START','r42',`${p.canary}%流量；旧版r41保持服务`),...bad.log,ev(7,'TAIL_LATENCY','MONITOR',`100个灰度样本：p99=${p99}ms，HTTP仍为200；${p.monitor==='invariants'?'纳入业务与尾部':'仅观察HTTP状态'}`),ev(8,rolledBack?'ROLLBACK_CONFIRMED':'BAD_RELEASE_RETAINED','RELEASE',rolledBack?'已恢复r41；禁止把坏版本推广':'演练尚未通过')];
  return report(id,checks,checks.map(c=>({name:c.name,log})),{traffic:p.canary,p99},'坏版本被识别并自动回滚。已提交的修复r43才获得正式切换资格。');
}
export class DuneCampaign{
  constructor(public data:DuneProgress){}
  meet():void{if(this.data.phase==='arrival')this.data.phase='stock';}
  observe(id:DuneCase,lens=false):boolean{if(!duneUnlocked(this.data,id)||DUNE_BURIED.includes(id)&&!this.data.evidence.includes(id)&&!(this.data.weather==='storm'&&lens))return false;if(!this.data.evidence.includes(id))this.data.evidence.push(id);return true;}
  preview<K extends DuneCase>(id:K,patch:DunePatches[K],runId?:string):DuneRun{if(!duneUnlocked(this.data,id)||!this.data.evidence.includes(id))throw new Error('先靠近已开放设备扫描证据；沙下档案需沙尘暴与G偏振镜。');return evaluateDune(id,patch,runId);}
  submit<K extends DuneCase>(id:K,patch:DunePatches[K],runId?:string):DuneRun{const r=this.preview(id,patch,runId);if(!r.passed)return r;this.data.patches[id]=structuredClone(parseDunePatch(id,patch)!);if(!this.data.completed.includes(id)){this.data.completed.push(id);if(DUNE_MAIN.includes(id as typeof DUNE_MAIN[number]))this.data.phase=DUNE_PHASES[DUNE_PHASES.indexOf(this.data.phase)+1];}return r;}
  audit(network:ReliablePatch,runId?:string):DuneRun{if(this.data.phase!=='audit')throw new Error('先完成六条主线');const r=runDuneAudit(this.data,network,runId);if(r.passed){this.data.audited=true;this.data.phase='rehearsal';this.data.weather='storm';}return r;}
  rehearse(patch:ReleasePatch,network:ReliablePatch,runId?:string):DuneRun{if(this.data.phase!=='rehearsal'||this.data.weather!=='storm'||!this.data.audited||!runDuneAudit(this.data,network).passed)throw new Error('先完成综合回归，并在沙尘暴中演练');const p=parseRelease(patch);if(!p)throw new Error('灰度参数无效');const r=runRehearsal(p,this.data,runId);if(r.passed){this.data.release=p;this.data.rehearsed=true;this.data.phase='descent';}return r;}
  finish(network:ReliablePatch):boolean{if(!['descent','complete'].includes(this.data.phase)||this.data.phase==='descent'&&this.data.weather!=='storm'||!this.data.audited||!this.data.rehearsed||!runRehearsal(this.data.release,this.data).passed||!runDuneAudit(this.data,network).passed)return false;this.data.phase='complete';return true;}
}
export function parseDune(raw:unknown):DuneProgress|null{
  if(raw===undefined)return freshDune();if(!raw||typeof raw!=='object')return null;const s=raw as DuneProgress;
  if(!DUNE_PHASES.includes(s.phase)||!DUNE_WEATHERS.includes(s.weather)||typeof s.audited!=='boolean'||typeof s.rehearsed!=='boolean'||!s.patches||typeof s.patches!=='object')return null;
  for(const list of [s.evidence,s.completed])if(!Array.isArray(list)||new Set(list).size!==list.length||list.some(id=>!DUNE_CASES.includes(id)))return null;
  const patches=freshDune().patches;for(const id of DUNE_CASES){const p=parseDunePatch(id,s.patches[id]);if(!p)return null;Object.assign(patches,{[id]:p});}
  const release=parseRelease(s.release),stage=DUNE_PHASES.indexOf(s.phase),required=Math.min(6,Math.max(0,stage-1));if(!release||s.audited!==(stage>=8)||s.rehearsed!==(stage>=9)||stage>=8&&stage<10&&s.weather!=='storm')return null;
  const clean:DuneProgress={phase:s.phase,weather:s.weather,audited:s.audited,rehearsed:s.rehearsed,release,patches,evidence:[...s.evidence],completed:[...s.completed]};
  if(DUNE_MAIN.some((id,i)=>clean.completed.includes(id)!==(i<required)))return null;
  for(const id of clean.evidence)if(!duneUnlocked(clean,id)&&!clean.completed.includes(id))return null;
  for(const id of clean.completed)if(!clean.evidence.includes(id)||!evaluateDune(id,patches[id]).passed||sidePrerequisite[id]&&!clean.completed.includes(sidePrerequisite[id]!))return null;
  if(clean.rehearsed&&!runRehearsal(clean.release,clean).passed)return null;return clean;
}

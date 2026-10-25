import {describe,it,expect} from 'vitest';
import {DuneCampaign,DUNE_CASES,DUNE_MAIN,DUNE_SIDE,freshDune,evaluateDune,exploreStock,runStock,runBilling,runSnapshot,runRecovery,recoverWAL,runMigration,runOutbox,runCache,runPool,runImport,runMetrics,nearestRank,mergedBucketP99,parseDune,parseDunePatch,parseRelease,runDuneAudit,runRehearsal,type DunePatches} from '../src/game/dune-domain';
import {duneForces,duneSurfaces,DUNE_START,DUNE_AUDIT,DUNE_CORE,DUNE_POS,DUNE_BOUNDS} from '../src/game/dune-layout';
import {Box3,Vector3} from 'three';
import {followCameraPosition} from '../src/game/camera-collision';
import {Motor,floorAt,STILL_AIR} from '../src/game/physics';
import {Campaign,parseProgress,relink} from '../src/game/domain';
import {ThreadCampaign,freshThread,type ThreadPatches} from '../src/game/thread-domain';
import {SnowCampaign,freshSnow,SNOW_MAIN,type SnowPatches} from '../src/game/snow-domain';
export const good:DunePatches={
 'DB-01':{mode:'conditional',guard:true,retry:true},'DB-02':{key:'request',unique:true,replay:true,fingerprint:true},
 'DB-03':{isolation:'snapshot',boundary:'transaction',source:'pinned'},'DB-04':{flush:'before-ack',replay:'committed',lsn:true},
 'DB-05':{layout:'expand',paging:'keyset',dualWrite:true,contractGate:true},'DB-06':{transport:'outbox',retry:true,consumerDedup:true,ack:'after'},
 'DB-S1':{strategy:'generation-fence',afterWrite:true,negativeTTL:3},'DB-S2':{finally:true,cancel:true,concurrency:2},
 'DB-S3':{key:'external',upsert:true,atomicBatch:true,versionGuard:true},'DB-S4':{aggregate:'histogram',includeErrors:true,scope:'route'},
};
const network={retry:true,key:'session' as const,ackDuplicates:true};
function completeMain(){const c=new DuneCampaign(freshDune());c.meet();for(const id of DUNE_MAIN){c.observe(id,true);expect(c.submit(id,good[id]).passed,id).toBe(true);}return c;}
describe('desert production incident models',()=>{
 it.each(DUNE_CASES)('%s default reproduces a concrete failure',id=>expect(evaluateDune(id,freshDune().patches[id]).passed).toBe(false));
 it.each(DUNE_CASES)('%s reference policy passes its actual constraints',id=>expect(evaluateDune(id,good[id]).passed).toBe(true));
 it('enumerates the stock-two lost update instead of only checking oversell',()=>{const r=exploreStock({mode:'blind',guard:true,retry:true},2,3);expect(r.passed).toBe(false);expect(r.log.some(e=>e.kind==='ORDER_COMMITTED')).toBe(true);expect(r.states).toBeGreaterThan(20);});
 it('CAS retry is a valid alternative and rechecks inventory',()=>{expect(runStock({mode:'cas',guard:true,retry:true}).passed).toBe(true);expect(runStock({mode:'cas',guard:true,retry:false}).passed).toBe(false);});
 it('atomic subtraction without a predicate can produce negative inventory',()=>expect(runStock({mode:'conditional',guard:false,retry:true}).passed).toBe(false));
 it.each(['unique','replay','fingerprint'] as const)('billing needs %s under a separate counterexample',key=>expect(runBilling({...good['DB-02'],[key]:false}).passed).toBe(false));
 it('identical payloads cannot identify independent requests',()=>expect(runBilling({...good['DB-02'],key:'payload'}).passed).toBe(false));
 it.each([{boundary:'query'},{isolation:'committed'},{source:'mixed'}] as const)('partial snapshot patch fails %j',patch=>expect(runSnapshot({...good['DB-03'],...patch}).passed).toBe(false));
 it.each([{flush:'lazy'},{replay:'all'},{lsn:false}] as const)('partial WAL fix fails %j',patch=>expect(runRecovery({...good['DB-04'],...patch}).passed).toBe(false));
 it('recovery ignores C without COMMIT and remains49 after two passes',()=>{const r=recoverWAL(good['DB-04'],5,2,true);expect(r.value).toBe(49);expect(r.log.filter(e=>e.actor==='C').every(e=>e.kind==='REDO_SKIPPED')).toBe(true);});
 it.each([{layout:'drop-first'},{paging:'offset'},{dualWrite:false},{contractGate:false}] as const)('online migration rejects %j',patch=>expect(runMigration({...good['DB-05'],...patch}).passed).toBe(false));
 it.each([{transport:'direct'},{retry:false},{consumerDedup:false},{ack:'before'}] as const)('outbox crash window remains under %j',patch=>expect(runOutbox({...good['DB-06'],...patch}).passed).toBe(false));
 it('versioned cache keys are accepted without requiring explicit invalidation',()=>expect(runCache({strategy:'version-key',afterWrite:false,negativeTTL:5}).passed).toBe(true));
 it('a generation fence before the write still admits stale refill',()=>expect(runCache({...good['DB-S1'],afterWrite:false}).passed).toBe(false));
 it('a long negative cache can conceal a newly created record',()=>expect(runCache({...good['DB-S1'],negativeTTL:30}).passed).toBe(false));
 it.each([{finally:false},{cancel:false},{concurrency:1},{concurrency:6}])('pool rejects %j',patch=>expect(runPool({...good['DB-S2'],...patch}).passed).toBe(false));
 it('concurrency three is also accepted by measured pool budgets',()=>expect(runPool({...good['DB-S2'],concurrency:3}).passed).toBe(true));
 it.each([{key:'number'},{key:'name'},{upsert:false},{atomicBatch:false},{versionGuard:false}] as const)('import rejects %j',patch=>expect(runImport({...good['DB-S3'],...patch}).passed).toBe(false));
 it('nearest-rank and merged buckets use counts rather than average quantiles',()=>{expect(nearestRank([4,1,3,2],.75)).toBe(3);expect(mergedBucketP99([20,20,2500])).toBe(3000);expect(runMetrics(good['DB-S4']).metrics.p99).toBe(3000);});
 it('absence of observations is not reported as a zero-latency success',()=>{expect(Number.isNaN(nearestRank([],.99))).toBe(true);expect(Number.isNaN(mergedBucketP99([]))).toBe(true);});
 it.each([{aggregate:'mean'},{aggregate:'average-p99'},{includeErrors:false},{scope:'global'}] as const)('observability rejects %j',patch=>expect(runMetrics({...good['DB-S4'],...patch}).passed).toBe(false));
});
describe('desert authority, rollback rehearsal and save validation',()=>{
 it('requires stage and evidence; previews and failures do not commit',()=>{const c=new DuneCampaign(freshDune());expect(c.observe('DB-01')).toBe(false);c.meet();expect(()=>c.submit('DB-01',good['DB-01'])).toThrow();c.observe('DB-01');const old=structuredClone(c.data);c.preview('DB-01',good['DB-01']);c.submit('DB-01',freshDune().patches['DB-01']);expect(c.data).toEqual(old);});
 it('six systems plus the fourth-city network must re-execute before rehearsal',()=>{const c=completeMain();expect(runDuneAudit(c.data,network).metrics.systems).toBe(7);expect(c.audit({...network,retry:false}).passed).toBe(false);expect(c.data.phase).toBe('audit');expect(c.audit(network).passed).toBe(true);expect(c.data.weather).toBe('storm');});
 it.each([{canary:100},{monitor:'http'},{rollback:false}] as const)('a bad canary cannot earn clearance under %j',patch=>{const c=completeMain();expect(runRehearsal({canary:5,monitor:'invariants',rollback:true,...patch},c.data).passed).toBe(false);});
 it('the actual broken direct writer is identified and rollback is required before descent',()=>{const c=completeMain();c.audit(network);expect(c.finish(network)).toBe(false);expect(c.rehearse({canary:5,monitor:'invariants',rollback:true},network).passed).toBe(true);expect(c.data.phase).toBe('descent');expect(c.finish(network)).toBe(true);c.data.weather='sun';expect(c.finish(network)).toBe(true);expect(parseDune(c.data)).toEqual(c.data);});
 it('descent and rehearsal require storm independently of UI',()=>{const c=completeMain();c.audit(network);c.data.weather='sun';expect(()=>c.rehearse({canary:5,monitor:'invariants',rollback:true},network)).toThrow();expect(parseDune(c.data)).toBeNull();});
 it('buried evidence needs storm plus polarizer only on first acquisition',()=>{const c=completeMain();expect(c.observe('DB-S1',true)).toBe(false);c.data.weather='storm';expect(c.observe('DB-S1')).toBe(false);expect(c.observe('DB-S1',true)).toBe(true);c.data.weather='sun';expect(c.observe('DB-S1')).toBe(true);});
 it('all four optional stories remain available after ending',()=>{const c=completeMain();c.audit(network);c.rehearse({canary:5,monitor:'invariants',rollback:true},network);c.finish(network);for(const id of DUNE_SIDE){c.observe(id,true);expect(c.submit(id,good[id]).passed).toBe(true);}expect(c.data.completed).toHaveLength(10);expect(c.data.phase).toBe('complete');expect(parseDune(c.data)).toEqual(c.data);});
 it('rejects fake completions, duplicate evidence and invalid parameter coercion',()=>{expect(parseDune({...freshDune(),phase:'complete',audited:true,rehearsed:true})).toBeNull();const c=completeMain();c.data.evidence.push('DB-01');expect(parseDune(c.data)).toBeNull();expect(parseDunePatch('DB-01',{...good['DB-01'],guard:'true'})).toBeNull();expect(parseRelease({canary:NaN,monitor:'invariants',rollback:true})).toBeNull();});
 it('audit does not trust a saved completion label after a policy becomes bad',()=>{const c=completeMain();c.data.patches['DB-06'].transport='direct';expect(c.audit(network).passed).toBe(false);expect(parseDune(c.data)).toBeNull();});
});
describe('desert terrain, heat and sandstorm movement',()=>{
 it('main locked gates and final descending ramp have no floor',()=>{const s=duneSurfaces();for(const p of [[7,87],[55,35],[0,-18],[-55,-72],[6,-126],[65,-180],[65,-292]])expect(floorAt(s,...p as [number,number])).toBeNull();});
 it('shade removes wind and heat penalties',()=>expect(duneForces('storm',4,DUNE_START,false,1)).toEqual(STILL_AIR));
 it('steep-looking ramps have continuous reachable floors at their seams',()=>{const s=duneSurfaces();s.forEach(x=>x.enabled=true);expect(floorAt(s,55,62)).toBe(4);expect(floorAt(s,55,8)).toBe(12);expect(floorAt(s,-55,-44)).toBe(12);expect(floorAt(s,-55,-100)).toBe(4);expect(floorAt(s,65,-328)).toBe(-12);});
 it('normal movement can cross six main gates and descend16m without falling',()=>{const s=duneSurfaces();s.forEach(x=>x.enabled=true);const m=new Motor(s,[],DUNE_BOUNDS);m.warp(DUNE_START);m.setCheckpoint(DUNE_START);let time=0;for(const target of [...DUNE_MAIN.map(id=>DUNE_POS[id]),DUNE_AUDIT,DUNE_CORE]){for(let i=0;i<5000&&Math.hypot(m.position.x-target.x,m.position.z-target.z)>.5;i++){const dx=target.x-m.position.x,dz=target.z-m.position.z,len=Math.max(1,Math.hypot(dx,dz));time+=1/60;m.environment=duneForces('storm',time,m.position,true);m.step(1/60,{x:dx/len,z:dz/len,jump:false,sprint:false});}expect(Math.hypot(m.position.x-target.x,m.position.z-target.z)).toBeLessThan(1);expect(m.position.y).toBeCloseTo(target.y,0);m.setCheckpoint(target);}expect(m.falls).toBe(0);});
});

function completeFourCities(){
 const c=new Campaign();c.meet();c.observe('Q-01');c.submitOrder(['EXIT','DELETE','ARCHIVE']);c.observe('DS-01');c.submitRail(relink(c.data.rail,'A','B'));c.finish();
 c.data.forge={phase:'complete',power:{charge:84,temperature:30,isolated:true,energized:true},flag:'CARRY',evidence:['WF-01','CO-01']};c.data.forgeClearance=structuredClone(c.data.forge);
 const t=new ThreadCampaign(freshThread()),tp:ThreadPatches={'OS-01':{p:'A',q:'A',restart:true},'OS-02':{aging:8,oldestFirst:true},'OS-03':'atomic','OS-04':{touchOnHit:true,evict:'oldest'},'OS-S1':'while','OS-S2':'cas'};t.meet();for(const id of ['OS-01','OS-02','OS-03','OS-04'] as const){t.observe(id);t.submit(id,tp[id]);}t.audit();t.finish();c.data.thread=t.data;c.data.threadClearance=structuredClone(t.data);
 const w=new SnowCampaign(freshSnow()),sp:SnowPatches={'WF-02':{alignment:'vane',shutter:'gust',cutoff:9,heater:'thermostat'},'NET-01':{A:'B',B:'D',C:'E',E:'D',ttl:4,fallback:true},'NET-02':network,'NET-03':{window:12,adaptive:true,backoff:true},'NET-04':{clock:'lamport',tie:'node',barrier:true},'NET-S1':{refresh:true,respectTTL:true,probe:true},'NET-S2':{algorithm:'crc8',retryCorrupt:true},'NET-S3':{misses:3,recovery:2,fencing:true}};w.meet();for(const id of SNOW_MAIN){w.observe(id);w.submit(id,sp[id]);}w.audit();for(let i=1;i<=3;i++)w.deliver(i);w.finish();c.data.snow=w.data;c.data.city='snow';return c;
}
describe('five-city migration and replay certificates',()=>{
 it('migrates an earned V6.3 ending into a valid fifth-city entry',()=>{const c=completeFourCities(),old=structuredClone(c.data) as unknown as Record<string,unknown>;delete old.dune;delete old.snowClearance;const clean=parseProgress(old);expect(clean?.dune).toEqual(freshDune());expect(clean?.snowClearance?.phase).toBe('complete');});
 it('cannot claim fifth-city access with an unfinished fourth city',()=>{const c=completeFourCities();c.data.city='dune';c.data.snow=freshSnow();expect(parseProgress(c.data)).toBeNull();});
 it('replaying fourth city retains fifth progress only through a proven certificate',()=>{const c=completeFourCities();c.data.snowClearance=structuredClone(c.data.snow);c.data.snow=freshSnow();c.data.dune=completeMain().data;c.data.city='dune';expect(parseProgress(c.data)?.dune.phase).toBe('audit');c.data.snowClearance=null;expect(parseProgress(c.data)).toBeNull();});
 it('rejects a fabricated fourth-city complete label without its actual policies',()=>{const c=completeFourCities();c.data.snowClearance={...freshSnow(),phase:'complete',audited:true,delivery:3};expect(parseProgress(c.data)).toBeNull();});
 it('earlier city proofs remain required for a snow certificate',()=>{const c=completeFourCities();c.data.snowClearance=structuredClone(c.data.snow);c.data.chapter='meet';expect(parseProgress(c.data)).toBeNull();});
 it('revalidates all seven systems for an audited fifth-city save',()=>{const c=completeFourCities(),d=completeMain();d.audit(network);d.rehearse({canary:5,monitor:'invariants',rollback:true},network);d.finish(network);c.data.dune=d.data;c.data.city='dune';expect(parseProgress(c.data)?.dune.phase).toBe('complete');c.data.snow.patches['NET-02'].retry=false;expect(parseProgress(c.data)).toBeNull();});
 it('preserves a pending finale across reload only after the proven r43 cutover',()=>{const c=completeFourCities(),d=completeMain();d.audit(network);d.rehearse({canary:5,monitor:'invariants',rollback:true},network);d.finish(network);c.data.dune=d.data;c.data.city='dune';c.data.finalePending=true;expect(parseProgress(JSON.parse(JSON.stringify(c.data)))?.finalePending).toBe(true);c.data.city='dock';expect(parseProgress(c.data)).toBeNull();});
});

describe('follow camera avoids the mirror monolith',()=>{
 it('nearest obstruction wins regardless of solid insertion order',()=>{const target=new Vector3(0,2,0),desired=new Vector3(0,8,12),near=new Box3(new Vector3(-2,0,4),new Vector3(2,15,5)),far=new Box3(new Vector3(-2,0,9),new Vector3(2,15,10));const a=followCameraPosition(target,desired,[near,far]),b=followCameraPosition(target,desired,[far,near]);expect(a.distanceTo(b)).toBeLessThan(.001);expect(a.z).toBeLessThan(4);});
 it('a ray next to a monolith keeps its normal distance',()=>{const target=new Vector3(0,2,0),desired=new Vector3(0,8,12),box=new Box3(new Vector3(5,0,4),new Vector3(9,20,8));expect(followCameraPosition(target,desired,[box])).toEqual(desired);});
 it('the actual DB-S1 bridge approach camera stays in front of its pillar',()=>{const target=new Vector3(81.9,13.55,-18.86),desired=new Vector3(81.9,18.8,-7.06),pillar=new Box3(new Vector3(80.4,12,-11.6),new Vector3(85.6,34,-8.2));expect(followCameraPosition(target,desired,[pillar]).z).toBeLessThan(-11.6);});
});

describe('WAL proof includes commit identity, not only arithmetic equality',()=>{
 it('rejects accidentally correct49 when unflushed commit markers are missing',()=>{const r=recoverWAL({flush:'lazy',replay:'all',lsn:true},5,0,false);expect(r.value).toBe(49);expect(r.lostAcknowledged).toBeGreaterThan(0);expect(r.uncommittedApplied).toBeGreaterThan(0);expect(runRecovery({flush:'lazy',replay:'all',lsn:true}).assertions[1].passed).toBe(false);});
});

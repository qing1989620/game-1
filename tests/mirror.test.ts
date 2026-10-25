import { describe, expect, it } from 'vitest';
import { MirrorCampaign, freshMirror, parseMirror, runMirrorCase } from '../src/game/mirror-domain';
import { Campaign, freshProgress, parseProgress, relink } from '../src/game/domain';
import { MIRROR_AUDIT, MIRROR_BOUNDS, MIRROR_POS, MIRROR_START, mirrorSurfaces } from '../src/game/mirror-layout';
import { floorAt, Motor } from '../src/game/physics';
import { SnowCampaign, SNOW_MAIN, freshSnow, type SnowPatches } from '../src/game/snow-domain';
import { ThreadCampaign, freshThread, type ThreadPatches } from '../src/game/thread-domain';

describe('镜库城规则', () => {
  it('失效消息乱序时仍拒绝旧缓存', () => {
    expect(runMirrorCase('MEM-01', { mode: 'ttl', version: false }).passed).toBe(false);
    expect(runMirrorCase('MEM-01', { mode: 'invalidate', version: true }).passed).toBe(true);
  });
  it('并发医生不能各自预支同一张病床', () => {
    expect(runMirrorCase('MEM-02', { isolation: 'snapshot', constraint: false }).passed).toBe(false);
    expect(runMirrorCase('MEM-02', { isolation: 'serializable', constraint: true }).passed).toBe(true);
    expect(runMirrorCase('MEM-02', { isolation: 'snapshot', constraint: true }).passed).toBe(true);
  });
  it('恢复副本不能覆盖较新版本', () => {
    expect(runMirrorCase('MEM-03', { quorum: 1, epoch: false }).passed).toBe(false);
    expect(runMirrorCase('MEM-03', { quorum: 2, epoch: true }).passed).toBe(true);
    expect(runMirrorCase('MEM-03', { quorum: 1, epoch: true }).passed).toBe(false);
    expect(runMirrorCase('MEM-03', { quorum: 3, epoch: true }).passed).toBe(false);
  });
  it('取证、提交、综合回归和完结必须依序执行', () => {
    const c = new MirrorCampaign();
    expect(() => c.observe('MEM-01')).toThrow();
    expect(() => c.submit('MEM-01', { mode: 'invalidate', version: true })).toThrow();
    c.meet(); c.observe('MEM-01');
    expect(c.submit('MEM-01', { mode: 'ttl', version: false }).passed).toBe(false);
    expect(c.data.phase).toBe('cache');
    expect(c.submit('MEM-01', { mode: 'invalidate', version: true }).passed).toBe(true);
    c.observe('MEM-02'); c.submit('MEM-02', { isolation: 'serializable', constraint: true });
    c.observe('MEM-03'); c.submit('MEM-03', { quorum: 2, epoch: true });
    expect(c.audit()).toBe(true);
    expect(c.finish()).toBe(true);
    expect(parseMirror(c.data)?.phase).toBe('complete');
  });
  it('旧存档初始化，伪造完成状态被拒绝', () => {
    expect(parseMirror(undefined)).toEqual(freshMirror());
    expect(parseMirror({ ...freshMirror(), phase: 'complete' })).toBeNull();
  });
  it('V6.3 存档自动获得第五城初始状态', () => {
    const old=freshProgress() as unknown as Record<string,unknown>;delete old.mirror;
    expect(parseProgress(old)?.mirror).toEqual(freshMirror());
  });
  it('完成雪原后进入第五城，重玩雪原仍保留已验证通行资格', () => {
    const c=new Campaign();c.meet();c.observe('Q-01');c.submitOrder(['EXIT','DELETE','ARCHIVE']);c.observe('DS-01');c.submitRail(relink(c.data.rail,'A','B'));c.finish();
    c.data.forge={phase:'complete',power:{charge:84,temperature:30,isolated:true,energized:true},flag:'CARRY',evidence:['WF-01','CO-01']};
    const t=new ThreadCampaign(freshThread()),tp:ThreadPatches={'OS-01':{p:'A',q:'A',restart:true},'OS-02':{aging:8,oldestFirst:true},'OS-03':'atomic','OS-04':{touchOnHit:true,evict:'oldest'},'OS-S1':'while','OS-S2':'cas'};
    t.meet();for(const id of ['OS-01','OS-02','OS-03','OS-04'] as const){t.observe(id);t.submit(id,tp[id]);}t.audit();t.finish();c.data.thread=t.data;
    const s=new SnowCampaign(freshSnow()),sp:SnowPatches={
      'WF-02':{alignment:'vane',shutter:'gust',cutoff:9,heater:'thermostat'},'NET-01':{A:'B',B:'D',C:'E',E:'D',ttl:4,fallback:true},
      'NET-02':{retry:true,key:'session',ackDuplicates:true},'NET-03':{window:12,adaptive:true,backoff:true},'NET-04':{clock:'lamport',tie:'node',barrier:true},
      'NET-S1':{refresh:true,respectTTL:true,probe:true},'NET-S2':{algorithm:'crc8',retryCorrupt:true},'NET-S3':{misses:3,recovery:2,fencing:true},
    };
    s.meet();for(const id of SNOW_MAIN){s.observe(id);s.submit(id,sp[id]);}s.audit();for(const i of [1,2,3])s.deliver(i);s.finish();
    c.data.snow=s.data;c.data.snowClearance=structuredClone(s.data);c.data.city='mirror';
    expect(parseProgress(c.data)?.city).toBe('mirror');
    c.data.snow=freshSnow();expect(parseProgress(c.data)?.city).toBe('mirror');
    c.data.snowClearance=null;expect(parseProgress(c.data)).toBeNull();
  });
  it('未修复的桥有真实承重缺口', () => {
    const surfaces=mirrorSurfaces();
    for(const z of [-7,-68.5,-129.5])expect(floorAt(surfaces,0,z)).toBeNull();
    surfaces.filter(s=>s.id.includes('bridge')).forEach(s=>s.enabled=true);
    for(const z of [-7,-68.5,-129.5])expect(floorAt(surfaces,0,z)).not.toBeNull();
  });
  it('修复后可沿长廊从入口走到综合回归棱镜', () => {
    const surfaces=mirrorSurfaces();surfaces.filter(s=>s.id.includes('bridge')).forEach(s=>s.enabled=true);
    const motor=new Motor(surfaces,[],{...MIRROR_BOUNDS});motor.warp(MIRROR_START);motor.setCheckpoint(MIRROR_START);
    for(const target of [...Object.values(MIRROR_POS),MIRROR_AUDIT]){
      for(let i=0;i<5000&&Math.abs(motor.position.z-target.z)>.6;i++)motor.step(1/60,{x:0,z:-1,jump:false,sprint:false});
      expect(Math.abs(motor.position.z-target.z)).toBeLessThan(1);
      motor.setCheckpoint(target);
    }
    expect(motor.falls).toBe(0);expect(motor.position.y).toBe(4);
  });
});

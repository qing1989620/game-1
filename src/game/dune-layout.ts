import type { Surface,V3,WorldBounds } from './physics';
import type { DuneCase,DuneProgress,DuneWeather } from './dune-domain';
export const DUNE_START:V3={x:-45,y:4,z:112};
export const DUNE_GUIDE:V3={x:-55,y:4,z:104};
export const DUNE_AUDIT:V3={x:65,y:4,z:-236};
export const DUNE_CORE:V3={x:65,y:-12,z:-347};
export const DUNE_BOUNDS:WorldBounds={minZ:-375,maxZ:139,maxX:154,fallY:-40};
export const DUNE_POS:Record<DuneCase,V3>={
  'DB-01':{x:-45,y:4,z:87},'DB-02':{x:55,y:4,z:87},'DB-03':{x:55,y:12,z:-18},'DB-04':{x:-55,y:12,z:-18},'DB-05':{x:-55,y:4,z:-126},'DB-06':{x:65,y:4,z:-126},
  'DB-S1':{x:109,y:12,z:-18},'DB-S2':{x:-109,y:12,z:-18},'DB-S3':{x:-110,y:4,z:-126},'DB-S4':{x:120,y:4,z:-126},
};
export const duneSurfaces=():Surface[]=>[
  {id:'dune-arrival',x:-45,z:99,w:60,d:52,y:4},
  {id:'dune-gate-1',x:7.5,z:87,w:45,d:12,y:4,enabled:false},
  {id:'dune-billing',x:55,z:87,w:50,d:50,y:4},
  {id:'dune-gate-2',x:55,z:35,w:12,d:54,y:4,rise:8,enabled:false},
  {id:'dune-snapshot',x:55,z:-18,w:54,d:52,y:12},
  {id:'dune-gate-3',x:0,z:-18,w:56,d:12,y:12,enabled:false},
  {id:'dune-recovery',x:-55,z:-18,w:54,d:52,y:12},
  {id:'dune-gate-4',x:-55,z:-72,w:12,d:56,y:12,rise:-8,enabled:false},
  {id:'dune-migration',x:-55,z:-126,w:60,d:52,y:4},
  {id:'dune-gate-5',x:6.5,z:-126,w:63,d:12,y:4,enabled:false},
  {id:'dune-outbox',x:65,z:-126,w:54,d:52,y:4},
  {id:'dune-gate-6',x:65,z:-180,w:12,d:56,y:4,enabled:false},
  {id:'dune-audit',x:65,z:-232,w:64,d:48,y:4},
  {id:'dune-side-bridge-1',x:90,z:-18,w:28,d:10,y:12},{id:'dune-side-1',x:109,z:-18,w:26,d:28,y:12},
  {id:'dune-side-bridge-2',x:-90,z:-18,w:28,d:10,y:12},{id:'dune-side-2',x:-109,z:-18,w:26,d:28,y:12},
  {id:'dune-side-bridge-3',x:-92,z:-126,w:22,d:10,y:4},{id:'dune-side-3',x:-110,z:-126,w:26,d:28,y:4},
  {id:'dune-side-bridge-4',x:103,z:-126,w:24,d:10,y:4},{id:'dune-side-4',x:120,z:-126,w:26,d:28,y:4},
  {id:'dune-descent-ramp',x:65,z:-292,w:14,d:72,y:4,rise:-16,enabled:false},
  {id:'dune-archive-core',x:65,z:-347,w:54,d:38,y:-12,enabled:false},
];
export const DUNE_SHADE=[{x:-45,z:112,radius:14},...Object.values(DUNE_POS).map(p=>({x:p.x,z:p.z,radius:9})),{x:DUNE_AUDIT.x,z:DUNE_AUDIT.z,radius:14},{x:DUNE_CORE.x,z:DUNE_CORE.z,radius:20}];
export const inDuneShade=(p:V3):boolean=>DUNE_SHADE.some(s=>Math.hypot(p.x-s.x,p.z-s.z)<=s.radius);
export function duneWind(w:DuneWeather,time:number){const strength=w==='sun'?.1:w==='haze'?.6:2.7;return {x:strength*(.65+.35*Math.sin(time*.41)**2),z:strength*Math.sin(time*.17)*.25};}
export function duneForces(w:DuneWeather,time:number,p:V3,brace:boolean,heat=0){const wind=duneWind(w,time),shade=inDuneShade(p);return {windX:shade?0:wind.x*(brace?.06:1),windZ:shade?0:wind.z*(brace?.06:1),grip:brace||shade?1:.55,pace:(brace?.72:1)*(heat>.8&&!shade?.86:1)};}
export function duneCheckpoint(s:DuneProgress):V3{
  if(s.phase==='complete')return {...DUNE_CORE};if(s.phase==='descent'||s.phase==='rehearsal')return {...DUNE_AUDIT,z:DUNE_AUDIT.z+5};
  const ids=['DB-01','DB-02','DB-03','DB-04','DB-05','DB-06'] as const,index=['stock','billing','snapshot','recovery','migration','outbox'].indexOf(s.phase);
  if(index>=0&&s.evidence.includes(ids[index]))return {...DUNE_POS[ids[index]],z:DUNE_POS[ids[index]].z+5};
  for(const id of [...ids].reverse())if(s.completed.includes(id))return {...DUNE_POS[id],z:DUNE_POS[id].z+5};return {...DUNE_START};
}

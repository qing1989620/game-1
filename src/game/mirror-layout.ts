import type { Surface, V3, WorldBounds } from './physics';
import type { MirrorCase, MirrorProgress } from './mirror-domain';

export const MIRROR_START:V3={x:0,y:4,z:55};
export const MIRROR_GUIDE:V3={x:-9,y:4,z:44};
export const MIRROR_POS:Record<MirrorCase,V3>={
  'MEM-01':{x:0,y:4,z:23},'MEM-02':{x:0,y:4,z:-38},'MEM-03':{x:0,y:4,z:-99},
};
export const MIRROR_AUDIT:V3={x:0,y:4,z:-151};
export const MIRROR_BOUNDS:WorldBounds={minZ:-188,maxZ:81,maxX:53,fallY:-15};
export const mirrorSurfaces=():Surface[]=>[
  {id:'mirror-arrival',x:0,z:35,w:42,d:73,y:4},
  {id:'mirror-bridge-1',x:0,z:-7,w:9,d:22,y:4,enabled:false},
  {id:'mirror-isolation',x:0,z:-38,w:42,d:42,y:4},
  {id:'mirror-bridge-2',x:0,z:-68.5,w:9,d:19,y:4,enabled:false},
  {id:'mirror-replica',x:0,z:-99,w:42,d:42,y:4},
  {id:'mirror-bridge-3',x:0,z:-129.5,w:9,d:19,y:4,enabled:false},
  {id:'mirror-audit',x:0,z:-151,w:50,d:42,y:4},
];
export function mirrorCheckpoint(p:MirrorProgress):V3 {
  if(p.phase==='complete'||p.phase==='audit')return {...MIRROR_AUDIT,z:-146};
  const index=p.completed.length;
  return index?{...MIRROR_POS[(['MEM-01','MEM-02','MEM-03'] as const)[index-1]],z:MIRROR_POS[(['MEM-01','MEM-02','MEM-03'] as const)[index-1]].z-4}:{...MIRROR_START};
}

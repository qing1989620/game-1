import type {Surface,V3,WorldBounds} from './physics';
import type {GroveCase,GroveClue,GroveProgress} from './grove-domain';
export const GROVE_START:V3={x:0,y:4,z:80};
export const GROVE_POS:Record<GroveCase,V3>={'SY-01':{x:0,y:4,z:68},'SY-02':{x:0,y:4,z:8},'SY-03':{x:0,y:4,z:-52},'SY-04':{x:0,y:4,z:-112}};
export const GROVE_AUDIT:V3={x:0,y:4,z:-170};
export const GROVE_CORE:V3={x:0,y:4,z:-230};
export const GROVE_CLUE_POS:Record<GroveClue,V3>={
 'old-letter':{x:-45,y:4,z:70},'receiver-output':{x:45,y:4,z:70},
 'old-marker':{x:-45,y:4,z:10},'new-marker':{x:45,y:4,z:10},'lan-testimony':{x:0,y:4,z:0},
 'low-gauge':{x:-45,y:4,z:-50},'high-gauge':{x:45,y:4,z:-50},'signal-original':{x:45,y:4,z:-110},
};
export const GROVE_CLUES:Record<GroveCase,readonly GroveClue[]>={'SY-01':['old-letter','receiver-output'],'SY-02':['old-marker','new-marker','lan-testimony'],'SY-03':['low-gauge','high-gauge'],'SY-04':['signal-original']};
export const GROVE_LEVER:V3={x:0,y:4,z:-119};
export const GROVE_BOUNDS:WorldBounds={minZ:-270,maxZ:105,maxX:80,fallY:-30};
export const groveSurfaces=():Surface[]=>[
 {id:'grove-arrival',x:0,z:70,w:26,d:40,y:4},
 {id:'grove-gate-1',x:0,z:40,w:10,d:20,y:4,enabled:false},
 {id:'grove-dock',x:0,z:10,w:26,d:40,y:4},
 {id:'grove-gate-2',x:0,z:-20,w:10,d:20,y:4,enabled:false},
 {id:'grove-tide',x:0,z:-50,w:26,d:40,y:4},
 {id:'grove-gate-3',x:0,z:-80,w:10,d:20,y:4,enabled:false},
 {id:'grove-safety',x:0,z:-110,w:26,d:40,y:4},
 {id:'grove-gate-4',x:0,z:-140,w:10,d:20,y:4,enabled:false},
 {id:'grove-audit',x:0,z:-170,w:26,d:40,y:4},
 {id:'grove-gate-5',x:0,z:-200,w:10,d:20,y:4,enabled:false},
 {id:'grove-core',x:0,z:-230,w:26,d:40,y:4},
 ...[70,10,-50,-110].flatMap((z,index):Surface[]=>[-1,1].flatMap(side=>[
  {id:`grove-branch-${index}-${side}`,x:side*26,z,w:32,d:8,y:4},
  {id:`grove-district-${index}-${side}`,x:side*45,z,w:18,d:24,y:4},
 ])),
];
export function groveCheckpoint(s:GroveProgress):V3{if(s.phase==='complete')return {...GROVE_CORE};if(s.phase==='delivery'||s.phase==='audit')return {...GROVE_AUDIT,z:GROVE_AUDIT.z+4};return s.completed.length?{...GROVE_POS[s.completed.at(-1)!],z:GROVE_POS[s.completed.at(-1)!].z+4}:{...GROVE_START};}

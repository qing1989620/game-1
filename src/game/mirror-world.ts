import * as T from 'three';
import { makeAvatar } from './world';
import { MIRROR_AUDIT, MIRROR_GUIDE, MIRROR_POS, mirrorSurfaces } from './mirror-layout';
import type { MirrorCase, MirrorProgress } from './mirror-domain';
import type { Obstacle, V3 } from './physics';

const palette={floor:'#344b60',edge:'#72e4db',glass:'#567fa2',pink:'#f5a8d5',gold:'#e9c989',dark:'#0b1220'};
export class MirrorWorld {
  scene=new T.Scene();surfaces=mirrorSurfaces();obstacles:Obstacle[]=[];solids:T.Box3[]=[];
  hero=makeAvatar(palette.edge);guide=makeAvatar(palette.pink);focus:V3={...MIRROR_POS['MEM-01']};
  private time=0;private bridges:T.Group[]=[];private beacons=new Map<MirrorCase,T.Mesh>();
  private floor=new T.MeshStandardMaterial({color:palette.floor,roughness:.78,metalness:.08});
  private glass=new T.MeshPhysicalMaterial({color:palette.glass,roughness:.12,metalness:.15,transparent:true,opacity:.46,side:T.DoubleSide});
  private line=new T.MeshBasicMaterial({color:palette.edge});
  private pink=new T.MeshBasicMaterial({color:palette.pink});
  constructor(){
    this.scene.background=new T.Color(palette.dark);this.scene.fog=new T.FogExp2(palette.dark,.008);
    this.scene.add(new T.HemisphereLight('#d3f8ff','#22203a',2.2));
    const lamp=new T.DirectionalLight('#8be8ff',2.1);lamp.position.set(-24,55,40);this.scene.add(lamp);
    for(const surface of this.surfaces){
      const platform=new T.Group();platform.position.set(surface.x,surface.y-.6,surface.z);
      const slab=new T.Mesh(new T.BoxGeometry(surface.w,1.2,surface.d),this.floor);platform.add(slab);
      for(const x of [-surface.w/2+.4,surface.w/2-.4]){
        const strip=new T.Mesh(new T.BoxGeometry(.16,.04,surface.d),this.line);strip.position.set(x,.63,0);platform.add(strip);
      }
      if(surface.id.includes('bridge')){platform.visible=false;this.bridges.push(platform);}
      this.scene.add(platform);
      if(!surface.id.includes('bridge'))for(const x of [-surface.w/2+1,surface.w/2-1]){
        const wall=new T.Mesh(new T.BoxGeometry(.15,8,surface.d),this.glass);wall.position.set(surface.x+x,8,surface.z);this.scene.add(wall);
      }
    }
    for(let i=0;i<24;i++){
      const z=70-i*11,x=(i%2?1:-1)*(32+i%4*8);
      const tower=new T.Mesh(new T.BoxGeometry(4,16+i%5*4,6),this.glass);tower.position.set(x,6,z);this.scene.add(tower);
      const glow=new T.Mesh(new T.BoxGeometry(4.2,.18,6.2),i%3?this.line:this.pink);glow.position.set(x,15+i%5*2,z);this.scene.add(glow);
    }
    for(const [i,id] of (['MEM-01','MEM-02','MEM-03'] as const).entries()){
      const p=MIRROR_POS[id];
      const hub=new T.Mesh(new T.CylinderGeometry(2.8,3.4,2.1,8),this.floor);hub.position.set(p.x,p.y+1,p.z);this.scene.add(hub);
      const beacon=new T.Mesh(new T.OctahedronGeometry(1.3),this.pink);beacon.position.set(p.x,p.y+4,p.z);this.scene.add(beacon);this.beacons.set(id,beacon);
      for(let k=0;k<4;k++){
        const panel=new T.Mesh(new T.BoxGeometry(2.1,4.5,.1),this.glass);panel.position.set(p.x+(k-1.5)*4,p.y+3,p.z-8);panel.rotation.y=(k-1.5)*.18;this.scene.add(panel);
      }
      const ring=new T.Mesh(new T.TorusGeometry(5,.11,6,44),i===2?this.pink:this.line);ring.position.set(p.x,p.y+7,p.z);ring.rotation.x=Math.PI/2;this.scene.add(ring);
    }
    const prism=new T.Mesh(new T.OctahedronGeometry(5),this.glass);prism.position.set(0,16,MIRROR_AUDIT.z);this.scene.add(prism);
    const auditRing=new T.Mesh(new T.TorusGeometry(8,.24,7,60),this.line);auditRing.position.set(0,15,MIRROR_AUDIT.z);this.scene.add(auditRing);
    this.guide.group.position.set(MIRROR_GUIDE.x,MIRROR_GUIDE.y,MIRROR_GUIDE.z);this.guide.needle.visible=false;
    this.scene.add(this.guide.group,this.hero.group);
  }
  setProgress(p:MirrorProgress){
    for(let i=0;i<3;i++){
      const ready=p.completed.length>i;
      this.surfaces.find(s=>s.id===`mirror-bridge-${i+1}`)!.enabled=ready;
      this.bridges[i].visible=ready;
      this.beacons.get((['MEM-01','MEM-02','MEM-03'] as const)[i])!.material=ready?this.line:this.pink;
    }
  }
  setQuality(_low:boolean){}
  update(dt:number,hero:V3,_speed:number,_paused:boolean,reducedMotion:boolean){
    this.time+=dt;this.hero.group.position.set(hero.x,hero.y,hero.z);
    if(!reducedMotion){let i=0;for(const beacon of this.beacons.values())beacon.rotation.y=this.time*(.25+i++*.1);}
  }
}

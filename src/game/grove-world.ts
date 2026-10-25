import * as T from 'three';
import {makeAvatar} from './world';
import {GROVE_AUDIT,GROVE_CLUE_POS,GROVE_CORE,GROVE_LEVER,GROVE_POS,groveSurfaces} from './grove-layout';
import {GROVE_MAIN,freshGrove,type GroveProgress,type GroveRun} from './grove-domain';
import type {Obstacle,Surface,V3} from './physics';

const plank=new T.MeshStandardMaterial({color:'#455151',roughness:.82,metalness:.12});
const jade=new T.MeshStandardMaterial({color:'#52d9c6',metalness:.38,roughness:.3,emissive:'#174e50',emissiveIntensity:.35});
const root=new T.MeshStandardMaterial({color:'#563e36',roughness:1});
const leaf=new T.MeshStandardMaterial({color:'#205b54',roughness:.9,side:T.DoubleSide});
const amber=new T.MeshBasicMaterial({color:'#ffb969'});
const muted=new T.MeshStandardMaterial({color:'#263e41',roughness:.8});
export class GroveWorld{
 scene=new T.Scene();surfaces=groveSurfaces();obstacles:Obstacle[]=[];solids:T.Box3[]=[];
 hero=makeAvatar('#8ef4df');guide=makeAvatar('#ffc378');kite=makeAvatar('#9bb8fa');
 focus:V3={...GROVE_POS['SY-01']};
 private gates:{surface:Surface;mesh:T.Group}[]=[];private lamps:T.Mesh[]=[];private signs:T.Object3D[]=[];private beacon:T.Group;private letter:T.Mesh;private finaleShot=-1;private finaleAge=0;private water:T.Mesh;private boatOld:T.Group;private boatNew:T.Group;private ferry:T.Group;private lever:T.Group;private ghost:T.Mesh|null=null;private time=0;private tideY=-2;
 constructor(){
  this.scene.background=new T.Color('#183542');this.scene.fog=new T.FogExp2('#25464d',.0027);
  this.scene.add(new T.HemisphereLight('#a9d9d7','#14272b',2.1));const moon=new T.DirectionalLight('#ffcf98',2.8);moon.position.set(-100,130,50);this.scene.add(moon);const blue=new T.DirectionalLight('#69bbda',1.1);blue.position.set(90,44,-180);this.scene.add(blue);
  const sky=this.mesh(new T.SphereGeometry(850,24,14),new T.ShaderMaterial({side:T.BackSide,depthWrite:false,vertexShader:'varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec3 vP;void main(){float h=normalize(vP).y;vec3 low=vec3(.28,.39,.42);vec3 high=vec3(.055,.15,.23);gl_FragColor=vec4(mix(low,high,smoothstep(-.15,.8,h)),1.);}'}),0,0,-130);sky.frustumCulled=false;
  const waterMaterial=new T.MeshStandardMaterial({color:'#147480',metalness:.46,roughness:.2,transparent:true,opacity:.91,emissive:'#063f49',emissiveIntensity:.25});
  this.water=this.box(300,.16,660,waterMaterial,0,-2,-100);this.water.receiveShadow=true;
  for(const s of this.surfaces){const g=new T.Group();g.position.set(s.x,0,s.z);this.scene.add(g);this.box(s.w,.48,s.d,s.id.includes('gate')?root:plank,0,s.y-.24,0,g);for(let z=-s.d/2+1;z<s.d/2;z+=3)this.box(s.w-.5,.035,.07,s.id.includes('gate')?jade:muted,0,s.y+.015,z,g);for(const side of [-1,1]){this.box(.15,.8,s.d,root,side*(s.w/2-.35),s.y+.45,0,g);for(let z=-s.d/2+2;z<s.d/2;z+=4)this.box(.18,1,.18,root,side*(s.w/2-.35),s.y+.5,z,g);}if(s.id.includes('gate')){g.visible=false;this.gates.push({surface:s,mesh:g});for(const side of [-1,1]){const arch=new T.Mesh(new T.TorusGeometry(4.1,.28,6,22,Math.PI),root);arch.position.set(side*3,s.y-1,0);arch.rotation.y=Math.PI/2;g.add(arch);}}else for(const x of [-s.w/3,s.w/3])this.box(.7,7,.7,root,x,s.y-3.5,0,g);}
  // The mangrove columns sit beyond the walkable decks; forked roots frame each decision station.
  for(let i=0;i<78;i++){const z=95-i*4.5,x=(i%2?1:-1)*(56+(i*13%29)),scale=.7+(i*7%9)*.065;this.tree(x,z,scale);}
  this.architecture();this.dome();
  this.guide.group.position.set(-8,4,79);this.kite.group.position.set(9,4,77);this.guide.needle.visible=false;this.kite.needle.visible=false;this.scene.add(this.hero.group,this.guide.group,this.kite.group);
  GROVE_MAIN.forEach((id,i)=>{const p=GROVE_POS[id];this.box(5,2.1,3,muted,p.x,p.y+1,p.z-8);this.box(5.3,.15,3.3,jade,p.x,p.y+2.15,p.z-8);this.lamps.push(this.mesh(new T.OctahedronGeometry(.55),amber,p.x,p.y+3.5,p.z-8));this.sign(id,['VERSION / UNKNOWN','B-07 / TWO DOCKS','TIDE / DATUM','CRITICAL / HUMAN'][i],p.z-11);});
  for(const [clue,p] of Object.entries(GROVE_CLUE_POS)){this.box(1.8,1.1,1.6,muted,p.x,p.y+.55,p.z);this.mesh(new T.OctahedronGeometry(.38),amber,p.x,p.y+1.7,p.z);this.sign(clue.toUpperCase().replaceAll('-',' '),'Q / READ THE ORIGINAL',p.z-2,p.x,8);}
  this.lever=new T.Group();this.lever.position.set(GROVE_LEVER.x,GROVE_LEVER.y,GROVE_LEVER.z);this.scene.add(this.lever);this.box(2,2,2,muted,0,1,0,this.lever);const handle=this.box(.32,4,.32,new T.MeshBasicMaterial({color:'#ed6e5a'}),0,3,0,this.lever);handle.rotation.x=-.45;this.sign('STOP / 拦船杆','E / PULL BEFORE PATCH',GROVE_LEVER.z-4);
  this.sign('语法穹顶','06 / RECEIVE IS NOT UNDERSTAND',44,0,25,23);this.sign('汐与 KITE','两条路线，只能有一条被确认',78,-27,9,10);this.sign('旧 B-07 / 已有人撤离','OLD DOCK',34);this.sign('新 B-07 / 仍有人等待','NEW DOCK',-150);this.sign('综合译审','四份译文重新对照原文',-178);this.sign('潮汐交接台','亲手确认这艘船的目的地',-238);
  this.box(8,4,5,muted,0,6,GROVE_AUDIT.z-9);this.box(9,.3,5.5,jade,0,8.2,GROVE_AUDIT.z-9);this.box(9,4,5,muted,0,6,GROVE_CORE.z-7);
  this.box(24,.55,24,plank,-38,.3,33);this.box(24,.55,24,plank,38,5.8,-150);for(const z of [21,32,43])this.box(22,.1,.18,root,-38,.7,z);for(const z of [-139,-150,-161])this.box(22,.1,.18,jade,38,6.2,z);
  const lan=makeAvatar('#f6d47b');lan.group.position.set(38,6,-150);lan.needle.visible=false;this.scene.add(lan.group);
  this.letter=this.box(1.1,.08,.72,new T.MeshStandardMaterial({color:'#f3e1af',roughness:.95}),35,7.9,-150);this.letter.visible=false;
  this.beacon=new T.Group();this.beacon.position.set(-25,10,-258);this.mesh(new T.OctahedronGeometry(1.1),new T.MeshBasicMaterial({color:'#ffd692'}),0,0,0,this.beacon);const beaconLight=new T.PointLight('#ffcd82',16,70);this.beacon.add(beaconLight);this.beacon.visible=false;this.scene.add(this.beacon);
  this.boatOld=this.boat('#ef9e72');this.boatNew=this.boat('#67eadf');this.ferry=this.boat('#f6dd99');this.ferry.visible=false;this.scene.add(this.boatOld,this.boatNew,this.ferry);
  this.route([[-4,.1,68],[-24,.1,35],[-24,.1,-40]],'#f5aa7c',.45);this.route([[4,.1,68],[24,.1,35],[24,.1,-150]],'#73f5db',.45);
  this.setProgress(freshGrove());
 }
 private mesh(g:T.BufferGeometry,m:T.Material,x:number,y:number,z:number,parent:T.Object3D=this.scene){const o=new T.Mesh(g,m);o.position.set(x,y,z);parent.add(o);return o;}
 private box(w:number,h:number,d:number,m:T.Material,x:number,y:number,z:number,parent:T.Object3D=this.scene){return this.mesh(new T.BoxGeometry(w,h,d),m,x,y,z,parent);}
 private tree(x:number,z:number,s:number){this.mesh(new T.CylinderGeometry(.55*s,1.25*s,13*s,7),root,x,3*s,z);for(let i=0;i<5;i++){const a=i*Math.PI*2/5,r=this.mesh(new T.CylinderGeometry(.1*s,.37*s,10*s,5),root,x+Math.cos(a)*3.5*s,-1*s,z+Math.sin(a)*3.5*s);r.rotation.z=Math.cos(a)*.8;r.rotation.x=-Math.sin(a)*.8;}for(let i=0;i<3;i++){const crown=this.mesh(new T.IcosahedronGeometry((4.5+i*.6)*s,0),leaf,x+(i-1)*2.2*s,11*s+i*.8*s,z+(i-1)*1.2*s);crown.scale.y=.36;}}
 private dome(){
  const rib=new T.MeshStandardMaterial({color:'#13323c',metalness:.7,roughness:.34,emissive:'#0a323b',emissiveIntensity:.25});
  const glass=new T.MeshStandardMaterial({color:'#4c9a9b',metalness:.25,roughness:.3,transparent:true,opacity:.19,side:T.DoubleSide,depthWrite:false});
  const nodes=new T.MeshBasicMaterial({color:'#f5c88c'});
  for(let j=0;j<8;j++){const z=26-j*43,curve=new T.CatmullRomCurve3(Array.from({length:17},(_,i)=>{const t=i*Math.PI/16;return new T.Vector3(-71*Math.cos(t),4+72*Math.sin(t),z);}));this.mesh(new T.TubeGeometry(curve,32,.82,6,false),rib,0,0,0);for(const x of [-71,71]){this.box(3.4,17,3.4,rib,x,8.5,z);this.mesh(new T.OctahedronGeometry(1.2),nodes,x,16.5,z);}if(j<7){for(const side of [-1,1]){const pane=this.mesh(new T.PlaneGeometry(31,40),glass,side*49,43,z-21.5);pane.rotation.y=side*.52;pane.rotation.z=side*.48;}}}
  for(let i=0;i<5;i++){const z=-53-i*43;this.box(6,5,2,rib,0,69,z);this.box(3,.18,2.2,jade,0,66,z);}
 }
 private architecture(){
  const stone=new T.MeshStandardMaterial({color:'#3d4949',roughness:.87});
  const metal=new T.MeshStandardMaterial({color:'#102d38',metalness:.62,roughness:.39});
  const glass=new T.MeshStandardMaterial({color:'#177489',metalness:.75,roughness:.2,emissive:'#0b5360',emissiveIntensity:.33});
  const light=new T.MeshBasicMaterial({color:'#e8b679'});
  type B=[number,number,number,number,number,number];const groups=new Map<T.Material,B[]>([[stone,[]],[metal,[]],[glass,[]],[light,[]]]);
  const add=(m:T.Material,x:number,y:number,z:number,w:number,h:number,d:number)=>groups.get(m)!.push([x,y,z,w,h,d]);
  // Perimeter blocks establish a dense skyline while the walkable strip stays clear.
  for(let i=0;i<60;i++){const side=i%2?-1:1,z=118-Math.floor(i/2)*15.5,x=side*(64+(i*17%35)),base=-2,h=13+(i*13%38),w=8+(i*7%9),d=8+(i*11%13);add(stone,x,base+h/2,z,w,h,d);add(metal,x,base+h+.8,z,w+1,1.6,d+1);for(let k=0;k<Math.min(9,Math.floor(h/4));k++){add(glass,x,base+3+k*3.7,z+side*(d/2+.07),w*.68,.65,.12);add(light,x-side*w*.27,base+2.2+k*3.7,z+side*(d/2+.14),.16,.16,.16);}if(i%4===0){add(metal,x-side*(w/2+2),h*.6,z,1.8,h*.8,2.2);add(glass,x-side*(w/2+2),h,z,2.1,5,2.5);}}
  // The language machines are major landmarks, not small identical boxes beside the path.
  for(let i=1;i<5;i++){const z=72-i*60;for(const side of [-1,1]){const x=side*19;add(metal,x,9,z,7,18,8);add(glass,x,17.5,z,8,.35,9);for(let k=0;k<5;k++){add(light,x,4+k*3,z+4.06,5.5,.13,.14);}add(stone,x,22,z,3,9,3);add(glass,x,27,z,3.8,1.6,3.8);}add(metal,0,17,z,31,1,2);add(light,0,17.6,z,30,.15,.2);}
  // Side walkways, relay balconies and suspended conduits give the city several levels.
  for(let i=0;i<19;i++){const z=91-i*18;for(const side of [-1,1]){const x=side*(23+(i%3)*7);add(metal,x,2.7,z,13,.6,10);add(stone,x,0,z,1,8,1);add(light,x,3.06,z,11,.08,.14);if(i%2===0){add(metal,side*33,9,z,18,.55,4);add(glass,side*33,9.35,z,17,.08,3.7);}}}
  for(const [i,z] of [70,10,-50,-110].entries())for(const side of [-1,1]){const x=side*45;for(const dx of [-7,7])for(const dz of [-9,9])add(metal,x+dx,8,z+dz,.35,8,.35);add(metal,x,12,z,17,.55,21);add(glass,x,12.38,z,16,.14,20);add(light,x,11.95,z-10,13,.18,.18);add(stone,x+side*5,6,z+5,3,4,3);add(glass,x+side*5,8.1,z+5,3.5,.2,3.5);if(i%2===0){add(metal,x-side*5,6,z-5,2,4,2);add(light,x-side*5,8.1,z-5,2.2,.16,2.2);}}
  const unit=new T.BoxGeometry(1,1,1),dummy=new T.Object3D();for(const [material,boxes] of groups){const mesh=new T.InstancedMesh(unit,material,boxes.length);boxes.forEach(([x,y,z,w,h,d],i)=>{dummy.position.set(x,y,z);dummy.scale.set(w,h,d);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});mesh.computeBoundingSphere();this.scene.add(mesh);}
 }
 private sign(title:string,sub:string,z:number,x=-10,w=15,y=7.5){const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;const c=canvas.getContext('2d')!;c.fillStyle='#173d42';c.fillRect(0,0,1024,256);c.fillStyle='#9bf2dd';c.font='bold 61px sans-serif';c.fillText(title,32,108);c.fillStyle='#ffd198';c.font='30px sans-serif';c.fillText(sub,32,180);const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;this.signs.push(this.mesh(new T.PlaneGeometry(w,w/3.75),new T.MeshBasicMaterial({map:texture,side:T.DoubleSide}),x,y,z));}
 private boat(color:string){const g=new T.Group(),m=new T.MeshStandardMaterial({color,metalness:.35,roughness:.4});this.box(7,1,12,m,0,0,0,g);this.box(.15,6,.15,plank,0,3,0,g);this.mesh(new T.ConeGeometry(2,5,3),new T.MeshBasicMaterial({color,side:T.DoubleSide}),0,4,0,g);return g;}
 private route(points:number[][],color:string,opacity:number){const geometry=new T.BufferGeometry().setFromPoints(points.map(p=>new T.Vector3(p[0],p[1],p[2]))),line=new T.Line(geometry,new T.LineBasicMaterial({color,transparent:true,opacity,depthTest:false}));this.scene.add(line);return line;}
 present(run:GroveRun,fixture=0,cursor=Infinity){this.clearTrace();const event=run.traces[fixture]?.log[cursor];if(!event||!/DISPATCH|ROUTE|TIDE_DECISION|PIER_COUNT|UNSAFE_FALLBACK/.test(event.kind))return;const failed=!run.assertions[fixture]?.passed,points=failed?[[-4,5,68],[-24,5,35],[-24,5,-40]]:[[4,5,68],[24,5,35],[24,5,-150]];const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(p[0],p[1],p[2])));this.ghost=new T.Mesh(new T.TubeGeometry(curve,64,.2,6,false),new T.MeshBasicMaterial({color:failed?'#ff715d':'#a5ffe1',transparent:true,opacity:.95,depthTest:false}));this.scene.add(this.ghost);}
 clearTrace(){if(!this.ghost)return;this.scene.remove(this.ghost);this.ghost.geometry.dispose();(this.ghost.material as T.Material).dispose();this.ghost=null;}
 setProgress(s:GroveProgress){this.gates.forEach(({surface,mesh},i)=>{surface.enabled=i<4?s.completed.includes(GROVE_MAIN[i]):s.audited;mesh.visible=surface.enabled;});this.lamps.forEach((lamp,i)=>lamp.material=s.completed.includes(GROVE_MAIN[i])?jade:amber);this.boatOld.visible=true;this.boatNew.visible=true;this.boatOld.position.set(-27,-.45,18);this.boatNew.position.set(27,-.45,-150);this.tideY=s.tide==='high'?1:-2;this.water.position.y=this.tideY;this.lever.rotation.x=s.halted?-.55:0;}
 setFerryPosition(p:V3|null){this.ferry.visible=!!p;if(p)this.ferry.position.set(p.x,p.y-1.8,p.z);}
 setFinale(shot:number){
  this.finaleShot=shot;this.finaleAge=0;this.letter.position.x=34;this.hero.group.visible=shot===3;this.letter.visible=shot===3;
  this.signs.forEach(sign=>sign.visible=false);
  this.gates.forEach(({surface,mesh})=>{surface.enabled=true;mesh.visible=true;});
  this.lamps.forEach(lamp=>lamp.material=jade);
  this.tideY=shot>=2?1:-2;this.water.position.y=this.tideY;
  this.boatOld.visible=shot<3;this.boatNew.visible=shot<3;
  this.ferry.visible=shot>=2&&shot<=5;
  this.ferry.position.set(shot===3?31:0,shot===3?4.5:2.5,shot===3?-148:shot>=4?-205:-58);
  this.beacon.visible=shot===5;
 }
 setFinaleAge(age:number){this.finaleAge=age;}
 setQuality(_low:boolean){}
 update(dt:number,p:V3,_speed:number,_paused:boolean,reduced:boolean){this.time+=dt;this.hero.group.position.set(this.finaleShot===3?33:p.x,this.finaleShot===3?6:p.y,this.finaleShot===3?-150:p.z);if(this.finaleShot===2)this.ferry.position.z=-30-Math.min(1,this.finaleAge/8)*118;if(this.finaleShot===3)this.letter.position.x=34+Math.min(1,this.finaleAge/5)*3;if(this.finaleShot===5)this.beacon.scale.setScalar(1+Math.sin(this.time*2)*.18);if(!reduced){this.water.position.y=this.tideY+Math.sin(this.time*1.2)*.07;this.boatOld.position.z=18+Math.sin(this.time*.35)*35;this.boatNew.position.z=-90+Math.sin(this.time*.35+.9)*65;}}
}

import * as T from 'three';
import {makeAvatar} from './world';
import {DUNE_GUIDE,DUNE_POS,DUNE_CORE,DUNE_SHADE,duneSurfaces,duneWind} from './dune-layout';
import {DUNE_MAIN,DUNE_CASES,DUNE_BURIED,type DuneCase,type DuneProgress,type DuneRun,type DuneWeather} from './dune-domain';
import type {Surface,Obstacle,V3} from './physics';
type Box=[number,number,number,number,number,number,number?];
const C={sand:'#cc7942',stone:'#8e4730',ink:'#112d3a',blue:'#18849b',cyan:'#88edf3',gold:'#ffcd80',red:'#e97853'};
function signTexture(title:string,sub:string,accent=C.cyan):T.CanvasTexture{
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=384;const c=canvas.getContext('2d')!;
 c.fillStyle='#102e3a';c.fillRect(0,0,1024,384);c.fillStyle=accent;c.fillRect(0,0,7,384);c.strokeStyle='#6fa8aa44';c.strokeRect(25,23,972,338);
 c.fillStyle='#ecdebc';c.font='500 75px "Microsoft YaHei", sans-serif';c.fillText(title,55,166,910);c.fillStyle=accent;c.font='28px monospace';c.fillText(sub,58,269,900);
 const tex=new T.CanvasTexture(canvas);tex.colorSpace=T.SRGBColorSpace;return tex;
}
function sandTexture():T.CanvasTexture{const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const c=canvas.getContext('2d')!;c.fillStyle='#cf8753';c.fillRect(0,0,256,256);let seed=182;for(let i=0;i<1600;i++){seed=(Math.imul(seed,1664525)+1013904223)|0;const x=(seed>>>0)%256;seed=(Math.imul(seed,1664525)+1013904223)|0;const y=(seed>>>0)%256;c.fillStyle=i%2?'#ffc48428':'#653b2b24';c.fillRect(x,y,2+i%8,1);}const tex=new T.CanvasTexture(canvas);tex.colorSpace=T.SRGBColorSpace;tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.repeat.set(4,4);return tex;}
export class DuneWorld{
 scene=new T.Scene();surfaces=duneSurfaces();obstacles:Obstacle[]=[];solids:T.Box3[]=[];
 hero=makeAvatar(C.cyan);guide=makeAvatar(C.gold);archivist=makeAvatar(C.blue);observer=makeAvatar(C.red);
 focus:V3={...DUNE_POS['DB-01']};weather:DuneWeather='sun';environmentTime=0;braced=false;lens=false;heat=0;
 private time=0;private severity=0;private complete=false;private solved=new Set<DuneCase>();private signature='';private lastTrace='';
 private sand=new T.MeshStandardMaterial({color:C.sand,map:sandTexture(),roughness:1});
 private stone=new T.MeshStandardMaterial({color:C.stone,roughness:.97});
 private ink=new T.MeshStandardMaterial({color:C.ink,metalness:.65,roughness:.35});
 private mirror=new T.MeshStandardMaterial({color:'#1c849c',metalness:.85,roughness:.17,emissive:'#105160',emissiveIntensity:.4});
 private gold=new T.MeshBasicMaterial({color:C.gold});private cyan=new T.MeshBasicMaterial({color:C.cyan});private red=new T.MeshBasicMaterial({color:C.red});private dim=new T.MeshBasicMaterial({color:'#244b54'});
 private unit=new T.BoxGeometry(1,1,1);private dummy=new T.Object3D();private batches=new Map<T.Material,Box[]>();
 private gates:{surface:Surface;group:T.Group;barrier:T.Mesh}[]=[];private finalGroups:T.Group[]=[];
 private signs=new Map<DuneCase,T.Mesh>();private lamps=new Map<DuneCase,T.Mesh>();private bars=new Map<DuneCase,T.Mesh[]>();private buried:T.Group[]=[];
 private dust:T.Points;private groundDust:T.Points;private sky:T.Mesh;private sun:T.Mesh;private water:T.Mesh;private crown:T.Group;private scan:T.Mesh;private scanAt=-100;
 constructor(){
  this.scene.background=new T.Color('#bf7452');this.scene.fog=new T.FogExp2('#bf7452',.0028);
  this.scene.add(new T.HemisphereLight('#f8cc8c','#4f3b48',2.8));const sun=new T.DirectionalLight('#ffd393',3.5);sun.position.set(-180,160,90);this.scene.add(sun);const fill=new T.DirectionalLight('#6da6c8',1.5);fill.position.set(130,50,-200);this.scene.add(fill);
  this.sky=this.mesh(new T.SphereGeometry(1000,24,16),new T.ShaderMaterial({side:T.BackSide,depthWrite:false,uniforms:{severity:{value:0},time:{value:0}},vertexShader:'varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'uniform float severity;uniform float time;varying vec3 vP;void main(){float h=normalize(vP).y;vec3 clear=mix(vec3(.98,.60,.32),vec3(.16,.31,.44),smoothstep(-.08,.9,h));float band=sin(vP.x*.007+vP.z*.009+sin(time*.12)*.35)*.025;vec3 storm=mix(vec3(.66,.34,.16),vec3(.35,.27,.25),smoothstep(-.05,.9,h));gl_FragColor=vec4(mix(clear,storm,severity)+band,1.);}'}),0,0,-130);
  this.terrain();
  for(const surface of this.surfaces){
   if(surface.id.includes('gate')||surface.id.includes('bridge')||surface.id==='dune-descent-ramp'){
    const group=this.bridge(surface);this.scene.add(group);
    if(surface.id.includes('gate')){const barrier=this.mesh(new T.BoxGeometry(surface.w>surface.d?1:surface.w,2,surface.w>surface.d?surface.d:1),this.ink,surface.x,surface.y+(surface.rise??0)/2+1,surface.z);this.gates.push({surface,group,barrier});group.visible=false;}
    if(surface.id==='dune-descent-ramp'){group.visible=false;this.finalGroups.push(group);}
   }else this.plateau(surface);
  }
  this.guide.group.position.set(DUNE_GUIDE.x,DUNE_GUIDE.y,DUNE_GUIDE.z);this.archivist.group.position.set(-72,12,-29);this.observer.group.position.set(81,4,-137);
  for(const npc of [this.guide,this.archivist,this.observer]){npc.needle.visible=false;this.scene.add(npc.group);}this.scene.add(this.hero.group);
  this.sign('赤砂档案海','05 / LEDGER MIRROR - THE ARCHIVE DUNES',-63,12,78,13,4);
  this.sign('NOOR / 值班工程师','DO NOT LOSE A COMMITTED PROMISE',-65,8.4,103,7,2.4);
  this.sign('SAFFRON / 档案员','COMMIT IS A PROMISE',-73,16,-31,9,2.8);this.sign('KITE / 信使','DELIVERY MUST SURVIVE THE PROCESS',82,8.4,-139,9,2.8);
  for(const [i,id] of DUNE_CASES.entries()){
   const p=DUNE_POS[id],group=new T.Group();this.scene.add(group);
   this.box(this.ink,p.x,p.y+.8,p.z,2.9,1.6,1.7);this.box(this.mirror,p.x,p.y+1.7,p.z,3.1,.16,1.9);
   this.lamps.set(id,this.mesh(new T.OctahedronGeometry(.34,0),this.red,p.x+1.3,p.y+2.1,p.z));
   this.sign(id,['INVENTORY / ORDERS','IDEMPOTENCY / RECEIPTS','TWO SELECTS / ONE VIEW','WAL / PAGE LSN','EXPAND / BACKFILL','OUTBOX / CONSUMER','CACHE / GENERATION','POOL / CANCELLATION','IMPORT / SOURCE VERSION','P99 / BUCKET COUNTS'][i],p.x,p.y+5.5,p.z-3,9,3);
   this.signs.set(id,this.sign('INCIDENT OPEN','Q / TRACE THE FIRST BROKEN INVARIANT',p.x+7,p.y+2.8,p.z-1,5.5,2.3));
   const bars:T.Mesh[]=[];for(let k=0;k<5;k++)bars.push(this.mesh(new T.BoxGeometry(1.1,.25,1.8),this.dim,p.x-4+k*1.4,p.y+2.8,p.z-6));this.bars.set(id,bars);
   if(DUNE_BURIED.includes(id)){for(let k=0;k<4;k++){const glyph=this.mesh(new T.TorusGeometry(2+k*.55,.08,4,32),new T.MeshBasicMaterial({color:C.cyan,transparent:true,opacity:.1}),p.x,p.y+.12+k*.15,p.z,group);glyph.rotation.x=-Math.PI/2;}this.buried.push(group);}
  }
  for(const [i,shade] of DUNE_SHADE.entries()){
   const y=i===0?4:Object.values(DUNE_POS)[i-1]?.y??(i===DUNE_SHADE.length-1?-12:4);
   if(i<7){const x=shade.x+(i===0?13:-14),z=shade.z+8;for(const side of [-1,1])this.box(this.ink,x+side*6,y+3.8,z,.2,7.6,.2);this.mesh(new T.ConeGeometry(9,2,4,1,true),new T.MeshStandardMaterial({color:'#34454c',side:T.DoubleSide,roughness:.9}),x,y+8,z).rotation.y=Math.PI/4;}
   const ring=this.mesh(new T.RingGeometry(shade.radius-.08,shade.radius,48),new T.MeshBasicMaterial({color:C.gold,transparent:true,opacity:.22,side:T.DoubleSide,depthWrite:false}),shade.x,y+.025,shade.z);ring.rotation.x=-Math.PI/2;
  }
  // Monument silhouettes deliberately avoid the tower/dish forms of previous cities.
  this.pyramid(0,4,-252,54,48);this.arch(-48,4,63,19);this.arch(57,12,-36,12);
  for(const [x,z,y] of [[83,-10,12],[-80,-8,12],[-72,-144,4],[85,-147,4]]){this.box(this.ink,x,y+11,z,5,22,3);this.solids.push(new T.Box3(new T.Vector3(x-2.6,y,z-1.6),new T.Vector3(x+2.6,y+22,z+1.8)));this.obstacles.push({x,z,w:5,d:3.4,bottom:y,top:y+22});this.box(this.mirror,x,y+12,z+1.55,3.8,18,.15);for(let k=0;k<7;k++)this.box(this.gold,x,y+3+k*2.8,z+1.7,3.8,.08,.08);}
  this.sign('ROLLBACK / 值班台','SIX DATABASE SYSTEMS + ONE RELIABLE NETWORK',65,11,-248,22,5.8);
  this.sign('档案井入口','REHEARSE THE FAILURE BEFORE YOU PROMOTE',65,8,-256,13,3.2);
  // Retaining walls connect the city datum to the lower archive, leaving the central ramp clear.
  for(const x of [31,99]){
   this.box(this.stone,x,-4.3,-312,8,20.2,118);this.box(this.sand,x,5.9,-312,8,.2,118);
   this.obstacles.push({x,z:-312,w:8,d:118,bottom:-14.4,top:5.8});this.solids.push(new T.Box3(new T.Vector3(x-4,-14.4,-371),new T.Vector3(x+4,5.8,-253)));
   for(let k=0;k<6;k++)this.box(this.mirror,x===31?35.08:94.92,-4.5,-265-k*18,.14,13,11);
  }
  this.box(this.stone,65,-4.3,-374,76,20.2,8);this.box(this.sand,65,5.9,-374,76,.2,8);
  this.obstacles.push({x:65,z:-374,w:76,d:8,bottom:-14.4,top:5.8});this.solids.push(new T.Box3(new T.Vector3(27,-14.4,-378),new T.Vector3(103,5.8,-370)));
  this.crown=new T.Group();this.crown.position.set(DUNE_CORE.x,-7,DUNE_CORE.z);this.scene.add(this.crown);
  for(let i=0;i<6;i++){const a=i*Math.PI/3,mirror=this.mesh(new T.BoxGeometry(3,14,.35),this.mirror,Math.cos(a)*13,3,Math.sin(a)*13,this.crown);mirror.rotation.y=-a;}
  this.sign('r43 / 档案之心','E / SWITCH THE VERIFIED RELEASE',65,-7,-355,12,3.4);
  this.water=this.mesh(new T.PlaneGeometry(36,27,20,20),new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{time:{value:0},strength:{value:.1}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec2 vUv;uniform float time;uniform float strength;void main(){float r=sin(vUv.x*60.+time*.5)*sin(vUv.y*70.-time*.6);vec3 c=mix(vec3(.03,.19,.24),vec3(.08,.69,.76),strength);gl_FragColor=vec4(c+r*.025,.92);}'}),65,-11.96,-347);this.water.rotation.x=-Math.PI/2;
  this.dust=this.makeDust(false);this.groundDust=this.makeDust(true);this.scene.add(this.dust,this.groundDust);
  this.sun=this.mesh(new T.SphereGeometry(24,24,16),new T.MeshBasicMaterial({color:'#ffb35b',fog:false,transparent:true,opacity:.95}),-220,94,-520);
  this.scan=this.mesh(new T.RingGeometry(.98,1,64),new T.MeshBasicMaterial({color:C.cyan,transparent:true,side:T.DoubleSide,opacity:0,depthWrite:false}),0,0,0);this.scan.rotation.x=-Math.PI/2;
  this.flush(this.batches,this.scene);
 }
 private mesh(g:T.BufferGeometry,m:T.Material,x:number,y:number,z:number,parent:T.Object3D=this.scene):T.Mesh{const mesh=new T.Mesh(g,m);mesh.position.set(x,y,z);parent.add(mesh);return mesh;}
 private box(m:T.Material,x:number,y:number,z:number,w:number,h:number,d:number,ry=0,batches=this.batches){if(!batches.has(m))batches.set(m,[]);batches.get(m)!.push([x,y,z,w,h,d,ry]);}
 private flush(b:Map<T.Material,Box[]>,parent:T.Object3D){for(const [m,boxes] of b){const mesh=new T.InstancedMesh(this.unit,m,boxes.length);boxes.forEach(([x,y,z,w,h,d,ry],i)=>{this.dummy.position.set(x,y,z);this.dummy.scale.set(w,h,d);this.dummy.rotation.set(0,ry??0,0);this.dummy.updateMatrix();mesh.setMatrixAt(i,this.dummy.matrix);});mesh.computeBoundingSphere();parent.add(mesh);}b.clear();}
 private sign(title:string,sub:string,x:number,y:number,z:number,w:number,h:number){const mesh=this.mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map:signTexture(title,sub),side:T.DoubleSide}),x,y,z);this.box(this.ink,x-w*.39,y-h/2-1.2,z-.1,.12,2.4,.12);this.box(this.ink,x+w*.39,y-h/2-1.2,z-.1,.12,2.4,.12);return mesh;}
 private write(sign:T.Mesh,title:string,sub:string){const m=sign.material as T.MeshBasicMaterial;m.map?.dispose();m.map=signTexture(title,sub);m.needsUpdate=true;}
 private plateau(s:Surface){const height=s.y+23;this.box(this.stone,s.x,s.y-height/2-.3,s.z,s.w,height,s.d);this.box(this.sand,s.x,s.y-.16,s.z,s.w,.32,s.d);
  for(let row=0;row<4;row++){const y=s.y-3-row*5;this.box(this.ink,s.x,y,s.z+s.d/2+.06,s.w,.18,.16);this.box(this.ink,s.x+s.w/2+.06,y,s.z,.16,.18,s.d);for(let k=0;k<4;k++){this.box(this.mirror,s.x-s.w*.36+k*s.w*.24,y-1.9,s.z+s.d/2+.1,s.w*.18,3.3,.12);this.box(this.mirror,s.x+s.w/2+.1,y-1.9,s.z-s.d*.36+k*s.d*.24,.12,3.3,s.d*.18);}}
  for(let i=0;i<4;i++)this.box(this.ink,s.x-s.w/2+1.5+i*(s.w-3)/3,s.y+.02,s.z-s.d/2+1,.2,.05,2.5);
 }
 private bridge(s:Surface){const group=new T.Group(),rise=s.rise??0,mesh=this.mesh(new T.BoxGeometry(s.w,.6,Math.hypot(s.d,rise)),this.ink,s.x,s.y+rise/2-.31,s.z,group);mesh.rotation.x=Math.atan2(rise,s.d);const deck=this.mesh(new T.BoxGeometry(s.w-.5,.07,Math.hypot(s.d,rise)-.3),this.mirror,s.x,s.y+rise/2+.015,s.z,group);deck.rotation.x=mesh.rotation.x;
  const alongX=s.w>s.d,length=alongX?s.w:s.d;for(let t=-length/2+1;t<length/2;t+=5){const f=(t+length/2)/length,x=s.x+(alongX?t:0),z=s.z+(alongX?0:t),y=s.y+rise*(1-f);this.mesh(new T.BoxGeometry(alongX?.15:s.w,.08,alongX?s.d:.15),this.gold,x,y+.08,z,group);}return group;
 }
 private terrain(){const g=new T.PlaneGeometry(1500,1150,100,80),a=g.getAttribute('position');for(let i=0;i<a.count;i++){const x=a.getX(i),z=a.getY(i),worldZ=-z-120,bowl=25*Math.exp(-((x-65)**2/2400+(worldZ+320)**2/7000));a.setZ(i,-25-bowl+Math.pow(.5+.5*Math.sin(x*.025+Math.sin(z*.013)*1.7),2)*13+Math.sin(z*.021+x*.007)*4);}g.computeVertexNormals();const ground=this.mesh(g,new T.MeshStandardMaterial({color:'#bd7040',roughness:1}),0,0,-120);ground.rotation.x=-Math.PI/2;
  const rock=new T.CylinderGeometry(.5,1,1,5);for(let i=0;i<23;i++){const angle=i*.618*Math.PI*2,r=260+i%6*25,h=25+i*19%70,mesh=this.mesh(rock,i%4?this.stone:this.sand,Math.cos(angle)*r,h/2-22,-120+Math.sin(angle)*r);mesh.scale.set(22+i%5*11,h,22+i%7*8);mesh.rotation.y=i*.37;}
  const dune=new T.SphereGeometry(1,32,12,0,Math.PI*2,0,Math.PI/2);for(let i=0;i<18;i++){const a=i*.618*Math.PI*2,mesh=this.mesh(dune,this.sand,Math.cos(a)*(230+i%3*55),-23,-130+Math.sin(a)*(270+i%4*35));mesh.scale.set(55+i%5*13,16+i%4*5,34+i%3*10);mesh.rotation.y=i*.51;}
  for(let i=0;i<12;i++){const x=(i%2?-1:1)*(165+i%3*18),z=70-i*32;this.box(this.ink,x,-2,z,3,29+i%4*5,2,i*.2);this.box(this.mirror,x,-1,z+1.1,2,26,0.1,i*.2);}
 }
 private pyramid(x:number,y:number,z:number,size:number,height:number){const p=this.mesh(new T.ConeGeometry(size,height,4),this.ink,x,y+height/2,z);p.rotation.y=Math.PI/4;for(let i=0;i<8;i++){const h=height*(i+.5)/8,r=size*(1-h/height);const ring=this.mesh(new T.TorusGeometry(r,.11,4,4),i%2?this.gold:this.cyan,x,y+h,z);ring.rotation.x=Math.PI/2;ring.rotation.z=Math.PI/4;}}
 private arch(x:number,y:number,z:number,r:number){const ring=this.mesh(new T.TorusGeometry(r,1.3,6,48,Math.PI),this.ink,x,y,z);ring.rotation.z=0;this.mesh(new T.TorusGeometry(r-.9,.12,4,48,Math.PI),this.cyan,x,y,z+.8);}
 private makeDust(ground:boolean){const count=ground?500:2300,p=new Float32Array(count*3);let seed=391;for(let i=0;i<count;i++){const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return(seed>>>0)/4294967296;};p.set([(rand()-.5)*120,rand()*(ground?3:45),(rand()-.5)*120],i*3);}const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(p,3));const m=new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{time:{value:0},severity:{value:0},lens:{value:0}},vertexShader:`uniform float time;uniform float severity;varying float fade;void main(){vec3 p=position;p.x=mod(p.x+60.+time*(2.+severity*17.),120.)-60.;p.y+=sin(time+p.z*.1)*.4;vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(${ground?'240.':'130.'}/max(1.,-mv.z),1.,${ground?'20.':'7.'});fade=severity*${ground?'.18':'.5'};}`,fragmentShader:'uniform float lens;varying float fade;void main(){float d=length(gl_PointCoord-.5);if(d>.5)discard;gl_FragColor=vec4(.83,.48,.22,(1.-smoothstep(.05,.5,d))*fade*(1.-lens*.72));}'});const points=new T.Points(g,m);points.frustumCulled=false;return points;}
 setProgress(s:DuneProgress){this.solved=new Set(s.completed);this.complete=s.phase==='complete';this.weather=s.weather;this.gates.forEach((g,i)=>{g.surface.enabled=this.solved.has(DUNE_MAIN[i]);g.group.visible=g.surface.enabled;g.barrier.visible=!g.surface.enabled;});const opened=['descent','complete'].includes(s.phase);for(const surface of this.surfaces)if(surface.id.startsWith('dune-descent')||surface.id==='dune-archive-core')surface.enabled=opened;this.finalGroups.forEach(g=>g.visible=opened);this.lamps.forEach((lamp,id)=>lamp.material=this.solved.has(id)?this.cyan:this.red);const signature=s.completed.join(',');if(signature!==this.signature&&!this.lastTrace){this.signature=signature;this.resetDisplays();}}
 private resetDisplays(){this.signs.forEach((sign,id)=>this.write(sign,this.solved.has(id)?'COMMITTED / VERIFIED':'INCIDENT OPEN',this.solved.has(id)?'INVARIANTS HOLD / REPLAY AVAILABLE':'Q / TRACE THE BROKEN INVARIANT'));this.bars.forEach((bars,id)=>bars.forEach(b=>b.material=this.solved.has(id)?this.cyan:this.dim));}
 present(id:DuneCase,run:DuneRun,fixture:number,cursor:number){const key=`${run.runId}/${fixture}/${cursor}`;if(key===this.lastTrace)return;this.lastTrace=key;const log=run.traces[fixture]?.log??[],e=log[cursor];if(!e)return;this.write(this.signs.get(id)!,e.actor,`${e.tick} / ${e.kind}`);this.bars.get(id)?.forEach((b,i)=>{b.material=i===cursor%5?this.gold:i<cursor%5?this.cyan:this.dim;});}
 clearTrace(){if(this.lastTrace){this.lastTrace='';this.resetDisplays();}}
 scanAtPosition(p:V3){this.scanAt=this.time;this.scan.position.set(p.x,p.y+.04,p.z);}
 setQuality(low:boolean){this.dust.geometry.setDrawRange(0,low?700:2300);this.groundDust.geometry.setDrawRange(0,low?140:500);}
 update(dt:number,hero:V3,speed:number,_frozen:boolean,reduced:boolean){
  this.time+=dt;this.severity=T.MathUtils.damp(this.severity,this.weather==='sun'?0:this.weather==='haze'?.35:1,reduced?8:1.5,dt);
  const stride=Math.sin(this.time*Math.max(4,speed*1.7))*Math.min(.45,speed*.07),wind=duneWind(this.weather,this.environmentTime);
  this.hero.group.position.set(hero.x,hero.y,hero.z);this.hero.group.rotation.z=this.braced?-.07:-wind.x*.02;this.hero.leftLeg.rotation.x=stride;this.hero.rightLeg.rotation.x=-stride;this.hero.leftArm.rotation.x=-stride*.6;
  this.guide.head.rotation.y=.2+(reduced?0:Math.sin(this.time*.3)*.1);const color=new T.Color('#d68a54').lerp(new T.Color('#986038'),this.severity);(this.scene.background as T.Color).copy(color);
  if(this.scene.fog instanceof T.FogExp2){this.scene.fog.color.copy(color);this.scene.fog.density=.0025+this.severity*.012*(this.lens?.5:1);}
  const sky=this.sky.material as T.ShaderMaterial;sky.uniforms.severity.value=this.severity;sky.uniforms.time.value=reduced?0:this.time;
  (this.sun.material as T.MeshBasicMaterial).opacity=1-this.severity*.87;
  for(const points of [this.dust,this.groundDust]){points.position.set(hero.x,points===this.groundDust?hero.y+.04:hero.y-2,hero.z);const m=points.material as T.ShaderMaterial;m.uniforms.time.value=reduced?this.time*.2:this.time;m.uniforms.severity.value=.05+this.severity;m.uniforms.lens.value=Number(this.lens);}
  this.buried.forEach(g=>{g.visible=this.lens&&this.weather==='storm';g.children.forEach(m=>((m as T.Mesh).material as T.MeshBasicMaterial).opacity=.5+Math.sin(this.time*2)*.15);});
  const age=this.time-this.scanAt;this.scan.visible=age<2;this.scan.scale.setScalar(1+age*12);(this.scan.material as T.MeshBasicMaterial).opacity=Math.max(0,.6-age*.3);
  const water=this.water.material as T.ShaderMaterial;water.uniforms.time.value=reduced?0:this.time;water.uniforms.strength.value=this.complete?1:.08;this.crown.rotation.y=reduced?0:Math.sin(this.time*.08)*.06;
 }
}

import * as T from 'three';
import { CityWorld, NODE_POS, STATION_POS } from './world';
import type { Settings, Station } from './domain';
import type { V3 } from './physics';
import { PulseWorld } from './pulse-world';
import { WeatherRig } from './weather';
import type { Weather } from './forge-domain';
import { ThreadWorld } from './thread-world';
import { SnowWorld } from './snow-world';
import { DuneWorld } from './dune-world';
import { followCameraPosition } from './camera-collision';

export type ViewMode = 'menu' | 'follow' | 'order' | 'rail' | 'recovery' | 'ride' | 'result' | 'forge-arrival' | 'forge-power' | 'forge-alu' | 'forge-rise' | 'forge-result' | 'thread-arrival' | 'thread-device' | 'thread-audit' | 'thread-ride' | 'thread-result' | 'snow-arrival' | 'snow-device' | 'snow-audit' | 'snow-final' | 'snow-result' | 'dune-arrival' | 'dune-device' | 'dune-audit' | 'dune-result';
export class CityView {
  renderer: T.WebGLRenderer;
  camera = new T.PerspectiveCamera(62,1,.15,1300);
  world = new CityWorld();
  dockWeather = new WeatherRig(this.world.scene,false,this.world.sky,this.world.rain);
  forge: PulseWorld | null = null;
  thread: ThreadWorld | null = null;
  snow: SnowWorld | null = null;
  dune: DuneWorld | null = null;
  city: 'dock' | 'forge' | 'thread' | 'snow' | 'dune' = 'dock';
  weather: Weather = 'rain';
  mode: ViewMode = 'menu';
  yaw = 0;
  pitch = .34;
  fps = 0;
  frameMs = 0;
  private raycaster = new T.Raycaster();
  private desired = new T.Vector3();
  private target = new T.Vector3();
  private look = new T.Vector3(9,20,-46);
  private sampleTime = 0;
  private frames = 0;
  private elapsed = 0;
  private warmup = true;
  private settings: Settings;
  private width = 1;
  private height = 1;
  constructor(host: HTMLElement, settings: Settings) {
    this.settings=settings;
    this.renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
    this.renderer.outputColorSpace=T.SRGBColorSpace;
    this.renderer.toneMapping=T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure=1.28;
    this.renderer.domElement.id='city-canvas';
    this.renderer.domElement.setAttribute('aria-label','指针港三维游戏场景；WASD 移动，右键拖动视角，Q 扫描，E 互动');
    this.renderer.domElement.tabIndex=0;
    host.appendChild(this.renderer.domElement);
    this.camera.position.set(6,27,55);
    this.camera.lookAt(this.look);
    this.applySettings(settings);
    this.resize();
    window.addEventListener('resize',()=>this.resize());
  }
  applySettings(settings: Settings): void {
    this.settings=settings;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,settings.quality==='low'?1:1.65));
    this.world.setQuality(settings.quality==='low');
    this.dockWeather.setQuality(settings.quality==='low');this.forge?.setQuality(settings.quality==='low');this.thread?.setQuality(settings.quality==='low');this.snow?.setQuality(settings.quality==='low');this.dune?.setQuality(settings.quality==='low');
  }
  switchCity(city:'dock'|'forge'|'thread'|'snow'|'dune'):void {
    this.city=city;
    if(city==='forge'&&!this.forge){this.forge=new PulseWorld();this.forge.setQuality(this.settings.quality==='low');}
    if(city==='thread'&&!this.thread){this.thread=new ThreadWorld();this.thread.setQuality(this.settings.quality==='low');}
    if(city==='snow'&&!this.snow){this.snow=new SnowWorld();this.snow.setQuality(this.settings.quality==='low');}
    if(city==='dune'&&!this.dune){this.dune=new DuneWorld();this.dune.setQuality(this.settings.quality==='low');}
    this.warmup=true;
    this.renderer.domElement.setAttribute('aria-label',`${city==='dune'?'镜库城赤砂档案海':city==='snow'?'雨线城白噪雪原':city==='thread'?'千线程':city==='forge'?'脉冲炉':'指针港'}三维场景；WASD 移动，右键看四周，Q 扫描，E 互动${city==='dune'?'，G 偏振显影，F 稳身':city==='snow'?'，F 稳身抗风':''}`);
  }
  resize(): void {
    this.width=window.innerWidth;this.height=window.innerHeight;
    this.renderer.setSize(this.width,this.height);this.camera.aspect=this.width/this.height;this.camera.updateProjectionMatrix();
  }
  turn(dx: number,dy: number): void {
    this.yaw-=dx*.004*this.settings.sensitivity;
    this.pitch=Math.max(.12,Math.min(.85,this.pitch+dy*.003*this.settings.sensitivity));
  }
  project(p: V3): {x:number;y:number;visible:boolean} {
    const point=new T.Vector3(p.x,p.y,p.z).project(this.camera);
    return {x:(point.x*.5+.5)*this.width,y:(-.5*point.y+.5)*this.height,visible:point.z<1&&point.z>-1&&Math.abs(point.x)<1.15&&Math.abs(point.y)<1.15};
  }
  pickStation(x: number,y: number): Station | null {
    this.raycaster.setFromCamera(new T.Vector2(x/this.width*2-1,1-y/this.height*2),this.camera);
    const hit=this.raycaster.intersectObjects(this.world.nodes.children,false)[0];
    if(hit)return hit.object.userData.station as Station;
    // Generous screen-space touch target around the actual 3D node.
    let best:Station|null=null;let distance=54;
    for(const [id,p] of Object.entries(NODE_POS)) {
      const screen=this.project(p);const d=Math.hypot(screen.x-x,screen.y-y);
      if(screen.visible&&d<distance){best=id as Station;distance=d;}
    }
    return best;
  }
  render(dt: number,hero: V3,speed: number,paused: boolean): void {
    this.elapsed+=dt;
    const active=this.city==='dune'&&this.dune?this.dune:this.city==='snow'&&this.snow?this.snow:this.city==='thread'&&this.thread?this.thread:this.city==='forge'&&this.forge?this.forge:this.world;
    if(this.city==='thread'&&this.thread)this.thread.weather.weather=this.weather;
    if(this.city==='forge'&&this.forge)this.forge.weather.weather=this.weather;
    active.update(paused?0:dt,hero,paused?0:speed,paused||this.mode==='order'||this.mode==='rail',this.settings.reducedMotion);
    if(active===this.world){this.dockWeather.weather=this.weather;this.dockWeather.update(paused?0:dt,hero,this.settings.reducedMotion,this.world.surfaces);}
    this.world.nodes.visible=this.mode==='rail';
    if(this.mode==='menu') {
      const drift=this.settings.reducedMotion?0:Math.sin(this.elapsed*.07)*1.8;
      this.desired.set(6+drift,27,55);this.target.set(14,26,-70);
    } else if(this.mode==='dune-arrival') {
      this.desired.set(-108,58,159);this.target.set(5,10,-52);
    } else if(this.mode==='dune-device'&&this.dune) {
      const p=this.dune.focus;this.desired.set(p.x+26,p.y+21,p.z+27);this.target.set(p.x+2,p.y+3,p.z-4);
    } else if(this.mode==='dune-audit') {
      this.desired.set(119,62,-192);this.target.set(30,9,-275);
    } else if(this.mode==='dune-result') {
      this.desired.set(133,35,-299);this.target.set(59,-2,-342);
    } else if(this.mode==='snow-arrival') {
      this.desired.set(-141,52,133);this.target.set(-40,8,3);
    } else if(this.mode==='snow-device'&&this.snow) {
      const p=this.snow.focus;this.desired.set(p.x-23,p.y+19,p.z+26);this.target.set(p.x-2,p.y+3.5,p.z-4);
    } else if(this.mode==='snow-audit') {
      this.desired.set(31,42,-130);this.target.set(-14,6,-219);
    } else if(this.mode==='snow-final'||this.mode==='snow-result') {
      this.desired.set(-61,42,-262);this.target.set(-109,14,-319);
    } else if(this.mode==='thread-arrival') {
      this.desired.set(-24,72,78);this.target.set(0,39,-104);
    } else if(this.mode==='thread-device'&&this.thread) {
      const p=this.thread.focus;
      this.desired.set(p.x+23,p.y+19,p.z+29);this.target.set(p.x+1,p.y+4,p.z-1);
    } else if(this.mode==='thread-audit') {
      this.desired.set(38,66,-153);this.target.set(0,42,-187);
    } else if(this.mode==='thread-ride') {
      const outward=new T.Vector3(hero.x,0,hero.z+120).normalize();
      this.desired.set(hero.x+outward.x*35,hero.y+16,hero.z+outward.z*35);
      this.target.set(hero.x*.65,hero.y+3,-120+(hero.z+120)*.65);
    } else if(this.mode==='thread-result') {
      this.desired.set(88,104,-32);this.target.set(1,46,-116);
    } else if(this.mode==='forge-arrival') {
      this.desired.set(-25,58,65);this.target.set(5,31,-62);
    } else if(this.mode==='forge-power') {
      this.desired.set(this.width<700?20:24,19,29);this.target.set(0,7,5);
    } else if(this.mode==='forge-alu') {
      this.desired.set(this.width<700?-24:-28,56,-35);this.target.set(9,39,-81);
    } else if(this.mode==='forge-rise') {
      this.desired.set(-30,hero.y+20,-53);this.target.set(7,hero.y+4,-86);
    } else if(this.mode==='forge-result') {
      this.desired.set(-35,86,-18);this.target.set(10,37,-73);
    } else if(this.mode==='rail') {
      // The central corridor avoids dock towers occluding the editable rail geometry.
      if(this.width<700){this.desired.set(28,164,27);this.target.set(28,13,-35);}
      else if(this.width<1000){this.desired.set(24,110,12);this.target.set(24,13,-45);}
      else {this.desired.set(24,105,6);this.target.set(24,13,-69);}
    } else if(this.mode==='order') {
      this.desired.set(17,15,19);this.target.set(0,3,-1);
    } else if(this.mode==='recovery') {
      this.desired.set(67,49,-6);this.target.set(24,17,-68);
    } else if(this.mode==='result') {
      this.desired.set(62,37,-57);this.target.set(23,20,-89);
    } else {
      const distance=this.city==='dune'?(this.width<700?13:11.8):this.city==='snow'?(this.width<700?13:11.5):this.width<700?10.5:8.8;
      this.target.set(hero.x,hero.y+1.55,hero.z);
      const yaw=this.mode==='ride'?-.75:this.yaw;
      this.desired.set(hero.x+Math.sin(yaw)*distance,hero.y+2.2+Math.sin(this.pitch)*distance,hero.z+Math.cos(yaw)*distance);
      this.desired.copy(followCameraPosition(this.target,this.desired,active.solids));
    }
    const response=this.warmup?1:1-Math.exp(-dt*(this.settings.reducedMotion?14:5));
    this.camera.position.lerp(this.desired,response);this.look.lerp(this.target,response);this.camera.lookAt(this.look);
    const fov=this.city==='snow'||this.city==='dune'?67:this.mode==='rail'?53:this.mode==='order'?54:62;
    if(Math.abs(this.camera.fov-fov)>.01){this.camera.fov=T.MathUtils.damp(this.camera.fov,fov,5,dt);this.camera.updateProjectionMatrix();}
    this.renderer.render(active.scene,this.camera);this.warmup=false;
    this.frames++;this.sampleTime+=dt;
    if(this.sampleTime>=1){this.fps=Math.round(this.frames/this.sampleTime);this.frameMs=this.sampleTime/this.frames*1000;this.frames=0;this.sampleTime=0;}
  }
  getDrawStats(): {calls:number;triangles:number;geometries:number;textures:number} {
    const info=this.renderer.info;return {calls:info.render.calls,triangles:info.render.triangles,geometries:info.memory.geometries,textures:info.memory.textures};
  }
  getStationScreen(id: Station): ReturnType<CityView['project']> {return this.project(NODE_POS[id]);}
  stationPosition(id: Station): V3 {return {...STATION_POS[id]};}
}

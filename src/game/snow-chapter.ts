import type { Campaign } from './domain';
import { SnowCampaign, SNOW_CASES, SNOW_MAIN, SNOW_SIDE, SNOW_WEATHERS, SNOW_WEATHER_NAMES, freshSnow, snowUnlocked, type SnowCase, type SnowPatches, type SnowRun, type SnowWeather } from './snow-domain';
import { SNOW_AUDIT, SNOW_BOUNDS, SNOW_GUIDE, SNOW_POS, SNOW_POSTS, inSnowShelter, snowCheckpoint, snowForces, snowWind } from './snow-layout';
import { SNOW_CONTROLS, SNOW_LESSONS } from './snow-content';
import { STILL_AIR, type Motor, type V3 } from './physics';
import type { CityView } from './view';
import type { CityAudio } from './audio';
import './snow.css';

const $ = (id:string):HTMLElement => document.getElementById(id)!;
const show = (id:string,on:boolean):void => { $(id).hidden=!on; };
const text = (id:string,value:string):void => { $(id).textContent=value; };
const distance = (a:V3,b:V3):number => Math.hypot(a.x-b.x,a.z-b.z);
const phaseCases = {wind:'WF-02',route:'NET-01',reliable:'NET-02',congestion:'NET-03',clock:'NET-04'} as const;
interface Hooks {campaign:()=>Campaign;view:CityView;motor:Motor;audio:CityAudio;block:(on:boolean)=>void;clearInput:()=>void;persist:()=>void;toast:(message:string,seconds?:number)=>void;returnThread:()=>void;enterDune:()=>void;openMap:()=>void;braceHeld:()=>boolean}
type Cinema = {kind:'arrival'|'repair'|'audit'|'shuttle'|'ending';age:number;id?:SnowCase;target?:V3};
export class SnowChapter {
  panel:SnowCase|null=null; journal=false; result=false; dialogue=-1; cinema:Cinema|null=null;
  private draft:SnowPatches=freshSnow().patches;
  private trace:{run:SnowRun;fixture:number;cursor:number;playing:boolean;age:number}|null=null;
  private tracked:SnowCase|null=null; private hintCounts:Partial<Record<SnowCase,number>>={};
  private motionTime=0; private hudAge=0; private braceToggle=false;
  private get state(){return this.h.campaign().data.snow;}
  private get authority(){return new SnowCampaign(this.state);}
  get active():boolean{return this.h.view.city==='snow';}
  get blocked():boolean{return this.panel!==null||this.journal||this.result||this.dialogue>=0||this.cinema!==null;}
  get braced():boolean{return this.braceToggle||this.h.braceHeld();}
  constructor(private h:Hooks){
    const root=document.createElement('div');root.id='snow-layer';root.hidden=true;
    root.innerHTML=`<nav id="snow-weather" aria-label="雪原天气"><span>POLAR WEATHER</span>${SNOW_WEATHERS.map(w=>`<button data-snow-weather="${w}" aria-pressed="false">${w==='calm'?'☀':w==='snow'?'✣':'≋'} ${SNOW_WEATHER_NAMES[w]}</button>`).join('')}</nav>
      <aside id="snow-wind-status"><span id="snow-wind-arrow">↗</span><div><b id="snow-wind-label">雪原风况</b><small id="snow-wind-description"></small></div></aside>
      <nav id="snow-field-tools" aria-label="雪原旅行"><button id="snow-survey">勘测册 <kbd>M</kbd> <b id="snow-task-count">0 / 8</b></button><button id="snow-field-return">← 千线程</button></nav>
      <button id="snow-brace" aria-pressed="false"><span>⌁</span> 稳身 <kbd>F</kbd><small>点按切换 / 按住 F</small></button>
      <section id="snow-editor" hidden role="dialog" aria-modal="true" aria-labelledby="snow-case-title"><header><span>FIELD SERVICE / 现场维修册</span><button id="snow-close" class="snow-close" aria-label="关闭雪原工作台">×</button></header><div class="snow-scroll"><div id="snow-task"></div><div id="snow-controls"></div><section id="snow-trace" hidden><div class="snow-trace-heading"><label>回归情景<select id="snow-trace-select"></select></label><div><button id="snow-step">执行一步 →</button><button id="snow-auto">暂停回放 Ⅱ</button></div></div><span id="snow-trace-label"></span><pre id="snow-current-event"></pre><ol id="snow-event-list"></ol></section><section id="snow-report" hidden aria-live="polite"></section></div><footer><button id="snow-preview">预演与观测 ↗</button><button id="snow-verify" class="snow-primary">运行完整验证 <kbd>R</kbd> →</button></footer></section>
      <section id="snow-journal" hidden role="dialog" aria-modal="true" aria-labelledby="snow-journal-title"><header><div><span>EXPEDITION FIELD BOOK / 04</span><h2 id="snow-journal-title">白噪雪原 · 勘测册</h2></div><button id="snow-journal-close" class="snow-close" aria-label="关闭雪原勘测册">×</button></header><p id="snow-journal-description"></p><div class="snow-survey-layout"><div id="snow-survey-map"></div><div id="snow-journal-grid"></div></div><footer><button id="snow-main-track">回到当前主线 →</button><button id="snow-city-map">城际地图 ↗</button></footer></section>
      <section id="snow-dialog" hidden><span>KESTREL / 雪原信使</span><p id="snow-dialog-text"></p><button id="snow-dialog-next">继续 <kbd>E</kbd> →</button></section>
      <div id="snow-cinema" hidden><span id="snow-cinema-kicker"></span><div><h2 id="snow-cinema-title"></h2><p id="snow-cinema-text"></p><button id="snow-skip">跳过镜头 →</button></div></div>
      <section id="snow-result" hidden><div class="snow-result-card"><span>CHAPTER 04 / PACKET RAIN</span><div class="snow-result-code">200 <small>OK</small></div><h2>穿过风雪，<br>你的声音已抵达。</h2><p id="snow-ending"></p><div id="snow-result-stats"></div><button id="snow-next-city" class="snow-primary">下一站 · 赤砂档案海 →</button><button id="snow-roam" class="snow-primary">留在雪原，看一场极光 ↗</button><div class="snow-result-links"><button id="snow-result-journal">打开勘测册 · 补齐故事 →</button><button id="snow-deliver-again">再次穿越风暴 ↗</button><button id="snow-return">乘雪地车返回千线程 →</button><button id="snow-replay">重新修复第四城 ↶</button></div><small class="snow-next">05 / 08 城市已开放<br>下一站 · 赤砂档案海 / 已开放</small></div></section>`;
    $('app').append(root);
    $('snow-close').onclick=()=>this.closePanel();$('snow-preview').onclick=()=>this.preview();$('snow-verify').onclick=()=>this.verify();
    $('snow-step').onclick=()=>this.stepTrace();$('snow-auto').onclick=()=>{if(this.trace){this.trace.playing=!this.trace.playing;this.renderTrace();}};
    ($('snow-trace-select') as HTMLSelectElement).onchange=e=>{if(!this.trace)return;this.trace.fixture=Number((e.target as HTMLSelectElement).value);this.trace.cursor=0;this.trace.playing=false;this.renderTrace();};
    root.querySelectorAll<HTMLButtonElement>('[data-snow-weather]').forEach(b=>b.onclick=()=>this.setWeather(b.dataset.snowWeather as SnowWeather));
    $('snow-brace').onclick=()=>{this.braceToggle=!this.braceToggle;this.updateHud();};
    $('snow-survey').onclick=()=>this.openJournal();$('snow-journal-close').onclick=()=>this.closeJournal();
    $('snow-main-track').onclick=()=>{this.tracked=null;this.closeJournal();this.updateHud();};
    $('snow-city-map').onclick=()=>{this.closeJournal();this.h.openMap();};
    $('snow-dialog-next').onclick=()=>this.advanceDialogue();$('snow-skip').onclick=()=>this.finishCinema();
    $('snow-next-city').onclick=()=>this.h.enterDune();$('snow-roam').onclick=()=>this.roam();$('snow-result-journal').onclick=()=>{this.roam();this.openJournal();};
    $('snow-field-return').onclick=$('snow-return').onclick=()=>this.h.returnThread();
    $('snow-replay').onclick=()=>{const data=this.h.campaign().data;if(data.snow.phase==='complete')data.snowClearance=structuredClone(data.snow);data.snow=freshSnow();this.enter();};
    $('snow-deliver-again').onclick=()=>{if(this.state.phase!=='complete')return;this.roam();this.state.phase='expedition';this.state.delivery=0;this.state.weather='whiteout';this.tracked=null;this.sync();this.h.motor.warp(SNOW_AUDIT);this.h.persist();this.h.toast('五项修复保留。沿橙色旗标，再完成一次风暴投递。',7);};
    window.addEventListener('blur',()=>this.braceToggle=false);
  }
  enter():void {
    this.hide();this.h.view.switchCity('snow');this.h.campaign().data.city='snow';this.h.audio.city='snow';show('snow-layer',true);
    const recoveredEnding=this.state.phase==='expedition'&&this.state.delivery===3&&this.authority.finish();
    this.sync();this.h.motor.warp(this.h.motor.checkpoint);this.h.motor.facing=Math.PI;this.h.view.yaw=0;this.h.view.pitch=.42;
    this.h.view.mode='follow';this.h.block(false);this.h.persist();this.updateHud();
    if(recoveredEnding){this.showResult();return;}
    if(this.state.phase==='arrival')this.startCinema({kind:'arrival',age:0});else this.h.toast(this.state.phase==='expedition'?`风暴投递 ${this.state.delivery}/3 已恢复，检查点在上次交接的避风站。`:'雪原记录已恢复。M 打开勘测册，F 或稳身按钮抵抗强风。',7);
  }
  hide():void {
    this.panel=null;this.journal=false;this.result=false;this.dialogue=-1;this.cinema=null;this.trace=null;this.tracked=null;this.braceToggle=false;this.motionTime=0;
    this.h.motor.environment={...STILL_AIR};
    for(const id of ['snow-layer','snow-editor','snow-journal','snow-dialog','snow-cinema','snow-result','snow-field-tools','snow-brace','snow-wind-status'])show(id,false);
    this.h.view.snow?.clearTrace();
  }
  sync():void {
    const world=this.h.view.snow!;world.setProgress(this.state);this.h.motor.surfaces=world.surfaces;this.h.motor.obstacles=world.obstacles;this.h.motor.bounds={...SNOW_BOUNDS};this.h.motor.setCheckpoint(snowCheckpoint(this.state));
    this.h.audio.recovered=SNOW_MAIN.every(id=>this.state.completed.includes(id));this.renderWeather();
  }
  prepareStep(dt:number):void {
    this.motionTime+=dt;this.h.motor.environment=snowForces(this.state.weather,this.motionTime,this.h.motor.position,this.braced);
    this.h.view.snow!.environmentTime=this.motionTime;this.h.view.snow!.braced=this.braced;
  }
  private setWeather(weather:SnowWeather):void {
    if(this.state.phase==='expedition'){this.h.toast('最后一封信必须穿过这场风暴。F 稳身，沿橙旗前往下一个避风站。',6);return;}
    this.state.weather=weather;this.h.view.snow!.weather=weather;this.renderWeather();this.h.persist();this.h.audio.cue('select');
    this.h.toast(weather==='calm'?'风雪暂歇，冰峡谷露出了远处的天线。':weather==='snow'?'雪开始落下。冰面更滑，避风舱周围仍然安稳。':'暴风雪正在横扫冰桥。按住 F 或点按稳身，进入避风区可减轻风力。',7);
  }
  private renderWeather():void {
    $('snow-weather').querySelectorAll<HTMLButtonElement>('[data-snow-weather]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.snowWeather===this.state.weather));b.disabled=this.state.phase==='expedition';});
  }
  private currentCase():SnowCase|null{return this.tracked??phaseCases[this.state.phase as keyof typeof phaseCases]??null;}
  private goal():{pos:V3;title:string;description:string;code:string} {
    const id=this.currentCase();if(id){const lesson=SNOW_LESSONS[id];return {pos:SNOW_POS[id],title:lesson.name,description:this.state.completed.includes(id)?'设备已恢复，可查看其他情景或重做实验。M 切回当前主线。':id==='WF-02'?'先到前方天线旁 Q 扫描，再 E 检查。冰桥上可按住 F 稳身。':id==='NET-01'?'沿橙旗向右穿过第一座桥，前往中继路由器。':id==='NET-02'?'沿向北的冰桥到雪地邮局。风会横向推人，稳身后再过桥。':id==='NET-03'?'沿向右的桥到风墙窄口，检查窗口与拥塞。':id==='NET-04'?'继续向北，前往四根低矮信标组成的时钟阵列。':'按橙旗找到支线终端，Q 取证后 E 检查。',code:`${id} / ${id.includes('-S')?'SIDE STORY':'WHITEOUT RELAY'}`};}
    if(this.state.phase==='arrival')return {pos:SNOW_GUIDE,title:'风雪里还有一封信',description:'前方左侧是雪原信使 KESTREL。靠近后按 E。',code:'04 / ARRIVAL'};
    if(this.state.phase==='audit')return {pos:SNOW_AUDIT,title:'启动暴风协议',description:'向左经过最后一座修复桥，在总中继台执行五系统综合回归。',code:'CITY-04 / INTEGRATION'};
    if(this.state.phase==='expedition')return {pos:SNOW_POSTS[Math.min(2,this.state.delivery)],title:`最后一封求救信 · ${this.state.delivery}/3`,description:this.state.delivery===0?'向北穿过风墙。按住 F 或点按稳身，到第一座避风站按 E 交接。':this.state.delivery===1?'向左横穿冰峡谷，到第二座避风站按 E。橙旗指向承重的桥面。':'最后向北，到极光观测站按 E 交付。三次交接都必须亲自抵达。',code:'FINAL / WALK THROUGH THE WHITEOUT'};
    return {pos:SNOW_POSTS[2],title:'你的声音已抵达',description:`主线 5/5，支线 ${this.state.completed.filter(id=>SNOW_SIDE.includes(id as typeof SNOW_SIDE[number])).length}/3。M 可以继续寻找未完成的故事。`,code:'CHAPTER 04 / RESTORED'};
  }
  private nearby():SnowCase|'guide'|'audit'|'post'|'result'|null {
    const p=this.h.motor.position,near=(q:V3)=>distance(p,q)<7&&Math.abs(p.y-q.y)<4;
    if(this.state.phase==='arrival'&&near(SNOW_GUIDE))return 'guide';
    if(this.state.phase==='audit'&&near(SNOW_AUDIT))return 'audit';
    if(this.state.phase==='expedition'&&near(SNOW_POSTS[Math.min(2,this.state.delivery)]))return 'post';
    if(this.state.phase==='complete'&&near(SNOW_POSTS[2]))return 'result';
    return SNOW_CASES.filter(id=>snowUnlocked(this.state,id)&&near(SNOW_POS[id])).sort((a,b)=>distance(p,SNOW_POS[a])-distance(p,SNOW_POS[b]))[0]??null;
  }
  updateHud():void {
    if(!this.active)return;const g=this.goal(),p=this.h.motor.position,item=this.nearby(),main=this.state.completed.filter(id=>SNOW_MAIN.includes(id as typeof SNOW_MAIN[number])).length,side=this.state.completed.length-main;
    text('quest-code',g.code);text('quest-title',g.title);text('quest-description',g.description);text('quest-distance',`${distance(p,g.pos)<7?'◇ 已抵达':'↗ '+Math.round(distance(p,g.pos))+' m'} / 沿橙旗前往`);
    text('world-state',`主线 ${main}/5 · 支线 ${side}/3`);text('identity-status','因果织针 / 雪原中继链路');text('snow-task-count',`${this.state.completed.length} / 8`);show('btn-forge-travel',false);
    for(const id of ['snow-field-tools','snow-brace','snow-wind-status'])show(id,!this.blocked);show('interact-prompt',!this.blocked&&item!==null);
    const label=item==='guide'?'与 KESTREL 对话':item==='audit'?'执行暴风协议综合回归':item==='post'?`交接求救信 · 第 ${this.state.delivery+1} 站`:item==='result'?'查看雪原投递记录':item?`${this.state.evidence.includes(item)?'检查':'按 Q 扫描'} ${SNOW_LESSONS[item].name}`:'';text('interact-label',label);
    const shelter=inSnowShelter(p),wind=snowWind(this.state.weather,this.motionTime);
    text('snow-wind-label',shelter?'避风区 / 风力受阻':this.braced?'稳身中 / 抗风抓地':`${SNOW_WEATHER_NAMES[this.state.weather]} / 冰桥迎风`);
    text('snow-wind-description',shelter?'停留、观察，再出发':this.braced?'移动较慢，横向风力大幅降低':`横风 ${wind.x.toFixed(1)} m/s · F 稳身`);$('snow-brace').setAttribute('aria-pressed',String(this.braced));
    this.h.audio.windSeverity=this.state.weather==='whiteout'?1:this.state.weather==='snow'?.4:.05;
    $('mini-player').setAttribute('transform',`translate(${p.x} ${p.z}) rotate(${-this.h.motor.facing*180/Math.PI})`);
    const markers=$('world-markers');markers.replaceChildren();
    if(!this.blocked){const add=(pos:V3,label:string,side=false)=>{const q=this.h.view.project({...pos,y:pos.y+3.8});if(!q.visible)return;const marker=document.createElement('div');marker.className='world-marker snow-marker'+(side?' snow-side-marker':'');marker.style.left=`${q.x}px`;marker.style.top=`${q.y}px`;marker.innerHTML=`<span>${label}</span><i></i>`;markers.append(marker);};add(g.pos,g.title);if(this.state.phase!=='expedition')for(const id of SNOW_SIDE)if(snowUnlocked(this.state,id)&&!this.state.completed.includes(id))add(SNOW_POS[id],`${id} / 支线故事`,true);}
  }
  interact():void {
    if(this.dialogue>=0){this.advanceDialogue();return;}if(this.blocked)return;const item=this.nearby();
    if(!item){this.h.toast('沿橙旗靠近设备。M 查看勘测册和已开放的路线。');return;}
    if(item==='guide'){this.dialogue=0;this.h.block(true);show('snow-dialog',true);this.renderDialogue();this.updateHud();return;}
    if(item==='audit'){this.audit();return;}if(item==='post'){this.deliver();return;}if(item==='result'){this.showResult();return;}
    if(!this.state.evidence.includes(item)){this.scan();return;}this.openPanel(item);
  }
  private renderDialogue():void {
    text('snow-dialog-text',this.dialogue===0?'我是 KESTREL。观测站最后一封求救信，一直困在这片雪原。风会吹断线路，也会吹走回信；有时一封信到了三次，人却始终不知道它已经抵达。':'先救下天线，再一路修复路由、重传、拥塞和时钟。最后一段没有列车替你走：沿橙旗穿过风墙，到每个避风站按 E 交接。F 稳身，或点按屏幕上的稳身按钮。');$('snow-dialog-next').focus({preventScroll:true});
  }
  private advanceDialogue():void {this.dialogue++;if(this.dialogue<2){this.renderDialogue();return;}this.dialogue=-1;show('snow-dialog',false);this.authority.meet();this.h.block(false);this.h.persist();this.updateHud();}
  scan():void {
    if(this.blocked)return;this.h.audio.cue('scan');this.h.view.snow!.scanAtPosition(this.h.motor.position);const item=this.nearby();
    if(item&&SNOW_CASES.includes(item as SnowCase)){const id=item as SnowCase;if(this.authority.observe(id)){this.h.persist();this.h.toast(`${id} / ${SNOW_LESSONS[id].observation.replaceAll('\n','；')} 按 E 检查。`,10);}}
    else this.h.toast(this.state.phase==='arrival'?'先找到左前方的雪原信使 KESTREL。':'橙旗标记桥面，避风区内可安全观察。靠近已开放设备能取得完整证据。',7);this.updateHud();
  }
  private openPanel(id:SnowCase):void {
    this.panel=id;this.trace=null;this.draft=structuredClone(this.state.patches);this.h.block(true);show('snow-editor',true);show('snow-trace',false);show('snow-report',false);
    const lesson=SNOW_LESSONS[id];$('snow-task').innerHTML=`<span class="snow-case">${id} / ${lesson.subtitle}</span><h2 id="snow-case-title">${lesson.name}</h2><p>${lesson.description}</p><div class="snow-evidence"><small>OBSERVED / 现场证据</small><pre>${lesson.observation}</pre></div>`;
    this.renderControls();this.h.view.snow!.focus=SNOW_POS[id];this.h.view.mode='snow-device';$('snow-editor').querySelector('.snow-scroll')!.scrollTop=0;$('snow-close').focus({preventScroll:true});this.updateHud();
  }
  closePanel():void {if(!this.panel)return;this.panel=null;this.trace=null;show('snow-editor',false);this.h.view.snow!.clearTrace();this.sync();this.h.block(false);this.h.view.mode='follow';this.h.clearInput();this.h.persist();this.updateHud();}
  private renderControls():void {
    const id=this.panel!,patch=this.draft[id] as unknown as Record<string,unknown>;
    $('snow-controls').innerHTML=SNOW_CONTROLS[id].map(c=>{
      const value=patch[c.key],elementId=`snow-control-${c.key}`;
      if(c.kind==='check')return `<label class="snow-check"><input id="${elementId}" type="checkbox" ${value?'checked':''}><span>${c.label}${c.hint?`<small>${c.hint}</small>`:''}</span></label>`;
      if(c.kind==='range')return `<label class="snow-range">${c.label}<output id="snow-value-${c.key}">${value}</output><input id="${elementId}" aria-label="${c.label}" type="range" min="${c.min}" max="${c.max}" step="1" value="${value}">${c.hint?`<small>${c.hint}</small>`:''}</label>`;
      return `<label class="snow-select">${c.label}<select id="${elementId}">${c.options!.map(o=>`<option value="${o.value}" ${value===o.value?'selected':''}>${o.label}</option>`).join('')}</select></label>`;
    }).join('');
    for(const c of SNOW_CONTROLS[id]){
      const input=$( `snow-control-${c.key}` ) as HTMLInputElement;
      const change=()=>{patch[c.key]=c.kind==='check'?input.checked:c.kind==='range'?Number(input.value):input.value;if(c.kind==='range')text(`snow-value-${c.key}`,input.value);this.trace=null;show('snow-trace',false);show('snow-report',false);this.h.view.snow!.clearTrace();this.h.audio.cue('select');};
      if(c.kind==='range')input.oninput=change;else input.onchange=change;
    }
  }
  preview(playing=true):void {if(!this.panel)return;try{const id=this.panel,run=this.authority.preview(id,this.draft[id],`${id}:preview`);this.setTrace(run,playing);this.renderReport(run,true);$('snow-trace').scrollIntoView({block:'nearest'});this.h.audio.cue(run.passed?'success':'fail');}catch(e){this.h.toast((e as Error).message);}}
  private setTrace(run:SnowRun,playing:boolean):void {
    const failed=run.assertions.find(a=>!a.passed)?.name,fixture=Math.max(0,run.traces.findIndex(t=>t.name===failed));this.trace={run,fixture,cursor:0,playing,age:0};
    $('snow-trace-select').innerHTML=run.traces.map((t,i)=>`<option value="${i}" ${i===fixture?'selected':''}>${t.name}</option>`).join('');this.renderTrace();
  }
  private stepTrace():void {if(!this.trace){this.preview(false);return;}this.trace.playing=false;this.trace.cursor=Math.min(this.trace.cursor+1,(this.trace.run.traces[this.trace.fixture]?.log.length??1)-1);this.renderTrace();}
  private renderTrace():void {
    const t=this.trace;if(!t||!this.panel)return;const log=t.run.traces[t.fixture]?.log??[],e=log[t.cursor];show('snow-trace',!!e);if(!e)return;
    text('snow-trace-label',`${t.run.runId} / ${t.cursor+1} OF ${log.length}`);text('snow-auto',t.playing?'暂停回放 Ⅱ':'继续回放 ▷');text('snow-current-event',`${e.tick} / ${e.actor} / ${e.kind}\n${e.detail}`);
    $('snow-event-list').innerHTML=log.map((row,i)=>`<li class="${i===t.cursor?'current':i<t.cursor?'past':''}"><span>${row.tick} / ${row.actor}</span>${row.detail}</li>`).join('');this.h.view.snow!.present(this.panel,t.run,t.fixture,t.cursor);
  }
  private renderReport(run:SnowRun,preview:boolean):void {
    show('snow-report',true);$('snow-report').innerHTML=`<small>${run.runId} / ${preview?'预演 · 尚未提交':'完整验证'}</small><h3>${run.passed?'✓ 通过回归':'↶ 发现反例'}</h3><p>${run.reason}</p>${run.assertions.map(a=>`<div class="snow-assert ${a.passed?'pass':'fail'}"><b>${a.passed?'✓':'×'} ${a.name}</b><span>${a.detail}</span></div>`).join('')}`;
  }
  verify():void {
    if(!this.panel)return;const id=this.panel,data=this.h.campaign().data;
    try{const run=this.authority.submit(id,this.draft[id],`${id}:${data.attempts+1}`);data.attempts++;this.h.campaign().lastRun=run;
      if(!run.passed){data.counterexamples++;this.setTrace(run,false);this.renderReport(run,false);this.h.persist();this.h.audio.cue('fail');$('snow-report').scrollIntoView({block:'nearest'});return;}
      this.closePanel();if(this.tracked===id)this.tracked=null;this.sync();this.h.persist();this.h.audio.cue('success');this.startCinema({kind:'repair',id,age:0});
    }catch(e){this.h.toast((e as Error).message);}
  }
  private audit():void {
    const data=this.h.campaign().data;try{const run=this.authority.audit(`CITY-04:${data.attempts+1}`);data.attempts++;this.h.campaign().lastRun=run;if(!run.passed){data.counterexamples++;this.h.persist();this.h.toast(run.reason,8);return;}this.tracked=null;this.sync();this.h.persist();this.startCinema({kind:'audit',age:0});}catch(e){this.h.toast((e as Error).message);}
  }
  private deliver():void {
    const next=this.state.delivery+1;if(!this.authority.deliver(next))return;
    const finished=next===3&&this.authority.finish();
    if(finished)this.h.campaign().data.snowClearance=structuredClone(this.state);
    this.h.motor.warp(SNOW_POSTS[next-1]);this.sync();this.h.persist();this.h.audio.cue('success');
    if(finished){this.startCinema({kind:'ending',age:0});}
    else this.h.toast(`第 ${next} 次交接完成，已保存避风站检查点。${next===1?'下一段向左横穿峡谷。':'最后一段向北，极光观测站在风墙之后。'}`,8);this.updateHud();
  }
  openJournal():void {if(this.blocked)return;this.journal=true;this.h.block(true);show('snow-journal',true);this.renderJournal();$('snow-journal-close').focus({preventScroll:true});this.updateHud();}
  private renderJournal():void {
    const expedition=this.state.phase==='expedition';text('snow-journal-description',expedition?`风暴投递 ${this.state.delivery}/3。穿越期间站间接驳停运；沿橙旗到下一个避风站，交接会保存检查点。`:'五条主线逐段开放雪桥。三段支线故事可稍后回访，扫描过的设备支持雪地车接驳。');
    $('snow-survey-map').innerHTML=`<svg viewBox="-145 -350 390 475" role="img" aria-label="白噪雪原勘测图：天线向右到路由，向北到邮局，向右再向北到时钟，向左进入风暴投递"><path d="M-100 93V56H0V-39H105V-141H0V-224H-108V-317" fill="none" stroke="#b75a36" stroke-width="3" stroke-dasharray="5 4"/><path d="M0 55V94M0-39H-49M105-141H151" fill="none" stroke="#708a75" stroke-width="2"/>${SNOW_CASES.map(id=>{const p=SNOW_POS[id],done=this.state.completed.includes(id);return `<circle cx="${p.x}" cy="${p.z}" r="${id.includes('-S')?4:6}" fill="${done?'#557d64':snowUnlocked(this.state,id)?'#c36b3d':'#b5b4a5'}"/><text x="${p.x+8}" y="${p.z+(id==='NET-S2'||id==='NET-S3'?18:4)}">${id}</text>`;}).join('')}${SNOW_POSTS.map((p,i)=>`<rect x="${p.x-4}" y="${p.z-4}" width="8" height="8" fill="${this.state.delivery>i?'#557d64':'#bca879'}"/><text x="${p.x+8}" y="${p.z+3}">POST ${i+1}</text>`).join('')}<circle cx="${this.h.motor.position.x}" cy="${this.h.motor.position.z}" r="4" fill="#293e3a"/></svg><small>橙线 / 主路 · 绿线 / 支线<br>风会推移角色，冰桥上可以稳身。</small>`;
    $('snow-journal-grid').innerHTML=SNOW_CASES.map(id=>{const lesson=SNOW_LESSONS[id],done=this.state.completed.includes(id),open=snowUnlocked(this.state,id),seen=this.state.evidence.includes(id);return `<article class="${id.includes('-S')?'side ':''}${done?'done':''}"><small>${id} / ${done?'已修复':open?'可探索':'尚未开放'}</small><h3>${lesson.name}</h3><p>${done?lesson.story:open?lesson.description:'推进主线，开放前往这座设施的雪桥。'}</p><div><button data-snow-track="${id}" ${open&&!expedition?'':'disabled'}>导航 →</button>${seen?`<button data-snow-shuttle="${id}" ${expedition?'disabled':''}>雪地车接驳 ↗</button>`:''}</div></article>`;}).join('');
    $('snow-journal-grid').querySelectorAll<HTMLButtonElement>('[data-snow-track]').forEach(b=>b.onclick=()=>{this.tracked=b.dataset.snowTrack as SnowCase;this.closeJournal();this.h.toast(`已标记 ${SNOW_LESSONS[this.tracked].name}。沿勘测图与橙旗前往。`,6);});
    $('snow-journal-grid').querySelectorAll<HTMLButtonElement>('[data-snow-shuttle]').forEach(b=>b.onclick=()=>{const id=b.dataset.snowShuttle as SnowCase;if(this.state.phase==='expedition'||!this.state.evidence.includes(id)||!snowUnlocked(this.state,id))return;this.closeJournal();this.startCinema({kind:'shuttle',id,age:0,target:{...SNOW_POS[id],z:SNOW_POS[id].z+5}});});
  }
  closeJournal():void {if(!this.journal)return;this.journal=false;show('snow-journal',false);this.h.block(false);this.h.clearInput();this.h.view.mode='follow';this.updateHud();}
  private startCinema(cinema:Cinema):void {
    this.cinema=cinema;this.h.block(true);show('snow-cinema',true);this.h.clearInput();if(cinema.id)this.h.view.snow!.focus=SNOW_POS[cinema.id];
    this.h.view.mode=cinema.kind==='arrival'?'snow-arrival':cinema.kind==='ending'?'snow-final':cinema.kind==='audit'?'snow-audit':'snow-device';
    text('snow-cinema-kicker',cinema.kind==='arrival'?'CHAPTER 04 / THE WHITEOUT RELAY':cinema.kind==='repair'?'SYSTEM RESTORED':cinema.kind==='audit'?'FIVE SYSTEMS / VERIFIED':cinema.kind==='ending'?'DELIVERED / THROUGH THE WHITEOUT':'SNOW CRAWLER / STATION TRANSFER');
    text('snow-cinema-title',cinema.kind==='arrival'?'下一站，白噪雪原。':cinema.kind==='repair'?SNOW_LESSONS[cinema.id!].name+'，恢复运行。':cinema.kind==='audit'?'最后一段，由你亲自走。':cinema.kind==='ending'?'风雪很大。你的声音，仍然到了。':'雪地车正在前往已扫描站点。');
    text('snow-cinema-text',cinema.kind==='arrival'?'没有霓虹高塔，只有风向旗、冰峡谷和暖着灯的避风舱。最后一封求救信，还在等一个能穿过风雪的人。':cinema.kind==='repair'?SNOW_LESSONS[cinema.id!].story:cinema.kind==='audit'?'五个系统同时通过。向北、向左、再向北，沿橙旗穿过三座冰桥，在每个避风站按 E 交接。F 或稳身按钮能抵抗横风；跌落后从最近交接点继续。':cinema.kind==='ending'?'三次交接、五项修复。消息没有被风雪吞没，也没有把同一份求助重复执行。观测站知道，世界还记得他们。':'修复与证据全部保留。新的站点需要先亲自走到并扫描。');
    $('snow-skip').focus({preventScroll:true});this.updateHud();
  }
  finishCinema():void {
    const c=this.cinema;if(!c)return;this.cinema=null;show('snow-cinema',false);
    if(c.kind==='shuttle'&&c.target){this.h.motor.warp(c.target);this.h.motor.setCheckpoint(c.target);}
    if(c.kind==='ending'){this.showResult();return;}this.h.block(false);this.h.clearInput();this.h.view.mode='follow';this.updateHud();
  }
  showResult():void {
    this.result=true;this.h.block(true);show('snow-result',true);this.h.view.mode='snow-result';const side=this.state.completed.filter(id=>SNOW_SIDE.includes(id as typeof SNOW_SIDE[number])).length;
    text('snow-ending',side===3?'八处设施和三段失联的故事，都已重新接入世界。雪原上的每一盏灯，都有了能听见它的人。':`五条主线与三次交接已经完成。雪原还留着 ${3-side} 段支线故事，勘测册会为你保留它们的位置。`);
    $('snow-result-stats').innerHTML=`<span><b>5 / 5</b>主线修复</span><span><b>${side} / 3</b>支线故事</span><span><b>3 / 3</b>风暴交接</span>`;
    this.h.persist();this.h.audio.cue('success');$('snow-result').scrollTop=0;$('snow-roam').focus({preventScroll:true});this.updateHud();
  }
  private roam():void {this.result=false;show('snow-result',false);this.h.block(false);this.h.clearInput();this.h.view.mode='follow';this.updateHud();}
  hint():void {const id=this.panel??this.currentCase();if(id){const n=this.hintCounts[id]??0;this.hintCounts[id]=n+1;this.h.toast(SNOW_LESSONS[id].hints[Math.min(n,2)],12);}else this.h.toast(this.state.phase==='arrival'?'左前方的红色断环角色是 KESTREL。':this.state.phase==='audit'?'到左边的总中继台按 E，五系统综合回归后才开放投递路线。':this.state.phase==='expedition'?'稳身后过冰桥；北 → 西 → 北，三个避风站都要按 E。橙色旗杆标记桥面。':'M 打开勘测册，已扫描设施可乘雪地车回访；也能切换晴霁看极光。',10);}
  action(key:string,reverse=false):boolean {
    if(key==='Tab'&&this.blocked){const root=this.panel?$('snow-editor'):this.journal?$('snow-journal'):this.dialogue>=0?$('snow-dialog'):this.cinema?$('snow-cinema'):$('snow-result');const items=Array.from(root.querySelectorAll<HTMLElement>('button:not([disabled]),input,select')).filter(e=>e.getClientRects().length),at=items.indexOf(document.activeElement as HTMLElement);items[(at+(reverse?-1:1)+items.length)%items.length]?.focus();return true;}
    if(key==='Escape'){if(this.panel)this.closePanel();else if(this.journal)this.closeJournal();else if(this.dialogue>=0){this.dialogue=1;this.advanceDialogue();}else if(this.cinema)this.finishCinema();else if(this.result)this.roam();else return false;return true;}
    if(key==='KeyT'){this.setWeather(SNOW_WEATHERS[(SNOW_WEATHERS.indexOf(this.state.weather)+1)%3]);return true;}
    if(key==='KeyE'){this.interact();return true;}if(key==='KeyQ'){this.scan();return true;}if(key==='KeyR'&&this.panel){this.verify();return true;}
    if((key==='KeyM'||key==='Tab')&&!this.blocked){this.openJournal();return true;}return false;
  }
  tick(dt:number):void {
    if(!this.active)return;this.h.view.snow!.hero.group.rotation.y=this.h.motor.facing;
    if(this.trace?.playing&&this.panel){this.trace.age+=dt;if(this.trace.age>.65){this.trace.age=0;const count=this.trace.run.traces[this.trace.fixture]?.log.length??0;if(this.trace.cursor<count-1)this.trace.cursor++;else this.trace.playing=false;this.renderTrace();}}
    if(this.cinema){this.cinema.age+=dt;const duration=this.cinema.kind==='shuttle'?2.6:this.cinema.kind==='repair'?3.5:5.5;if(this.cinema.age>=duration)this.finishCinema();}
    this.hudAge+=dt;if(this.hudAge>.12){this.hudAge=0;this.updateHud();}
  }
}

import type { Campaign } from './domain';
import { ThreadCampaign, THREAD_MAIN, THREAD_SIDE, freshThread, threadUnlocked, type ThreadCase, type ThreadPatches, type ThreadRun } from './thread-domain';
import { THREAD_LESSONS } from './thread-content';
import { IRIS, THREAD_AUDIT, THREAD_BOUNDS, THREAD_END, THREAD_POS, threadCheckpoint } from './thread-layout';
import type { Motor, V3 } from './physics';
import type { CityView } from './view';
import type { CityAudio } from './audio';
import './thread.css';

const $=(id:string):HTMLElement=>document.getElementById(id)!;
const show=(id:string,on:boolean):void=>{$(id).hidden=!on;};
const txt=(id:string,text:string):void=>{$(id).textContent=text;};
const distance=(a:V3,b:V3):number=>Math.hypot(a.x-b.x,a.z-b.z);
const mainForPhase={locks:'OS-01',schedule:'OS-02',counter:'OS-03',memory:'OS-04'} as const;
const allCases:ThreadCase[]=[...THREAD_MAIN,...THREAD_SIDE];
interface Hooks {
  campaign:()=>Campaign;view:CityView;motor:Motor;audio:CityAudio;block:(on:boolean)=>void;
  clearInput:()=>void;persist:()=>void;toast:(text:string,n?:number)=>void;returnForge:()=>void;enterSnow:()=>void;openMap:()=>void;
}
type Cinema={kind:'arrival'|'repair'|'audit'|'ride'|'shuttle';age:number;id?:ThreadCase;run?:ThreadRun;target?:V3};
export class ThreadChapter {
  panel:ThreadCase|null=null;journal=false;result=false;dialogue=-1;cinema:Cinema|null=null;
  tracked:ThreadCase|null=null;
  private draft:ThreadPatches=freshThread().patches;
  private trace:{run:ThreadRun;index:number;playing:boolean;age:number}|null=null;
  private hints:Partial<Record<ThreadCase,number>>={};
  private hudTime=0;
  private get state(){return this.h.campaign().data.thread;}
  private get authority(){return new ThreadCampaign(this.state);}
  get active():boolean{return this.h.view.city==='thread';}
  get blocked():boolean{return this.panel!==null||this.journal||this.result||this.dialogue>=0||this.cinema!==null;}
  constructor(private h:Hooks){
    const root=document.createElement('div');root.id='thread-layer';root.hidden=true;
    root.innerHTML=`<section id="thread-editor" hidden aria-label="千线程因果工作台">
      <header class="thread-panel-head"><span class="eyebrow">CAUSAL NEEDLE / THREADFALL</span><button id="thread-close" class="close-button" aria-label="关闭千线程工作台">×</button></header>
      <div class="thread-scroll"><div id="thread-task"></div><div id="thread-controls"></div><section id="thread-trace" hidden><div class="thread-trace-top"><span id="thread-trace-label" class="mono"></span><button id="thread-step">执行一步 →</button><button id="thread-auto">暂停回放 Ⅱ</button></div><p id="thread-current-event" class="mono"></p><ol id="thread-event-list"></ol></section><div id="thread-report" hidden aria-live="polite"></div></div>
      <footer class="thread-panel-foot"><button id="thread-preview" class="text-button">预演并回放 ↗</button><button id="thread-verify" class="primary">重放并验证 <kbd>R</kbd> →</button></footer>
    </section>
    <section id="thread-journal" hidden role="dialog" aria-modal="true" aria-labelledby="thread-journal-title"><header><div><span class="eyebrow">FOUR SYSTEMS / SIX STORIES</span><h2 id="thread-journal-title">千线程 · 任务册</h2></div><button id="thread-journal-close" class="close-button" aria-label="关闭任务册">×</button></header><p>主线打开前往下一层的路。两条蓝色支线可以稍后回来；扫描过的站台支持接驳。</p><div id="thread-journal-grid"></div><footer><button id="thread-main-track" class="text-button">回到当前主线 →</button><button id="thread-city-map" class="text-button">城际地图 ↗</button></footer></section>
    <div id="thread-dialog" hidden><span class="eyebrow">IRIS / 千线程调度员</span><p id="thread-dialog-text"></p><button id="thread-dialog-next" class="text-button">继续 <kbd>E</kbd> →</button></div>
    <div id="thread-cinema" hidden><span id="thread-run-id" class="thread-cinema-top mono"></span><div class="thread-cinema-copy"><span id="thread-cinema-kicker" class="eyebrow"></span><h2 id="thread-cinema-title"></h2><p id="thread-cinema-detail"></p><button id="thread-skip" class="text-button">跳过镜头 →</button></div></div>
    <section id="thread-result" hidden><span class="eyebrow">CHAPTER 03 / THREADFALL</span><div class="thread-result-code">200 <small>OK</small></div><h2>每一道等待，<br>都等来了回应。</h2><p id="thread-ending"></p><div id="thread-result-stats"></div><button id="thread-next-city" class="primary">下一站 · 白噪雪原 →</button><button id="thread-roam" class="text-button">继续探索千线程 ↗</button><div class="thread-result-links"><button id="thread-result-journal" class="text-button">打开任务册 · 寻找支线 →</button><button id="thread-ride-again" class="text-button">再乘一次双线列车 ↗</button><button id="thread-return" class="text-button">乘城际列车返回脉冲炉 →</button><button id="thread-replay" class="text-button">重新修复第三城 ↶</button></div><p class="thread-next mono">05 / 08 城市已开放<br>下一站 · 白噪雪原 / 已开放</p></section>
    <nav id="thread-field-tools" hidden aria-label="千线程旅行"><button id="thread-journal-toggle">任务册 <kbd>M</kbd> <b id="thread-task-count">0 / 6</b></button><button id="thread-field-return">← 脉冲炉</button></nav>`;
    $('app').append(root);
    $('thread-close').onclick=()=>this.closePanel();$('thread-preview').onclick=()=>this.preview();$('thread-verify').onclick=()=>this.verify();
    $('thread-step').onclick=()=>this.stepTrace();$('thread-auto').onclick=()=>{if(this.trace){this.trace.playing=!this.trace.playing;this.renderTrace();}};
    $('thread-journal-toggle').onclick=()=>this.openJournal();$('thread-journal-close').onclick=()=>this.closeJournal();
    $('thread-main-track').onclick=()=>{this.tracked=null;this.closeJournal();this.updateHud();};
    $('thread-city-map').onclick=()=>{this.closeJournal();this.h.openMap();};
    $('thread-dialog-next').onclick=()=>this.advanceDialogue();$('thread-skip').onclick=()=>this.finishCinema();
    $('thread-roam').onclick=()=>this.roam();$('thread-result-journal').onclick=()=>{this.roam();this.openJournal();};
    $('thread-ride-again').onclick=()=>{if(!this.state.audited||this.state.phase!=='complete')return;this.result=false;show('thread-result',false);this.h.motor.warp(THREAD_AUDIT);this.startCinema({kind:'ride',age:0});};
    $('thread-return').onclick=$('thread-field-return').onclick=()=>this.h.returnForge();
    $('thread-next-city').onclick=()=>this.h.enterSnow();
    $('thread-replay').onclick=()=>{const data=this.h.campaign().data;if(data.thread.phase==='complete')data.threadClearance=structuredClone(data.thread);data.thread=freshThread();this.enter();};
  }
  enter():void {
    this.hide();this.h.view.switchCity('thread');this.h.campaign().data.city='thread';
    this.h.audio.city='thread';this.h.motor.bounds={...THREAD_BOUNDS};show('thread-layer',true);
    this.sync();this.h.motor.warp(this.h.motor.checkpoint);this.h.view.yaw=0;this.h.view.pitch=.34;
    this.h.view.mode='follow';this.h.block(false);this.h.persist();this.updateHud();
    if(this.state.phase==='arrival')this.startCinema({kind:'arrival',age:0});else this.h.toast('千线程进度已恢复。任务册里保留了主线、支线和已扫描站台。',5);
  }
  hide():void {
    this.panel=null;this.journal=false;this.result=false;this.dialogue=-1;this.cinema=null;this.trace=null;this.tracked=null;
    for(const id of ['thread-layer','thread-editor','thread-journal','thread-dialog','thread-cinema','thread-result','thread-field-tools'])show(id,false);
    if(this.h.view.thread){this.h.view.thread.rideT=null;this.h.view.thread.clearTrace();}
  }
  sync():void {
    const world=this.h.view.thread!;world.setProgress(this.state);this.h.motor.surfaces=world.surfaces;this.h.motor.obstacles=world.obstacles;
    this.h.motor.bounds={...THREAD_BOUNDS};this.h.motor.setCheckpoint(threadCheckpoint(this.state));
    this.h.audio.recovered=THREAD_MAIN.every(id=>this.state.completed.includes(id));
  }
  private currentCase():ThreadCase|null {return this.tracked??mainForPhase[this.state.phase as keyof typeof mainForPhase]??null;}
  private goal():{pos:V3;code:string;title:string;description:string;label:string} {
    const id=this.currentCase();if(id){const lesson=THREAD_LESSONS[id];return {pos:THREAD_POS[id],code:`${id} / ${THREAD_SIDE.includes(id as typeof THREAD_SIDE[number])?'SIDE STORY':'THREADFALL'}`,title:lesson.name,description:this.state.completed.includes(id)?'这处设备已经恢复，可查看回放或重做实验。任务册可以切回当前主线。':id==='OS-02'?'跨过修好的交叉桥，沿第一段坡道前往居民电车站。左侧广播台是一条可选支线。':id==='OS-03'?'前方桥已解锁，继续上行到售票台。右侧可探索「双重影子」支线。':id==='OS-04'?'跨过并发检票桥，沿最后一段坡道到三个页框前。':'靠近设备后 Q 扫描原始证据，再按 E 进入工作台。',label:`${id} / ${lesson.name}`};}
    if(this.state.phase==='arrival')return {pos:IRIS,code:'03 / THREADFALL',title:'两条生命线，都在等待',description:'沿蓝白灯带找到调度员 IRIS。靠近后按 E。',label:'IRIS / 调度员'};
    if(this.state.phase==='audit')return {pos:THREAD_AUDIT,code:'CITY-03 / INTEGRATION',title:'让整座城市一起运行',description:'沿最后一段桥前往 WAIT-FOR-∞ 控制台，执行四系统综合回归。',label:'WAIT-FOR-∞ / 全城验收'};
    if(this.state.phase==='evacuate')return {pos:THREAD_AUDIT,code:'FINAL / TWO LIFELINES',title:'这一次，谁都不会被留下',description:'到双线列车站按 E，乘车穿过恢复运行的双螺旋高塔。',label:'P + Q / 双线疏散列车'};
    return {pos:THREAD_END,code:'CHAPTER 03 / RESTORED',title:'每一道等待，都有回应',description:`主线 4/4，支线 ${this.state.completed.filter(id=>THREAD_SIDE.includes(id as typeof THREAD_SIDE[number])).length}/2。打开任务册可以继续探索。`,label:'03 / 城市已恢复'};
  }
  private nearby():ThreadCase|'iris'|'audit'|'ride'|'result'|null {
    const p=this.h.motor.position;
    const near=(q:V3):boolean=>distance(p,q)<8&&Math.abs(p.y-q.y)<4.5;
    if(this.state.phase==='arrival'&&near(IRIS))return 'iris';
    if(this.state.phase==='audit'&&near(THREAD_AUDIT))return 'audit';
    if(this.state.phase==='evacuate'&&near(THREAD_AUDIT))return 'ride';
    if(this.state.phase==='complete'&&near(THREAD_END))return 'result';
    return allCases.filter(id=>threadUnlocked(this.state,id)&&near(THREAD_POS[id])).sort((a,b)=>distance(p,THREAD_POS[a])-distance(p,THREAD_POS[b]))[0]??null;
  }
  updateHud():void {
    if(!this.active)return;
    const g=this.goal(),p=this.h.motor.position,item=this.nearby();
    txt('quest-code',g.code);txt('quest-title',g.title);txt('quest-description',g.description);txt('quest-distance',`${distance(p,g.pos)<8?'◇ 已抵达':'↗ '+Math.round(distance(p,g.pos))+' m'} / ${g.label}`);
    txt('identity-status','因果织针 / 并发链路已连接');txt('world-state',`主线 ${this.state.completed.filter(id=>THREAD_MAIN.includes(id as typeof THREAD_MAIN[number])).length}/4 · 支线 ${this.state.completed.filter(id=>THREAD_SIDE.includes(id as typeof THREAD_SIDE[number])).length}/2`);
    show('btn-forge-travel',false);show('interact-prompt',!this.blocked&&item!==null);show('thread-field-tools',!this.blocked);
    txt('thread-task-count',`${this.state.completed.length} / 6`);
    txt('interact-label',item==='iris'?'与 IRIS 对话':item==='audit'?'执行全城综合回归':item==='ride'?'登上双线疏散列车':item==='result'?'查看第三城修复记录':item?this.state.evidence.includes(item)?`检查 ${THREAD_LESSONS[item].name}`:`按 Q 扫描 ${THREAD_LESSONS[item].name}`:'');
    $('mini-player').setAttribute('transform',`translate(${p.x} ${p.z}) rotate(${-this.h.motor.facing*180/Math.PI})`);
    const markers=$('world-markers');markers.replaceChildren();
    const marker=(pos:V3,label:string,side=false):void=>{const q=this.h.view.project({...pos,y:pos.y+4.5});if(!q.visible)return;const m=document.createElement('div');m.className='world-marker'+(side?' thread-side-marker':'');m.style.left=`${q.x}px`;m.style.top=`${q.y}px`;m.innerHTML=`<span>${label}</span><i></i>`;markers.append(m);};
    if(!this.blocked){marker(g.pos,g.label);for(const id of THREAD_SIDE)if(threadUnlocked(this.state,id)&&!this.state.completed.includes(id)&&id!==this.currentCase())marker(THREAD_POS[id],`${id} / 可选故事`,true);}
  }
  interact():void {
    if(this.dialogue>=0){this.advanceDialogue();return;}if(this.blocked)return;
    const item=this.nearby();if(!item){this.h.toast('靠近任务标记后再互动。M 打开任务册，可导航到已开放关卡。');return;}
    if(item==='iris'){this.dialogue=0;this.h.view.thread!.focus=IRIS;this.h.view.mode='thread-device';this.h.block(true);show('thread-field-tools',false);show('thread-dialog',true);this.renderDialogue();return;}
    if(item==='audit'){this.audit();return;}if(item==='ride'){this.startCinema({kind:'ride',age:0});return;}if(item==='result'){this.showResult();return;}
    if(!this.state.evidence.includes(item)){this.scan();return;}this.openPanel(item);
  }
  private renderDialogue():void {
    txt('thread-dialog-text',this.dialogue===0?'我是 IRIS。哥哥的列车拿着 A，我的列车拿着 B。两条生命线各自没有坏，却都再也走不动。':'先救下交叉桥上的两列车，再去电车站、售票台和内存走廊。沿途还有两段没被系统记住的故事；任务册会替你留着位置。');
    $('thread-dialog-next').focus({preventScroll:true});
  }
  private advanceDialogue():void {this.dialogue++;if(this.dialogue<2){this.renderDialogue();return;}this.dialogue=-1;show('thread-dialog',false);this.authority.meet();this.h.block(false);this.h.view.mode='follow';this.h.persist();this.updateHud();}
  scan():void {
    if(this.blocked)return;this.h.audio.cue('scan');this.h.view.thread!.scanAtPosition(this.h.motor.position);
    const item=this.nearby();if(item&&allCases.includes(item as ThreadCase)){
      const id=item as ThreadCase;if(this.authority.observe(id)){this.h.persist();this.h.toast(`${id} 原始证据：${THREAD_LESSONS[id].observation.replaceAll('\n','；')} 按 E 检查。`,9);}
    }else this.h.toast(this.state.phase==='arrival'?'先找到 IRIS，听听两条列车发生了什么。':'沿灯带靠近设备，可以捕获完整执行证据。M 查看主线和支线。',5);
    this.updateHud();
  }
  private openPanel(id:ThreadCase):void {
    this.panel=id;this.draft=structuredClone(this.state.patches);this.trace=null;this.h.block(true);show('thread-field-tools',false);show('thread-editor',true);show('thread-report',false);show('thread-trace',false);show('interact-prompt',false);
    this.h.view.thread!.focus=THREAD_POS[id];this.h.view.mode='thread-device';const l=THREAD_LESSONS[id];
    $('thread-task').innerHTML=`<span class="mono thread-case">${id} / ${l.subtitle}</span><h2>${l.name}</h2><p>${l.description}</p><div class="thread-observed"><small>OBSERVED / 原始现场</small><pre>${l.observation}</pre></div>`;
    this.renderControls();$('thread-close').focus({preventScroll:true});$('thread-editor').querySelector('.thread-scroll')!.scrollTop=0;
  }
  closePanel():void {if(!this.panel)return;this.panel=null;this.trace=null;show('thread-editor',false);this.h.view.thread!.clearTrace();this.sync();this.h.block(false);this.h.view.mode='follow';this.h.persist();this.updateHud();}
  private changed():void {this.trace=null;show('thread-report',false);show('thread-trace',false);this.h.view.thread!.clearTrace();this.h.audio.cue('select');}
  private renderControls():void {
    const id=this.panel!,host=$('thread-controls');
    if(id==='OS-01'){
      const p=this.draft[id];host.innerHTML=`<div class="thread-lock-order">${(['p','q'] as const).map(w=>`<label><b>${w.toUpperCase()} 列车</b><select id="thread-lock-${w}" aria-label="${w.toUpperCase()} 列车首锁"><option value="A" ${p[w]==='A'?'selected':''}>先 A，再 B</option><option value="B" ${p[w]==='B'?'selected':''}>先 B，再 A</option></select></label>`).join('')}</div><label class="thread-check"><input id="thread-restart" type="checkbox" ${p.restart?'checked':''}><span>释放旧现场并受控重启<small>先归还已经持有的锁，再从安全点应用新策略。</small></span></label>`;
      for(const w of ['p','q'] as const)($(`thread-lock-${w}`) as HTMLSelectElement).onchange=e=>{this.draft['OS-01'][w]=(e.target as HTMLSelectElement).value as 'A'|'B';this.changed();};
      ($('thread-restart') as HTMLInputElement).onchange=e=>{p.restart=(e.target as HTMLInputElement).checked;this.changed();};
    }else if(id==='OS-02'){
      const p=this.draft[id];host.innerHTML=`<label class="thread-range">每等待 <b id="thread-aging-number">${p.aging||'∞'}</b> 周期，优先级增加一级<input id="thread-aging" aria-label="优先级老化间隔" type="range" min="0" max="32" step="1" value="${p.aging}"><small>0 = 禁用老化。数值越小，等待越快积累成优先级。</small></label><label class="thread-check"><input id="thread-oldest" type="checkbox" ${p.oldestFirst?'checked':''}><span>同优先级时先来先服务<small>不删除背景请求，居民与快车都需要继续运行。</small></span></label>`;
      ($('thread-aging') as HTMLInputElement).oninput=e=>{p.aging=Number((e.target as HTMLInputElement).value);txt('thread-aging-number',String(p.aging||'∞'));this.changed();};
      ($('thread-oldest') as HTMLInputElement).onchange=e=>{p.oldestFirst=(e.target as HTMLInputElement).checked;this.changed();};
    }else if(id==='OS-03')this.choices(id,[['split','分离读写','READ → ADD → WRITE'],['atomic','原子提交','ATOMIC.ADD(1)'],['mutex','互斥区','LOCK → READ/WRITE → UNLOCK']]);
    else if(id==='OS-04'){
      const p=this.draft[id];host.innerHTML=`<div class="thread-frame-order"><span>最久端</span><b>①</b><b>②</b><b>③</b><span>最近端</span></div><label class="thread-check"><input id="thread-touch" type="checkbox" ${p.touchOnHit?'checked':''}><span>命中后移到最近端<small>每次使用都更新它在队列中的位置。</small></span></label><label class="thread-select">缺页时从哪一端换出？<select id="thread-evict"><option value="oldest" ${p.evict==='oldest'?'selected':''}>最久未更新端</option><option value="newest" ${p.evict==='newest'?'selected':''}>最近更新端</option></select></label>`;
      ($('thread-touch') as HTMLInputElement).onchange=e=>{p.touchOnHit=(e.target as HTMLInputElement).checked;this.changed();};
      ($('thread-evict') as HTMLSelectElement).onchange=e=>{p.evict=(e.target as HTMLSelectElement).value as 'oldest'|'newest';this.changed();};
    }else if(id==='OS-S1')this.choices(id,[['if','IF / 只检查一次','CHECK → WAIT → CONSUME'],['while','WHILE / 醒来重新检查','CHECK → WAIT → CHECK ↶']]);
    else this.choices(id,[['split','先检查，再设置','READ EMPTY → WRITE OWNER'],['cas','CAS / 比较并取得','COMPARE_AND_SET(EMPTY, SELF)']]);
  }
  private choices(id:'OS-03'|'OS-S1'|'OS-S2',options:string[][]):void {
    $('thread-controls').innerHTML=`<div class="thread-choices">${options.map(([value,label,code])=>`<button data-thread-choice="${value}" aria-pressed="${this.draft[id]===value}"><i></i><span><b>${label}</b><code>${code}</code></span></button>`).join('')}</div>${id==='OS-S2'?'<p class="thread-small">本关独占权限在归还前不会超时；未取得权限的副本继续等待。</p>':''}`;
    $('thread-controls').querySelectorAll<HTMLButtonElement>('[data-thread-choice]').forEach(b=>b.onclick=()=>{Object.assign(this.draft,{[id]:b.dataset.threadChoice});this.changed();this.renderControls();$('thread-controls').querySelector<HTMLButtonElement>(`[data-thread-choice="${b.dataset.threadChoice}"]`)?.focus({preventScroll:true});});
  }
  preview(playing=true):void {
    if(!this.panel)return;const id=this.panel;
    try{const run=this.authority.preview(id,this.draft[id],`${id}:preview`);this.trace={run,index:0,playing,age:0};this.renderReport(run,true);this.renderTrace();$('thread-trace').scrollIntoView({block:'nearest'});this.h.audio.cue(run.passed?'success':'fail');}catch(e){this.h.toast((e as Error).message);}
  }
  private stepTrace():void {if(!this.trace){this.preview(false);return;}this.trace.playing=false;this.trace.index=Math.min(this.trace.run.log.length-1,this.trace.index+1);this.renderTrace();}
  private renderTrace():void {
    if(!this.trace||!this.panel)return;const t=this.trace,e=t.run.log[t.index];show('thread-trace',Boolean(e));if(!e)return;
    txt('thread-trace-label',`${t.run.runId} / ${t.index+1} OF ${t.run.log.length}`);txt('thread-auto',t.playing?'暂停回放 Ⅱ':'继续回放 ▷');
    txt('thread-current-event',`${e.tick} / ${e.actor} / ${e.kind}\n${e.detail}`);
    $('thread-event-list').innerHTML=t.run.log.map((row,i)=>`<li class="${i===t.index?'current':i<t.index?'past':''}"><span>${row.tick} / ${row.actor}</span>${row.detail}</li>`).join('');
    this.h.view.thread!.present(this.panel,t.run,t.index);
  }
  private renderReport(run:ThreadRun,preview:boolean):void {
    show('thread-report',true);$('thread-report').innerHTML=`<span class="mono">${run.runId} / ${preview?'PREVIEW · 尚未提交':'ASSERT'}</span><h3>${run.passed?'✓ 回归通过':'↶ 找到了反例'}</h3><p>${run.reason}</p>${run.assertions.map(a=>`<div class="thread-assert ${a.passed?'pass':'fail'}"><b>${a.passed?'✓':'×'} ${a.name}</b><small>${a.detail}</small></div>`).join('')}`;
  }
  verify():void {
    if(!this.panel)return;const id=this.panel,data=this.h.campaign().data;
    try{
      const run=this.authority.submit(id,this.draft[id],`${id}:${data.attempts+1}`);data.attempts++;this.h.campaign().lastRun=run;
      if(!run.passed){data.counterexamples++;this.trace={run,index:0,playing:false,age:0};this.renderReport(run,false);this.renderTrace();this.h.persist();this.h.audio.cue('fail');$('thread-report').scrollIntoView({block:'nearest'});return;}
      this.closePanel();if(this.tracked===id)this.tracked=null;this.sync();this.h.persist();this.h.audio.cue('success');this.startCinema({kind:'repair',age:0,id,run});
    }catch(e){this.h.toast((e as Error).message);}
  }
  private audit():void {
    const data=this.h.campaign().data;
    try{const run=this.authority.audit(`CITY-03:${data.attempts+1}`);data.attempts++;this.h.campaign().lastRun=run;
      if(!run.passed){data.counterexamples++;this.h.persist();this.h.toast(run.reason,7);return;}
      this.sync();this.h.persist();this.startCinema({kind:'audit',age:0,run});
    }catch(e){this.h.toast((e as Error).message);}
  }
  openJournal():void {
    if(this.blocked)return;this.journal=true;this.h.block(true);show('thread-field-tools',false);show('thread-journal',true);show('interact-prompt',false);this.renderJournal();$('thread-journal-close').focus({preventScroll:true});
  }
  private renderJournal():void {
    $('thread-journal-grid').innerHTML=allCases.map(id=>{
      const l=THREAD_LESSONS[id],done=this.state.completed.includes(id),open=threadUnlocked(this.state,id),seen=this.state.evidence.includes(id);
      return `<article class="${THREAD_SIDE.includes(id as typeof THREAD_SIDE[number])?'side':''} ${done?'done':''}"><span class="mono">${id} / ${done?'已修复':open?'可探索':'尚未开放'}</span><h3>${l.name}</h3><p>${done?l.story:open?'靠近设备，扫描现场再进入断点。':'推进主线后，这一层会开放。'}</p><div><button data-thread-track="${id}" ${open?'':'disabled'}>导航 →</button>${seen?`<button data-thread-shuttle="${id}">站间接驳 ↗</button>`:''}</div></article>`;
    }).join('');
    $('thread-journal-grid').querySelectorAll<HTMLButtonElement>('[data-thread-track]').forEach(b=>b.onclick=()=>{this.tracked=b.dataset.threadTrack as ThreadCase;this.closeJournal();this.updateHud();this.h.toast(`已标记 ${THREAD_LESSONS[this.tracked].name}。沿灯带前往，或对已扫描站台使用接驳。`,5);});
    $('thread-journal-grid').querySelectorAll<HTMLButtonElement>('[data-thread-shuttle]').forEach(b=>b.onclick=()=>{const id=b.dataset.threadShuttle as ThreadCase;if(!this.state.evidence.includes(id)||!threadUnlocked(this.state,id))return;this.closeJournal();this.startCinema({kind:'shuttle',age:0,id,target:{...THREAD_POS[id],z:THREAD_POS[id].z+4}});});
  }
  closeJournal():void {if(!this.journal)return;this.journal=false;show('thread-journal',false);this.h.block(false);this.h.view.mode='follow';this.h.clearInput();this.updateHud();}
  private startCinema(cinema:Cinema):void {
    this.cinema=cinema;this.h.block(true);show('thread-cinema',true);show('interact-prompt',false);show('thread-field-tools',false);this.h.clearInput();
    const kind=cinema.kind;this.h.view.mode=kind==='arrival'?'thread-arrival':kind==='ride'?'thread-ride':kind==='audit'?'thread-audit':'thread-device';
    if(cinema.id)this.h.view.thread!.focus=THREAD_POS[cinema.id];
    txt('thread-run-id',cinema.run?.runId??(kind==='arrival'?'INTERCITY / 02 → 03':kind==='ride'?'CITY-03 / EVACUATION':'THREADFALL / STATION SHUTTLE'));
    txt('thread-cinema-kicker',kind==='arrival'?'CHAPTER 03 / ARRIVAL':kind==='repair'?'SYSTEM RESTORED':kind==='audit'?'FOUR SYSTEMS / VERIFIED':kind==='shuttle'?'STATION TRANSFER':'TWO LIFELINES / HOMEBOUND');
    txt('thread-cinema-title',kind==='arrival'?'下一站，千线程。':kind==='repair'?THREAD_LESSONS[cinema.id!].name+'，恢复运行。':kind==='audit'?'四个系统，终于一起运行。':kind==='shuttle'?'下一站，'+THREAD_LESSONS[cinema.id!].name+'。':'这一次，谁都不会被留下。');
    txt('thread-cinema-detail',kind==='arrival'?'两座高塔、两条列车、六段被困住的故事。有人一直在等下一个可执行的瞬间。':kind==='repair'?THREAD_LESSONS[cinema.id!].story:kind==='audit'?'共同锁序、等待老化、完整计票、工作集保留同时通过。到双线站按 E 登车。':kind==='shuttle'?'接驳车将送你回到已经扫描过的站台。修复记录和证据全部保留。':'P 与 Q 都已获得安全出发许可。城市会记得每一位等待的人。');
    if(kind==='ride')this.h.view.thread!.rideT=0;$('thread-skip').focus({preventScroll:true});
  }
  finishCinema():void {
    const cinema=this.cinema;if(!cinema)return;this.cinema=null;show('thread-cinema',false);
    if(cinema.kind==='ride'){
      if(!this.authority.finish()){this.h.toast('疏散验证尚未通过。');this.h.block(false);this.h.view.mode='follow';return;}
      this.h.campaign().data.threadClearance=structuredClone(this.state);this.h.view.thread!.rideT=null;this.sync();this.h.motor.warp(THREAD_END);this.h.persist();this.showResult();return;
    }
    if(cinema.kind==='shuttle'&&cinema.target){this.h.motor.warp(cinema.target);this.h.motor.setCheckpoint(cinema.target);}
    this.h.block(false);this.h.view.mode='follow';this.h.clearInput();this.updateHud();
  }
  showResult():void {
    this.result=true;this.h.block(true);show('thread-result',true);show('thread-field-tools',false);show('interact-prompt',false);this.h.view.mode='thread-result';
    const optional=this.state.completed.filter(id=>THREAD_SIDE.includes(id as typeof THREAD_SIDE[number])).length;
    txt('thread-ending',optional===2?'六段故事都已接回世界。IRIS 与哥哥的列车，终于在同一个站台停下。':`四条主线已经恢复。沿途还有 ${2-optional} 段故事，任务册会为你保留它们的位置。`);
    $('thread-result-stats').innerHTML=`<span><b>4 / 4</b>主线修复</span><span><b>${optional} / 2</b>支线故事</span><span><b>05 / 08</b>开放城市</span>`;
    this.h.audio.cue('success');this.h.persist();$('thread-result').scrollTop=0;$('thread-roam').focus({preventScroll:true});
  }
  private roam():void {this.result=false;show('thread-result',false);this.h.block(false);this.h.view.mode='follow';this.h.clearInput();this.updateHud();}
  hint():void {
    const id=this.panel??this.currentCase();if(id){const index=this.hints[id]??0;this.hints[id]=index+1;this.h.toast(THREAD_LESSONS[id].hints[Math.min(index,2)],9);}else this.h.toast(this.state.phase==='arrival'?'前方左侧蓝色断环角色就是 IRIS。靠近后按 E。':this.state.phase==='audit'?'到最北端 WAIT-FOR-∞ 终端按 E，运行综合回归。':this.state.phase==='evacuate'?'综合回归通过后，在同一站台再按 E 登上双线列车。':'M 打开任务册。蓝色支线可以回访，扫描过的站台可以接驳。',8);
  }
  action(key:string,reverse=false):boolean {
    if(key==='Tab'&&this.blocked){
      const root=this.panel?$('thread-editor'):this.journal?$('thread-journal'):this.dialogue>=0?$('thread-dialog'):this.cinema?$('thread-cinema'):$('thread-result');
      const items=Array.from(root.querySelectorAll<HTMLElement>('button:not([disabled]),input,select')).filter(e=>e.getClientRects().length>0),at=items.indexOf(document.activeElement as HTMLElement);
      items[(at+(reverse?-1:1)+items.length)%items.length]?.focus();return true;
    }
    if(key==='Escape'){
      if(this.panel)this.closePanel();else if(this.journal)this.closeJournal();else if(this.dialogue>=0){this.dialogue=1;this.advanceDialogue();}else if(this.cinema)this.finishCinema();else if(this.result)this.roam();else return false;return true;
    }
    if(key==='KeyE'){this.interact();return true;}if(key==='KeyQ'){this.scan();return true;}
    if(key==='KeyR'&&this.panel){this.verify();return true;}
    if((key==='KeyM'||key==='Tab')&&!this.blocked){this.openJournal();return true;}return false;
  }
  tick(dt:number):void {
    if(!this.active)return;
    this.h.view.thread!.hero.group.rotation.y=this.h.motor.facing;
    if(this.trace?.playing&&this.panel){this.trace.age+=dt;if(this.trace.age>.7){this.trace.age=0;if(this.trace.index<this.trace.run.log.length-1)this.trace.index++;else this.trace.playing=false;this.renderTrace();}}
    if(this.cinema){const c=this.cinema;c.age+=dt;
      if(c.kind==='ride'){const t=Math.min(1,c.age/18);this.h.view.thread!.rideT=t;this.h.motor.warp(this.h.view.thread!.ridePosition(t));}
      const duration=c.kind==='arrival'?5:c.kind==='repair'?4.5:c.kind==='audit'?5:c.kind==='shuttle'?2.5:18;
      if(c.age>=duration)this.finishCinema();
    }
    this.hudTime+=dt;if(this.hudTime>.1){this.hudTime=0;this.updateHud();}
  }
}

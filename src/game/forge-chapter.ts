import type { Campaign, RunResult } from './domain';
import { FORGE_PHASES, freshForge, runCarry, runPower, stepPower, type Flag, type Weather } from './forge-domain';
import { ALU, FORGE_START, K13, LIFT, RELAY, SUMMIT } from './pulse-world';
import type { CityView } from './view';
import type { Motor, V3 } from './physics';
import type { CityAudio } from './audio';
import './forge.css';

const $ = (id:string):HTMLElement => document.getElementById(id)!;
const show=(id:string,on:boolean):void=>{$(id).hidden=!on;};
const txt=(id:string,text:string):void=>{$(id).textContent=text;};
const distance=(a:V3,b:V3):number=>Math.hypot(a.x-b.x,a.z-b.z);
const stageCopy = {
  arrival:['02 / PULSE FORGE','这里的太阳也会漏电','沿铜色灯带找到热工师 K-13。靠近后按 E。',K13,'K-13 / 热工师'],
  climate:['WF-01 / WEATHER CIRCUIT','借一场晴，再借一场雨','到集电台按 Q 扫描，再按 E 操作天气与隔离闸。',RELAY,'WF-01 / 集电台'],
  carry:['CO-01 / CARRY FLAG','归零之后，仍有进位','沿亮起的坡道登上时钟塔底部。扫描失忆电梯。',ALU,'CO-01 / 失忆电梯'],
  exit:['FINAL / CARRY CASCADE','让被遗忘的进位升起','走到圆形升降台，按 E 乘梯俯瞰整座脉冲炉。',LIFT,'LIFT / 进位升降台'],
  complete:['CHAPTER 02 / RESTORED','这座城市，记得下一位','脉冲炉已恢复。可切换天气漫游，或乘车返回指针港。',SUMMIT,'02 / 已恢复'],
} as const;
interface Hooks {
  campaign:()=>Campaign; view:CityView; motor:Motor; audio:CityAudio;
  block:(on:boolean)=>void; persist:()=>void; toast:(s:string,n?:number)=>void;
  clearInput:()=>void; weather:(w:Weather)=>void; returnDock:()=>void; enterThread:()=>void;
}
export class ForgeChapter {
  panel:'power'|'carry'|null=null;
  cinema:{kind:'arrival'|'power'|'carry'|'lift';age:number}|null=null;
  result=false;
  draft:Flag='ZERO';
  private report:RunResult|null=null;
  private elapsed=0;
  private hudTimer=0;
  constructor(private h:Hooks) {
    const root=document.createElement('div');root.id='forge-layer';root.hidden=true;
    root.innerHTML=`<section id="forge-workbench" hidden aria-label="脉冲炉工作台">
      <div class="forge-panel-head"><span class="eyebrow">CAUSAL NEEDLE / 02</span><button id="forge-close" class="close-button" aria-label="关闭脉冲炉工作台">×</button></div>
      <div class="forge-scroll"><div id="forge-task"></div><div id="forge-controls"></div><div id="forge-report" hidden aria-live="polite"></div></div>
      <div class="forge-panel-foot"><button id="forge-preview" class="text-button">检测当前状态 ↗</button><button id="forge-verify" class="primary">验证并接入 <kbd>R</kbd> →</button></div>
    </section>
    <div id="forge-cinema" hidden><div class="forge-cinema-top mono">CIVITAS / <span id="forge-run-id"></span></div><div class="forge-cinema-copy"><div id="forge-cinema-kicker" class="eyebrow"></div><h2 id="forge-cinema-title"></h2><p id="forge-cinema-detail"></p><button id="forge-skip" class="text-button">跳过镜头 →</button></div></div>
    <section id="forge-result" hidden><div class="eyebrow">CHAPTER 02 / PULSE FORGE</div><div class="forge-result-code">200 <span>OK</span></div><h2>归零不是遗忘。<br>还有下一位，在等你。</h2><p>晴天留下能量，雨水带走热量。<br>你让城市记住了越过边界的那一点光。</p><div id="forge-result-stats"></div><button id="forge-next-city" class="primary">下一站 · 千线程 →</button><button id="forge-roam" class="text-button">留在脉冲炉 ↗</button><button id="forge-return" class="text-button">乘城际列车返回指针港 →</button><button id="forge-replay" class="text-button">重新修复脉冲炉 ↶</button><div class="forge-next mono">05 / 08 城市已开放<br><span>第三城 · 千线程 / 四关主线 + 两关支线</span></div></section>
    <button id="forge-return-small" class="text-button" hidden>← 返回指针港</button>
    </div>`;
    $('app').append(root);
    $('forge-close').onclick=()=>this.closePanel();$('forge-preview').onclick=()=>this.verify(true);$('forge-verify').onclick=()=>this.verify();
    $('forge-skip').onclick=()=>this.finishCinema();$('forge-roam').onclick=()=>this.roam();
    $('forge-return').onclick=()=>this.h.returnDock();$('forge-return-small').onclick=()=>this.h.returnDock();
    $('forge-next-city').onclick=()=>this.h.enterThread();
    $('forge-replay').onclick=()=>{const data=this.h.campaign().data;if(data.forge.phase==='complete')data.forgeClearance=structuredClone(data.forge);data.forge=freshForge();this.enter();};
  }
  get active():boolean {return this.h.view.city==='forge';}
  get blocked():boolean {return this.panel!==null||this.cinema!==null||this.result;}
  private get state(){return this.h.campaign().data.forge;}
  enter():void {
    this.hide();
    this.h.view.switchCity('forge');this.h.audio.city='forge';this.h.audio.recovered=this.state.power.energized;
    this.panel=null;this.cinema=null;this.result=false;this.report=null;this.draft=this.state.flag;
    this.h.campaign().data.city='forge';show('forge-layer',true);this.h.block(false);
    this.sync();this.h.motor.warp(this.h.motor.checkpoint);this.h.view.yaw=0;this.h.view.pitch=.35;
    this.h.view.weather=this.h.campaign().data.weather;
    this.h.view.mode='follow';this.h.persist();this.updateHud();
    if(this.state.phase==='arrival')this.startCinema('arrival');
    else this.h.toast('脉冲炉进度已恢复。晴天蓄能，雨天降温。',5);
  }
  hide():void {
    this.panel=null;this.cinema=null;this.result=false;
    show('forge-layer',false);show('forge-workbench',false);show('forge-cinema',false);show('forge-result',false);
    this.h.view.forge?.setReplay(false);
  }
  sync():void {
    const f=this.state,w=this.h.view.forge!;
    w.setProgress(f);w.setFlag(this.panel==='carry'?this.draft:f.flag);
    this.h.motor.surfaces=w.surfaces;this.h.motor.obstacles=w.obstacles;
    this.h.motor.setCheckpoint(f.phase==='complete'?SUMMIT:f.phase==='exit'?{x:0,y:26,z:-79}:FORGE_PHASES.indexOf(f.phase)>=2?{x:0,y:14,z:-47}:FORGE_START);
    if(!this.cinema)w.liftY=f.phase==='complete'?50:26;
    this.h.audio.recovered=f.power.energized;
  }
  near():boolean {
    const g=stageCopy[this.state.phase],p=this.h.motor.position;
    return distance(p,g[3])<8&&Math.abs(p.y-g[3].y)<5;
  }
  updateHud():void {
    if(!this.active)return;
    const g=stageCopy[this.state.phase],p=this.h.motor.position,d=distance(p,g[3]);
    txt('quest-code',g[0]);txt('quest-title',g[1]);txt('quest-description',g[2]);
    txt('quest-distance',`${d<8?'◇ 已抵达':'↗ '+Math.round(d)+' m'} / ${g[4]}`);
    txt('identity-status','因果织针 / 热工链路已连接');txt('world-state',this.state.phase==='complete'?'状态 / 已恢复':this.state.power.energized?'状态 / 电源已接入':'状态 / 热失衡');
    txt('interact-label',this.state.phase==='arrival'?'与 K-13 对话':this.state.phase==='climate'?(this.state.evidence.includes('WF-01')?'操作集电台':'按 Q 扫描集电台'):this.state.phase==='carry'?(this.state.evidence.includes('CO-01')?'检查进位接线':'按 Q 扫描失忆电梯'):this.state.phase==='exit'?'乘进位升降台':'查看本城修复记录');
    show('interact-prompt',!this.blocked&&this.near());
    show('forge-return-small',!this.blocked);show('btn-forge-travel',false);
    $('mini-player').setAttribute('transform',`translate(${p.x} ${p.z}) rotate(${-this.h.motor.facing*180/Math.PI})`);
    const markers=$('world-markers');markers.replaceChildren();
    if(!this.blocked){const screen=this.h.view.project({...g[3],y:g[3].y+4});if(screen.visible){const m=document.createElement('div');m.className='world-marker';m.style.left=`${screen.x}px`;m.style.top=`${screen.y}px`;m.innerHTML=`<span>${g[4]}</span><i></i>`;markers.append(m);}}
    if(this.panel==='power')this.updatePowerMeters();
  }
  interact():void {
    if(this.blocked)return;
    if(!this.near()){this.h.toast('沿铜色灯带走向菱形标记，靠近后按 E。');return;}
    const f=this.state;
    if(f.phase==='arrival'){
      f.phase='climate';this.h.persist();this.h.view.forge!.scan(K13);
      this.h.toast('K-13：太阳能充电，雨能降温。可雨水也会漏电。先蓄能，再关隔离闸，最后借一场雨。',9);this.updateHud();return;
    }
    if(f.phase==='climate'||f.phase==='carry'){
      const id=f.phase==='climate'?'WF-01':'CO-01';
      if(!f.evidence.includes(id)){this.scan();return;}
      this.openPanel(f.phase==='climate'?'power':'carry');return;
    }
    if(f.phase==='exit'){this.startCinema('lift');return;}
    this.showResult();
  }
  scan():void {
    if(this.blocked)return;
    const f=this.state;
    this.h.view.forge!.scan(this.h.motor.position);this.h.audio.cue('scan');
    if(!this.near()){this.h.toast('完整证据需要靠近当前异常设备。');return;}
    const id=f.phase==='climate'?'WF-01':f.phase==='carry'?'CO-01':null;
    if(id&&!f.evidence.includes(id))f.evidence.push(id);
    this.h.persist();
    this.h.toast(id==='WF-01'?'WF-01：晴天充电 +12%/秒，雨天冷却 −10°C/秒；隔离闸开着时，雨水会漏电 −8%/秒。按 E 操作。':id==='CO-01'?'CO-01：255+1 结果是 0，进位 C=1；0+0 结果也是 0，但 C=0。当前电梯却接在 ZERO 上。按 E 检查。':'K-13：每一种天气都有它能做的事。',9);this.updateHud();
  }
  private openPanel(panel:'power'|'carry'):void {
    this.panel=panel;this.draft=this.state.flag;this.report=null;this.h.block(true);this.h.clearInput();
    show('forge-workbench',true);show('forge-report',false);show('patch-panel',false);show('proof-panel',false);
    show('interact-prompt',false);this.h.view.mode=panel==='power'?'forge-power':'forge-alu';
    $('forge-task').innerHTML=panel==='power'?`<div class="mono forge-case">WF-01 / WEATHER CIRCUIT</div><h2>借一场晴，<br>再借一场雨。</h2><p>先让集电板充电，再关闭隔离闸保存电量，用雨水给核心降温。储能 ≥72%，温度 ≤35°C，才能稳定接入。</p><div class="forge-observed"><small>OBSERVED / 设备实测</small><b>雨水散热，也会导电。</b><span>天气与设备在这里持续运行。暂停菜单可冻结时间。</span></div>`:
      `<div class="mono forge-case">CO-01 / UNSIGNED 8-BIT</div><h2>归零之后，<br>仍有进位。</h2><p>把「电梯使能」接到合适的信号端口。电梯应在产生进位时触发，普通加法时保持静止。</p><div class="forge-observed"><small>OBSERVED / 原始故障</small><b>255 + 1 → 0000 0000</b><span>CARRY = 1 · ZERO = 1<br>0 + 0 → 0000 0000<br>CARRY = 0 · ZERO = 1<br>原始接线：ZERO → 电梯使能</span></div>`;
    this.renderControls();txt('forge-verify',panel==='power'?'验证并接入 R →':'重放并验证 R →');
    $('forge-close').focus({preventScroll:true});$('forge-workbench').querySelector('.forge-scroll')!.scrollTop=0;
  }
  closePanel():void {
    if(!this.panel)return;
    this.panel=null;show('forge-workbench',false);this.h.view.forge!.setFlag(this.state.flag);
    this.h.block(false);this.h.view.mode='follow';this.h.clearInput();this.h.persist();this.updateHud();
  }
  private renderControls():void {
    if(this.panel==='power'){
      $('forge-controls').innerHTML=`<div class="forge-meters"><div><label for="forge-charge">储能 <b id="forge-charge-text"></b></label><progress id="forge-charge" max="100"></progress><small>晴天 +12%/s · 开闸雨天 −8%/s</small></div><div><label for="forge-heat">核心温度 <b id="forge-heat-text"></b></label><meter id="forge-heat" min="20" max="100" low="35" high="65" optimum="24"></meter><small>雨天 −10°C/s · 晴天开闸 +4°C/s</small></div></div><div class="forge-weather-buttons"><button id="forge-sun">☀ 晴天 / 蓄能</button><button id="forge-rain">☂ 雨天 / 降温</button></div><button id="forge-isolate" class="forge-isolator"></button><p class="forge-tip" id="forge-live-hint"></p>`;
      $('forge-sun').onclick=()=>this.h.weather('clear');$('forge-rain').onclick=()=>this.h.weather('rain');
      $('forge-isolate').onclick=()=>{this.state.power.isolated=!this.state.power.isolated;this.report=null;show('forge-report',false);this.h.audio.cue('select');this.sync();this.h.persist();this.updatePowerMeters();};this.updatePowerMeters();
    } else {
      $('forge-controls').innerHTML=`<div class="forge-wiring"><small class="mono">SIGNAL SOURCE → LIFT.ENABLE</small>${(['ZERO','CARRY','POWER'] as Flag[]).map(flag=>`<button data-flag="${flag}" aria-pressed="${this.draft===flag}"><i></i><b>${flag}</b><span>${flag==='ZERO'?'结果为零':flag==='CARRY'?'产生进位':'始终通电'}</span><em>${this.draft===flag?'已接线':'接入 →'}</em></button>`).join('')}</div><p class="forge-tip">选择端口会改变塔上接线。预演包含 0、1、254、255 等边界；验证还会遍历全部 65,536 组输入。</p>`;
      $('forge-controls').querySelectorAll<HTMLButtonElement>('[data-flag]').forEach(btn=>btn.onclick=()=>{this.draft=btn.dataset.flag as Flag;this.h.view.forge!.setFlag(this.draft);show('forge-report',false);this.report=null;this.h.audio.cue('select');this.renderControls();});
    }
  }
  private updatePowerMeters():void {
    const p=this.state.power,w=this.h.campaign().data.weather;
    ($('forge-charge') as HTMLProgressElement).value=p.charge;($('forge-heat') as HTMLMeterElement).value=p.temperature;
    txt('forge-charge-text',`${p.charge.toFixed(1)}%`);txt('forge-heat-text',`${p.temperature.toFixed(1)}°C`);
    txt('forge-isolate',p.isolated?'隔离闸已关闭 · 点此打开':'隔离闸开着 · 点此关闭');$('forge-isolate').setAttribute('aria-pressed',String(p.isolated));
    $('forge-sun').setAttribute('aria-pressed',String(w==='clear'));$('forge-rain').setAttribute('aria-pressed',String(w==='rain'));
    txt('forge-live-hint',p.charge>=72&&p.temperature<=35&&p.isolated?'电量与温度均已达标。点击「验证并接入」。':p.isolated?(w==='rain'?'储能已保住，雨水正在给核心降温。':'隔离闸关闭，储能被保住。切到雨天加快降温。'):w==='clear'?(p.charge>=80?'储能充足。关闭隔离闸，再切换雨天。':'集电板正在充电。建议蓄能至 80% 以上再关闭隔离闸。'):'雨水正在降温，也会漏电。先切晴天蓄能。');
  }
  verify(preview=false):void {
    if(!this.panel)return;
    const f=this.state,expected=this.panel==='power'?'climate':'carry',id=this.panel==='power'?'WF-01':'CO-01';
    if(f.phase!==expected||!f.evidence.includes(id)){this.h.toast('先扫描对应设备，取得原始证据。');return;}
    const campaign=this.h.campaign();if(!preview)campaign.data.attempts++;
    const runId=`${id}:${preview?'preview':campaign.data.attempts}`;
    const r=this.panel==='power'?runPower(f.power,runId):runCarry(this.draft,runId);
    this.report=r;if(!preview)campaign.lastRun=r;this.renderReport(preview);this.h.audio.cue(r.passed?'success':'fail');
    if(preview||!r.passed){if(!preview){campaign.data.counterexamples++;this.h.persist();}return;}
    const kind=this.panel==='power'?'power':'carry';
    if(kind==='power'){f.power.energized=true;f.phase='carry';}
    else{f.flag=this.draft;f.phase='exit';}
    this.closePanel();this.sync();this.h.persist();this.startCinema(kind,r.runId);
  }
  private renderReport(preview:boolean):void {
    const r=this.report!;show('forge-report',true);
    $('forge-report').innerHTML=`<span class="mono">${r.runId} / ${preview?'PREVIEW':'ASSERT'}</span><h3>${r.passed?'✓ 回归通过':'↶ 找到了反例'}</h3><p>${r.reason}</p>${this.panel==='power'?'<p>报告保留按键时的采样快照；上方设备读数继续实时更新。</p>':''}${r.assertions.map(a=>`<div class="forge-assert ${a.passed?'pass':'fail'}"><b>${a.passed?'✓':'×'} ${a.name}</b><small>${a.detail}</small></div>`).join('')}<details><summary>查看执行记录</summary><div class="mono">${r.log.map(e=>`${e.tick} / ${e.kind} / ${e.detail}`).join('<br>')}</div></details>`;
    $('forge-report').scrollIntoView({block:'nearest',behavior:'smooth'});
  }
  private startCinema(kind:'arrival'|'power'|'carry'|'lift',runId=kind==='arrival'?'INTERCITY / 01 → 02':this.h.campaign().lastRun?.runId??'CO-01:stored-proof'):void {
    this.cinema={kind,age:0};this.h.block(true);this.h.clearInput();show('patch-panel',false);show('forge-workbench',false);show('forge-cinema',true);show('interact-prompt',false);show('forge-return-small',false);
    this.h.view.mode=kind==='arrival'?'forge-arrival':kind==='power'?'forge-power':kind==='carry'?'forge-alu':'forge-rise';
    this.h.view.forge!.setReplay(kind==='carry');txt('forge-run-id',runId);
    txt('forge-cinema-kicker',kind==='arrival'?'CHAPTER 02 / ARRIVAL':kind==='power'?'WEATHER CIRCUIT / STABLE':kind==='carry'?'CARRY CASCADE / VERIFIED':'ELEVATOR / ASCENDING');
    txt('forge-cinema-title',kind==='arrival'?'下一站，脉冲炉。':kind==='power'?'把晴天，留给雨天。':kind==='carry'?'归零之后，还有下一位。':'让整座城市，记住这道光。');
    txt('forge-cinema-detail',kind==='arrival'?'指针港的列车带你越过海湾。这里的人们，正困在一次被忘掉的进位里。':kind==='power'?'储能已锁存，雨天保电回归通过。前方的散热桥已经展开，沿灯带继续登塔。':kind==='carry'?'65,536 组加法全部通过。八位时钟塔开始传递进位，电梯不再误重启。':'进位升降台正在上行。晴天与雨天，都有属于它们的位置。');
    $('forge-skip').focus({preventScroll:true});
  }
  finishCinema():void {
    const kind=this.cinema?.kind;if(!kind)return;
    this.cinema=null;show('forge-cinema',false);this.h.view.forge!.setReplay(false);
    if(kind==='lift'){
      this.state.phase='complete';this.h.campaign().data.forgeClearance=structuredClone(this.state);this.sync();this.h.view.forge!.liftY=50;this.h.motor.warp(SUMMIT);this.h.persist();this.showResult();return;
    }
    this.h.block(false);this.h.view.mode='follow';this.h.clearInput();this.updateHud();
    if(kind==='power')this.h.toast('沿展开的铜色通道前行，登上两段坡道，在塔底扫描电梯。',6);
  }
  showResult():void {
    this.result=true;this.h.block(true);show('patch-panel',false);show('forge-result',true);show('interact-prompt',false);show('forge-return-small',false);this.h.view.mode='forge-result';
    const data=this.h.campaign().data;
    $('forge-result-stats').innerHTML=`<span><b>05 / 08</b>已开放城市</span><span><b>65,536</b>加法回归</span><span><b>${Math.floor(data.elapsed/60)}分${Math.floor(data.elapsed%60)}秒</b>累计旅程</span>`;
    this.h.audio.cue('success');this.h.persist();
  }
  private roam():void {
    this.result=false;show('forge-result',false);this.h.block(false);this.h.view.mode='follow';this.h.clearInput();this.updateHud();
    this.h.toast('塔顶可自由观景。M 打开城际图，左下可返回指针港。',5);
  }
  hint():void {
    this.h.toast(this.state.phase==='climate'?'切晴天，开隔离闸充到 80% 以上 → 关闭隔离闸 → 切雨天降到 35°C 以下 → 验证并接入。':this.state.phase==='carry'?'归零不等于进位。让电梯使能连接 CARRY，再验证；0+0 也必须保持静止。':this.state.phase==='arrival'?'沿铜色灯带向前，左侧蓝色断环角色就是 K-13。靠近按 E。':'沿灯带到圆形升降台，按 E。完成后可切换天气观景。',9);
  }
  action(key:string):boolean {
    if(key==='Escape'){
      if(this.panel){this.closePanel();return true;}
      if(this.cinema){this.finishCinema();return true;}
      if(this.result){this.roam();return true;}return false;
    }
    if(key==='KeyQ'){this.scan();return true;}
    if(key==='KeyE'){this.interact();return true;}
    if(key==='KeyR'&&this.panel){this.verify();return true;}
    return false;
  }
  tick(dt:number):void {
    if(!this.active)return;
    this.elapsed+=dt;
    if(this.state.phase==='climate'){
      // Integrate exactly-sized steps even while the device workbench is open.
      let left=dt;while(left>0){const step=Math.min(left,1/60);this.state.power=stepPower(this.state.power,this.h.campaign().data.weather,step);left-=step;}
      this.h.view.forge!.setProgress(this.state);
    }
    if(this.cinema){
      this.cinema.age+=dt;
      if(this.cinema.kind==='lift'){
        const t=Math.min(1,this.cinema.age/8),smooth=t*t*(3-2*t),y=26+24*smooth;
        this.h.view.forge!.liftY=y;this.h.motor.warp({...LIFT,y});
      }
      if(this.cinema.age>(this.cinema.kind==='arrival'?5:this.cinema.kind==='power'?4:this.cinema.kind==='carry'?6:8))this.finishCinema();
    }
    this.h.view.forge!.hero.group.rotation.y=this.h.motor.facing;
    if(this.state.phase==='carry'&&this.h.motor.position.y>25&&distance(this.h.motor.position,ALU)<12)this.h.motor.setCheckpoint({x:0,y:26,z:-79});
    this.hudTimer+=dt;if(this.hudTimer>.1){this.hudTimer=0;this.updateHud();}
  }
}

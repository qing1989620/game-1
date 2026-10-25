import type { Campaign } from './domain';
import { MirrorCampaign, MIRROR_CASES, freshMirror, runMirrorCase, type MirrorCase, type MirrorPatches, type MirrorRun } from './mirror-domain';
import { MIRROR_AUDIT, MIRROR_BOUNDS, MIRROR_GUIDE, MIRROR_POS, mirrorCheckpoint } from './mirror-layout';
import type { Motor, V3 } from './physics';
import type { CityView } from './view';
import type { CityAudio } from './audio';
import './mirror.css';

const $=(id:string)=>document.getElementById(id)!;
const show=(id:string,on:boolean)=>{$(id).hidden=!on;};
const text=(id:string,value:string)=>{$(id).textContent=value;};
const near=(a:V3,b:V3)=>Math.hypot(a.x-b.x,a.z-b.z)<8&&Math.abs(a.y-b.y)<4;
const names:Record<MirrorCase,string>={'MEM-01':'过期的倒影','MEM-02':'两份相同的决定','MEM-03':'旧主归来'};
const descriptions:Record<MirrorCase,string>={
  'MEM-01':'原件已经更新，镜像却仍给访客看旧版本。一次延迟的失效消息还可能让旧镜像复活。',
  'MEM-02':'两位医生读取同一份值守快照，然后各自决定离开。两份局部正确的决定，合起来会让病房无人值守。',
  'MEM-03':'主副本失联后，新主必须获得足够票数。旧主归来时，它不能用旧纪元覆盖新的求救记录。',
};
interface Hooks {campaign:()=>Campaign;view:CityView;motor:Motor;audio:CityAudio;block:(on:boolean)=>void;clearInput:()=>void;persist:()=>void;toast:(message:string,seconds?:number)=>void;returnSnow:()=>void;openMap:()=>void}
export class MirrorChapter {
  panel:MirrorCase|null=null;journal=false;result=false;dialogue=false;
  private draft:MirrorPatches=freshMirror().patches;private run:MirrorRun|null=null;private traceIndex=0;private cursor=0;private tracked:MirrorCase|null=null;
  private get state(){return this.h.campaign().data.mirror;}
  private get authority(){return new MirrorCampaign(this.state);}
  get active(){return this.h.view.city==='mirror';}
  get blocked(){return !!this.panel||this.journal||this.result||this.dialogue;}
  constructor(private h:Hooks){
    const root=document.createElement('div');root.id='mirror-layer';root.hidden=true;
    root.innerHTML=`<nav id="mirror-tools"><button id="mirror-journal-open">镜像档案 <kbd>M</kbd> · <span id="mirror-progress">0 / 3</span></button><button id="mirror-back">← 白噪雪原</button></nav>
      <section id="mirror-dialog" hidden><span>NYX / 镜库管理员</span><p>这里保存着城市每一次求救的倒影。原件改变后，旧倒影仍会说话；两个守护者各看见一半真相；失联的旧主以为自己仍有权覆盖新记录。请先扫描，再改写规则。</p><button id="mirror-dialog-close">开始检查 <kbd>E</kbd> →</button></section>
      <section id="mirror-editor" hidden role="dialog" aria-modal="true" aria-labelledby="mirror-title"><header><div><small>MEMORY VAULT / 05</small><h2 id="mirror-title"></h2></div><button id="mirror-close" aria-label="关闭镜库工作台">×</button></header><div class="mirror-scroll"><p id="mirror-description"></p><div id="mirror-controls"></div><section id="mirror-report" hidden aria-live="polite"></section><div id="mirror-trace" hidden><div class="mirror-trace-tools"><label>执行情景 <select id="mirror-scenario"></select></label><button id="mirror-step">执行一步 →</button></div><ol id="mirror-events"></ol></div></div><footer><button id="mirror-preview">预演</button><button id="mirror-verify">运行完整验证 <kbd>R</kbd> →</button></footer></section>
      <section id="mirror-journal" hidden role="dialog" aria-modal="true" aria-labelledby="mirror-journal-title"><header><div><small>ARCHIVE / 05</small><h2 id="mirror-journal-title">镜库城 · 档案</h2></div><button id="mirror-journal-close" aria-label="关闭镜像档案">×</button></header><p>三面镜子保留了错误发生的过程。每一关先按 Q 取证，再按 E 进入工作台。</p><div id="mirror-journal-list"></div><footer><button id="mirror-map">城际地图 ↗</button></footer></section>
      <section id="mirror-result" hidden><div><small>CHAPTER 05 / THE MEMORY VAULT</small><strong>200 <em>OK</em></strong><h2>原件仍在，<br>倒影终于学会让路。</h2><p>三处镜像故障与全城回归已修复。求救记录在失效、并发和旧主归来后都不会被抹去。</p><button id="mirror-roam">留在镜库城探索 ↗</button><button id="mirror-result-map">打开城际地图 ↗</button><button id="mirror-replay">重新修复第五城 ↶</button><small>05 / 08 城市已开放 · 下一站：语法穹顶 / 规划中</small></div></section>`;
    $('app').append(root);
    $('mirror-dialog-close').onclick=()=>this.endDialogue();$('mirror-close').onclick=()=>this.closePanel();
    $('mirror-preview').onclick=()=>this.preview();$('mirror-verify').onclick=()=>this.verify();
    $('mirror-step').onclick=()=>this.step();($('mirror-scenario') as HTMLSelectElement).onchange=()=>{this.traceIndex=Number(($('mirror-scenario') as HTMLSelectElement).value);this.cursor=0;this.renderTrace();};
    $('mirror-journal-open').onclick=()=>this.openJournal();$('mirror-journal-close').onclick=()=>this.closeJournal();
    $('mirror-map').onclick=$('mirror-result-map').onclick=()=>{this.closeJournal();this.result=false;show('mirror-result',false);this.h.block(false);this.h.openMap();};
    $('mirror-back').onclick=()=>this.h.returnSnow();$('mirror-roam').onclick=()=>this.roam();
    $('mirror-replay').onclick=()=>{this.h.campaign().data.mirror=freshMirror();this.enter();};
  }
  enter(){
    this.hide();this.h.view.switchCity('mirror');this.h.campaign().data.city='mirror';this.h.audio.city='mirror';show('mirror-layer',true);
    this.sync();this.h.motor.warp(this.h.motor.checkpoint);this.h.motor.facing=Math.PI;this.h.view.yaw=0;this.h.view.pitch=.38;this.h.view.mode='follow';this.h.block(false);this.h.persist();this.updateHud();
    this.h.toast(this.state.phase==='arrival'?'跟随青色光带找到 NYX，按 E 了解镜库城。':'镜库记录已恢复。Q 扫描设备，E 检查，M 查看档案。',6);
  }
  hide(){this.panel=null;this.journal=false;this.result=false;this.dialogue=false;this.run=null;this.tracked=null;
    for(const id of ['mirror-layer','mirror-dialog','mirror-editor','mirror-journal','mirror-result'])show(id,false);
  }
  sync(){const world=this.h.view.mirror!;world.setProgress(this.state);this.h.motor.surfaces=world.surfaces;this.h.motor.obstacles=world.obstacles;this.h.motor.bounds={...MIRROR_BOUNDS};this.h.motor.setCheckpoint(mirrorCheckpoint(this.state));this.h.audio.recovered=this.state.phase==='complete';}
  private goal(){
    if(this.tracked){const id=this.tracked;return {pos:MIRROR_POS[id],title:names[id],detail:this.state.completed.includes(id)?'已修复，可重新查看执行记录。':'按 Q 扫描，再按 E 检查镜像。',code:id};}
    if(this.state.phase==='arrival')return {pos:MIRROR_GUIDE,title:'镜像比原件更会说谎',detail:'前方找到管理员 NYX，按 E。',code:'05 / ARRIVAL'};
    if(this.state.phase==='audit'||this.state.phase==='complete')return {pos:MIRROR_AUDIT,title:this.state.phase==='audit'?'三面镜子，一份真相':'镜库城已恢复',detail:this.state.phase==='audit'?'沿最后一道青色光桥到中央棱镜，按 E 运行综合回归。':'M 查看档案，或使用城际地图返回其他城市。',code:'CITY-05 / INTEGRATION'};
    const id=MIRROR_CASES[this.state.completed.length];return {pos:MIRROR_POS[id],title:names[id],detail:'沿青色光带前进。到终端按 Q 扫描，再按 E 修改方案。',code:id};
  }
  updateHud(){if(!this.active)return;const g=this.goal(),d=Math.hypot(this.h.motor.position.x-g.pos.x,this.h.motor.position.z-g.pos.z);
    text('quest-code',g.code);text('quest-title',g.title);text('quest-description',g.detail);
    text('quest-distance',`${d<8?'◇ 已抵达':'↗ '+Math.round(d)+' m'} / 镜库城`);
    text('world-state',`镜像 ${this.state.completed.length}/3`);text('identity-status','因果织针 / 镜库索引');text('mirror-progress',`${this.state.completed.length} / 3`);
    $('mini-player').setAttribute('transform',`translate(${this.h.motor.position.x} ${this.h.motor.position.z}) rotate(${-this.h.motor.facing*180/Math.PI})`);
    const item=this.nearby();show('interact-prompt',!this.blocked&&!!item);text('interact-label',item==='guide'?'与 NYX 对话':item==='audit'?'执行镜库综合回归':item==='result'?'查看第五城记录':item?this.state.evidence.includes(item)?`检查 ${names[item]}`:`按 Q 扫描 ${names[item]}`:'');
    const markers=$('world-markers');markers.replaceChildren();if(!this.blocked){const p=this.h.view.project({...g.pos,y:g.pos.y+4});if(p.visible){const marker=document.createElement('div');marker.className='world-marker';marker.style.left=`${p.x}px`;marker.style.top=`${p.y}px`;marker.innerHTML=`<span>${g.code} / ${g.title}</span><i></i>`;markers.append(marker);}}
  }
  private nearby():MirrorCase|'guide'|'audit'|'result'|null {const p=this.h.motor.position;
    if(this.state.phase==='arrival'&&near(p,MIRROR_GUIDE))return 'guide';
    if(this.state.phase==='audit'&&near(p,MIRROR_AUDIT))return 'audit';
    if(this.state.phase==='complete'&&near(p,MIRROR_AUDIT))return 'result';
    const current=MIRROR_CASES[this.state.completed.length];
    return MIRROR_CASES.find(id=>(id===current||this.state.completed.includes(id))&&near(p,MIRROR_POS[id]))??null;
  }
  scan(){if(this.blocked)return;const item=this.nearby();if(!item||!MIRROR_CASES.includes(item as MirrorCase)){this.h.toast('靠近有菱形标记的镜像终端，再按 Q。');return;}
    const id=item as MirrorCase;if(this.state.evidence.includes(id)){this.h.toast(`${id} 的证据已在档案中，按 E 可查看。`);return;}
    this.authority.observe(id);this.state.evidence.push(id);
    this.h.persist();this.h.audio.cue('scan');this.h.toast(`已取得 ${id} 的执行痕迹。按 E 打开工作台。`,5);this.updateHud();
  }
  interact(){if(this.dialogue){this.endDialogue();return;}if(this.blocked)return;const item=this.nearby();
    if(item==='guide'){this.dialogue=true;show('mirror-dialog',true);this.h.block(true);$('mirror-dialog-close').focus();return;}
    if(item==='audit'){const c=this.authority;if(c.finish()){this.state.phase=c.data.phase;this.state.audited=true;this.sync();this.h.persist();this.h.audio.cue('success');this.showResult();}else this.h.toast('综合回归失败：检查三处已提交的修复。');return;}
    if(item==='result'){this.showResult();return;}
    if(item){if(!this.state.evidence.includes(item)){this.scan();return;}this.openPanel(item);return;}
    this.h.toast('靠近镜像终端或跟随任务标记。');
  }
  private endDialogue(){this.dialogue=false;show('mirror-dialog',false);this.h.block(false);this.authority.meet();this.state.phase='cache';this.h.persist();this.updateHud();this.h.toast('第一面镜子在前方。扫描它保存的旧版本。',5);}
  private openPanel(id:MirrorCase){this.panel=id;this.draft=structuredClone(this.state.patches);this.run=null;this.cursor=0;this.traceIndex=0;
    text('mirror-title',`${id} · ${names[id]}`);text('mirror-description',descriptions[id]);this.renderControls();($('mirror-verify') as HTMLButtonElement).disabled=this.state.completed.includes(id);show('mirror-report',false);show('mirror-trace',false);show('mirror-editor',true);this.h.view.mirror!.focus={...MIRROR_POS[id]};this.h.view.mode='mirror-device';this.h.block(true);$('mirror-close').focus();
  }
  private renderControls(){const id=this.panel!;const wrap=$('mirror-controls');
    if(id==='MEM-01'){const p=this.draft[id];wrap.innerHTML=`<label>缓存更新策略<select data-field="mode"><option value="ttl">只等待 TTL 过期</option><option value="invalidate">原件更新时失效</option></select></label><label class="mirror-check"><input type="checkbox" data-field="version">拒绝迟到的旧版本消息</label>`;(wrap.querySelector('[data-field="mode"]') as HTMLSelectElement).value=p.mode;(wrap.querySelector('[data-field="version"]') as HTMLInputElement).checked=p.version;}
    if(id==='MEM-02'){const p=this.draft[id];wrap.innerHTML=`<label>并发隔离<select data-field="isolation"><option value="snapshot">快照隔离</option><option value="serializable">串行化执行</option></select></label><label class="mirror-check"><input type="checkbox" data-field="constraint">提交前检查至少一人值守</label>`;(wrap.querySelector('[data-field="isolation"]') as HTMLSelectElement).value=p.isolation;(wrap.querySelector('[data-field="constraint"]') as HTMLInputElement).checked=p.constraint;}
    if(id==='MEM-03'){const p=this.draft[id];wrap.innerHTML=`<label>新主选举票数<select data-field="quorum"><option value="1">1 票</option><option value="2">2 票 / 多数</option><option value="3">3 票 / 全部</option></select></label><label class="mirror-check"><input type="checkbox" data-field="epoch">用纪元栅栏拒绝旧主写入</label>`;(wrap.querySelector('[data-field="quorum"]') as HTMLSelectElement).value=String(p.quorum);(wrap.querySelector('[data-field="epoch"]') as HTMLInputElement).checked=p.epoch;}
    wrap.querySelectorAll<HTMLInputElement|HTMLSelectElement>('[data-field]').forEach(input=>input.onchange=()=>{const v=input.type==='checkbox'?(input as HTMLInputElement).checked:input.dataset.field==='quorum'?Number(input.value):input.value;(this.draft[id] as unknown as Record<string,unknown>)[input.dataset.field!]=v;});
  }
  private runCurrent(commit:boolean){if(!this.panel)return;const id=this.panel;
    if(commit){const c=this.authority,data=this.h.campaign().data;this.run=c.submit(id,this.draft[id],`${id}:${++data.attempts}`);if(this.run.passed){this.state.phase=c.data.phase;this.state.completed=[...c.data.completed];this.state.patches=structuredClone(c.data.patches);this.sync();this.h.audio.cue('success');}else data.counterexamples++;this.h.persist();}
    else this.run=runMirrorCase(id,this.draft[id]);
    this.traceIndex=0;this.cursor=0;this.renderReport();
    if(this.run.passed&&commit){this.h.toast(`${names[id]}已修复。沿新亮起的青色光桥前进。`,6);this.closePanel();}
    else if(commit){this.h.audio.cue('fail');this.h.toast(this.run.reason,6);}
  }
  preview(){this.runCurrent(false);}
  verify(){this.runCurrent(!!this.panel&&!this.state.completed.includes(this.panel));}
  private renderReport(){if(!this.run)return;show('mirror-report',true);$('mirror-report').innerHTML=`<strong>${this.run.passed?'回归通过':'发现反例'}</strong><p></p><ul></ul>`;
    $('mirror-report').querySelector('p')!.textContent=this.run.reason;
    const ul=$('mirror-report').querySelector('ul')!;for(const a of this.run.assertions){const li=document.createElement('li');li.textContent=`${a.passed?'✓':'×'} ${a.name} · ${a.detail}`;ul.append(li);}
    show('mirror-trace',true);const select=$('mirror-scenario') as HTMLSelectElement;select.replaceChildren();for(const [i,t] of this.run.traces.entries()){const option=document.createElement('option');option.value=String(i);option.textContent=t.name;select.append(option);}select.value='0';this.renderTrace();
  }
  private step(){if(!this.run)return;this.cursor=Math.min(this.run.traces[this.traceIndex].log.length,this.cursor+1);this.renderTrace();}
  private renderTrace(){const list=$('mirror-events');list.replaceChildren();if(!this.run)return;for(const e of this.run.traces[this.traceIndex].log.slice(0,this.cursor)){const li=document.createElement('li');li.textContent=`${e.tick.toString().padStart(2,'0')} · ${e.actor} / ${e.detail}`;list.append(li);}}
  closePanel(){if(!this.panel)return;this.panel=null;this.run=null;show('mirror-editor',false);this.h.view.mode='follow';this.h.block(false);this.updateHud();}
  openJournal(){if(!this.active)return;this.journal=true;show('mirror-journal',true);this.h.block(true);const list=$('mirror-journal-list');list.replaceChildren();
    for(const id of MIRROR_CASES){const button=document.createElement('button');button.textContent=`${this.state.completed.includes(id)?'✓ 已修复':this.state.evidence.includes(id)?'◇ 已扫描':'○ 未扫描'} · ${id} ${names[id]}`;button.onclick=()=>{this.tracked=id;this.closeJournal();this.updateHud();};list.append(button);}
    $('mirror-journal-close').focus();
  }
  closeJournal(){this.journal=false;show('mirror-journal',false);this.h.block(false);}
  private showResult(){this.result=true;show('mirror-result',true);this.h.view.mode='mirror-result';this.h.block(true);$('mirror-roam').focus();}
  private roam(){this.result=false;show('mirror-result',false);this.h.view.mode='follow';this.h.block(false);this.updateHud();}
  action(key:string,shift=false){if(!this.active)return false;
    if(key==='Tab'&&this.blocked){
      const container=$(this.panel?'mirror-editor':this.journal?'mirror-journal':this.result?'mirror-result':'mirror-dialog');
      const items=Array.from(container.querySelectorAll<HTMLElement>('button:not([disabled]),input,select'));
      const index=items.indexOf(document.activeElement as HTMLElement),delta=shift?-1:1;
      items[(index+delta+items.length)%items.length]?.focus({preventScroll:false});return true;
    }
    if(key==='Escape'){if(this.panel)this.closePanel();else if(this.journal)this.closeJournal();else if(this.result)this.roam();else if(this.dialogue)this.endDialogue();else return false;return true;}
    if(key==='KeyE'){this.interact();return true;}if(key==='KeyQ'){this.scan();return true;}
    if(key==='KeyR'&&this.panel){this.verify();return true;}
    if(key==='KeyM'&&this.journal){this.closeJournal();return true;}
    if((key==='KeyM'||key==='Tab')&&!this.blocked){this.openJournal();return true;}
    return false;
  }
}

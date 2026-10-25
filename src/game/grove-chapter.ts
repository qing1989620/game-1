import './grove.css';
import './grove-finale.css';
import {GROVE_BOUNDS,GROVE_START} from './grove-layout';
import type {Campaign} from './domain';
import type {CityView} from './view';
import type {Motor} from './physics';
import type {CityAudio} from './audio';

const $=(id:string)=>document.getElementById(id)!;
const show=(id:string,on:boolean)=>{$(id).hidden=!on;};
export const FINALE_SCENES=[
 {eyebrow:'06 / 终章 · 潮汐红树林',title:'信已经送达。',line:'第四城从雪里发出的求救信，穿过镜库城的 r43，终于抵达河口。',voice:'KITE：“这次，收件人就在前方。”',shot:0},
 {eyebrow:'原信 / 仍在',title:'她等的不是回执。',line:'阿澜站在高栈桥，手里还亮着当年约定的灯。汐认出了她，也认出了信上的笔迹。',voice:'汐：“别再让她等一个系统状态。我们把信送到她手里。”',shot:1},
 {eyebrow:'渡船 / 启航',title:'穿过两座 B-07。',line:'旧码头的灯还在，船却驶向有人等待的新高台。一路上，雪原和沙海的灯依次回应。',voice:'KITE：“路已经接通。现在该由我们走完最后一段。”',shot:2},
 {eyebrow:'交接 / 高栈桥',title:'原信，交给阿澜。',line:'你把信递过去。她看了很久，终于抬头：城里的人还记得她。',voice:'阿澜：“我以为等来的只会是另一张绿色回执。”',shot:3},
 {eyebrow:'尾声 / 终于抵达',title:'每一条路，最终通向人。',line:'指针港的站台重新停靠，脉冲炉恢复心跳，千线程让两条生命线继续。雪原发出了信，镜库守住了它。现在，信有人接住了。',voice:'汐：“回家吧。我们一起。”',shot:4},
 {eyebrow:'RE:FLOW 404 / END',title:'天亮以后。',line:'返航时，远岸又亮起一盏小小的灯。没有地址，也没有回执。阿澜把自己的灯举了起来。',voice:'这一次，先有人看见了光。',shot:5},
] as const;
interface Hooks{campaign:()=>Campaign;view:CityView;motor:Motor;audio:CityAudio;block:(on:boolean)=>void;clearInput:()=>void;persist:()=>void;toast:(text:string,seconds?:number)=>void;returnDune:()=>void;openMap:()=>void;preview:()=>boolean;network:()=>unknown}
export class GroveChapter{
 private playing=false;private scene=0;private elapsed=0;private paused=false;
 get active(){return this.h.view.city==='grove';}
 get blocked(){return this.active;}
 constructor(private h:Hooks){const layer=document.createElement('div');layer.id='grove-layer';layer.hidden=true;layer.innerHTML=`<div id="grove-finale" role="region" aria-label="第六城结局影片"><div class="grove-vignette"></div><div class="grove-film-top"><span>RE:FLOW 404 / FINALE</span><span id="grove-scene-number">01 / 06</span></div><div class="grove-film-caption"><span id="grove-scene-eyebrow"></span><h1 id="grove-scene-title"></h1><p id="grove-scene-line"></p><blockquote id="grove-scene-voice"></blockquote></div><div class="grove-film-bottom"><div class="grove-film-progress"><i id="grove-film-progress"></i></div><div class="grove-film-actions"><button id="grove-toggle" type="button">暂停播放</button><button id="grove-next" type="button">下一幕 →</button><button id="grove-replay" type="button" hidden>重看结局 ↶</button><button id="grove-return" type="button">← 返回镜库城</button></div></div></div>`;$('app').append(layer);$('grove-toggle').onclick=()=>{this.paused=!this.paused;this.render();};$('grove-next').onclick=()=>this.advance();$('grove-replay').onclick=()=>this.restart();$('grove-return').onclick=()=>this.h.returnDune();}
 enter(){this.playing=true;this.scene=0;this.elapsed=0;this.paused=false;this.h.view.switchCity('grove');this.h.campaign().data.city='grove';this.h.audio.city='grove';this.h.motor.bounds={...GROVE_BOUNDS};this.h.motor.warp(GROVE_START);this.h.view.grove!.hero.group.visible=false;this.h.view.grove!.setFinale(0);this.h.view.mode='grove-finale';this.h.view.groveShot=0;this.h.block(true);show('grove-layer',true);this.h.persist();this.render();$('grove-toggle').focus({preventScroll:true});}
 hide(){this.playing=false;show('grove-layer',false);if(this.h.view.grove)this.h.view.grove.hero.group.visible=true;}
 private render(){const s=FINALE_SCENES[this.scene];this.h.view.groveShotAge=this.elapsed;$('grove-scene-eyebrow').textContent=s.eyebrow;$('grove-scene-title').textContent=s.title;$('grove-scene-line').textContent=s.line;$('grove-scene-voice').textContent=s.voice;$('grove-scene-number').textContent=`${String(this.scene+1).padStart(2,'0')} / ${String(FINALE_SCENES.length).padStart(2,'0')}`;$('grove-toggle').textContent=this.paused?'继续播放':'暂停播放';show('grove-toggle',this.scene<FINALE_SCENES.length-1);show('grove-next',this.scene<FINALE_SCENES.length-1);show('grove-replay',true);$('grove-replay').textContent=this.scene===FINALE_SCENES.length-1?'重看结局 ↶':'从头播放 ↶';$('grove-film-progress').style.width=`${this.scene===FINALE_SCENES.length-1?100:(this.scene+this.elapsed/8)/FINALE_SCENES.length*100}%`;if(this.h.view.groveShot!==s.shot){this.h.view.groveShot=s.shot;this.h.view.grove?.setFinale(s.shot);}this.h.view.grove?.setFinaleAge(this.elapsed);if(this.scene===FINALE_SCENES.length-1&&(['grove-toggle','grove-next'].includes((document.activeElement as HTMLElement)?.id)))$('grove-replay').focus({preventScroll:true});}
 private advance(){if(this.scene>=FINALE_SCENES.length-1)return;this.scene++;this.elapsed=0;this.render();this.h.audio.cue('success');}
 private restart(){this.scene=0;this.elapsed=0;this.paused=false;this.render();}
 updateHud(){if(!this.active)return;show('interact-prompt',false);show('world-markers',false);show('btn-forge-travel',false);}
 interact(){this.advance();}
 scan(){}
 openJournal(){this.paused=!this.paused;this.render();}
 hint(){this.h.toast('结局正在播放；可以暂停、下一幕或重看。',5);}
 action(key:string,reverse=false){if(!this.active)return false;if(key==='Tab'){const buttons=[...$('grove-finale').querySelectorAll<HTMLButtonElement>('button:not([hidden])')],i=buttons.indexOf(document.activeElement as HTMLButtonElement);buttons[(i+(reverse?-1:1)+buttons.length)%buttons.length]?.focus({preventScroll:true});return true;}if(key==='Space'){const focused=document.activeElement;if(focused instanceof HTMLButtonElement&&$('grove-finale').contains(focused))focused.click();else{this.paused=!this.paused;this.render();}return true;}if(key==='Escape'){this.paused=!this.paused;this.render();return true;}if(key==='KeyE'||key==='ArrowRight'){this.advance();return true;}return key==='KeyQ'||key==='KeyT'||key==='KeyM';}
 tick(dt:number){if(!this.playing||this.paused||this.scene===FINALE_SCENES.length-1)return;this.elapsed+=dt;this.h.view.groveShotAge=this.elapsed;this.h.view.grove?.setFinaleAge(this.elapsed);if(this.elapsed>=8){this.advance();return;}$('grove-film-progress').style.width=`${(this.scene+this.elapsed/8)/FINALE_SCENES.length*100}%`;}
}

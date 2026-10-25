import type {Progress} from './domain';
import {DUNE_BURIED} from './dune-domain';
import {DUNE_LESSONS} from './dune-content';
import './guidance.css';

const $=(id:string)=>document.getElementById(id)!;
type GuideContext={city:Progress['city'];progress:Progress;playing:boolean;obscured:boolean};

/** Small UI cues reuse the current objective and interaction; they never advance progress. */
export class LightGuidance {
 private next=document.createElement('div');
 private signature='';
 private targets:HTMLElement[]=[];
 private workbenches:{panel:HTMLElement;note:HTMLElement;key:string}[]=[];
 constructor(onHint:()=>void){
  this.next.id='play-guide';this.next.className='play-guide';
  this.next.setAttribute('aria-label','下一步操作引导');
  this.next.innerHTML='<p id="guide-next" aria-live="polite"></p><ol id="guide-steps" aria-label="修复流程"><li>① 走近</li><li>② Q扫描</li><li>③ E工作台</li><li>④ R验证</li></ol>';
  $('quest-distance').before(this.next);
  $('btn-hint').innerHTML='卡住了？看逐步线索 <span>↗</span>';
  const panels=[
   ['patch-panel','.patch-body','重放并验证'],['forge-workbench','.forge-scroll','验证并接入'],
   ['thread-editor','.thread-scroll','重放并验证'],['snow-editor','.snow-scroll','运行完整验证'],
   ['dune-editor','.dune-scroll','执行完整回归'],
  ];
  for(const [id,selector,verify] of panels){
   const panel=$(id),host=panel.querySelector(selector)!;
   const help=document.createElement('aside');help.className='workbench-guide';help.setAttribute('aria-label','工作台操作指引');
   help.innerHTML=`<div><p>① 修改下方规则 → ② 可先预演看结果。<br><strong>③ 点「${verify}」才会提交修复。</strong></p><button type="button" aria-controls="${id}-guide-note">看本关提示 ↗</button></div><p id="${id}-guide-note" class="workbench-guide-note" hidden aria-live="polite"></p>`;
   host.prepend(help);
   const note=help.querySelector<HTMLElement>('.workbench-guide-note')!;
   const entry={panel,note,key:''};this.workbenches.push(entry);
   help.querySelector('button')!.onclick=()=>{entry.key=`${$('app').dataset.city}/${panel.querySelector('h2')?.textContent}`;onHint();note.textContent=$('toast').textContent;note.hidden=false;};
  }
 }
 update(c:GuideContext){
  for(const w of this.workbenches)if(!w.panel.hidden){
   const key=`${c.city}/${w.panel.querySelector('h2')?.textContent}`;
   if(w.key!==key){w.key=key;w.note.hidden=true;w.note.textContent='';}
  }
  this.next.hidden=!c.playing||c.obscured;
  if(this.next.hidden){this.highlight([]);this.signature='';return;}
  const code=($('quest-code').textContent??'').split(' / ')[0];
  const label=$('interact-label').textContent??'';
  const task=/^(?:Q|DS|WF|CO|OS|NET|DB)-S?\d+$/.test(code);
  let relevant=true;
  if(task&&c.city==='dock')relevant=code==='Q-01'?/异常站台|事件顺序/.test(label):/列车线路|列车指针/.test(label);
  else if(task&&c.city!=='forge')relevant=label.includes($('quest-title').textContent??'');
  else if(code.startsWith('CITY-'))relevant=label.includes('综合回归');
  else if(code==='CANARY')relevant=label.includes('灰度回滚');
  else if(c.city==='dune'&&c.progress.dune.phase==='descent')relevant=/切换.*r43/.test(label);
  else if(c.city==='snow'&&c.progress.snow.phase==='expedition')relevant=label.includes('交接求救信');
  else if(c.city==='thread'&&c.progress.thread.phase==='evacuate')relevant=label.includes('双线疏散列车');
  else if(c.city==='dock'&&c.progress.chapter==='board')relevant=label.includes('返航列车');
  const near=!$('interact-prompt').hidden&&relevant;
  const evidence:readonly string[]=c.city==='dock'?c.progress.evidence:c.progress[c.city].evidence;
  const seen=evidence.includes(code);
  const touch=window.innerWidth<=700;
  let step=seen?3:near?2:1;
  let text=touch?'推左下摇杆，跟随菱形标记；距离变小就是走对了。':'WASD跟随菱形标记；距离越小越近。右键拖动可找回视角。';
  let targets:string[]=touch?['touch-stick']:[];
  const buriedId=c.city==='dune'?DUNE_BURIED.find(id=>code===id||near&&label.includes(DUNE_LESSONS[id].name)):undefined;
  const buried=buriedId!==undefined&&!c.progress.dune.evidence.includes(buriedId);
  if(buried&&c.progress.dune.weather!=='storm'){
   text='地下档案：先点右上角「沙尘暴」，再开启偏振镜取证。';targets=['dune-weather'];step=2;
  }else if(buried&&$('dune-lens').getAttribute('aria-pressed')!=='true'){
   text=touch?'点右侧「偏振镜」，靠近档案后点「溯源」取证。':'按G开启偏振镜，靠近档案后按Q取证。';targets=['dune-lens'];step=2;
  }else if(near&&/按\s*Q\s*扫描/.test(label)){
   text=touch?'已经走到设备旁：先点右下「溯源」扫描，再点中间交互提示。':'已经走到设备旁：先按Q扫描，再按E打开工作台。';targets=['tool-trace','touch-scan'];step=2;
  }else if(near){
   text=`${touch?'点画面中间的交互提示':'现在按E'}：${label}。`;targets=['btn-interact'];step=3;
  }else if(task&&seen){
   text=touch?'证据已取得。走回标记旁，点中间交互提示打开工作台。':'证据已取得。走回标记旁，看到E提示时打开工作台。';
  }else if((c.city==='snow'&&c.progress.snow.phase==='expedition')||(c.city==='dune'&&c.progress.dune.phase==='descent')){
   text=touch?'先点「稳身」，沿任务路线走；抵达后还要点中间交互提示。':'先开启F稳身，沿任务路线走；抵达后还要按E交接。';
  }else if(c.city==='dune'&&c.progress.dune.phase==='complete'){
   text=touch?'点「故障簿」可补支线；册底城际地图可回访前四城。':'按M打开故障簿补支线；册底城际地图可回访前四城。';
  }
  const signature=JSON.stringify([text,task,step,targets,touch]);if(signature===this.signature)return;this.signature=signature;
  $('guide-next').textContent=`下一步 · ${text}`;
  const steps=$('guide-steps');steps.hidden=!task;
  const labels=touch?['① 走近','② 溯源','③ 交互','④ 验证']:['① 走近','② Q扫描','③ E工作台','④ R验证'];
  [...steps.children].forEach((e,i)=>{e.textContent=labels[i];e.classList.toggle('guide-current',i+1===step);e.classList.toggle('guide-done',i+1<step);});
  this.highlight(targets);
 }
 private highlight(ids:string[]){
  this.targets.forEach(e=>e.classList.remove('guide-target'));
  this.targets=ids.map(id=>$(id));this.targets.forEach(e=>e.classList.add('guide-target'));
 }
}

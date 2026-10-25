import fs from 'node:fs';
import { chromium } from 'playwright';

const browser=await chromium.launch({headless:true,executablePath:process.env.REFLOW_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const checks=[];const errors=[];
const record=(check,evidence)=>checks.push({check,passed:true,evidence});
let page;
try{
  const dev=await browser.newPage();
  await dev.goto('http://127.0.0.1:5386/');
  const save=await dev.evaluate(async()=>{
    const {Campaign,parseProgress,relink}=await import('/src/game/domain.ts');
    const {ThreadCampaign,freshThread}=await import('/src/game/thread-domain.ts');
    const {SnowCampaign,freshSnow,SNOW_MAIN}=await import('/src/game/snow-domain.ts');
    const c=new Campaign();c.meet();c.observe('Q-01');c.submitOrder(['EXIT','DELETE','ARCHIVE']);c.observe('DS-01');c.submitRail(relink(c.data.rail,'A','B'));c.finish();
    c.data.forge={phase:'complete',power:{charge:84,temperature:30,isolated:true,energized:true},flag:'CARRY',evidence:['WF-01','CO-01']};
    const t=new ThreadCampaign(freshThread()),tp={'OS-01':{p:'A',q:'A',restart:true},'OS-02':{aging:8,oldestFirst:true},'OS-03':'atomic','OS-04':{touchOnHit:true,evict:'oldest'}};
    t.meet();for(const id of ['OS-01','OS-02','OS-03','OS-04']){t.observe(id);t.submit(id,tp[id]);}t.audit();t.finish();c.data.thread=t.data;
    const s=new SnowCampaign(freshSnow()),sp={
      'WF-02':{alignment:'vane',shutter:'gust',cutoff:9,heater:'thermostat'},'NET-01':{A:'B',B:'D',C:'E',E:'D',ttl:4,fallback:true},
      'NET-02':{retry:true,key:'session',ackDuplicates:true},'NET-03':{window:12,adaptive:true,backoff:true},'NET-04':{clock:'lamport',tie:'node',barrier:true},
    };
    s.meet();for(const id of SNOW_MAIN){s.observe(id);s.submit(id,sp[id]);}s.audit();for(const i of [1,2,3])s.deliver(i);s.finish();
    c.data.snow=s.data;c.data.snowClearance=structuredClone(s.data);c.data.city='snow';
    const valid=parseProgress(c.data);if(!valid)throw Error('prior-city fixture failed validation');
    return JSON.stringify(valid);
  });
  await dev.close();record('V6.3 四城通关存档通过当前解析器',`存档 ${save.length} 字节，经 parseProgress 复核`);
  page=await browser.newPage({viewport:{width:1280,height:720}});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
  await page.goto('http://127.0.0.1:5387/');
  await page.evaluate(data=>localStorage.setItem('reflow-404:v6:campaign',data),save);
  await page.reload();
  if(!await page.locator('#btn-continue').isVisible())throw Error('Continue unavailable');
  record('生产构建识别旧存档并显示继续旅程','首页继续旅程按钮可见');
  await page.locator('#btn-continue').click();
  await page.locator('#btn-map').click();await page.locator('#snow-city-map').click();
  if(!await page.locator('#map-mirror').isEnabled())throw Error('Mirror city locked');
  record('完成雪原后第五城线路解锁','城际地图镜库城按钮可点击');
  await page.locator('#map-mirror').click();
  if((await page.evaluate(()=>window.__REFLOW__.snapshot().city))!=='mirror')throw Error('Mirror entry failed');
  record('生产构建进入独立镜库场景','只读诊断 city=mirror');
  await page.setViewportSize({width:390,height:844});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('mobile horizontal overflow');
  record('390×844 入口无页面横向溢出','实际浏览器 viewport=390×844');
  await page.setViewportSize({width:1280,height:720});
  const walk=async z=>{await page.keyboard.down('w');try{await page.waitForFunction(target=>window.__REFLOW__.snapshot().position.z<=target,z,{timeout:30000});}finally{await page.keyboard.up('w');}};
  await walk(47);
  await page.keyboard.down('a');try{await page.waitForFunction(()=>window.__REFLOW__.snapshot().position.x<-3,{timeout:5000});}finally{await page.keyboard.up('a');}
  await page.keyboard.press('e');
  if(!await page.locator('#mirror-dialog').isVisible())throw Error('NYX dialogue missing');
  record('实走入口并与 NYX 对话','W/A 移动抵达管理员，E 打开对话');
  await page.locator('#mirror-dialog-close').click();
  await page.keyboard.down('d');try{await page.waitForFunction(()=>window.__REFLOW__.snapshot().position.x>-.5,{timeout:5000});}finally{await page.keyboard.up('d');}
  const cases=[
    {id:'MEM-01',z:28,solve:async()=>{await page.locator('[data-field="mode"]').selectOption('invalidate');await page.locator('[data-field="version"]').check();}},
    {id:'MEM-02',z:-33,solve:async()=>{await page.locator('[data-field="isolation"]').selectOption('serializable');await page.locator('[data-field="constraint"]').check();}},
    {id:'MEM-03',z:-94,solve:async()=>{await page.locator('[data-field="quorum"]').selectOption('2');await page.locator('[data-field="epoch"]').check();}},
  ];
  for(const [index,item] of cases.entries()){
    await walk(item.z);
    if(index>0&&await page.evaluate(()=>window.__REFLOW__.snapshot().falls)!==0)throw Error(`Fall before ${item.id}`);
    if(index>0)record(`实走第 ${index} 道光桥无跌落`,`W 移动至 z≤${item.z}；falls=0`);
    await page.keyboard.press('q');await page.keyboard.press('e');
    if(!await page.locator('#mirror-editor').isVisible())throw Error(`${item.id} editor missing`);
    record(`${item.id} 扫描取证后可打开工作台`,'Q 取证，E 打开，生产界面可见');
    if(index===0){await page.keyboard.press('Tab');if(!await page.evaluate(()=>!!document.activeElement?.closest('#mirror-editor')))throw Error('Tab escaped editor');record('工作台 Tab 焦点停留在当前对话框','键盘 Tab 后焦点仍在 #mirror-editor');}
    await page.locator('#mirror-verify').click();
    if(!await page.locator('#mirror-report').getByText('发现反例').isVisible())throw Error(`${item.id} original patch not rejected`);
    if(await page.evaluate(()=>window.__REFLOW__.snapshot().mirror.completed.length)!==index)throw Error(`${item.id} failed patch committed`);
    record(`${item.id} 原始方案产生反例且不提交`,`已完成主线数仍为 ${index}`);
    if(index===0){await page.setViewportSize({width:390,height:844});if(!await page.locator('#mirror-verify').isVisible()||await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('mobile editor layout failed');record('390×844 工作台验证按钮可见且无横向溢出','原生窄视口中的固定验证按钮');await page.setViewportSize({width:1280,height:720});}
    await item.solve();
    await page.locator('#mirror-verify').click();
    if(await page.evaluate(()=>window.__REFLOW__.snapshot().mirror.completed.length)!==index+1)throw Error(`${item.id} repair not committed`);
    record(`${item.id} 正确修复提交并开放下一段`, `已完成主线数 ${index+1}`);
  }
  await walk(-146);
  if(await page.evaluate(()=>window.__REFLOW__.snapshot().falls)!==0)throw Error('Fall before audit');
  record('实走第三道光桥抵达中央棱镜','W 移动至 z≤-146；falls=0');
  await page.keyboard.press('e');
  if(!await page.locator('#mirror-result').isVisible())throw Error('Mirror result missing');
  record('中央棱镜综合回归进入第五城结算','200 OK 结算界面可见');
  await page.keyboard.press('Tab');
  if(!await page.evaluate(()=>!!document.activeElement?.closest('#mirror-result'))||await page.locator('#mirror-journal').isVisible())throw Error('Result Tab focus escaped');
  record('结算页 Tab 在结果按钮间移动','焦点留在 #mirror-result，档案未打开');
  await page.reload();await page.locator('#btn-continue').click();
  const restored=await page.evaluate(()=>window.__REFLOW__.snapshot());
  if(restored.city!=='mirror'||restored.mirror.phase!=='complete')throw Error('Mirror save not restored');
  record('刷新后第五城通关状态恢复','city=mirror, phase=complete');
  await page.locator('#btn-map').click();await page.locator('#mirror-map').click();await page.locator('#map-snow').click();
  if(await page.evaluate(()=>window.__REFLOW__.snapshot().city)!=='snow')throw Error('Return to snow failed');
  record('城际地图可返回白噪雪原','city=snow');
  if(errors.length)throw Error(`Browser errors: ${errors.join(' | ')}`);
  record('最终浏览器脚本与控制台错误为空','pageerror=0，console error=0');
  const receipt={version:'6.4.0',date:'2026-10-25',method:'Edge headless production UI; validated V6.3 save fixture; native keyboard walking without runtime mutation or teleport',checks,finalConsoleErrors:errors};
  fs.writeFileSync('artifacts/v6.4-ui-checks.json',JSON.stringify(receipt,null,2)+'\n');
  console.log(`V6.4 production UI: ${checks.length}/${checks.length} checks passed; no browser errors`);
}finally{await page?.close();await browser.close();}

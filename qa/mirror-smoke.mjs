import { chromium } from 'playwright';

const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const page=await browser.newPage({viewport:{width:1280,height:720}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
  await page.goto('http://127.0.0.1:5386/');
  await page.locator('#btn-start').click();
  await page.evaluate(()=>{window.__city.campaign().data.snow.phase='complete';});
  await page.locator('#btn-map').click();
  await page.locator('#map-mirror').click();
  await page.screenshot({path:'artifacts/mirror-arrival.png'});
  await page.evaluate(()=>window.__city.warp({x:-9,y:4,z:44}));
  await page.keyboard.press('e');
  await page.locator('#mirror-dialog-close').click();
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'artifacts/mirror-mobile.png'});
  await page.setViewportSize({width:1280,height:720});
  for(const [id,position] of Object.entries({'MEM-01':{x:0,y:4,z:23},'MEM-02':{x:0,y:4,z:-38},'MEM-03':{x:0,y:4,z:-99}})){
    await page.evaluate(p=>window.__city.warp(p),position);
    await page.keyboard.press('q');await page.keyboard.press('e');
    if(id==='MEM-01'){
      await page.setViewportSize({width:390,height:844});
      if(!await page.locator('#mirror-verify').isVisible())throw Error('mobile verify button hidden');
      if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('mobile horizontal overflow');
      await page.screenshot({path:'artifacts/mirror-mobile-editor.png'});
      await page.setViewportSize({width:1280,height:720});
    }
    if(id==='MEM-01'){await page.locator('[data-field="mode"]').selectOption('invalidate');await page.locator('[data-field="version"]').check();}
    if(id==='MEM-02'){await page.locator('[data-field="isolation"]').selectOption('serializable');await page.locator('[data-field="constraint"]').check();}
    if(id==='MEM-03'){await page.locator('[data-field="quorum"]').selectOption('2');await page.locator('[data-field="epoch"]').check();}
    await page.locator('#mirror-verify').click();
    const completed=await page.evaluate(()=>window.__city.campaign().data.mirror.completed.length);
    if(completed!==['MEM-01','MEM-02','MEM-03'].indexOf(id)+1)throw Error(`${id} not complete`);
  }
  await page.evaluate(()=>window.__city.warp({x:0,y:4,z:-151}));
  await page.keyboard.press('e');
  if(!await page.locator('#mirror-result').isVisible())throw Error('result not visible');
  if(errors.length)throw Error(errors.join('\n'));
  console.log('镜库城开发烟测：诊断传送入城、三关、综合回归、结算、手机视口与浏览器错误检查通过');
  await page.screenshot({path:'artifacts/mirror-smoke.png'});
}finally{await browser.close();}

// Browser evidence for the same immutable bytes which will be promoted.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const os=require('node:os');
const {baseURL,launchBrowser}=require('./marble-browser.cjs');
const policy=JSON.parse(fs.readFileSync(process.env.RELEASE_POLICY));
const work=process.env.RELEASE_WORK,out=process.env.RELEASE_OUTPUT;
const report={errors:[],profiles:[],checks:[],environment:{startedAt:new Date().toISOString(),platform:os.platform(),arch:os.arch(),cpu:os.cpus()[0]?.model,logicalCores:os.cpus().length,node:process.version}};
const roomSelector=`iframe[data-screening-room="${work}"]`;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const snap=(page,name)=>page.screenshot({path:path.join(out,name+'.png'),animations:'disabled'});
async function documentFor(page){return (await page.locator(roomSelector).elementHandle()).contentFrame();}
async function open(page){
  await page.locator(`[data-work="${work}"]`).click();
  await page.locator(roomSelector).waitFor();
  return documentFor(page);
}
async function back(page,doc){await doc.locator('[data-album-back]').click();await page.locator('#album:visible').waitFor();}
async function controls(page,doc){
  assert(await doc.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Player overflows horizontally');
  const frame=await page.locator(roomSelector).boundingBox();
  for(const element of await doc.locator('[data-album-back],.transport button,.film-guide button').all()){
    if(!await element.isVisible()||!await element.isEnabled())continue;
    const box=await element.boundingBox();
    assert(box&&box.width>=43&&box.height>=43,'Control smaller than a touch target: '+await element.innerText());
    assert(box.x>=0&&box.y>=0&&box.x+box.width<=page.viewportSize().width+1&&box.y+box.height<=page.viewportSize().height+1,'Control outside viewport: '+await element.innerText());
    assert(await element.evaluate(el=>{const b=el.getBoundingClientRect();return el.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2));}),'Player control is covered');
    assert(await page.evaluate(({x,y,selector})=>document.elementFromPoint(x,y)?.matches(selector),{x:box.x+box.width/2,y:box.y+box.height/2,selector:roomSelector}),'Album overlay covers player control');
  }
  assert(frame.width>0);
}
async function addBadge(page,doc){
  const insert=({width,height})=>{
    const badge=document.createElement('div');badge.id='nl-badge-frame';badge.textContent='Hosting badge';
    Object.assign(badge.style,{position:'fixed',right:'0',bottom:'0',width:width+'px',height:height+'px',zIndex:'2147483647',background:'#17282e',color:'#fff'});
    document.body.append(badge);
  };
  await page.evaluate(insert,policy.badge);await doc.evaluate(insert,policy.badge);
}
async function profile(browser,settings){
  const context=await browser.newContext({viewport:{width:settings.width,height:settings.height},hasTouch:settings.touch,isMobile:settings.touch});
  const page=await context.newPage(),errors=[],requests=[];let bytes=0,loaded=false;
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
  page.on('request',r=>requests.push(r.url()));
  const cdp=await context.newCDPSession(page);
  await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
  cdp.on('Network.loadingFinished',event=>{if(!loaded)bytes+=event.encodedDataLength;});
  await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:settings.latencyMs,downloadThroughput:settings.mbps*1e6/8,uploadThroughput:settings.mbps*1e6/8});
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:settings.cpu});
  try{
    await page.goto(baseURL+'/?lang=zh');await page.locator(`[data-work="${work}"]`).waitFor();
    assert(!requests.some(u=>/\.(glb|ply|spz|wasm)(\?|$)/.test(u)),'Album fetched models before a work was opened');
    const start=Date.now();const doc=await open(page);
    await doc.locator('#photo').waitFor();await doc.waitForFunction(()=>{const p=document.querySelector('#photo');return p.complete&&p.naturalWidth>0;});
    const photoMs=Date.now()-start;assert(photoMs<=policy.photoMs,`First photo ${photoMs} ms exceeds ${policy.photoMs}`);
    await doc.locator('[data-film-loading]:visible [role=progressbar]').waitFor();
    await doc.locator('#stage[data-ready=true]').waitFor({timeout:settings.readyMs});
    loaded=true;const readyMs=Date.now()-start;
    assert(readyMs<=settings.readyMs,`Ready in ${readyMs} ms exceeds ${settings.readyMs}`);
    assert(bytes<=policy.startupMiB*1048576,`Cold start ${(bytes/1048576).toFixed(1)} MiB exceeds ${policy.startupMiB}`);
    assert(await doc.locator('[data-film-loading]').isHidden());
    assert.equal(await doc.locator('[data-film-start]').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(242, 206, 148)','Primary control departed from shared palette');
    assert.equal(await doc.locator('body').getAttribute('data-player-ui'),policy.ui);
    await addBadge(page,doc);await controls(page,doc);
    await snap(page,settings.id+'-ready');
    await doc.locator('[data-film-start]').click();
    await doc.waitForFunction(()=>Number(document.querySelector('input[type=range]').value)>1);
    await doc.locator('[data-film-start]').click();
    const progress=await doc.locator('input[type=range]').inputValue();
    await wait(200);
    assert.equal(await doc.locator('input[type=range]').inputValue(),progress,'Pause did not stop playback');
    await doc.locator('[data-film-start]').click();
    await back(page,doc);
    const hiddenProgress=await doc.locator('input[type=range]').inputValue();await wait(300);
    assert.equal(await doc.locator('input[type=range]').inputValue(),hiddenProgress,'Hidden film advanced');
    const revisit=Date.now(),count=requests.length;await open(page);
    await doc.locator('#stage[data-ready=true]').waitFor();
    const revisitMs=Date.now()-revisit;
    assert(revisitMs<=policy.revisitMs,'Warm revisit rebuilt the scene');
    assert.equal(requests.length,count,'Revisit fetched new resources');
    assert.equal(await doc.locator('input[type=range]').inputValue(),hiddenProgress,'Revisit lost the paused position');
    await doc.locator('[data-film-home]').click();
    assert.equal(await doc.locator('input[type=range]').inputValue(),'0');
    await doc.locator('[data-language=en]').click();await doc.waitForFunction(()=>document.documentElement.lang==='en');
    assert(!/[\u3400-\u9fff]/.test(await doc.locator('.transport').innerText()),'English controls contain untranslated Chinese');
    await controls(page,doc);
    await doc.locator('[data-film-explore]').click();await doc.locator('#stage[data-walk]').waitFor();
    await controls(page,doc);
    if(!settings.touch)await snap(page,'desktop-explore');
    else {
      await page.setViewportSize({width:844,height:390});await doc.waitForFunction(()=>innerWidth===844);
      await controls(page,doc);await snap(page,'touch-landscape');
    }
    await doc.locator('[data-film-explore]').click();await doc.locator('[data-film-home]').click();
    await back(page,doc);
    assert.deepEqual(errors,[]);
    report.profiles.push({...settings,readyBudgetMs:settings.readyMs,photoMs,readyMs,revisitMs,startupMiB:+(bytes/1048576).toFixed(2)});
  }finally{await context.close();}
}
async function resilience(browser){
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
  const page=await context.newPage();let mode='slow';
  // Block the first scene-owned configuration, before WebGL resources. No simulated percentage.
  await page.route(process.env.RELEASE_PROBE,async route=>{
    if(mode==='slow'){await wait(policy.slowProbeMs+1500);return route.continue().catch(()=>{});}
    if(mode==='error')return route.fulfill({status:503,body:'Temporarily unavailable'});
    return route.continue();
  });
  try{
    await page.goto(baseURL+'/?lang=en');const doc=await open(page);
    await doc.locator('[data-film-loading]:visible').waitFor();
    await wait(policy.slowProbeMs);
    const meter=doc.locator('[role=progressbar]');
    assert.equal(await meter.getAttribute('aria-valuenow'),null,'Unknown progress must not invent a percentage');
    assert.equal(await meter.locator('span').evaluate(el=>getComputedStyle(el).animationName),'none','Reduced-motion loading still animates');
    assert(await doc.locator('#photo').evaluate(p=>p.complete&&p.naturalWidth>0));
    assert(await doc.locator('.projection-title').isHidden(),'Loading feedback competes with the film title');
    assert.equal(await doc.locator('#photo').evaluate(p=>getComputedStyle(p).opacity),'1','Loading must preserve the original photo');
    await snap(page,'slow-loading');
    await back(page,doc);assert(await page.locator('#album').isVisible(),'Cannot leave while loading');
    mode='error';await page.reload();const failed=await open(page);
    await failed.locator('[data-load-retry]:visible').waitFor({timeout:policy.failureMs});
    assert(await failed.locator('[data-film-start]').isDisabled());
    assert(await failed.locator('#photo').isVisible());await snap(page,'load-error');
    mode='ready';await failed.locator('[data-load-retry]').click();
    await failed.locator('#stage[data-ready=true]').waitFor({timeout:60000});
    await failed.locator('[data-film-start]').click();
    await failed.waitForFunction(()=>Number(document.querySelector('input[type=range]').value)>1);
    await back(page,failed);
    report.checks.push('slow feedback, original photo, indeterminate progress, reduced motion, leave while loading, failed resource, retry to playable');
  }finally{await context.close();}
}
(async()=>{
  let browser;
  try{
    assert(/^http:\/\/(127\.0\.0\.1|localhost):/.test(baseURL),'Candidate checks require a local server');
    browser=await launchBrowser();
    report.environment.browser=browser.version();
    for(const settings of policy.profiles)await profile(browser,settings);
    await resilience(browser);
  }catch(error){report.errors.push(error.stack||String(error));console.error(error);process.exitCode=1;}
  finally{if(browser)await browser.close();fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify(report,null,2)+'\n');}
})();

// Browser evidence for the same immutable bytes which will be promoted.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const os=require('node:os');
const {baseURL,launchBrowser}=require('./marble-browser.cjs');
const policy=JSON.parse(fs.readFileSync(process.env.RELEASE_POLICY));
const work=process.env.RELEASE_WORK,out=process.env.RELEASE_OUTPUT;
const perfOnly=process.env.RELEASE_PERF_ONLY==='1';
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
    assert(!requests.some(u=>/\.(glb|ply|spz|wasm)(?:\.gz)?(\?|$)/.test(u)),'Album fetched models before a work was opened');
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
// Opt-in measurement keeps counting after ready so deferring downloads cannot
// masquerade as reducing them. It does not replace the normal release checks.
async function performanceProfile(browser,settings){
  const context=await browser.newContext({viewport:{width:settings.width,height:settings.height},hasTouch:settings.touch,isMobile:settings.touch});
  const page=await context.newPage(),cdp=await context.newCDPSession(page);
  const resources=[],active=new Map(),errors=[],contextResources=[],contextRequests=new WeakMap(),resourceKeys=new WeakMap(),sizeReads=new Set();
  const result={...settings,readyBudgetMs:settings.readyMs,readyMs:null,mode:'performance',milestones:{},resources,contextResources,errors};
  report.profiles.push(result);
  let phase='album',firstTimestamp,navigationStart,openedAt;
  const round=value=>Math.round(value*10)/10;
  const safePath=url=>{try{const parsed=new URL(url);return /^https?:$/.test(parsed.protocol)?parsed.pathname:parsed.protocol;}catch{return '(invalid URL)';}};
  const contextRow=request=>{
    let row=contextRequests.get(request);if(row)return row;
    // Dedicated-worker requests can be attributed to their parent frame. Do not
    // claim that a frame owner proves the request was made on the main thread.
    let owner='unattributed';
    if(request.serviceWorker())owner='service-worker';
    else {try{request.frame();owner='frame-or-dedicated-worker';}catch{}}
    row={path:safePath(request.url()),method:request.method(),resourceType:request.resourceType(),owner,
      startMs:Date.now()-navigationStart,endMs:null,encodedBytes:null,startedDuring:phase};
    contextRequests.set(request,row);contextResources.push(row);
    resourceKeys.set(row,request.method()+'\0'+request.url());return row;
  };
  const onContextRequest=request=>{contextRow(request);};
  const onContextFinished=request=>{
    const row=contextRow(request);row.endMs=Date.now()-navigationStart;row.finishedDuring=phase;
    row.durationMs=round(row.endMs-row.startMs);
    const reading=request.sizes().then(sizes=>{
      row.responseBodyBytes=sizes.responseBodySize;row.responseHeaderBytes=sizes.responseHeadersSize;
      row.encodedBytes=Math.max(0,sizes.responseBodySize+sizes.responseHeadersSize);
    }).catch(()=>{row.sizeError='request.sizes unavailable';errors.push(row.sizeError+' '+row.path);});
    sizeReads.add(reading);reading.finally(()=>sizeReads.delete(reading));
  };
  const onContextFailed=request=>{
    const row=contextRow(request);row.endMs=Date.now()-navigationStart;row.finishedDuring=phase;
    row.failure=request.failure()?.errorText||'request failed';
    if(/^https?:\/\//.test(request.url()))errors.push(row.failure+' '+row.path);
  };
  context.on('request',onContextRequest);context.on('requestfinished',onContextFinished);context.on('requestfailed',onContextFailed);
  const time=timestamp=>round((timestamp-firstTimestamp)*1000);
  const finish=(row,event)=>{
    row.endMs=time(event.timestamp);row.durationMs=round(row.endMs-row.startMs);row.finishedDuring=phase;
  };
  cdp.on('Network.requestWillBeSent',event=>{
    if(firstTimestamp===undefined)firstTimestamp=event.timestamp;
    const previous=active.get(event.requestId);
    if(previous&&event.redirectResponse){
      previous.status=event.redirectResponse.status;
      previous.encodedBytes=event.redirectResponse.encodedDataLength||0;
      previous.redirect=true;finish(previous,event);
    }
    const row={path:safePath(event.request.url),method:event.request.method,startMs:time(event.timestamp),endMs:null,encodedBytes:0,startedDuring:phase};
    resourceKeys.set(row,event.request.method+'\0'+event.request.url);
    resources.push(row);active.set(event.requestId,row);
  });
  cdp.on('Network.responseReceived',event=>{
    const row=active.get(event.requestId);if(!row)return;
    row.status=event.response.status;row.mimeType=event.response.mimeType;
    row.encodedBytes=event.response.encodedDataLength||0;
    row.fromDiskCache=Boolean(event.response.fromDiskCache);
    if(row.status>=400)errors.push(row.status+' '+row.path);
  });
  cdp.on('Network.dataReceived',event=>{
    const row=active.get(event.requestId);if(row)row.encodedBytes+=event.encodedDataLength||0;
  });
  cdp.on('Network.loadingFinished',event=>{
    const row=active.get(event.requestId);if(!row)return;
    // The final transfer count is authoritative; in-flight milestones use the
    // encoded header/body byte counts observed so far instead of Content-Length.
    row.encodedBytes=event.encodedDataLength;finish(row,event);active.delete(event.requestId);
  });
  cdp.on('Network.loadingFailed',event=>{
    const row=active.get(event.requestId);if(!row)return;
    row.failure=event.errorText;finish(row,event);active.delete(event.requestId);
    if(!event.canceled)errors.push(event.errorText+' '+row.path);
  });
  page.on('pageerror',error=>errors.push(error.message));
  const snapshot=async name=>{
    const capturedAt=Date.now(),pageRows=resources.slice(),contextRows=contextResources.slice();
    const pageCDPEncodedBytes=pageRows.reduce((sum,row)=>sum+row.encodedBytes,0);
    const completed=contextRows.filter(row=>row.endMs!==null&&!row.failure);
    const pending=pageRows.filter(row=>row.endMs===null).map(row=>row.path);
    const contextPending=contextRows.filter(row=>row.endMs===null).map(row=>row.path);
    // Flush only size reads already issued at this milestone. Requests finishing
    // while they resolve must not be counted as having finished before the mark.
    await Promise.allSettled([...sizeReads]);
    const contextEncodedBytes=completed.reduce((sum,row)=>sum+(row.encodedBytes||0),0);
    const pageCounts=new Map();
    for(const row of pageRows){const key=resourceKeys.get(row);pageCounts.set(key,(pageCounts.get(key)||0)+1);}
    const missingFromPageCDP=[];
    for(const row of completed){
      const key=resourceKeys.get(row),count=pageCounts.get(key)||0;
      if(count)pageCounts.set(key,count-1);
      else missingFromPageCDP.push({path:row.path,method:row.method,encodedBytes:row.encodedBytes,owner:row.owner});
    }
    // Use the larger observed total as a lower bound, never add overlapping
    // context and page totals. Neither observer is a server-side wire meter.
    const encodedBytes=Math.max(pageCDPEncodedBytes,contextEncodedBytes);
    return result.milestones[name]={sinceNavigationMs:capturedAt-navigationStart,
      ...(openedAt===undefined?{}:{sinceOpenMs:capturedAt-openedAt}),encodedBytes,
      MiB:+(encodedBytes/1048576).toFixed(2),requests:pageRows.length,
      pageCDPEncodedBytes,pageCDPMiB:+(pageCDPEncodedBytes/1048576).toFixed(2),
      contextEncodedBytes,contextMiB:+(contextEncodedBytes/1048576).toFixed(2),
      contextRequests:contextRows.length,contextCompletedRequests:completed.length,
      pending,contextPending,missingFromPageCDP};
  };
  try{
    await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
    await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:settings.latencyMs,downloadThroughput:settings.mbps*1e6/8,uploadThroughput:settings.mbps*1e6/8});
    await cdp.send('Emulation.setCPUThrottlingRate',{rate:settings.cpu});
    navigationStart=Date.now();
    await page.goto(baseURL+'/?lang=zh');await page.locator(`[data-work="${work}"]`).waitFor();
    await snapshot('album');phase='startup';openedAt=Date.now();
    const doc=await open(page);
    await doc.locator('#photo').waitFor();
    await doc.waitForFunction(()=>{const photo=document.querySelector('#photo');return photo.complete&&photo.naturalWidth>0;});
    result.photoMs=Date.now()-openedAt;await snapshot('photo');
    // A stricter target must not abort the observation before metrics exist.
    const observationTimeout=policy.perfTimeoutMs||120000;
    await doc.locator('#stage[data-ready=true]').waitFor({timeout:observationTimeout});
    const readyAt=Date.now();result.readyMs=readyAt-openedAt;
    result.startupMiB=(await snapshot('ready')).MiB;
    result.playerReadyMs=Number(await doc.locator('#stage').getAttribute('data-ready-ms'));
    phase='idle';await snap(page,settings.id+'-perf-ready');
    await wait(Math.max(0,readyAt+10000-Date.now()));await snapshot('idle10s');
    await doc.locator('[data-film-home]').click();
    phase='first-playback';const playbackStart=Date.now();
    await doc.locator('[data-film-start]').click();
    await doc.waitForFunction(()=>{const slider=document.querySelector('input[type=range]');return Number(slider.value)>=Number(slider.max);},null,{timeout:observationTimeout});
    result.firstPlaybackMs=Date.now()-playbackStart;await snapshot('firstPlaybackEnd');
    phase='explore';const exploreStart=Date.now();
    await doc.locator('[data-film-explore]').click();await doc.locator('#stage[data-walk]').waitFor();
    result.exploreEntryMs=Date.now()-exploreStart;await snapshot('exploreImmediate');
    await snap(page,settings.id+'-perf-explore-immediate');
    const detailStart=Date.now();
    result.detailWaitHook=await doc.evaluate(async()=>{
      if(typeof window.soleCityWaitForDetail!=='function')return false;
      await window.soleCityWaitForDetail();return true;
    });
    result.detailWaitMs=Date.now()-detailStart;
    result.exploreDetailReadyMs=Date.now()-exploreStart;await snapshot('exploreDetailReady');
    await snap(page,settings.id+'-perf-explore-detail');
    await doc.locator('[data-film-home]').click();await back(page,doc);
    phase='revisit';const revisitStart=Date.now(),requestCount=contextResources.length;
    await open(page);await doc.locator('#stage[data-ready=true]').waitFor();
    result.revisitMs=Date.now()-revisitStart;result.revisitNewRequests=contextResources.length-requestCount;
    result.revisitRequestCountSource='BrowserContext request events';
    await snapshot('revisit');result.completed=true;
  }catch(error){result.failure=error.message;throw error;}
  finally{
    if(navigationStart!==undefined){
      const end=await snapshot('end');result.missingFromPageCDP=end.missingFromPageCDP;
    }
    result.resourceTimeOrigin='milliseconds after first Network.requestWillBeSent';
    result.contextResourceTimeOrigin='milliseconds after navigation started';
    result.byteScope='observed lower bound: max(page CDP including observed in-flight bytes, BrowserContext completed request.sizes response bytes); no query strings or header values retained';
    result.coverageNote='BrowserContext observes frame and supported worker requests; dedicated-worker coverage is not verified by this script. Cross-check missingFromPageCDP and verify bytes at the server before claiming complete transfer totals. Matching uses full URL, method and occurrence count internally; query strings are not retained.';
    context.off('request',onContextRequest);context.off('requestfinished',onContextFinished);context.off('requestfailed',onContextFailed);
    await cdp.detach().catch(()=>{});await context.close();
  }
  // Retain all observations and screenshots even if an optimization target fails.
  const failures=[];
  if(result.photoMs>policy.photoMs)failures.push(`First photo ${result.photoMs} ms exceeds ${policy.photoMs}`);
  if(result.readyMs>settings.readyMs)failures.push(`Ready in ${result.readyMs} ms exceeds ${settings.readyMs}`);
  if(result.milestones.ready.encodedBytes>policy.startupMiB*1048576)failures.push(`Cold start ${result.startupMiB} MiB exceeds ${policy.startupMiB}`);
  if(result.revisitMs>policy.revisitMs)failures.push(`Revisit ${result.revisitMs} ms exceeds ${policy.revisitMs}`);
  if(result.revisitNewRequests)failures.push(`Revisit made ${result.revisitNewRequests} new requests`);
  failures.push(...errors);result.thresholdFailures=failures;
  assert.deepEqual(failures,[],settings.id+' performance targets failed');
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
    if(perfOnly){
      report.mode='performance-only';
      for(const settings of policy.profiles){
        try{await performanceProfile(browser,settings);}
        catch(error){report.errors.push(error.stack||String(error));console.error(error);process.exitCode=1;}
      }
      report.checks.push('Measured original photo, ready, idle 10 seconds, first full playback, exploration before/after detail, and revisit; release resilience checks were not run');
    }else{
      for(const settings of policy.profiles)await profile(browser,settings);
      await resilience(browser);
    }
  }catch(error){report.errors.push(error.stack||String(error));console.error(error);process.exitCode=1;}
  finally{if(browser)await browser.close();fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify(report,null,2)+'\n');}
})();

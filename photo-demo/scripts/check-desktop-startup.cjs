const assert = require('node:assert/strict');
const {baseURL,launchBrowser} = require('./marble-browser.cjs');

async function sample(browser) {
  const context=await browser.newContext({viewport:{width:1280,height:800}});
  try {
    const page=await context.newPage();
    await page.addInitScript(()=>{
      window.startupStages=[];
      const observer=new MutationObserver(()=>{
        const status=document.querySelector('#status')?.textContent;
        if(status && window.startupStages.at(-1)?.status!==status)window.startupStages.push({status,ms:Math.round(performance.now())});
        if(document.querySelector('#world')?.dataset.ready==='true' && !document.querySelector('#play').disabled){
          window.startupReady=performance.now();
          observer.disconnect();
        }
      });
      observer.observe(document,{subtree:true,childList:true,attributes:true});
    });
    await page.goto(baseURL+'/marble-transition-lab/index.html',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.startupReady,null,{timeout:90000});
    return await page.evaluate(()=>{
      const requests=performance.getEntriesByType('resource').filter(r=>r.startTime<window.startupReady);
      const assets=requests.filter(r=>r.name.includes('/bookroom/')&&r.name.endsWith('.glb'));
      return {readyMs:Math.round(window.startupReady),encodedMB:+(requests.reduce((sum,r)=>sum+r.encodedBodySize,0)/1e6).toFixed(2),
        bookroomMB:+(assets.reduce((sum,r)=>sum+r.encodedBodySize,0)/1e6).toFixed(2),bookroomRequests:assets.length,stages:window.startupStages,
        largest:requests.sort((a,b)=>b.encodedBodySize-a.encodedBodySize).slice(0,10).map(r=>[new URL(r.name).pathname,+(r.encodedBodySize/1e6).toFixed(2),Math.round(r.responseEnd)])};
    });
  } finally {await context.close();}
}
async function checkEntry(browser){
  const page=await browser.newPage({reducedMotion:'reduce'});
  try{
    const shell='**/bookroom/shell-grotto-v6.glb',desk='**/bookroom/desk.glb';
    let release,signal;
    const gate=new Promise(resolve=>{release=resolve;});
    const requested=new Promise(resolve=>{signal=resolve;});
    let requests=0;
    await page.route(shell,async route=>{requests++;signal();await gate;await route.continue();});
    await page.goto(baseURL+'/marble-transition-lab/index.html?progress=1');
    await page.click('#enter-bookroom');await requested;
    await page.click('#home');release();
    await page.waitForFunction(()=>window.__marbleTransition.grotto.interior.book);
    assert.equal(await page.evaluate(()=>window.__marbleTransition.visit.state.stage),'desk');
    await page.click('[data-progress="1"]');await page.click('#enter-bookroom');
    await page.waitForSelector('#world[data-visit=terrace][data-visit-busy=false]');
    assert.equal(requests,1);
    // A missing desk must leave the overview usable and recover on retry.
    await page.route(desk,r=>r.fulfill({status:503,body:''}));
    await page.reload();await page.click('#enter-bookroom');
    await page.waitForFunction(()=>document.querySelector('#visit-feedback').textContent.includes('重试'));
    assert.equal(await page.evaluate(()=>window.__marbleTransition.visit.state.stage),'desk');
    await page.unroute(desk);await page.click('#enter-bookroom');
    await page.waitForSelector('#world[data-visit=terrace][data-visit-busy=false]');
  }finally{await page.close();}
}
(async()=>{const browser=await launchBrowser();try{
  const results=[];for(let i=0;i<2;i++)results.push(await sample(browser));
  console.log(JSON.stringify(results,null,2));
  for(const result of results)assert.equal(result.bookroomRequests,0,'opening the desk must not wait for the unseen bookroom');
  await checkEntry(browser);
}finally{await browser.close();}})().catch(e=>{console.error(e.message);process.exitCode=1;});

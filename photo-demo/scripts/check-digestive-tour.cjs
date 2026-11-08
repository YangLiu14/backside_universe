const {launchBrowser,baseURL}=require('./marble-browser.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{const browser=await launchBrowser();try{
const mobile=process.env.SMALL==='1',dir=path.resolve(__dirname,'../evidence/canine-production/digestion');
await fs.mkdir(dir,{recursive:true});const p=await browser.newPage({viewport:mobile?{width:390,height:830}:{width:1120,height:845},hasTouch:mobile,isMobile:mobile});
const errors=[],responses=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
p.on('response',r=>{if(r.url().includes('/digestion/')&&r.url().includes('.m4a'))responses.push([r.status(),r.url().split('/').at(-1)])});
const state=()=>p.evaluate(()=>window.__photoOrbit.state);
await p.goto(baseURL+'/canine-museum/index.html?angle=90');await p.waitForFunction(()=>window.__photoOrbit?.state.installed.length===6);
const stage=p.locator('#stage'),snap=async name=>stage.screenshot({path:path.join(dir,(mobile?'mobile-':'')+name+'.jpg'),quality:87});
await snap('overview');const base=(await state()).camera;
await p.locator('#tour-map-toggle').click();await p.waitForSelector('.tract-stop:visible');
assert.equal(await p.locator('.tract-stop:visible').count(),6);await snap('atlas');
await p.getByRole('button',{name:'从小肠进入第一视角'}).click();
await p.waitForFunction(()=>window.__photoOrbit.state.tour.index===3&&window.__photoOrbit.state.tour.elapsed>.2);
assert((await p.locator('#tour-map').boundingBox()).height>45);
await p.locator('#tour-exit').click();await p.locator('#tour-map-toggle').click();
await p.locator('#food-start').click();await p.waitForFunction(()=>window.__photoOrbit.state.tour.elapsed>1.8);await p.locator('#tour-play').click();
const paused=(await state()).tour.elapsed;await p.waitForTimeout(250);assert.equal((await state()).tour.elapsed,paused);
await snap('0-mouth');
for(let i=1;i<6;i++){
 await p.locator('#tour-next').click();assert.equal((await state()).tour.index,i);await p.locator('#tour-play').click();await p.waitForTimeout(1450);await p.locator('#tour-play').click();await snap(i+'-inside');
}
await p.locator('#tour-time').fill('36');await p.waitForFunction(()=>window.__photoOrbit.state.tour.index===3);
await p.locator('#tour-stops button').last().click();
await p.locator('#tour-prev').click();assert.equal((await state()).tour.index,4);
await p.locator('#tour-stops button').nth(2).click();assert.equal((await state()).tour.index,2);
await p.locator('#tour-sound').click();assert.equal((await state()).tour.muted,true);
await p.locator('#tour-exit').click();await p.waitForFunction(()=>!window.__photoOrbit.state.tour.active);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));assert.deepEqual((await state()).camera,base);
const channelIds=['mouth','esophagus','stomach','small-intestine','colon','rectum'];
await p.waitForFunction(ids=>ids.every(id=>window.__photoOrbit.state.tour.channels.includes(id)),channelIds);
assert.deepEqual((await state()).tour.failedChannels,[]);
assert.deepEqual(errors,[]);console.log({mobile,responses,errors});
if(!mobile&&process.env.ALL==='1'){
await p.locator('#food-start').click();await p.locator('#tour-autostop').uncheck();await p.locator('#tour-sound').click();await p.waitForFunction(()=>window.__photoOrbit.state.tour.finished,null,{timeout:120000});
assert.equal((await state()).tour.index,5);await snap('exit');
await p.locator('#tour-play').click();assert.equal((await state()).tour.index,0);await p.keyboard.press('Escape');assert.equal((await state()).tour.active,false);console.log('automatic six-stop route and replay passed');
}
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});

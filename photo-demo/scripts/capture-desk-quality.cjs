// Capture the real album card with the tour's settled cameras and no timeline overrides.
// Usage: node scripts/capture-desk-quality.cjs <output-directory> desktop|mobile <album-url>
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const {playwright, installedBrowser} = require('../pipeline/verify.cjs');

const [output, device, albumURL] = process.argv.slice(2);
if (!output || !['desktop', 'mobile'].includes(device) || !albumURL) throw Error('Expected output, device and album URL');
const mobile = device === 'mobile';
const stops = [
  ['跟随故事','source'], ['折成纸船','harbor'], ['推船出海'],
  ['下一站 · 蓝书白崖'], ['望向纸船','arch'], ['下一站 · 橙书峡谷'], ['压低书签','canyon'],
  ['下一站 · 手机潮港'], ['拨到静音','tidal'], ['下一站 · 洞窟书屋'], ['开门进书屋','threshold'],
  ['走近桌上的书','library'], ['从书页回到工位','book'], ['再游览一次','return']
];

async function run() {
  await fs.mkdir(output, {recursive:true});
  const browser = await playwright().chromium.launch({executablePath:await installedBrowser(),
    args:process.platform === 'darwin' ? ['--use-angle=metal'] : []});
  try {
    const page = await browser.newPage({viewport: mobile ? {width:390,height:844} : {width:1160,height:800},
      isMobile:mobile,hasTouch:mobile,reducedMotion:'reduce'});
    page.setDefaultTimeout(65000);
    const errors=[], states={}, mobileModels=new Set();
    page.on('pageerror', e=>errors.push(e.message));
    page.on('console', m=>{if(/Shader Error|VALIDATE_STATUS|WebGL: INVALID/.test(m.text()))errors.push(m.text());});
    page.on('response', r=>{
      if(r.status()>=400)errors.push(r.status()+' '+r.url());
      if(r.url().includes('/desk-mobile/')&&r.url().endsWith('.glb'))mobileModels.add(r.url().split('/desk-mobile/')[1]);
    });
    const enter=control=>mobile?control.tap():control.click();
    await page.goto(new URL('/?lang=zh',albumURL).href);
    await enter(page.locator('[data-work="desk"]'));
    const frameHandle=await page.locator('iframe[data-screening-room="desk"]').elementHandle();
    const scene=await frameHandle.contentFrame();
    await scene.waitForSelector('#world[data-ready=true]',{timeout:210000});
    const scenePath=new URL(scene.url()).pathname;
    async function capture(name){
      await scene.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      states[name]=await scene.evaluate(()=>{
        const a=window.__marbleTransition;
        return {eye:a.camera.position.toArray(),quat:a.camera.quaternion.toArray(),fov:a.camera.fov,
          room:a.state.walk?.room};
      });
      await scene.locator('#world').screenshot({path:path.join(output,device+'-'+name+'.jpg'),type:'jpeg',quality:93});
    }
    for(const [index,[label,name]] of stops.entries()){
      await scene.waitForFunction(label=>document.querySelector('#tour-label').textContent===label
        &&document.querySelector('#tour-next').getAttribute('aria-disabled')==='false',label,{timeout:120000});
      if(name)await capture(name);
      if(index<stops.length-1)await enter(scene.locator('#tour-next'));
    }
    assert.deepEqual(states.source.eye,states.return.eye);
    assert.deepEqual(states.source.quat,states.return.quat);
    for(const selector of ['[data-progress="1"]','#destination-toggle','[data-destination="cup"]','#walk-start']){
      await enter(scene.locator(selector));
    }
    const sight=scene.locator('[data-sight="post"]');
    await sight.waitFor();
    if(await sight.getAttribute('aria-current')!=='location')await enter(sight);
    await enter(scene.locator('[data-sight="post"][aria-current=location][aria-disabled=false]'));
    await scene.waitForFunction(()=>window.__marbleTransition.state.walk?.room==='post',null,{timeout:70000});
    await capture('post');
    await enter(scene.locator('[data-album-back]'));
    await page.locator('#album:visible').waitFor();
    assert.deepEqual(errors,[]);
    if(mobile)assert(mobileModels.size>0,'The touch viewport must load compact assets');
    await fs.writeFile(path.join(output,device+'-route.json'),JSON.stringify({scenePath,device,
      errors,states,mobileModels:[...mobileModels].sort()},null,2)+'\n');
    console.log(device,scenePath,Object.keys(states).join(', '));
  } finally {
    await browser.close();
  }
}
run().catch(e=>{console.error(e);process.exitCode=1;});

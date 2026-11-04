const {chromium}=require('/Users/kloping/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const out=path.resolve(__dirname,'../evidence/solid-object-lab/comparison');await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:'/Users/kloping/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell',args:['--use-angle=metal','--enable-webgl','--ignore-gpu-blocklist']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:9988/solid-object-lab/index.html');await page.waitForFunction(()=>window.__gsLab?.state.ready,null,{timeout:90000});
  await page.evaluate(()=>{window.__gsLab.setCrop('desk');window.__gsLab.setAngle(-12);});await page.waitForTimeout(400);
  const before=await page.evaluate(()=>window.__gsLab.state);await page.screenshot({path:path.join(out,'solid-minus12.png'),fullPage:true});
  await page.getByRole('button',{name:'上一版补全',exact:true}).click();await page.waitForFunction(()=>window.__gsLab.state.variant==='original');await page.waitForTimeout(400);
  const original=await page.evaluate(()=>window.__gsLab.state);assert.deepEqual(original.camera,before.camera);assert.deepEqual(original.projection,before.projection);assert.equal(original.angle,-12);
  assert.equal(await page.evaluate(()=>window.__gsLab.solids.group.visible),false);
  await page.screenshot({path:path.join(out,'previous-minus12.png'),fullPage:true});
  await page.getByRole('button',{name:'实体表面版',exact:true}).click();await page.waitForTimeout(400);const after=await page.evaluate(()=>window.__gsLab.state);assert.deepEqual(after.camera,before.camera);assert.equal(after.angle,-12);assert.equal(await page.evaluate(()=>window.__gsLab.solids.group.visible),true);
  await page.getByRole('button',{name:'播放往返',exact:true}).click();await page.waitForTimeout(100);await page.getByRole('button',{name:'上一版补全',exact:true}).click();assert.equal(await page.evaluate(()=>window.__gsLab.state.playing),false);
  await page.getByRole('button',{name:'实体表面版',exact:true}).click();await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false);await page.screenshot({path:path.join(out,'mobile.png'),fullPage:true});
  const result={cameraPreserved:true,projectionPreserved:true,anglePreserved:true,oldModeHidesMeshes:true,switchPausesPlayback:true,overflow,errors};await fs.writeFile(path.join(out,'qa.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));assert.equal(errors.length,0);
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exit(1)});

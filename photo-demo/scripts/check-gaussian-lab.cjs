const {chromium}=require('/Users/kloping/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const out=path.resolve(root,process.env.GS_LAB_EVIDENCE||'evidence/gs-lab');
const labUrl=process.env.GS_LAB_URL||'http://127.0.0.1:9988/gs-lab/index.html';
(async()=>{
 await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:'/Users/kloping/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell',args:['--use-angle=metal','--enable-webgl','--ignore-gpu-blocklist']});
 const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(labUrl);
 await page.waitForFunction(()=>window.__gsLab?.state.ready,{},{timeout:90000});
 await page.waitForTimeout(1500);
 const results={errors,states:[],renderer:await page.evaluate(()=>{const g=window.__gsLab.renderer.getContext();const e=g.getExtension('WEBGL_debug_renderer_info');return e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER);})};
 assert.ok((await page.evaluate(()=>window.__gsLab.state.splats))>10000);
 for(const crop of ['full','desk','laptop','cup']){
  await page.getByRole('button',{name:({full:'完整照片',desk:'桌面重点',laptop:'电脑边缘',cup:'杯子与书'})[crop],exact:true}).click();
  for(const angle of [0,-3,3,-6,6,-12,12]){
   await page.locator('#angle').evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));},angle);
   await page.waitForTimeout(350);
   const state=await page.evaluate(()=>window.__gsLab.state);assert.equal(state.angle,angle);results.states.push(state);
   await page.locator('#world').screenshot({path:path.join(out,`${crop}-${angle}.png`)});
  }
 }
 await page.evaluate(()=>{window.__gsLab.setCrop('full');window.__gsLab.setAngle(0);});await page.waitForTimeout(350);
 await page.screenshot({path:path.join(out,'desktop.png'),fullPage:true});
 results.sourceView=await page.evaluate(()=>{
  const original=document.querySelector('#reference'),cv=document.querySelector('#world'),c=document.createElement('canvas');c.width=cv.width;c.height=cv.height;const ctx=c.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(original,0,0,c.width,c.height);const reference=ctx.getImageData(0,0,c.width,c.height).data;ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(cv,0,0);const actual=ctx.getImageData(0,0,c.width,c.height).data;
  let absolute=0,covered=0,missing=0;for(let i=0;i<actual.length;i+=4){if(actual[i+3]<128){missing++;continue;}covered++;for(let j=0;j<3;j++)absolute+=Math.abs(actual[i+j]-reference[i+j]);}
  return{meanAbsoluteRGBDifference: absolute/(covered*3),alphaUnderHalfRatio:missing/(actual.length/4),width:c.width,height:c.height,note:'Single source-view diagnostic, not unseen-view accuracy. No mask excludes uncertain edges.'};
 });
 await page.evaluate(()=>window.__gsLab.setAngle(6));await page.waitForTimeout(400);
 const forward=await page.evaluate(()=>({camera:window.__gsLab.state.camera,pixels:document.querySelector('#world').toDataURL()}));
 await page.evaluate(()=>window.__gsLab.setAngle(-6));await page.waitForTimeout(250);
 await page.evaluate(()=>window.__gsLab.setAngle(6));await page.waitForTimeout(400);
 const backward=await page.evaluate(()=>({camera:window.__gsLab.state.camera,pixels:document.querySelector('#world').toDataURL()}));
 assert.deepEqual(forward.camera,backward.camera);results.reverse={cameraIdentical:true,imageIdentical:forward.pixels===backward.pixels};
 await page.getByRole('button',{name:'播放往返',exact:true}).click();await page.waitForTimeout(200);await page.getByRole('button',{name:'暂停',exact:true}).click();const paused=await page.evaluate(()=>window.__gsLab.state.angle);await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>window.__gsLab.state.angle),paused);
 await page.getByRole('button',{name:'回到 0°',exact:true}).click();assert.equal(await page.evaluate(()=>window.__gsLab.state.angle),0);
 const box=await page.locator('#world').boundingBox();await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.3,box.y+box.height*.5,{steps:12});await page.mouse.up();assert.ok((await page.evaluate(()=>window.__gsLab.state.angle))>3);results.drag=true;
 await page.locator('#world').focus();await page.keyboard.press('Home');assert.equal(await page.evaluate(()=>window.__gsLab.state.angle),0);
 await page.getByLabel('标出未覆盖区域').check();await page.evaluate(()=>{window.__gsLab.setCrop('desk');window.__gsLab.setAngle(12);});await page.waitForTimeout(400);await page.screenshot({path:path.join(out,'coverage-12.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{window.__gsLab.setCrop('full');window.__gsLab.setAngle(0);});await page.getByLabel('标出未覆盖区域').uncheck();await page.waitForTimeout(400);await page.screenshot({path:path.join(out,'mobile.png'),fullPage:true});
 results.mobileOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(results.mobileOverflow,false);
 await fs.writeFile(path.join(out,'qa.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({renderer:results.renderer,states:results.states.length,sourceView:results.sourceView,reverse:results.reverse,errors,mobileOverflow:results.mobileOverflow}));
 await browser.close();assert.deepEqual(errors,[]);
})().catch(e=>{console.error(e);process.exit(1);});

const {chromium}=require('/Users/kloping/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'evidence/solid-object-lab',process.env.SOLID_RUN||'current');
const url=process.env.SOLID_URL||'http://127.0.0.1:9988/solid-object-lab/index.html';
(async()=>{
 await fs.mkdir(out,{recursive:true});const browser=await chromium.launch({headless:true,executablePath:'/Users/kloping/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell',args:['--use-angle=metal','--enable-webgl','--ignore-gpu-blocklist']});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(url);await page.waitForFunction(()=>window.__gsLab?.state.ready,null,{timeout:90000});await page.waitForTimeout(500);
 const result={url,errors,views:[],sourceView:{}};
 for(const crop of ['laptop','cup'])for(const angle of [0,-6,6,-12,12]){
  await page.evaluate(({crop,angle})=>{window.__gsLab.setCrop(crop);window.__gsLab.setAngle(angle);},{crop,angle});await page.waitForTimeout(350);
  await page.locator('#world').screenshot({path:path.join(out,`${crop}-${angle}.png`)});result.views.push(await page.evaluate(()=>window.__gsLab.state));
  if(angle===0)result.sourceView[crop]=await page.evaluate(crop=>{
    const rect=({laptop:[.34,.35,.25,.15],cup:[.52,.35,.18,.13]})[crop],src=document.querySelector('#world'),im=document.querySelector('#reference'),c=document.createElement('canvas');c.width=src.width;c.height=src.height;const ctx=c.getContext('2d');ctx.drawImage(im,rect[0]*im.naturalWidth,rect[1]*im.naturalHeight,rect[2]*im.naturalWidth,rect[3]*im.naturalHeight,0,0,c.width,c.height);const a=ctx.getImageData(0,0,c.width,c.height).data;ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(src,0,0);const b=ctx.getImageData(0,0,c.width,c.height).data;let e=0;for(let i=0;i<a.length;i+=4)for(let j=0;j<3;j++)e+=Math.abs(a[i+j]-b[i+j]);return{mae:e/(a.length/4*3),width:c.width,height:c.height};
  },crop);
 }
 await page.evaluate(()=>{const l=window.__gsLab;l.setCrop('cup');l.setAngle(0);l.setObjectsVisible?.(false);});await page.waitForTimeout(300);
 await page.locator('#world').screenshot({path:path.join(out,'cup-background.png')});
 result.residualCup=await page.evaluate(()=>{
  const source=document.querySelector('#world'),c=document.createElement('canvas');c.width=source.width;c.height=source.height;const ctx=c.getContext('2d');ctx.drawImage(source,0,0);const d=ctx.getImageData(0,0,c.width,c.height).data;
  // Source cup bbox, excluding the legitimately blue book above it.
  const crop=[.52,.35,.18,.13],box=[750,721,845,777],size=[1320,1739];let blue=0,n=0,missing=0;
  const x0=Math.ceil((box[0]/size[0]-crop[0])/crop[2]*c.width),x1=Math.floor((box[2]/size[0]-crop[0])/crop[2]*c.width),y0=Math.ceil((box[1]/size[1]-crop[1])/crop[3]*c.height),y1=Math.floor((box[3]/size[1]-crop[1])/crop[3]*c.height);
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){let i=(y*c.width+x)*4;n++;if(d[i+2]>d[i]*1.3&&d[i+2]>d[i+1]*1.25&&d[i+2]>40)blue++;if(d[i+3]<230)missing++;}
  return{blueFraction:blue/n,missingFraction:missing/n,pixels:n};
 });
 if(await page.evaluate(()=>!!window.__gsLab.solids)){
  await page.evaluate(()=>{const l=window.__gsLab;l.setObjectsVisible(true);l.setBackgroundVisible(false);l.solids.setInspection(true);});await page.waitForTimeout(200);
  for(const angle of [0,-12,12]){await page.evaluate(a=>window.__gsLab.setAngle(a),angle);await page.locator('#world').screenshot({path:path.join(out,`cup-silhouette-${angle}.png`)});}
  result.hingeGap=await page.evaluate(()=>window.__gsLab.solids.data.laptopFit.hingeGap);
 }
 await fs.writeFile(path.join(out,'qa.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({...result,views:result.views.length}));
 assert.equal(errors.length,0,'Browser errors');assert.ok(result.residualCup.blueFraction<.01,'Old cup color remains behind replacement geometry');assert.ok(result.residualCup.missingFraction<.01,'Removal left background holes');
 if(result.hingeGap!==undefined)assert.ok(result.hingeGap<1e-7,'Laptop hinge is disconnected');
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exit(1)});

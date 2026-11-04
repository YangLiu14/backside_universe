// Fixture-specific visual regression: pale floating bands behind the laptop at -12°.
// Checks a known disoccluded wedge, plus a source-view coverage guard. It does
// not certify hidden-surface accuracy or all possible scene artifacts.
const {chromium}=require('/Users/kloping/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const out=path.resolve(__dirname,'../evidence/gs-edge-fix');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Users/kloping/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell',args:['--use-angle=metal','--enable-webgl','--ignore-gpu-blocklist']});
 try {
 const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
 if(process.argv.includes('--baseline')){
   await page.route('**/assets/desk-gaussian.ply',route=>route.fulfill({path:path.join(out,'desk-gaussian.ply')}));
   await page.route('**/assets/scene.json',route=>route.fulfill({path:path.join(out,'scene.json'),contentType:'application/json'}));
 }
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:9988/gs-lab/index.html');
 await page.waitForFunction(()=>window.__gsLab?.state.ready,null,{timeout:30000});
 if(process.argv.includes('--radial'))await page.evaluate(()=>{window.__gsLab.scene.children.find(c=>'sortRadial' in c).sortRadial=true;});
 await page.evaluate(()=>{window.__gsLab.setCrop('laptop');window.__gsLab.setAngle(-12);});
 await page.waitForTimeout(500);
 const probe=async()=>page.evaluate(()=>{
  const canvas=document.querySelector('#world'),copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;
  const ctx=copy.getContext('2d',{willReadFrequently:true});ctx.drawImage(canvas,0,0);const data=ctx.getImageData(0,0,copy.width,copy.height).data;
  // Common interior of the disoccluded wedge; excludes the newly exposed table
  // at its lower corner, which legitimately shifts when edge depth is corrected.
  let pale=0,total=0;const bounds=[.06,.23,.13,.34];
  for(let y=Math.ceil(bounds[1]*copy.height);y<Math.floor(bounds[3]*copy.height);y++)for(let x=Math.ceil(bounds[0]*copy.width);x<Math.floor(bounds[2]*copy.width);x++){
   const i=4*(y*copy.width+x);total++;if(data[i+3]>100&&(data[i]+data[i+1]+data[i+2])/3>100)pale++;
  }
  return{palePixels:pale,pixels:total,ratio:pale/total,width:copy.width,height:copy.height};
 });
 const immediate=await probe();await page.waitForTimeout(700);const settled=await probe();
 await fs.mkdir(out,{recursive:true});await page.locator('#world').screenshot({path:path.join(out,'ghosting-current.png')});
 await page.evaluate(()=>{window.__gsLab.setCrop('full');window.__gsLab.setAngle(0);});await page.waitForTimeout(400);
 const source=await page.evaluate(()=>{
  const c=document.querySelector('#world'),copy=document.createElement('canvas');copy.width=c.width;copy.height=c.height;const ctx=copy.getContext('2d',{willReadFrequently:true});ctx.drawImage(c,0,0);const data=ctx.getImageData(0,0,copy.width,copy.height).data;let missing=0;for(let i=3;i<data.length;i+=4)if(data[i]<128)missing++;return{missing:missing/(data.length/4),splats:window.__gsLab.state.splats};
 });
 const result={immediate,settled,source,errors};await fs.writeFile(path.join(out,'ghosting-current.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 assert.deepEqual(errors,[]);assert.ok(source.splats>600000,'Scene must remain present');assert.ok(source.missing<.012,'Do not fix ghosting by deleting the source image');
 assert.ok(settled.ratio<.03,`Floating background strips remain in the laptop disocclusion wedge: ${(settled.ratio*100).toFixed(2)}% (limit 3%)`);
 } finally {await browser.close();}
})().catch(e=>{console.error(e.message);process.exit(1);});

// Fixed desk-photo fixture: dark floating screen copies in disoccluded blinds.
// Also protects the source laptop and checks opacity in the tabletop crop.
const {chromium}=require('/Users/kloping/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const http=require('node:http'),{createReadStream}=require('node:fs');
const url=process.env.OCCLUSION_URL||'http://127.0.0.1:9988/infinisplat-lab/index.html';
const out=path.resolve(__dirname,'../evidence/occlusion',process.env.OCCLUSION_RUN||'baseline');
(async()=>{
 await fs.mkdir(out,{recursive:true});
 let assetServer;
 if(process.env.OCCLUSION_ASSETS){
  // Stream large PLY fixtures over HTTP. route.fulfill({path}) copies the entire
  // asset through the browser automation transport and can terminate Chromium.
  assetServer=http.createServer(async(req,res)=>{
   const name=new URL(req.url,'http://localhost').pathname.slice(1);
   if(!['desk-gaussian.ply','scene.json'].includes(name)){res.writeHead(404);res.end();return;}
   const file=path.join(process.env.OCCLUSION_ASSETS,name),stat=await fs.stat(file);
   res.writeHead(200,{'Content-Length':stat.size,'Access-Control-Allow-Origin':'*','Content-Type':name.endsWith('.json')?'application/json':'application/octet-stream'});
   createReadStream(file).pipe(res);
  });
  await new Promise(resolve=>assetServer.listen(0,'127.0.0.1',resolve));
 }
 const browser=await chromium.launch({headless:true,executablePath:'/Users/kloping/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell',args:['--use-angle=metal','--enable-webgl','--ignore-gpu-blocklist']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
  if(process.env.OCCLUSION_ASSETS){
   for(const name of ['desk-gaussian.ply','scene.json'])await page.route('**/assets/'+name,route=>route.fulfill({status:302,headers:{location:`http://127.0.0.1:${assetServer.address().port}/${name}`}}));
  }
  await page.goto(url);await page.waitForFunction(()=>window.__gsLab?.state.ready,null,{timeout:90000});
  const results={url,angles:[]};
  for(const angle of [-12,12]){
   await page.evaluate(a=>{window.__gsLab.setCrop('laptop');window.__gsLab.setAngle(a);},angle);await page.waitForTimeout(400);
   const bounds=angle<0?[.03,.20,.10,.42]:[.74,.14,.80,.28];
   const sample=await page.evaluate(b=>{
    const src=document.querySelector('#world'),c=document.createElement('canvas');c.width=src.width;c.height=src.height;const ctx=c.getContext('2d');ctx.drawImage(src,0,0);const d=ctx.getImageData(0,0,c.width,c.height).data;
    let dark=0,missing=0,n=0;for(let y=Math.ceil(b[1]*c.height);y<Math.floor(b[3]*c.height);y++)for(let x=Math.ceil(b[0]*c.width);x<Math.floor(b[2]*c.width);x++){const i=4*(y*c.width+x);n++;const alpha=d[i+3]/255;if(d[i+3]<230)missing++;if((d[i]+d[i+1]+d[i+2])/3*alpha+36*(1-alpha)<150)dark++;}
    return{darkRatio:dark/n,missingRatio:missing/n,pixels:n};
   },bounds);
   await page.locator('#world').screenshot({path:path.join(out,`laptop-${angle}.png`)});
   await page.evaluate(()=>window.__gsLab.setCrop('desk'));await page.waitForTimeout(300);
   await page.locator('#world').screenshot({path:path.join(out,`desk-${angle}.png`)});
   results.angles.push({angle,bounds,...sample});
  }
  await page.evaluate(()=>{window.__gsLab.setCrop('laptop');window.__gsLab.setAngle(0);});await page.waitForTimeout(300);
  results.sourceLaptop=await page.evaluate(()=>{
   const src=document.querySelector('#world'),ref=document.querySelector('#reference'),c=document.createElement('canvas');c.width=src.width;c.height=src.height;const ctx=c.getContext('2d');
   ctx.drawImage(ref,ref.naturalWidth*.34,ref.naturalHeight*.35,ref.naturalWidth*.25,ref.naturalHeight*.15,0,0,c.width,c.height);const a=ctx.getImageData(0,0,c.width,c.height).data;ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(src,0,0);const b=ctx.getImageData(0,0,c.width,c.height).data;
   let error=0;for(let i=0;i<a.length;i+=4)for(let j=0;j<3;j++)error+=Math.abs(a[i+j]-b[i+j]);return{mae:error/(a.length/4*3),splats:window.__gsLab.state.splats};
  });
  await page.locator('#world').screenshot({path:path.join(out,'laptop-0.png')});
  await fs.writeFile(path.join(out,'probe.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
  assert.ok(results.sourceLaptop.mae<8,'Source laptop degraded or removed');
  for(const r of results.angles){assert.ok(r.darkRatio<.03,`${r.angle}° dark ghost ${(r.darkRatio*100).toFixed(1)}%`);assert.ok(r.missingRatio<.01,`${r.angle}° exposed background is missing`);}
 }finally{await browser.close();if(assetServer)await new Promise(resolve=>assetServer.close(resolve));}
})().catch(e=>{console.error(e.message);process.exit(1)});

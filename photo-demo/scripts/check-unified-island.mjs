import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require('/Users/kloping/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const evidence=new URL('../evidence/holiday-assets-v1/laptop/spatial-v6/',import.meta.url);
const out=new URL('viewer/',evidence);await mkdir(out,{recursive:true});
const expected=JSON.parse(await readFile(new URL('assembly.json',evidence),'utf8'));
const old=JSON.parse(await readFile(new URL('../spatial-v3/inspection/mesh-report.json',evidence),'utf8'));
const browser=await chromium.launch({headless:true,executablePath:'/Users/kloping/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell',args:['--use-angle=metal','--enable-webgl','--ignore-gpu-blocklist']});
const errors=[],report={};
try{
 const page=await browser.newPage({viewport:{width:1440,height:1100}});
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
 await page.goto('http://127.0.0.1:9988/holiday-assets/laptop-unified.html');
 const ready=()=>page.waitForFunction(()=>window.assetModelStats&&document.getElementById('model-note').textContent.includes('拖动'),{},{timeout:120000});
 await ready();report.assembled=await page.evaluate(()=>window.assetModelStats);
 if(report.assembled.triangles!==expected.triangles)throw Error('Assembled geometry count differs');
 for(const [label,file] of [['洞窟正景','rear'],['斜后方','quarter'],['侧面','side'],['俯看','top'],['电脑正面','front']]){
  await page.getByRole('button',{name:label,exact:true}).click();
  await page.locator('#model-view').screenshot({path:new URL(file+'.png',out).pathname});
 }
 await page.getByRole('button',{name:'洞窟正景',exact:true}).click();
 for(const [key,count] of [['environment',expected.environmentTriangles],['previous',old.triangles],['assembled',expected.triangles]]){
  await page.locator(`[data-model="${key}"]`).click();await ready();
  report[key]=await page.evaluate(()=>window.assetModelStats);
  if(report[key].triangles!==count)throw Error(key+' geometry count differs');
  await page.locator('#model-view').screenshot({path:new URL(key+'.png',out).pathname});
 }
 await page.locator('summary').click();await page.locator('.reference').evaluate(im=>im.decode());report.conceptLoaded=true;
 await page.locator('summary').click();await page.setViewportSize({width:390,height:844});
 report.mobileOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
 await page.screenshot({path:new URL('mobile.png',out).pathname,fullPage:true});
 report.errors=errors;report.versionRoundTrip=true;
 await writeFile(new URL('report.json',out),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 if(errors.length||report.mobileOverflow)throw Error('Browser check failed');
}finally{await browser.close();}

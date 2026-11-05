import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require('/Users/kloping/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const evidence=new URL('../evidence/holiday-assets-v1/laptop/spatial-v3/',import.meta.url);
const expected=JSON.parse(await readFile(new URL('inspection/mesh-report.json',evidence),'utf8'));
const expectedPrevious=JSON.parse(await readFile(new URL('../spatial-v2/inspection/mesh-report.json',evidence),'utf8'));
const browser=await chromium.launch({headless:true,executablePath:'/Users/kloping/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell',args:['--use-angle=metal','--enable-webgl','--ignore-gpu-blocklist']});
const errors=[],views=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:1100}});
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:9988/holiday-assets/laptop-spatial.html');
 const ready=()=>page.waitForFunction(()=>window.assetModelStats&&document.getElementById('model-note').textContent.includes('拖动'),{},{timeout:120000});
 await ready();
 const current=await page.evaluate(()=>window.assetModelStats);
 if(current.triangles!==expected.triangles)throw Error('New model triangle mismatch');
 for(const [label,file] of [['斜后方','rear-quarter'],['侧面','side'],['背面俯看','rear-top'],['电脑正面','front']]){
  await page.getByRole('button',{name:label,exact:true}).click();
  await page.locator('#model-view').screenshot({path:new URL(`browser-${file}.png`,evidence).pathname});
  views.push(label);
 }
 await page.getByRole('button',{name:'对比上一版',exact:true}).click();await ready();
 const previous=await page.evaluate(()=>window.assetModelStats);
 if(previous.triangles!==expectedPrevious.triangles)throw Error('Previous model triangle mismatch');
 await page.getByRole('button',{name:'返回本次改版',exact:true}).click();await ready();
 if((await page.evaluate(()=>window.assetModelStats.triangles))!==expected.triangles)throw Error('Return to current model failed');
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'斜后方',exact:true}).click();
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
 await page.screenshot({path:new URL('browser-mobile.png',evidence).pathname,fullPage:true});
 const report={testedAt:new Date().toISOString(),current,previous,views,comparisonRoundTrip:true,errors,mobile:{width:390,height:844,overflow,actualDeviceTest:false}};
 await writeFile(new URL('browser-check.json',evidence),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));
 if(errors.length||overflow)throw Error('Browser errors or overflow');
}finally{await browser.close();}

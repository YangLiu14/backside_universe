import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require('/Users/kloping/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out=new URL('../evidence/holiday-assets-v1/laptop/bookroom-v6/picking/',import.meta.url);await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Users/kloping/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell',args:['--use-angle=metal','--enable-webgl','--ignore-gpu-blocklist']});
const errors=[],report={};
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:9988/holiday-assets/bookroom.html');await page.waitForFunction(()=>window.bookroom?.state.ready,{},{timeout:120000});
 if((await page.evaluate(()=>window.bookroom.state.islandVersion))!=='v6')throw Error('Default is not the grotto');
 await page.locator('#motion').click();await page.locator('#approach').click();await page.waitForFunction(()=>!window.bookroom.state.busy);
 const point=await page.evaluate(async()=>{const T=await import('/vendor/three.module.js');const p=window.bookroom.scene.getObjectByName('green-door-leaf').getWorldPosition(new T.Vector3()).project(window.bookroom.camera),r=document.getElementById('scene').getBoundingClientRect();return{x:r.x+(p.x+1)*r.width/2,y:r.y+(1-p.y)*r.height/2};});
 await page.mouse.click(point.x,point.y);await page.waitForFunction(()=>window.bookroom.state.doorOpen&&!window.bookroom.state.busy);
 report.clickDoorOpens=true;await page.locator('#scene').screenshot({path:new URL('door-click.png',out).pathname});
 await page.locator('#overview').click();await page.waitForFunction(()=>!window.bookroom.state.busy);await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:new URL('mobile-overview.png',out).pathname,fullPage:true});report.mobileOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
 report.legacyLink=await page.locator('#island-version').getAttribute('href');report.errors=errors;
 if(report.mobileOverflow||errors.length||report.legacyLink!=='?island=v3')throw Error('UI regression');
 await writeFile(new URL('report.json',out),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}

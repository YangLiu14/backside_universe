import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require('/Users/kloping/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=new URL('../',import.meta.url);
const catalog=JSON.parse(await readFile(new URL('dist/holiday-assets/catalog.json',root),'utf8'));
const requested=process.argv.slice(2);
const assets=catalog.filter(a=>a.model?.file&&(!requested.length||requested.includes(a.id)));
const browser=await chromium.launch({headless:true,
 executablePath:'/Users/kloping/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell',
 args:['--use-angle=metal','--enable-webgl','--ignore-gpu-blocklist']});
const errors=[],results=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:9988/holiday-assets/index.html');
 for(const asset of assets){
  await page.locator(`[data-id="${asset.id}"]`).click();
  await page.evaluate(()=>window.assetModelStats=null);
  await page.locator('#model-button').click();
  await page.waitForFunction(()=>window.assetModelStats&&document.getElementById('model-note').textContent.includes('拖动旋转'),{},{timeout:120000});
  const stats=await page.evaluate(()=>window.assetModelStats);
  if(stats.triangles!==asset.model.triangles)throw Error(`${asset.id}: unexpected triangle count ${stats.triangles} / ${asset.model.triangles}`);
  await page.locator('#model-view').screenshot({path:new URL(`evidence/holiday-assets-v1/${asset.id}/browser-front.png`,root).pathname});
  await page.locator('#turn-model').click();
  await page.locator('#model-view').screenshot({path:new URL(`evidence/holiday-assets-v1/${asset.id}/browser-back.png`,root).pathname});
  results.push({id:asset.id,...stats,frontBackRendered:true});console.log(JSON.stringify(results.at(-1)));
 }
 await page.setViewportSize({width:390,height:844});
 await page.locator('[data-id="mushroom-lamp"]').click();
 await page.evaluate(()=>window.assetModelStats=null);await page.locator('#model-button').click();
 await page.waitForFunction(()=>window.assetModelStats,{},{timeout:120000});
 await page.locator('#turn-model').click();await page.locator('#reset-model').click();
 await page.locator('#model-view').focus();await page.keyboard.press('ArrowRight');
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
 await page.screenshot({path:new URL('evidence/holiday-assets-v1/mobile-final.png',root).pathname,fullPage:true});
 const report={testedAt:new Date().toISOString(),results,errors,mobile:{width:390,height:844,overflow,actualDeviceTest:false}};
 await writeFile(new URL('evidence/holiday-assets-v1/browser-final-check.json',root),JSON.stringify(report,null,2));
 if(errors.length||overflow)throw Error(JSON.stringify(report));
}finally{await browser.close();}

const {playwright,installedBrowser}=require('../../pipeline/verify.cjs'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{const [url,out]=process.argv.slice(2);const b=await playwright().chromium.launch({executablePath:await installedBrowser(),args:process.platform==='darwin'?['--use-angle=metal']:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{const results=[];for(const [label,v] of [['desktop',{width:1152,height:768}],['mobile',{width:390,height:844}]]){
const p=await b.newPage({viewport:v,hasTouch:label==='mobile'});const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('response',r=>{if(r.status()>=400)errs.push(r.url()+' '+r.status());});
await p.goto(url);await p.waitForFunction(()=>!!window.proofState,null,{timeout:45000});const before=await p.evaluate(()=>proofState());assert(before.splats>0);
await p.locator('#range').fill('180');await p.waitForTimeout(300);assert.notDeepEqual(before.pose,(await p.evaluate(()=>proofState())).pose);await p.screenshot({path:path.join(out,label+'-parallax.jpg')});
await p.locator('#range').fill('0');assert.deepEqual((await p.evaluate(()=>proofState())).pose,before.pose);await p.locator('#design').click();assert((await p.evaluate(()=>proofState())).design);
await p.locator('#listen').click();await p.waitForFunction(()=>document.querySelector('audio').currentTime>.12);await p.locator('#live').click();assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errs,[]);
results.push({label,v,splats:before.splats,reversible:true,voice:true});await p.close();
}fs.writeFileSync(path.join(out,'proof-check.json'),JSON.stringify(results,null,2));console.log(results);}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

// Check the actual Marble files, never treating absent organs as completed visits.
const {strict:assert}=require('node:assert'),fs=require('node:fs/promises'),path=require('node:path'),{gunzipSync}=require('node:zlib');
const {createHash}=require('node:crypto'),{baseURL,launchBrowser}=require('./marble-browser.cjs');
const asset=path.join(__dirname,'../dist/canine-museum/assets'),out=path.join(__dirname,'../evidence/canine-production/browser');
const state=p=>p.evaluate(async()=>{await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);return window.__canine.state;});
const url=baseURL+'/canine-museum/cutaway.html',set=async(p,a)=>{await p.locator('#angle').fill(String(a));return state(p);};
(async()=>{
 await fs.mkdir(out,{recursive:true});const scene=JSON.parse(await fs.readFile(path.join(asset,'marble/scene.json'))),catalog=JSON.parse(await fs.readFile(path.join(asset,'organs/catalog.json')));
 const hash=b=>createHash('sha256').update(b).digest('hex');assert.equal(hash(await fs.readFile(path.join(asset,'original.jpg'))),scene.source_sha256);
 const approved=Object.keys(catalog.organs).filter(k=>catalog.organs[k].state==='approved');
 const b=await launchBrowser(),report={world:scene.world_id,modes:[],approved};
 try{for(const mobile of [false,true]){
 const variant=scene.variants[mobile?'500k':'full_res'],spz=await fs.readFile(path.join(asset,'marble',variant.file));assert.equal(hash(spz),variant.sha256);
 const splats=gunzipSync(spz).readUInt32LE(8);
 const ctx=await b.newContext({viewport:mobile?{width:390,height:844}:{width:1380,height:950},hasTouch:mobile,isMobile:mobile,reducedMotion:'reduce'}),p=await ctx.newPage(),errors=[],urls=[];
 p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>urls.push(r.url()));
 await p.goto(url);await p.waitForSelector('#stage[data-ready=true]',{timeout:90000});const initial=await state(p);
 assert.equal(initial.worldId,scene.world_id);assert.equal(initial.splats,splats);assert.deepEqual(initial.installed.sort(),approved.slice().sort());
 assert.equal(await p.locator('#photo').evaluate(x=>+getComputedStyle(x).opacity),1);
 const capture=tag=>p.locator('#stage').screenshot({path:path.join(out,(mobile?'mobile-':'')+tag+'.jpg')});
 if(!mobile)await capture('photo');
 const pre=await set(p,4);await p.waitForTimeout(600);if(!mobile)await capture('marble-4');
 await set(p,51);assert.deepEqual((await set(p,4)).camera,pre.camera);
 await set(p,90);assert.equal(await p.locator('#pins button:visible').count(),approved.length);await capture('skeleton');
 for(const [k,entry] of Object.entries(catalog.organs)){const btn=p.locator('[data-room='+k+']');
 if(entry.state!=='approved'){assert(await btn.isDisabled());continue;}
 await btn.click();let near=await state(p);assert.equal(near.room,k);await capture(k+'-front');
 await p.locator('#stage').focus();await p.keyboard.press('ArrowLeft');await p.keyboard.press('ArrowLeft');await p.keyboard.press('+');assert.notDeepEqual((await state(p)).camera,near.camera);await capture(k+'-oblique');await p.keyboard.press('Escape');
 }
 await set(p,0);assert.deepEqual((await state(p)).camera,initial.camera);
 assert(!urls.some(u=>/room\.splat|gallery-walls|reference\.png/.test(u)));assert.deepEqual(errors,[]);
 if(!mobile){
   await p.goto(url+'?view=marble');await p.waitForSelector('#stage[data-ready=true]',{timeout:90000});await p.waitForTimeout(700);await capture('marble-0');
   const start=await state(p);
   const heading=pose=>Math.atan2(pose.camera[8],pose.camera[10]);
   let previous=heading(start);
   for(const angle of [4,15,45,75,90]){
     const pose=await set(p,angle);
     assert(heading(pose)>previous,'Marble should orbit to the photo viewer’s right');
     previous=heading(pose);
   }
   await capture('marble-right');
   await p.locator('#turn').click();assert.deepEqual((await state(p)).camera,start.camera);
   const stage=await p.locator('#stage').boundingBox(),x=stage.x+stage.width*.35,y=stage.y+stage.height*.5;
   await p.mouse.move(x,y);await p.mouse.down();await p.mouse.move(x+100,y,{steps:5});await p.mouse.up();
   assert(heading(await state(p))>heading(start));
   await p.locator('#turn').click();assert.equal((await state(p)).angle,90);
   assert(Math.abs(heading(await state(p))-Math.PI/2)<1e-6);
 }
 report.modes.push({mobile,splats,file:variant.file});await ctx.close();
 }}finally{await b.close();}
 await fs.writeFile(path.join(out,'qa.json'),JSON.stringify(report,null,2));console.log(report);
})().catch(e=>{console.error(e);process.exitCode=1;});

// Exercises the actual WebGL passes, lazy network requests and the bookroom loop.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {baseURL, launchBrowser} = require('./marble-browser.cjs');
const out = path.join(__dirname, '../evidence/desktop-islands');
const modelURL = /\/(blue-book|orange-book|phone)\/desktop-(near|far)\.glb$/;
const url = baseURL+'/marble-transition-lab/index.html';

async function open(browser, options={}) {
  const page = await browser.newPage(options);
  const errors=[],requests=[];
  page.on('request',r=>{if(modelURL.test(r.url()))requests.push(r.url().match(modelURL).slice(1).join('/'));});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(url);
  await page.waitForSelector('#world[data-ready=true]',{timeout:90000});
  return {page,errors,requests};
}
async function settled(page){
  await page.waitForFunction(()=>window.__marbleTransition.islands.every(e=>e.amount===1&&e.level!=='ordinary'));
  await page.waitForTimeout(850);
}
async function imageStats(page) {
  return page.evaluate(async()=>{
    const t=window.__marbleTransition,canvas=document.getElementById('world'),T=await import('/vendor/three.module.js');
    const helper=document.createElement('canvas');helper.width=canvas.width;helper.height=canvas.height;
    const ctx=helper.getContext('2d',{willReadFrequently:true});
    const snapshot=async()=>{
      t.setProgress(1);
      for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);
      ctx.drawImage(canvas,0,0);
      return ctx.getImageData(0,0,helper.width,helper.height).data;
    };
    const result=[],full=await snapshot();
    for(const island of t.islands){
      const root=t.dreamScene.getObjectByName('Desktop island / '+island.id);
      const table=t.dreamScene.getObjectByName('Original tabletop becoming a single sea');
      // Raycast the visible GLB, at both ends of its inlet. The original
      // mouth marker alone missed generated water sloping up inside each bay.
      const sites={
        'blue-book':[[.075,.015,.333],[.145,.021,-.009]],
        'orange-book':[[-.093,.017,.371],[-.005,.018,-.149]],
        phone:[[-.15,.011,.272],[.087,.008,-.111]],
      };
      const rayAt=(x,z)=>new T.Raycaster(new T.Vector3(x,2,z),new T.Vector3(0,-1,0));
      const sample=(x,z)=>rayAt(x,z).intersectObject(table,false)[0];
      const displayed=[];root.traverseVisible(o=>{if(o.isMesh)displayed.push(o);});
      const bayGaps=sites[island.id].map(site=>{
        const p=root.localToWorld(new T.Vector3(...site)),ray=rayAt(p.x,p.z);
        const bed=ray.intersectObjects(displayed,false)[0],sea=sample(p.x,p.z);
        if(!bed||!sea)throw Error(island.id+' missing harbor sample');
        return bed.point.y-sea.point.y;
      });
      const coastInside=island.shore.every(([x,z])=>sample(x,z));
      const meshes=[],textures=new Set();let loadedGeometryBytes=0,triangles=0;
      root.traverse(o=>{
        if(!o.isMesh)return;
        const g=o.geometry;
        for(const a of Object.values(g.attributes))loadedGeometryBytes+=a.array.byteLength;
        loadedGeometryBytes+=g.index.array.byteLength;
        for(const value of Object.values(o.material))if(value?.isTexture)textures.add(value);
      });
      root.traverseVisible(o=>{if(o.isMesh){triangles+=o.geometry.index.count/3;meshes.push([o,o.layers.mask]);o.layers.mask=0;}});
      const hidden=await snapshot();
      for(const [o,mask] of meshes)o.layers.mask=mask;
      let changed=0,xMin=helper.width,xMax=0,yMin=helper.height,yMax=0;
      for(let y=0;y<helper.height;y++)for(let x=0;x<helper.width;x++){
        const i=(y*helper.width+x)*4;
        if(Math.max(...[0,1,2].map(c=>Math.abs(hidden[i+c]-full[i+c])))<=12)continue;
        xMin=Math.min(x,xMin);xMax=Math.max(x,xMax);yMin=Math.min(y,yMin);yMax=Math.max(y,yMax);changed++;
      }
      const textureMiB=[...textures].reduce((n,t)=>n+t.image.width*t.image.height*4*4/3/1048576,0);
      result.push({id:island.id,level:island.level,loaded:island.loaded,triangles,bayGaps,coastInside,visiblePixels:changed,
        xMin,xMax,yMin,yMax,width:helper.width,height:helper.height,loadedGeometryBytes,textureMiB});
    }
    await snapshot();
    return result;
  });
}

async function checkHarborWaterlines(page){
  const gaps=await page.evaluate(async()=>{
    const T=await import('/vendor/three.module.js'),t=window.__marbleTransition;
    const table=t.dreamScene.getObjectByName('Original tabletop becoming a single sea');
    const shell=t.grotto.environment;
    const cup=t.dreamScene.getObjectByName('Hi3D miniature holiday island');
    const sample=(model,p)=>{
      model.updateWorldMatrix(true,true);
      const ray=new T.Raycaster(new T.Vector3(p.x,2,p.z),new T.Vector3(0,-1,0));
      return ray.intersectObject(model,true)[0].point.y-ray.intersectObject(table,false)[0].point.y;
    };
    return {
      grotto:[[-.138,-.351,-.907],[-.087,-.358,-.836],[-.256,-.319,-.842]]
        .map(site=>sample(shell,t.grotto.islandToWorld(new T.Vector3(...site)))),
      cup:sample(cup,cup.localToWorld(new T.Vector3(0,.04,.44))),
    };
  });
  const [mouth,basin,pier]=gaps.grotto;
  assert(mouth<-.005 && basin<-.005 && pier>.003,'pool mouth, inner pool, pier deck: '+gaps.grotto);
  assert(gaps.cup<-.002 && gaps.cup>-.006,'cup shoreline: '+gaps.cup);
}

// Sample the shared cup during its actual modeled draw, before the compositor
// restores the dry geometry for the 3DGS pass. Include the crest allowance.
async function checkCupExposure(page){
  const result=await page.evaluate(async()=>{
    const T=await import('/vendor/three.module.js'),t=window.__marbleTransition;
    const scene=t.dreamScene,table=scene.getObjectByName('Original tabletop becoming a single sea');
    const previous=scene.onBeforeRender;
    const sampled=new Promise(resolve=>{
      scene.onBeforeRender=function(...args){
        previous.apply(this,args);
        if(this.overrideMaterial || !this.getObjectByName('saucer'))return;
        scene.onBeforeRender=previous;
        const wall=this.getObjectByName('cup-wall'),saucer=this.getObjectByName('saucer');
        const handle=this.getObjectByName('cup-handle'),{cupOpening,cupRear}=wall.material.uniforms;
        const {x:cx,y:cz}=cupOpening.value,rear=cupRear.value,point=new T.Vector3();
        const rayAt=(x,z)=>new T.Raycaster(new T.Vector3(x,2,z),new T.Vector3(0,-1,0));
        const seaY=(x,z)=>rayAt(x,z).intersectObject(table,false)[0].point.y;
        const h=seaY(cx,cz),sx=(seaY(cx+.03,cz)-h)/.03,sz=(seaY(cx,cz+.03)-h)/.03;
        const clearance=p=>p.y-h-sx*(p.x-cx)-sz*(p.z-cz);
        let rim=0,dry=0,handleGap=Infinity;
        for(let i=0;i<saucer.geometry.attributes.position.count;i++){
          saucer.getVertexPosition(i,point).applyMatrix4(saucer.matrixWorld);
          if(Math.hypot(point.x-cx,point.z-cz)<.052)continue;
          rim++;if(clearance(point)>.005)dry++;
        }
        for(let i=0;i<handle.geometry.attributes.position.count;i++){
          handle.getVertexPosition(i,point).applyMatrix4(handle.matrixWorld);
          handleGap=Math.min(handleGap,clearance(point));
        }
        const channel=[.026,.037,.050,.055].map(u=>{
          const hit=rayAt(cx+rear.x*u,cz+rear.y*u).intersectObject(saucer,false)[0];
          return hit ? clearance(hit.point) : null;
        });
        resolve({rim,dry,handleGap,channel,draft:-wall.position.y});
      };
    });
    t.setProgress(1);
    return sampled;
  });
  assert(result.draft<.006 && result.handleGap>.018,JSON.stringify(result));
  assert(result.rim>50 && result.dry/result.rim>.60,JSON.stringify(result));
  assert(result.channel[0]!==null && result.channel.every(h=>h===null || h<-.0045),JSON.stringify(result));
  return result;
}

async function checkSubmergedCover(page){
  return page.evaluate(async()=>{
    const T=await import('/vendor/three.module.js');
    const t=window.__marbleTransition,canvas=t.renderer.domElement;
    // Put a copy of the real cover fully under the sea and compare beauty
    // frames. An occluded solid must not leave a sharp rectangle in the mask.
    const cover=t.objects.group.getObjectByName('book-cover').clone();
    const table=t.dreamScene.getObjectByName('Original tabletop becoming a single sea');
    // The cutaway now exposes objects seen from the side. Put the entire
    // probe under the cap, away from the visible edge and its AA footprint.
    const mid=new T.Box3().setFromObject(table).getCenter(new T.Vector3());
    const old=new T.Box3().setFromObject(cover).getCenter(new T.Vector3());
    cover.position.set(mid.x-old.x,-.05,mid.z-old.z);
    cover.visible=true;t.objects.group.add(cover);
    const tmp=document.createElement('canvas');tmp.width=canvas.width;tmp.height=canvas.height;
    const ctx=tmp.getContext('2d',{willReadFrequently:true});
    const render=async()=>{
      t.setProgress(.56);for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);
      ctx.drawImage(canvas,0,0);return ctx.getImageData(0,0,tmp.width,tmp.height).data;
    };
    const visible=await render();
    const transform=cover.matrixWorld.clone();
    cover.removeFromParent();
    const hidden=await render();
    const corners=[0,1,2,3].map(i=>new T.Vector3().fromBufferAttribute(cover.geometry.attributes.position,i).applyMatrix4(transform));
    let samples=0,maxDifference=0,totalDifference=0,changed=0;
    const ray=new T.Raycaster();
    for(let i=1;i<9;i++)for(let j=1;j<9;j++){
      const p=corners[0].clone().lerp(corners[1],i/9).lerp(corners[3].clone().lerp(corners[2],i/9),j/9);
      const ndc=p.clone().project(t.camera);ray.setFromCamera(ndc,t.camera);
      const hit=ray.intersectObject(table,false)[0];
      if(!hit||hit.distance+.008>=ray.ray.origin.distanceTo(p)||Math.max(Math.abs(ndc.x),Math.abs(ndc.y))>=.95)continue;
      const offset=(Math.floor((1-ndc.y)*tmp.height/2)*tmp.width+Math.floor((1+ndc.x)*tmp.width/2))*4;
      const difference=Math.max(...[0,1,2].map(c=>Math.abs(visible[offset+c]-hidden[offset+c])));
      totalDifference+=difference;changed+=Number(difference>2);maxDifference=Math.max(maxDifference,difference);
      samples++;
    }
    await render();return {samples,maxDifference,mean:totalDifference/samples,changed};
  });
}

async function checkViewport(browser, mobile){
  const {page,errors,requests}=await open(browser,mobile?{viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,reducedMotion:'reduce'}:{viewport:{width:1280,height:800}});
  try{
    assert.deepEqual(requests,[],'No new island request should block the source frame');
    const source=await page.evaluate(()=>{const t=window.__marbleTransition;return {camera:t.state.camera,projection:t.state.projection};});
    const sourceFile=mobile?'mobile-source.png':'desktop-source.png';
    await page.locator('#world').screenshot({path:path.join(out,sourceFile)});
    // Slow reads followed by Home must not later take the user back to the sea.
    if(!mobile){
      await page.route('**/desktop-far.glb',async route=>{await new Promise(r=>setTimeout(r,420));await route.continue();});
      await page.evaluate(()=>{const t=window.__marbleTransition;t.setProgress(1);t.setProgress(0);});
      await page.waitForFunction(()=>window.__marbleTransition.islands.every(e=>e.loaded.includes('far')));
      assert.equal(await page.evaluate(()=>window.__marbleTransition.state.progress),0);
      await page.unroute('**/desktop-far.glb');
    }
    await page.click('[data-progress="1"]');
    await settled(page);
    // Freeze the independent ocean clock for same-frame occlusion comparisons.
    if(!mobile)await page.click('#reduce-motion');
    await checkHarborWaterlines(page);
    const cupExposure=await checkCupExposure(page);
    const pixels=await imageStats(page);
    for(const item of pixels){
      assert(item.visiblePixels>150,item.id+' must visibly change the rendered frame');
      assert(item.xMin>1&&item.xMax<item.width-2&&item.yMin>1&&item.yMax<item.height-2,item.id+' cropped');
      assert(item.triangles<=42500);
      assert(item.coastInside&&item.bayGaps.every(gap=>gap<-.002&&gap>-.012),item.id+' waterline '+item.bayGaps);
    }
    const endpoint=await page.locator('#world').screenshot({path:path.join(out,mobile?'mobile-back.png':'desktop-back.png')});
    await page.evaluate(()=>window.__marbleTransition.setProgress(.56));
    await page.waitForTimeout(550);
    const submerged=await checkSubmergedCover(page);
    // A mip-filtered edge may sample neighbouring uncovered pixels. A solid
    // rectangle would affect the interior samples together, far above 1/255.
    assert(submerged.samples>10&&submerged.mean<1&&submerged.maxDifference<=6,JSON.stringify(submerged));
    await page.locator('#world').screenshot({path:path.join(out,mobile?'mobile-mid.png':'desktop-mid.png')});
    await page.click('[data-progress="1"]');await settled(page);
    assert(endpoint.equals(await page.locator('#world').screenshot()),'endpoint must be pixel-reversible');
    let frameTimes;
    if(!mobile){
      await page.click('#reduce-motion');
      await page.click('#home');await page.click('#play');
      await page.waitForFunction(()=>window.__marbleTransition.state.progress===1&&!window.__marbleTransition.state.playing);
      frameTimes=await page.evaluate(()=>{const f=window.__marbleTransition.state.frames.sort((a,b)=>a-b);return {samples:f.length,median:f[f.length>>1],p95:f[Math.floor(f.length*.95)]};});
      await page.click('#reduce-motion');
    }
    await page.click('#enter-bookroom');
    await page.waitForSelector('[data-visit=terrace][data-visit-busy=false]');
    await checkHarborWaterlines(page);
    for(const [action,stage] of [['enter','inside'],['read','book'],['photo','desk']]){
      await page.click('[data-visit-action='+action+']');
      await page.waitForSelector('[data-visit='+stage+'][data-visit-busy=false]');
    }
    const restored=await page.evaluate(()=>{const t=window.__marbleTransition;return {camera:t.state.camera,projection:t.state.projection,progress:t.state.progress,cycles:t.visit.state.cycles,scrollWidth:document.documentElement.scrollWidth};});
    assert.deepEqual(restored.camera,source.camera);assert.deepEqual(restored.projection,source.projection);
    assert.equal(restored.cycles,1);assert.equal(restored.progress,0);
    if(mobile)assert.equal(restored.scrollWidth,390);
    assert.equal(new Set(requests).size,requests.length,'cycles must reuse loaded LODs');
    assert.deepEqual(errors,[]);
    return {cupExposure,pixels,submerged,requests,frameTimes,sourcePasses:await page.evaluate(()=>window.__marbleTransition.state.compositor.passes),cycles:restored.cycles};
  }finally{await page.close();}
}

async function checkMissing(browser){
  const {page}=await open(browser,{viewport:{width:1000,height:700}});
  try{
    await page.route('**/phone/desktop-far.glb',r=>r.fulfill({status:404,body:''}));
    await page.route('**/orange-book/desktop-far.glb',async r=>{await new Promise(ok=>setTimeout(ok,2200));await r.continue();});
    await page.click('[data-progress="1"]');
    await page.waitForFunction(()=>window.__marbleTransition.state.progress===1);
    const slow=await page.evaluate(()=>window.__marbleTransition.islands);
    assert(!slow.find(i=>i.id==='orange-book').loaded.includes('far'),'a slow island must not block arrival');
    await page.waitForFunction(()=>window.__marbleTransition.islands.find(i=>i.id==='orange-book').amount===1);
    const fallback=await page.evaluate(()=>window.__marbleTransition.islands.find(i=>i.id==='phone'));
    assert.equal(fallback.level,'ordinary');assert(fallback.failed.includes('far'));
    await page.unroute('**/phone/desktop-far.glb');await page.click('#island-retry');await settled(page);
    assert(await page.locator('#island-retry').isHidden());
    return {ordinaryFallback:true,slowIslandIndependent:true,retryRecovered:true};
  }finally{await page.close();}
}

(async()=>{
  await fs.mkdir(out,{recursive:true});
  const browser=await launchBrowser();
  try{
    const desktop=await checkViewport(browser,false),mobile=await checkViewport(browser,true);
    const report={desktop,mobile,recovery:await checkMissing(browser)};
    await fs.writeFile(path.join(out,'acceptance.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report,null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

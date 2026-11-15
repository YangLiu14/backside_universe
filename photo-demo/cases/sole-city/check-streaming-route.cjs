// Check the actual capture camera against resident Hi3D geometry. This adapter
// exists only in the QA browser, which uses the visitor's street controller.
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {playwright,installedBrowser}=require('../../pipeline/verify.cjs');
const {observeScenes}=require('../../pipeline/qa/clearance.cjs');

async function measure(browser,url,mobile,out){
  const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1024,height:768},hasTouch:mobile});
  const near=[],errors=[],samples=[];
  let pending=0,peak=0;
  const isNear=url=>/\/(shop-[\w-]+|flat-[\w-]+|courtyard-osmanthus)-detail\.glb$/.test(new URL(url).pathname);
  try{
    await observeScenes(page);
    page.on('request',req=>{if(isNear(req.url())){near.push(path.basename(new URL(req.url()).pathname));peak=Math.max(peak,++pending);}});
    page.on('requestfinished',req=>{if(isNear(req.url()))pending--;});
    page.on('requestfailed',req=>{errors.push(req.url()+' '+req.failure()?.errorText);if(isNear(req.url()))pending--;});
    page.on('pageerror',e=>errors.push(e.message));
    page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
    page.on('console',m=>{if(/Shader Error|VALIDATE_STATUS|WebGL: INVALID/.test(m.text()))errors.push(m.text().slice(0,300));});
    await page.route('**/street-walk.js',async route=>{
      const res=await route.fetch(),src=await res.text(),hook='  return {start,stop,draw,get position()';
      assert(src.includes(hook));
      const adapter=`
        window.streetStreamPose=(x,z,yaw,pitch,isDeck)=>{
          if(!layout.walkSurface(x,z,!!isDeck))return false;
          const r=Math.PI/180,eye=walk.position.clone().set(x,.033,z),target=eye.clone();
          target.x+=Math.sin(yaw*r)*Math.cos(pitch*r);target.z-=Math.cos(yaw*r)*Math.cos(pitch*r);target.y+=Math.sin(pitch*r);
          walk.start(eye,target);above=!!isDeck;draw();return true;
        };
      `;
      await route.fulfill({response:res,body:src.replace(hook,adapter+hook)});
    });
    await page.goto(url);
    await page.waitForFunction(()=>window.soleCityDetailState&& !document.getElementById('street').disabled,null,{timeout:180000});
    const manifest=await page.evaluate(async()=> (await (await fetch('scene.json')).json()).models);
    const roles=Object.keys(manifest).filter(r=>/^(flat-|shop-|courtyard-osmanthus$)/.test(r));
    const initial=await page.evaluate(()=>window.soleCityDetailState());
    assert.equal(near.length,0);
    await page.locator('#street').click();
    await page.evaluate(()=>window.soleCityWaitForDetail());
    // Each pose uses the same outsole-local projection as the full-film recorder.
    // No mesh exporter or all-detail inspection is invoked by this check.
    const poses=[
      ['bridge-look-back',.006,.1395,139,-21,true],
      ['upper-main-lane',.004,.565,178,11,false],
      ['tower-cross-street',-.018,.4775,261,15,false],
    ];
    // Find the closest standable corner looking into a courtyard containing an
    // actual Hi3D tree. Floor position is approved by the real collision solver.
    const tree=await page.evaluate(async()=>{
      const T=await import('three');
      const city=window.qaScenes.map(s=>s.getObjectByName('蓝栏杆步行天桥')).find(Boolean)?.parent;
      let result=null;
      city.traverse(tree=>{
        if(result||tree.userData.hi3dRole!=='courtyard-osmanthus')return;
        const target=city.worldToLocal(tree.getWorldPosition(new T.Vector3()));target.y+=.044;
        for(const d of [.038,.046,.06,.082,.10])for(let n=0;n<24;n++){
          const a=n*2*Math.PI/24,x=target.x+d*Math.cos(a),z=target.z+d*Math.sin(a);
          const yaw=Math.atan2(target.x-x,z-target.z)*180/Math.PI;
          const pitch=Math.atan2(target.y-.033,d)*180/Math.PI;
          if(window.streetStreamPose(x,z,yaw,pitch,false)){result=[x,z,yaw,pitch,false];return;}
        }
      });
      return result;
    });
    if(roles.includes('courtyard-osmanthus')){assert(tree,'Could not find a standable courtyard tree view');poses.push(['courtyard-osmanthus',...tree]);}
    for(const [name,...pose] of poses){
      const ok=await page.evaluate(p=>window.streetStreamPose(...p),pose);
      assert(ok,name+' pose inside collision geometry');
      const result=await page.evaluate(async()=>{
        await window.soleCityWaitForDetail();
        const T=await import('three');
        const city=window.qaScenes.map(s=>s.getObjectByName('蓝栏杆步行天桥')).find(Boolean).parent;
        const r=window.soleCityDetailState(),state=window.soleCityState();
        const showing=new Set(), bounds=new T.Box3(),localBox=new T.Box3(new T.Vector3(-.5,0,-.5),new T.Vector3(.5,1,.5));
        const view=new T.Matrix4().fromArray(state.pose).invert(),proj=new T.Matrix4().fromArray(state.projection);
        const frustum=new T.Frustum().setFromProjectionMatrix(proj.multiply(view));
        city.traverse(lod=>{
          if(!lod.isLOD||!lod.userData.nearBuildingRole||lod.levels.length<2||!lod.levels[0].object.visible)return;
          if(!frustum.intersectsBox(bounds.copy(localBox).applyMatrix4(lod.matrixWorld)))
            throw Error('Near mesh rendered outside camera frustum: '+lod.userData.nearBuildingRole);
          showing.add(lod.userData.nearBuildingRole);
        });
        return {state:r,showing:[...showing],onBridge:state.onBridge,position:state.walkPosition};
      });
      assert.deepEqual(result.showing.sort(),result.state.visible.slice().sort(),name+' actual detail visibility');
      assert(result.state.resident.length<=result.state.limit);
      if(name==='bridge-look-back')assert(result.onBridge&&result.position[1]>.075);
      if(name==='courtyard-osmanthus')assert(result.showing.includes(name));

      const before=near.length;
      await page.evaluate(async p=>{window.streetStreamPose(...p);await window.soleCityWaitForDetail();},pose);
      assert.equal(near.length,before,name+' repeated camera re-fetched a near GLB');
      await page.locator('#mesh').screenshot({path:path.join(out,(mobile?'mobile-':'desktop-')+name+'.jpg'),type:'jpeg',quality:90});
      samples.push({name,pose,...result,totalRequests:near.length});
    }
    const hasTowers=roles.some(role=>role.startsWith('flat-'));
    if(hasTowers)assert(samples.some(s=>['upper-main-lane','tower-cross-street'].includes(s.name)&&s.showing.some(role=>role.startsWith('flat-'))),'No actual tower visible at high detail across either tower viewpoint');
    assert(peak<=initial.maxLoads,'concurrent near downloads '+peak);
    assert.equal(errors.length,0,errors.join('\n'));
    return {mobile,roleCount:roles.length,initial,peakRequests:peak,near,samples,errors};
  }finally{await page.close();}
}
(async()=>{
 const [url,out]=process.argv.slice(2);
 await fs.mkdir(out,{recursive:true});const browser=await playwright().chromium.launch({executablePath:await installedBrowser(),args:['--use-angle=metal']});
 try{
  const devices=[];
  for(const mobile of [false,true]){
   const result=await measure(browser,url,mobile,out);devices.push(result);
   console.log(mobile?'mobile':'desktop',JSON.stringify(result.samples.map(s=>[s.name,s.showing])));
   await fs.writeFile(path.join(out,'streaming-views.json'),JSON.stringify({version:new URL(url).pathname,devices},null,2));
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

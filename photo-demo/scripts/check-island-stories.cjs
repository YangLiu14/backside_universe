const assert=require('node:assert/strict');
const {launchBrowser,baseURL}=require('./marble-browser.cjs');
const phase=(page,name)=>page.waitForSelector('#stage[data-harbor="'+name+'"]');
const view=page=>page.evaluate(()=>window.__marbleTransition.state.camera);
async function enter(page,id,stage){
  await page.selectOption('#explore-island',id);
  await page.waitForTimeout(650);
  const origin=await view(page);
  await page.click('#enter-island-story');await phase(page,stage);
  return origin;
}
async function subject(page,name){
  return page.evaluate(async name=>{
    const T=await import('/vendor/three.module.js'),app=window.__marbleTransition,o=app.dreamScene.getObjectByName(name);
    const p=new T.Box3().setFromObject(o,true).getCenter(new T.Vector3());
    if(name==='Woven orange bookmark'){
      const v=o.geometry.attributes.position;
      o.localToWorld(p.fromBufferAttribute(v,(v.count-1)/2));
    }
    const rect=document.querySelector('#world').getBoundingClientRect();
    p.project(app.camera);
    return {x:rect.x+(1+p.x)*rect.width/2,y:rect.y+(1-p.y)*rect.height/2};
  },name);
}
// A projection alone cannot tell whether a rock hides the object. Measure the
// actual contribution of the same sheet to the steady, magnified framebuffer.
async function visiblePixels(page,name){
  return page.evaluate(async name=>{
    const app=window.__marbleTransition,mesh=app.dreamScene.getObjectByName(name);
    const c=document.createElement('canvas');c.width=460;c.height=240;
    const ctx=c.getContext('2d',{willReadFrequently:true});
    const take=async()=>{
      // Invalidate a reduced-motion frame without changing the final bearing.
      for(const key of ['ArrowLeft','ArrowRight'])app.renderer.domElement.dispatchEvent(new KeyboardEvent('keydown',{key}));
      for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);ctx.drawImage(app.renderer.domElement,0,0,c.width,c.height);return ctx.getImageData(0,0,c.width,c.height).data;};
    const a=await take(),material=mesh.isMesh?mesh.material:mesh.children.find(c=>c.isMesh).material;
    const old=material.visible;material.visible=false;const b=await take();material.visible=old;
    let different=0;
    for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>22)different++;
    return different;
  },name);
}
async function tour(browser,touch){
  const page=await browser.newPage({viewport:touch?{width:390,height:844}:{width:1280,height:850},
    hasTouch:touch,isMobile:touch,reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  try{
    const client=touch?await page.context().newCDPSession(page):null;
    const tap=({x,y})=>touch?page.touchscreen.tap(x,y):page.mouse.click(x,y);
    async function drag({x,y},dx,dy,cancel=false){
      if(touch){
        const dispatch=(type,points)=>client.send('Input.dispatchTouchEvent',{type,touchPoints:points});
        await dispatch('touchStart',[{x,y}]);
        for(let i=1;i<=8;i++)await dispatch('touchMove',[{x:x+dx*i/8,y:y+dy*i/8}]);
        await dispatch(cancel?'touchCancel':'touchEnd',[]);
      }else{
        await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y+dy,{steps:10});await page.mouse.up();
      }
    }
    await page.goto(baseURL+'/marble-transition-lab/index.html?progress=1');await page.waitForSelector('#stage[data-browsing=true]');
    const origin=await enter(page,'blue-book','telescope');await tap(await subject(page,'Brass telescope'));await phase(page,'looking');
    const slider=page.getByRole('slider',{name:'望远镜倍率'});
    assert.equal(await slider.inputValue(),'2');
    await page.waitForFunction(()=>document.querySelector('#scope-lens').style.opacity==='1');
    const initialView=await view(page);
    async function setEdge(max){
      if(touch){
        const r=await slider.boundingBox();
        await page.touchscreen.tap(max?r.x+r.width-2:r.x+2,r.y+r.height/2);
      }else await slider.press(max?'End':'Home');
      const value=max?'6':'1';
      await page.waitForFunction(v=>document.querySelector('#scope-reading').value===v+'×',value);
      await page.evaluate(async()=>{await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);});
      return page.evaluate(()=>window.__marbleTransition.camera.projectionMatrix.elements[5]);
    }
    const close=await setEdge(true),wide=await setEdge(false);
    assert(Math.abs(close/wide-6)<.001,'the slider must change focal length by the displayed factor');
    assert.deepEqual(await view(page),initialView,'the lens must zoom without moving the eye or its bearing');
    await slider.press('ArrowRight');await slider.press('ArrowRight');assert.equal(await slider.inputValue(),'2');
    assert.equal(await page.evaluate(()=>!!window.__marbleTransition.dreamScene.getObjectByName('Paper boat at sea')?.visible),false);
    // The cutter should be in the opening field of view before any paper is launched.
    const sail=await subject(page,'Ochre-sailed coastal cutter'),r=await page.locator('#world').boundingBox();
    assert(Math.hypot(sail.x-r.x-r.width/2,sail.y-r.y-r.height/2)<Math.min(r.width,r.height)*.48);
    // matrixWorld's third column points backward; negate its Y to get the
    // elevation of the optical axis. Pointer and touch should follow the hand.
    const elevation=async()=>-(await view(page))[9];
    const before=await elevation();
    await drag(sail,0,-35);const raised=await elevation();
    assert(raised>before+.045,'drag up must raise the telescope: '+[before,raised]);
    await drag(sail,0,35);assert((await elevation())<raised-.045,'drag down must lower the telescope');
    const pre=await view(page);await drag(sail,43,0);assert.notDeepEqual(await view(page),pre);
    await page.click('#harbor-exit');assert.deepEqual(await view(page),origin);assert(await slider.isHidden());

    await page.selectOption('#explore-island','cup');await phase(page,'note');await page.click('#harbor-action');await phase(page,'boat');
    const originalPaper=await page.evaluate(()=>window.__marbleTransition.dreamScene.getObjectByName('Harbor note and folded paper boat').uuid);
    await page.click('#harbor-action');await phase(page,'farewell');await page.click('#harbor-exit');
    assert.equal(await page.evaluate(()=>window.__marbleTransition.dreamScene.getObjectByName('Paper boat at sea').children[0].uuid),originalPaper);
    await enter(page,'blue-book','telescope');await page.click('#harbor-action');await phase(page,'looking');
    const delta=await page.evaluate(async()=>{
      const T=await import('/vendor/three.module.js'),app=window.__marbleTransition,dir=app.camera.getWorldDirection(new T.Vector3());
      const boat=app.dreamScene.getObjectByName('Paper boat at sea').position.clone().sub(app.camera.position).normalize();
      const yaw=Math.atan2(boat.x,boat.z)-Math.atan2(dir.x,dir.z);
      return [Math.atan2(Math.sin(yaw),Math.cos(yaw)),Math.asin(boat.y)-Math.asin(dir.y)];
    });
    for(const [n,a,b] of [[delta[0],'ArrowLeft','ArrowRight'],[delta[1],'ArrowUp','ArrowDown']]){
      for(let i=0;i<Math.round(Math.abs(n)/.046);i++)await page.keyboard.press(n>0?a:b);
    }
    const visible=await visiblePixels(page,'Harbor note and folded paper boat');assert(visible>12,'offshore paper visibility: '+visible);
    const paper=await subject(page,'Paper boat at sea');
    assert(Math.hypot(paper.x-r.x-r.width/2,paper.y-r.y-r.height/2)<Math.min(r.width,r.height)*.47,'paper outside lens');
    await page.keyboard.press('Escape');

    await enter(page,'orange-book','bookmark');
    const canyon=await page.evaluate(()=>{
      const app=window.__marbleTransition,root=app.dreamScene.getObjectByName('Desktop island / orange-book');
      let faces=0,maxMap=0;
      root.traverseVisible(o=>{
        if(!o.isMesh)return;
        faces+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;
        maxMap=Math.max(maxMap,o.material.map?.image.width||0);
      });
      return {level:app.islands.find(e=>e.id==='orange-book').level,faces,maxMap};
    });
    assert(canyon.level==='hd'&&canyon.faces>=300000&&canyon.maxMap===4096,'close-up geometry and color atlas must actually be drawn');
    if(touch){await drag(await subject(page,'Woven orange bookmark'),0,75,true);await phase(page,'bookmark');await page.evaluate(async()=>{for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);});}
    const bookView=await view(page);
    await drag(await subject(page,'Woven orange bookmark'),1,75);await phase(page,'resting');
    assert.notDeepEqual(await view(page),bookView);
    await page.click('#harbor-action');await phase(page,'bookmark');await page.click('#harbor-exit');
    await enter(page,'phone','notification');
    const handset=await page.evaluate(async()=>{
      const T=await import('/vendor/three.module.js'),app=window.__marbleTransition;
      const phone=app.dreamScene.getObjectByName('Desktop island / phone');
      const frame=phone.getObjectByName('Brushed handset frame'),bounds=new T.Box2(),p=new T.Vector3();
      frame.traverseVisible(mesh=>{
        const vertices=mesh.geometry.attributes.position;
        for(let i=0;i<vertices.count;i++){
          p.fromBufferAttribute(vertices,i).applyMatrix4(mesh.matrixWorld).project(app.camera);
          bounds.expandByPoint(new T.Vector2(p.x,p.y));
        }
      });
      const thumb=phone.getObjectByName('Tidal port silence switch');
      const seat=phone.worldToLocal(thumb.getWorldPosition(p));
      const ray=new T.Raycaster(phone.localToWorld(new T.Vector3(-.5,seat.y,seat.z)),new T.Vector3(1,0,0).transformDirection(phone.matrixWorld));
      const edge=ray.intersectObject(frame,false)[0].point;
      return {limits:[bounds.min.x,bounds.min.y,bounds.max.x,bounds.max.y],width:bounds.max.x-bounds.min.x,
        switchGap:Math.abs(phone.worldToLocal(edge).x-seat.x),optics:!!frame.getObjectByName('Flush triple-camera back and front glass')};
    });
    assert(handset.optics&&handset.width>1&&handset.limits.every(v=>Math.abs(v)<.98),JSON.stringify(handset));
    assert(handset.switchGap<.006,'the silence switch must sit on the actual metal rail');
    await page.click('#port-sound');assert.equal(await page.getAttribute('#port-sound','aria-pressed'),'true');
    const toggle=await subject(page,'Tidal port silence switch');
    const swipe=await page.evaluate(async()=>{
      const T=await import('/vendor/three.module.js'),app=window.__marbleTransition;
      const mount=app.dreamScene.getObjectByName('Tidal port silence switch').parent;
      const a=mount.localToWorld(new T.Vector3(0,0,-.020)).project(app.camera);
      const b=mount.localToWorld(new T.Vector3(0,0,.020)).project(app.camera);
      const r=app.renderer.domElement.getBoundingClientRect();
      return new T.Vector2((b.x-a.x)*r.width,(a.y-b.y)*r.height).setLength(48).toArray();
    });
    await drag(toggle,...swipe);await phase(page,'quiet');
    await page.waitForFunction(()=>!window.__marbleTransition.dreamScene.getObjectByName('Work chat above tidal port').visible);
    await page.click('#harbor-exit');await enter(page,'phone','quiet');
    assert.equal(await page.getAttribute('#port-sound','aria-pressed'),'false');
    await page.locator('#world').focus();await page.keyboard.press('Enter');await phase(page,'notification');
    await page.keyboard.press('Escape');await page.click('#home');
    await page.waitForFunction(()=>!window.__marbleTransition.dreamScene.getObjectByName('Paper boat at sea').visible);
    assert.deepEqual(errors,[]);console.log(touch?'Touch':'Mouse','stories passed; visible paper pixels:',visible);
  }finally{await page.close();}
}
(async()=>{const browser=await launchBrowser();try{await tour(browser,false);await tour(browser,true);}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

// Exercise the world-space cup and paper with real mouse and touch input.
const assert=require('node:assert/strict');
const {launchBrowser,baseURL,chooseDestination}=require('./marble-browser.cjs');
const phase=(page,name)=>page.waitForSelector('#stage[data-harbor="'+name+'"]');
const camera=page=>page.evaluate(()=>window.__marbleTransition.state.camera);
async function subject(page,which){
  return page.evaluate(async which=>{
    const T=await import('/vendor/three.module.js'),app=window.__marbleTransition,r=app.renderer.domElement.getBoundingClientRect();
    const p=new T.Vector3();
    if(which==='cup'){
      const cup=app.objects.group.getObjectByName('cup-wall'),{cupOpening,cupRear}=cup.material.uniforms;
      const {x,y,w}=cupOpening.value;
      p.set(x+cupRear.value.x*.028,w-.004,y+cupRear.value.y*.028);
    }else{
      const mesh=app.dreamScene.getObjectByName('Harbor note and folded paper boat');
      mesh.localToWorld(p.set(.03,which==='boat'?.16:0,.08));
    }
    const world=p.toArray();
    p.project(app.camera);
    return {world,x:r.left+(1+p.x)*r.width/2,y:r.top+(1-p.y)*r.height/2};
  },which);
}
async function tour(browser,touch){
  const page=await browser.newPage(touch?{viewport:{width:390,height:844},hasTouch:true,isMobile:true,reducedMotion:'reduce'}:{viewport:{width:1280,height:800}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  try{
    await page.goto(baseURL+'/marble-transition-lab/index.html');
    await page.waitForSelector('#world[data-ready=true]',{timeout:90000});
    const source=await camera(page);
    await page.click('[data-progress="1"]');await page.waitForSelector('#stage[data-browsing=true]');
    let overview=await camera(page);
    if(touch){await chooseDestination(page,'cup');overview=await camera(page);await page.click('#enter-island-story');}
    else{
      const cup=await subject(page,'cup');await page.mouse.click(cup.x,cup.y);
      assert.equal(await page.locator('#destination-name').innerText(),'蓝杯港湾');
      await page.click('#enter-island-story');await phase(page,'approach');
    }
    await phase(page,'note');
    assert.equal(await page.locator('#harbor-ending').isVisible(),false);
    const note=await subject(page,'note');
    if(touch)await page.touchscreen.tap(note.x,note.y);else await page.mouse.click(note.x,note.y);
    await phase(page,'boat');
    const atShore=await subject(page,'boat');
    const tap=touch?()=>page.touchscreen.tap(atShore.x,atShore.y):()=>page.mouse.click(atShore.x,atShore.y);
    await tap();await phase(page,'boat');
    const client=touch?await page.context().newCDPSession(page):null;
    async function drag(dy,cancel=false){
      const {x,y}=await subject(page,'boat');
      if(touch){
        const send=(type,points)=>client.send('Input.dispatchTouchEvent',{type,touchPoints:points});
        await send('touchStart',[{x,y}]);
        for(let i=1;i<=8;i++)await send('touchMove',[{x,y:y+dy*i/8}]);
        await send(cancel?'touchCancel':'touchEnd',[]);
      }else{
        await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,y+dy,{steps:8});await page.mouse.up();
      }
    }
    await drag(30);await phase(page,'boat');
    if(touch){await drag(-70,true);await phase(page,'boat');}
    await page.waitForTimeout(450);await drag(-76);
    await phase(page,'sailing');
    assert.equal(await page.locator('#harbor-ending').isVisible(),false);
    await phase(page,'farewell');
    assert.equal(await page.locator('#harbor-ending').innerText(),'至少在这里，你可以下班了。');
    const far=await subject(page,'boat');
    assert(Math.hypot(far.world[0]-atShore.world[0],far.world[2]-atShore.world[2])>.11);
    await page.click('#harbor-exit');await phase(page,'desk');assert.deepEqual(await camera(page),overview);

    // Repeat from the selected berth and cancel during entry.
    await chooseDestination(page,'cup');await page.waitForTimeout(950);overview=await camera(page);await page.click('#enter-island-story');
    await page.keyboard.press('Escape');await phase(page,'desk');assert.deepEqual(await camera(page),overview);
    await chooseDestination(page,'cup');await page.click('#enter-island-story');await phase(page,'note');
    await page.keyboard.press('Enter');await phase(page,'boat');await page.keyboard.press('Space');await phase(page,'sailing');
    await page.keyboard.press('Escape');await phase(page,'desk');
    assert.equal(await page.locator('#harbor-ending').isVisible(),false);
    await page.click('#home');assert.deepEqual(await camera(page),source);
    assert.equal(await page.evaluate(()=>window.__marbleTransition.camera.near),.012);
    assert.deepEqual(errors,[]);
    console.log(touch?'Touch and reduced motion passed':'Mouse, continuous arrival and drift passed');
  }finally{await page.close();}
}
(async()=>{const browser=await launchBrowser();try{await tour(browser,false);await tour(browser,true);}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

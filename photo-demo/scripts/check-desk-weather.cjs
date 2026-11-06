// Check the physical rig, light and vapor through the same controls as a visitor.
const assert=require('node:assert/strict');
const {baseURL,launchBrowser}=require('./marble-browser.cjs');
const url=baseURL+'/marble-transition-lab/index.html';
async function pose(page){
  return page.evaluate(async()=>{
    const T=await import('/vendor/three.module.js'),t=window.__marbleTransition;
    const shade=t.dreamScene.getObjectByName('Tilted brushed-metal cylindrical shade');
    const bulb=shade.children.find(o=>o.material?.emissiveIntensity>1);
    const light=t.dreamScene.children.find(o=>o.isDirectionalLight);
    const pos=o=>o.getWorldPosition(new T.Vector3());
    const dir=pos(light).sub(pos(light.target)).normalize();
    const canvas=t.renderer.domElement.getBoundingClientRect(),p=pos(shade).project(t.camera);
    return {handle:[canvas.x+(1+p.x)*canvas.width/2,canvas.y+(1-p.y)*canvas.height/2],
      lamp:pos(shade).toArray(),phase:Number(document.querySelector('#lamp-position').value),
      clock:document.querySelector('#lamp-time').value,view:t.state.camera,
      direction:dir.toArray(),color:light.color.toArray(),shadow:light.shadow.matrix.toArray(),
      aligned:bulb?new T.Vector3(0,1,0).transformDirection(shade.matrixWorld).dot(dir):null};
  });
}
async function visibleVapor(page){
  return page.evaluate(async()=>{
    const t=window.__marbleTransition,cloud=t.dreamScene.getObjectByName('Downwind cumulus'),steam=t.dreamScene.getObjectByName('Warm filaments over coffee');
    const c=document.createElement('canvas');c.width=640;c.height=Math.round(c.width*t.renderer.domElement.height/t.renderer.domElement.width);
    const ctx=c.getContext('2d',{willReadFrequently:true});
    async function snap(){
      t.setProgress(1);
      for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);
      ctx.drawImage(t.renderer.domElement,0,0,c.width,c.height);return ctx.getImageData(0,0,c.width,c.height).data;
    }
    const full=await snap(),counts={};
    for(const object of [cloud,steam]){
      object.visible=false;const empty=await snap();object.visible=true;
      let changed=0;
      for(let i=0;i<full.length;i+=4)if(Math.max(...[0,1,2].map(k=>Math.abs(full[i+k]-empty[i+k])))>=3)changed++;
      counts[object.name]=changed;
    }
    await snap();return counts;
  });
}
async function checkFiniteLight(page){
  // The modeled buffer is half float. An invalid edge sample on the lamp's
  // soft beam would propagate through the mip chain into black sea reflections.
  const invalid=await page.evaluate(async()=>{
    const t=window.__marbleTransition,scene=t.dreamScene,r=t.renderer,previous=scene.onAfterRender;
    let target;
    scene.onAfterRender=function(...args){
      previous.apply(this,args);
      if(!this.overrideMaterial && r.getRenderTarget())target=r.getRenderTarget();
    };
    try{
      t.setProgress(1);for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);
      const pixels=new Uint16Array(target.width*target.height*4);
      r.readRenderTargetPixels(target,0,0,target.width,target.height,pixels);
      return pixels.reduce((n,h)=>n+Number((h&0x7c00)===0x7c00),0);
    }finally{scene.onAfterRender=previous;}
  });
  assert.equal(invalid,0,'non-finite half-float light samples');
}
async function tour(browser,mobile){
  const page=await browser.newPage(mobile?{viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2,reducedMotion:'reduce'}:
    {viewport:{width:1280,height:880},reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  try{
    await page.goto(url);await page.waitForSelector('#world[data-ready=true]');
    assert(await page.locator('#daylight-tools').isHidden());
    assert.equal(await page.evaluate(()=>window.__marbleTransition.dreamScene.getObjectByName('Coffee steam condensing into clouds').children.length),0);
    await page.click('[data-progress="1"]');await page.waitForSelector('#stage[data-browsing=true]');
    const slider=page.locator('#lamp-position');await slider.focus();await slider.press('Home');await page.waitForTimeout(600);
    const morning=await pose(page);assert.equal(morning.clock,'06:00');
    const [x,y]=morning.handle,box=await page.locator('#world').boundingBox();
    assert(y>box.y && y<box.y+box.height && x>box.x && x<box.x+box.width,'grab point must be on screen');
    const dx=box.width*.55;
    if(mobile){
      const session=await page.context().newCDPSession(page);
      const touch=(type,points)=>session.send('Input.dispatchTouchEvent',{type,touchPoints:points});
      await touch('touchStart',[{x,y}]);
      for(let i=1;i<=8;i++)await touch('touchMove',[{x:x+dx*i/8,y}]);
      await touch('touchEnd',[]);await session.detach();
    }else{
      await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y,{steps:14});await page.mouse.up();
    }
    await page.waitForTimeout(200);const dragged=await pose(page);
    assert(dragged.phase>700,'direct drag must move the lamp '+JSON.stringify({morning,dragged}));
    assert.deepEqual(dragged.view,morning.view,'lamp drag must leave the camera in place');
    await slider.focus();await slider.press('End');await page.waitForTimeout(240);const evening=await pose(page);
    assert.equal(evening.clock,'18:00');assert(morning.direction[0]>.3 && evening.direction[0]<-.3);
    assert(evening.aligned>.99 && morning.aligned>.99,'sun must follow the lamp axis');
    assert.notDeepEqual(morning.shadow,evening.shadow);assert.notDeepEqual(morning.color,evening.color);
    if(!mobile)await checkFiniteLight(page);
    const counts=await visibleVapor(page);console.log(mobile?'mobile':'desktop',counts);
    assert(counts['Downwind cumulus']>100 && counts['Warm filaments over coffee']>10);
    const time=()=>page.evaluate(()=>window.__marbleTransition.dreamScene.getObjectByName('Downwind cumulus').material.uniforms.clock.value);
    const held=await time();await page.waitForTimeout(220);assert.equal(await time(),held);
    await page.click('#reduce-motion');await page.waitForTimeout(350);assert((await time())>held+.1);
    await page.click('#home');assert(await page.locator('#daylight-tools').isHidden());
    await page.waitForFunction(()=>!window.__marbleTransition.dreamScene.getObjectByName('Coffee steam condensing into clouds').visible);
    assert.deepEqual(errors,[]);
  }finally{await page.close();}
}
(async()=>{const browser=await launchBrowser();try{await tour(browser,false);await tour(browser,true);}finally{await browser.close();}})()
  .catch(e=>{console.error(e);process.exitCode=1;});

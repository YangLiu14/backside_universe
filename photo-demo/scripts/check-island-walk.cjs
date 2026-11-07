const assert=require('node:assert/strict');
const {baseURL,launchBrowser}=require('./marble-browser.cjs');
const url=baseURL+'/marble-transition-lab/index.html';
const state=page=>page.evaluate(()=>window.__marbleTransition.state);
const walk=page=>page.evaluate(()=>window.__marbleTransition.state.walk);
const arrived=(page,id)=>page.waitForFunction(id=>window.__marbleTransition?.state.walk?.id===id,id,{timeout:30000});

// The cave's generated shell has no authored vertex normals. Collision can
// pass even when an invalid material turns the entire stairway black.
async function checkStairView(page){
  const lit=await page.evaluate(async()=>{
    await new Promise(requestAnimationFrame);
    const canvas=document.createElement('canvas');canvas.width=64;canvas.height=36;
    const ctx=canvas.getContext('2d');ctx.drawImage(document.querySelector('#world'),0,0,64,36);
    const pixels=ctx.getImageData(16,12,32,20).data;
    let count=0;
    for(let i=0;i<pixels.length;i+=4)if(pixels[i]+pixels[i+1]+pixels[i+2]>70)count++;
    return count/(32*20);
  });
  assert(lit>.65,'stone treads should be visible from the first-person entrance');
}

async function testGround(page){
  const result=await page.evaluate(async()=>{
    const T=await import('/vendor/three.module.js');
    const {createIslandWalk}=await import('/marble-transition-lab/island-walk.js');
    const model=new T.Group(),mat=new T.MeshBasicMaterial();
    function block(x,y,z,w,h,d){
      const m=new T.Mesh(new T.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);model.add(m);
    }
    block(0,-.1,1,3,.2,2);block(0,.02,-.25,3,.40,.5);
    block(0,.12,-.75,3,.64,.5);block(0,.20,-1.5,3,.8,1);
    block(0,1.4,-1.95,3,2,.1);
    const camera=new T.PerspectiveCamera(),controller=new AbortController();
    const w=await createIslandWalk({id:'office',camera,model,sea:()=>-Infinity,aspect:()=>1.5,reduced:()=>true,signal:controller.signal,
      spawn:{start:new T.Vector3(0,0,1.4),aim:new T.Vector3(0,0,-2)}});
    function steps(key,n){w.clear();w.key(key,true);for(let i=0;i<n;i++)w.tick(1/60);return w.state.foot;}
    const up=steps('w',250),down=steps('s',230),edge=steps('a',240);
    return {up,down,edge};
  });
  assert(Math.abs(result.up[1]-.60)<.001&&result.up[2]>-1.90,'climb treads and stop in front of the wall');
  assert(Math.abs(result.down[1])<.001&&result.down[2]<=2.14,'descend and stop at the drop');
  assert(result.edge[0]>=-1.65,'stay on the edge of the walkable surface');
}
async function checkCaveRoute(page){
  const result=await page.evaluate(async route=>{
    const T=await import('/vendor/three.module.js');
    const {createIslandWalk}=await import('/marble-transition-lab/island-walk.js');
    const app=window.__marbleTransition,model=app.grotto.root;
    const points=route.map(p=>new T.Vector3(...p).applyMatrix4(model.matrixWorld));
    const walker=await createIslandWalk({id:'grotto',camera:app.camera.clone(),model,sea:()=>-Infinity,
      aspect:()=>1.5,reduced:()=>true,signal:new AbortController().signal,
      spawn:{start:points[0],aim:points[1]}});
    const begin=walker.state.foot[1],distances=[];
    for(const target of points.slice(1)){
      walker.key('w',true);
      for(let i=0;i<3000;i++){
        const s=walker.state,dx=target.x-s.foot[0],dz=target.z-s.foot[2];
        if(Math.hypot(dx,dz)<s.height*.025)break;
        const delta=Math.atan2(-dx,-dz)-s.yaw;
        walker.look(-delta/.004,0);walker.tick(1/120);
      }
      walker.clear();
      const s=walker.state;distances.push(Math.hypot(target.x-s.foot[0],target.z-s.foot[2])/s.height);
    }
    return {distances,rise:(walker.state.foot[1]-begin)/walker.state.height};
  },[
    [0.22235,-0.334315,-0.947747],
    [0.179644,-0.305329,-0.869282],
    [0.176102,-0.300929,-0.862595],
    [0.162661,-0.293772,-0.852936],
    [0.152781,-0.28876,-0.849796],
    [-0.041338,-0.162824,-0.850301],
    [-0.051259,-0.16276,-0.847531],
    [-0.05289,-0.16276,-0.814914],
    [-0.027437,-0.152889,-0.799803],
    [0.169226,-0.07176,-0.800102],
    [0.173937,-0.07176,-0.763892],
    [0.160479,-0.066714,-0.754391],
    [0.085767,-0.03476,-0.752545],
    [0.067879,-0.033977,-0.720697],
    [0.051615,-0.033928,-0.721521]
  ]);
  assert(result.distances.every(d=>d<.04),'walk continuously from the stone shore through every stair landing and balcony opening');
  assert(result.rise>8,'reach the raised bookroom terrace on foot');
}

async function desktop(browser){
  const page=await browser.newPage({viewport:{width:1280,height:880},reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  try{
    await page.goto(url);await page.waitForSelector('#office-walk');await testGround(page);
    const office=await state(page);await page.click('#office-walk');await arrived(page,'office');
    const start=await walk(page);await page.keyboard.down('w');await page.waitForTimeout(400);await page.keyboard.up('w');
    assert((await walk(page)).foot[2]<start.foot[2]-.15);await page.keyboard.press('Escape');
    assert.deepEqual((await state(page)).camera,office.camera);
    await page.click('[data-progress="1"]');await page.waitForFunction(()=>window.__marbleTransition.islands.every(e=>e.amount===1));
    const desk=await state(page);await page.click('#walk-start');
    for(const id of ['orange-book','cup','blue-book','phone','reef','grotto']){
      if(id!=='orange-book')await page.selectOption('#walk-place',id);
      await arrived(page,id);await page.locator('#world').focus();
      if(id==='grotto')await checkStairView(page);
      const at=await walk(page);await page.keyboard.down('w');
      await page.waitForFunction(({at,id})=>{
        const w=window.__marbleTransition.state.walk;
        return Math.hypot(w.foot[0]-at.foot[0],w.foot[2]-at.foot[2])>at.height*.40&&
          (!['orange-book','cup','grotto'].includes(id)||w.foot[1]>at.foot[1]+at.height*.16);
      },{at,id},{timeout:8000});
      await page.keyboard.up('w');
      if(id==='orange-book'){
        const high=await walk(page);await page.keyboard.down('s');
        await page.waitForFunction(h=>window.__marbleTransition.state.walk.foot[1]<h.foot[1]-h.height*.11,high,{timeout:6000});
        await page.keyboard.up('s');
      }
    }
    await checkCaveRoute(page);
    await page.click('#walk-story');await page.waitForSelector('#world[data-visit="terrace"][data-visit-busy="false"]');
    await page.click('[data-visit-action="enter"]');await page.waitForSelector('#world[data-visit="inside"][data-visit-busy="false"]');
    await page.click('[data-visit-action="desktop"]');await page.waitForSelector('#stage[data-browsing="true"]');
    assert.deepEqual((await state(page)).camera,desk.camera);assert.deepEqual(errors,[]);
    console.log('Office, five islands, reef, complete harbor-to-bookroom stair route, wall/ledge collision and room entry passed.');
  }finally{await page.close();}
}

async function touch(browser){
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  try{
    await page.goto(url+'?progress=1');await page.waitForSelector('#stage[data-browsing="true"]');
    const desk=await state(page);await page.tap('#walk-start');await arrived(page,'orange-book');
    const button=await page.locator('#visit-move-pad [data-walk=w]').boundingBox(),canvas=await page.locator('#world').boundingBox();
    const client=await page.context().newCDPSession(page);
    const finger={x:button.x+button.width/2,y:button.y+button.height/2,id:1};
    const gesture=(type,points)=>client.send('Input.dispatchTouchEvent',{type,touchPoints:points});
    const from=await walk(page);
    await gesture('touchStart',[finger]);await page.waitForTimeout(430);
    const look={x:canvas.x+canvas.width*.30,y:canvas.y+canvas.height*.45,id:2};
    await gesture('touchStart',[finger,look]);await gesture('touchMove',[finger,{...look,x:look.x+42}]);await gesture('touchEnd',[]);
    const to=await walk(page);assert(Math.abs(to.yaw-from.yaw)>.05);
    assert(Math.hypot(to.foot[0]-from.foot[0],to.foot[2]-from.foot[2])>from.height*.08);
    await page.tap('#walk-exit');assert.deepEqual((await state(page)).camera,desk.camera);
    console.log('Touch movement and simultaneous drag-to-look passed.');
  }finally{await page.close();}
}
(async()=>{const browser=await launchBrowser();try{await desktop(browser);await touch(browser);}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

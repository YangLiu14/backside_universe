const assert=require('node:assert/strict');
const path=require('node:path');

const {changedPixels}=require('../../pipeline/qa/effects.cjs');
const {observeScenes,furnitureClearance}=require('../../pipeline/qa/clearance.cjs');

const orbit={range:'orbit',turn:'turn',state:'dinnerState',pose:'eye',handoff:[.17,.30]};
async function check(page,device,viewport,out,url,coldOrbit){
  const state=()=>page.evaluate(()=>window.dinnerState());
  const ready=()=>page.waitForFunction(()=>window.dinnerState?.().splats>0,null,{timeout:120000});
  const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const shot=label=>page.screenshot({path:path.join(out,device+'-'+label+'.jpg'),type:'jpeg',quality:94});
  const seek=async n=>{await page.locator('#orbit').fill(String(n));await settle();};
  await ready();
  const manifest=await page.evaluate(()=>fetch('scene.json').then(r=>r.json()));
  const foodModels=['dish','pork','greens','fish'].filter(role=>manifest.props.includes(role)).map(role=>manifest.models[role]);
  assert(foodModels.every(model=>model?.provider==='Hi3D'&&model.task&&model.source_sha256));
  assert.equal(new Set(foodModels.map(m=>m.task)).size,foodModels.length);
  assert.equal(new Set(foodModels.map(m=>m.source_sha256)).size,foodModels.length);
  assert.equal((await state()).opening,false);
  await shot('front');
  assert.equal(coldOrbit.roomsOpened,1);
  let lastEye;
  for(const p of [230,255,280,305,330,355,380]){
    await seek(p);const {eye}=await state();
    if(lastEye)assert(Math.hypot(...eye.map((n,i)=>n-lastEye[i]))>.002,'camera must keep moving through the photo handoff');
    lastEye=eye;
  }
  await seek(0);
  const mid=new Map();
  for(const [n,label] of [[110,'gaussian'],[230,'handoff'],[450,'mesh'],[750,'right-ear'],[1000,'cutaway']]){
    await seek(n);mid.set(n,(await state()).matrix);
    if(device==='desktop' && n!==1000)await shot(label);
  }
  const open=await state();assert(open.opening);assert.match(await page.locator('#subtitle').textContent(),/凳子/);assert.equal(open.sticks,0);await shot('cutaway');
  await page.locator('#explore').click();
  await page.waitForFunction(()=>window.dinnerState().phase==='explore');
  await page.waitForTimeout(800);
  const inside=await state();
  assert.deepEqual(inside.plates.map(p=>p.dish),['dish','pork','greens','fish']);
  const rect=await page.locator('#stage').boundingBox();
  const cx=rect.x+rect.width*.52,cy=rect.y+rect.height*.47;
  const dist=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
  async function checkMouseLook(){
    await page.mouse.move(cx,cy);await page.mouse.down();
    const start=(await state()).matrix;
    await page.mouse.move(cx+rect.width*.08,cy-rect.height*.08,{steps:4});await settle();
    const turned=(await state()).matrix;
    await page.mouse.move(cx,cy,{steps:4});await page.mouse.up();await settle();
    const end=(await state()).matrix;
    // Project the new forward vector onto the old camera's right and up axes.
    const component=(view,basis,axis)=>-(view[8]*basis[axis]+view[9]*basis[axis+1]+view[10]*basis[axis+2]);
    assert(component(turned,start,0)>.12,'drag right should look right');
    assert(component(turned,start,4)>.09,'drag up should look up');
    assert(component(end,turned,0)<-.12,'drag left should look left');
    assert(component(end,turned,4)<-.09,'drag down should look down');
  }
  async function checkMouseHeight(){
    const start=await state(), y=start.walkPosition[1];
    await page.evaluate(()=>{
      window.heightMenuPrevented=false;
      document.addEventListener('contextmenu',e=>{window.heightMenuPrevented=e.defaultPrevented;},{once:true});
    });
    await page.mouse.move(cx,cy);await page.mouse.down({button:'right'});
    await page.mouse.move(cx+rect.width*.12,cy-rect.height*.10,{steps:4});
    await page.waitForFunction(y=>window.dinnerState().walkPosition[1]>y+.07,y);
    const raised=await state();
    await page.mouse.move(cx-rect.width*.12,cy+rect.height*.10,{steps:4});
    await page.waitForFunction(y=>window.dinnerState().walkPosition[1]<y-.07,y);
    const lowered=await state();
    await page.mouse.move(cx,cy,{steps:4});await page.mouse.up({button:'right'});
    await page.mouse.move(cx,cy-rect.height*.13);
    await page.waitForFunction(y=>Math.abs(window.dinnerState().walkPosition[1]-y)<.003,y);
    for(const pose of [raised,lowered,await state()]){
      assert.equal(pose.phase,start.phase);
      assert.equal(pose.walkPosition[0],start.walkPosition[0]);assert.equal(pose.walkPosition[2],start.walkPosition[2]);
      assert(dist(pose.matrix.slice(0,12),start.matrix.slice(0,12))<1e-6,'right drag must preserve camera orientation');
    }
    assert(await page.evaluate(()=>window.heightMenuPrevented),'indoor right drag should suppress the context menu');
  }
  if(device==='mobile'){
    const cdp=await page.context().newCDPSession(page);
    async function stick(name,dx,dy){
      const pad=await page.locator('[data-stick="'+name+'"]').boundingBox();assert(pad);
      const x=pad.x+pad.width/2,y=pad.y+pad.height/2;
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx,y:y+dy}]});
      await page.waitForTimeout(300);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    }
    await stick('move',28,0);assert(dist((await state()).eye,inside.eye)>.035);
    const moved=await state();await stick('look',24,-9);
    assert(dist((await state()).matrix,moved.matrix)>.06);
  }else{
    await page.keyboard.down('d');await page.waitForTimeout(360);await page.keyboard.up('d');
    const moved=await state();assert(dist(moved.eye,inside.eye)>.05);
    await checkMouseLook();await checkMouseHeight();
    await page.mouse.wheel(0,-95);await settle();assert(dist((await state()).eye,moved.eye)>.04);
  }
  await shot('walk');
  const standing=await state();await page.locator('#height').click();
  await page.waitForFunction(y=>window.dinnerState().walkPosition[1]<y-.27,standing.walkPosition[1]);
  await page.locator('#height').click();
  await page.waitForFunction(()=>window.dinnerState().walkPosition[1]>.91);
  await page.locator('#back').click();await settle();
  assert.deepEqual((await state()).matrix,open.matrix);assert(await page.locator('#pull').isVisible());
  await seek(450);assert.deepEqual((await state()).matrix,mid.get(450));
  await seek(0);assert.equal((await state()).opening,false);
  const x=viewport.width*.79,y=viewport.height*.45;
  if(device==='mobile'){
    const cdp=await page.context().newCDPSession(page);
    for(const [type,points] of [['touchStart',[{x,y}]],['touchMove',[{x:viewport.width*.04,y}]],['touchEnd',[]]]){
      await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points});
    }
    await settle();assert((await state()).progress>=.985);
    await page.locator('#sound').tap();assert((await state()).muted);
    const at=(await state()).stoolScreen;
    for(const [type,pts] of [['touchStart',[{x:at[0],y:at[1]}]],['touchMove',[{x:at[0],y:at[1]+31}]],['touchEnd',[]]]){
      await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts});
    }
  }else{
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(viewport.width*.05,y,{steps:20});await page.mouse.up();
    assert((await state()).progress>=.985);
    const pt=(await state()).stoolScreen;await page.mouse.click(...pt);
  }
  await page.waitForFunction(()=>window.dinnerState().phase==='seated',null,{timeout:7000});
  const seated=await state();assert.equal(seated.sticks,2);assert(seated.stoolZ>open.stoolZ+.35);
  assert(seated.lookDirection[1]<-.28,'seated view should look down onto the meal');
  assert(seated.plates.every(({screen:[x,y]})=>x>rect.x&&x<rect.x+rect.width&&y>rect.y&&y<rect.y+rect.height));
  await shot('seated');assert.match(await page.locator('#subtitle').textContent(),/再添一双筷子/);
  if(device==='desktop'){await checkMouseLook();await checkMouseHeight();}
  await page.locator('#stage').press('ArrowRight',{delay:200});await settle();
  assert(dist((await state()).matrix,seated.matrix)>.06);
  await page.locator('#stage').press('Enter');assert.equal((await state()).sticks,2);
  await page.locator('#back').click();await settle();
  const restored=await state();assert.equal(restored.sticks,0);assert.deepEqual(restored.matrix,open.matrix);
  await page.locator('#again').press('Enter');await page.waitForFunction(()=>window.dinnerState().phase==='seated',null,{timeout:7000});
  assert.equal((await state()).sticks,2);
  await page.locator('#stage').press('Escape');await seek(0);
  assert.equal((await state()).opening,false);assert.equal((await state()).sticks,0);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const animation={};
  if(device==='desktop'){
    await observeScenes(page);
    await page.goto(url+'/?film');await ready();
    await shot('clean-front');await page.locator('#stage').press('End');await settle();await shot('clean-cutaway');
    const layout={obstacle:'dinner-table',subjects:['pull-stool','side-stool','window-stool'],margin:.015};
    const tucked=await furnitureClearance(page,layout);
    await page.locator('#stage').press('Enter');await page.waitForFunction(()=>window.dinnerState().phase==='seated');await shot('clean-seated');
    await furnitureClearance(page,layout,tucked);
    animation.stoolSweep={subjects:layout.subjects,clearance:layout.margin};
    await page.locator('#stage').press('Escape');
    await page.locator('#explore').evaluate(button=>button.click());
    await page.waitForTimeout(880);
    const w=viewport.width,h=viewport.height;
    async function lookAt(x,y,z){
      const {walkPosition:[px,py,pz],lookDirection:[dx,dy,dz]}=await state();
      const yaw=Math.atan2(x-px,pz-z)-Math.atan2(dx,-dz);
      const dxPixels=Math.atan2(Math.sin(yaw),Math.cos(yaw))*w/3.8;
      const dyPixels=-(Math.atan2(y-py,Math.hypot(x-px,z-pz))-Math.asin(dy))*h/2.25;
      const steps=Math.max(1,Math.ceil(Math.max(Math.abs(dxPixels)/w,Math.abs(dyPixels)/h)/.28));
      for(let i=0;i<steps;i++){
        await page.mouse.move(w*.5,h*.46);await page.mouse.down();
        await page.mouse.move(w*.5+dxPixels/steps,h*.46+dyPixels/steps,{steps:3});await page.mouse.up();
      }
      await settle();
    }
    async function approach(x,z){
      await lookAt(x,(await state()).walkPosition[1],z);
      await page.keyboard.down('w');
      try{await page.waitForFunction(([x,z])=>{
        const pos=window.dinnerState().walkPosition;return Math.hypot(pos[0]-x,pos[2]-z)<.047;
      },[x,z],{timeout:10000});}finally{await page.keyboard.up('w');}
    }
    // Compare image pixels with the camera stationary to catch a frozen shader
    // or a plume hidden under the tabletop, even if the animation clock ticks.
    // Inspect the wooden legs and cane seat together from a reachable crouch.
    await page.locator('#height').evaluate(button=>button.click());
    await page.waitForFunction(()=>window.dinnerState().walkPosition[1]<.45);
    await lookAt(.26,.28,-.59);await shot('clean-stools');
    await page.keyboard.down('e');
    try{await page.waitForFunction(()=>window.dinnerState().walkPosition[1]>1.302);}finally{await page.keyboard.up('e');}
    await page.waitForTimeout(700);
    await lookAt(-.035,.88,-.105);await shot('clean-supper');
    const plates=(await state()).plates;
    assert(plates.every(({screen:[x,y]})=>x>32&&x<w-32&&y>40&&y<h-25));
    const [fishX,fishY]=plates.find(p=>p.dish==='fish').screen;
    animation.steamPixels=await changedPixels(page,async()=>(await state()).matrix,fishX-38,fishY-100,76,76);
    assert(animation.steamPixels>25,'hot fish should visibly steam');
    await approach(-.69,.62);await approach(-.67,-.34);
    await lookAt(-.31,1.005,-.895);await shot('clean-window');
    const [glassX,glassY]=(await state()).windowScreen;
    animation.rainPixels=await changedPixels(page,async()=>(await state()).matrix,glassX+35,glassY-14,112,82);
    assert(animation.rainPixels>40,'window rain should move in the rendered image');
  }
  return {device,viewport,splats:seated.splats,stoolTravel:seated.stoolZ-open.stoolZ,
    freeWalk:true,eyeHeight:true,seatedLook:true,chopsticksAtSeat:seated.sticks,sourceHidesOpening:true,returnMatches:true,repeat:true,muted:seated.muted,
    dishes:inside.plates.map(p=>p.dish),independentHi3DDishes:foodModels.length,...animation};
}
module.exports={check,orbit};

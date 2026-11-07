const assert=require('node:assert/strict');
const {baseURL,launchBrowser}=require('./marble-browser.cjs');
const url=baseURL+'/marble-transition-lab/index.html?progress=1';
const walker=page=>page.evaluate(()=>window.__marbleTransition.state.walk);
const rooms=[
  ['cup','post'],['blue-book','field'],['blue-book','watch'],['orange-book','inn-hall'],
  ['orange-book','inn-loft'],['phone','baths'],['phone','slip'],['grotto','beacon'],
];

async function approach(page,island,key){
  if((await walker(page))?.id!==island)await page.selectOption('#walk-place',island);
  await page.waitForFunction(id=>window.__marbleTransition.state.walk?.id===id,island);
  if(await page.locator('#walk-room-choice').isVisible())await page.selectOption('#walk-room-choice',key);
  const button=page.locator('#walk-room');
  if((await button.innerText()).startsWith('前往'))await button.click();
  await page.waitForFunction(()=>!document.querySelector('#walk-room').disabled&&document.querySelector('#walk-room').textContent.startsWith('进入'));
  return walker(page);
}

async function testRoutes(page){
  // Drive the same capsule and collision meshes as a visitor. Cross each top
  // landing, turn, descend and return to the front door without relocating.
  const routes=await page.evaluate(async()=>{
    const T=await import('/vendor/three.module.js');
    const {createIslandWalk}=await import('/marble-transition-lab/island-walk.js');
    const {buildIslandInterior}=await import('/marble-transition-lab/island-interiors.js');
    const results=[];
    for(const id of ['field','inn','beacon']){
      const room=buildIslandInterior(id,null);
      const walk=await createIslandWalk({id:'interior',model:room.model,camera:new T.PerspectiveCamera(),
        sea:()=>-Infinity,aspect:()=>1.7,reduced:()=>true,signal:new AbortController().signal,
        spawn:{start:new T.Vector3(0,0,-.88),aim:new T.Vector3(0,0,-3)}});
      let points;
      if(id==='beacon'){
        points=Array.from({length:28},(_,i)=>{const a=.26+i*.195;return [1.72*Math.sin(a),-2.4+1.72*Math.cos(a)];});
      }else{
        const x=id==='field'?2.36:2.81,z=id==='field'?-4.59:-5.8;
        points=[[0,-.42],[x,-.42],[x,z],[id==='field'?1.4:.5,z]];
      }
      const rise=[],errors=[];
      for(const [x,z] of [...points,...points.slice(0,-1).reverse(),[0,-.83]]){
        walk.clear();walk.key('w',true);
        for(let i=0;i<700;i++){
          const {foot,yaw}=walk.state,dx=x-foot[0],dz=z-foot[2];
          if(Math.hypot(dx,dz)<.032)break;
          walk.look(-(Math.atan2(-dx,-dz)-yaw)/.004,0);walk.tick(1/120);
        }
        const [px,py,pz]=walk.state.foot;errors.push(Math.hypot(x-px,z-pz));rise.push(py);
      }
      results.push({id,maxError:Math.max(...errors),top:rise[points.length-1],bottom:rise.at(-1)});room.dispose();
    }
    return results;
  });
  for(const r of routes){
    assert(r.maxError<.04,JSON.stringify(r));assert(Math.abs(r.top-({field:2.58,inn:2.85,beacon:3.45})[r.id])<.02,JSON.stringify(r));
    assert(Math.abs(r.bottom)<.06,JSON.stringify(r));
  }
}

async function main(){
  const browser=await launchBrowser(),errors=[];
  try{
    const page=await browser.newPage({viewport:{width:1280,height:880},reducedMotion:'reduce'});
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto(url);await page.click('#walk-start');
    await approach(page,'cup','post');
    let intercepted,release;
    const arrived=new Promise(r=>{intercepted=r;}),hold=new Promise(r=>{release=r;});
    const delay=async route=>{intercepted();await hold;await route.continue();};
    await page.route('**/island-interiors.js',delay);
    await page.click('#walk-room');await arrived;await page.keyboard.press('Escape');release();
    await page.waitForFunction(()=>!document.querySelector('#walk-room').disabled);
    assert.equal((await walker(page)).room,null);await page.unroute('**/island-interiors.js',delay);
    for(const [island,key] of rooms){
      const entry=await approach(page,island,key);
      if(key==='post'){
        await page.locator('#world').focus();
        const point=await page.evaluate(async()=>{
          const T=await import('/vendor/three.module.js'),app=window.__marbleTransition;
          const p=app.dreamScene.getObjectByName('海风邮局 / 门槛').localToWorld(new T.Vector3(0,1.42,.12)).project(app.camera);
          const rect=document.querySelector('#world').getBoundingClientRect();
          return [rect.left+(p.x+1)*.5*rect.width,rect.top+(1-p.y)*.5*rect.height];
        });
        await page.mouse.click(...point);
      }else if(key==='watch'){await page.locator('#world').focus();await page.keyboard.press('e');}
      else await page.click('#walk-room');
      await page.waitForFunction(()=>window.__marbleTransition.state.walk?.room&&!document.querySelector('#walk-room').disabled);
      const inside=await walker(page);
      assert.equal(inside.room,key.startsWith('inn-')?'inn':key);assert.equal(inside.entrance,key);
      assert(Math.abs(inside.foot[1]-(key==='inn-loft'?2.85:0))<.07,key+' threshold');
      await page.locator('#world').focus();
      if(key==='post'){
        await page.keyboard.down('s');
        try{await page.waitForFunction(()=>!window.__marbleTransition.state.walk.room,null,{timeout:5000});}
        finally{await page.keyboard.up('s');}
      }else if(key==='inn-hall'){
        // Arrive from the canyon at the dining-room door; leave the same
        // building on the upper terrace after walking up its staircase.
        for(const [key,index,limit,decreasing] of [['s',2,-.65,false],['d',0,2.67,false],['w',2,-5.11,true]]){
          await page.keyboard.down(key);
          try{await page.waitForFunction(([i,n,neg])=>{const p=window.__marbleTransition.state.walk.foot[i];return neg?p<n:p>n;},
            [index,limit,decreasing],{timeout:9000});}
          finally{await page.keyboard.up(key);}
        }
        assert(Math.abs((await walker(page)).foot[1]-2.85)<.02);await page.click('#walk-room');
      }else{
        await page.keyboard.down(key==='beacon'?'d':'w');
        try{await page.waitForFunction(f=>{const s=window.__marbleTransition.state.walk;
          return Math.hypot(s.foot[0]-f[0],s.foot[2]-f[2])>.105;},inside.foot,{timeout:5000});}
        finally{await page.keyboard.up(key==='beacon'?'d':'w');}
        if(key==='slip')await page.click('#walk-room');else await page.keyboard.press('Escape');
      }
      await page.waitForFunction(()=>!window.__marbleTransition.state.walk?.room&&!document.querySelector('#walk-room').disabled);
      const back=await walker(page);assert.equal(back.id,island);
      assert.equal(back.entrance,key==='inn-hall'?'inn-loft':key);
      if(key==='inn-hall')assert(back.foot[1]>entry.foot[1]+entry.height,'upper canyon terrace');
      else assert(Math.hypot(...back.foot.map((v,i)=>v-entry.foot[i]))<entry.height*.25,key+' exterior sill');
    }
    await testRoutes(page);
    await approach(page,'grotto','library');await page.click('#walk-room');
    await page.waitForSelector('#world[data-visit="inside"][data-visit-busy="false"]');
    await page.click('[data-visit-action="read"]');await page.waitForSelector('#world[data-visit="book"][data-visit-busy="false"]');
    await page.click('[data-visit-action="photo"]');await page.waitForFunction(()=>window.__marbleTransition.state.progress===0&&window.__marbleTransition.state.visit.cycles===1);
    await page.close();
    const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'no-preference'});
    mobile.on('pageerror',e=>errors.push(e.message));
    await mobile.goto(url);await mobile.tap('#walk-start');await approach(mobile,'phone','baths');
    await mobile.tap('#walk-room');
    await mobile.waitForFunction(()=>window.__marbleTransition.state.walk?.room==='baths'&&!document.querySelector('#walk-room').disabled);
    assert(await mobile.locator('#visit-move-pad').isVisible());await mobile.tap('#walk-room');
    await mobile.waitForFunction(()=>!window.__marbleTransition.state.walk?.room&&!document.querySelector('#walk-room').disabled);
    assert(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await mobile.close();
    assert.deepEqual(errors,[]);
    console.log('Eight island entrances, three stair round trips, walk-through exits, original library photo loop, touch and cancellation passed.');
  }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});

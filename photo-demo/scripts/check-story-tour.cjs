const assert=require('node:assert/strict');
const {baseURL,launchBrowser}=require('./marble-browser.cjs');
const url=baseURL+'/marble-transition-lab/index.html';
async function waitLabel(page,text){
  try{
    await page.waitForFunction(text=>document.querySelector('#tour-label').textContent===text&&document.querySelector('#tour-next').getAttribute('aria-disabled')==='false',text,{timeout:30000});
  }catch(error){
    const seen=await page.locator('#story-tour').innerText();
    throw Error('Expected “'+text+'”, saw “'+seen+'”',{cause:error});
  }
}
// Observe actual painted scene state across the approach, the quiet beat on
// arrival and the pop. Sampling starts before the navigation click.
async function sampleNotification(page){
  await page.evaluate(()=>{
    window.notificationFrames=new Promise(resolve=>{
      const frames=[];
      function sample(){
        const stage=document.querySelector('#stage'),phase=stage.dataset.harbor;
        if(stage.dataset.islandStory==='phone'){
          const card=window.__marbleTransition.dreamScene.getObjectByName('Work chat above tidal port');
          frames.push({phase,ms:performance.now(),visible:card.visible,width:card.scale.x,opacity:card.material.opacity,y:card.position.y});
          if(phase==='notification'){resolve(frames);return;}
        }
        requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    });
  });
}
async function checkNotification(page,reduced){
  const frames=await page.evaluate(()=>window.notificationFrames);
  const landed=frames.find(f=>f.phase==='waiting-message'),shown=frames.find(f=>f.visible);
  assert(landed&&shown&&shown.ms-landed.ms>=550,'the visitor must see the harbor before the alert');
  assert(frames.filter(f=>f.phase==='approach').every(f=>!f.visible&&f.opacity===0));
  const last=frames.at(-1);
  // After the entrance the normal alert still pulses from .76 to 1;
  // the moment of arrival depends on the crossing, frame rate and ocean clock.
  assert(last.visible&&Math.abs(last.width-.33)<.001&&last.opacity>=(reduced?1:.759));
  const entering=frames.filter(f=>f.phase==='waiting-message'&&f.visible);
  assert(entering.some(f=>f.opacity<.8),'the alert should fade into view');
  if(reduced)assert(entering.every(f=>f.width===last.width&&f.y===last.y));
  else assert(entering.some(f=>f.width<last.width*.94&&f.y<last.y-.002),'the incoming alert should lift and expand');
}
// Sample the shared camera before the click, including the handoff frame.
// A longer button delay on its own must not pass as a journey.
async function sampleCrossing(page){
  await page.evaluate(()=>{
    const stage=document.getElementById('stage'),source=stage.dataset.islandStory;
    const names={'blue-book':'Brass telescope','orange-book':'Woven orange bookmark',phone:'Tidal port silence switch'};
    const veil=document.getElementById('crossing-veil'),camera=window.__marbleTransition.camera;
    window.crossingFrames=new Promise(resolve=>{
      const frames=[];
      function sample(){
        if(stage.dataset.crossing||frames.length){
          const name=names[stage.dataset.crossing],prop=window.__marbleTransition.dreamScene.getObjectByName(name);
          let visible=!!prop;
          for(let parent=prop;parent;parent=parent.parent)visible&&=parent.visible;
          frames.push({prop:name,visible,ms:performance.now(),eye:camera.position.toArray(),rotation:camera.quaternion.toArray(),atSource:stage.dataset.islandStory===source,
            stillFrame:!!veil.querySelector('canvas'),veil:Number(getComputedStyle(veil).opacity),locked:document.getElementById('tour-next').getAttribute('aria-disabled')==='true'});
          if(!stage.dataset.crossing){resolve(frames);return;}
        }
        requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    });
  });
}
async function checkCrossing(page,reduced){
  const frames=await page.evaluate(()=>window.crossingFrames),atSea=frames.filter(f=>f.atSource);
  assert(atSea.length>2&&atSea.every(f=>f.locked),'keep the action locked on departure');
  assert(atSea.every(f=>!f.prop||f.visible),'destination prop should already be staged before approaching');
  if(reduced){
    assert(frames.some(f=>f.veil>.85)&&frames.some(f=>f.veil>.05&&f.veil<.85),'dissolve between stationary views');
    assert(frames.every(f=>f.veil<.02||f.stillFrame),'dissolve from a painted frame');
    return;
  }
  const first=atSea[0];
  assert(atSea.at(-1).ms-first.ms>3000,'spend time travelling between shores');
  assert(Math.max(...atSea.map(f=>f.eye[1]))>Math.max(first.eye[1],atSea.at(-1).eye[1])+.02,'rise above both shores');
  assert(atSea.every(f=>f.veil===0),'keep the archipelago visible');
  const arrival=atSea.at(-1).eye,settled=await page.evaluate(()=>window.__marbleTransition.camera.position.toArray());
  assert(Math.hypot(...arrival.map((v,i)=>v-settled[i]))<.001,'flight must end at the interactive eye');
  for(let i=1;i<frames.length;i++){
    if(i>=8){
      const a=frames[i-8],b=frames[i],dot=Math.abs(a.rotation.reduce((s,v,j)=>s+v*b.rotation[j],0));
      const angle=2*Math.acos(Math.min(1,dot));
      assert(angle<(b.ms-a.ms)*.003+.03,'a sudden turn during the crossing');
    }
    const step=Math.hypot(...frames[i].eye.map((v,j)=>v-frames[i-1].eye[j]));
    assert(step<.075,'unexpected camera jump of '+step);
  }
}
async function follow(browser,mobile){
  const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1280,height:900},
    hasTouch:mobile,isMobile:mobile,reducedMotion:mobile?'reduce':'no-preference'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto(url);await waitLabel(page,'跟随故事');const next=page.locator('#tour-next');
    const source=await page.evaluate(()=>window.__marbleTransition.state.camera);
    const steps=[
      ['跟随故事','折成纸船'],['折成纸船','推船出海'],['推船出海','下一站 · 蓝书白崖'],
      ['下一站 · 蓝书白崖','望向纸船'],['望向纸船','下一站 · 橙书峡谷'],
      ['下一站 · 橙书峡谷','压低书签'],['压低书签','下一站 · 手机潮港'],
      ['下一站 · 手机潮港','拨到静音'],['拨到静音','下一站 · 洞窟书屋'],
      ['下一站 · 洞窟书屋','开门进书屋'],['开门进书屋','走近桌上的书'],
      ['走近桌上的书','从书页回到工位'],['从书页回到工位','再游览一次'],
    ];
    if(!mobile)await next.focus();
    for(const [before,after] of steps){
      assert.equal(await next.innerText(),before);
      const crossing=before.startsWith('下一站');
      if(crossing)await sampleCrossing(page);
      if(before==='下一站 · 手机潮港')await sampleNotification(page);
      if(mobile)await next.tap();else await page.keyboard.press('Enter');
      await waitLabel(page,after);
      if(crossing)await checkCrossing(page,mobile);
      if(!mobile)assert(await next.evaluate(el=>el===document.activeElement),'keyboard focus after '+before);
      if(before==='下一站 · 手机潮港')await checkNotification(page,mobile);
      if(before==='望向纸船'){
        assert(await page.getByRole('slider',{name:'望远镜倍率'}).isVisible());
        await page.waitForFunction(async()=>{
          const t=window.__marbleTransition,T=await import('/vendor/three.module.js'),p=t.dreamScene.getObjectByName('Paper boat at sea').getWorldPosition(new T.Vector3()).project(t.camera);
          return Math.abs(p.x)<.45&&Math.abs(p.y)<.45;
        });
      }
    }
    assert.deepEqual(await page.evaluate(()=>window.__marbleTransition.state.camera),source);
    assert.equal(await page.locator('#world').getAttribute('data-cycles'),'1');
    // A replay starts at the first stop. Leaving the guide restores the manual controls.
    await next.click();await waitLabel(page,'折成纸船');await page.click('#tour-exit');
    assert(await page.locator('#harbor-action').isVisible());await page.click('#harbor-exit');
    if(!mobile){
      await page.click('#tour-next');await waitLabel(page,'折成纸船');await next.click();
      await waitLabel(page,'推船出海');await next.click();await waitLabel(page,'下一站 · 蓝书白崖');
      await next.click();await page.waitForSelector('#stage[data-crossing="blue-book"]');await page.waitForTimeout(750);
      await page.click('#reduce-motion');
      await page.waitForFunction(()=>Number(getComputedStyle(document.getElementById('crossing-veil')).opacity)>.1);
      await page.keyboard.press('Escape');await page.waitForSelector('#harbor-exit');
      await page.waitForFunction(()=>!document.getElementById('stage').hasAttribute('data-crossing'));
      assert.equal(await page.locator('#stage').getAttribute('data-harbor'),'farewell');
      await page.click('#harbor-exit');
    }
    assert(await page.locator('#explore-tools').isVisible());assert.deepEqual(errors,[]);
    console.log(mobile?'Touch and reduced motion':'Keyboard and normal motion','completed five stops and returned through the printed photograph');
  }finally{await page.close();}
}
async function recovery(browser){
  const page=await browser.newPage({reducedMotion:'reduce'});
  let release;
  const delayed=new Promise(done=>{release=done;});
  let attempts=0;
  try{
    await page.route('**/blue-book/desktop-near.glb',r=>r.fulfill({status:503,body:''}));
    await page.route('**/blue-book/desktop-visit.glb',route=>++attempts<=2?route.fulfill({status:503,body:''}):route.continue());
    await page.route('**/orange-book/desktop-visit.glb',async route=>{await delayed;await route.continue();});
    await page.goto(url);const next=page.locator('#tour-next');
    for(const step of ['跟随故事','折成纸船','推船出海','下一站 · 蓝书白崖','重试本站','望向纸船','下一站 · 橙书峡谷']){
      await waitLabel(page,step);await next.click();
    }
    assert.equal(attempts,3);
    await page.click('#tour-exit');await page.waitForSelector('#harbor-exit');
    release();
    await page.waitForFunction(()=>window.__marbleTransition.islands.find(e=>e.id==='orange-book').loaded.includes('hd'));
    assert.equal(await page.locator('#stage').getAttribute('data-island-story'),'blue-book');
    console.log('Failed stop retried in place; a late island load respected exit');
  }finally{release();await page.close();}
}
(async()=>{const b=await launchBrowser();try{await follow(b,true);await follow(b,false);await recovery(b);}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

// Use the same keys and touch joystick as a visitor. Check the two different
// walkable surfaces at the same X/Z, as well as both sloping approaches.
const assert=require('node:assert/strict');
const path=require('node:path');
const {playwright,installedBrowser}=require('../../pipeline/verify.cjs');
async function traverse(browser,url,mobile,out){
  const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1100,height:760},hasTouch:mobile});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>console.error(r.url(),r.failure()));
  try{
    await page.goto(url+'?explore=bridge');await page.waitForFunction(()=>window.soleCityState?.().mode==='walk',null,{timeout:120000});
    const state=()=>page.evaluate(()=>window.soleCityState());
    const shot=async label=>{
      if(!out)return;
      await page.evaluate(()=>window.soleCityWaitForDetail?.());
      await page.screenshot({path:path.join(out,(mobile?'mobile-':'desktop-')+'bridge-'+label+'.jpg'),type:'jpeg',quality:91});
    };
    const entry=await state(),[west,ground,z]=entry.walkPosition;
    const cdp=mobile?await page.context().newCDPSession(page):null;
    let pad;
    if(mobile){const b=await page.locator('#pad').boundingBox();pad={x:b.x+b.width/2,y:b.y+b.height/2,r:b.width*.38};}
    const press=async key=>{
      if(!mobile)return page.keyboard.down(key);
      const [dx,dy]={w:[0,-1],s:[0,1],a:[-1,0],d:[1,0]}[key];
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:pad.x,y:pad.y,id:1}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:pad.x+dx*pad.r,y:pad.y+dy*pad.r,id:1}]});
    };
    const release=key=>mobile?cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}):page.keyboard.up(key);
    async function to(key,axis,value,sign){
      await press(key);
      try{await page.waitForFunction(([a,v,s])=>s*(window.soleCityState().walkPosition[a]-v)>=0,[axis,value,sign],{timeout:6000,polling:'raf'});}
      finally{await release(key);}
      return state();
    }
    assert.equal(entry.onBridge,false);await shot('entry');
    const mid=await to('w',0,west+.074,1);assert(mid.onBridge&&mid.walkPosition[1]>ground+.012&&mid.walkPosition[1]<ground+.047,'Stairs must lift the camera partway');
    const top=await to('w',0,west+.184,1);assert(top.onBridge&&Math.abs(top.walkPosition[1]-ground-.052)<1e-6,'Level deck must carry the walker');
    await shot('deck');
    await press('d');await page.waitForTimeout(350);await release('d');
    const railing=await state();assert(railing.onBridge&&Math.abs(railing.walkPosition[2]-z)<.013,'Handrail must stop a sideways fall');
    await to('a',2,z+.002,-1);
    const east=await to('w',0,west+.373,1);assert(!east.onBridge&&Math.abs(east.walkPosition[1]-ground)<1e-6,'East stairs return to pavement');
    const back=await to('s',0,west+.190,-1);assert(back.onBridge&&Math.abs(back.walkPosition[1]-ground-.052)<1e-6);
    const home=await to('s',0,west+.004,-1);assert(!home.onBridge&&Math.abs(home.walkPosition[1]-ground)<1e-6,'West stairs return to pavement');
    await page.locator('#home').click();await page.locator('#progress').fill('916');await page.locator('#street').click();
    const under=await to('w',2,.155,1);assert(!under.onBridge&&under.walkPosition[1]===ground,'Walking beneath the deck must remain at street height');
    assert.deepEqual(errors,[]);console.log(JSON.stringify({device:mobile?'touch':'keyboard',ground,slope:mid.walkPosition[1],deck:top.walkPosition[1],east:east.walkPosition[1],west:home.walkPosition[1],under:under.walkPosition[1]}));
  }finally{await page.close();}
}
(async()=>{const browser=await playwright().chromium.launch({executablePath:await installedBrowser(),args:['--use-angle=metal']});
  try{await traverse(browser,process.argv[2],false,process.argv[3]);await traverse(browser,process.argv[2],true,process.argv[3]);}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

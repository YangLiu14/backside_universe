const assert=require('node:assert/strict');
const {baseURL,launchBrowser,chooseDestination,switchWalkIsland}=require('./marble-browser.cjs');

async function checkIsland(id){
  const T=await import('three');
  const {createIslandWalk}=await import('/marble-transition-lab/island-walk.js');
  const {passages}=await import('/marble-transition-lab/island-passages.js');
  const app=window.__marbleTransition,world=app.dreamScene,definitions=passages[id]||[];
  const frame=id==='cup'?world.getObjectByName('Hi3D miniature holiday island'):
    id==='grotto'?app.grotto.root:world.getObjectByName('Desktop island / '+id);
  const model=id==='cup'||id==='grotto'?frame:frame.getObjectByName(definitions[0].name).parent;
  // The restored desk lies at local y=0 in this registered frame.
  const desk=world.getObjectByName('Restored original modeled room');
  const plane=new T.Plane().setFromCoplanarPoints(...[[0,0,0],[1,0,0],[0,0,1]].map(p=>desk.localToWorld(new T.Vector3(...p))));
  const sea=(x,z)=>(-plane.constant-plane.normal.x*x-plane.normal.z*z)/plane.normal.y;
  if(id==='phone'){
    const sill=world.getObjectByName('潮汐浴屋 / 门槛'),cast=new T.Raycaster();
    const unit=sill.getWorldScale(new T.Vector3()).x;
    function facadeAt(x,y,slope){
      const origin=sill.localToWorld(new T.Vector3(x+slope,y,1));
      cast.set(origin,new T.Vector3(-slope,0,-1).transformDirection(sill.matrixWorld));
      cast.far=unit*Math.hypot(1,slope)*1.45; // exclude the far wall inside the baths
      return cast.intersectObject(model,true).length>0;
    }
    for(const slope of [-.65,0,.65]){
      for(const x of [-.79,.79])for(const y of [.38,1.15,1.83]){
        if(!facadeAt(x,y,slope))throw Error('潮汐浴屋: gap beside jamb at '+[x,y,slope]);
      }
      for(const x of [-.34,0,.34])for(const y of [2.29,2.43]){
        if(!facadeAt(x,y,slope))throw Error('潮汐浴屋: gap above lintel at '+[x,y,slope]);
      }
    }
    for(const x of [-.42,0,.42])for(const y of [.45,1.5,1.96]){
      if(facadeAt(x,y,0))throw Error('潮汐浴屋: open doorway obstructed at '+[x,y]);
    }
  }
  if(id==='blue-book'){
    // Probe the masonry itself (not the door leaf or the opposite wall).
    // Door-local +Z faces the landing; the stone arch rises above the leaf.
    const sill=world.getObjectByName('圆亭观星室 / 门槛'),unit=sill.getWorldScale(new T.Vector3()).x;
    const toward=new T.Vector3(0,0,-1).transformDirection(sill.matrixWorld),cast=new T.Raycaster();
    cast.far=1.85*unit;
    const probes=[];
    for(const x of [-1.18,-.93,.93,1.18])for(const y of [.35,1.1,1.85,2.45])probes.push([x,y]);
    for(const x of [-.66,-.33,0,.33,.66])for(const y of [2.72,2.96])probes.push([x,y]);
    for(const [x,y] of probes){
      cast.set(sill.localToWorld(new T.Vector3(x,y,1.15)),toward);
      if(!cast.intersectObject(model,true).length)throw Error('圆亭观星室: missing facade beside or above the door at '+[x,y]);
    }
    // Clear the whole width of the landing at shin height: a centre-line walk
    // alone misses thin fragments of the original stone rail near the edges.
    cast.far=.89*unit;
    for(const x of [-.82,-.6,0,.6,.82]){
      cast.set(sill.localToWorld(new T.Vector3(x,.12,1.45)),toward);
      if(cast.intersectObject(model,true).length)throw Error('圆亭观星室: rail fragment across landing at '+x);
    }
  }
  const lane=name=>definitions.find(d=>d.name===name).points;
  const quay=id==='blue-book'?lane('白崖低栈道'):[];
  const inn=id==='orange-book'?lane('赤岩栈桥至旅舍'):[];
  const cliff=[[.179644,-.305329,-.869282],[.176102,-.300929,-.862595],[.162661,-.293772,-.852936],
    [.152781,-.28876,-.849796],[-.041338,-.162824,-.850301],[-.051259,-.16276,-.847531]];
  const here=()=>{
    if(id==='cup')return [['海风邮局',[[-.052,.18,.024]]]];
    if(id==='blue-book')return [
      ['白崖标本屋',[...quay.slice(0,9).reverse(),...lane('标本屋崖梯')]],
      ['圆亭观星室',[quay[9],quay[10],[.247,.055,-.048],[.19,.056,-.086],...lane('观星亭登岸梯')]]];
    if(id==='orange-book')return [
      ['赤岩旅舍 · 炉边餐厅',[...inn,[.155,.181,.347]]],
      ['赤岩旅舍 · 楼上客房',[...inn.slice(0,-2),...lane('旅舍露台外梯')]]];
    if(id==='phone')return [
      ['潮汐浴屋',[[.041,.071,.04],[.027,.072,.007],[.003,.071,-.025],[-.021,.07,-.054],
        [-.044,.071,-.074],[-.073,.069,-.071],[-.103,.06,-.070],[-.11,.059,-.056]]],
      ['修船工棚',[[.041,.067,.117],[.040,.064,.160],[.046,.064,.196],[.052,.062,.236],[.058,.062,.275],[.050,.062,.279]]]];
    return [
      ['海风书屋',[...cliff,[-.05289,-.16276,-.814914],[-.027437,-.152889,-.799803],[.169226,-.07176,-.800102],
        [.173937,-.07176,-.763892],[.160479,-.066714,-.754391],[.085767,-.03476,-.752545],[.067879,-.033977,-.720697]]],
      ['灯塔值守室',[...cliff,...lane('海蚀洞灯塔检修栈桥')]]];
  };
  const results=[];
  for(const [name,route] of here()){
    const surfaceOverride=id==='grotto'?await app.grotto.prepareWalkSurface():undefined;
    const walker=await createIslandWalk({id,model,frame,surfaceOverride,camera:new T.PerspectiveCamera(),sea,aspect:()=>1.5,
      reduced:()=>true,signal:new AbortController().signal});
    const home=new T.Vector3(...walker.state.foot),points=route.map(p=>frame.localToWorld(new T.Vector3(...p)));
    function walkTo(target){
      walker.clear();walker.key('w',true);
      for(let i=0;i<2400;i++){
        const {foot,height,yaw}=walker.state,dx=target.x-foot[0],dz=target.z-foot[2];
        if(Math.hypot(dx,dz)<height*.035)return;
        walker.look(-(Math.atan2(-dx,-dz)-yaw)/.004,0);walker.tick(1/120);
        if(i>20&&new T.Vector3(...walker.state.foot).distanceToSquared(new T.Vector3(...foot))<(height*1e-7)**2)break;
      }
      const local=p=>frame.worldToLocal(p.clone()).toArray().map(v=>+v.toFixed(4));
      throw Error(name+' blocked at '+local(new T.Vector3(...walker.state.foot))+' heading to '+local(target));
    }
    try{
      points.forEach(walkTo);
      const door=world.getObjectByName(name+' / 门槛'),p=door.worldToLocal(new T.Vector3(...walker.state.foot));
      // Local door coordinates are in metres, with +Z on its exterior.
      if(p.z<-.16||p.z>3.6||Math.abs(p.x)>1.63||Math.abs(p.y)>1.0)throw Error(name+' missed sill '+p.toArray());
      [...points.slice(0,-1).reverse(),home].forEach(walkTo);
      if(Math.abs(walker.state.foot[1]-home.y)>walker.state.height*.2)throw Error(name+' returned on wrong level');
      results.push({name,passed:true});
    }catch(error){results.push({name,error:error.message});}
  }
  return results;
}
(async()=>{
  const browser=await launchBrowser();
  try{
    const page=await browser.newPage({reducedMotion:'reduce'}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    const fallback=process.argv.includes('--fallback');
    if(fallback)await page.route('**/desktop-visit.glb',route=>route.abort());
    await page.goto(baseURL+'/marble-transition-lab/index.html?progress=1');
    await chooseDestination(page,'cup');await page.click('#walk-start');
    for(const id of ['cup','blue-book','orange-book','phone','grotto']){
      await switchWalkIsland(page,id);await page.waitForFunction(id=>window.__marbleTransition.state.walk?.id===id,id);
      if(fallback&&['blue-book','orange-book','phone'].includes(id)){
        assert.equal(await page.evaluate(id=>window.__marbleTransition.islands.find(i=>i.id===id).level,id),'near');
      }
      for(const r of await page.evaluate(checkIsland,id)){
        if(r.error)errors.push(r.error);else console.log(r.name+' — walked from island spawn to sill and back');
      }
    }
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

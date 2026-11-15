import * as T from 'three';

// Each near GLB owns its embedded textures. Multiple placements share its
// geometries and materials and release them together when that type leaves cache.
function releaseModel(root) {
  const geometry=new Set(), materials=new Set(), textures=new Set(), images=new Set();
  root.traverse(o=>{
    if(!o.isMesh)return;
    geometry.add(o.geometry);
    for(const m of [].concat(o.material))materials.add(m);
  });
  for(const m of materials){
    for(const value of Object.values(m))if(value?.isTexture)textures.add(value);
    m.dispose();
  }
  for(const t of textures){images.add(t.source?.data);t.dispose();}
  for(const g of geometry)g.dispose();
  for(const bitmap of images)bitmap?.close?.();
}

export function nearBuildings(city, sources) {
  const entries=new Map();
  for(const [role,load] of sources)entries.set(role,{role,load,places:[],model:null,error:null,retryAt:0,lastVisible:0});
  city.traverse(lod=>{
    const e=entries.get(lod.userData.nearBuildingRole);
    if(!e)return;
    e.places.push({lod,far:lod.levels[0].object,near:null,visible:false});
  });
  const mobile=matchMedia('(pointer:coarse)').matches||navigator.deviceMemory<=4;
  const limit=mobile?3:6, maxLoads=mobile?1:2;
  const scale=city.getWorldScale(new T.Vector3()).x;
  const range=.32*scale, box=new T.Box3(), frustum=new T.Frustum(), clip=new T.Matrix4();
  const eye=new T.Vector3();
  const roomBounds=new T.Box3(new T.Vector3(-.5,0,-.5),new T.Vector3(.5,1,.5));
  const active=new Map();
  let wanted=[],clock=0,shade=()=>{},changed=()=>{};

  function show(e,all=false){
    for(const place of e.places){
      if(e.model && !place.near){
        place.near=e.model.clone();
        place.lod.addLevel(place.near,0);
      }
      const near=!!place.near&&(all||place.visible);
      if(place.near)place.near.visible=near;
      place.far.visible=!near;
    }
  }
  function evict(e){
    for(const p of e.places){
      if(p.near)p.lod.removeLevel(0);
      p.near=null;p.far.visible=true;
    }
    releaseModel(e.model);e.model=null;
  }
  function start(e,offline=false){
    const promise=(async()=>{
      try{
        const model=await e.load();
        model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
        shade(model);
        e.model=model;e.error=null;show(e);
      }catch(error){
        e.error=error;e.retryAt=performance.now()+5000;
        console.warn('近景模型加载失败：'+e.role,error);
      }
    })().finally(()=>{active.delete(e);pump();if(!offline)changed();});
    active.set(e,promise);
    return promise;
  }
  function pump(){
    const resident=()=>[...entries.values()].filter(e=>e.model);
    for(const e of wanted){
      if(active.size>=maxLoads)break;
      if(e.model||active.has(e)||(e.error&&performance.now()<e.retryAt))continue;
      if(resident().length+active.size>=limit){
        const spare=resident().filter(r=>!wanted.includes(r)).sort((a,b)=>a.lastVisible-b.lastVisible)[0];
        if(!spare)break;
        evict(spare);
      }
      start(e);
    }
  }
  function update(camera,enabled){
    camera.updateWorldMatrix(true,false);
    eye.setFromMatrixPosition(camera.matrixWorld);
    clip.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(clip,camera.coordinateSystem);
    const nearest=[];
    clock++;
    for(const e of entries.values()){
      let best=Infinity;
      for(const p of e.places){
        p.visible=false;
        if(!enabled)continue;
        p.lod.updateWorldMatrix(true,false);
        box.copy(roomBounds).applyMatrix4(p.lod.matrixWorld);
        const d=box.distanceToPoint(eye);
        if(d>range||!frustum.intersectsBox(box))continue;
        p.visible=true;best=Math.min(d,best);
      }
      if(Number.isFinite(best))nearest.push({e,d:best});
    }
    wanted=nearest.sort((a,b)=>a.d-b.d).slice(0,limit).map(r=>r.e);
    for(const e of entries.values()){
      if(wanted.includes(e))e.lastVisible=clock;
      else for(const p of e.places)p.visible=false;
      if(e.model)show(e);
    }
    pump();
  }
  function pending(){return wanted.some(e=>!e.model);}
  async function ready(){
    // A capture holds its camera still. If another render moves the camera,
    // continue with what is wanted for its new position.
    while(pending()){
      const failed=wanted.find(e=>e.error && performance.now()<e.retryAt);
      if(failed)throw Error('近景未就绪：'+failed.role,{cause:failed.error});
      pump();
      if(!active.size)throw Error('近景加载队列无法继续');
      await Promise.race(active.values());
    }
  }
  async function authoring(role) {
    // The offline exporter/baker explicitly asks for inspection geometry.
    // Do not apply the interactive residency limit to an offline snapshot.
    wanted=[];await Promise.all(active.values());
    for(const e of entries.values()){
      if(!e.places.length || (role && role!==e.role))continue;
      if(!e.model)await start(e,true);
      if(!e.model)throw Error('导出缺少近景：'+e.role,{cause:e.error});
      show(e,true);
    }
  }
  function status(){
    return {limit,maxLoads,loading:[...active.keys()].map(e=>e.role),
      visible:wanted.map(e=>e.role),resident:[...entries.values()].filter(e=>e.model).map(e=>e.role)};
  }
  return {update,pending,ready,authoring,status,setCallbacks(fit,draw){shade=fit;changed=draw;}};
}

import {dressCoast} from './coastal-surfaces.js';
import * as THREE from '../vendor/three.module.js';
import {createPhoneCase,fitCoastToCase,handset,handsetShore} from './phone-case.js';
import {harborFits,seatHarborBase} from './harbor-waterline.js';

const V = THREE.Vector3;
const ease = (a, b, value) => THREE.MathUtils.smoothstep(value, a, b);

// Measurements in the reviewed GLBs' Y-up coordinates. Water is sampled at
// the open mouth of each bay, rather than at the bottom of its book/phone case.
const designs = {
  'blue-book': {size:[.87088,.39542,.97882], water:.015, draft:.008, berth:[0,.17], accessory:[.02,.97], yaw:.14,
    coast:[[-.384,-.065],[-.201,-.427],[-.040,-.484],[.243,-.372],[.426,-.222],[.403,-.044],[-.036,.485],[-.391,.354]]},
  'orange-book': {size:[.81833,.42667,.97995], water:.017, draft:.006, berth:[-.32,-.21], accessory:[0,.41], yaw:-.18,
    coast:[[-.409,.472],[-.398,-.199],[-.125,-.479],[.360,-.480],[.401,-.464],[.409,.472],[.357,.488],[-.218,.486]]},
  phone: {size:[handset.width,.19985,handset.length], water:handset.water, draft:0, berth:[-.075,-.49], yaw:0,
    coast:handsetShore},
};

function fittedCorners(group, fit) {
  return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,z]) =>
    group.localToWorld(new V(x*fit.width/2, 0, z*fit.depth/2)));
}

function bookCorners(cover) {
  return [0,1,2,3].map(i => cover.localToWorld(new V().fromBufferAttribute(cover.geometry.attributes.position,i)));
}

function register(corners, design, offset, surface) {
  const center = corners.reduce((sum,p) => sum.add(p), new V()).multiplyScalar(.25);
  const a = corners[1].clone().sub(corners[0]).add(corners[2]).sub(corners[3]).multiplyScalar(.5);
  const b = corners[3].clone().sub(corners[0]).add(corners[2]).sub(corners[1]).multiplyScalar(.5);
  const [long,short] = a.length()>b.length() ? [a,b] : [b,a];
  const [w,h,d] = design.size;
  const scale = Math.min(long.length()/d,short.length()/w);
  const up = new V(surface(0,0)-surface(1,0),1,surface(0,0)-surface(0,1)).normalize();
  const front = long.clone().projectOnPlane(up).normalize();
  if (front.z>0) front.negate();
  front.applyAxisAngle(up,design.yaw);
  const right = up.clone().cross(front);
  const root = new THREE.Group();
  root.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,up,front));
  root.scale.setScalar(scale);
  const port = center.clone().add(offset);
  port.y = surface(port.x,port.z);
  // Give each inlet enough draft for moving water to pass over its baked base.
  const seated = port.clone().addScaledVector(up,-design.draft-design.water*scale);
  const shore = design.coast.map(([x,z]) => {
    const p = port.clone().addScaledVector(right,x*scale).addScaledVector(front,z*scale);
    return new THREE.Vector2(p.x,p.z);
  });
  const berthMatrix=new THREE.Matrix4().compose(seated,root.quaternion,root.scale);
  const bounds=new THREE.Box3(new V(-w/2,0,-d/2),new V(w/2,h,d/2))
    .applyMatrix4(berthMatrix);
  return {root, up, seated, shore, bounds, berthMatrix, height:h*scale};
}

// The source meshes are shared by the GS and modeled captures. Only the
// modeled pass moves them, and restores their exact local pose after drawing.
function movingPart(object, worldOffset) {
  const start = object.position.clone();
  const inverse = object.parent.matrixWorld.clone().invert();
  const delta = worldOffset.clone().applyMatrix4(inverse).sub(new V().applyMatrix4(inverse));
  return {apply(amount, visible=true){
    object.position.copy(start).addScaledVector(delta,amount);
    object.visible=visible;
  }};
}

// Use the mesh vertices: the bounds of a rotated book overestimate its height
// above this slightly tilted desktop and leave a page sticking through the rim.
function clearanceAboveDesk(object, lateral, surface, extreme) {
  let clearance=extreme===Math.min?Infinity:-Infinity;
  object.traverse(child=>{
    if(!child.isMesh)return;
    const vertices=child.geometry.attributes.position,p=new V();
    for(let i=0;i<vertices.count;i++){
      p.fromBufferAttribute(vertices,i).applyMatrix4(child.matrixWorld);
      clearance=extreme(clearance,p.y-surface(p.x+lateral.x,p.z+lateral.z));
    }
  });
  return clearance;
}

export function createDesktopIslands({scene, registered, details, fit, desk, surface, loader, anisotropy, invalidate, report}) {
  desk.updateWorldMatrix(true,true);
  registered.group.updateWorldMatrix(true,true);
  const delta = ([x,z]) => new V(x,0,z).applyMatrix4(desk.matrixWorld).sub(new V().applyMatrix4(desk.matrixWorld));
  const named = name => registered.group.getObjectByName(name);
  const hosts = {
    'blue-book': {corners:bookCorners(named('book-cover')), body:[named('book-cover'),named('book-pages')], accessory:named('hi3d-paper-0')},
    'orange-book': {corners:fittedCorners(details.book,fit.orangeBook), body:[details.book], accessory:details.headphones},
    phone: {corners:fittedCorners(details.phone,fit.phone), body:[details.phone,details.lensGroup]},
  };
  const entries = Object.entries(designs).map(([id,design])=>{
    const host=hosts[id], berth=delta(design.berth);
    const entry=register(host.corners,design,berth,surface);
    entry.root.name='Desktop island / '+id;
    entry.root.visible=false;
    scene.add(entry.root);
    const sink=berth.clone().addScaledVector(entry.up,-.055);
    const body=host.body.map(o=>movingPart(o,sink));
    const highest=Math.max(...host.body.map(o=>clearanceAboveDesk(o,new V(),surface,Math.max)));
    const submergedAt=highest/(surface(sink.x,sink.z)-surface(0,0)-sink.y);
    let accessory;
    if(host.accessory){
      const drift=delta(design.accessory);
      drift.y=.001-clearanceAboveDesk(host.accessory,drift,surface,Math.min);
      accessory=movingPart(host.accessory,drift);
    }
    // Static desktop shadows are baked before these ordinary pieces sail apart.
    for(const part of [...host.body,host.accessory].filter(Boolean)){
      part.traverse(o=>{if(o.isMesh){o.castShadow=false;o.layers.enable(3);}});
    }
    return {...entry,id,body,accessory,submergedAt,models:{},requests:{},failed:new Set(),level:'ordinary',amount:0};
  });

  let warming, prepared=false, currentSea=0;
  function warn(){
    const names={'blue-book':'蓝书','orange-book':'橙书',phone:'手机'};
    const missing=entries.filter(e=>e.failed.has('hd')).map(e=>names[e.id]);
    report(missing.length ? missing.join('、')+'高清模型未能载入，可重试。' : '');
  }
  function load(entry,level){
    if(entry.requests[level])return entry.requests[level];
    const file=level==='hd'?'desktop-visit.glb':'desktop-near.glb';
    entry.requests[level]=loader.loadAsync('../holiday-assets/assets/'+entry.id+'/'+file).then(({scene:model})=>{
      if(harborFits[entry.id])seatHarborBase(model,entry.berthMatrix,surface,harborFits[entry.id]);
      if(entry.id==='phone')fitCoastToCase(model);
      model.traverse(o=>{
        if(!o.isMesh)return;
        o.layers.enable(3);o.receiveShadow=o.castShadow=true;
        for(const mat of [].concat(o.material)){
          for(const map of [mat.map,mat.normalMap,mat.roughnessMap,mat.metalnessMap]){
            if(map)map.anisotropy=anisotropy;
          }
        }
      });
      if(level==='hd')dressCoast(model,entry.id);
      const first=!entry.models.hd&&!entry.models.near;
      if(first&&entry.id==='phone')entry.root.add(createPhoneCase());
      model.visible=false;entry.root.add(model);entry.models[level]=model;
      entry.failed.delete(level);
      if(first&&currentSea>.04)entry.lateArrival=performance.now();
      invalidate();
    }).catch(()=>entry.failed.add(level));
    return entry.requests[level];
  }
  async function prepareModel(entry,retry=false){
    if(retry){
      for(const level of entry.failed)delete entry.requests[level];
      entry.failed.clear();
    }
    await load(entry,'hd');
    if(!entry.models.hd)await load(entry,'near');
    warn();
  }
  function prepare(){
    if(!warming)warming=Promise.all(entries.map(e=>prepareModel(e))).then(()=>{prepared=true;invalidate();});
    return warming;
  }
  function update(amount,seaMaterial,reduced){
    currentSea=amount;
    let shadowChanged=false;

    for(const [index,e] of entries.entries()){
      const oldAmount=e.amount,oldLevel=e.level;
      e.amount=(e.models.hd||e.models.near)?ease(.04,.94,amount):0;
      if(e.lateArrival){
        const arrival=reduced?1:ease(0,550,performance.now()-e.lateArrival);
        e.amount*=arrival;
        if(arrival<1)invalidate();else e.lateArrival=0;
      }
      if(oldAmount!==e.amount)shadowChanged=true;
      const rise=ease(.17,1,e.amount);
      seaMaterial.setShoreBlend(index,rise);
      e.root.visible=rise>0;
      e.root.position.copy(e.seated).addScaledVector(e.up,-(1-rise)*(e.height+.003));
      if(!e.root.visible){e.level='ordinary';continue;}
      e.level=e.models.hd?'hd':'near';
      if(oldLevel!==e.level)shadowChanged=true;
      if(e.models.hd)e.models.hd.visible=true;
      if(e.models.near)e.models.near.visible=e.level==='near';
    }
    return shadowChanged;
  }
  return {
    async prepareDestination(id){
      const e=entries.find(entry=>entry.id===id);
      await prepareModel(e,e.failed.has('hd'));
      if(!e.models.hd&&!e.models.near)throw Error('岛屿模型未能载入');
      e.lateArrival=0;
    },
    prepare, get prepared(){return prepared;},
    retryMissing(){
      for(const entry of entries)if(entry.failed.has('hd'))prepareModel(entry,true);
    },
    destinations:entries.map(e=>[e.id,{root:e.root,bounds:e.bounds,get exterior(){return e.models.hd||e.models.near;},get landed(){return e.amount===1;}}]),
    shores:entries.map(e=>e.shore),update,
    applyPass(modeled){
      for(const e of entries){
        const amount=modeled?e.amount:0;
        const drop=ease(.15,.88,amount);
        for(const body of e.body)body.apply(drop,amount===0||drop<e.submergedAt);
        e.accessory?.apply(ease(0,.58,amount));
      }
    },
    get state(){return entries.map(e=>({id:e.id,level:e.level,amount:e.amount,loaded:Object.keys(e.models),failed:[...e.failed],scale:e.root.scale.x,shore:e.shore.map(p=>p.toArray())}));},
  };
}

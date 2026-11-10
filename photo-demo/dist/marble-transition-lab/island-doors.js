import * as T from 'three';
import {beaconEntry} from './grotto-access.js';
import {bathEntrance,bathPaintMap} from './bath-entrance.js';

// Sills, facade normals and opening heights surveyed on the seated island meshes.
const buildings={
  cup:[
    {id:'post',name:'海风邮局',at:[-.0669,.181,-.014],out:[0,1],height:.153,paint:'#416b87'},
  ],
  'blue-book':[
    {id:'field',name:'白崖标本屋',at:[-.064,.241,.154],out:[.94,.34],height:.043,paint:'#68929c'},
    {id:'watch',name:'圆亭观星室',at:[.2764,.221,-.146],out:[-.31,.95],height:.038,paint:'#7c7158'},
  ],
  'orange-book':[
    {id:'inn',key:'inn-hall',name:'赤岩旅舍 · 炉边餐厅',at:[.190,.191,.334],out:[-.96,.27],height:.053,paint:'#795139'},
    {id:'inn',key:'inn-loft',name:'赤岩旅舍 · 楼上客房',at:[.250,.289,.313],out:[-.98,.20],height:.052,paint:'#66705a',upper:true},
  ],
  phone:[
    bathEntrance,
    {id:'slip',name:'修船工棚',at:[.073,.059,.285],out:[-1,0],height:.067,paint:'#926c4b',open:true},
  ],
  grotto:[
    {id:'beacon',name:'灯塔值守室',...beaconEntry,paint:'#80624c'},
  ],
};
const v=(x,y,z)=>new T.Vector3(x,y,z);
const ease=t=>t*t*(3-2*t);
const duration=.98;

function doorLeaf(group,spec){
  const hinge=new T.Group();hinge.position.set(-.55,0,.07);group.add(hinge);
  const paint=new T.MeshStandardMaterial({color:spec.paint,map:spec.id==='baths'?bathPaintMap():null,roughness:.75});
  const dark=paint.clone();dark.color.multiplyScalar(.69);
  const brass=new T.MeshStandardMaterial({color:0xb39462,roughness:.42,metalness:.67});
  const block=(x,y,z,w,h,d,m)=>{const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),m);mesh.position.set(x,y,z);hinge.add(mesh);return mesh;};
  block(.55,1.035,0,1.10,2.07,.06,dark);
  for(let i=0;i<5;i++)block((i+.5)*.22,1.035,.036,.209,2.045,.016,paint);
  for(const x of [.065,1.035])block(x,1.035,.059,.108,2.07,.04,paint);
  for(const y of [.085,.84,1.95])block(.55,y,.059,.91,.095,.042,paint);
  block(.90,.97,.094,.085,.165,.028,brass);block(.86,.985,.124,.14,.029,.047,brass);
  return hinge;
}

function makeEntrance(spec,frame){
  const sill=frame.localToWorld(new T.Vector3(...spec.at));
  const facing=v(spec.out[0],0,spec.out[1]).transformDirection(frame.matrixWorld);facing.y=0;facing.normalize();
  const group=new T.Group(),height=spec.height*frame.getWorldScale(new T.Vector3()).y,scale=height/2.18;
  group.name=spec.name+' / 门槛';group.position.copy(sill);group.rotation.y=Math.atan2(facing.x,facing.z);group.scale.setScalar(scale);
  // Match the fixed arch on the slightly tilted handset.
  if(spec===bathEntrance)frame.getWorldQuaternion(group.quaternion);
  const hit=new T.Mesh(new T.PlaneGeometry(spec.width||1.36,2.29),new T.MeshBasicMaterial({visible:false,side:T.DoubleSide}));
  hit.position.set(0,1.1,.115);group.add(hit);
  const door={...spec,key:spec.key||spec.id,sill,facing,group,height,scale,hit,aim:sill.clone().add(v(0,scale*1.43,0))};
  if(spec.original)return door;
  const trim=new T.MeshStandardMaterial({color:spec===bathEntrance?'#54766b':spec.open?'#886e50':'#a68b66',roughness:.87});
  const add=(x,y,z,w,h,d)=>{const m=new T.Mesh(new T.BoxGeometry(w,h,d),trim);m.position.set(x,y,z);group.add(m);};
  for(const side of [-1,1])add(side*.594,1.06,0,.08,2.16,.14);
  add(0,2.15,0,1.30,.13,.16);add(0,.018,0,1.25,.037,.20);
  const pane=new T.Mesh(new T.PlaneGeometry(1.115,2.10),new T.MeshBasicMaterial({color:0x332e29,toneMapped:false}));
  pane.position.set(0,1.055,-.021);group.add(pane);pane.visible=!spec.open;
  const hinge=spec.open?null:doorLeaf(group,spec);
  return {...door,pane,hinge};
}

export function withIslandDoors({outside,frame,camera,world,renderer,aspect,reduced,changed,veil,dayColor,modelLoader,bookroom}){
  const sites=buildings[outside.id];
  if(!sites)return outside;
  const doors=sites.map(s=>makeEntrance(s,frame));
  if(bookroom){
    const {sill,height,enter}=bookroom;
    doors.unshift(makeEntrance({id:'library',name:'海风书屋',at:sill,out:[0,-1],height,width:1.87,original:enter},frame));
  }
  const exterior=new T.Group();exterior.name='Walkable island doorways';world.add(exterior);
  doors.forEach(d=>exterior.add(d.group));exterior.updateMatrixWorld(true);
  const cast=new T.Raycaster(),keys=new Set(),leafMaterials=new Set();
  let choice=doors[0],mode='outside',room=null,inside=null,roomCamera=null,sky=null,preview=null;
  let transition=null,pending=null,disposed=false,lastNear=false,notice='',arrivalAnchor=null,entryFoot=null;
  function near(d=choice){
    const p=camera.position,dx=p.x-d.sill.x,dz=p.z-d.sill.z;
    return Math.hypot(dx,dz)<d.height*1.72&&dx*d.facing.x+dz*d.facing.z>=-d.scale*.15
      &&Math.abs(dx*d.facing.z-dz*d.facing.x)<d.height*.77&&Math.abs(p.y-d.aim.y)<d.height*.90;
  }
  function active(){return mode==='inside'?inside:outside;}
  function setDoor(angle){
    if(choice.hinge)choice.hinge.rotation.y=angle;
  }
  function placeOutside(d,away=false){
    const landing=away&&entryFoot?.door===d?entryFoot.position:
      d.sill.clone().addScaledVector(d.facing,d.height*(d.id==='library'?.37:1.10));
    const target=away?landing.clone().addScaledVector(d.facing,d.height):d.aim;
    outside.relocate(landing,target,away?-.05:null);arrivalAnchor=camera.position.clone();
    if(away)entryFoot=null;
  }
  function atDoor(){return near()||(arrivalAnchor&&camera.position.distanceTo(arrivalAnchor)<choice.height*.26);}
  function cleanupRoom(){
    for(const d of doors){if(!d.pane)continue;d.pane.material.map=null;d.pane.material.color.set(0x332e29);d.pane.material.needsUpdate=true;d.pane.visible=!d.open;if(d.hinge)d.hinge.rotation.y=0;}
    room?.dispose();room=null;inside=null;roomCamera=null;
    for(const m of leafMaterials)m.dispose();leafMaterials.clear();
    sky?.dispose();sky=null;preview?.dispose();preview=null;
  }
  function cancelLoad(){
    pending?.abort();pending=null;
  }
  function syncCamera(other){
    camera.position.copy(other.position);camera.quaternion.copy(other.quaternion);
    if(camera.near!==other.near||camera.fov!==other.fov||camera.aspect!==other.aspect){
      camera.near=other.near;camera.fov=other.fov;camera.aspect=other.aspect;camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld(true);
  }
  function makeView(){
    const oldTarget=renderer.getRenderTarget(),oldShadow=renderer.shadowMap.needsUpdate;
    exterior.visible=false;
    try{
      sky=new T.WebGLCubeRenderTarget(256,{type:T.HalfFloatType,generateMipmaps:true,minFilter:T.LinearMipmapLinearFilter});
      const probe=new T.CubeCamera(choice.height*1.20,30,sky);
      probe.position.copy(choice.aim).addScaledVector(choice.facing,choice.height*.97);
      probe.update(renderer,world);room.scene.background=sky.texture;
      room.scene.backgroundRotation.y=-choice.group.rotation.y;
      preview=new T.WebGLRenderTarget(256,480,{colorSpace:T.SRGBColorSpace});
      const eye=new T.PerspectiveCamera(79,256/480,.035,35);eye.position.set(0,(choice.upper?2.85:0)+1.12,.22);eye.lookAt(0,eye.position.y,-4);
      renderer.shadowMap.needsUpdate=true;renderer.setRenderTarget(preview);renderer.render(room.scene,eye);
      choice.pane.material.map=preview.texture;choice.pane.material.color.set(0xffffff);choice.pane.material.needsUpdate=true;
      choice.pane.visible=true;
    }finally{renderer.setRenderTarget(oldTarget);renderer.shadowMap.needsUpdate=oldShadow;exterior.visible=true;}
  }
  async function enter(){
    if(disposed||pending||transition||mode!=='outside')return;
    if(choice.original){choice.original();return;}
    const request=new AbortController();pending=request;outside.clear();notice='正在打开'+choice.name+'…';changed();
    let unattached=null;
    try{
      const [{buildIslandInterior,upperFloor},{createIslandWalk},{loadRoomDressing}]=await Promise.all([import('./island-interiors.js'),import('./island-walk.js'),import('./room-dressing.js')]);
      if(request.signal.aborted)return;
      const dressing=await loadRoomDressing(choice.id,modelLoader,request.signal);
      if(request.signal.aborted){dressing.dispose();return;}
      unattached=dressing;room=buildIslandInterior(choice.id,world.environment,dayColor,dressing);unattached=null;
      for(const door of doors.filter(d=>d.id===choice.id&&!d.open)){
        const portal=new T.Group();portal.position.y=door.upper?upperFloor:0;
        doorLeaf(portal,door).rotation.y=1.49;room.model.add(portal);
        portal.traverse(o=>{if(o.isMesh)leafMaterials.add(o.material);});
      }
      roomCamera=camera.clone();roomCamera.position.set(0,1.55,-1);
      const floor=choice.upper?upperFloor:0;
      inside=await createIslandWalk({id:'interior',model:room.model,camera:roomCamera,aspect,reduced,
        sea:()=>-Infinity,signal:request.signal,spawn:{start:v(0,floor,-.88),aim:v(0,floor,-3),pitch:-.055}});
      if(request.signal.aborted)return;
      inside.tick(0);makeView();notice=dressing.failed.length?'部分家具使用基础模型，重新进门会再加载。':'';
      entryFoot={door:choice,position:new T.Vector3().fromArray(outside.state.foot)};
      transition={action:'enter',time:0,position:camera.position.clone(),rotation:camera.quaternion.clone(),floor};
      if(reduced())tick(duration);
    }catch(err){unattached?.dispose();if(!request.signal.aborted){cleanupRoom();notice='房间暂时未能打开，可以再试一次。';console.error(err);}}
    finally{if(pending===request)pending=null;if(!disposed)changed();}
  }
  function approach(key){
    const target=doors.find(d=>d.key===key);
    if(!target||disposed||pending||transition||mode!=='outside')return;
    choice=target;arrivalAnchor=null;
    outside.clear();notice='';transition={action:'approach',time:0,moved:false};
    if(reduced())tick(duration);changed();
  }
  function action(){
    if(disposed||pending||transition)return;
    if(mode==='inside'){exitRoom();return;}
    if(atDoor()){enter();return;}
    approach(choice.key);
  }
  function exitRoom(){
    if(mode!=='inside'||transition)return;
    const level=inside.state.foot[1];
    if(choice.id==='inn')choice=doors.find(d=>Boolean(d.upper)===(level>1.7));
    inside.clear();keys.clear();pending?.abort();pending=null;
    transition={action:'exit',time:0,moved:false};
    if(reduced())tick(duration);changed();
  }
  function tick(dt,sticks){
    if(transition){
      const trip=transition;trip.time+=dt;
      const t=reduced()?1:Math.min(1,trip.time/duration);
      if(trip.action==='enter'){
        setDoor(ease(Math.min(1,t/.48))*1.52);
        if(t<.55){
          const end=choice.aim.clone().addScaledVector(choice.facing,choice.scale*.10);
          camera.position.lerpVectors(trip.position,end,ease(t/.55));
          const aimRotation=new T.Quaternion().setFromAxisAngle(v(0,1,0),choice.group.rotation.y);
          camera.quaternion.slerpQuaternions(trip.rotation,aimRotation,ease(t/.55));camera.updateMatrixWorld(true);
        }else{
          mode='inside';inside.tick(0);syncCamera(roomCamera);
          camera.position.z=T.MathUtils.lerp(-.05,roomCamera.position.z,ease((t-.55)/.45));camera.updateMatrixWorld(true);
        }
        veil(reduced()?0:.55*Math.max(0,1-Math.abs(t-.55)/.14));
      }else{
        veil(reduced()?0:ease(1-Math.abs(2*t-1)));
        if(t>=.5&&!trip.moved){
          trip.moved=true;
          if(trip.action==='exit'){mode='outside';cleanupRoom();}
          placeOutside(choice,trip.action==='exit');
        }
      }
      if(t>=1){transition=null;keys.clear();veil(0);changed();}
      return;
    }
    if(mode==='inside'){
      const oldZ=roomCamera.position.z;
      inside.tick(dt,sticks);syncCamera(roomCamera);
      if(roomCamera.position.z>-.21&&roomCamera.position.z>oldZ&&Math.abs(roomCamera.position.x)<.67)exitRoom();
    }else{
      outside.tick(dt,sticks);
      if(pending)return;
      const nearby=doors.filter(d=>near(d)).sort((a,b)=>a.aim.distanceToSquared(camera.position)-b.aim.distanceToSquared(camera.position));
      if(nearby.length&&!arrivalAnchor&&choice!==nearby[0]){choice=nearby[0];changed();}
      if(arrivalAnchor&&camera.position.distanceTo(arrivalAnchor)>choice.height*.32)arrivalAnchor=null;
      const now=!!atDoor();if(now!==lastNear){lastNear=now;changed();}
      if((keys.has('w')||keys.has('arrowup')||sticks?.move.y<-.15)&&nearby.includes(choice)){
        const rel=camera.position.clone().sub(choice.sill),forward=camera.getWorldDirection(v(0,0,0));
        if(Math.abs(rel.x*choice.facing.z-rel.z*choice.facing.x)<choice.scale*.53
          &&rel.dot(choice.facing)>-choice.scale*.15&&rel.dot(choice.facing)<choice.scale*.57&&forward.dot(choice.facing)<-.65)enter();
      }
    }
  }
  function hitDoor(ndc){
    if(pending||transition)return;
    cast.setFromCamera(ndc,camera);
    if(mode==='inside'){
      const dz=cast.ray.direction.z;if(dz<=0)return;
      const t=-camera.position.z/dz,hit=cast.ray.at(t,v(0,0,0));
      const level=choice.id==='inn'&&inside.state.foot[1]>1.7?2.85:0;
      if(t>=0&&t<4.5&&Math.abs(hit.x)<.60&&hit.y>=level&&hit.y<=level+2.2)exitRoom();
      return;
    }
    const hit=cast.intersectObjects(doors.map(d=>d.hit),false)[0];
    if(!hit)return;
    const d=doors.find(d=>d.hit===hit.object);
    if(hit.distance>d.height*3||camera.position.clone().sub(d.sill).dot(d.facing)<-d.scale*.15)return;
    choice=d;enter();
  }
  return {id:outside.id,tick,action,approach,hitDoor,
    get busy(){return Boolean(transition||pending);},
    get rooms(){return doors;},get scene(){return mode==='inside'?room?.scene:null;},
    get info(){return {key:choice.key,name:choice.name,inside:mode==='inside',near:!!atDoor(),busy:!!(transition||pending),notice};},
    get state(){return {...active().state,id:outside.id,room:mode==='inside'?choice.id:null,entrance:choice.key,furnishings:mode==='inside'?room.furnishings:null};},
    escape(){if(pending){cancelLoad();cleanupRoom();notice='';changed();return true;}if(transition)return true;if(mode==='inside'){exitRoom();return true;}return false;},
    clear(){keys.clear();outside.clear();inside?.clear();},
    key(k,on){if(transition||pending)return;if(on)keys.add(k);else keys.delete(k);active().key(k,on);},
    look(dx,dy){if(!transition&&!pending)active().look(dx,dy);},
    dispose(){disposed=true;cancelLoad();outside.tick(0);cleanupRoom();veil(0);exterior.removeFromParent();
      const mats=new Set();exterior.traverse(o=>{if(o.isMesh){o.geometry.dispose();mats.add(o.material);}});mats.forEach(m=>m.dispose());}
  };
}

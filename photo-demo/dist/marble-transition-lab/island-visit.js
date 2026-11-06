import * as THREE from 'three';
import {createCliffLookout} from './cliff-lookout.js';
import {createCanyonBookmark} from './canyon-bookmark.js';
import {createTidalPort} from './tidal-port.js';

const builders={'blue-book':createCliffLookout,'orange-book':createCanyonBookmark,phone:createTidalPort};

// This visit borrows the exploration camera. Its host retains the exact desk
// pose; the interaction owns projection, gestures and props only until leave().
export function createIslandVisit({id,island,holiday,scene,camera,canvas,reduced,changed,returned}){
  const props=new THREE.Group(),world=new THREE.Group();
  let dirty=true,wasReduced=false;
  const notify=()=>{dirty=true;changed(approaching?'approach':story.state,approaching?'':story.hint);};
  const story=builders[id]({island,props,world,holiday,camera,canvas,notify});
  props.name=story.title;props.visible=world.visible=false;island.add(props);scene.add(world);
  let active=false,approaching=false,age=0,hand=null,lens=0,oldNear=0,oldFov=0,oldAspect=1,entryFov=46;
  const from=new THREE.Vector3(),startRotation=new THREE.Quaternion(),goalRotation=new THREE.Quaternion();
  const look=new THREE.Matrix4(),up=new THREE.Vector3(0,1,0),ray=new THREE.Raycaster(),ndc=new THREE.Vector2();
  // Dress the island while it is still in the distance. Its fixtures belong
  // to the island; only gestures and the notification clock belong to a visit.
  function prepare(withVisitors=true){
    story.start();
    const openingShot=()=>story.update(0,holiday.sea.clock.value,true);
    openingShot();
    props.visible=true;world.visible=withVisitors;
    return openingShot;
  }
  function enter(landed=false){
    oldNear=camera.near;oldAspect=camera.aspect;oldFov=camera.fov;
    entryFov=THREE.MathUtils.radToDeg(2*Math.atan(1/camera.projectionMatrix.elements[5]));
    from.copy(camera.position);startRotation.copy(camera.quaternion);
    active=true;approaching=!landed;age=landed?1.35:0;lens=0;hand=null;dirty=true;
    if(landed)story.arrive?.();else prepare();
    camera.near=.00055;notify();
  }
  function cancelHand(){
    const old=hand;hand=null;dirty=true;
    if(old){story.end?.(true);if(canvas.hasPointerCapture(old.id))canvas.releasePointerCapture(old.id);}
  }
  function leave(){
    if(!active)return;
    cancelHand();story.stop?.();world.visible=active=false;
    camera.near=oldNear;camera.fov=oldFov;camera.aspect=oldAspect;
    changed('desk','');returned();
  }
  function tick(dt,time){
    const aspect=canvas.clientWidth/canvas.clientHeight,still=reduced();
    if(still&&wasReduced&&!dirty&&!approaching&&!story.animating&&camera.aspect===aspect){
      story.audio?.update(story.state==='quiet');return false;
    }
    wasReduced=still;dirty=false;age+=dt;const t=reduced()?1:THREE.MathUtils.smoothstep(age,0,1.35);
    if(approaching&&t===1){approaching=false;story.arrive?.();notify();}
    const shot=story.update(dt,time,reduced());lens=shot.lens||0;
    camera.position.lerpVectors(from,shot.eye,t);
    camera.position.y+=Math.sin(t*Math.PI)*Math.min(.07,.22*from.distanceTo(shot.eye));
    goalRotation.setFromRotationMatrix(look.lookAt(shot.eye,shot.target,up));
    camera.quaternion.slerpQuaternions(startRotation,goalRotation,t);
    camera.aspect=aspect;
    const portraitFov=THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(shot.fov)/2)/aspect));
    camera.fov=THREE.MathUtils.lerp(entryFov,Math.max(shot.fov,portraitFov),t);
    camera.updateProjectionMatrix();camera.updateMatrixWorld(true);return true;
  }
  function down(e){
    if(!active||approaching||hand||e.button!==0)return;
    const rect=canvas.getBoundingClientRect();
    ndc.set((e.clientX-rect.left)/rect.width*2-1,1-(e.clientY-rect.top)/rect.height*2);
    story.hit.updateWorldMatrix(true,true);
    const samples=e.pointerType==='touch'?[[0,0],[-9,0],[9,0],[0,-9],[0,9]]:[[0,0]];
    const hit=story.anywhere||samples.some(([dx,dy])=>{
      ray.setFromCamera(new THREE.Vector2(ndc.x+dx*2/rect.width,ndc.y+dy*2/rect.height),camera);
      return ray.intersectObject(story.hit,true).length>0;
    });
    if(!hit)return;
    dirty=true;
    canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);
    hand={id:e.pointerId,x:e.clientX,y:e.clientY,distance:0};story.begin?.();
  }
  function move(e){
    if(hand?.id!==e.pointerId)return;
    const dx=e.clientX-hand.x,dy=e.clientY-hand.y;
    dirty=true;hand.distance+=Math.hypot(dx,dy);hand.x=e.clientX;hand.y=e.clientY;story.drag?.(dx,dy);
  }
  function end(e){
    if(hand?.id!==e.pointerId)return;
    const cancelled=e.type!=='pointerup';
    if(!cancelled)move(e);
    const tap=hand.distance<6;hand=null;dirty=true;
    story.end?.(cancelled);
    if(tap&&!cancelled&&id!=='orange-book'&&!story.anywhere)story.activate();
  }
  return {id,prepare,stopPreview(){world.visible=false;},departure:story.departure||{points:[]},withdraw:story.withdraw,enter,leave,tick,down,move,end,cancelHand,
    action(sighting){if(!approaching)story.activate(sighting);},key(k){if(!approaching){dirty=true;story.key?.(k);}},
    get label(){return story.title;},get actionLabel(){return approaching?'':story.action;},
    get magnification(){return story.magnification;},
    setMagnification(value){if(active&&story.state==='looking'){story.setMagnification(value);dirty=true;}},
    get audio(){return story.audio;},get active(){return active;},get ashore(){return !approaching;},
    get phase(){return approaching?'approach':story.state;},get lens(){return lens;}};
}

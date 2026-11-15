import {createRoomWalk} from './room-walk.js';
import {roomVisible} from './cinema/room.js';

// All positions and headings live in the shoe's local space, so the underside
// is the ground even though world Y points the other way.
export function streetWalk(stage,pad,layout,paint){
  let above=false;
  function canStandAt(x,z){
    const surface=layout.walkSurface(x,z,above);
    if(!surface)return false;
    above=surface==='bridge';
    return true;
  }
  const walk=createRoomWalk({canStandAt,minEye:.033,maxEye:.033,standingEye:.033,crouchingEye:.033,stride:.185,collisionStep:.0015});
  const axes={move:{x:0,y:0},look:{x:0,y:0}},knob=pad.querySelector('.knob');
  let active=false,frame=0,last=0,aim=null,stick=null;
  const keys=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowLeft','ArrowRight','ArrowUp','ArrowDown']);
  function eye(){const pos=walk.position.clone();pos.y+=above?layout.bridge.height(pos.x):layout.groundHeight(pos.x,pos.z);return pos;}
  function draw(){const target=walk.target();target.y+=above?layout.bridge.height(walk.position.x):layout.groundHeight(walk.position.x,walk.position.z);paint(eye(),target);}
  function tick(t){
    if(!roomVisible()){stop();return;}
    if(!active)return;
    const dt=Math.max(0,Math.min((t-last)/1000,.08));last=t;
    const x=walk.position.x,z=walk.position.z,old=walk.target();
    walk.update(dt,axes);
    if(x!==walk.position.x||z!==walk.position.z||old.distanceToSquared(walk.target())>1e-12)draw();
    frame=requestAnimationFrame(tick);
  }
  function clear(){
    walk.clear();axes.move.x=axes.move.y=0;knob.style.transform='';
    for(const [el,id] of [[stage,aim?.id],[pad,stick]])if(id!=null&&el.hasPointerCapture(id))el.releasePointerCapture(id);
    aim=stick=null;
  }
  function start(eye,target,onDeck=false){
    cancelAnimationFrame(frame);
    clear();above=onDeck&&layout.walkSurface(eye.x,eye.z,true)==='bridge';
    walk.start(eye,target);active=true;last=performance.now();draw();frame=requestAnimationFrame(tick);
  }
  function stop(){active=false;cancelAnimationFrame(frame);clear();}
  function resume(){
    if(active||!roomVisible())return;
    active=true;last=performance.now();draw();frame=requestAnimationFrame(tick);
  }
  window.addEventListener('blur',clear);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)clear();});
  const key=(e,down)=>{
    if(!active||!keys.has(e.code)||e.altKey||e.metaKey||e.ctrlKey)return;
    e.preventDefault();walk.key(e.code,down);
  };
  window.addEventListener('keydown',e=>key(e,true));window.addEventListener('keyup',e=>key(e,false));
  stage.addEventListener('pointerdown',e=>{
    if(!active||e.target.closest('#pad')||e.button!==0||aim)return;
    e.preventDefault();stage.focus({preventScroll:true});aim={id:e.pointerId,x:e.clientX,y:e.clientY};stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove',e=>{
    if(!active||e.pointerId!==aim?.id)return;
    walk.dragLook((e.clientX-aim.x)/stage.clientWidth,(e.clientY-aim.y)/stage.clientHeight,e.pointerType);
    aim.x=e.clientX;aim.y=e.clientY;draw();
  });
  function endLook(e){if(e.pointerId===aim?.id)aim=null;}
  for(const type of ['pointerup','pointercancel','lostpointercapture'])stage.addEventListener(type,endLook);
  function moveStick(e){
    const rect=pad.getBoundingClientRect(),r=rect.width*.35;
    let x=(e.clientX-rect.left-rect.width/2)/r,y=(e.clientY-rect.top-rect.height/2)/r;
    const norm=Math.max(1,Math.hypot(x,y));x/=norm;y/=norm;
    axes.move.x=x;axes.move.y=y;knob.style.transform='translate('+x*r*.65+'px,'+y*r*.65+'px)';
  }
  pad.addEventListener('pointerdown',e=>{
    if(!active||stick!==null||e.button!==0)return;
    e.preventDefault();e.stopPropagation();stick=e.pointerId;pad.setPointerCapture(stick);moveStick(e);
  });
  pad.addEventListener('pointermove',e=>{if(e.pointerId===stick)moveStick(e);});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])pad.addEventListener(type,e=>{
    if(e.pointerId!==stick)return;
    stick=null;axes.move.x=axes.move.y=0;knob.style.transform='';
  });
  return {start,stop,resume,draw,get active(){return active;},get position(){return eye();},get onBridge(){return above;}};
}

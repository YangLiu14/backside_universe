import * as T from 'three';

// The case supplies collision geometry and eye heights in its own room units.
export function createRoomWalk({canStandAt,minEye,maxEye,standingEye,crouchingEye,
    stride=.55,liftSpeed=.56,collisionStep=.035,heightSwitch=(standingEye+crouchingEye)/2}) {
  const position=new T.Vector3(),held=new Set();
  let yaw=0,pitch=0,eyeHeight=1;
  function start(eye,target) {
    position.copy(eye);eyeHeight=eye.y;const dir=target.clone().sub(eye).normalize();
    yaw=Math.atan2(dir.x,-dir.z);pitch=Math.asin(dir.y);held.clear();
  }
  function look(dx,dy){
    yaw+=dx;pitch=T.MathUtils.clamp(pitch+dy,-1.29,1.29);
  }
  function move(side,forward) {
    const dx=side*Math.cos(yaw)+forward*Math.sin(yaw),dz=side*Math.sin(yaw)-forward*Math.cos(yaw);
    // Resolve small steps per axis so the viewer can slide along furniture and walls.
    const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/collisionStep));
    for(let i=0;i<steps;i++){
      if(canStandAt(position.x+dx/steps,position.z))position.x+=dx/steps;
      if(canStandAt(position.x,position.z+dz/steps))position.z+=dz/steps;
    }
  }
  function setHeight(value){eyeHeight=T.MathUtils.clamp(value,minEye,maxEye);}
  function lift(delta){setHeight(eyeHeight+delta);}
  const keys=new Set(['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','ArrowLeft','ArrowRight','ArrowUp','ArrowDown']);
  function key(code,down){
    if(!keys.has(code))return false;
    if(down)held.add(code);else held.delete(code);return true;
  }
  function update(dt,axes) {
    lift((Number(held.has('KeyE'))-Number(held.has('KeyQ')))*dt*liftSpeed);
    position.y=T.MathUtils.damp(position.y,eyeHeight,10,dt);
    const side=Number(held.has('KeyD'))-Number(held.has('KeyA'))+(axes?.move.x||0);
    const forward=Number(held.has('KeyW'))-Number(held.has('KeyS'))-(axes?.move.y||0);
    const norm=Math.max(1,Math.hypot(side,forward));
    move(side/norm*dt*stride,forward/norm*dt*stride);
    const turn=Number(held.has('ArrowRight'))-Number(held.has('ArrowLeft'))+(axes?.look.x||0);
    const tilt=Number(held.has('ArrowUp'))-Number(held.has('ArrowDown'))-(axes?.look.y||0);
    look(turn*dt*1.7,tilt*dt*1.3);
  }
  function dragLook(dx,dy,pointerType){
    // Deltas are fractions of the active viewport. Mouse aims; touch drags the scene.
    const direction=pointerType==='mouse'?1:-1;
    look(direction*dx*3.8,-direction*dy*2.25);
  }
  function target(){
    return position.clone().add(new T.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)));
  }
  return {position,target,start,look,dragLook,move,lift,key,update,toggleHeight:()=>setHeight(eyeHeight<heightSwitch?standingEye:crouchingEye),clear:()=>held.clear()};
}

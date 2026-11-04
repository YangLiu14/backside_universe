import * as THREE from '../vendor/three.module.js';

export function validateCalibration(value) {
  const keys=['x','y','z','yaw','pitch','roll','fov','distance'];
  if(!value || !keys.every(k=>Number.isFinite(value[k]))) throw new Error('机位参数必须是有限数字。');
  if(value.fov<15||value.fov>110||value.distance<.1||value.distance>30) throw new Error('视角或绕行半径超出范围。');
  return Object.fromEntries(keys.map(k=>[k,value[k]]));
}

export function orbitPose(input, angle) {
  const c=validateCalibration(input);
  if(!Number.isFinite(angle))throw new Error('绕行角度无效。');
  const a=THREE.MathUtils.degToRad(Math.max(-12,Math.min(12,angle)));
  const home=new THREE.Vector3(c.x,c.y,c.z);
  const orientation=new THREE.Quaternion().setFromEuler(new THREE.Euler(
    THREE.MathUtils.degToRad(c.pitch),THREE.MathUtils.degToRad(c.yaw),THREE.MathUtils.degToRad(c.roll),'YXZ'));
  const pivot=new THREE.Vector3(0,0,-c.distance).applyQuaternion(orientation).add(home);
  const turn=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),a);
  const position=home.clone().sub(pivot).applyQuaternion(turn).add(pivot);
  return {position:position.toArray(),quaternion:turn.multiply(orientation).toArray(),pivot:pivot.toArray()};
}

export function projectionBounds(c, crop, width=1320, height=1739, near=.01) {
  validateCalibration(c);
  const [x,y,w,h]=crop;
  // Retain the original photograph's estimated fx/fy ratio; FOV remains calibratable.
  const fy=height/(2*Math.tan(THREE.MathUtils.degToRad(c.fov)/2));
  const fx=fy*(1650.1209716796875/1553.64794921875),cx=width/2,cy=height/2;
  return [(x*width-cx)/fx*near,((x+w)*width-cx)/fx*near,
    -(y*height-cy)/fy*near,-((y+h)*height-cy)/fy*near];
}

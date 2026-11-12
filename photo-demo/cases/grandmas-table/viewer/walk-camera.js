import {createRoomWalk} from './room-walk.js';
import {footprint} from './room-interior.js';

export function roomWalk() {
  function inside(x,z) {
    if(Math.abs(x)<.535 && z>-.57 && z<.47)return false;
    return footprint.every(([ax,az],i)=>{
      const [bx,bz]=footprint[(i+1)%footprint.length],dx=bx-ax,dz=bz-az;
      return dx*(z-az)-dz*(x-ax)>.052*Math.hypot(dx,dz);
    });
  }
  return createRoomWalk({canStandAt:inside,minEye:.35,maxEye:1.31,standingEye:1.04,crouchingEye:.44,heightSwitch:.7});
}

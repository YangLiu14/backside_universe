import * as THREE from 'three';
import {bedrock,piece,rod,surface,vec} from './island-props.js';
import {waterHeightProbe} from './ocean-surface.js';

function coastalSailboat(parent){
  const boat=new THREE.Group();parent.add(boat);boat.name='Ochre-sailed coastal cutter';
  const wood=surface('#73503d'),canvas=surface('#bf7050',0,.92);canvas.side=THREE.DoubleSide;
  const points=[],index=[];
  for(let i=0;i<=16;i++){
    const x=i/8-1,b=Math.sin(Math.PI*i/16)**.78;
    points.push(x*.012,.0012+.001*(1-b),b*.0037,x*.012,-.0016,0,x*.012,.0012+.001*(1-b),-b*.0037);
    if(i){const a=3*i;index.push(a-3,a-2,a,a,a-2,a+1,a+1,a-2,a-1,a-1,a+2,a+1,a-3,a,a+2,a-3,a+2,a-1);}
  }
  const hull=new THREE.BufferGeometry();hull.setAttribute('position',new THREE.Float32BufferAttribute(points,3));hull.setIndex(index);hull.computeVertexNormals();
  wood.side=THREE.DoubleSide;piece(boat,hull,wood);
  rod(boat,vec(-.002,.001,0),vec(-.002,.023,0),.00045,.00025,wood);
  const sail=new THREE.BufferGeometry();sail.setAttribute('position',new THREE.Float32BufferAttribute([
    -.0015,.022,0,.010,.003,0,-.0015,.003,0,.0015,.011,.0017,
  ],3));sail.setIndex([0,3,2,0,1,3,3,1,2]);sail.computeVertexNormals();piece(boat,sail,canvas);
  const jib=surface('#eee3c9');jib.side=THREE.DoubleSide;
  const fore=new THREE.BufferGeometry();fore.setAttribute('position',new THREE.Float32BufferAttribute([-.003,.019,0,-.011,.003,0,-.004,.004,.0006],3));fore.computeVertexNormals();piece(boat,fore,jib);
  return boat;
}

export function createCliffLookout({island,props,world,holiday,notify}){
  const base=bedrock(island,.314,-.282);
  const brass=surface('#bc9352',.65,.32),black=surface('#263d3e',.58,.37),stone=surface('#c9bba2');
  const mount=new THREE.Group();mount.position.copy(base);mount.scale.setScalar(.57);props.add(mount);
  piece(mount,new THREE.CylinderGeometry(.045,.052,.045,10),stone,0,-.012);
  piece(mount,new THREE.CylinderGeometry(.023,.036,.012,28),brass,0,.016);
  rod(mount,vec(0,.02,0),vec(0,.122,0),.012,.009,black);
  const tube=new THREE.Group();tube.name='Brass telescope';mount.add(tube);tube.position.y=.132;
  for(const x of [-.021,.021])rod(mount,vec(x*.47,.097,0),vec(x,.134,0),.006,.006,brass);
  const barrel=(start,end,ra,rb,mat)=>rod(tube,vec(0,0,start),vec(0,0,end),ra,rb,mat);
  barrel(-.088,-.055,.014,.012,black);barrel(-.057,-.032,.011,.016,brass);
  barrel(-.034,.077,.019,.027,black);barrel(.069,.096,.029,.029,brass);
  for(let i=0;i<6;i++)barrel(-.074+i*.0028,-.073+i*.0028,.0147,.0147,black);
  barrel(-.026,-.019,.02,.02,brass);barrel(.036,.040,.026,.026,brass);
  const glass=surface('#0f4858',.42,.15);barrel(.096,.097,.023,.023,glass);
  for(const x of [-.022,.022])piece(tube,new THREE.SphereGeometry(.006,12,8),brass,x,0,0);
  const pivot=island.localToWorld(base.clone().add(vec(0,.132*.57,0)));
  const bay=island.localToWorld(vec(.82,0,-.19));bay.y=holiday.surface(bay.x,bay.z);
  const view=bay.clone().sub(pivot).normalize();
  const azimuth=Math.atan2(view.x,view.z),elevation=Math.asin(view.y);
  const pierEye=island.localToWorld(base.clone().add(vec(.213,.205,.242)));
  const boat=coastalSailboat(world);
  const start=island.localToWorld(vec(.70,0,-.54)),end=island.localToWorld(vec(.99,0,-.56));
  const probes=Array.from({length:13},(_,i)=>{const q=start.clone().lerp(end,i/12);return waterHeightProbe(holiday.table,q.x,q.z);});
  const eye=new THREE.Vector3(),target=new THREE.Vector3(),dir=new THREE.Vector3();
  const baseFov=44,defaultPower=2;
  let yaw=0,pitch=0,looking=false,eyeBlend=0,power=defaultPower;
  function aimAt(point){
    const bearing=point.clone().sub(pivot).normalize(),offset=Math.atan2(bearing.x,bearing.z)-azimuth;
    yaw=Math.atan2(Math.sin(offset),Math.cos(offset));pitch=Math.asin(bearing.y)-elevation;
  }
  function turn(dx,dy){
    yaw=THREE.MathUtils.clamp(yaw+dx,-1.15,1.15);
    pitch=THREE.MathUtils.clamp(pitch+dy,-.62,.60);
  }
  return {
    departure:{points:[pierEye]},
    withdraw(t){if(t>.4)tube.visible=true;},
    title:'白崖 · 望远镜',hit:tube,get anywhere(){return looking;},
    get state(){return looking?'looking':'telescope';},
    get hint(){return looking?'拖动镜筒扫过海面，也可用方向键。':'点一下崖边的望远镜。';},
    get action(){return looking?'放下镜筒':'凑近目镜';},
    get magnification(){return power;},
    setMagnification(value){power=THREE.MathUtils.clamp(value,1,6);},
    start(){
      looking=false;eyeBlend=0;power=defaultPower;
      const time=holiday.sea.clock.value,u=.5+.47*Math.sin(time*.116);
      const first=start.clone().lerp(end,u);first.y=holiday.surface(first.x,first.z)+.010;
      aimAt(first);turn(.045,.018);
    },
    activate(sighting){if(!looking&&sighting)aimAt(sighting);looking=!looking;notify();},
    drag(dx,dy){if(looking)turn(-dx*.004*defaultPower/power,-dy*.003*defaultPower/power);},
    key(key){if(!looking)return;const d=.046*defaultPower/power;if(key==='ArrowLeft')turn(d,0);if(key==='ArrowRight')turn(-d,0);if(key==='ArrowUp')turn(0,d);if(key==='ArrowDown')turn(0,-d);},
    update(dt,time,reduced){
      eyeBlend=reduced?Number(looking):THREE.MathUtils.damp(eyeBlend,Number(looking),5.4,dt);
      if(Math.abs(Number(looking)-eyeBlend)<.001)eyeBlend=Number(looking);
      // Magnification scales focal length, so a centred boat keeps its bearing.
      const opticalFov=THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(baseFov/2))/power));
      dir.setFromSphericalCoords(1,Math.PI/2-elevation-pitch,azimuth+yaw);
      tube.lookAt(target.copy(pivot).add(dir));
      // Rotate the optical view close to its pivot so a small pan keeps the
      // passing boats in sight at miniature distances.
      eye.copy(pivot).addScaledVector(dir,.004).lerp(pierEye,1-eyeBlend);
      target.copy(pivot).addScaledVector(dir,.14*eyeBlend);
      const u=.5+.47*Math.sin(time*.116);
      boat.position.lerpVectors(start,end,u);const n=u*12,i=Math.min(11,Math.floor(n));
      boat.position.y=THREE.MathUtils.lerp(probes[i](time),probes[i+1](time),n-i);
      boat.rotation.set(.035*Math.cos(time),-.36,.06*Math.sin(time*.91));
      tube.visible=eyeBlend<.88;
      return {eye,target,fov:THREE.MathUtils.lerp(baseFov,opticalFov,eyeBlend),lens:eyeBlend};
    },
  };
}

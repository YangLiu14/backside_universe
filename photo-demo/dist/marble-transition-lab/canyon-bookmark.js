import * as THREE from 'three';
import {bedrock,piece,rod,surface,vec} from './island-props.js';

function wovenRibbon(){
  const c=document.createElement('canvas');c.width=256;c.height=128;
  const g=c.getContext('2d');g.fillStyle='#bb562d';g.fillRect(0,0,256,128);
  for(let y=0;y<128;y+=2){
    g.fillStyle=y%4?'#e1a167':'#c67c4b';g.fillRect(0,y,256,1);
    for(let x=y%6;x<256;x+=6){g.fillStyle='#86503e';g.fillRect(x,y,2,1);}
  }
  for(const y of [5,10,116,121]){g.fillStyle='#edc88f';g.fillRect(0,y,256,2);}
  g.fillStyle='#f5ce83';
  for(let x=8;x<256;x+=24){
    g.beginPath();g.moveTo(x,58);g.lineTo(x+5,64);g.lineTo(x,70);g.lineTo(x-5,64);g.closePath();g.fill();
  }
  const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;
  map.wrapS=THREE.RepeatWrapping;map.repeat.x=5;map.anisotropy=4;return map;
}

export function createCanyonBookmark({island,props,notify}){
  const anchors=[bedrock(island,-.233,.157),bedrock(island,.139,.204)];
  const brass=surface('#ab8146',.62,.36),dark=surface('#5a4239',.38,.64);
  for(const ground of anchors){
    piece(props,new THREE.CylinderGeometry(.012,.016,.013,18),dark,ground.x,ground.y+.003,ground.z);
    rod(props,ground,ground.clone().add(vec(0,.042,0)),.006,.004,brass);
    ground.y+=.039;
    piece(props,new THREE.TorusGeometry(.008,.002,8,20),brass,...ground.toArray()).rotation.y=Math.PI/2;
  }
  const [a,b]=anchors,mid=a.clone().lerp(b,.5),span=a.distanceTo(b);
  const across=vec(b.z-a.z,0,a.x-b.x).normalize();
  const length=48,width=12,indices=[],uv=[];
  for(let j=0;j<=width;j++)for(let i=0;i<=length;i++){
    uv.push(i/length,j/width);
    if(i&&j){const d=j*(length+1)+i,c=d-1,b=d-length-1;indices.push(b-1,c,b,b,c,d);}
  }
  const geometry=new THREE.BufferGeometry(),vertices=new THREE.Float32BufferAttribute(new Float32Array(uv.length*1.5),3);
  vertices.setUsage(THREE.DynamicDrawUsage);geometry.setAttribute('position',vertices);
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);
  const fabric=piece(props,geometry,new THREE.MeshStandardMaterial({map:wovenRibbon(),roughness:.91,side:THREE.DoubleSide}));
  fabric.name='Woven orange bookmark';fabric.frustumCulled=false;
  const outside=mid.clone().add(vec(.032,.202,.415)),eye=new THREE.Vector3(),target=new THREE.Vector3(),p=new THREE.Vector3();
  let pressure=0,dragging=false,resting=false,settle=0,clock=0,lastShape=-1,lastSway=0;
  function cloth(sag,sway){
    if(Math.abs(lastShape-sag)+Math.abs(lastSway-sway)<.00003)return;
    lastShape=sag;lastSway=sway;
    for(let j=0;j<=width;j++)for(let i=0;i<=length;i++){
      const t=i/length,v=j/width*2-1,u=Math.sin(Math.PI*t),gather=u**.64;
      const wide=.003+.023*gather+.038*gather*sag;
      p.lerpVectors(a,b,t).addScaledVector(across,v*wide+sway*u);
      p.y-=u*(.008+.098*sag);
      p.y+=(.021*v*v+.0022*Math.sin(v*13+t*5))*gather*sag;
      vertices.setXYZ(j*(length+1)+i,p.x,p.y,p.z);
    }
    vertices.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingSphere();
  }
  function lieDown(){resting=true;dragging=false;clock=0;notify();}
  return {
    departure:{points:[island.localToWorld(outside.clone())]},
    title:'橙书 · 峡谷',hit:fabric,get state(){return resting?'resting':'bookmark';},
    get hint(){return resting?'抬头，歇一会儿。':'按住橙色书签向下拖，再松手。';},
    get action(){return resting?'坐起来':'压低书签';},
    start(){pressure=0;dragging=false;resting=false;settle=0;clock=0;cloth(0,0);},
    begin(){dragging=!resting;},
    drag(dx,dy){if(dragging)pressure=THREE.MathUtils.clamp(pressure+dy/90,0,1);},
    end(cancel){dragging=false;if(!cancel&&!resting&&pressure>.36)lieDown();},
    activate(){if(resting){resting=false;notify();}else lieDown();},
    update(dt,time,reduced){
      if(!dragging)pressure=reduced?Number(resting):THREE.MathUtils.damp(pressure,Number(resting),8,dt);
      settle=reduced?Number(resting):THREE.MathUtils.damp(settle,Number(resting),2.6,dt);
      clock+=dt;
      const sway=resting&&!reduced?.015*Math.sin(clock*4.4)*Math.exp(-clock*1.05)*settle:0;
      cloth(pressure,sway);
      const seat=vec(mid.x,mid.y-.102+.046,mid.z+sway);
      eye.copy(outside).lerp(seat,settle);
      target.copy(mid);target.y-=.038*pressure;
      const sky=vec(mid.x+span*.29,mid.y+.19,mid.z-.07+sway);
      target.lerp(sky,settle);
      return {eye:island.localToWorld(eye),target:island.localToWorld(target),fov:48+16*settle};
    },
  };
}

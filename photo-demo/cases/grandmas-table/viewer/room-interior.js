// Architectural lining, in the same coordinates as the dining table.
import * as T from 'three';
import {bay,block,makeWindow,pendant,towelHook} from './fixtures.js';

export const footprint=[[-.89,.77],[-1.12,.22],[-1.08,-.38],[-.74,-.89],[.74,-.89],[1.08,-.38],[1.12,.22],[.89,.77]];
const paint=(color,roughness=.82)=>new T.MeshStandardMaterial({color,roughness});

function wallPaper(parent,width,height,x,y,z,draw){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=640;
  draw(canvas.getContext('2d'));
  const t=new T.CanvasTexture(canvas);t.colorSpace=T.SRGBColorSpace;t.anisotropy=4;
  const plane=new T.Mesh(new T.PlaneGeometry(width,height),new T.MeshStandardMaterial({map:t,transparent:true,roughness:.93}));
  plane.receiveShadow=true;plane.position.set(x,y,z);parent.add(plane);return plane;
}

function familyWall(wall,textures,trim) {
  const x=.43,y=1.135;
  block(wall,.341,.237,.021,x,y,.009,trim);
  block(wall,.323,.220,.015,x,y,.023,paint(0x967950));
  block(wall,.313,.210,.012,x,y,.031,paint(0xcaab7f));
  const photo=new T.Mesh(new T.PlaneGeometry(.285,.18),new T.MeshStandardMaterial({map:textures.family,roughness:.56}));
  photo.position.set(x,y,.038);wall.add(photo);
  const cal=.242,base=.881;
  block(wall,.15,.188,.009,cal,base,.014,paint(0x77583b));
  wallPaper(wall,.143,.181,cal,base,.023,ctx=>{
    ctx.fillStyle='#ecdfbf';ctx.fillRect(0,0,512,640);ctx.fillStyle='#96392d';ctx.fillRect(0,0,512,114);
    ctx.textAlign='center';ctx.fillStyle='#f9eacb';ctx.font='42px serif';ctx.fillText('一 九 九 三',256,75);
    ctx.fillStyle='#4a4035';ctx.font='52px serif';ctx.fillText('十 一 月',256,210);
    ctx.font='bold 235px Georgia';ctx.fillText('23',256,441);
    ctx.strokeStyle='#b16e55';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(45,484);ctx.lineTo(467,484);ctx.stroke();
    ctx.fillStyle='#8c4f3a';ctx.font='39px serif';ctx.fillText('星 期 二',256,548);
    ctx.fillStyle='#9c8f78';for(let i=0;i<4;i++)ctx.fillRect(10,620+i*4,492,1);
  });
  // The height marks put the seated child's eye level in the history of this room.
  wallPaper(wall,.126,.28,.115,.899,.001,ctx=>{
    for(const [i,label] of ['九〇','九二','九三'].entries()){
      const py=518-i*171;ctx.strokeStyle='rgba(57,54,46,.70)';ctx.lineWidth=3.5;ctx.beginPath();
      ctx.moveTo(35,py);ctx.lineTo(201+i*24,py-3);ctx.stroke();ctx.fillStyle='rgba(56,52,45,.76)';
      ctx.font='italic 54px serif';ctx.fillText(label,210,py-10);
    }
  });
}

export function furnishRoom(group,textures,clock){
  const plaster=new T.MeshStandardMaterial({map:textures.plaster,color:0xeee0bd,bumpMap:textures.plaster,bumpScale:.002,roughness:.94});
  plaster.onBeforeCompile=shader=>{
    shader.vertexShader='attribute vec3 roomCoordinate;varying vec3 roomPoint;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nroomPoint=roomCoordinate;');
    shader.fragmentShader='varying vec3 roomPoint;\n'+shader.fragmentShader.replace('#include <map_fragment>',`
      #include <map_fragment>
      float ambient=.78+.22*smoothstep(.53,.66,roomPoint.y);
      ambient*=1.-.33*smoothstep(1.23,1.44,roomPoint.y);
      float fromWindow=length((roomPoint-vec3(-.31,1.04,-.89))*vec3(.81,1.6,.92));
      float daylight=exp(-2.5*fromWindow*fromWindow);
      float recess=1.-.23*smoothstep(.5,1.2,abs(roomPoint.x));
      diffuseColor.rgb*=ambient*recess*mix(vec3(.98,.945,.90),vec3(.87,.95,1.08),daylight);
    `);
  };
  const panel=new T.MeshStandardMaterial({map:textures.plaster,color:0x6f7968,bumpMap:textures.plaster,bumpScale:.0008,roughness:.72});
  const panelInset=paint(0x474e44);
  const trim=new T.MeshStandardMaterial({map:textures.elm,color:0xc5afa0,roughness:.62});
  const rail=trim.clone();rail.color.set(0xe1c6a8);
  let glass;
  for(let i=0;i<footprint.length-1;i++){
    const [x,z]=footprint[i],[nx,nz]=footprint[i+1],w=Math.hypot(nx-x,nz-z);
    const wall=new T.Group();wall.position.set((x+nx)/2,0,(z+nz)/2);wall.rotation.y=-Math.atan2(nz-z,nx-x);group.add(wall);
    if(i===3){
      const left=bay.x-bay.w/2,right=bay.x+bay.w/2;
      for(const [a,b,bottom,top] of [[-w/2,left,.53,1.455],[right,w/2,.53,1.455],[left,right,.53,bay.lo],[left,right,bay.hi,1.455]]){
        block(wall,b-a,top-bottom,.034,(a+b)/2,(top+bottom)/2,-.021,plaster);
      }
      glass=makeWindow(wall,textures,clock);familyWall(wall,textures,trim);
    }else block(wall,w+.008,.925,.034,0,.992,-.021,plaster);
    block(wall,w+.012,.45,.036,0,.307,-.018,panelInset);
    const boards=Math.ceil(w/.118);
    for(let j=0;j<boards;j++)block(wall,w/boards-.003,.38,.010,(j+.5)*w/boards-w/2,.31,.005,panel);
    block(wall,w+.02,.034,.039,0,.534,.016,rail);
    block(wall,w+.014,.010,.044,0,.552,.017,trim);
    block(wall,w+.018,.049,.043,0,.105,.015,trim);
    block(wall,w+.014,.042,.042,0,1.427,.017,trim);
    if(i!==3)block(wall,.025,.88,.032,-w/2+.01,.985,.003,trim);
    if(i===4)towelHook(wall);
  }
  for(const z of [-.55,-.09,.42]){
    const w=2*Math.sqrt(1.16**2-z*z);block(group,w,.055,.044,0,1.415,z,trim);
  }
  group.updateMatrixWorld(true);
  group.traverse(o=>{
    if(o.material!==plaster)return;
    const pos=o.geometry.attributes.position,coords=new Float32Array(pos.count*3),p=new T.Vector3();
    for(let i=0;i<pos.count;i++)p.fromBufferAttribute(pos,i).applyMatrix4(o.matrixWorld).toArray(coords,i*3);
    o.geometry.setAttribute('roomCoordinate',new T.BufferAttribute(coords,3));
  });
  const boards=textures.elm.clone();boards.needsUpdate=true;boards.wrapS=boards.wrapT=T.MirroredRepeatWrapping;boards.repeat.set(1.3,2.6);
  const floor=new T.Mesh(new T.CylinderGeometry(1.19,1.17,.07,96),new T.MeshStandardMaterial({map:boards,color:0xb69e88,roughness:.74,bumpMap:boards,bumpScale:.0014}));
  floor.position.y=.045;floor.receiveShadow=true;group.add(floor);
  for(let i=-6;i<=6;i++){
    const z=i*.165,w=2*Math.sqrt(1.16**2-z*z);
    block(group,w,.001,.0025,0,.0805,z,trim);
  }
  const lamp=pendant(group);
  const light=new T.PointLight(0xffbf83,.50,2.65,2);
  light.position.copy(lamp.position);light.position.y-=.107;group.add(light);
  const pool=new T.SpotLight(0xffcb92,1.65,3.1,.98,.77,2);
  pool.position.copy(light.position);pool.target.position.set(-.02,.26,.10);
  pool.castShadow=true;pool.shadow.mapSize.set(1024,1024);pool.shadow.bias=-.0004;pool.shadow.normalBias=.001;
  group.add(pool,pool.target);
  const dusk=new T.PointLight(0xb9d7e1,.58,2.75,2);dusk.position.set(bay.x-.19,1.19,-1.33);group.add(dusk);
  const bounce=new T.PointLight(0xffdaa6,.16,2.05,2);bounce.position.set(.38,.61,.67);group.add(bounce);
  return glass;
}

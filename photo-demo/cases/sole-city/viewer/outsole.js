// Local +Z is the toe. The underside is held intact until the camera clears the floor.
import * as T from 'three';

import {revealStart} from './film-time.js';
const revealEnd = .682, bands = 13;
const clamp = T.MathUtils.clamp, smooth = T.MathUtils.smoothstep;

export function reaches(z) {
  const fraction = clamp((z + 1.13) / 2.26, 0, 1);
  const t = .5 - Math.sin(Math.asin(1 - 2*fraction) / 3);
  return T.MathUtils.lerp(revealStart, revealEnd, t);
}

function photoHeights(image) {
  const canvas = document.createElement('canvas');
  const {width,height} = image;
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image,0,0);
  const {data} = ctx.getImageData(0,0,width,height);
  return (u,v) => {
    const i = 4 * (Math.round((1-v)*(height-1))*width + Math.round(u*(width-1)));
    const red=data[i], green=data[i+1], blue=data[i+2];
    // Dark grooves sit below the navy heel blocks. The lime forefoot and pale
    // arch shank are different compounds with separate contact heights.
    const light=(red*.23+green*.57+blue*.20)/255;
    const lug=smooth(light,.07,.27);
    const lime=smooth((red+green)/2-blue,14,54);
    return .006 + .006*lug + .005*lime + .0025*light;
  };
}

// Neighboring longitudinal targets share the row between them. Each delta is
// measured from the original mesh, so dragging backwards restores every vertex.
function surface(boundsAt, columns, rows, treadHeight, material) {
  const positions=[], uv=[], indices=[];
  const targets=Array.from({length:bands},()=>[]);
  const isTread=Boolean(treadHeight);
  for(let j=0;j<=rows;j++){
    const v=j/rows, z=(v-.5)*(isTread?1.982:1.954);
    const [l,r]=boundsAt(z), inset=isTread?.002:.006;
    const band=(z+1)*.5*(bands-1);
    for(let i=0;i<=columns;i++){
      const u=i/columns, x=T.MathUtils.lerp(l+inset,r-inset,u);
      const edge=Math.min(u,1-u)*Math.max(0,r-l-2*inset);
      const bevel=smooth(Math.min(edge,.991-Math.abs(z)),0,.012);
      const y=isTread?T.MathUtils.lerp(-.008,treadHeight(u,v),bevel):-.041;
      const finished=isTread?-.018:.0025;
      positions.push(x,y,z);
      if(isTread) uv.push(u,v); else uv.push(x,-z);
      for(let k=0;k<bands;k++){
        targets[k].push(0,(finished-y)*Math.max(0,1-Math.abs(k-band)),0);
      }
      if(i&&j){
        const d=j*(columns+1)+i,c=d-1,b=d-columns-1,a=b-1;
        indices.push(a,c,b,b,c,d);
      }
    }
  }
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  geometry.morphTargetsRelative=true;
  geometry.morphAttributes.position=targets.map(values=>new T.Float32BufferAttribute(values,3));
  const mesh=new T.Mesh(geometry,material);
  mesh.receiveShadow=true;
  mesh.userData.outsoleSurface=isTread?'tread':'pavement';
  mesh.name=isTread?'Outsole tread':'Recessed pavement';
  return mesh;
}

export async function makeOutsole(city,boundsAt,roadMaterial) {
  // Both images share the rectified UVs. Only the photographed grooves drive the relief.
  const [albedo,relief]=await Promise.all([
    new T.TextureLoader().loadAsync('./tread-albedo.webp'),
    new T.ImageLoader().loadAsync('./tread.jpg')
  ]);
  albedo.colorSpace=T.SRGBColorSpace;albedo.anisotropy=8;
  const rubber=new T.MeshStandardMaterial({map:albedo,roughness:.89,color:0xe4e2de});
  const tread=surface(boundsAt,64,204,photoHeights(relief),rubber);
  const bed=surface(boundsAt,2,96,null,roadMaterial);
  city.add(tread,bed);
  return p=>{
    const front=T.MathUtils.lerp(-1.13,1.13,smooth(p,revealStart,revealEnd));
    for(let k=0;k<bands;k++){
      const z=-1+2*k/(bands-1);
      const coverage=smooth(front,z-.12,z+.12);
      tread.morphTargetInfluences[k]=coverage;
      bed.morphTargetInfluences[k]=coverage;
    }
    // In the settled zones the tread has sunk into the Hi3D rubber base.
    // Skip fully occluded surfaces at either end of the motion.
    tread.visible=tread.morphTargetInfluences[bands-1]<1;
    bed.visible=bed.morphTargetInfluences[0]>0;
    return {rubber:tread.visible,pavement:bed.visible,heel:bed.morphTargetInfluences[0],toe:bed.morphTargetInfluences[bands-1]};
  };
}

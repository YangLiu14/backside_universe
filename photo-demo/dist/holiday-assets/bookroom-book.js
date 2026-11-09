import {t,isEnglish,localizedTexture} from '../i18n/core.js';
import * as THREE from '../vendor/three.module.js';
import {sourceCrop} from '../marble-transition-lab/journey.js';

export const INPUT_PHOTO='../assets/desk-original.jpg';

export function bookView({center,right,up,normal},aspect,zoom){
 const fov=48,target=center.clone();let distance;
 if(zoom){
  const [x,y,w,h]=sourceCrop(aspect);
  target.addScaledVector(right,x+w/2-.5).addScaledVector(up,.5-y-h/2);
  distance=up.length()*h/(2*Math.tan(THREE.MathUtils.degToRad(fov/2)));
 }else{
  target.addScaledVector(right,-.65);
  distance=Math.max(up.length()*1.65,right.length()*2.8/aspect)/(2*Math.tan(THREE.MathUtils.degToRad(fov/2)));
 }
 const position=target.clone().addScaledVector(normal,distance);
 if(!zoom)position.addScaledVector(up.clone().normalize(),-distance*.28);
 const quaternion=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(position,target,up.clone().normalize()));
 return {position,quaternion,fov};
}

// The original Tripo desk already contains this open book. Project ink onto
// its actual curved pages; leave the GLB, lamp, paper edges and binding intact.
// Coordinates here are in the unscaled desk GLB, before furniture placement.
export async function printBook(desk){
 const [texture,surface]=await Promise.all([
  new THREE.TextureLoader().loadAsync(INPUT_PHOTO),
  fetch(new URL('assets/bookroom/page-surfaces.json',import.meta.url)).then(response=>{
   if(!response.ok)throw Error('书页曲面未能载入');
   return response.json();
  }),
 ]);
 texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;
 // These heights were sampled from this same immutable GLB at build time.
 function ink(name,map,{z,width,height,heights}){
  const geometry=new THREE.PlaneGeometry(width,height,surface.columns,surface.rows),p=geometry.attributes.position;
  if(p.count!==heights.length)throw Error('书页曲面尺寸不符');
  for(let i=0;i<p.count;i++)p.setXYZ(i,surface.centerX+p.getY(i),heights[i],z+p.getX(i));
  geometry.computeVertexNormals();
  const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({map,transparent:true,alphaTest:.01,toneMapped:false}));
  mesh.name=name;desk.add(mesh);return mesh;
 }
 const {width,height,z}=surface.photo;
 const photo=ink('input-photograph-on-open-book',texture,surface.photo);
 const canvas=document.createElement('canvas');canvas.width=660;canvas.height=870;
 const ctx=canvas.getContext('2d');
 const words=new THREE.CanvasTexture(canvas);words.colorSpace=THREE.SRGBColorSpace;words.anisotropy=8;
 localizedTexture(words,()=>{
  ctx.clearRect(0,0,660,870);ctx.fillStyle='#574c3b';ctx.textAlign='center';
  ctx.font='23px Georgia,serif';ctx.fillText('A HOLIDAY BEHIND THE DESK',330,190,580);
  ctx.font=isEnglish()?'38px Georgia,serif':'42px "Songti SC",serif';ctx.fillText(t('工位背后的年假'),330,300,580);
  ctx.fillStyle='#8b7860';ctx.font=isEnglish()?'27px Georgia,serif':'27px "Songti SC",serif';
  for(const [i,line] of ['一张书桌，一片海。','翻过日常，','又回到日常。'].entries())ctx.fillText(t(line),330,420+i*52,580);
  ctx.fillRect(290,616,80,1);ctx.font='21px Georgia,serif';ctx.fillText('01',330,680);
 });
 ink('book-dedication',words,surface.dedication);
 const center=new THREE.Vector3(surface.centerX,surface.centerY,z);
 return {photo,width,height,center,
  frame(){
   photo.updateWorldMatrix(true,false);
   const point=p=>photo.localToWorld(p.clone());
   const c=point(center),right=point(center.clone().add(new THREE.Vector3(0,0,width))).sub(c),up=point(center.clone().add(new THREE.Vector3(height,0,0))).sub(c);
   return {center:c,right,up,normal:right.clone().cross(up).normalize()};
  }};
}

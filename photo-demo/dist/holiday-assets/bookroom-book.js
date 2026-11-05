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
 const texture=await new THREE.TextureLoader().loadAsync(INPUT_PHOTO);
 texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;
 desk.updateMatrixWorld(true);
 const ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0),inverse=desk.matrixWorld.clone().invert();
 const surfaces=[...desk.children];
 function heightAt(x,z){
  ray.set(new THREE.Vector3(x,2,z),down);
  const hit=ray.intersectObjects(surfaces,true)[0];
  if(!hit)throw Error('书页表面未找到');
  return hit.point.clone().applyMatrix4(inverse).y+.00065;
 }
 function ink(name,map,z,width,height){
  const geometry=new THREE.PlaneGeometry(width,height,20,28),p=geometry.attributes.position;
  for(let i=0;i<p.count;i++){
   const x=.047+p.getY(i),depth=z+p.getX(i);
   p.setXYZ(i,x,heightAt(x,depth),depth);
  }
  geometry.computeVertexNormals();
  const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({map,transparent:true,alphaTest:.01,toneMapped:false}));
  mesh.name=name;desk.add(mesh);return mesh;
 }
 const width=.125,height=width*1739/1320,z=.108;
 const photo=ink('input-photograph-on-open-book',texture,z,width,height);
 const canvas=document.createElement('canvas');canvas.width=660;canvas.height=870;
 const ctx=canvas.getContext('2d');ctx.fillStyle='#574c3b';ctx.textAlign='center';
 ctx.font='23px Georgia, serif';ctx.fillText('A HOLIDAY BEHIND THE DESK',330,190);
 ctx.font='42px "Songti SC", serif';ctx.fillText('工位背后的年假',330,300);
 ctx.fillStyle='#8b7860';ctx.font='27px "Songti SC", serif';
 for(const [i,line] of ['一张书桌，一片海。','翻过日常，','又回到日常。'].entries())ctx.fillText(line,330,420+i*52);
 ctx.fillRect(290,616,80,1);ctx.font='21px Georgia, serif';ctx.fillText('01',330,680);
 const words=new THREE.CanvasTexture(canvas);words.colorSpace=THREE.SRGBColorSpace;words.anisotropy=8;
 ink('book-dedication',words,-.065,.125,.165);
 const center=new THREE.Vector3(.047,heightAt(.047,z),z);
 return {photo,width,height,center,
  frame(){
   photo.updateWorldMatrix(true,false);
   const point=p=>photo.localToWorld(p.clone());
   const c=point(center),right=point(center.clone().add(new THREE.Vector3(0,0,width))).sub(c),up=point(center.clone().add(new THREE.Vector3(height,0,0))).sub(c);
   return {center:c,right,up,normal:right.clone().cross(up).normalize()};
  }};
}

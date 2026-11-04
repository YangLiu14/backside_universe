import * as THREE from 'three';

/** Original RGB on a monocular-depth surface; no generated replacement pixels.
 * Small-angle use only. The inverse-depth scale is fitted to visible desk points.
 * Hidden surfaces are intentionally handed to the authored world at the seam.
 */
export async function createPhotoVolume(photoCamera, photograph, pointOnDesk) {
  const depthImage = await new THREE.TextureLoader().loadAsync('./assets/desk-depth-8bit.png');
  const image = depthImage.image;
  const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
  const ctx = canvas.getContext('2d', {willReadFrequently:true}); ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0,0,canvas.width,canvas.height).data;
  function disparity(u,v) {
    const x=Math.min(image.width-1,Math.max(0,Math.round(u*(image.width-1))));
    const y=Math.min(image.height-1,Math.max(0,Math.round(v*(image.height-1))));
    return pixels[(y*image.width+x)*4]/255;
  }
  const forward = photoCamera.getWorldDirection(new THREE.Vector3());
  const anchors = [[220,900],[390,870],[740,822],[925,767],[459,739],[697,725]];
  const pairs = anchors.map(([x,y])=>[disparity(x/1320,y/1739),1/pointOnDesk(x,y,0).sub(photoCamera.position).dot(forward)]);
  const mx=pairs.reduce((a,p)=>a+p[0],0)/pairs.length,my=pairs.reduce((a,p)=>a+p[1],0)/pairs.length;
  let slope=pairs.reduce((a,p)=>a+(p[0]-mx)*(p[1]-my),0)/Math.max(.00001,pairs.reduce((a,p)=>a+(p[0]-mx)**2,0));
  slope=THREE.MathUtils.clamp(slope,.015,.22);const intercept=my-slope*mx;
  const columns=220, rows=290, positions=[],uvs=[],indices=[];
  const ray=new THREE.Vector3();
  for(let y=0;y<=rows;y++)for(let x=0;x<=columns;x++){
    const u=x/columns,v=y/rows;
    const z=THREE.MathUtils.clamp(1/Math.max(.035,slope*disparity(u,v)+intercept),4,26);
    ray.set(u*2-1,1-v*2,.5).unproject(photoCamera).sub(photoCamera.position);
    ray.multiplyScalar(z/ray.dot(forward)).add(photoCamera.position);
    positions.push(ray.x,ray.y,ray.z);uvs.push(u,1-v);
    if(x<columns&&y<rows){const a=y*(columns+1)+x,b=a+columns+1;indices.push(a,b,a+1,a+1,b,b+1);}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);
  const surface=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({map:photograph,side:THREE.DoubleSide,toneMapped:false}));
  surface.name='Original photograph reconstructed with local DA3 depth';
  const scene=new THREE.Scene();scene.background=new THREE.Color('#171b1c');scene.add(surface);
  depthImage.dispose();
  return {scene,surface,fit:{slope,intercept}};
}

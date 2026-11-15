// Walk in outsole coordinates. Keep the sidewalk beside each shop open and
// take the gate and bridge openings from their raised meshes, not enclosing boxes.
import * as T from 'three';
export function streetGround(city,boundsAt,blocks,crossings){
  const margin=.0035,ppm=760,left=-.40,heel=-1;
  const grid=document.createElement('canvas');grid.width=Math.ceil(.8*ppm);grid.height=2*ppm;
  const ctx=grid.getContext('2d',{willReadFrequently:true});
  ctx.setTransform(ppm,0,0,ppm,-left*ppm,-heel*ppm);
  ctx.strokeStyle='#fff';ctx.lineWidth=margin*2;ctx.lineCap='round';
  city.updateWorldMatrix(true,true);
  const inv=city.matrixWorld.clone().invert(),m=new T.Matrix4(),p=[new T.Vector3(),new T.Vector3(),new T.Vector3()];
  for(const crossing of crossings)crossing.traverse(o=>{
    if(!o.isMesh)return;
    m.multiplyMatrices(inv,o.matrixWorld);
    const {index,attributes:{position}}=o.geometry;
    const vertices=Array.from({length:position.count},(_,i)=>new T.Vector3().fromBufferAttribute(position,i).applyMatrix4(m));
    ctx.beginPath();
    for(let i=0;i<(index?.count??position.count);i+=3){
      for(let k=0;k<3;k++)p[k]=vertices[index?index.getX(i+k):i+k];
      for(const y of [.015,.025,.034]){
        let hit=false;
        for(let k=0;k<3;k++){
          const a=p[k],b=p[(k+1)%3];if((a.y>y)===(b.y>y))continue;
          const t=(y-a.y)/(b.y-a.y),x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;
          if(hit)ctx.lineTo(x,z);else ctx.moveTo(x,z);hit=true;
        }
      }
    }
    ctx.stroke();
  });
  const data=ctx.getImageData(0,0,grid.width,grid.height).data;
  return (x,z)=>{
    if(z<-.968||z>.968)return false;
    const [lo,hi]=boundsAt(z);if(x<lo+.010||x>hi-.010)return false;
    if(blocks.some(b=>{
      const dx=x-b.x,dz=z-b.z;
      if(b.cos===undefined)return Math.abs(dx)<b.w/2+margin && Math.abs(dz)<b.d/2+margin;
      return Math.abs(b.cos*dx-b.sin*dz)<b.w/2+margin && Math.abs(b.sin*dx+b.cos*dz)<b.d/2+margin;
    }))return false;
    return data[4*(Math.floor((z-heel)*ppm)*grid.width+Math.floor((x-left)*ppm))+3]===0;
  };
}

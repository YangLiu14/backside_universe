import * as T from 'three';

// X runs down a pitch, Y across the eaves. Diffuse, slope and gloss all use
// the same ribs, overlapping lips and seams, so the highlight follows the roof.
export function roofSurface(name,hex,kind){
  const size=256,base=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
  const panels=['color','normal','roughness'].map(()=>{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
    const ctx=canvas.getContext('2d');return {canvas,ctx,data:ctx.createImageData(size,size)};
  });
  const heights=new Float32Array(size*size);
  const tau=Math.PI*2,clay=kind==='tile';
  const hash=(x,y)=>{const h=Math.sin(x*91.65+y*31.19+44.31)*43758.5453;return h-Math.floor(h);};
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=x/size,v=y/size;
    const ribIndex=Math.floor(v*8),rib=v*8-ribIndex;
    const course=(u*6+.15*Math.sin(tau*ribIndex/8))%1;
    const variation=hash(Math.floor(u*6+.15*Math.sin(tau*ribIndex/8)+6)%6,ribIndex);
    const edge=Math.pow(Math.max(0,Math.cos(tau*rib)),4);
    const channel=(1-Math.cos(tau*rib))*.5;
    const weather=(Math.sin(tau*(2*u+3*v))+.55*Math.sin(tau*(6*u-4*v))+.30*Math.cos(tau*(5*u+12*v)))/2;
    const grain=hash(x,y);
    const lip=clay?Math.max(0,1-course*11):0;
    const oxide=Math.max(0,weather+.26*channel-.19);
    const i=y*size+x;
    heights[i]=clay?3.4*edge+1.65*lip+.55*course+.10*grain:2.2*edge+.10*grain;
    const value=clay?.89+.20*variation-.08*channel-.13*lip-.13*oxide+.07*(grain-.5):.97+.065*weather-.18*oxide+.07*(grain-.5);
    for(let k=0;k<3;k++)panels[0].data.data[4*i+k]=base[k]*value+(clay&&k===1?3*oxide:0);
    const rough=clay?.82+.10*variation-.12*channel:.51+.24*oxide+.06*grain;
    panels[2].data.data.fill(255*rough,4*i,4*i+3);
    for(const p of panels)p.data.data[4*i+3]=255;
  }
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const i=y*size+x;
    const dx=(heights[y*size+(x+1)%size]-heights[y*size+(x+size-1)%size])*.5;
    const dy=(heights[((y+1)%size)*size+x]-heights[((y+size-1)%size)*size+x])*.5;
    const norm=Math.hypot(dx,dy,1),normal=panels[1].data.data;
    normal[4*i]=128-127*dx/norm;normal[4*i+1]=128+127*dy/norm;normal[4*i+2]=128+127/norm;
  }
  const [map,normalMap,roughnessMap]=panels.map(({ctx,data,canvas})=>{
    ctx.putImageData(data,0,0);const t=new T.CanvasTexture(canvas);
    t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=8;return t;
  });
  map.colorSpace=T.SRGBColorSpace;
  return new T.MeshStandardMaterial({name,map,normalMap,roughnessMap,roughness:1,metalness:clay?0:.46,side:T.DoubleSide});
}

import * as T from 'three';
// Painted iron, not a bare metal blue. The iron substrate is visible mostly at
// rubbed rails and scuffed bolt heads. Preserve the original ornamental castings.
export function bridgeFinishes(){
  const n=256,canvas=document.createElement('canvas');canvas.width=canvas.height=n;
  const cv=canvas.getContext('2d'),im=cv.createImageData(n,n),rm=new Uint8Array(n*n*4);
  let seed=815123;const rand=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  const levels=[4,12,32,64,128].map(size=>({size,noise:Float32Array.from({length:size*size},rand)}));
  function noise(field,x,y){const a=x*field.size/n,b=y*field.size/n,u=Math.floor(a),v=Math.floor(b),r=a-u,s=b-v;const val=(i,j)=>field.noise[((v+j)%field.size)*field.size+(u+i)%field.size];return T.MathUtils.lerp(T.MathUtils.lerp(val(0,0),val(1,0),r),T.MathUtils.lerp(val(0,1),val(1,1),r),s);}
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const i=4*(y*n+x),[l,m,d,f,g]=levels.map(o=>noise(o,x,y)),scratch=(rand()-.5)*5;
    const metal=T.MathUtils.smoothstep(.43*l+.27*m+.15*d+.10*f+.05*g,.655,.77);
    const k=205+27*l+13*d+8*g+scratch;
    for(let c=0;c<3;c++){im.data[i+c]=T.MathUtils.lerp(k,[204,151,115][c],metal);}
    im.data[i+3]=255;rm[i]=255;rm[i+1]=Math.round(255*(.82+.15*g-metal*.12));rm[i+2]=Math.round(255*(.10+.90*metal));rm[i+3]=255;
  }
  cv.putImageData(im,0,0);const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;
  const grain=new T.DataTexture(rm,n,n,T.RGBAFormat);grain.flipY=true;grain.needsUpdate=true;
  for(const t of [map,grain]){t.wrapS=t.wrapT=T.RepeatWrapping;t.generateMipmaps=true;t.minFilter=T.LinearMipmapLinearFilter;t.magFilter=T.LinearFilter;t.anisotropy=4;}
  function apply(mesh,kind){
    const g=mesh.geometry,attr=g.attributes.position,normal=g.attributes.normal,u=new Float32Array(attr.count*2),rgb=new Float32Array(attr.count*3);
    for(let i=0;i<attr.count;i++){
      const x=attr.getX(i),y=attr.getY(i),z=attr.getZ(i), ax=Math.abs(normal.getX(i)),ay=Math.abs(normal.getY(i)),az=Math.abs(normal.getZ(i));
      const du=ax>az&&ax>ay?z:x, dv=ay>ax&&ay>az?z:y;
      u[2*i]=du/.032;u[2*i+1]=dv/.032;
      const damp=(1-T.MathUtils.smoothstep(y,.0004,.009)),top=Math.max(0,normal.getY(i));
      // Street dirt adheres at the pier foot; the top of the round handrail is rubbed.
      const b=(1-.22*damp)*(kind==='handrail'?.93+.12*top:1);
      rgb[i*3]=b;rgb[i*3+1]=b*(1-.055*damp);rgb[i*3+2]=b*(1-.10*damp);
    }
    g.setAttribute('uv',new T.BufferAttribute(u,2));g.setAttribute('color',new T.BufferAttribute(rgb,3));
    const m=mesh.material;m.map=map;m.metalnessMap=m.roughnessMap=grain;m.vertexColors=true;
    m.metalness=kind==='handrail'?.62:.40;m.roughness=kind==='handrail'?.49:.77;m.needsUpdate=true;
  }
  return apply;
}

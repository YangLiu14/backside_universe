import * as THREE from 'three';

// Close-range sand over the inlet cut into the saucer. Two asymmetric sandbars
// taper below the same tidal surface as the boat and join the cottage beach.
export function createBeach(point){
  const beach=new THREE.Group();beach.name='Intertidal sand at the blue cup';
  let seed=23871;
  const random=()=>((seed=Math.imul(1664525,seed)+1013904223|0)>>>0)/4294967296;
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const ctx=canvas.getContext('2d'),grain=ctx.createImageData(256,256);
  for(let i=0;i<grain.data.length;i+=4){
    const n=197+random()*50-(random()<.045?random()*65:0);
    grain.data[i]=n;grain.data[i+1]=n*.977;grain.data[i+2]=n*.926;grain.data[i+3]=255;
  }
  ctx.putImageData(grain,0,0);
  const grit=new THREE.CanvasTexture(canvas);grit.wrapS=grit.wrapT=THREE.RepeatWrapping;grit.colorSpace=THREE.SRGBColorSpace;grit.anisotropy=4;
  const sand=new THREE.MeshStandardMaterial({map:grit,bumpMap:grit,bumpScale:.00012,vertexColors:true,roughness:.91,side:THREE.DoubleSide});
  const positions=[],uv=[],colors=[],indices=[];
  const wet=new THREE.Color('#b39c7a'),dry=new THREE.Color('#f3dcb3'),tone=new THREE.Color();
  const edge=(out,side)=>.019+.0045*Math.sin(61*out+.7*side)+.003*Math.cos(119*out-.6*side)+.0011*Math.sin(340*out+side);
  function height(out,r,side){
    const shore=(r-edge(out,side));
    const ripple=.00038*Math.sin(out*870+r*370+.62*Math.sin(r*520));
    const tip=side>0?.047:.059;
    return Math.min(THREE.MathUtils.clamp(shore*.29,-.004,.0048),.0045-(out-tip)*.67)
      +ripple+.00035*Math.sin(300*out-130*r);
  }
  const rows=66,cols=41;
  for(const side of [-1,1]){
    const offset=positions.length/3;
    for(let j=0;j<=rows;j++)for(let i=0;i<=cols;i++){
      const out=-.004+.075*j/rows,r=.0035+.046*i/cols,h=height(out,r,side);
      positions.push(...point(out,r*side,h).toArray());uv.push(out*153,r*153);
      tone.copy(wet).lerp(dry,THREE.MathUtils.smoothstep(h,-.0004,.0036)).multiplyScalar(.98+.025*Math.sin(600*out+270*r));
      colors.push(tone.r,tone.g,tone.b);
      if(i&&j){const d=offset+j*(cols+1)+i,c=d-1,b=d-cols-1,a=b-1;
        if(side<0)indices.push(a,b,c,b,d,c);else indices.push(a,c,b,b,c,d);}
    }
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(indices);geo.computeVertexNormals();
  const shore=new THREE.Mesh(geo,sand);shore.receiveShadow=true;beach.add(shore);
  const stone=new THREE.IcosahedronGeometry(1,1);
  const pebbles=new THREE.InstancedMesh(stone,new THREE.MeshStandardMaterial({roughness:.83}),124);
  const dummy=new THREE.Object3D(),palette=['#a29983','#cfb898','#c7bfa6','#827e70','#8e7162','#ded1b5'];
  for(let i=0;i<pebbles.count;i++){
    const side=random()<.57?-1:1,out=.008+random()*.042;
    const r=edge(out,side)+.001+random()**2*.010,h=height(out,r,side);
    const size=.00016+random()**3*.00095;
    dummy.position.copy(point(out,r*side,h+size*.16));
    dummy.rotation.set((random()-.5)*.4,random()*Math.PI,(random()-.5)*.3);
    dummy.scale.set(size*(.89+random()*.7),size*.44,size*.84);dummy.updateMatrix();
    pebbles.setMatrixAt(i,dummy.matrix);pebbles.setColorAt(i,tone.set(palette[i%palette.length]));
  }
  beach.add(pebbles);
  return beach;
}

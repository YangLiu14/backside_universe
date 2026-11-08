import * as T from 'three';
import {mergeGeometries} from '../vendor/addons/utils/BufferGeometryUtils.js';

// Measured on both tide-fitted phone meshes. The joinery sits in the reveal
// behind the scanned plaster, with +Z towards the quay.
export const bathEntrance={
  id:'baths',name:'潮汐浴屋',at:[-.118,.059,-.097],out:[0,1],height:.065,paint:'#438880',
};

let paintedGrain;
export function bathPaintMap(){
  if(paintedGrain)return paintedGrain;
  // Low-contrast lengthwise grain under the paint, shared by the leaf and
  // its fixed joinery on either side of the room transition.
  const w=128,h=128,data=new Uint8Array(w*h*4),tau=2*Math.PI;
  let seed=1763;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const u=x/w*tau,v=y/h*tau;
    const grain=Math.cos(17*u+.5*Math.sin(v)+1.7*Math.sin(3*u+v));
    const value=Math.round(241+5*grain-14*Math.max(0,grain)**6+5*(seed/4294967296-.5));
    data.set([value,value,value,255],4*(y*w+x));
  }
  paintedGrain=new T.DataTexture(data,w,h);
  paintedGrain.wrapS=paintedGrain.wrapT=T.RepeatWrapping;
  paintedGrain.colorSpace=T.SRGBColorSpace;paintedGrain.generateMipmaps=true;
  paintedGrain.minFilter=T.LinearMipmapLinearFilter;paintedGrain.magFilter=T.LinearFilter;
  paintedGrain.needsUpdate=true;
  return paintedGrain;
}

export function createBathSurround(){
  const group=new T.Group();
  group.name='潮汐浴屋 / 拱形门套';
  group.position.fromArray(bathEntrance.at);
  group.scale.setScalar(bathEntrance.height/2.18);

  // One solid U-shaped frame, rebated behind the moving leaf. The outer
  // profile overlaps the irregular scan on the sides and above the crown.
  const profile=new T.Shape(),radius=1.14,spring=1.64;
  profile.moveTo(-radius,-.12);
  profile.lineTo(-radius,spring);
  profile.absarc(0,spring,radius,Math.PI,0,true);
  profile.lineTo(radius,-.12);
  const architrave=profile.clone();
  profile.lineTo(.555,-.12);
  profile.lineTo(.555,2.08);
  profile.lineTo(-.555,2.08);
  profile.lineTo(-.555,-.12);
  profile.closePath();
  const casing=new T.ExtrudeGeometry(profile,{depth:.26,bevelEnabled:false,curveSegments:24});
  casing.translate(0,0,-.26);
  const painted=new T.MeshStandardMaterial({color:'#678c80',map:bathPaintMap(),roughness:.76});
  group.add(new T.Mesh(casing,painted));

  // A frosted fanlight set above the head rail. Its continuous backing and
  // opaque glazing close the old recess even at grazing angles.
  const glassRadius=.86,glassBase=2.22;
  const angle=Math.asin((glassBase-spring)/glassRadius);
  const glass=new T.Shape();
  glass.absarc(0,spring,glassRadius,angle,Math.PI-angle,false);
  glass.closePath();
  const pane=new T.ShapeGeometry(glass,32),vertices=pane.attributes.position,colors=[];
  const lower=new T.Color('#95b8a9'),upper=new T.Color('#d2e0c9');
  for(let i=0;i<vertices.count;i++){
    const t=(vertices.getY(i)-glassBase)/(spring+glassRadius-glassBase);
    colors.push(...lower.clone().lerp(upper,t).toArray());
  }
  pane.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  const glazing=new T.Mesh(pane,new T.MeshPhysicalMaterial({
    vertexColors:true,roughness:.36,clearcoat:.3,clearcoatRoughness:.31,
  }));
  glazing.position.z=.016;
  group.add(glazing);

  const mouldings=[];
  for(const theta of [Math.PI*.32,Math.PI*.5,Math.PI*.68]){
    const x=glassRadius*Math.cos(theta),dy=spring+glassRadius*Math.sin(theta)-glassBase;
    const bar=new T.BoxGeometry(.023,Math.hypot(x,dy),.025);
    bar.rotateZ(-Math.atan2(x,dy)).translate(x/2,glassBase+dy/2,.029);
    mouldings.push(bar);
  }
  for(const side of [-1,1]){
    const x=side*.758;
    for(const offset of [-.094,.094]){
      mouldings.push(new T.BoxGeometry(.024,1.68,.026).translate(x+offset,.97,.014));
    }
    for(const y of [.14,.84,1.80]){
      mouldings.push(new T.BoxGeometry(.17,.026,.026).translate(x,y,.014));
    }
  }
  const bead=new T.MeshStandardMaterial({color:'#779489',roughness:.73});
  group.add(new T.Mesh(mergeGeometries(mouldings),bead));
  mouldings.forEach(g=>g.dispose());
  // Bring the outer moulding forward into the stone rebate, including its
  // returns at the sides. A deep dark line here reads as a gap from the quay.
  const inner=.89;
  architrave.lineTo(inner,-.12);
  architrave.lineTo(inner,spring);
  architrave.absarc(0,spring,inner,0,Math.PI,false);
  architrave.lineTo(-inner,-.12);
  architrave.closePath();
  group.add(new T.Mesh(new T.ExtrudeGeometry(architrave,{
    depth:.19,curveSegments:24,bevelThickness:.012,bevelSize:.012,bevelSegments:2,
  }),bead));
  for(const part of group.children){
    part.castShadow=part.receiveShadow=true;
    part.layers.enable(3);
  }
  return group;
}

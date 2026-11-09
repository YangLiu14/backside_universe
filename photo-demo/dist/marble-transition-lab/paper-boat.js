import {isEnglish,localizedTexture} from '../i18n/core.js';
import * as THREE from 'three';

export const noteText='这个需求今天能改完吗？';

function notepaper(){
  const sheet=document.createElement('canvas');sheet.width=1024;sheet.height=576;
  const ctx=sheet.getContext('2d');
  ctx.fillStyle='#f4e8c9';ctx.fillRect(0,0,1024,576);
  // A little laid-paper grain and faded rules remain on the finished hull.
  let seed=31;
  const random=()=>((seed=Math.imul(seed,1664525)+1013904223|0)>>>0)/4294967296;
  for(let i=0;i<13000;i++){
    ctx.fillStyle=i%2?'#694b2920':'#fffdf542';
    ctx.fillRect(random()*1024,random()*576,1+random()*4,1+random()*1.3);
  }
  ctx.lineWidth=2;ctx.strokeStyle='#859faa75';ctx.beginPath();
  for(let y=75;y<576;y+=79){ctx.moveTo(0,y);ctx.lineTo(1024,y);}
  ctx.stroke();ctx.strokeStyle='#c683788f';ctx.beginPath();ctx.moveTo(86,0);ctx.lineTo(86,576);ctx.stroke();
  const base=ctx.getImageData(0,0,1024,576);
  const map=new THREE.CanvasTexture(sheet);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;
  return localizedTexture(map,()=>{
    ctx.putImageData(base,0,0);ctx.save();ctx.rotate(-.017);ctx.fillStyle='#243d50';
    ctx.font=isEnglish()?'600 68px Georgia,serif':'600 91px "Kaiti SC","STKaiti","Songti SC",serif';
    const lines=isEnglish()?['Can you finish','this request today?']:[noteText.slice(0,4),noteText.slice(4)];
    ctx.fillText(lines[0],140,244,800);ctx.fillText(lines[1],isEnglish()?140:218,408,800);ctx.restore();
  });
}

// Seven longitudinal creases turn the same printed surface into an open hull.
// UVs stay on the sheet as the gunwales curl up and the centre fold rises.
export function createPaperBoat(){
  const cols=[-1,-.70,-.40,0,.40,.70,1],rows=[-1,-.72,-.38,0,.38,.72,1];
  const uv=[],indices=[],corners=[];
  for(const [j,z] of rows.entries())for(const [i,x] of cols.entries()){
    const side=Math.abs(z),tip=Math.abs(x),taper=1-tip**1.45;
    const breadth=side===1?.14:side===.72?.41:side===.38?.16:0;
    const height=side===1?.008:side===.72?.33:side===.38?.015:.64*(1-tip);
    const edgeCurl=.022*(x*x+.65*z*z)+.009*Math.sin(3*x+2*z);
    corners.push({x,z,edgeCurl,foldedX:x*.85,foldedY:.33*(1-taper)+height*taper,
      foldedZ:Math.sign(z)*breadth*taper});
    uv.push((x+1)/2,(1-z)/2);
    if(i&&j){
      const d=j*cols.length+i,b=d-cols.length,c=d-1,a=b-1;
      indices.push(a,c,b,b,c,d);
    }
  }
  const geometry=new THREE.BufferGeometry();
  const position=new THREE.Float32BufferAttribute(new Float32Array(corners.length*3),3);
  position.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position',position);geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);
  const material=new THREE.MeshStandardMaterial({map:notepaper(),color:0xffffff,side:THREE.DoubleSide,
    flatShading:true,roughness:.94,metalness:0,envMapIntensity:.42});
  const mesh=new THREE.Mesh(geometry,material);mesh.name='Harbor note and folded paper boat';mesh.scale.setScalar(.0108);
  function fold(t){
    const curl=THREE.MathUtils.smoothstep(t,0,.68),open=THREE.MathUtils.smoothstep(t,.32,1);
    for(const [i,p] of corners.entries()){
      const side=Math.abs(p.z),lift=Math.sin(Math.PI*curl)*(.36*side+.12*Math.abs(p.x));
      position.setXYZ(i,THREE.MathUtils.lerp(p.x,p.foldedX,open),
        (1-curl)*p.edgeCurl+lift+THREE.MathUtils.lerp(.055*side*curl,p.foldedY,open),
        THREE.MathUtils.lerp(p.z*(.57-.26*curl),p.foldedZ,open));
    }
    position.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingSphere();
  }
  fold(0);return {mesh,fold};
}

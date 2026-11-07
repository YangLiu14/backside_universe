import * as T from 'three';

// One tile shared by the exteriors: sediment beds, a pitted limestone
// surface and lengthwise wood fibres. Mipmaps filter each at walking distance.
let detailMap;
let scannedStone;
const dressed=new WeakSet();
function surfaceTile(){
  if(detailMap)return detailMap;
  const size=256,data=new Uint8Array(size*size*4),tau=Math.PI*2;
  const noise=(x,y,period)=>{
    const ix=Math.floor(x),iy=Math.floor(y),f=x-ix,g=y-iy;
    const value=(i,j)=>{
      let h=Math.imul((i%period+period)%period+173,0x45d9f3b)^Math.imul((j%period+period)%period+97,0x119de1f3);
      h=Math.imul(h^(h>>>16),0x45d9f3b);return ((h^(h>>>16))>>>0)/4294967295;
    };
    const u=f*f*(3-2*f),v=g*g*(3-2*g);
    return T.MathUtils.lerp(T.MathUtils.lerp(value(ix,iy),value(ix+1,iy),u),T.MathUtils.lerp(value(ix,iy+1),value(ix+1,iy+1),u),v);
  };
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=x/size,v=y/size,n=noise(u*4,v*4,4),medium=noise(u*16,v*16,16),grain=noise(u*94,v*94,94);
    const seam=Math.cos(tau*(v*9+n*1.36+medium*.23));
    const fibre=Math.cos(tau*(v*32+Math.sin(u*tau)*.73+n*1.12));
    const i=(y*size+x)*4;
    data[i]=255*(.32+.26*grain+.29*medium+.11*seam-.19*Math.max(0,seam)**5);
    const pit=Math.max(0,.49-grain);
    data[i+1]=255*(.34+.19*n+.27*medium+.15*grain-.52*pit);
    data[i+2]=255*(.46+.11*medium+.18*grain+.09*fibre-.18*Math.max(0,fibre)**5);
    const warp=Math.cos(tau*u*24),weft=Math.cos(tau*v*24);
    data[i+3]=255*(.48+.12*warp*weft+.12*grain+.07*Math.max(warp,weft));
  }
  detailMap=new T.DataTexture(data,size,size);detailMap.wrapS=detailMap.wrapT=T.RepeatWrapping;
  detailMap.generateMipmaps=true;detailMap.minFilter=T.LinearMipmapLinearFilter;detailMap.magFilter=T.LinearFilter;
  detailMap.anisotropy=4;detailMap.needsUpdate=true;return detailMap;
}

function stoneDetail(){
  if(scannedStone)return scannedStone;
  scannedStone={value:surfaceTile()};
  new T.TextureLoader().load(new URL('../assets/coastal-rock-detail.jpg',import.meta.url).href,map=>{
    map.wrapS=map.wrapT=T.RepeatWrapping;map.anisotropy=4;
    scannedStone.value=map;
  },undefined,()=>{}); // Keep the procedural detail if the optional local scan is missing.
  return scannedStone;
}

export function dressCoast(model,profile){
  const stone=['grotto','cup','orange-book','blue-book','phone'].includes(profile);
  model.traverse(mesh=>{
    if(!mesh.isMesh)return;
    for(const mat of [].concat(mesh.material)){
      // Preserve the purpose-authored joinery, water and handset hardware.
      if(!mat.map||!mat.isMeshStandardMaterial||dressed.has(mat)||/^(Inn_|Quay_|Canyon_|Harbor_)/.test(mesh.name))continue;
      dressed.add(mat);
      const previous=mat.onBeforeCompile,oldKey=mat.customProgramCacheKey();
      mat.customProgramCacheKey=()=>oldKey+'-walking-surfaces-'+profile;
      mat.onBeforeCompile=function(shader,renderer){
        previous.call(this,shader,renderer);shader.uniforms.coastGrain=stone?stoneDetail():{value:surfaceTile()};
        shader.vertexShader='varying vec3 grainPoint,grainFace;varying float grainScale;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
          grainPoint=position;grainFace=normal;grainScale=length(modelMatrix[0].xyz);`);
        shader.fragmentShader='varying vec3 grainPoint,grainFace;varying float grainScale;uniform sampler2D coastGrain;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
          // Some generated shells have UVs but no vertex normals. Three
          // lights these with face derivatives; use the same local face here.
          vec3 facet=cross(dFdx(grainPoint),dFdy(grainPoint));
          vec3 localFace=dot(grainFace,grainFace)<1e-8?facet:grainFace;
          vec3 f=abs(localFace);f/=max(max(f.x,f.y),max(f.z,1e-16));
          vec3 weights=f*f*f*f;weights/=max(.0001,weights.x+weights.y+weights.z);
          vec3 p=grainPoint*${stone?'20.0':'13.0'};
          vec4 texel=texture2D(coastGrain,p.zy)*weights.x+texture2D(coastGrain,p.xz)*weights.y+texture2D(coastGrain,p.xy)*weights.z;
          vec3 pigment=diffuseColor.rgb;
          float warm=smoothstep(-.016,.025,pigment.r-pigment.b);
          float finishMask=${profile==='lamp'?'0.24':profile==='chair'?'smoothstep(.42,.82,roughnessFactor)':'warm*smoothstep(.20,.72,roughnessFactor)'};
          float h=(${stone?'texel.g':profile==='chair'?'texel.a':'texel.b'}-.50)*finishMask;
          diffuseColor.rgb*=1.+${stone?'(texel.r-.5)*1.22*finishMask':'h*.24'};
          roughnessFactor=clamp(roughnessFactor+${stone?'(texel.b-.5)*.46*finishMask':'h*.14'},.04,1.);`);
        shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
          vec3 px=dFdx(-vViewPosition),py=dFdy(-vViewPosition);
          vec3 sx=cross(py,normal),sy=cross(normal,px);float det=dot(px,sx);
          float relief=h*grainScale*${stone?'.00135':'.00062'};
          normal=normalize(normal-sign(det)*(sx*dFdx(relief)+sy*dFdy(relief))/max(abs(det),1e-14));`);
      };
      mat.needsUpdate=true;
    }
  });
}

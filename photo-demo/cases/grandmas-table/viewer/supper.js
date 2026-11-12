// Alternate dressings for the original Hi3D serving dish. Keep its closed
// porcelain foot and rim; shape and project the food inside the rim separately.
import * as T from 'three';

const recipes={
  pork:{center:[.248,.732],span:[.447,.409]},
  greens:{center:[.743,.731],span:[.474,.326]},
  fish:{center:[.25,.237],span:[.477,.279]}
};
const chunks=[[-.22,-.60,.24,.20],[.13,-.46,.19,.23],[.48,-.54,.20,.24],
  [-.48,-.12,.20,.30],[-.03,-.22,.29,.23],[.48,-.04,.21,.27],
  [-.40,.30,.23,.26],[-.02,.40,.19,.25],[.39,.41,.26,.27]];
const smooth=T.MathUtils.smoothstep;
function relief(name,x,z){
  if(name==='pork'){
    let h=0;
    for(const [cx,cz,rx,rz] of chunks){
      const dx=(x-cx+(z-cz)*cx*.66)/rx,dz=(z-cz)/rz;
      h=Math.max(h,(1-smooth(dx**4+dz**4,.14,2.65))*(.93+.21*cx));
    }
    return .27+.50*h;
  }
  if(name==='fish'){
    const width=.38*Math.sqrt(Math.max(0,1-(x/.88)**2));
    return .24+.62*Math.sqrt(Math.max(0,1-(z/Math.max(.06,width))**2))*Math.max(0,1-(x/.9)**2);
  }
  return .31+.34*Math.max(0,1-1.16*(x*x+z*z))+.058*Math.sin(x*10.+z*6.)*Math.cos(z*9.-x*2.);
}

export function dressDish(raw,name,atlas){
  const model=raw.clone(true),recipe=recipes[name];
  model.traverse(o=>{
    if(!o.isMesh)return;
    const g=o.geometry=o.geometry.clone();g.computeBoundingBox();
    const b=g.boundingBox,sz=b.getSize(new T.Vector3()),p=g.attributes.position;
    const uvs=new Float32Array(p.count*2),glaze=new Float32Array(p.count);
    if(!g.attributes.normal)g.computeVertexNormals();
    for(let i=0;i<p.count;i++){
      const x=(p.getX(i)-b.min.x)/sz.x*2-1,z=(p.getZ(i)-b.min.z)/sz.z*2-1;
      const y=(p.getY(i)-b.min.y)/sz.y, r=Math.hypot(x,z);
      // The atlas is photographed from above. Keep the vertical foot and
      // down-facing underside glazed, especially at the child's low eye level.
      const exterior=smooth(r,.68,.93);
      glaze[i]=smooth(y,.13,.23)*T.MathUtils.lerp(1,smooth(g.attributes.normal.getY(i),-.19,.27),exterior);
      const food=(1-smooth(r,.73,.91))*smooth(y,.17,.39);
      const top=T.MathUtils.lerp(y,relief(name,x,z),food*.91);
      p.setY(i,b.min.y+top*sz.y);
      uvs[i*2]=recipe.center[0]+x*recipe.span[0]*.5;
      uvs[i*2+1]=recipe.center[1]-z*recipe.span[1]*.5;
    }
    g.setAttribute('uv',new T.BufferAttribute(uvs,2));g.setAttribute('recipeGlaze',new T.BufferAttribute(glaze,1));
    g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();
    o.material=new T.MeshStandardMaterial({map:atlas,roughness:name==='pork'?.40:.49,metalness:0});
    const ceramic=new T.Color(name==='fish'?0x899684:name==='greens'?0xc1bdac:0xcab898);
    o.material.onBeforeCompile=shader=>{
      shader.uniforms.porcelain={value:ceramic};
      shader.vertexShader='attribute float recipeGlaze;varying float printedFace;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nprintedFace=recipeGlaze;');
      shader.fragmentShader='uniform vec3 porcelain;varying float printedFace;\n'+shader.fragmentShader.replace('#include <map_fragment>',`
        #include <map_fragment>
        diffuseColor.rgb=mix(porcelain,diffuseColor.rgb,printedFace);
      `);
    };
  });
  return model;
}

export function finishTable(material,elm,settings){
  const mat=material.clone();mat.roughness=.69;mat.roughnessMap=null;mat.metalness=0;
  mat.onBeforeCompile=shader=>{
    shader.uniforms.elm={value:elm};
    shader.uniforms.settings={value:settings};
    shader.vertexShader='attribute vec3 tableGrain;varying vec3 grainCoord;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ngrainCoord=tableGrain;');
    shader.fragmentShader='uniform sampler2D elm;uniform vec4 settings[7];varying vec3 grainCoord;\n'+shader.fragmentShader.replace('#include <map_fragment>',`
      #include <map_fragment>
      vec3 timber=texture2D(elm,grainCoord.xy).rgb;
      vec2 localXZ=vec2(grainCoord.x-.52,(grainCoord.y-.54)/1.06);
      float contact=1.;
      for(int i=0;i<7;i++){
        vec2 offset=(localXZ-settings[i].xy)/settings[i].zw;
        contact*=.45+.55*smoothstep(.23,1.18,dot(offset,offset));
      }
      diffuseColor.rgb=mix(diffuseColor.rgb,timber*.84*contact,grainCoord.z*.96);
    `);
  };
  return mat;
}

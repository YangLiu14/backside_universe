// Both LODs are reductions of the same Hi3D master and share its original space.
import * as T from 'three';

const loader=new T.TextureLoader(),fields=new Map();
function loadField(key){
  if(!fields.has(key)){
    const loading=loader.loadAsync('./assets/digestion/light/'+key+'.png').then(texture=>{
      texture.flipY=false;
      if(key==='clay-finish'){
        texture.wrapS=texture.wrapT=T.RepeatWrapping;
        texture.anisotropy=4;
      }else{
        texture.generateMipmaps=false;
        texture.minFilter=texture.magFilter=T.LinearFilter;
      }
      return texture;
    }).catch(error=>{fields.delete(key);throw error;});
    fields.set(key,loading);
  }
  return fields.get(key);
}

const lighting=/* glsl */`
uniform sampler2D castField;
varying vec3 castPosition;
varying vec3 castNormal;
vec2 castSlice(vec2 xy,float z){
  vec2 tile=vec2(mod(z,8.),floor(z/8.));
  return texture2D(castField,(tile*48.+xy+.5)/vec2(384.,288.)).rg;
}
vec2 castExposure(vec3 p){
  vec3 grid=clamp((p+.54)*(48./1.08)-.5,0.,47.);
  float z=floor(grid.z);
  return mix(castSlice(grid.xy,z),castSlice(grid.xy,min(47.,z+1.)),fract(grid.z));
}
`;

export async function lightCast(scene,kind,id){
  let texture,finish;
  try{
    [texture,finish]=await Promise.all([loadField(kind+'-'+id),kind==='channel'?loadField('clay-finish'):null]);
  }catch(error){
    // A missing lighting atlas must not strand a visitor in the previous room.
    console.warn('Exhibit illumination unavailable:',kind,id,error);
    return;
  }
  const materials=new Set();
  scene.traverse(o=>{if(o.isMesh)for(const m of [].concat(o.material))materials.add(m);});
  for(const m of materials){
    const previous=m.onBeforeCompile.bind(m);
    const previousKey=m.customProgramCacheKey();
    m.customProgramCacheKey=()=>'cast-light-'+kind+previousKey;
    m.onBeforeCompile=(shader,renderer)=>{
      previous(shader,renderer);
      shader.uniforms.castField={value:texture};
      shader.vertexShader='varying vec3 castPosition; varying vec3 castNormal;\n'+shader.vertexShader.replace(
        '#include <begin_vertex>','#include <begin_vertex>\ncastPosition=position;castNormal=normal;'
      );
      if(finish){
        shader.uniforms.castSlip={value:finish};
        shader.fragmentShader='uniform sampler2D castSlip;\n'+shader.fragmentShader
          .replace('#include <roughnessmap_fragment>',`
            #include <roughnessmap_fragment>
            vec3 w=pow(abs(normalize(castNormal)),vec3(3.));
            w/=max(.0001,w.x+w.y+w.z);
            vec3 coord=castPosition*6.;
            vec2 slip=texture2D(castSlip,coord.yz).rg*w.x+
                      texture2D(castSlip,coord.zx).rg*w.y+
                      texture2D(castSlip,coord.xy).rg*w.z;
            roughnessFactor+=.23*(slip.y-.5);
          `)
          .replace('#include <normal_fragment_maps>',`
            #include <normal_fragment_maps>
            vec3 Sx=dFdx(-vViewPosition),Sy=dFdy(-vViewPosition);
            vec3 Rx=cross(Sy,normal),Ry=cross(normal,Sx);
            float handed=dot(Sx,Rx);
            float worldScale=length(Sx)/max(.000001,length(dFdx(castPosition)));
            vec3 relief=dFdx(slip.x)*Rx+dFdy(slip.x)*Ry;
            normal=normalize(max(abs(handed),1.e-12)*normal-sign(handed)*.00024*worldScale*relief);
          `);
      }
      shader.fragmentShader=lighting+shader.fragmentShader.replace('#include <lights_fragment_end>',`
        #include <lights_fragment_end>
        vec3 castN=normalize(castNormal)*(gl_FrontFacing?1.:-1.);
        vec2 v=castExposure(castPosition+.019*castN);
        float diffuseSky=smoothstep(.19,1.,v.x);
        reflectedLight.indirectDiffuse*=mix(vec3(.34,.29,.26),vec3(1.),diffuseSky);
        reflectedLight.indirectSpecular*=mix(.34,1.,diffuseSky);
        ${kind==='gallery'?`
        // Diffuse projection of a broad, warm display softbox. Occlusion and
        // the surface normal are both expressed in the cast's local space.
        float key=max(0.,dot(castN,normalize(vec3(-.36,.70,.61))))*v.y;
        reflectedLight.directDiffuse*=.79;
        reflectedLight.directDiffuse+=diffuseColor.rgb*vec3(1.,.78,.55)*(.43*key)*(1.-metalnessFactor);
        `:`
        reflectedLight.directDiffuse*=mix(.72,1.,v.y);
        `}
      `);
    };
    m.needsUpdate=true;
  }
}

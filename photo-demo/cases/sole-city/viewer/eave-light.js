import * as T from 'three';

// Local visibility of the morning sky, baked from the assembled awnings, bridge,
// houses and shop counter. The sky-facing sides and the sheltered side receive
// different indirect light, even when they share the very same material and UVs.
// Texture layout is defined by the matching bake-street-light.cpp authoring tool.
const fields = `
uniform highp sampler2D shopSky;
uniform highp sampler2D citySky;
uniform mat4 shopToLocal;
uniform float shopSkyPhase;
uniform float streetScale;
uniform vec3 sunriseDirection;
uniform mat4 sunriseShadow;
varying vec3 shopPosition;
vec3 streetSkyBand(vec3 grid, float slice, float side){
  return texture2D(shopSky,vec2((grid.x+side*106.+.5)/212.,(slice*29.+grid.y+.5)/1914.)).rgb;
}
vec3 citySkyBand(vec3 grid, float slice, float side){
  vec2 tile=vec2(mod(slice,7.)*184.,floor(slice/7.)*33.);
  return texture2D(citySky,(tile+vec2(grid.x+side*92.,grid.y)+.5)/vec2(1288.,924.)).rgb;
}
void shelterStreetLight(inout vec3 diffuseIrradiance,inout vec3 specularIrradiance,vec3 normalVS){
  if(shopSkyPhase<.0001)return;
  vec3 n=normalize(mat3(shopToLocal)*inverseTransformDirection(normalVS,viewMatrix));
  // Sample the air on the outside of the current surface, rather than the
  // inside of its structural wall. Thin shelf stock still sees incident side light.
  vec3 q=shopPosition+n*.0035;
  vec3 u=(q-vec3(-.217,.001,.083))/vec3(.478,.124,.284);
  vec3 nearBorder=min(u,1.-u);
  float boxWeight=smoothstep(-.03,.065,min(nearBorder.x,nearBorder.z))*smoothstep(-.045,.06,1.-u.y);
  vec3 a=vec3(1.),b=vec3(1.);
  if(boxWeight<.9999){
    vec3 wide=clamp((shopPosition+n*.006-vec3(-.44,.001,-1.014))/vec3(.88,.529,2.028),0.,1.);
    wide.y=pow(wide.y,.625);
    vec3 grid=wide*vec3(91.,32.,195.);float z=floor(grid.z),next=min(195.,z+1.);
    a=mix(citySkyBand(grid,z,0.),citySkyBand(grid,next,0.),fract(grid.z));
    b=mix(citySkyBand(grid,z,1.),citySkyBand(grid,next,1.),fract(grid.z));
  }
  if(boxWeight>.0001){
    vec3 grid=clamp(u,0.,1.)*vec3(105.,28.,65.);float z=floor(grid.z),next=min(65.,z+1.);
    vec3 localA=mix(streetSkyBand(grid,z,0.),streetSkyBand(grid,next,0.),fract(grid.z));
    vec3 localB=mix(streetSkyBand(grid,z,1.),streetSkyBand(grid,next,1.),fract(grid.z));
    a=mix(a,localA,boxWeight);b=mix(b,localB,boxWeight);
  }
  vec3 hemi=vec3(n.x>0.?a.r:a.g,a.b,n.z>0.?b.r:b.g);
  vec3 weights=vec3(abs(n.x)*.5,max(0.,n.y),abs(n.z)*.5);
  float sky=dot(hemi,weights)/max(.18,dot(weights,vec3(1.)));
  float access=b.b,edge=shopSkyPhase;
  // Outdoor diffuse is a mix of sky and ground/wall bounce. Deeper in the
  // shop keep brown-gray diffuse fill and a weaker blue-sky component.
  vec3 bounce=vec3(.43,.36,.27)*(.53+.47*access);
  vec3 light=bounce+(1.-bounce)*sqrt(clamp(sky,0.,1.));
  diffuseIrradiance*=mix(vec3(1.),light,edge);
  // Retain rim reflections on cookware from the open side of the street.
  specularIrradiance*=mix(1.,.65+.35*sqrt(sky),edge*(1.-.28*access));
}
`;
// Integrate the sunlit fraction of the air between the camera and this
// surface. Sampling the same depth map as the direct sun lets the bridge and
// roofs break the low morning haze up as the player turns into a side lane.
const air = `
float sunlitAir(vec3 viewPosition){
  #if defined(USE_SHADOWMAP) && defined(SHADOWMAP_TYPE_PCF) && NUM_DIR_LIGHT_SHADOWS > 0
  vec3 worldRay=inverseTransformDirection(-normalize(viewPosition),viewMatrix)*length(viewPosition);
  vec3 start=(sunriseShadow*vec4(cameraPosition,1.)).xyz;
  vec3 span=(sunriseShadow*vec4(worldRay,0.)).xyz;
  float light=0.;
  for(int i=0;i<6;i++){
    vec3 at=start+span*((float(i)+.5)/6.);
    if(min(min(at.x,at.y),at.z)<0.||max(max(at.x,at.y),at.z)>1.)light+=1.;
    else light+=texture(directionalShadowMap[0],vec3(at.xy,at.z-.00045));
  }
  return light/6.;
  #else
  return 1.;
  #endif
}`;
export async function fitStreetSky(city, enabled, sunDirection, shadowMatrix){
  if(!enabled)return ()=>{};
  const loader=new T.TextureLoader();
  const [atlas,wide]=await Promise.all(['./bridge-skylight.png','./city-skylight.png'].map(path=>loader.loadAsync(path)));
  for(const t of [atlas,wide]){
    t.colorSpace=T.NoColorSpace;t.flipY=false;t.generateMipmaps=false;t.minFilter=t.magFilter=T.LinearFilter;
  }
  city.updateWorldMatrix(true,false);
  const uniforms={citySky:{value:wide},shopSky:{value:atlas},shopSkyPhase:{value:0},streetScale:{value:city.getWorldScale(new T.Vector3()).x},shopToLocal:{value:city.matrixWorld.clone().invert()},sunriseDirection:{value:sunDirection},sunriseShadow:{value:shadowMatrix}};
  const fitted=new WeakSet();
  function fit(object){
    object.traverse(o=>{
      if(!o.isMesh)return;
      for(const m of [].concat(o.material)){
        if(!m?.isMeshStandardMaterial||fitted.has(m))continue;fitted.add(m);
        const previous=m.onBeforeCompile.bind(m),key=m.customProgramCacheKey();
        m.onBeforeCompile=(shader,renderer)=>{
          previous(shader,renderer);Object.assign(shader.uniforms,uniforms);
          shader.vertexShader='uniform mat4 shopToLocal;\nvarying vec3 shopPosition;\n'+shader.vertexShader.replace('#include <project_vertex>',`#include <project_vertex>
            shopPosition=(shopToLocal*modelMatrix*vec4(transformed,1.)).xyz;`);
          shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n'+fields)
            .replace('#include <shadowmap_pars_fragment>','#include <shadowmap_pars_fragment>\n'+air)
            .replace('#include <aomap_fragment>',`#include <aomap_fragment>
            shelterStreetLight(reflectedLight.indirectDiffuse,reflectedLight.indirectSpecular,normal);`)
            .replace('#include <opaque_fragment>',`
              float eyeHeight=(shopToLocal*vec4(cameraPosition,1.)).y;
              float lowView=1.-smoothstep(.16,.38,eyeHeight);
              vec3 sight=inverseTransformDirection(-normalize(vViewPosition),viewMatrix);
              float forwardScatter=pow(max(0.,dot(sight,sunriseDirection)),7.);
              float pathLength=max(0.,length(vViewPosition)/streetScale-.065);
              float veil=(1.-exp(-(.12+.29*forwardScatter)*pathLength))*lowView*shopSkyPhase;
              float litAir=1.;
              if(veil>.025 && forwardScatter>.15)litAir=sunlitAir(vViewPosition);
              vec3 airlight=mix(vec3(.43,.53,.66),vec3(1.08,.84,.52),forwardScatter*litAir);
              veil*=mix(1.,.42+.58*litAir,forwardScatter);
              outgoingLight=mix(outgoingLight,airlight,veil);
              #include <opaque_fragment>`);
        };
        m.customProgramCacheKey=()=>key+'/town-sky-v3';m.needsUpdate=true;
      }
    });
  }
  for(const object of city.children){
    const d=object.userData;
    if(d.feature||d.roadTiming||d.pavementDetail||d.outsoleSurface)fit(object);
  }
  const setPhase=phase=>{uniforms.shopSkyPhase.value=T.MathUtils.smoothstep(phase,.675,.73);};
  setPhase.fit=fit;
  return setPhase;
}

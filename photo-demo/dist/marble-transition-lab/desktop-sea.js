import * as THREE from 'three';
import {waveField} from './ocean-surface.js';

// Change the material of the registered tabletop itself. There is no second
// sheet of water to z-fight, overflow its outline, or cover the objects.
export function createDesktopSea(photo,objects,shores){
  const points=name=>{const p=objects.getObjectByName(name).geometry.attributes.position;return Array.from({length:4},(_,i)=>new THREE.Vector2(p.getX(i),p.getZ(i)));};
  const saucer=new THREE.Box3().setFromObject(objects.getObjectByName('saucer'));
  const c=saucer.getCenter(new THREE.Vector3()),s=saucer.getSize(new THREE.Vector3());
  const uniforms={sunward:{value:new THREE.Vector3(-.35,.64,.69).normalize()},sunTint:{value:new THREE.Color(1,1,1)},skyTint:{value:new THREE.Color(.52,.73,.76)},seaTime:{value:0},seaAmount:{value:0},laptopShore:{value:points('laptop-base')},islandShore:{value:shores.flat()},shoreBlend:{value:[0,0,0]},bookShore:{value:points('book-cover')},cupShore:{value:new THREE.Vector4(c.x,c.z,s.x*.5,s.z*.5)}};
  const material=new THREE.MeshPhysicalMaterial({map:photo,color:0xffffff,roughness:.8,metalness:0,clearcoat:.48,clearcoatRoughness:.23,envMapIntensity:.7,side:THREE.DoubleSide});
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader='attribute float waveWeight; varying vec3 seaWorld;varying float seaTop;varying float seaWeight; uniform float seaTime,seaAmount;\n'+waveField+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      seaWorld=(modelMatrix*vec4(position,1.)).xyz;seaTop=smoothstep(.65,.95,normal.y);seaWeight=waveWeight;
      float flood=smoothstep(.82-uv.y,1.18-uv.y,seaAmount*1.36-.18);
      transformed.y+=swell(seaWorld.xz,seaTime).x*max(0.,waveWeight)*flood;`);
    shader.fragmentShader=`varying vec3 seaWorld;varying float seaTop;
      varying float seaWeight;uniform vec3 sunward,sunTint,skyTint;
      ${waveField}
      uniform float seaTime,seaAmount;uniform vec2 laptopShore[4],bookShore[4],islandShore[24];uniform float shoreBlend[3];uniform vec4 cupShore;
      float segmentDistance(vec2 p,vec2 a,vec2 b){vec2 v=b-a;return length(p-a-v*clamp(dot(p-a,v)/dot(v,v),0.,1.));}
      float shoreDistance(vec2 p){
        float d=10.;
        for(int i=0;i<4;i++){
          int j=(i+1)%4;
          d=min(d,segmentDistance(p,laptopShore[i],laptopShore[j]));
          d=min(d,segmentDistance(p,bookShore[i],bookShore[j])+shoreBlend[0]);
        }
        for(int k=0;k<3;k++){
          if(shoreBlend[k]<=0.)continue;
          for(int i=0;i<8;i++){
            float edge=segmentDistance(p,islandShore[k*8+i],islandShore[k*8+(i+1)%8]);
            d=min(d,edge+(1.-shoreBlend[k]));
          }
        }
        return min(d,abs(length((p-cupShore.xy)/cupShore.zw)-1.)*min(cupShore.z,cupShore.w));
      }
      float hash21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float seaNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),f.x),f.y);}
      float wet;float shore;vec2 waveSlope;
      `+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>
      vec2 q=seaWorld.xz;
      // Back-to-front material handoff in desk coordinates, reversible at every
      // point. The white rim recedes with the arriving water.
      float frontness=clamp(1.-vMapUv.y,0.,1.);
      float boundary=seaAmount*1.36-.18+(seaNoise(q*9.)-.5)*.025*sin(seaAmount*3.14159265);
      wet=seaTop*smoothstep(frontness-.18,frontness+.18,boundary);
      shore=shoreDistance(q);
      if(seaWeight<0. && smoothstep(frontness-.18,frontness+.18,boundary)>.99)discard;
      vec2 wind=q+.016*vec2(sin(q.y*32.+1.2*cos(q.x*14.)-seaTime*.55),cos(q.x*26.+sin(q.y*13.)+seaTime*.48));
      waveSlope=swell(q,seaTime).yz*max(seaWeight,.12);
      waveSlope+=component(wind,vec2(.83,.56),170.,.00055,-seaTime*2.9).yz;
      waveSlope+=component(wind,vec2(-.6,.8),275.,.00023,seaTime*3.8).yz;`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float shallows=exp(-shore*32.);
      float current=seaNoise(q*8.+vec2(seaTime*.025,-seaTime*.018));
      vec3 deep=vec3(.011,.108,.16),turquoise=vec3(.021,.245,.27),sandWater=vec3(.17,.40,.32);
      vec3 water=mix(deep,turquoise,.36+.42*current);
      water=mix(water,sandWater,shallows*.82);
      float caustic=pow(1.-abs(sin(q.x*135.+sin(q.y*112.+seaTime*.2))*sin(q.y*147.-sin(q.x*96.-seaTime*.27))),18.);
      water+=vec3(.045,.10,.085)*caustic*(.2+shallows*.8);
      float wash=exp(-shore*180.)*(.4+.6*pow(sin(shore*260.-seaTime*.65),2.));
      water=mix(water,vec3(.58,.73,.64),wash*.32);
      vec3 rippleNormal=normalize(vec3(-waveSlope.x,1.,-waveSlope.y));
      vec3 eye=normalize(cameraPosition-seaWorld);
      vec3 reflected=reflect(-eye,rippleNormal);
      float fresnel=.025+.72*pow(1.-clamp(dot(eye,rippleNormal),0.,1.),4.);
      vec3 sky=mix(skyTint,skyTint*vec3(.30,.48,.71),smoothstep(-.15,.89,reflected.y));
      float glint=pow(max(dot(reflected,sunward),0.),90.);
      water=mix(water,sky,fresnel*.84)+sunTint*glint*1.15;
      if(!gl_FrontFacing)water=mix(vec3(.018,.26,.32),vec3(.33,.77,.70),smoothstep(.22,.97,-eye.y)+.18*waveSlope.y);
      diffuseColor.rgb=mix(diffuseColor.rgb,water,wet);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,.23,wet);');
    shader.fragmentShader=shader.fragmentShader.replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\nmetalnessFactor=mix(metalnessFactor,.08,wet);');
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_begin>',`#include <normal_fragment_begin>
      normal=normalize(normal+mat3(viewMatrix)*vec3(-waveSlope.x,0.,-waveSlope.y)*wet);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <clearcoat_normal_fragment_begin>',`#include <clearcoat_normal_fragment_begin>
      clearcoatNormal=normalize(clearcoatNormal+mat3(viewMatrix)*vec3(-waveSlope.x,0.,-waveSlope.y)*wet);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`#include <opaque_fragment>
      if(!gl_FrontFacing && seaWeight>=0.){
        vec3 eye=normalize(cameraPosition-seaWorld);
        vec3 n=normalize(vec3(-waveSlope.x,1.,-waveSlope.y));
        float windowLight=smoothstep(.59,.83,dot(-eye,n));
        gl_FragColor.rgb=mix(gl_FragColor.rgb,mix(vec3(.019,.21,.26),vec3(.51,.87,.79),windowLight),wet*.84);
      }`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <colorspace_fragment>',`
      gl_FragColor.rgb=mix(gl_FragColor.rgb,texture2D(map,vMapUv).rgb,.88*(1.-wet));
      #include <colorspace_fragment>`);
  };
  material.customProgramCacheKey=()=> 'photographed-desk-to-archipelago-v3';
  const cup=Array.from({length:28},(_,i)=>{const a=i*Math.PI/14;return new THREE.Vector2(c.x+.5*s.x*Math.cos(a),c.z+.5*s.z*Math.sin(a));});
  return{material,setSun(sun){uniforms.sunward.value=sun.direction;uniforms.sunTint.value=sun.color;uniforms.skyTint.value=sun.waterSky;},clock:uniforms.seaTime,coasts:[...shores,uniforms.laptopShore.value,uniforms.bookShore.value,cup],setShoreBlend(index,amount){uniforms.shoreBlend.value[index]=amount;},setAmount(amount){uniforms.seaAmount.value=amount;}};
}

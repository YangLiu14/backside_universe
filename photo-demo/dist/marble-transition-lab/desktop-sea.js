import * as THREE from 'three';

// Change the material of the registered tabletop itself. There is no second
// sheet of water to z-fight, overflow its outline, or cover the objects.
export function createDesktopSea(photo,objects,shores){
  const points=name=>{const p=objects.getObjectByName(name).geometry.attributes.position;return Array.from({length:4},(_,i)=>new THREE.Vector2(p.getX(i),p.getZ(i)));};
  const saucer=new THREE.Box3().setFromObject(objects.getObjectByName('saucer'));
  const c=saucer.getCenter(new THREE.Vector3()),s=saucer.getSize(new THREE.Vector3());
  const uniforms={seaTime:{value:0},seaAmount:{value:0},laptopShore:{value:points('laptop-base')},islandShore:{value:shores.flat()},shoreBlend:{value:[0,0,0]},bookShore:{value:points('book-cover')},cupShore:{value:new THREE.Vector4(c.x,c.z,s.x*.5,s.z*.5)}};
  const material=new THREE.MeshPhysicalMaterial({map:photo,color:0xffffff,roughness:.8,metalness:0,clearcoat:.48,clearcoatRoughness:.23,envMapIntensity:.7,side:THREE.DoubleSide});
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader='varying vec3 seaWorld;varying float seaTop;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      seaWorld=(modelMatrix*vec4(position,1.)).xyz;seaTop=smoothstep(.65,.95,normal.y);`);
    shader.fragmentShader=`varying vec3 seaWorld;varying float seaTop;
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
      // point. The original tabletop's sides remain its familiar white rim.
      float frontness=clamp(1.-vMapUv.y,0.,1.);
      float boundary=seaAmount*1.36-.18+(seaNoise(q*9.)-.5)*.025*sin(seaAmount*3.14159265);
      wet=seaTop*smoothstep(frontness-.18,frontness+.18,boundary);
      shore=shoreDistance(q);
      float w1=q.x*43.+q.y*27.-seaTime*.72,w2=q.x*-57.+q.y*36.+seaTime*.53,w3=q.x*113.+q.y*85.-seaTime*.31;
      waveSlope=vec2(.055*cos(w1)-.025*cos(w2)+.012*cos(w3),.035*cos(w1)+.016*cos(w2)+.009*cos(w3));
      waveSlope*=smoothstep(0.,.025,shore);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float shallows=exp(-shore*32.);
      float current=seaNoise(q*8.+vec2(seaTime*.025,-seaTime*.018));
      vec3 deep=vec3(.015,.13,.18),turquoise=vec3(.035,.29,.31),sandWater=vec3(.25,.48,.39);
      vec3 water=mix(deep,turquoise,.36+.42*current);
      water=mix(water,sandWater,shallows*.82);
      float caustic=pow(1.-abs(sin(q.x*135.+sin(q.y*112.+seaTime*.2))*sin(q.y*147.-sin(q.x*96.-seaTime*.27))),18.);
      water+=vec3(.045,.10,.085)*caustic*(.2+shallows*.8);
      float wash=exp(-shore*180.)*(.4+.6*pow(sin(shore*260.-seaTime*.65),2.));
      water=mix(water,vec3(.58,.73,.64),wash*.32);
      diffuseColor.rgb=mix(diffuseColor.rgb,water,wet);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,.23,wet);');
    shader.fragmentShader=shader.fragmentShader.replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\nmetalnessFactor=mix(metalnessFactor,.08,wet);');
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_begin>',`#include <normal_fragment_begin>
      normal=normalize(normal+mat3(viewMatrix)*vec3(-waveSlope.x,0.,-waveSlope.y)*wet);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <clearcoat_normal_fragment_begin>',`#include <clearcoat_normal_fragment_begin>
      clearcoatNormal=normalize(clearcoatNormal+mat3(viewMatrix)*vec3(-waveSlope.x,0.,-waveSlope.y)*wet);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <colorspace_fragment>',`
      gl_FragColor.rgb=mix(gl_FragColor.rgb,texture2D(map,vMapUv).rgb,.88*(1.-wet));
      #include <colorspace_fragment>`);
  };
  material.customProgramCacheKey=()=> 'photographed-desk-to-archipelago-v2';
  return{material,setShoreBlend(index,amount){uniforms.shoreBlend.value[index]=amount;},update(time,amount){uniforms.seaTime.value=time;uniforms.seaAmount.value=amount;}};
}

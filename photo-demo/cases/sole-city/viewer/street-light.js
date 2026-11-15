import * as T from 'three';

// Sample in direction space: both the visible sky and the reflection probe see
// the same low broken cloud band, including across the longitude seam.
function cloudNoise(x,y,z){
  const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z);
  function corner(a,b,c){
    const v=Math.sin((ix+a)*127.1+(iy+b)*311.7+(iz+c)*74.7)*43758.5453;
    return v-Math.floor(v);
  }
  function ease(f){return f*f*(3-2*f);}
  const u=ease(x-ix),v=ease(y-iy),w=ease(z-iz),mix=T.MathUtils.lerp;
  function layer(c){return mix(mix(corner(0,0,c),corner(1,0,c),u),mix(corner(0,1,c),corner(1,1,c),u),v);}
  return mix(layer(0),layer(1),w);
}

// Sky and reflection probes share linear radiance. +Y in street coordinates
// points into the room's underside; in world space the visible zenith is -Y.
export function morningLight(renderer, scene, city, sunDirection) {
  const width=768, height=384, pixels=new Uint16Array(width*height*4);
  const zenith=new T.Color(0x6c9ac3), horizon=new T.Color(0xb5c1c4);
  const earth=new T.Color(0x75665b), sunlight=new T.Color(0xffdda8);
  const cloudShade=new T.Color(0x8391a3), cloudRim=new T.Color(0xf0c5a0);
  const distantHill=new T.Color(0x889ba5), nearHill=new T.Color(0x73868a);
  const horizonTint=new T.Color();
  const direction=new T.Vector3(), color=new T.Color(), cloud=new T.Color();
  const key=sunDirection.clone().normalize();
  const smooth=T.MathUtils.smoothstep;
  // The distant Jiangnan hills belong to the sky probe. Sample their outline
  // on a circle so that the visible horizon and its wet-road reflection join.
  const ridges=Array.from({length:width},(_,x)=>{
    const azimuth=((x+.5)/width-.5)*2*Math.PI;
    const u=Math.cos(azimuth),v=Math.sin(azimuth);
    return [
      .014+.062*cloudNoise(u*3.6,v*3.6,7.2)+.019*cloudNoise(u*11,v*11,6.1),
      -.013+.049*cloudNoise(u*5.7,v*5.7,9.3)+.009*cloudNoise(u*16,v*16,1.7),
    ];
  });
  for(let y=0;y<height;y++){
    const latitude=((y+.5)/height-.5)*Math.PI;
    for(let x=0;x<width;x++){
      const longitude=((x+.5)/width-.5)*2*Math.PI;
      direction.set(Math.cos(latitude)*Math.cos(longitude),Math.sin(latitude),Math.cos(latitude)*Math.sin(longitude));
      const e=-direction.y, facing=Math.max(0,direction.dot(key));
      const sunward=facing**6;
      if(e<0)color.copy(horizon).lerp(earth,smooth(-e,0,.22));
      else{
        color.copy(horizon).lerp(zenith,Math.sqrt(e)).multiplyScalar(1.35);
        const horizonGlow=(.35+1.2*sunward)*Math.exp(-e*4.8)*sunward;
        color.r+=sunlight.r*horizonGlow;color.g+=sunlight.g*horizonGlow;color.b+=sunlight.b*horizonGlow;
        // Two cloud scales on one slanting layer. Project in direction space
        // so clouds foreshorten towards the horizon and wrap at the sky seam.
        const h=Math.max(.16,e+.09), u=(direction.x+.45*direction.z)/h,v=(direction.z-.38*direction.x)/h;
        const density=.58*cloudNoise(.68*u+2,.52*v,4.6)+.29*cloudNoise(1.67*u,1.12*v+4,1.4)+.13*cloudNoise(4.1*u,3.2*v,1.1);
        const cover=smooth(density,.39,.66)*smooth(e,.018,.14);
        cloud.copy(cloudShade).lerp(cloudRim,sunward*.80).multiplyScalar(.84+.38*sunward);
        color.lerp(cloud,cover*.78);
        // Narrow bright sun and a broader scattering halo stay above display
        // white in the light probe. The screen view compresses them afterward.
        const halo=(.44*facing**12+1.95*facing**94+3.0*facing**620)*(1.-.48*cover);
        const disk=smooth(facing,.99983,.99996)*13.*(1.-.69*cover);
        const energy=halo+disk;
        color.r+=sunlight.r*energy;color.g+=sunlight.g*energy;color.b+=sunlight.b*energy;
      }
      const [farRidge,nearRidge]=ridges[x];
      if(e<farRidge+.012){
        horizonTint.copy(distantHill).lerp(horizon,.59+.20*sunward);
        color.lerp(horizonTint,(1-smooth(e,farRidge-.006,farRidge+.012))*.75);
        horizonTint.copy(nearHill).lerp(horizon,.40+.25*sunward);
        color.lerp(horizonTint,(1-smooth(e,nearRidge-.004,nearRidge+.007))*.85);
      }
      const i=4*(y*width+x);
      pixels[i]=T.DataUtils.toHalfFloat(color.r);pixels[i+1]=T.DataUtils.toHalfFloat(color.g);
      pixels[i+2]=T.DataUtils.toHalfFloat(color.b);pixels[i+3]=T.DataUtils.toHalfFloat(1);
    }
  }
  const sky=new T.DataTexture(pixels,width,height,T.RGBAFormat,T.HalfFloatType);
  sky.mapping=T.EquirectangularReflectionMapping;sky.colorSpace=T.LinearSRGBColorSpace;
  sky.magFilter=sky.minFilter=T.LinearFilter;sky.wrapS=T.RepeatWrapping;sky.needsUpdate=true;
  const filter=new T.PMREMGenerator(renderer), filtered=filter.fromEquirectangular(sky);
  filter.dispose();
  const dome=new T.Mesh(new T.SphereGeometry(36,40,20),new T.ShaderMaterial({
    side:T.BackSide,depthWrite:false,transparent:true,uniforms:{sky:{value:sky},amount:{value:0}},
    vertexShader:`varying vec3 bearing;
      void main(){ bearing=(modelMatrix*vec4(position,1.)).xyz-cameraPosition;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader:`#include <common>
      varying vec3 bearing; uniform sampler2D sky; uniform float amount;
      void main(){ gl_FragColor=vec4(texture2D(sky,equirectUv(normalize(bearing))).rgb,amount);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  }));
  dome.position.copy(city.position);dome.renderOrder=-1000;dome.visible=false;scene.add(dome);
  return phase=>{
    const open=smooth(phase,.70,.80);
    dome.material.uniforms.amount.value=open;dome.visible=open>0;
    scene.environment=phase>.49?filtered.texture:null;
    scene.environmentIntensity=.60*smooth(phase,.49,.69);
  };
}

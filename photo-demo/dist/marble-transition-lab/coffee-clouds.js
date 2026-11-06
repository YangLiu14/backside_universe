import * as THREE from 'three';
import {cupDraft} from './harbor-waterline.js';

const {smoothstep}=THREE.MathUtils;
const duration=24, count=6;
const pathGLSL=`
  vec3 flight(float age){
    // Buoyancy dominates at the cup; the same parcel spreads downwind as it cools.
    return vec3(-.92*pow(age,1.49), .156*(1.-exp(-6.2*age))+.022*age,
      .34*age+.012*sin(age*9.));
  }`;

function noiseVolume(){
  const size=48,data=new Uint8Array(size**3);
  let seed=232297;
  const grids=[4,8,16,32].map(n=>{
    const grid=new Float32Array(n**3);
    for(let i=0;i<grid.length;i++){seed=Math.imul(seed,1664525)+1013904223|0;grid[i]=(seed>>>0)/4294967296;}
    return {n,grid};
  });
  function sample(x,y,z,{n,grid}){
    const i=Math.floor(x*n),j=Math.floor(y*n),k=Math.floor(z*n);
    const fade=t=>t*t*(3-2*t),u=fade(x*n-i),v=fade(y*n-j),w=fade(z*n-k);
    let sum=0;
    for(let dz=0;dz<2;dz++)for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){
      sum+=grid[(i+dx)%n+n*((j+dy)%n+n*((k+dz)%n))]*(dx?u:1-u)*(dy?v:1-v)*(dz?w:1-w);
    }
    return sum;
  }
  for(let z=0;z<size;z++)for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    let value=0;grids.forEach((g,i)=>{value+=sample(x/size,y/size,z/size,g)*(.535/(2**i));});
    data[x+size*(y+size*z)]=Math.round(value*255);
  }
  const tex=new THREE.Data3DTexture(data,size,size,size);
  tex.format=THREE.RedFormat;tex.minFilter=tex.magFilter=THREE.LinearFilter;
  tex.wrapS=tex.wrapT=tex.wrapR=THREE.RepeatWrapping;tex.unpackAlignment=1;tex.needsUpdate=true;return tex;
}

export function createCoffeeClouds(scene,coffee,sun){
  const root=new THREE.Group();root.name='Coffee steam condensing into clouds';root.visible=false;scene.add(root);
  const origin=new THREE.Box3().setFromObject(coffee).getCenter(new THREE.Vector3());
  const uniforms={origin:{value:origin.clone()},clock:{value:0},wet:{value:0},
    sunlight:{value:sun.color},sunward:{value:sun.direction},vaporNoise:{value:null}};
  function populate(){
    uniforms.vaporNoise.value=noiseVolume();
    // Three translucent filaments untwist above separate points on the liquid.
    const coords=[],index=[];
    for(let strand=0;strand<3;strand++){
      const start=coords.length/3;
      for(let i=0;i<=56;i++){
        coords.push(-1,i/56,strand,1,i/56,strand);
        const a=start+2*i;if(i<56)index.push(a,a+1,a+2,a+1,a+3,a+2);
      }
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(coords,3));g.setIndex(index);
    const steam=new THREE.Mesh(g,new THREE.ShaderMaterial({uniforms,transparent:true,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true,
      vertexShader:`uniform vec3 origin;uniform float clock;varying vec3 ribbon;
        ${pathGLSL}
        void main(){
          float t=position.y,s=position.z,phase=s*2.31;
          vec3 p=origin+flight(t*.32);
          p.x+=.008*cos(phase)+(.0018+.012*t)*sin(phase+13.*t-clock*1.16)+.004*t*sin(phase+22.*t-clock*1.43);
          p.z+=.007*sin(phase)+(.002+.010*t)*cos(phase+12.*t-clock*.92);
          vec4 mv=viewMatrix*vec4(p,1.);
          mv.x+=position.x*(.003+.015*t)*(.82+.18*cos(phase+12.*t-clock*.95));
          ribbon=position;gl_Position=projectionMatrix*mv;
        }`,
      fragmentShader:`uniform float wet,clock;uniform vec3 sunlight;uniform highp sampler3D vaporNoise;varying vec3 ribbon;
        void main(){
          float t=ribbon.y;
          float n=texture(vaporNoise,vec3(.20*ribbon.x+.21*ribbon.z,.93*t-clock*.066,.29*ribbon.z+clock*.013)).r;
          float edge=abs(ribbon.x+.46*(n-.5));
          float a=exp(-edge*edge*5.5)*smoothstep(0.,.11,t)*(1.-smoothstep(.51,1.,t));
          a*=wet*(.13+.50*n)*(.75+.25*sin(14.*t-clock*1.1+ribbon.z));
          gl_FragColor=vec4(mix(vec3(.86,.89,.89),sunlight,.19),a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`}));
    steam.name='Warm filaments over coffee';steam.frustumCulled=false;steam.raycast=()=>{};root.add(steam);

    // One instanced draw covers a handful of finite cloud volumes. Each is
    // ray-marched only inside its projected bounds and dissolves before recycling.
    const cube=new THREE.BoxGeometry(2,2,2);
    const box=new THREE.InstancedBufferGeometry().copy(cube);cube.dispose();box.instanceCount=count;
    box.setAttribute('parcel',new THREE.InstancedBufferAttribute(Float32Array.from([.007,.154,.349,.478,.686,.859]),1));
    const clouds=new THREE.Mesh(box,new THREE.ShaderMaterial({uniforms,transparent:true,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true,
      vertexShader:`attribute float parcel;uniform vec3 origin;uniform float clock;
        varying vec3 cell,extent,eye;varying float life,seed;
        ${pathGLSL}
        void main(){
          life=fract(clock/${duration.toFixed(1)}+parcel);seed=parcel*39.;
          float grow=smoothstep(.09,.47,life),r=.013+.095*grow;
          vec3 center=origin+flight(life);
          center.z+=grow*.038*sin(seed+life*4.);
          center.y+=grow*.019*cos(seed+life*6.);
          extent=r*vec3(1.+.22*sin(seed),.48+.11*cos(seed),.60);
          eye=(cameraPosition-center)/extent;
          cell=position;
          gl_Position=projectionMatrix*viewMatrix*vec4(center+position*extent,1.);
        }`,
      fragmentShader:`uniform float wet,clock;uniform vec3 sunlight,sunward;uniform highp sampler3D vaporNoise;
        varying vec3 cell,extent,eye;varying float life,seed;
        float density(vec3 p){
          float nx=.13*sin(seed),nz=.14*cos(seed*1.7);
          float main=1.-length((p-vec3(nx,.04,nz))*vec3(1.64,1.33,1.45));
          float left=1.-length((p-vec3(-.39,-.14,-nz))*vec3(2.15,2.02,1.99));
          float right=1.-length((p-vec3(.39,-.19,.09))*vec3(2.08,2.2,1.7));
          vec3 q=.55*p+vec3(seed,clock*.009,seed*.31);
          float noise=texture(vaporNoise,q).r-.50;
          float d=max(main,max(left,right))+.91*noise;
          return clamp(d*2.9,0.,1.)*smoothstep(-.75,-.46,p.y+.40*noise);
        }
        void main(){
          bool inside=all(lessThan(abs(eye),vec3(1.)));
          if(gl_FrontFacing==inside)discard;
          float opacity=wet*smoothstep(.10,.32,life)*(1.-smoothstep(.82,1.,life));if(opacity<.003)discard;
          vec3 rd=normalize(cell-eye),inv=1./(sign(rd)*max(abs(rd),vec3(.00001))+vec3(1.e-8));
          vec3 a=(-1.-eye)*inv,b=(1.-eye)*inv;
          vec3 nearBox=min(a,b),farBox=max(a,b);
          float start=max(0.,max(max(nearBox.x,nearBox.y),nearBox.z)),end=min(min(farBox.x,farBox.y),farBox.z);
          float stepSize=max(0.,end-start)/20.;
          vec3 lightStep=normalize(sunward/extent)*.24;
          vec3 light=mix(vec3(.94,1.,1.03),sunlight,.61)*1.35;
          vec3 shade=mix(vec3(.34,.43,.56),sunlight*.5,.23);
          vec4 sum=vec4(0.);
          for(int i=0;i<20;i++){
            vec3 p=eye+rd*(start+(float(i)+.5)*stepSize);
            float d=density(p);if(d<.01)continue;
            float lit=clamp(.62+1.0*(d-density(p+lightStep))+.24*p.y-.14*density(p+2.1*lightStep),0.,1.);
            float alpha=1.-exp(-d*stepSize*3.3*opacity);
            sum.rgb+=(1.-sum.a)*alpha*mix(shade,light,lit);
            sum.a+=(1.-sum.a)*alpha;if(sum.a>.985)break;
          }
          if(sum.a<.005)discard;
          gl_FragColor=vec4(sum.rgb/sum.a,sum.a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`}));
    clouds.name='Downwind cumulus';clouds.frustumCulled=false;clouds.raycast=()=>{};root.add(clouds);
  }
  return {update(time,amount){
    root.visible=amount>.001;if(!root.visible)return;
    if(!root.children.length)populate();
    uniforms.clock.value=time;
    uniforms.wet.value=smoothstep(amount,0,.65);
    uniforms.origin.value.y=origin.y-cupDraft*smoothstep(amount,0,1)+.001;
  }};
}

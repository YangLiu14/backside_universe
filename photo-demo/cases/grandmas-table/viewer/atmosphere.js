// The rain is outside the casement. The drops refract the same courtyard seen
// through the pane, so their highlights stay attached to the glass as you walk.
import * as T from 'three';

const noise = `
  float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
  float noise2(vec2 p){
    vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),
               mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);
  }`;

// A passing shower has brief lulls. Water already caught on the pane keeps
// draining through them, while the airborne rain and its sound ease together.
export function rainfallAt(time){
  return .77+.16*Math.sin(time*.37)+.07*Math.sin(time*.83+.6);
}

export function rainWindow(width,height,courtyard,depth,clock) {
  const material=new T.ShaderMaterial({
    uniforms:{sceneView:{value:courtyard},courtDepth:{value:depth},clock,strength:{value:1}},
    vertexShader:`varying vec2 paneUV; varying vec3 sight;
      void main(){
        paneUV=uv;
        sight=position-(inverse(modelMatrix)*vec4(cameraPosition,1.)).xyz;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
      }`,
    fragmentShader:`uniform sampler2D sceneView; uniform sampler2D courtDepth; uniform float clock; uniform float strength;
      varying vec2 paneUV; varying vec3 sight;
      `+noise+`
      // Each column has its own catch, release and drainage speed. The head of
      // the drop and its narrow wet trail share a path on the outside surface.
      vec4 runoff(vec2 uv,float time,float columns,float seed){
        vec2 grid=uv*vec2(columns,columns*.26);
        float col=floor(grid.x), phase=hash(vec2(col,seed));
        grid.y+=time*(.13+.10*phase)+phase*16.;
        vec2 cell=floor(grid), q=fract(grid);
        float h=hash(cell+seed);
        float level=.16+.67*h;
        float center=.2+.59*hash(cell+seed+6.)+.036*sin(grid.y*6.+col);
        vec2 p=vec2((q.x-center)/(.052+.037*h),(q.y-level)/(.019+.012*h));
        float d=dot(p,p), edge=1.-smoothstep(.72,1.17,d);
        float trail=(1.-smoothstep(.005,.022,abs(q.x-center)))*
                    smoothstep(.012,.048,q.y-level)*(1.-smoothstep(.07,.44,q.y-level));
        return vec4(p*edge,edge,trail);
      }
      float drizzle(vec2 uv,float t,float n,float density){
        vec2 q=uv*vec2(n,n*.42); q.x+=q.y*(.114+.013*sin(t*.36));
        float column=floor(q.x);
        q.y+=t*(4.+hash(vec2(column,n))*2.5);
        vec2 id=floor(q),f=fract(q);
        float line=(1.-smoothstep(.014,.067,abs(f.x-.5)))*
             smoothstep(.04,.18,f.y)*(1.-smoothstep(.36,.76,f.y));
        return line*smoothstep(.68-.26*density,.74-.26*density,hash(id+n))*density;
      }
      vec3 impact(vec2 uv,float time){
        vec2 grid=uv*vec2(14.,11.),cell=floor(grid);
        float age=time*.33+hash(cell)*31.,cycle=floor(age),u=fract(age);
        vec2 p=fract(grid)-(.19+.62*vec2(hash(cell+cycle),hash(cell+cycle+8.)));
        p.y+=smoothstep(.46,.86,u)*.13;
        p.x*=1.16;
        float r=length(p),size=.030+.024*smoothstep(.06,.42,u);
        float bead=(1.-smoothstep(size*.68,size,r))*(1.-smoothstep(.78,.96,u));
        float contact=(1.-smoothstep(.004,.013,abs(r-.015-u*.67)))*(1.-smoothstep(.018,.115,u));
        return vec3(p/max(size,.01)*bead,contact);
      }
      void main(){
        vec2 uv=paneUV, slope=clamp(sight.xy/max(.16,-sight.z),vec2(-1.7),vec2(1.7));
        vec2 angular=tanh(slope);
        vec2 base=vec2(.55,.50)+(uv-.5)*vec2(.60,.68)+angular*vec2(.139,.140);
        vec2 ext=base;
        // Reproject DA3 inverse depth: the far gateway and near sill move
        // by different amounts behind the stationary pane and metalwork.
        for(int i=0;i<2;i++){
          float inverseDepth=texture2D(courtDepth,ext).r;
          ext=base+angular*(.53-inverseDepth)*vec2(.062,.046);
        }
        vec4 drops=runoff(uv,clock,11.,4.)+runoff(uv+vec2(.17,.07),clock*.72,18.,19.);
        vec2 speckGrid=uv*vec2(43.,35.), cell=floor(speckGrid);
        vec2 speck=(fract(speckGrid)-vec2(.2+.6*hash(cell),.18+.64*hash(cell+8.)))*vec2(1.,1.08);
        float size=.031+.075*hash(cell+15.);
        float fixedDrop=(1.-smoothstep(size*.72,size,length(speck)))*step(.4,hash(cell+2.));
        vec3 strike=impact(uv,clock);
        vec2 bend=drops.xy*.019+fixedDrop*speck/max(size,.01)*.009+strike.xy*.011;
        vec3 exterior=texture2D(sceneView,clamp(ext+bend,.002,.998)).rgb;
        float showers=drizzle(uv+slope*.035,clock,49.,strength)*.13+drizzle(uv+slope*.13,clock*.83,83.,strength)*.057;
        exterior=mix(exterior,vec3(.55,.65,.71),showers);
        vec2 lightRay=uv+slope*vec2(-.42,-.45);
        float lamp=exp(-dot((lightRay-vec2(.83,.76))*vec2(9.,21.),(lightRay-vec2(.83,.76))*vec2(9.,21.)));
        float bevel=max(0.,-drops.x*.39+drops.y*.67);
        exterior=exterior*(1.-.10*min(1.,drops.z))+
          vec3(.52,.65,.70)*(bevel*.53+fixedDrop*.13+drops.w*.065+strike.z*.26+max(0.,strike.y)*.29)+lamp*vec3(.24,.135,.057);
        vec2 border=min(uv,1.-uv);
        exterior*=.83+.17*smoothstep(0.,.055,min(border.x,border.y));
        gl_FragColor=vec4(exterior,1.);
        #include <colorspace_fragment>
      }`
  });
  const pane=new T.Mesh(new T.PlaneGeometry(width,height),material);
  pane.onBeforeRender=()=>{material.uniforms.strength.value=rainfallAt(clock.value);};
  return pane;
}

// One camera-facing quad per plate. Two thin, differently advected streams
// break up at the top. Keep the depth test so the bowls and lamp occlude them.
export function steamAbove(plates,clock) {
  const positions=[],uvs=[],seeds=[],indices=[];
  for(const [i,plate] of plates.entries()){
    for(const [u,v] of [[0,0],[1,0],[1,1],[0,1]]){
      positions.push(plate.position.x,plate.position.y+plate.userData.foodHeight*.75,plate.position.z);
      uvs.push(u,v);seeds.push(i*7.71+3.23);
    }
    const n=i*4;indices.push(n,n+1,n+2,n,n+2,n+3);
  }
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geo.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));
  geo.setAttribute('seed',new T.Float32BufferAttribute(seeds,1));geo.setIndex(indices);
  const mat=new T.ShaderMaterial({uniforms:{clock},transparent:true,depthWrite:false,side:T.DoubleSide,
    vertexShader:`attribute float seed; varying float stream; varying vec2 vUv;
      void main(){
        vUv=uv;stream=seed;
        vec3 p=position+vec3(0.,uv.y*(.235+.02*sin(seed)),0.);
        vec4 mv=modelViewMatrix*vec4(p,1.);
        mv.x+=(uv.x-.5)*.18*length(modelMatrix[0].xyz);
        gl_Position=projectionMatrix*mv;
      }`,
    fragmentShader:`uniform float clock;varying vec2 vUv;varying float stream;`+noise+`
      void main(){
        float h=vUv.y,t=clock*.57, x=vUv.x;
        float curl=noise2(vec2(h*3.5-t*.45,stream+t*.31));
        float bend=(curl-.5)*(.22+.40*h);
        float body=0.;
        for(int i=0;i<3;i++){
          float k=float(i), phase=stream+k*2.7;
          float center=.27+k*.205+bend+.10*sin(h*9.-t*1.12+phase)*h;
          float width=.037+h*.052;
          float delta=(x-center)/width;
          float strand=exp(-delta*delta);
          float billow=noise2(vec2(x*7.+phase,h*6.2-t*1.75));
          body+=strand*smoothstep(.19,.72,billow);
        }
        float alpha=smoothstep(0.,.12,h)*(1.-smoothstep(.36,1.,h))*body*.32;
        gl_FragColor=vec4(.84,.85,.82,alpha);
        #include <colorspace_fragment>
      }`});
  const mesh=new T.Mesh(geo,mat);mesh.frustumCulled=false;mesh.renderOrder=5;return mesh;
}

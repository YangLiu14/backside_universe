// Live views of the exhibits installed in the dog, registered to the food centerline.
import * as T from 'three';
import {createFoyer} from './gallery-foyer.js';
import {nativeAt} from './digestive-tract.js';

const windows=[
  {zone:'chest',label:'食管旁 · 胸腔',ids:['lungs','heart'],edges:[5.45,7.15,9.05,10.10]},
  {zone:'upper',label:'胃部 · 上腹',ids:['liver','stomach'],edges:[11.12,12.05,13.58,14.55]},
  {zone:'bowel',label:'小肠旁 · 腹腔',ids:['kidney','gut'],edges:[16.8,18.55,23.85,26.15]},
  {zone:'bowel',label:'大肠旁 · 腹腔',ids:['kidney','gut'],edges:[27.6,29.25,31.55,33.05]}
];
const v=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const smooth=(a,b,x)=>T.MathUtils.smoothstep(x,a,b);
const blend=(k,[a,b,c,d])=>smooth(a,b,k)*(1-smooth(c,d,k));

export function createOrganPassages(museum){
  const {worldFromNative,exhibits}=museum;
  const sites=windows.map(site=>{
    const centers=site.ids.map(id=>exhibits.get(id).anchor.getWorldPosition(v()));
    const center=centers[0].clone().lerp(centers[1],.5);
    // Stop where the registered centerline comes closest to the pair of galleries.
    let nearest=Infinity,arrival=0;
    for(let k=site.edges[1];k<=site.edges[2];k+=.025){
      const distance=worldFromNative(nativeAt(k)).distanceToSquared(center);
      if(distance<nearest){nearest=distance;arrival=k;}
    }
    return {...site,center,arrival};
  });
  function at(k){
    let site=null,opening=0,peek=0;
    for(const next of sites){
      const amount=blend(k,next.edges);
      const start=next.edges[0];
      const lead=next.zone==='upper'?1.08:1.30;
      const preview=smooth(start-lead,start-lead*.60,k)*(1-smooth(next.edges[0],next.edges[1],k));
      if((amount>0&&amount>=opening)||(opening===0&&preview>peek)){opening=amount;peek=preview;site=next;}
    }
    return {site,opening,peek};
  }
  function corridor(k,site,yaw,pitch){
    const p=nativeAt(k);
    // Follow the same height and longitudinal position as the food, on the open
    // side of the cast. This lets the visitor look through the real gallery doors.
    const target=site.center.clone().lerp(worldFromNative(p),.23);
    const eye=worldFromNative(v(.368,p.y+.045,p.z+.035));
    const view=target.clone().sub(eye);
    const right=view.clone().cross(v(0,1,0)).normalize();
    view.applyAxisAngle(v(0,1,0),yaw*.76).applyAxisAngle(right,pitch*.76);
    return {eye,target:eye.clone().add(view)};
  }
  function inside(id){
    const e=exhibits.get(id),depth=e.depth||.095;
    // Start just beyond the sill looking into the open face: each exhibit has
    // its own carved entrance and foreground depth.
    const positions={
      heart:   [-.035,-.068,1.00,-.018,-.035,-.10],
      lungs:   [ .010,-.080,1.03, .000,-.040,-.12],
      liver:   [ .018,-.055,.98,  .020,-.035,-.10],
      stomach: [-.020,-.090,.99, .010,-.070,-.12],
      kidney:  [ .085,-.050,1.06, .155,-.070,-.10],
      gut:     [ .010,-.065,.98, .010,-.070,-.13]
    };
    const [ex,ey,d,tx,ty,tz]=positions[id];
    const eye=e.anchor.localToWorld(v(ex*e.w,ey*e.h,depth*.34+e.h*(d-.64)));
    const target=e.anchor.localToWorld(v(tx*e.w,ty*e.h,tz*depth));
    return {eye,target};
  }
  function location(id){
    const e=exhibits.get(id);return e.anchor.localToWorld(v(0,-e.h*.28,(e.depth||.095)*.48));
  }
  // The portal is fixed in world coordinates. The entering camera crosses the sill.
  const thresholds=new T.Scene(),foyers=new Map();
  thresholds.add(new T.HemisphereLight('#ffeac7','#b59177',1.7));
  const light=new T.DirectionalLight('#ffdcac',2);thresholds.add(light);
  for(const site of sites){
    const pose=corridor(site.arrival,site,0,0);
    const direction=pose.target.clone().sub(pose.eye),distance=direction.length();
    const gate=createFoyer(site.zone);gate.visible=false;
    gate.position.copy(pose.eye).addScaledVector(direction,.35);gate.lookAt(pose.eye);
    site.gateScale=distance*.35;
    thresholds.add(gate);foyers.set(site,gate);
  }
  function renderFoyer(renderer,camera,site,aspect,visitWeight){
    const gate=foyers.get(site);if(!gate||visitWeight>.65)return;
    const halfHeight=Math.max(.44,.52/aspect)*site.gateScale;
    gate.scale.set(halfHeight*aspect*.91,halfHeight*.94,halfHeight*.83);
    light.position.copy(camera.position).add(v(-.2,1,.4));
    gate.visible=true;
    try{renderer.render(thresholds,camera);}finally{gate.visible=false;}
  }
  return {sites,at,corridor,inside,location,renderFoyer};
}

// The doorway composites two live 3D scenes. At first the view is framed
// by the modeled lintel; near the sill it fills the viewport.
export function createWindowRim(){
  const world=new T.WebGLRenderTarget(1,1),lining=world.clone(),size=new T.Vector2();
  world.texture.colorSpace=lining.texture.colorSpace=T.SRGBColorSpace;
  const scene=new T.Scene(),camera=new T.Camera();
  const uniforms={lining:{value:lining.texture},world:{value:world.texture},opening:{value:0},
    peek:{value:0},door:{value:new T.Vector2()},extent:{value:new T.Vector2()}};
  const material=new T.ShaderMaterial({depthTest:false,depthWrite:false,uniforms,
    vertexShader:'varying vec2 st;void main(){st=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader:`uniform sampler2D lining,world;uniform float opening,peek;uniform vec2 door,extent;varying vec2 st;
      void main(){
        float spread=smoothstep(.06,.99,opening);
        vec2 origin=mix(door,vec2(.5),spread);
        vec2 radius=mix(clamp(extent,vec2(.018),vec2(1.2)),vec2(.88),spread);
        vec2 p=(st-origin)/radius;
        float shape=max(length(vec2(p.x,max(p.y-.055,0.))),-p.y*.96);
        float edge=max(.012,fwidth(shape)*1.45);
        float mask=(1.-smoothstep(.97-edge,1.+edge,shape))*max(peek,smoothstep(0.,.12,opening));
        float revealScale=mix(clamp(2.*max(extent.x,extent.y),.055,1.),1.,spread);
        vec2 galleryUV=clamp((st-origin)/revealScale+.5,0.,1.);
        vec3 room=texture2D(lining,st).rgb,exhibit=texture2D(world,galleryUV).rgb;
        gl_FragColor=vec4(mix(room,exhibit,mask),1.);
        #include <colorspace_fragment>
      }`});
  scene.add(new T.Mesh(new T.PlaneGeometry(2,2),material));
  let previous=null;
  function begin(renderer){
    renderer.getDrawingBufferSize(size);
    for(const rt of [world,lining])if(rt.width!==size.x||rt.height!==size.y)rt.setSize(size.x,size.y);
    previous=renderer.getRenderTarget();renderer.setRenderTarget(world);
  }
  function compose(renderer,opening,peek,renderLining,channels){
    renderer.setRenderTarget(lining);
    try{renderLining();}finally{renderer.setRenderTarget(previous);}
    uniforms.door.value.copy(channels.anchor);uniforms.extent.value.copy(channels.extent);
    uniforms.opening.value=opening;uniforms.peek.value=peek;renderer.render(scene,camera);
  }
  function mapping(){
    const spread=smooth(.06,.99,uniforms.opening.value);
    const center=uniforms.door.value.clone().lerp(new T.Vector2(.5,.5),spread);
    const e=uniforms.extent.value;
    const scale=T.MathUtils.lerp(T.MathUtils.clamp(2*Math.max(e.x,e.y),.055,1),1,spread);
    return {center,scale,spread};
  }
  function screenPoint(pt){
    const {center,scale}=mapping();
    return {x:pt.x*scale+2*center.x-1,y:pt.y*scale+2*center.y-1};
  }
  function pickPoint(pt){
    const {center,scale,spread}=mapping(),dx=(pt.x+1)*.5-center.x,dy=(pt.y+1)*.5-center.y;
    const e=uniforms.extent.value;
    const px=dx/T.MathUtils.lerp(T.MathUtils.clamp(e.x,.018,1.2),.88,spread);
    const py=dy/T.MathUtils.lerp(T.MathUtils.clamp(e.y,.018,1.2),.88,spread);
    if(Math.max(Math.hypot(px,Math.max(py-.055,0)),-py*.96)>1)return null;
    return {x:2*dx/scale,y:2*dy/scale};
  }
  return {begin,compose,screenPoint,pickPoint};
}

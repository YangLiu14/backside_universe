// Live views of the exhibits installed in the dog, registered to the food centerline.
import * as T from 'three';
import {nativeAt} from './digestive-tract.js';

const windows=[
  {zone:'chest',label:'食管旁 · 胸腔',ids:['lungs','heart'],edges:[5.45,7.15,9.05,10.10]},
  {zone:'upper',label:'胃部 · 上腹',ids:['liver','stomach'],edges:[9.85,10.95,13.58,14.95]},
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
    let site=null,opening=0;
    for(const next of sites){
      const amount=blend(k,next.edges);
      if(amount>opening){opening=amount;site=next;}
    }
    return {site,opening};
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
  return {sites,at,corridor,inside,location};
}

// While the observation window opens, composite the live lumen around its rim.
// Both underlying views are rendered from the current route position each frame.
export function createWindowRim(){
  const target=new T.WebGLRenderTarget(1,1);
  target.texture.colorSpace=T.SRGBColorSpace;
  const scene=new T.Scene(),camera=new T.Camera(),size=new T.Vector2();
  const material=new T.ShaderMaterial({transparent:true,depthTest:false,depthWrite:false,
    uniforms:{lining:{value:target.texture},opening:{value:0}},
    vertexShader:'varying vec2 st; void main(){st=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader:`uniform sampler2D lining;uniform float opening;varying vec2 st;
      void main(){
        vec2 p=(st-.5)*2.;float a=atan(p.y,p.x);
        float r=length(p)*(1.+.035*sin(5.*a)+.021*cos(3.*a));
        float radius=mix(-.13,1.61,opening);
        float alpha=smoothstep(radius-.11,radius+.07,r);
        vec3 col=texture2D(lining,st).rgb*(1.-.23*(1.-smoothstep(.0,.16,abs(r-radius))));
        gl_FragColor=vec4(col,alpha);
        #include <colorspace_fragment>
      }`});
  scene.add(new T.Mesh(new T.PlaneGeometry(2,2),material));
  return (renderer,opening,renderLining)=>{
    renderer.getDrawingBufferSize(size);
    if(target.width!==size.x||target.height!==size.y)target.setSize(size.x,size.y);
    const previous=renderer.getRenderTarget();
    renderer.setRenderTarget(target);
    try{renderLining();}finally{renderer.setRenderTarget(previous);}
    material.uniforms.opening.value=opening;renderer.render(scene,camera);
  };
}

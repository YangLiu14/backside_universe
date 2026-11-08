// Positions and pivots are world-space. Zoom moves the camera rather than scaling the dog.
import {Vector3,Spherical,MathUtils} from 'three';

export class BrowseCamera {
  constructor(eye,target){
    this.eye=eye.clone();this.target=target.clone();
    this.homeDistance=eye.distanceTo(target);
    this.zoom=1;this.yaw=0;this.pitch=0;
  }
  basis(){
    const back=this.eye.clone().sub(this.target).normalize();
    const right=new Vector3(back.z,0,-back.x).normalize();
    return {right,up:back.clone().cross(right)};
  }
  orbit(dx,dy){
    const polar=new Spherical().setFromVector3(this.eye.clone().sub(this.target));
    polar.theta-=dx;polar.phi=MathUtils.clamp(polar.phi-dy,.055,Math.PI-.055);
    this.eye.setFromSpherical(polar).add(this.target);this.yaw-=dx;this.pitch=Math.PI/2-polar.phi;
  }
  translate(x,y,projection){
    const {right,up}=this.basis(),d=this.eye.distanceTo(this.target);
    const delta=right.multiplyScalar(x*d/projection.elements[0]).addScaledVector(up,y*d/projection.elements[5]);
    this.eye.add(delta);this.target.add(delta);
  }
  dolly(factor,x,y,projection){
    const old=this.eye.distanceTo(this.target);
    const d=MathUtils.clamp(old*factor,this.homeDistance*.035,this.homeDistance*3);
    const ratio=d/old,offset=this.eye.clone().sub(this.target).multiplyScalar(ratio);
    // Keep the point under the wheel or between two fingers in the same screen position.
    this.translate(x*(1-ratio),y*(1-ratio),projection);
    this.eye.copy(this.target).add(offset);this.zoom=d/this.homeDistance;
  }
  frame(point){
    const offset=this.eye.clone().sub(point);
    const d=MathUtils.clamp(offset.length()*.72,this.homeDistance*.055,this.homeDistance*2);
    this.eye.copy(point).add(offset.setLength(d));this.target.copy(point);this.zoom=d/this.homeDistance;
  }
}

export function bindBrowseGestures(stage,api){
  const fingers=new Map();let gesture=null,ignoreClick=false,tap=null,trackpadScale=null;
  const at=e=>({x:e.clientX,y:e.clientY}),dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const middle=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
  const rect=()=>stage.getBoundingClientRect();
  function ndc(p){const r=rect();return {x:(p.x-r.left)*2/r.width-1,y:1-(p.y-r.top)*2/r.height};}
  function carriesButton(e){return e.target.closest('button')&&!e.target.closest('.organ-pin');}
  const pair=()=>{const [a,b]=[...fingers.values()];return {center:middle(a,b),span:dist(a,b)};};
  function pan(dx,dy){const r=rect();api.pan(-2*dx/r.width,2*dy/r.height);}
  stage.addEventListener('pointerdown',e=>{
    if(!api.ready()||carriesButton(e)||e.button>2||(!api.browsing()&&(api.selected()||e.button!==0)))return;
    if(fingers.size>=2||(!api.browsing()&&fingers.size))return;
    const p=at(e);fingers.set(e.pointerId,p);
    if(fingers.size===1){
      ignoreClick=false;
      gesture={from:p,last:p,angle:api.angle(),dragged:false,browse:api.browsing(),
        pin:e.target.closest('.organ-pin'),pan:e.button!==0||e.shiftKey};
      api.pause();if(!gesture.pin)stage.focus({preventScroll:true});
    }else{
      Object.assign(gesture,{multi:true,dragged:true,pair:pair()});ignoreClick=true;tap=null;
    }
    // Capture on the original element so a stationary tap on a numbered button is still a native click.
    e.target.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove',e=>{
    if(!gesture||!fingers.has(e.pointerId))return;
    const p=at(e);fingers.set(e.pointerId,p);
    if(fingers.size===2){
      const prev=gesture.pair,now=pair(),anchor=ndc(prev.center);
      if(prev.span>=3&&now.span>=3)api.zoom(prev.span/now.span,anchor);
      pan(now.center.x-prev.center.x,now.center.y-prev.center.y);
      gesture.pair=now;return;
    }
    if(!gesture.dragged&&dist(p,gesture.from)<4)return;
    gesture.dragged=true;ignoreClick=true;tap=null;
    const dx=p.x-gesture.last.x,dy=p.y-gesture.last.y,r=rect();
    if(!gesture.browse)api.seek(gesture.angle+(p.x-gesture.from.x)/r.width*115);
    else if(gesture.pan||e.shiftKey)pan(dx,dy);
    else api.orbit(dx/r.width*Math.PI*1.55,dy/r.height*Math.PI);
    gesture.last=p;
  });
  function finish(e){
    if(!fingers.delete(e.pointerId)||!gesture)return;
    if(fingers.size){
      // Lift one finger after pinching: continue from the remaining finger, with no jump or accidental tap.
      const [p]=fingers.values();Object.assign(gesture,{last:p,from:p,pair:null,dragged:true});return;
    }
    const end=gesture;gesture=null;
    if(e.type!=='pointerup'||end.dragged||end.pan||end.pin)return;
    const p=at(e);
    if(api.selected()){
      if(tap&&performance.now()-tap.time<360&&dist(p,tap)<20){api.frame(ndc(p));tap=null;}
      else tap={...p,time:performance.now()};
    }else if(api.angle()>=85){tap=null;api.pick(ndc(p));}
  }
  for(const type of ['pointerup','pointercancel','lostpointercapture'])stage.addEventListener(type,finish);
  stage.addEventListener('click',e=>{if(ignoreClick&&e.detail!==0&&e.target.closest('.organ-pin')){e.preventDefault();e.stopPropagation();}},{capture:true});
  stage.addEventListener('contextmenu',e=>{if(api.browsing()&&!carriesButton(e))e.preventDefault();});
  stage.addEventListener('wheel',e=>{
    if(carriesButton(e))return;
    if(!api.browsing()){if(api.selected())e.preventDefault();return;}
    e.preventDefault();const unit=e.deltaMode===1?16:e.deltaMode===2?stage.clientHeight:1;
    if(trackpadScale!==null&&e.ctrlKey)return;
    const dx=e.deltaX*unit,dy=e.deltaY*unit;
    if(e.shiftKey){pan(dx||dy,dx?dy:0);return;}
    if(dx&&!e.ctrlKey)pan(-dx,0);
    api.zoom(Math.exp(MathUtils.clamp(dy*(e.ctrlKey?.014:.00175),-1.8,1.8)),ndc(at(e)));
  },{passive:false});
  // WebKit delivers trackpad magnification as GestureEvents instead of Ctrl+wheel.
  stage.addEventListener('gesturestart',e=>{
    if(api.browsing()&&!carriesButton(e)){e.preventDefault();trackpadScale=e.scale||1;}
  },{passive:false});
  stage.addEventListener('gesturechange',e=>{
    if(trackpadScale===null)return;e.preventDefault();
    if(!fingers.size&&api.browsing()&&e.scale>0){
      const r=rect(),p=Number.isFinite(e.clientX)&&e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom?at(e):{x:r.left+r.width/2,y:r.top+r.height/2};
      api.zoom(trackpadScale/e.scale,ndc(p));
    }
    trackpadScale=e.scale||1;
  },{passive:false});
  stage.addEventListener('gestureend',e=>{if(trackpadScale!==null)e.preventDefault();trackpadScale=null;},{passive:false});
}

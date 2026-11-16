// Narrow overlays for offline recording; never write these into a release.
const assert=require('node:assert/strict');
function replaceOnce(source,before,after){assert.equal(source.split(before).length,2,'Recording patch anchor must occur once: '+before.slice(0,80));return source.replace(before,after);}
exports.patchSources=function({rewind,tour,assembly}){
  rewind="import {createPromoDirector} from '/promo-director.js';\n"+rewind;
  const fitStart=rewind.indexOf(' function fitFrame(){'),fitEnd=rewind.indexOf('\n function draw(',fitStart);
  assert(fitStart>=0&&fitEnd>fitStart);
  rewind=rewind.slice(0,fitStart)+` function fitFrame(){
  const r=stage.getBoundingClientRect(),w=Math.round(r.width),h=Math.round(r.height);
  if(frameWidth===w&&frameHeight===h)return;
  frameWidth=w;frameHeight=h;frame.style.width=w+'px';frame.style.height=h+'px';gs.setSize(w,h,false);mesh.setSize(w,h,false);
 }`+rewind.slice(fitEnd);
  const hook=' window.rewindMotionSample=t=>{try{campus.animate(t);return campus.motionSample(t);}finally{campus.animate(clock.time);}};';
  rewind=replaceOnce(rewind,hook,hook+`
 window.promo=await createPromoDirector({gs,mesh,spark,real,tiny,cam,assembly,campus,tour,a,photo:$('photo'),
  setBase:(p,c)=>{progress=p;close=c;portrait=false;inspectX=inspectY=0;draw(false);},
  getFrameSize:()=>({width:frameWidth,height:frameHeight})});`);
  tour=replaceOnce(tour,"camera.position.z<=threshold.z+.85","camera.position.z<=threshold.z+.20");
  tour=replaceOnce(tour,'  return {start,back,reset,update,render,toMini,camera,',`  function directShot(position,quaternion,projection){
    register();mode='outbound';camera.position.fromArray(position);camera.quaternion.fromArray(quaternion);
    camera.updateProjectionMatrix();for(const i of [0,5,8,9])camera.projectionMatrix.elements[i]=projection[i];
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();camera.updateMatrixWorld(true);
  }
  return {start,back,reset,update,render,toMini,camera,directShot,`);
  assembly=replaceOnce(assembly,' return {root,rear,shell,pen,pencil,stand,animate,',` return {root,rear,shell,pen,pencil,stand,animate,
  directTape(value){drive.rotation.z=value;supply.rotation.z=value*1.53;pencil.rotation.z=value;phase.value=value*5;},`);
  return {rewind,tour,assembly};
};

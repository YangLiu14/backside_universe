import * as THREE from 'three';
import {createPaperBoat,noteText} from './paper-boat.js';
import {createBeach} from './cup-beach.js';
import {waterHeightProbe} from './ocean-surface.js';

const {clamp,lerp,smoothstep}=THREE.MathUtils;
const up=new THREE.Vector3(0,1,0);
const entryDuration=2.9,foldDuration=1.2,voyageDuration=6.2;
const hints={approach:'',note:'点一下浅水边的纸条。',folding:'',boat:'按住纸船，向海面推，再松手。',sailing:'',farewell:''};

export function createCupHarbor({cup,holiday,scene,camera,canvas,reduced,changed,returned}){
  const inlet=cup.material.uniforms.cupOpening.value,rear=cup.material.uniforms.cupRear.value;
  const heading=Math.atan2(-rear.x,-rear.y);
  function point(out,across,height){
    const x=inlet.x+rear.x*out-rear.y*across,z=inlet.y+rear.y*out+rear.x*across;
    return new THREE.Vector3(x,holiday.surface(x,z)+height,z);
  }
  const group=new THREE.Group();group.name='Blue cup shoreline visit';group.visible=false;scene.add(group);
  const beachDetail=createBeach(point);group.add(beachDetail);
  const saucer=cup.parent.getObjectByName('saucer');
  // The old miniature's foam rings are sized for the overview, where they
  // overlap the new moving sea. Keep the cottage, palms, chairs and jetty.
  const miniatureSea=holiday.group.getObjectByName('A small holiday');
  const localWater=miniatureSea.children.filter(o=>o.isMesh&&(o.name==='Moving turquoise water'||o.renderOrder===2));
  const savedFog={near:0,far:0};
  let ashore=false;
  function shoreBlend(amount){
    beachDetail.position.y=-.018*(1-amount);
    holiday.sea.setCloseDetail(amount);
    scene.fog.near=lerp(savedFog.near,.09,amount);scene.fog.far=lerp(savedFog.far,.50,amount);
  }
  function closeDetail(active){
    ashore=active;beachDetail.visible=active;saucer.visible=!active;
    for(const o of localWater)o.visible=!active;
    shoreBlend(Number(active));
  }
  const route=new THREE.CatmullRomCurve3([
    point(.025,0,0),point(.045,.001,0),point(.072,.003,0),point(.104,-.009,0),point(.143,-.044,0),
  ]);
  const float=new THREE.Group(),offshore=new THREE.Group();
  group.add(float);scene.add(offshore);offshore.name='Paper boat at sea';offshore.visible=false;
  let paper=null,afloat=null,spare=null,passage=null;
  const wakeMaterial=new THREE.MeshBasicMaterial({color:0xf7f1d5,vertexColors:true,side:THREE.DoubleSide,transparent:true,opacity:0,depthWrite:false});
  const wakeGeometry=new THREE.BufferGeometry(),wakeVertices=[],colors=[],index=[];
  for(const side of [-1,1]){
    for(let i=0;i<=18;i++){
      const u=i/18,base=wakeVertices.length/3,alpha=Math.sin(Math.PI*u)**.7;
      for(const edge of [0,1]){
        wakeVertices.push(side*(.0014+.0058*u+.0006*Math.sin(5*u)+edge*.0006*alpha),0,.001+.022*u);
        colors.push(1,1,1,alpha);
      }
      if(i)index.push(base-2,base-1,base,base,base-1,base+1);
    }
  }
  wakeGeometry.setAttribute('position',new THREE.Float32BufferAttribute(wakeVertices,3));
  wakeGeometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,4));wakeGeometry.setIndex(index);
  const wake=new THREE.Mesh(wakeGeometry,wakeMaterial);wake.name='Two ripples behind the paper boat';float.add(wake);

  // Sample the actual water triangles once on arrival. Each phase then evaluates
  // only the two nearest stations, including the wave tilt across the hull.
  const stations=Array.from({length:33},(_,i)=>{
    const q=route.getPointAt(i/32);
    const probe=(across,along)=>waterHeightProbe(holiday.table,q.x-rear.y*across+rear.x*along,q.z+rear.x*across+rear.y*along);
    return {center:probe(0,0),right:probe(.0045,0),front:probe(0,.0045)};
  });
  const rim=point(.056,-.032,.096),mouth=point(.057,-.009,.040),beach=point(.006,-.003,.0225);
  const target=point(.027,0,0),horizon=point(.16,-.056,.004);
  const rimAim=point(.000,0,.026),mouthAim=point(.009,0,.012);
  let phase='desk',elapsed=0,travel=0,push=0,hand=null,entryPath,startRotation,deskNear;
  let dirty=true;
  const gaze=new THREE.Vector3(),rotation=new THREE.Quaternion(),look=new THREE.Matrix4();
  const ray=new THREE.Raycaster(),ndc=new THREE.Vector2();
  function setPhase(value){dirty=true;phase=value;elapsed=0;changed(value,hints[value]||'');}
  function view(){
    if(phase==='approach'){
      const t=smoothstep(elapsed/entryDuration,0,1);
      camera.position.copy(entryPath.getPoint(t));
      if(t<1/3)gaze.copy(rimAim);
      else if(t<2/3)gaze.lerpVectors(rimAim,mouthAim,smoothstep(t,1/3,2/3));
      else gaze.lerpVectors(mouthAim,target,smoothstep(t,2/3,1));
      rotation.setFromRotationMatrix(look.lookAt(camera.position,gaze,up));
      camera.quaternion.slerpQuaternions(startRotation,rotation,smoothstep(t,0,.38));
    }else{
      camera.position.copy(beach);
      // Lift the gaze with the departing paper, keeping the viewer on the sand.
      gaze.lerpVectors(target,horizon,travel);
      camera.lookAt(gaze);
    }
    camera.updateMatrixWorld(true);
  }
  function floatAt(hull,sheet,u,time){
    route.getPointAt(u,hull.position);
    const n=u*(stations.length-1),i=Math.min(Math.floor(n),stations.length-2);
    const height=key=>lerp(stations[i][key](time),stations[i+1][key](time),n-i);
    const center=height('center');
    hull.position.y=center+.0007;hull.rotation.set(0,heading,0);
    const pitch=Math.atan((height('front')-center)/.0045),roll=Math.atan((height('right')-center)/.0045);
    hull.rotateX(pitch);hull.rotateZ(roll);
    sheet.mesh.rotation.y=lerp(-.07,.93,smoothstep(u,0,.31));
  }
  function positionPaper(time){
    const u=phase==='sailing'||phase==='farewell'?travel:push;
    floatAt(float,paper,u,time);
    wakeMaterial.opacity=.53*smoothstep(u,.02,.14)*(1-smoothstep(u,.82,1));
    wake.visible=wakeMaterial.opacity>.01;
  }
  function enter(){
    savedFog.near=scene.fog.near;savedFog.far=scene.fog.far;closeDetail(true);shoreBlend(0);
    deskNear=camera.near;camera.near=.00045;
    entryPath=new THREE.CatmullRomCurve3([camera.position.clone(),rim,mouth,beach]);
    startRotation=camera.quaternion.clone();
    paper??=spare||createPaperBoat();spare=null;float.add(paper.mesh);
    group.visible=true;paper.fold(0);travel=0;push=0;hand=null;
    setPhase('approach');positionPaper(holiday.sea.clock.value);
    if(reduced()){shoreBlend(1);setPhase('note');view();}
  }
  function leave(){
    if(phase==='desk')return;
    const pointer=hand?.id;hand=null;
    if(pointer!=null&&canvas.hasPointerCapture(pointer))canvas.releasePointerCapture(pointer);
    if(phase==='sailing'||phase==='farewell'){
      // Transfer this very sheet, including its folds and ink, into the shared sea.
      if(afloat){offshore.remove(afloat.mesh);spare=afloat;}
      afloat=paper;paper=null;offshore.add(afloat.mesh);
      passage={from:launchFrom,clock:phase==='farewell'?voyageDuration:elapsed};
      updateDrift(0,holiday.sea.clock.value,1);
    }
    group.visible=false;closeDetail(false);camera.near=deskNear;setPhase('desk');returned();
  }
  function fold(){if(phase==='note')setPhase('folding');}
  let launchFrom=0;
  function release(){
    if(phase!=='boat')return;
    offshore.visible=false;passage=null;launchFrom=travel=push;setPhase('sailing');
  }
  const outerBerth=route.getPointAt(1);
  const westward=Array.from({length:13},(_,i)=>{
    const u=i/12,x=outerBerth.x-.134*u,z=outerBerth.z+.026*u;
    return waterHeightProbe(holiday.table,x,z);
  });
  function updateDrift(dt,time,sea){
    if(!passage)return;
    offshore.visible=sea>.99;
    if(!offshore.visible)return;
    passage.clock=reduced()?Math.max(voyageDuration,passage.clock):passage.clock+dt;
    const u=lerp(passage.from,1,1-(1-Math.min(1,passage.clock/voyageDuration))**1.35);
    floatAt(offshore,afloat,u,time);
    if(passage.clock>voyageDuration){
      const t=1-Math.exp(-(passage.clock-voyageDuration)/36);
      const n=t*12,i=Math.min(11,Math.floor(n));
      offshore.position.x-=.134*t;offshore.position.z+=.026*t;
      offshore.position.y=lerp(westward[i](time),westward[i+1](time),n-i)+.0007;
      offshore.rotateY(-.74*t);
    }
  }
  function tick(dt,time){
    if(phase==='desk')return false;
    const still=reduced()&&!dirty&&['note','farewell','boat'].includes(phase)&&!hand&&push<.0001;
    if(still)return false;
    dirty=false;elapsed+=dt;
    if(phase==='approach'){
      shoreBlend(reduced()?1:smoothstep(elapsed/entryDuration,.10,.85));
      if(reduced()||elapsed>=entryDuration)setPhase('note');
    }else if(phase==='folding'){
      const t=reduced()?1:Math.min(1,elapsed/foldDuration);
      paper.fold(t);if(t===1)setPhase('boat');
    }else if(phase==='sailing'){
      const t=Math.min(1,elapsed/(reduced()?.8:voyageDuration));
      // A reduced-motion visit cuts from the released boat to the distant boat,
      // holding that last view before the closing line appears.
      travel=reduced()?(t>.32?1:launchFrom):lerp(launchFrom,1,1-(1-t)**1.35);
      if(t===1)setPhase('farewell');
    }else if(phase==='boat'&&!hand){push*=Math.exp(-13*dt);}
    positionPaper(time);view();return true;
  }
  function hit(e){
    const r=canvas.getBoundingClientRect();
    ndc.set((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2);
    ray.setFromCamera(ndc,camera);paper.mesh.updateWorldMatrix(true,false);
    if(ray.intersectObject(paper.mesh,false).length)return true;
    // Give the narrow hull a finger-sized target on touch screens.
    if(e.pointerType!=='touch')return false;
    const center=paper.mesh.getWorldPosition(gaze).project(camera);
    return Math.hypot((ndc.x-center.x)*r.width/2,(ndc.y-center.y)*r.height/2)<23;
  }
  function down(e){
    if(hand||e.button!==0||!['boat','note'].includes(phase)||!hit(e))return;
    canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);
    hand={id:e.pointerId,x:e.clientX,y:e.clientY,base:push};
  }
  function move(e){
    if(hand?.id!==e.pointerId||phase!=='boat')return;
    const span=clamp(canvas.clientHeight*.17,52,90);
    push=clamp(hand.base+(hand.y-e.clientY)/span*.12,0,.12);
  }
  function end(e){
    if(hand?.id!==e.pointerId)return;
    const start=hand;
    if(e.type==='pointerup')move(e);
    hand=null;
    if(e.type==='pointerup'){
      if(phase==='note'&&Math.hypot(e.clientX-start.x,e.clientY-start.y)<9)fold();
      else if(phase==='boat'&&push>=.066)release();
    }
  }
  return {departure:{points:[mouth,rim]},
    withdraw(t){shoreBlend(1-t);},
    enter,leave,fold,release,updateDrift,tick,down,move,end,cancelHand(){hand=null;},get active(){return phase!=='desk';},
    get boatAtSea(){return offshore.visible?offshore.position:null;},
    get phase(){return phase;},get ashore(){return ashore&&(phase!=='approach'||elapsed>entryDuration*.85);},get label(){return phase==='note'?noteText+' 点纸条或按回车折船。':'蓝杯港湾';}};
}

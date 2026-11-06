import * as THREE from 'three';
import {handset,silenceKey} from './phone-case.js';
import {piece,surface,vec} from './island-props.js';

function roundedCase(x,y,z,segments,radius){
  const bevel=Math.min(radius,x*.45,y*.45,z*.45);
  const size=vec(x,y,z).multiplyScalar(.5).subScalar(bevel);
  const geo=new THREE.BoxGeometry(x,y,z,segments*2+1,segments*2+1,segments*2+1);
  const p=geo.attributes.position,normal=geo.attributes.normal,v=new THREE.Vector3();
  for(let i=0;i<p.count;i++){
    v.fromBufferAttribute(p,i);const corner=vec(Math.sign(v.x)*size.x,Math.sign(v.y)*size.y,Math.sign(v.z)*size.z);
    // Project each subdivided cube face onto its rounded edge.
    v.set(v.x/x,v.y/y,v.z/z);
    v.set(Math.sign(v.x)*Math.max(0,Math.abs(v.x)-.19),Math.sign(v.y)*Math.max(0,Math.abs(v.y)-.19),Math.sign(v.z)*Math.max(0,Math.abs(v.z)-.19)).normalize();
    normal.setXYZ(i,v.x,v.y,v.z);v.multiplyScalar(bevel).add(corner);p.setXYZ(i,v.x,v.y,v.z);
  }
  return geo;
}

function notificationTexture(){
  const c=document.createElement('canvas');c.width=640;c.height=192;
  const g=c.getContext('2d');g.fillStyle='#f5ecda';g.beginPath();g.roundRect(5,5,630,182,32);g.fill();
  g.fillStyle='#ce7659';g.beginPath();g.arc(69,93,29,0,2*Math.PI);g.fill();
  g.fillStyle='#fff4d9';g.beginPath();g.roundRect(55,83,27,17,5);g.fill();g.beginPath();g.moveTo(59,98);g.lineTo(59,106);g.lineTo(69,98);g.fill();
  g.fillStyle='#687468';g.font='31px "PingFang SC",sans-serif';g.fillText('工作群',123,72);
  g.fillStyle='#233b38';g.font='500 48px "PingFang SC",sans-serif';g.fillText('有人提到了你',120,139);
  const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;return map;
}

// Generate quiet knocking with short, damped resonances; all nodes belong to
// this visit. Nothing plays before the visitor explicitly enables harbor audio.
function portAudio(){
  let ctx,bus,next=0;
  function tone(hz,duration,gain,type='sine',delay=0){
    const at=ctx.currentTime+delay,osc=ctx.createOscillator(),envelope=ctx.createGain();
    osc.type=type;osc.frequency.value=hz;
    envelope.gain.setValueAtTime(.0001,at);envelope.gain.exponentialRampToValueAtTime(gain,at+.008);
    envelope.gain.exponentialRampToValueAtTime(.0001,at+duration);
    osc.connect(envelope).connect(bus);osc.start(at);osc.stop(at+duration+.02);
    osc.onended=()=>{osc.disconnect();envelope.disconnect();};
  }
  return {
    get on(){return !!ctx;},
    toggle(){
      if(ctx){this.stop();return;}
      const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
      ctx=new Audio();bus=ctx.createGain();bus.gain.value=.32;bus.connect(ctx.destination);
      const current=ctx;current.resume().catch(()=>{if(ctx===current)this.stop();});next=ctx.currentTime+.2;
    },
    afterSwitch(){if(ctx)next=ctx.currentTime+1.15;},
    update(quiet){
      if(!ctx||ctx.state!=='running'||ctx.currentTime<next)return;
      if(quiet){
        tone(278,.09,.28,'triangle');tone(790,.12,.075);tone(332,.10,.13,'triangle',.29);
        next=ctx.currentTime+3.3+.45*Math.sin(ctx.currentTime*.7);
      }else{tone(736,.27,.14);tone(984,.33,.12,'sine',.12);next=ctx.currentTime+6.5;}
    },
    stop(){if(ctx){bus.disconnect();ctx.close().catch(()=>{});ctx=null;}},
  };
}

export function createTidalPort({island,props,holiday,camera,canvas,notify}){
  const mount=new THREE.Group();props.add(mount);
  mount.position.set(-handset.width/2,silenceKey.height,silenceKey.z);
  const steel=surface('#c5c7c3',.66,.30),dark=surface('#353937',.30,.46);
  piece(mount,roundedCase(.004,.021,.096,3,.002),dark,-.001);
  piece(mount,roundedCase(.004,.013,.043,3,.0018),surface('#ce7041'),-.002,0,-.020);
  const thumb=new THREE.Group();thumb.name='Tidal port silence switch';mount.add(thumb);
  piece(thumb,roundedCase(.009,.016,.047,3,.004),steel,-.004);
  for(const z of [-.011,0,.011])piece(thumb,new THREE.BoxGeometry(.001,.008,.0018),dark,-.0086,0,z);
  const map=notificationTexture(),material=new THREE.SpriteMaterial({map,transparent:true,depthWrite:false,toneMapped:false});
  const notice=new THREE.Sprite(material);notice.name='Work chat above tidal port';notice.scale.set(.33,.099,1);notice.position.set(-.025,.196,.075);props.add(notice);
  const audio=portAudio(),center=new THREE.Vector3();
  // Frame the complete handset, including the near charging edge. A fixed
  // eye position clipped that edge in wide views and both ends on a phone.
  const centerline=island.localToWorld(vec(0,.063,0)),aim=new THREE.Vector3(),eye=new THREE.Vector3();
  const wide=vec(-.98,.77,.65),narrow=vec(-.48,1.1,1.0);
  const bounds=[vec(.14,.20,.26),vec(-.13,.19,-.15),vec(0,.17,-.43),vec(-.025,.25,.075)];
  for(const x of [-1,1])for(const z of [-1,1])bounds.push(vec(x*handset.width/2,0,z*handset.length/2));
  const offsets=bounds.map(p=>island.localToWorld(p).sub(centerline));
  const fov=26,tan=Math.tan(THREE.MathUtils.degToRad(fov/2));
  let lastAspect=0;
  function frameHandset(){
    const aspect=canvas.clientWidth/canvas.clientHeight;
    if(aspect===lastAspect)return;
    lastAspect=aspect;
    const back=narrow.clone().lerp(wide,THREE.MathUtils.smoothstep(aspect,.80,1.65)).transformDirection(island.matrixWorld);
    const right=vec(0,1,0).cross(back).normalize(),up=back.clone().cross(right);
    // IslandVisit preserves the smaller of the horizontal and vertical fields of view.
    function fitAxis(axis,halfAngle){
      const slope=.90*halfAngle;
      let high=-Infinity,low=Infinity;
      for(const p of offsets){
        const lateral=p.dot(axis),depth=p.dot(back);
        high=Math.max(high,lateral+slope*depth);
        low=Math.min(low,lateral-slope*depth);
      }
      return {shift:(high+low)/2,distance:(high-low)/(2*slope)};
    }
    const horizontal=fitAxis(right,tan*Math.max(1,aspect)),vertical=fitAxis(up,tan*Math.max(1,1/aspect));
    aim.copy(centerline).addScaledVector(right,horizontal.shift).addScaledVector(up,vertical.shift);
    eye.copy(aim).addScaledVector(back,Math.max(horizontal.distance,vertical.distance));
  }
  let quiet=false,fade=0,detent=0,sliding=false;
  const noticeDelay=.75;
  let arrivedFor=null,reveal=0;
  function resetNotice(){
    arrivedFor=null;reveal=0;notice.visible=false;material.opacity=0;
    holiday.sea.clearPortNotice();
  }
  const slideAxis=new THREE.Vector2();
  function setQuiet(value){
    quiet=value;sliding=false;
    if(!quiet){arrivedFor=noticeDelay;reveal=0;}
    audio.afterSwitch();notify();
  }
  return {
    title:'手机 · 潮港',hit:mount,audio,
    get state(){return quiet?'quiet':reveal===1?'notification':'waiting-message';},
    get hint(){return this.state==='notification'?'拨动手机侧面的静音键。':'';},
    get action(){return quiet?'恢复通知':reveal===1?'拨到静音':'';},
    get animating(){return arrivedFor!==null&&!quiet&&reveal<1;},
    start(){sliding=false;fade=Number(quiet);resetNotice();},
    arrive(){arrivedFor=0;},
    activate(){setQuiet(!quiet);},
    begin(){
      sliding=true;detent=Number(quiet);
      const a=mount.localToWorld(vec(-.005,0,-.020)).project(camera),b=mount.localToWorld(vec(-.005,0,.020)).project(camera);
      slideAxis.set((b.x-a.x)*canvas.clientWidth/2,(a.y-b.y)*canvas.clientHeight/2);
      slideAxis.divideScalar(Math.max(64,slideAxis.lengthSq()));
    },
    drag(dx,dy){if(sliding)detent=THREE.MathUtils.clamp(detent+dx*slideAxis.x+dy*slideAxis.y,0,1);},
    end(cancel){if(!cancel&&sliding&&Math.abs(detent-Number(quiet))>.4)setQuiet(!quiet);sliding=false;},
    update(dt,time,reduced){
      fade=reduced?Number(quiet):THREE.MathUtils.damp(fade,Number(quiet),6.5,dt);
      thumb.position.z=THREE.MathUtils.lerp(-.020,.020,sliding?detent:fade);
      // Start the beat on landing; approach time and time in other islands do not count.
      if(this.animating){
        arrivedFor+=dt;
        const duration=reduced ? .16 : .42;
        reveal=Math.max(reveal,THREE.MathUtils.clamp((arrivedFor-noticeDelay)/duration,0,1));
        if(reveal===1)notify();
      }
      const remaining=1-reveal;
      const scale=reduced?1:1-.28*remaining**3+.30*reveal*remaining**2;
      notice.scale.set(.33*scale,.099*scale,1);
      notice.position.y=.196-(reduced?0:.026*remaining**3);
      const opacity=THREE.MathUtils.smoothstep(reveal,0,reduced?1:.52);
      const intensity=opacity*(1-fade)*(reduced?1:.88+.12*Math.cos(time*2));
      material.opacity=intensity;notice.visible=intensity>.001;notice.getWorldPosition(center);
      holiday.sea.setPortNotice(center,notice.scale.x*island.scale.x,notice.scale.y*island.scale.x,map,intensity);
      if(quiet||reveal>0)audio.update(quiet);
      frameHandset();return {eye,target:aim,fov};
    },
    stop(){audio.stop();resetNotice();},
  };
}

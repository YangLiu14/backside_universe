import {onRoomVisibility,roomVisible} from '../cinema/room.js';
import {createClayChannels} from './clay-channels.js';
import {BrowseCamera} from './browse-camera.js';
import {boundaries,createTract,nativeAt} from './digestive-tract.js';

import {createOrganPassages,createWindowRim} from './organ-passages.js';

const assets='./assets/digestion/';
const byId=id=>document.getElementById(id);
const approachSeconds=1.35;

function routeMap(canvas,profile,exhibits){
  const ctx=canvas.getContext('2d'),width=canvas.width,height=canvas.height;
  const project=p=>[20+(.54-p.z)*132,4+(.5-p.y)*132];
  const path=new Path2D();
  for(let i=0;i<=304;i++){
    const xy=project(nativeAt(i/8));
    if(i===0)path.moveTo(...xy);else path.lineTo(...xy);
  }
  const dog=new Path2D();
  profile.forEach(([x,y],i)=>{if(i===0)dog.moveTo(20+x*132,4+y*132);else dog.lineTo(20+x*132,4+y*132);});dog.closePath();
  return (k,nearby,visiting)=>{
    ctx.clearRect(0,0,width,height);ctx.save();ctx.scale(width/176,height/143);
    ctx.fillStyle='#e1d8c2';ctx.strokeStyle='#9d947e';ctx.lineWidth=.8;ctx.fill(dog);ctx.stroke(dog);
    for(const [id,e] of exhibits){
      const [cx,cy]=project(e.nativeCenter);
      ctx.beginPath();ctx.ellipse(cx,cy,e.w*55,e.h*55,0,0,Math.PI*2);
      ctx.fillStyle=id===visiting?'#973f24':nearby?.includes(id)?'#ae704b':'#c6aa8a';ctx.fill();
      if(id===visiting){ctx.lineWidth=1.5;ctx.strokeStyle='#fff6d9';ctx.stroke();}
    }
    ctx.lineJoin='round';ctx.strokeStyle='#aa8161';ctx.lineWidth=1.6;ctx.stroke(path);
    ctx.beginPath();
    for(let t=0;t<k;t+=.10){const xy=project(nativeAt(t));if(t===0)ctx.moveTo(...xy);else ctx.lineTo(...xy);}
    const [x,y]=project(nativeAt(k));ctx.lineTo(x,y);ctx.strokeStyle='#9c4431';ctx.lineWidth=2.6;ctx.stroke();
    ctx.beginPath();ctx.arc(x,y,4.4,0,Math.PI*2);ctx.fillStyle='#a4422c';ctx.fill();ctx.strokeStyle='#fff6dc';ctx.lineWidth=1.6;ctx.stroke();ctx.restore();
  };
}

export function createFoodTour({stops,profile,captions,onChange,onExit,museum}){
  const {worldFromNative}=museum,passages=createOrganPassages(museum);
  const channels=createClayChannels(onChange);
  let renderRim;
  const root=byId('stage'),panel=byId('tour-panel'),overlay=byId('tour-overlay');
  const startButton=byId('food-start'),play=byId('tour-play'),mute=byId('tour-sound');
  const shade=byId('tour-shade'),drawMap=routeMap(byId('tour-map'),profile,museum.exhibits);
  const timeline=byId('tour-time'),starts=stops.map((_,i)=>stops.slice(0,i).reduce((sum,s)=>sum+s.seconds,0));
  const total=starts.at(-1)+stops.at(-1).seconds;timeline.max=total;
  const nav=byId('tour-stops'),audio=new Audio(),galleryAudio=new Audio();audio.preload='auto';
  let active=false,playing=false,index=0,elapsed=0,intro=0,finished=false,muted=false;
  let yaw=0,pitch=0,touch=null,tract=null,pendingSound=false,chapterKey=null,tourTime=0;
  const visited=new Set();
  let cutawayCamera=null,parked=false,visit=null,visibleDoors='';
  const doorLayer=byId('tour-doorways'),landing=byId('tour-landing'),roomCard=byId('tour-room-card');
  const doorButtons=new Map();
  for(const [id,e] of museum.exhibits){
    const button=document.createElement('button');
    button.type='button';button.className='tour-door';button.dataset.organ=id;button.hidden=true;
    button.textContent=e.room.organ+' · '+e.room.name+' ↗';button.setAttribute('aria-label','进入'+e.room.name);
    button.onclick=()=>enterGallery(id);doorLayer.append(button);doorButtons.set(id,button);
  }
  const reduce=matchMedia('(prefers-reduced-motion: reduce)');
  const buttons=stops.map((s,i)=>{
    const button=document.createElement('button');button.type='button';button.textContent=s.title;
    button.onclick=()=>jump(i);nav.append(button);return button;
  });
  function currentPassage(){
    return intro<approachSeconds*.76?{site:null,opening:0}:passages.at(position());
  }
  function featured(site){return site.zone==='upper'?'stomach':site.zone==='chest'?'lungs':index===4?'kidney':'gut';}
  function availableDoors(){
    const {site,opening,peek}=currentPassage();
    if(!site)return [];
    if(opening>=.56)return site.ids;
    return peek>=.70||opening>.14?[featured(site)]:[];
  }
  function apertureState(){
    const {opening,peek=0}=currentPassage();
    // Move through the same opening when entering from the first glimpse.
    const w=Math.min(1,(visit?.weight||0)/.63),open=opening+(1-opening)*w*w*(3-2*w);
    return {open,peek,mixed:open<.999&&(open>0||peek>0)};
  }
  function enterGallery(id,fromMesh=false){
    if(visit||!museum.exhibits.has(id))return;
    if(!availableDoors().includes(id)&&!(fromMesh&&currentPassage().opening>=.70))return;
    const {site}=currentPassage();
    visited.add(site.zone);
    visit={id,weight:reduce.matches?1:0,leaving:false,resume:playing,rig:null};
    playing=false;audio.pause();touch=null;
    panel.dataset.visiting='true';byId('tour-room-title').textContent=museum.exhibits.get(id).room.name;
    const booking=visit;
    if(!museum.exhibits.get(id).overview)byId('tour-room-title').textContent+=' · 正在载入';
    museum.loadDetail(id).then(()=>{
      if(booking!==visit)return;
      const e=museum.exhibits.get(id);
      byId('tour-room-title').textContent=e.room.name+(e.detail?'':e.overview?' · 轻量模型':' · 载入失败，可返回重试');
      onChange();
    });
    galleryAudio.src=assets+'galleries/'+id+'.m4a';
    if(!muted&&roomVisible())galleryAudio.play().catch(()=>{});
    show();onChange();root.focus({preventScroll:true});
  }
  function leaveGallery(){
    if(!visit||visit.leaving)return;
    visit.leaving=true;galleryAudio.pause();touch=null;onChange();
    if(reduce.matches)finishVisit();
  }
  function finishVisit(){
    const resume=visit.resume;
    visit=null;delete panel.dataset.visiting;
    playing=resume;audioState();show();onChange();
    root.focus({preventScroll:true});
  }
  function updateVisit(dt){
    if(!visit)return;
    const step=Math.min(.12,dt)/.78;
    visit.weight=Math.max(0,Math.min(1,visit.weight+(visit.leaving?-step:step)));
    if(visit.leaving&&visit.weight===0)finishVisit();
  }
  function galleryPose(){
    const k=position(),{site}=currentPassage();
    if(!site)return null;
    const pose=passages.corridor(k,site,yaw,pitch);
    const {opening,peek}=currentPassage();
    if(opening>0||peek>0){
      const primary=featured(site);
      const preview=passages.inside(primary);
      const t=Math.min(1,Math.max(0,(opening-.28)/.70)),blend=1-t*t*(3-2*t);
      pose.eye.lerp(preview.eye,blend);pose.target.lerp(preview.target,blend);
    }
    if(visit){
      const dest=visit.rig||passages.inside(visit.id),w=visit.weight*visit.weight*(3-2*visit.weight);
      pose.eye.lerp(dest.eye,w);pose.target.lerp(dest.target,w);
    }
    return pose;
  }
  function galleryRig(){
    if(!visit||visit.leaving||visit.weight<1)return null;
    if(!visit.rig){const pose=passages.inside(visit.id);visit.rig=new BrowseCamera(pose.eye,pose.target);}
    return visit.rig;
  }
  function drawEntrances(camera){
    const ids=visit?[]:availableDoors(),key=ids.join('/');
    if(visibleDoors!==key){
      for(const [id,button] of doorButtons)button.hidden=!ids.includes(id);
      visibleDoors=key;
    }
    doorLayer.hidden=ids.length===0;landing.hidden=ids.length===0;
    byId('tour-pass').hidden=!parked;
    if(!ids.length)return;
    byId('tour-location').textContent=currentPassage().site.label+(parked?' · 已停靠':'');
    const width=root.clientWidth,height=root.clientHeight;
    const labels=ids.map(id=>{
      const button=doorButtons.get(id);
      let pt=passages.location(id).project(camera);
      if(apertureState().mixed)pt=renderRim.screenPoint(ids.length===1?{x:0,y:-.59}:pt);
      const half=button.offsetWidth*.5+4;
      return {button,x:Math.max(half,Math.min(width-half,(pt.x+1)*.5*width)),
        y:Math.max(height*.23,Math.min(height*.64,(1-pt.y)*.5*height+4)),half};
    });
    if(labels.length===2){
      const [a,b]=labels;
      if(Math.abs(a.x-b.x)<a.half+b.half&&Math.abs(a.y-b.y)<32){
        const upper=a.y<=b.y?a:b;upper.y=Math.max(height*.19,Math.min(a.y,b.y)-33);
      }
    }
    for(const {button,x,y} of labels){button.style.left=x+'px';button.style.top=y+'px';}
  }
  function beginWorld(renderer){
    if(apertureState().mixed){renderRim??=createWindowRim();renderRim.begin(renderer);}
  }
  function afterWorld(renderer,camera,aspect){
    cutawayCamera=camera;
    const {site,opening,peek}=currentPassage();
    if(opening>.75)passages.renderFoyer(renderer,camera,site,aspect,visit?.weight||0);
    const view=apertureState();
    if(view.mixed)renderRim.compose(renderer,view.open,view.peek,()=>renderChannel(renderer,aspect,Math.max(opening,view.peek*.6)),channels);
    drawEntrances(camera);
  }
  function audioState(){
    const file=stops[index].id;
    if(chapterKey!==file){audio.src=assets+file+'.m4a';chapterKey=file;}
    const time=Math.min(elapsed,Number.isFinite(audio.duration)?audio.duration:elapsed);
    if(Math.abs(audio.currentTime-time)>.20)audio.currentTime=time;
    audio.muted=muted;
    if(playing&&!visit&&!muted&&roomVisible()){audio.play().catch(()=>{});}else audio.pause();
  }
  function show(){
    const s=stops[index];
    roomCard.hidden=!visit;
    byId('tour-departure').hidden=Boolean(visit)||index!==0||playing||elapsed>0||intro>0;
    byId('tour-room-sound').textContent=muted?'打开旁白':'关闭旁白';
    if(visit){
      const e=museum.exhibits.get(visit.id);
      byId('tour-heading').textContent=e.room.organ+' · '+e.room.name;
      byId('tour-copy').textContent=captions[visit.id];
      byId('tour-step').textContent='馆内';doorLayer.hidden=true;landing.hidden=true;
      return;
    }
    byId('tour-heading').textContent=s.title+' · '+s.action;
    byId('tour-copy').textContent=s.narration;
    byId('tour-step').textContent=(index+1)+' / '+stops.length;
    byId('tour-prev').disabled=index===0;
    byId('tour-next').disabled=index===stops.length-1;
    play.textContent=finished?'重新游览':parked?'继续前行':playing?'暂停':index===0&&elapsed===0?'开始游览':'继续';
    mute.textContent=muted?'打开旁白':'关闭旁白';mute.setAttribute('aria-pressed',String(!muted));
    buttons.forEach((button,i)=>{if(i===index)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');});
  }
  function setIndex(i,offset=0){index=i;channels.prepare(i);elapsed=offset;yaw=0;pitch=0;finished=false;audioState();show();}
  function begin(auto=true,station=0){
    if(active)return;
    visited.clear();parked=false;visibleDoors='';visit=null;
    channels.retry();active=true;playing=auto;intro=station>0||(auto&&reduce.matches)?approachSeconds:0;
    index=0;elapsed=0;tourTime=0;finished=false;yaw=pitch=0;
    root.dataset.touring='true';document.querySelector('main.orbit').classList.add('touring');
    panel.hidden=false;overlay.hidden=false;startButton.hidden=true;shade.hidden=false;
    // Start the first clip from the user's play gesture; the oral approach is part of this station.
    setIndex(station);drawMap(position());onChange();root.focus({preventScroll:true});
  }
  function exit(){
    if(!active)return;galleryAudio.pause();visit=null;parked=false;delete panel.dataset.visiting;
    landing.hidden=true;roomCard.hidden=true;doorLayer.hidden=true;
    audio.pause();active=false;playing=false;touch=null;pendingSound=false;
    root.dataset.touring='false';document.querySelector('main.orbit').classList.remove('touring');
    panel.hidden=true;overlay.hidden=true;startButton.hidden=false;shade.hidden=true;shade.style.opacity='0';
    onExit();onChange();startButton.focus({preventScroll:true});
  }
  function toggle(){
    if(visit)return;parked=false;
    if(finished){visited.clear();playing=true;intro=approachSeconds;setIndex(0);return;}
    if(reduce.matches)intro=approachSeconds;
    playing=!playing;audioState();show();
  }
  function startAtLanding(zone){
    const site=passages.sites.find(s=>s.zone===zone);
    if(!site)return;
    if(!active)begin(false);
    let station=0;while(boundaries[station+1]<=site.arrival)station++;
    playing=false;parked=true;intro=approachSeconds;visited.add(zone);
    const offset=(site.arrival-boundaries[station])/(boundaries[station+1]-boundaries[station])*stops[station].seconds;
    setIndex(station,offset);tourTime=starts[station]+offset;onChange();
  }
  function jump(i){
    if(visit||i<0||i>=stops.length)return;parked=false;intro=approachSeconds;setIndex(i);onChange();
  }
  function advance(dt){
    if(visit){updateVisit(dt);return;}
    if(!active||!playing||document.hidden)return;
    const before=position();
    elapsed=(!muted&&!audio.paused&&!audio.ended&&audio.readyState>=2)?audio.currentTime:elapsed+dt;tourTime+=dt;intro=Math.min(approachSeconds,intro+dt);
    if(byId('tour-autostop').checked){
      const arrival=passages.sites.find(s=>!visited.has(s.zone)&&s.arrival>before&&s.arrival<=position());
      if(arrival){
        visited.add(arrival.zone);
        elapsed=(arrival.arrival-boundaries[index])/(boundaries[index+1]-boundaries[index])*stops[index].seconds;
        playing=false;parked=true;audioState();show();return;
      }
    }
    const end=stops[index].seconds;
    if(elapsed>=end){
      if(index<stops.length-1)setIndex(index+1,elapsed-end);
      else{elapsed=end;finished=true;playing=false;audio.pause();show();}
    }
  }
  function position(){
    const f=Math.min(1,elapsed/stops[index].seconds),end=boundaries[index+1];
    return Math.min(boundaries.at(-1)-.035,boundaries[index]+(end-boundaries[index])*f);
  }
  function entryPose(eye,target){
    const time=Math.min(1,intro/(approachSeconds*.86)),t=time*time*(3-2*time);
    const mouth=nativeAt(0),outside=mouth.clone();outside.x+=.095;outside.y+=.018;outside.z+=.105;
    eye.lerp(worldFromNative(outside),t);target.lerp(worldFromNative(mouth),t);return t;
  }
  function renderChannel(renderer,aspect,opening){
    const t=elapsed/stops[index].seconds;
    if(channels.render(renderer,index,t,aspect,yaw,pitch,opening))return;
    tract??=createTract();tract.render(renderer,position(),tourTime,aspect,yaw,pitch);
  }
  function render(renderer,aspect){
    const seam=approachSeconds*.76,k=position();
    timeline.value=starts[index]+elapsed;
    shade.style.opacity=String(Math.max(0,1-Math.abs(intro-seam)/.27)*.98);
    const {site,opening,peek}=currentPassage();
    drawMap(k,opening>.4?site?.ids:null,visit?.id);
    if(visit||opening>0||peek>0)return false;
    doorLayer.hidden=true;landing.hidden=true;
    if(intro<seam)return false;
    renderChannel(renderer,aspect,0);return true;
  }
  function key(e){
    if(!active)return false;
    if(visit){if(e.key==='Escape'){leaveGallery();e.preventDefault();return true;}return false;}
    if(e.key==='Escape')exit();
    else if(e.code==='Space'&&e.target.tagName!=='BUTTON')toggle();
    else if(e.key==='ArrowRight'&&e.target.tagName!=='INPUT')jump(Math.min(5,index+1));
    else if(e.key==='ArrowLeft'&&e.target.tagName!=='INPUT')jump(Math.max(0,index-1));
    else return false;e.preventDefault();return true;
  }
  root.addEventListener('pointerdown',e=>{
    if(!active||visit||!e.isPrimary||e.target.closest('button'))return;
    touch={x:e.clientX,y:e.clientY,yaw,pitch,id:e.pointerId,moved:false};root.setPointerCapture(e.pointerId);
  });
  root.addEventListener('pointermove',e=>{
    if(!touch||touch.id!==e.pointerId)return;
    if(Math.hypot(e.clientX-touch.x,e.clientY-touch.y)>4)touch.moved=true;
    if(!touch.moved)return;
    yaw=Math.max(-.85,Math.min(.85,touch.yaw-(e.clientX-touch.x)/root.clientWidth*2));
    pitch=Math.max(-.6,Math.min(.6,touch.pitch+(e.clientY-touch.y)/root.clientHeight*1.7));onChange();
  });
  root.addEventListener('pointerup',e=>{
    const gesture=touch;touch=null;
    if(!gesture||gesture.moved||gesture.id!==e.pointerId||visit||!cutawayCamera||!availableDoors().length)return;
    const rect=root.getBoundingClientRect();
    const pointer={x:(e.clientX-rect.left)*2/rect.width-1,y:1-(e.clientY-rect.top)*2/rect.height};
    const mixed=apertureState().mixed,ray=mixed?renderRim.pickPoint(pointer):pointer;
    if(!ray)return;
    const doors=availableDoors();
    const id=mixed&&doors.length===1?doors[0]:museum.hit(ray,cutawayCamera);
    if(id)enterGallery(id,true);
  });
  for(const event of ['pointercancel','lostpointercapture'])root.addEventListener(event,()=>{touch=null;});
  onRoomVisibility(visible=>{
    if(!active)return;
    if(visit){
      if(!visible)galleryAudio.pause();
      else if(!muted&&!visit.leaving&&!galleryAudio.ended)galleryAudio.play().catch(()=>{});
      return;
    }
    if(!visible){pendingSound=playing;audio.pause();}
    else if(pendingSound){pendingSound=false;audioState();}
  });
  timeline.oninput=()=>{
    if(visit)return;parked=false;
    const t=Math.min(total,Math.max(0,Number(timeline.value)));
    let i=starts.length-1;while(i>0&&starts[i]>t)i--;
    intro=approachSeconds;tourTime=t;const local=t-starts[i];
    if(i===index){elapsed=local;finished=false;audioState();show();}else setIndex(i,local);
    if(t>=total){playing=false;finished=true;audio.pause();show();}
    onChange();
  };
  byId('tour-room-sound').onclick=()=>{
    muted=!muted;
    if(muted)galleryAudio.pause();else if(roomVisible()&&visit&&!visit.leaving)galleryAudio.play().catch(()=>{});
    show();
  };
  byId('tour-first-landing').onclick=()=>startAtLanding('chest');
  byId('tour-pass').onclick=toggle;byId('tour-room-back').onclick=leaveGallery;
  byId('tour-autostop').onchange=()=>{if(parked&&!byId('tour-autostop').checked)toggle();};
  startButton.onclick=()=>begin();byId('tour-exit').onclick=exit;play.onclick=toggle;
  byId('tour-prev').onclick=()=>jump(index-1);byId('tour-next').onclick=()=>jump(index+1);
  mute.onclick=()=>{muted=!muted;audioState();show();};startButton.disabled=false;
  return {get active(){return active;},get moving(){return active&&(playing||Boolean(visit&&(visit.leaving||visit.weight<1)));},
    get visiting(){return visit?.id||null;},get inspecting(){return Boolean(visit&&!visit.leaving&&visit.weight===1);},
    get inCutaway(){return active&&(visit!==null||Boolean(currentPassage().site));},
    get visitWeight(){return visit?.weight??0;},galleryRig,galleryPose,beginWorld,afterWorld,get state(){return {channels:channels.ready,failedChannels:channels.failed,active,index,elapsed,playing,finished,muted,k:position(),nearby:availableDoors(),visiting:visit?.id??null,parked,yaw,pitch};},
    resetRig(){if(visit)visit.rig=null;},begin,startAtLanding,exit,advance,entryPose,render,key};
}

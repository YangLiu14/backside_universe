import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {rooms} from './collection.js';

// Locations in the Hi3D dog's local frame. +X is the open side and +Z is the nose.
const layouts={
  heart:   [.176,-.016,.131,.140,.069],
  lungs:   [.181,.084,.184,.154,.033],
  liver:   [.055,.045,.166,.117,.039],
  stomach: [.066,-.061,.162,.139,.067],
  kidney:  [-.076,-.007,.158,.101,.032],
  gut:     [-.072,-.104,.182,.119,.055]
};
const notes={
  heart:'从前厅的摆钟看向后排立柱，钟楼两侧各有一段楼梯。',
  lungs:'风琴管立在两叶之间，沿两侧回廊可以看到不同高度的琴管。',
  liver:'琥珀标本陈列在圆形台座上，后面是两层拱廊。',
  stomach:'陶坊的台阶通向窑口，工作台与器皿架分居两侧。',
  kidney:'两座水务厅由中央桥洞相连，水池和铜管分列两岸。',
  gut:'书架随回廊转弯，阅读桌和楼梯藏在一层。'
};
const vec=(...a)=>new T.Vector3(...a);
const material=(color,metalness=.0,roughness=.64)=>new T.MeshStandardMaterial({color,metalness,roughness,side:T.DoubleSide});
const walnut=material('#4c3327'),velvet=material('#342d2b'),gold=material('#a68750',.48,.35),bone=material('#dfd1b2'),joint=material('#bdae92');
// The six casts are mounted in a recessed case. Shade their contact with its rear lining.
velvet.onBeforeCompile=s=>{
  s.vertexShader='varying vec3 casePoint;\n'+s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ncasePoint=position;');
  const spots=Object.values(layouts).map(([z,y,w,h])=>
    `shade *= 1.0 - .43 * exp(-2.6 * dot((casePoint.zy-vec2(${z},${y-.008}))/vec2(${w*.55},${h*.55}), (casePoint.zy-vec2(${z},${y-.008}))/vec2(${w*.55},${h*.55})));`).join('\n');
  s.fragmentShader='varying vec3 casePoint;\n'+s.fragmentShader.replace('#include <color_fragment>',
    '#include <color_fragment>\nfloat shade=1.;\n'+spots+'\ndiffuseColor.rgb*=shade;');
};
const clamp=T.MathUtils.clamp;
export function createFlankMuseum({dog,fit,origin,ring,load,requestFrame,onSelect,onExit,onReveal}){
  dog.updateMatrixWorld(true);
  const toDog=dog.matrixWorld.clone().invert();
  const floor=fit.rugPlane,gap=fit.soleGap;
  const height=p=>p.y-floor[0]*p.x-floor[1]*p.z-floor[2],eyeHeight=height(origin);
  function registered(x,y,z){
    const p=vec(x,y,z).applyMatrix4(dog.matrixWorld),h=height(p);
    const displacement=clamp(gap[0]*p.x+gap[1]*p.z+gap[2],0,.75)*(1-T.MathUtils.smoothstep(h,.35,1.77));
    p.addScaledVector(p.clone().sub(origin),displacement/Math.max(.7,eyeHeight-h));
    return p.applyMatrix4(toDog);
  }
  const group=new T.Group(),structure=new T.Group();group.name='Right flank museum';group.add(structure);dog.add(group);
  const contour=ring.map(([x,y,z])=>registered(x,y,z));
  function solid(g,m){const o=new T.Mesh(g,m);structure.add(o);return o;}
  function tube(points,r,m,closed=false){
    const curve=new T.CatmullRomCurve3(points,closed,'centripetal');
    return solid(new T.TubeGeometry(curve,closed?144:Math.max(points.length*3,12),r,8,closed),m);
  }
  function tapered(points,r,m){
    const curve=new T.CatmullRomCurve3(points),g=new T.TubeGeometry(curve,24,r,8,false),a=g.attributes.position,v=vec();
    for(let i=0;i<=24;i++){
      const t=i/24,c=curve.getPointAt(t),k=.24+.76*Math.pow(Math.sin(Math.PI*(.12+.88*t)),.52);
      for(let j=0;j<9;j++){const n=i*9+j;v.fromBufferAttribute(a,n).sub(c).multiplyScalar(k).add(c);a.setXYZ(n,v.x,v.y,v.z);}
    }
    g.computeVertexNormals();return solid(g,m);
  }
  const ball=new T.SphereGeometry(1,16,10);
  function oval(at,scale,m){const o=solid(ball,m);o.position.copy(at);o.scale.set(...scale);return o;}
  const recessed=ring.map(([,y,z])=>registered(-.074,y*.94,z*.96));
  // A deep return around the opening connects the measured coat outline to a solid back wall.
  const positions=[],indices=[],count=ring.length;
  for(let i=0;i<count;i++){
    positions.push(...contour[i].toArray(),...recessed[i].toArray());
    const j=(i+1)%count;indices.push(2*i,2*j,2*i+1,2*j,2*j+1,2*i+1);
  }
  const liner=new T.BufferGeometry();liner.setAttribute('position',new T.Float32BufferAttribute(positions,3));liner.setIndex(indices);liner.computeVertexNormals();solid(liner,walnut);
  const backVertices=recessed.flatMap(p=>p.toArray()),center=registered(-.081,-.005,.008);
  backVertices.push(...center.toArray());
  const fan=[];for(let i=0;i<count;i++)fan.push(i,(i+1)%count,count);
  const back=new T.BufferGeometry();back.setAttribute('position',new T.Float32BufferAttribute(backVertices,3));back.setIndex(fan);back.computeVertexNormals();solid(back,velvet);
  tube(contour,.0028,gold,true);tube(recessed,.003,walnut,true);
  // A row of vertebrae follows the seated back. Costal arches are on the far
  // side of the cavity, with short near-side ends along the exposed dorsal edge.
  const spine=[
    [-.009,-.216],[.017,-.18],[.050,-.124],[.071,-.065],[.095,-.006],
    [.123,.063],[.150,.129],[.173,.188],[.177,.227]
  ];
  const ridge=new T.CatmullRomCurve3(spine.map(([y,z])=>vec(.036,y,z)));
  tube(spine.map(([y,z])=>registered(.029,y-.01,z)),.0065,joint);
  for(let i=0;i<20;i++){
    const p=ridge.getPointAt(i/19),base=registered(p.x,p.y-.008,p.z);
    const vertebra=oval(base,[.012,.0075,.013],bone);
    vertebra.rotation.x=-.38;
    tapered([registered(.013,p.y-.006,p.z+.004),registered(.025,p.y+.004,p.z),registered(.045,p.y+.012,p.z-.009)],.006,bone);
    tapered([base,registered(.047,p.y-.004,p.z),registered(.055,p.y-.006,p.z-.010)],.0048,bone);
  }
  for(let i=0;i<10;i++){
    const z=-.008+i*.025,y=.092+.34*z;
    tapered([registered(.036,y,z),registered(-.001,y-.009,z-.002),registered(-.041,y-.047,z-.016),
      registered(-.05,y-.105,z-.038),registered(-.036,y-.151,z-.065),registered(-.019,y-.167,z-.084)],.0043,bone);
    tapered([registered(.038,y,z),registered(.057,y+.002,z-.002),
      registered(.073,y-.005,z-.006),registered(.081,y-.014,z-.012)],.0038,bone);
  }
  // The esophagus descends behind the thoracic exhibits. The intestine occupies
  // the ventral abdomen, with the larger colon returning along its dorsal edge.
  const tissue=material('#884b40',.02,.52),colon=material('#ab7360',.01,.56);
  // Route connecting anatomy behind the deepest cast. Pipes must not pass
  // through the doors, furniture or interior inspection cameras.
  const conduit=(points,r,m)=>tube(points.map(([x,y,z])=>registered(Math.min(x,-.043),y,z)),r,m);
  conduit([[-.012,.173,.215],[-.016,.122,.172],[-.014,.07,.123],[.002,.006,.09],[.035,-.050,.078]],.010,tissue);
  conduit([[.046,-.078,.064],[.043,-.093,.022],[.031,-.111,-.009],[.030,-.103,-.053],[.019,-.118,-.094]],.0105,tissue);
  conduit([[.004,-.111,-.145],[.004,-.133,-.162],[.010,-.129,-.198],[.013,-.104,-.201],
    [.012,-.074,-.179],[.014,-.058,-.153],[.013,-.048,-.114],[.008,-.054,-.076],
    [-.005,-.073,-.065],[-.008,-.082,-.113],[-.011,-.074,-.171],[-.012,-.086,-.219],[-.023,-.101,-.267],[-.026,-.117,-.287]],.013,colon);
  // Merge static bones, lining and trim by material to keep the six exhibits interactive.
  const buckets=new Map();
  for(const o of structure.children){o.updateMatrix();const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();
    for(const k of Object.keys(g.attributes))if(!['position','normal'].includes(k))g.deleteAttribute(k);
    g.applyMatrix4(o.matrix);const list=buckets.get(o.material)||[];list.push(g);buckets.set(o.material,list);}
  structure.clear();for(const [m,parts] of buckets){solid(mergeGeometries(parts),m);parts.forEach(p=>p.dispose());}
  const exhibits=new Map();const pins=document.querySelector('#organ-pins'),nav=document.querySelector('#galleries');
  const overlay=document.querySelector('#flank-actions'),backButton=document.querySelector('#gallery-back');
  backButton.onclick=onExit;document.querySelector('#coat-toggle').onclick=onReveal;
  function go(id){onSelect(id);}
  for(const room of rooms){
    const [z,y,w,h,x]=layouts[room.id],anchor=new T.Group();anchor.position.copy(registered(x,y,z));anchor.rotation.y=Math.PI/2;
    group.add(anchor);anchor.name=room.id;
    const pin=document.createElement('button');pin.className='organ-pin';pin.textContent=room.n;pin.hidden=true;
    pin.setAttribute('aria-label',room.organ+' · '+room.name);pin.onclick=()=>go(room.id);pins.append(pin);
    const button=document.createElement('button');button.type='button';button.className='gallery-entry';button.dataset.gallery=room.id;
    const title=document.createElement('strong');title.textContent=room.name;
    const sub=document.createElement('small');sub.textContent=room.n+' / '+room.organ;button.append(sub,title);
    button.onclick=()=>go(room.id);button.disabled=true;nav.append(button);
    const item={room,anchor,nativeCenter:vec(x,y,z),w,h,pin,button,overview:null,detail:null,promise:null,status:'loading'};
    exhibits.set(room.id,item);
  }
  function attach(item,scene){
    const {anchor,w,h}=item,oriented=new T.Group();oriented.add(scene);
    const box=new T.Box3().setFromObject(oriented),size=box.getSize(vec()),c=box.getCenter(vec());
    const scale=Math.min(w/size.x,h/size.y,.208/size.z);
    scene.position.sub(c);oriented.scale.setScalar(scale);anchor.add(oriented);oriented.userData.gallery=item.room.id;
    oriented.traverse(o=>{if(o.isMesh){o.material.envMapIntensity=.73;o.userData.gallery=item.room.id;}});
    const width=size.x*scale,height=size.y*scale,depth=size.z*scale;
    item.span=Math.max(width,height);item.depth=depth;
    return oriented;
  }
  function loadOverview(id){
    const e=exhibits.get(id);
    if(e.overview)return Promise.resolve();
    return e.overviewPromise??=load(id,'overview').then(({scene})=>{
      e.overview=attach(e,scene);e.status='ready';e.button.disabled=false;e.button.removeAttribute('title');
    }).catch(error=>{e.status='failed';e.button.title='点此重试载入';e.button.disabled=false;console.error('Gallery load:',id,error);})
      .finally(()=>{e.overviewPromise=null;requestFrame();});
  }
  let requested=null;
  function release(root){
    root.removeFromParent();
    const mats=new Set(),maps=new Set();
    root.traverse(o=>{if(o.isMesh){o.geometry.dispose();for(const m of [].concat(o.material))mats.add(m);}});
    for(const m of mats){for(const t of Object.values(m))if(t?.isTexture)maps.add(t);m.dispose();}
    const bitmaps=new Set();for(const t of maps){bitmaps.add(t.source?.data);t.dispose();}
    for(const bitmap of bitmaps)bitmap?.close?.();
  }
  async function detail(id){
    requested=id;
    for(const [key,e] of exhibits)if(key!==id&&e.detail){release(e.detail);e.detail=null;e.overview.visible=true;}
    const e=exhibits.get(id);if(!e.overview)await loadOverview(id);
    if(requested!==id)return;
    if(!e.overview){document.querySelector('#gallery-note').textContent='当前展馆未能载入，请返回后重试。';return;}
    if(e.detail)return;
    if(!e.promise)e.promise=load(id,'detail').then(({scene})=>{
      if(requested!==id){release(scene);return;}
      e.detail=attach(e,scene);e.detail.visible=false;requestFrame();
    }).catch(()=>{if(requested===id)document.querySelector('#gallery-note').textContent='当前显示轻量模型；返回后可重新载入高清展馆。';})
      .finally(()=>{e.promise=null;});
    return e.promise;
  }
  let active=null,restoreFocus=null,autoTarget=null,autoTimer=0;
  function streamNearby(id){
    if(autoTarget===id)return;
    autoTarget=id;clearTimeout(autoTimer);
    if(id)autoTimer=setTimeout(()=>{if(!active&&autoTarget===id)detail(id);},160);
  }
  const temp=vec();
  function update(phase,camera,angle,id,focus,showSkin){
    active=id;group.visible=phase>0;
    const eyeX=group.worldToLocal(camera.getWorldPosition(vec())).x;
    const browsingSide=angle>=85&&!id&&!showSkin&&eyeX>-.04,showPins=browsingSide&&eyeX>.095;
    let nearby=null,best=Infinity;
    for(const [key,e] of exhibits){
      if(browsingSide&&e.overview){
        const center=e.anchor.getWorldPosition(vec()),d=center.distanceTo(camera.position);
        const width=e.w*e.anchor.getWorldScale(vec()).x*camera.projectionMatrix.elements[0]/(2*d);
        center.project(camera);const score=Math.hypot(center.x,center.y);
        if(width>.20&&Math.abs(center.z)<1&&score<.82&&score<best){nearby=key;best=score;}
      }
      if(e.detail)e.detail.visible=id?key===id&&focus>.35:browsingSide&&(autoTarget===key||nearby===key);
      if(e.overview)e.overview.visible=!e.detail?.visible;
      e.pin.hidden=!showPins||!e.overview;
      if(!e.pin.hidden){e.anchor.localToWorld(temp.set(-e.w*.38,-e.h*.32,(e.depth||0)*.5+.006));temp.project(camera);
        e.pin.hidden=Math.abs(temp.x)>1||Math.abs(temp.y)>1||Math.abs(temp.z)>1;
        e.pin.style.left=(temp.x*.5+.5)*100+'%';e.pin.style.top=(.5-temp.y*.5)*100+'%';}
      e.button.setAttribute('aria-pressed',String(key===id));
    }
    streamNearby(nearby);
    overlay.hidden=angle<84||Boolean(id);
    const toggle=document.querySelector('#coat-toggle');toggle.textContent=showSkin?'打开博物馆':'查看完整外观';toggle.setAttribute('aria-pressed',String(!showSkin));
    document.querySelector('#gallery-focus').hidden=!id;
  }
  function focusPose(id,aspect){
    const e=exhibits.get(id),depth=e.depth||.065;
    const radius=Math.max(e.w/aspect,e.h)*1.52+depth*.48;
    return {eye:e.anchor.localToWorld(vec(0,radius*Math.sin(.055),radius*Math.cos(.055))),
      target:e.anchor.localToWorld(vec(0,0,.045*depth))};
  }
  function showTitle(id){
    streamNearby(null);
    const e=exhibits.get(id);
    document.querySelector('#gallery-title').textContent=e?e.room.organ+' · '+e.room.name:'';
    document.querySelector('#gallery-note').textContent=e?notes[id]:'';
    if(e){restoreFocus=document.activeElement;detail(id);}
    else{requested=null;if(restoreFocus?.isConnected){restoreFocus.focus({preventScroll:true});restoreFocus=null;}}
  }
  function surface(ndc,camera,id){
    const ray=new T.Raycaster();ray.setFromCamera(ndc,camera);
    const e=exhibits.get(id),models=id?[e?.detail||e?.overview]:[...exhibits.values()].map(item=>item.overview);
    return ray.intersectObjects(models.filter(Boolean),true)[0];
  }
  function hit(ndc,camera){
    if(active||group.worldToLocal(camera.getWorldPosition(vec())).x<=.095)return null;
    return surface(ndc,camera)?.object.userData.gallery;
  }
  return {loadDetail:detail,notes,worldFromNative:p=>dog.localToWorld(registered(p.x,p.y,p.z)),group,exhibits,loadOverview,focusPose,showTitle,update,hit,surface};
}

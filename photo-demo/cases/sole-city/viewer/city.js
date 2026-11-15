import {loadPavement,roadDetails,surfaceDip} from './pavement.js';
import {footbridgePlan,makeFootbridge} from './footbridge.js';
import {makeOutsole,reaches} from './outsole.js';
import {architecture,shopProfile,towerProfile,buildingFrontAngle,recoverShopInterior} from './architecture.js';
import {streetGround} from './street-ground.js';
import {districtHeight,courtDepth,rearCourt,laneEnd,streetEndHouses,endUtilityLine} from './district.js';
import {shopWorkshop,finishStall,addSoyMilk,nameWholeShop} from './storefronts.js';
import {fitHardwareShop} from './hardware-shop.js';
import {finishAlleyFrontage, makeAlleyGate} from './frontage-patina.js';
import {entryCourt,courtyardFinishes} from './entry-court.js';
import {recoverHerbalScan,fitHerbalDispensary} from './herb-interior.js';
import {nearBuildings} from './near-buildings.js';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';

export const smooth=(a,b,v)=>T.MathUtils.smoothstep(v,a,b);
const mat=(color)=>new T.MeshStandardMaterial({color,roughness:.83});
const ochre=mat(0xd3a93f), rubber=mat(0x353b40), concrete=mat(0xbcafa0), blue=mat(0x6191a4), green=mat(0x567c67), red=mat(0xb65641), steel=mat(0xa9a99f);
const unit=new T.BoxGeometry();
function box(group,material,x,y,z,w,h,d){
  const m=new T.Mesh(unit,material);m.position.set(x,y,z);m.scale.set(w,h,d);group.add(m);return m;
}

function shopYard(lot,mesh,x,z,oldFront,oldDepth,finishes,blocks,id){
  const yard=new T.Group();yard.name='临街石阶与店后小院';yard.rotation.y=mesh.rotation.y;
  const {x:width,z:depth}=mesh.scale,front=depth/2,back=front-oldDepth+.002;
  const brick=finishes.plinth.brick,lime=finishes.plinth.lime;
  // A continuous threshold and masonry footing ties the scan's native posts
  // to the pavement. The small step is walkable and stays on its own lot.
  box(yard,brick,0,-.0012,0,width*.94,.003,depth*.92);
  box(yard,finishes.slate,0,-.0004,front-.0005,width*.88,.0016,.002);
  const free=(oldFront-width)/2;
  if(free>.007 && oldDepth>.03){
    const sign=id%2?1:-1,height=.020+.005*(id%3),t=.0028;
    function wall(u,v,w,d,h){
      box(yard,brick,u,.004,v,w,.008,d);
      box(yard,lime,u,(h+.008)/2,v,w-.0003,h-.008,d-.0003);
      box(yard,finishes.slate,u,h+.00075,v,w+.0008,.0015,d+.0009);
      const a=yard.rotation.y,c=Math.cos(a),s=Math.sin(a);
      blocks.push({x:x+c*u+s*v,z:z-s*u+c*v,w:Math.abs(c)*w+Math.abs(s)*d,d:Math.abs(s)*w+Math.abs(c)*d});
    }
    // A short wall returns from one of the rear corners. Keep the wide
    // approach to the front and the lane on the other side of the lot open.
    // On the grain-shop alley the drain and walking line use the outside
    // shoulder up to z=.326. Leave that original shoulder clear on both sides.
    const grainAlley=x>0 && Math.abs(z-.393)<.001 && Math.sin(yard.rotation.y)<-.99 && sign<0;
    const sideClearance=grainAlley?.012:.001;
    const extension=Math.min(free-sideClearance,.044),edge=width/2+extension;
    if(extension<=.003){lot.add(yard);return;}
    wall(sign*(edge-extension/2),back,extension,t,height);
    const length=Math.min(oldDepth*.58,.044);
    wall(sign*edge,back+length/2,t,length,height*.83);
    if(back < -depth/2-.003){
      const run=-depth/2-back;
      wall(sign*(width/2-.0015),back+run/2,t,run,height);
    }
  }
  lot.add(yard);
}
// Parametric last: z runs from the heel (-1) to the toe (+1).
const stations=[[-1,.015],[-.94,.17],[-.80,.227],[-.58,.21],[-.37,.173],[-.16,.168],[.08,.224],[.35,.284],[.62,.287],[.81,.248],[.95,.152],[1,.015]];
function halfWidth(z){const i=stations.findIndex(s=>s[0]>=z);if(i<=0)return .015;const [a,w]=stations[i-1],[b,v]=stations[i];return T.MathUtils.lerp(w,v,(z-a)/(b-a));}
const bend=z=>.036*Math.sin(z*3.15);
let actualProfile;
function boundsAt(z){
  if(!actualProfile)return [bend(z)-halfWidth(z),bend(z)+halfWidth(z)];
  const p=T.MathUtils.clamp((z+1)/2,0,1)*(actualProfile.length-1),i=Math.min(Math.floor(p),actualProfile.length-2);
  return [1,2].map(k=>T.MathUtils.lerp(actualProfile[i][k],actualProfile[i+1][k],p-i));
}
export function mainLane(z){const [l,r]=boundsAt(z);return (l+r)/2+.022*Math.sin(5*z);}
const strokePoints=(fn,z0,z1,n)=>Array.from({length:n+1},(_,i)=>{const z=T.MathUtils.lerp(z0,z1,i/n);return new T.Vector2(fn(z),z);});

function foundation(){
  const s=new T.Shape(),outer=strokePoints(z=>bend(z)+halfWidth(z),-1,1,44);
  const inner=strokePoints(z=>bend(z)-halfWidth(z),1,-1,44);
  [...outer,...inner].forEach(({x,y},i)=>i?s.lineTo(x,-y):s.moveTo(x,-y));s.closePath();
  const g=new T.ExtrudeGeometry(s,{depth:.02,bevelEnabled:true,bevelSize:.002,bevelThickness:.002,bevelSegments:2});
  g.rotateX(-Math.PI/2);g.translate(0,-.02,0);
  return new T.Mesh(g,rubber);
}
function sketchBuilding(tower){
  const group=new T.Group(),columns=4,floors=tower?10:3;
  const canvas=document.createElement('canvas');canvas.width=192;canvas.height=tower?416:176;
  const ctx=canvas.getContext('2d'),w=canvas.width/columns,h=canvas.height/floors;
  ctx.fillStyle=tower?'#a89b83':'#a7977c';ctx.fillRect(0,0,canvas.width,canvas.height);
  for(let j=0;j<floors;j++)for(let i=0;i<columns;i++){
    const x=i*w,y=j*h;ctx.fillStyle='#817461';ctx.fillRect(x,y,w,2);
    ctx.fillStyle=(i+2*j)%5===0?'#bc9a63':'#46545a';ctx.fillRect(x+6,y+7,w-12,h-12);
    ctx.fillStyle='#b6a890';ctx.fillRect(x+w/2,y+7,2,h-12);ctx.fillRect(x+4,y+h-5,w-8,3);
  }
  const t=new T.CanvasTexture(canvas);t.colorSpace=T.SRGBColorSpace;
  const wall=new T.MeshStandardMaterial({map:t,roughness:.89});
  box(group,wall,0,.48,0,.96,.96,.96);
  box(group,tower?ochre:rubber,0,.979,0,1,.042,1);
  return group;
}
function sketchLandmark(role){
  const g=new T.Group();
  if(role==='bridge'){
    box(g,concrete,0,.59,0,1,.1,.7);
    for(const x of [-.44,.44])box(g,concrete,x,.29,0,.08,.58,.61);
    for(const z of [-.33,.33]){box(g,blue,0,.97,z,1,.05,.04);for(let i=-4;i<=4;i++)box(g,blue,i*.11,.80,z,.021,.3,.025);}
  }else if(role==='gate'){
    for(const x of [-.46,.46]){box(g,concrete,x,.47,0,.08,.94,.7);box(g,green,x*.80,.29,.18,.12,.58,.42);}
  }else{
    box(g,concrete,0,.25,0,.82,.5,.72);box(g,red,0,.96,0,1,.08,1);
    for(const x of [-.39,.39])box(g,steel,x,.70,.26,.035,.46,.03);
    box(g,steel,-.15,.57,0,.28,.16,.36);
  }return g;
}
async function library(models,registration,worldScale,preparation){
  if(!models)return {tower:sketchBuilding(true),shops:sketchBuilding(false),...Object.fromEntries(['gate','bridge','stall'].map(k=>[k,sketchLandmark(k)]))};
  const smallDevice=matchMedia('(pointer:coarse)').matches||navigator.deviceMemory<=4;
  const parallel=smallDevice?2:4;
  const draco=new DRACOLoader().setDecoderPath('./vendor/draco/').setWorkerLimit(parallel);
  const loader=new GLTFLoader().setDRACOLoader(draco);
  const nearSources=new Map();
  async function loadRole([role,desc]){
    if(role==='shell')return [role,(await loader.loadAsync(registration.shoeFit.model)).scene];
    const stream=Boolean(desc.detail && (/^(shop|flat)-/.test(role)||role==='courtyard-osmanthus'));
    const [base,near]=await Promise.all([loader.loadAsync(desc.file),desc.detail&&!stream?loader.loadAsync(desc.detail.file):null]);
    const scene=base.scene;
    // Awnings and window reveals on the shop scans include thin, open sheets.
    if(role==='shops'||role==='tower')scene.traverse(o=>{if(o.isMesh)for(const m of [].concat(o.material))m.side=T.DoubleSide;});
    const aligned=new T.Group();aligned.add(near?near.scene:scene);
    const axes=registration?.orientations[role]??desc.orientation;
    if(axes){const [a,b,c]=axes;
      aligned.quaternion.setFromRotationMatrix(new T.Matrix4().set(...a,0,...b,0,...c,0,0,0,0,1));}
    if(/^(shop|flat)-/.test(role))aligned.rotateY(-buildingFrontAngle(role));
    aligned.updateMatrixWorld(true);
    const b=new T.Box3().setFromObject(aligned,true);
    const s=b.getSize(new T.Vector3()),c=b.getCenter(new T.Vector3());
    if(Math.min(s.x,s.y,s.z)<1e-7)throw Error('模型尺寸异常：'+role);
    aligned.position.sub(new T.Vector3(c.x,b.min.y,c.z));
    const centered=new T.Group();centered.add(aligned);centered.scale.set(1/s.x,1/s.y,1/s.z);
    if(role==='shop-herbs')recoverHerbalScan(centered);
    else if(role.startsWith('shop-'))recoverShopInterior(centered);
    const normalized=new T.Group();
    if(near){
      // Apply exactly the same center and axes to both simplifications.
      const lowAligned=new T.Group();lowAligned.position.copy(aligned.position);
      lowAligned.quaternion.copy(aligned.quaternion);lowAligned.add(scene);
      const far=new T.Group();far.scale.copy(centered.scale);far.add(lowAligned);
      const lod=new T.LOD();lod.addLevel(centered,0);lod.addLevel(far,.32*worldScale,.14);
      normalized.add(lod);
    }else if(stream){
      // Placement and both LODs use the same native / property-line frame.
      const lod=new T.LOD();lod.autoUpdate=false;lod.userData.nearBuildingRole=role;
      lod.addLevel(centered,.32*worldScale);normalized.add(lod);
      nearSources.set(role,async()=>{
        const {scene:scan}=await loader.loadAsync(desc.detail.file);
        const posed=new T.Group();posed.quaternion.copy(aligned.quaternion);
        posed.position.copy(aligned.position);posed.add(scan);
        const result=new T.Group();result.scale.copy(centered.scale);result.add(posed);
        if(role==='shop-herbs')recoverHerbalScan(result);
        else if(role.startsWith('shop-'))recoverShopInterior(result);
        return result;
      });
    }else normalized.add(centered);
    normalized.userData.nativeSize=s.toArray();
    if(role==='shop-herbs')fitHerbalDispensary(normalized);
    if(role==='bridge-corner-shop')fitHardwareShop(normalized);
    if(role==='bridge-corner-shop'||role==='stall-neighbor-shop')finishAlleyFrontage(normalized,role);
    return [role,normalized];
  }
  const jobs=Object.entries(models).filter(([role])=>role!=='stall'||!models['soy-cart-dawn']),items=[];
  // Bound decode spikes for the new overview library as well; the shared
  // decoder stays alive while detail files can still be requested.
  let index=0;
  preparation?.progress(0,jobs.length);
  await Promise.all(Array.from({length:parallel},async()=>{
    while(index<jobs.length){items.push(await loadRole(jobs[index++]));preparation?.progress(items.length,jobs.length);}
  }));
  if(!nearSources.size)draco.dispose();
  return {...Object.fromEntries(items),nearSources};
}
const trunkWidth = .046, laneWidth = .022;
const heelZ = -.89, toeZ = .91;
const junctions = Array.from({length: 9}, (_, row) => -.7055 + row * .169);
const streetEdge = (z, side) => new T.Vector2(mainLane(z) + side * trunkWidth / 2, z);

function trunkSections() {
  // At a crossing the curb is one straight edge between the two corners.
  // The last edge of the adjoining pavement will use those same vertices.
  const levels = Array.from({length: 141}, (_, i) => T.MathUtils.lerp(heelZ, toeZ, i / 140))
    .filter(z => junctions.every(cross => Math.abs(z - cross) > laneWidth / 2));
  for (const cross of junctions) levels.push(cross - laneWidth / 2, cross + laneWidth / 2);
  return levels.sort((a, b) => a - b).map(z => [streetEdge(z, 1), streetEdge(z, -1)]);
}

function branchSections(z, side) {
  const corners = [z - side * laneWidth / 2, z + side * laneWidth / 2];
  const start = corners.map(at => streetEdge(at, side));
  const end = corners.map(at => {
    const [left, right] = boundsAt(at);
    return new T.Vector2(side > 0 ? right - .01 : left + .01, at);
  });
  return Array.from({length: 23}, (_, i) => start.map((corner, k) => corner.clone().lerp(end[k], i / 22)));
}

// Fine triangles are local to potholes. Unbroken slabs still only need their
// two curb vertices, and every alley uses the exact two corners of its mouth.
function subdivideBasins(input, pits) {
  function nearby(a,b) {
    const corners=[...a,...b];
    const xs=corners.map(p=>p.x), zs=corners.map(p=>p.y);
    return pits.filter(p=>Math.max(...xs)>=p.x-p.rx*1.4 && Math.min(...xs)<=p.x+p.rx*1.4 &&
                        Math.max(...zs)>=p.z-p.rz*1.4 && Math.min(...zs)<=p.z+p.rz*1.4);
  }
  const sections=[input[0]];
  for(let i=1;i<input.length;i++) {
    const a=input[i-1], b=input[i];
    const steps=nearby(a,b).length ? Math.ceil(Math.max(a[0].distanceTo(b[0]),a[1].distanceTo(b[1]))/.0013) : 1;
    for(let n=1;n<steps;n++) sections.push(a.map((pt,k)=>pt.clone().lerp(b[k],n/steps)));
    sections.push(b);
  }
  const uv=[], index=[], rows=[], ends=[0], offsets=[];
  for(let i=0;i<sections.length;i++){
    const [a,b]=sections[i];
    const affected=nearby(sections[i],sections[i]);
    const steps=affected.length ? Math.ceil(a.distanceTo(b)/.0011) : 1;
    const first=uv.length/2;
    // Store endpoints first, then interior vertices in order across the slab.
    const row=Array.from({length:steps+1},(_,k)=>first+(k===0?0:k===steps?1:k+1));
    for(let j=0;j<=steps;j++){
      const k=j===0?0:j===1?steps:j-1;
      const x=T.MathUtils.lerp(a.x,b.x,k/steps),z=T.MathUtils.lerp(a.y,b.y,k/steps);
      uv.push(x,-z);offsets.push(surfaceDip(affected,x,z));
    }
    if(i) {
      const prev=rows[i-1];
      let j=0,k=0;
      // Stitch between sparse and dense rows without T-junctions.
      while(j<prev.length-1 || k<row.length-1){
        if(k===row.length-1 || (j+1)/(prev.length-1) <= (k+1)/(row.length-1) && j<prev.length-1) {
          index.push(prev[j],prev[j+1],row[k]);j++;
        } else {
          index.push(prev[j],row[k+1],row[k]);k++;
        }
      }
      ends.push(index.length);
    }
    rows.push(row);
  }
  const geom=new T.BufferGeometry(), vertices=new Float32Array(uv.length*1.5);
  geom.setAttribute('position',new T.BufferAttribute(vertices,3));
  geom.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geom.setIndex(index);
  return {sections, geom, pose(edges,last){
    for(let i=0;i<rows.length;i++){
      const row=rows[i], edge=Math.min(i,last)*6;
      for(let k=0;k<row.length;k++){
        const t=k/(row.length-1),idx=row[k], v=idx*3;
        vertices[v]=T.MathUtils.lerp(edges[edge],edges[edge+3],t);
        vertices[v+1]=edges[edge+1]+(i<=last?offsets[idx]:0);
        vertices[v+2]=T.MathUtils.lerp(edges[edge+2],edges[edge+5],t);
      }
    }
    geom.setDrawRange(0,ends[last]);
    geom.attributes.position.needsUpdate=true;geom.computeVertexNormals();
  }};
}

// Roll a strip along its centreline; keep each pair of edge vertices intact
// so the two corners land flush even where the main street is on a bend.
function carpet(city, sections, begin, duration, material, pits, withLace = false) {
  const bed = subdivideBasins(sections,pits);
  sections = bed.sections;
  const centers = sections.map(([a, b]) => a.clone().lerp(b, .5));
  const distance = [0];
  const positions = new Float32Array(sections.length * 6);
  for(let i=1;i<sections.length;i++) distance.push(distance[i-1] + centers[i].distanceTo(centers[i-1]));
  const {geom}=bed;
  const road = new T.Mesh(geom, material);
  road.frustumCulled = false;
  road.receiveShadow = true;
  road.userData.roadTiming = [begin, duration];
  city.add(road);
  const lace = withLace ? routeLace(road, distance, pits) : null;
  const tangent = new T.Vector2();
  let previous = -1;
  return p => {
    const t = smooth(begin, begin + duration, p);
    if (t === previous) return t;
    previous = t;
    road.visible = t > 0;
    const end = distance.at(-1)*t;
    const lip = .019 * Math.min(1, t*15, (1-t)*12);
    let last = 0;
    for (let i = 0; i < sections.length; i++) {
      const a = Math.max(0, i-1), b = Math.max(1, i);
      tangent.subVectors(centers[b], centers[a]).normalize();
      const d = Math.min(distance[i], end);
      const part = (d-distance[a])/(distance[b]-distance[a]);
      const angle = Math.max(0, 1-(end-d)/.035)*Math.PI*.84;
      const roll = lip * Math.min(1, d/.035);
      const rise = roll*(1-Math.cos(angle)), retreat = Math.min(d, roll*(angle-Math.sin(angle)));
      for (let k = 0; k < 2; k++) {
        const j = i*6 + k*3, prev = sections[a][k], next = sections[b][k];
        positions[j] = T.MathUtils.lerp(prev.x, next.x, part) - tangent.x*retreat;
        positions[j+1] = .004 + rise;
        positions[j+2] = T.MathUtils.lerp(prev.y, next.y, part) - tangent.y*retreat;
      }
      last = i;
      if (distance[i] >= end) break;
    }
    for (let i = last+1; i < sections.length; i++) positions.copyWithin(i*6, last*6, last*6+6);
    bed.pose(positions,last);
    geom.boundingSphere = null;
    if (lace) lace(positions, last);
    return t;
  };
}
// A fine, round cord follows the running route and the curling pavement.
function routeLace(road, distance, pits) {
  const rings = distance.length, sides = 6, radius = .00023;
  const threadDark = new T.Color(0x66783a), threadLight = new T.Color(0xb1bb69);
  const edgeOffset = distance.map(d => .18 + .09*Math.sin(d*21) + .035*Math.sin(d*47));
  const verts = new Float32Array(rings * sides * 3);
  const indices = [], colors = [];
  for (let i = 0; i < rings; i++) {
    for (let k = 0; k < sides; k++) {
      const angle = k / sides * Math.PI * 2;
      const thread = .5 + .5 * Math.cos(2 * angle + distance[i] * 423);
      const color = threadDark.clone().lerp(threadLight, thread);
      colors.push(color.r, color.g, color.b);
      if (i > 0) {
        const a = (i - 1) * sides + k, b = (i - 1) * sides + (k + 1) % sides;
        indices.push(a, b, a + sides, b, b + sides, a + sides);
      }
    }
  }
  const geom = new T.BufferGeometry();
  geom.setAttribute('position', new T.BufferAttribute(verts, 3));
  geom.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geom.setIndex(indices);
  const mesh = new T.Mesh(geom, new T.MeshStandardMaterial({vertexColors: true, roughness: .94}));
  mesh.name = '跑步路线鞋带';
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  road.add(mesh);
  return (positions, last) => {
    for (let i = 0; i <= last; i++) {
      const j = i * 6;
      const x = T.MathUtils.lerp(positions[j], positions[j+3], edgeOffset[i]);
      const z = T.MathUtils.lerp(positions[j+2], positions[j+5], edgeOffset[i]);
      const a = Math.max(0, i-1)*6, b = Math.min(last, i+1)*6;
      const dx = (positions[b]+positions[b+3])-(positions[a]+positions[a+3]);
      const dz = (positions[b+2]+positions[b+5])-(positions[a+2]+positions[a+5]);
      const len = Math.hypot(dx,dz) || 1;
      for (let k = 0; k < sides; k++) {
        const angle = k / sides * 2 * Math.PI, r = radius * Math.cos(angle);
        const n = (i*sides+k)*3;
        verts[n] = x + r*dz/len;
        verts[n+1] = positions[j+1] + surfaceDip(pits,x,z) + radius*(1+Math.sin(angle));
        verts[n+2] = z - r*dx/len;
      }
    }
    const stride = sides*3;
    for (let i = last+1; i < rings; i++) verts.copyWithin(i*stride, last*stride, (last+1)*stride);
    geom.setDrawRange(0,last*sides*6);
    geom.attributes.position.needsUpdate = true;
    geom.computeVertexNormals();
    geom.boundingSphere = null;
  };
}

export async function makeCity(city,models,registration,preparation){
  const [pool, {material:stone,plan,contact}] = await Promise.all([library(models,registration,city.scale.x,preparation), loadPavement(models)]);
  const buildings=[],roads=[],landmarks=[],blocks=[],crossings=[];
  const buildingsKit=models?await architecture(pool.tower):null;
  const yardFinish=models?await courtyardFinishes():null;
  const furnish=models?await shopWorkshop(pool.shops,buildingsKit.plinth,pool):null;
  actualProfile=registration?.outsoleProfile;
  const base=pool.interior?pool.interior.clone():foundation();if(pool.interior){base.scale.set(.62,.040,2);base.position.y=-.040;}city.add(base);
  const outsole=await makeOutsole(city,boundsAt,stone);
  const details=roadDetails(city,plan,stone,contact);
  roads.push(carpet(city, trunkSections(), .51, .165, stone, plan.pits, true));
  for(let row=0;row<10;row++){
    const z=-.79+row*.169,ends=[boundsAt(z-.074),boundsAt(z+.074)];
    const left=Math.max(...ends.map(e=>e[0]))+.009,right=Math.min(...ends.map(e=>e[1]))-.009;
    const cx=mainLane(z);
    for(const sign of [-1,1]){
      const inner=cx+sign*.031,outer=sign>0?right:left;
      const columns=row>=6?3:2;
      for(let col=0;col<columns;col++){
        // The stall occupies one actual lug site, outside the central lane.
        if(row===6 && sign===1 && col===0)continue;
        const id=buildings.length;
        let x=T.MathUtils.lerp(inner,outer,(col+.5)/columns),atZ=z;
        const tower=row>=5 && (row+col+(sign>0?1:0))%4!==0;
        let h=tower?.27+.17*(.5+.5*Math.sin(id*1.81)):.054+.051*(.5+.5*Math.cos(id*2.4));
        let w=Math.abs(inner-outer)/columns-.012,d=(row===5||row===6)?.103:.132;
        if(models)h=districtHeight(row,sign,col,tower,h);
        const group=new T.Group();
        // The cross street ends at a side entrance beyond the stair landing.
        // At the toe the lane bends around a low end house, inside the rubber rim.
        const endOfCrossing=models && row===6 && sign===-1 && col===2;
        const endOfLane=models && row===9 && sign===1 && col===2;
        // A street-facing apartment occupies the depth of a real building.
        // Behind it two smaller houses share the block and face the two
        // transverse lanes. Their yards and entrance steps stay inside its rim.
        const pairedFlats=row>=7&&pool['flat-gallery']&&pool['flat-balcony']&&!endOfLane;
        if(pairedFlats){
          const span=Math.abs(outer-inner),streetDepth=span*.52;
          if(col===0){
            w=streetDepth-.006;x=inner+sign*streetDepth/2;
          }else{
            w=span-streetDepth-.008;x=inner+sign*(streetDepth+(span-streetDepth)/2);
            if(row!==9||sign!==1){
              d=.061;atZ+=col===1?-.035:.035;
            }
          }
        }
        const bookGate=endOfCrossing&&pool['shop-books'];
        if(endOfCrossing){
          atZ=junctions[5];x=boundsAt(atZ)[0]+.021;w=.024;d=.082;h=.085;
          if(bookGate){
            const edge=Math.max(boundsAt(atZ-.025)[0],boundsAt(atZ+.025)[0])+.0025;
            w=-.180-edge;x=edge+w/2;d=.055;
          }
        }
        if(endOfLane){atZ=.925;x=mainLane(.91)-.033;w=.107;d=.063;h=.079;}
        const faceNextCrossing=pairedFlats&&col>0?col===2:row===0||(row<9 && (row+col+(sign>0?1:0))%2===0);
        const yardDepth=models?courtDepth(row,sign,col):0;
        const crossDir=faceNextCrossing?1:-1;
        if(yardDepth){d-=yardDepth;atZ+=crossDir*yardDepth/2;}
        const faceAlongZ=!!models && col>0 && (!tower||pairedFlats) && (!endOfCrossing||bookGate);
        let frontage=faceAlongZ?w:d,lotDepth=faceAlongZ?d:w;
        const storefront=!tower&&furnish?furnish(row,sign,col,frontage/h):null;
        const corner=row===6&&sign===-1&&col===0,neighbor=row===6&&sign===1&&col===1;
        const role=corner?'bridge-corner-shop':neighbor?'stall-neighbor-shop':null;
        const independent=role&&pool[role],highRise=tower&&!independent;
        const towerDesign=tower&&buildingsKit?towerProfile(row,sign,col):null;
        const buildingRole=storefront?.role??towerDesign?.role;
        const whole=buildingRole&&pool[buildingRole];
        const courtAnchorX=x,courtAnchorZ=atZ,courtWidth=w,courtHouseDepth=d;
        const shopFront=endOfLane?w:frontage,shopDepth=endOfLane?d:lotDepth;
        let mesh;
        if(independent){
          // Fit to the lot without changing the proportions of the supplied building.
          const [width,height,depth]=independent.userData.nativeSize;
          const factor=Math.min((corner?.110:.125)/width,(corner?.098:.093)/height,(corner?.061:.068)/depth);
          frontage=width*factor;h=height*factor;lotDepth=depth*factor;
          w=lotDepth;d=frontage;
          atZ=corner?.222:.224+.052/2+d/2+.0015;
          // The grain shop opens onto the lane, shifted just beyond the canopy.
          // A runner approaching the counter can also see the recessed shop bay.
          x=corner?mainLane(atZ)-.039-w/2:mainLane(.224)+.043+w/2;
          mesh=independent.clone();
          group.name=corner?'桥脚转角店':'摊旁邻铺';
          Object.assign(group.userData,{shopName:group.name,hi3dRole:role,mainStreet:true});
        }else if(whole){
          // Keep a single native world scale on all three axes. Align the complete
          // Hi3D building's street elevation to the old property line even if the
          // new roof's footprint is narrower than the old lot.
          const [sx,sy,sz]=whole.userData.nativeSize;
          if(endOfLane){frontage=w;lotDepth=d;}
          const factor=Math.min(frontage/sx,lotDepth/sz,h/sy);
          const newDepth=sz*factor;
          if(faceAlongZ||endOfLane)atZ+=(endOfLane?-1:crossDir)*(lotDepth-newDepth)/2;
          else x-=sign*(lotDepth-newDepth)/2;
          frontage=sx*factor;h=sy*factor;lotDepth=newDepth;
          const facesZ=faceAlongZ||endOfLane;
          w=facesZ?frontage:lotDepth;d=facesZ?lotDepth:frontage;
          mesh=whole.clone();
          group.userData.hi3dRole=buildingRole;
          if(storefront){
            nameWholeShop(mesh,whole,storefront.cell,storefront.name);
            group.name='店铺_'+storefront.name;
            Object.assign(group.userData,{shopName:storefront.name,mainStreet:storefront.main,buildingType:shopProfile(storefront.cell).name});
          }else{
            group.name=towerDesign.name+'_'+row+'_'+(sign>0?'东':'西')+col;
            group.userData.buildingType=towerDesign.name;
          }
        }else if(storefront){
          const profile=shopProfile(storefront.cell);
          if(!endOfLane)h*=profile.height;
          mesh=buildingsKit.shop(storefront.shop,storefront.cell,storefront.edition,[frontage,h,lotDepth]);
          group.name='店铺_'+storefront.name;
          Object.assign(group.userData,{shopName:storefront.name,mainStreet:storefront.main,buildingType:profile.name});
        }else if(tower && buildingsKit){
          const block=buildingsKit.tower(row,sign,col,[d,h,w]);
          mesh=block.mesh;group.userData.buildingType=block.name;
          group.name=block.name+'_'+row+'_'+(sign>0?'东':'西')+col;
        }else{
          mesh=pool[tower?'tower':'shops'].clone();
        }
        mesh.scale.set(models?frontage:w,h,models?lotDepth:d);
        if(models){
          mesh.rotation.y=-sign*Math.PI/2;
          if(faceAlongZ&&!independent)mesh.rotation.y=faceNextCrossing?0:Math.PI;
          if(endOfLane)mesh.rotation.y=Math.PI;
        }
        blocks.push({x,z:atZ,w,d});
        group.add(mesh);
        if(whole&&!independent&&!bookGate&&(storefront||tower))shopYard(group,mesh,x,atZ,shopFront,shopDepth,buildingsKit.finishes,blocks,id);
        if(yardDepth){
          const courtyardZ=courtAnchorZ-crossDir*(yardDepth+courtHouseDepth)/2;
          const court=rearCourt(buildingsKit.finishes,yardFinish,pool.gate,pool['courtyard-osmanthus'],{boundsAt,width:courtWidth,depth:yardDepth,direction:-crossDir,
            inside:-sign,row,side:sign,x:courtAnchorX,z:courtyardZ,blocks});
          court.position.set(courtAnchorX-x,0,courtyardZ-atZ);group.add(court);
        }
        group.position.set(x,.005,atZ);group.userData.feature=highRise?"tower":"shops";city.add(group);
        buildings.push({group,begin:reaches(yardDepth?z:atZ)-.014+.009*(.5+.5*Math.cos(id*3.7)),duration:.038+.030*(.5+.5*Math.sin(id*2.18))+(highRise?.012:0),f:0});
      }
    }
    if (row < junctions.length) {
      for (const side of [-1, 1]) {
        const sections = branchSections(junctions[row], side);
        roads.push(carpet(city, sections, reaches(junctions[row]), .033, stone, plan.pits));
      }
    }
  }
  if(buildingsKit){
    for(const [index,center] of junctions.entries())for(const side of [-1,1]){
      if(index===5||(index===6&&side===1))continue;
      const end=laneEnd(buildingsKit.finishes,yardFinish,boundsAt,blocks,center,side,index);
      city.add(end);landmarks.push({g:end,begin:reaches(center),ground:.0025});
    }
    // The west landing opens onto a narrow courtyard, with its wall returning
    // on both sides of the entrance. Leave the full walkable landing inside.
    const w=.008,center=junctions[5],x=boundsAt(center-.050)[0]+.014;
    const wall=new T.Group(),cap=mat(0x57594f),foot=buildingsKit.plinth.brick;
    const plaster=buildingsKit.plinth.lime;
    wall.name='桥西里院侧墙';wall.userData.feature='courtyard';
    function panel(dx,dz,width,length,height){
      box(wall,foot,dx,.005,dz,width,.010,length);
      box(wall,plaster,dx,height/2+.005,dz,width-.001,height-.010,length);
      const tile=box(wall,cap,dx,height+.001,dz,width+.002,.0026,length+.0012);
      tile.rotation.z=.085;
      blocks.push({x:x+dx,z:center+dz,w:width,d:length});
    }
    // Two walls meet the gable of the old house, with a walk-through gate in
    // the shorter return. Tile coping casts a fine, continuous line across it.
    panel(.005,-.054,w,.044,.053);
    panel(-.005,.064,w,.058,.061);
    panel(.023,-.075,.039,.007,.053);
    panel(.025,.094,.068,.007,.061);
    for(const dz of [-.073,-.034,.036,.092]){
      const dx=dz<0?.005:-.005,h=dz<0?.056:.064;
      box(wall,plaster,dx,h/2,dz,w+.002,h,.0062);
      box(wall,cap,dx,h+.0008,dz,w+.004,.0022,.008);
    }
    wall.position.set(x,.005,center);city.add(wall);
    landmarks.push({g:wall,begin:reaches(center)});
    const east=new T.Group();
    east.name='桥东里院照壁';east.userData.feature='courtyard';
    const eastX=boundsAt(center)[1]-.012,length=.096,height=.066;
    box(east,foot,0,.005,0,.006,.010,length);
    box(east,plaster,0,height/2+.005,0,.005,height-.010,length);
    const coping=box(east,cap,0,height+.001,0,.008,.0027,length+.002);
    coping.rotation.z=-.09;
    for(const dz of [-.044,.044]){
      box(east,plaster,0,height/2,dz,.008,height,.007);
      box(east,cap,0,height+.0023,dz,.010,.003,.009);
    }
    blocks.push({x:eastX,z:center,w:.008,d:length});
    east.position.set(eastX,.005,center);city.add(east);
    landmarks.push({g:east,begin:reaches(center)});
    const alleyZ=junctions[6],alleyX=Math.min(...[-.061,.061].map(offset=>boundsAt(alleyZ+offset)[1]))-.011;
    const alleyGate=makeAlleyGate(buildingsKit.plinth);
    alleyGate.position.set(alleyX,.0025,alleyZ);city.add(alleyGate);
    blocks.push({x:alleyX,z:alleyZ,w:.010,d:.119});
    for(const side of [-1,1])blocks.push({x:alleyX-.013,z:alleyZ+side*.055,w:.028,d:.005});
    landmarks.push({g:alleyGate,begin:reaches(alleyZ),ground:.0025});
    const placeEnd=(lot,x,z)=>{
      lot.position.set(x,.0025,z);city.add(lot);
      landmarks.push({g:lot,begin:reaches(z),ground:.0025});
    };
    streetEndHouses(pool,placeEnd,blocks);
    endUtilityLine(buildingsKit.finishes,placeEnd,blocks);
  }
  const gateCourt=models?await entryCourt():null;
  function landmark(role,x,z,w,h,d,begin){
    const newCart=role==='stall'&&pool['soy-cart-dawn'];
    const g=new T.Group(),m=(newCart||pool[role]).clone();
    if(role==='stall'&&models){
      if(newCart){
        addSoyMilk(m,-.211,.535,.029,.154,.214);
        const [width,height,depth]=m.userData.nativeSize;
        const factor=Math.min(d/width,h/height,w/depth);
        m.scale.set(width*factor,height*factor,depth*factor);
        // Keep the countertop on the same street-facing lease line as the former stall.
        x-=(w-m.scale.z)/2;
        w=m.scale.z;d=m.scale.x;
        g.userData.hi3dRole='soy-cart-dawn';
      }else{
        finishStall(m);m.scale.set(d,h,w);
      }
      m.rotation.y=-Math.PI/2;g.name='豆浆摊_清早';
    }else m.scale.set(w,h,d);
    // The stall sits on the recessed forecourt outside the carpeted road.
    // Its feet must meet the forecourt, lower than the crown of the road.
    const ground=role==='stall'?.0025:.005;
    g.add(m);g.position.set(x,ground,z);g.userData.feature=role;city.add(g);landmarks.push({g,begin,ground});
    if(role==='gate'&&gateCourt)g.add(gateCourt);
    if(role==='stall')blocks.push({x,z,w,d});else crossings.push(g);
  }
  landmark('gate',mainLane(-.88),-.88,.087,.061,.03,reaches(-.88));
  const bridge=footbridgePlan(mainLane(junctions[5]),junctions[5]);
  const crossing=await makeFootbridge(models?pool.bridge:null,bridge);
  crossing.name='蓝栏杆步行天桥';crossing.userData.feature='bridge';
  crossing.position.set(bridge.x,.004,bridge.z);city.add(crossing);landmarks.push({g:crossing,begin:reaches(bridge.z),ground:.004});
  landmark('stall',mainLane(.224)+.065,.224,.042,.053,.052,reaches(.224));
  let drygoodsView=null;
  if(pool['drygoods-bay']){
    // The bay backs onto the plaster screen beside the eastern landing.
    // This keeps the grain shop's own opening clear behind the breakfast cart.
    const cupboard=pool['drygoods-bay'].clone(),bay=new T.Group();
    const [width,height,depth]=cupboard.userData.nativeSize;
    const factor=Math.min(.038/width,.048/height,.023/depth);
    cupboard.scale.set(width*factor,height*factor,depth*factor);
    cupboard.rotation.y=-Math.PI/2;
    const backWall=city.getObjectByName('桥东里院照壁');
    const x=backWall.position.x-.003-cupboard.scale.z/2-.0003,z=backWall.position.z-.027;
    drygoodsView={eye:new T.Vector3(x-.047,.033,z-.002),target:new T.Vector3(x,.0025+cupboard.scale.y*.52,z)};
    bay.add(cupboard);bay.position.set(x,.0025,z);
    bay.name='南货铺_开扇木橱';Object.assign(bay.userData,{feature:'display',hi3dRole:'drygoods-bay'});
    city.add(bay);landmarks.push({g:bay,begin:reaches(z),ground:.0025});
    blocks.push({x,z,w:cupboard.scale.z,d:cupboard.scale.x});
  }
  for(const child of city.children.filter(o=>o.userData.feature))
    child.traverse(o=>{if(o.isMesh&&!o.material.isMeshBasicMaterial){o.castShadow=true;o.receiveShadow=true;}});
  const streets=streetGround(city,boundsAt,blocks,crossings);
  function walkSurface(x,z,above=false){return streets(x,z)?bridge.support(x,z,above):null;}
  function grow(group,f,finalY){
    group.visible=f>0;
    const width=smooth(0,.11,f);
    group.scale.set(width,f,width);
    group.position.y=T.MathUtils.lerp(-.019,finalY,smooth(0,.34,f));
  }
  const streaming=pool.nearSources?.size?nearBuildings(city,pool.nearSources):null;
  return {shell:pool.shell,bridge,walkSurface,streaming,drygoodsView,inspectionLid:plan.covers[0],reflect:details.reflect,groundHeight:(x,z)=>surfaceDip(plan.pits,x,z),canStandAt:(x,z)=>!!walkSurface(x,z),update(p){
    const road=roads[0](p);for(const fn of roads.slice(1))fn(p);
    const surface=outsole(p);details.update(p);
    for(const b of buildings){
      b.f=smooth(b.begin,b.begin+b.duration,p);
      grow(b.group,b.f,.005);
    }
    for(const {g,begin,ground=.005} of landmarks)grow(g,smooth(begin,begin+.047,p),ground);
    const visibleFeatures=buildings.filter(b=>b.group.visible).length+landmarks.filter(l=>l.g.visible).length;
    return {road,surface,visibleFeatures,partial:buildings.filter(b=>b.f>0&&b.f<1).length,full:buildings.filter(b=>b.f===1).length,total:buildings.length,heights:buildings.map(b=>+b.f.toFixed(4))};
  }};
}

// Measurements are in metres, with the entrance at z=0. Rotate each scanned
// piece into the room, then fit its actual bounds without distorting the mesh.
import * as T from 'three';

const dir='../holiday-assets/assets/island-rooms/';
const front=-Math.PI/2;
const placements={
  post:[['sorting-hutch',[-.52,0,-4.55],[2.90,2.54,1.43],front]],
  field:[['field-bench',[-1.43,0,-5.10],[2.74,2.32,1.32],front]],
  watch:[['telescope',[.93,0,-3.60],[1.48,1.98,1.15],.24]],
  inn:[['linen-bed',[-1.91,2.85,-4.98],[1.68,1.78,2.13],front],
       ['hearth',[-1.05,0,-6.10],[2.34,2.49,1.20],0]],
  baths:[['copper-bath',[-1.03,0,-3.88],[2.09,1.62,2.83],-.26]],
  slip:[['boat-cradle',[-.67,0,-4.09],[2.27,1.56,4.14],.17]],
  beacon:[['keeper-table',[-.98,0,-3.59],[1.38,1.58,.70],.14]],
};

const surfaces=new Map();
function loadSurface(name){
  if(!surfaces.has(name)){
    const loader=new T.TextureLoader();
    const pending=Promise.allSettled(['color','normal','rough'].map(async (channel)=>{
      const tex=await loader.loadAsync(dir+name+'-'+channel+'.jpg');
      tex.colorSpace=channel==='color'?T.SRGBColorSpace:T.NoColorSpace;
      tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.anisotropy=8;return tex;
    })).then(results=>{
      if(results.every(r=>r.status==='fulfilled'))return results.map(r=>r.value);
      for(const r of results)if(r.status==='fulfilled')r.value.dispose();
      surfaces.delete(name);return null;
    });
    surfaces.set(name,pending);
  }
  return surfaces.get(name);
}

function disposeProp(root){
  const maps=new Set(),materials=new Set();
  root.traverse(o=>{
    if(!o.isMesh)return;
    o.geometry.dispose();
    for(const m of [].concat(o.material))materials.add(m);
  });
  for(const mat of materials){for(const item of Object.values(mat))if(item?.isTexture)maps.add(item);mat.dispose();}
  for(const tex of maps){tex.dispose();tex.source.data?.close?.();}
}

// A short-range ambient shadow from the actual underside of the furniture.
// The mask is made once in floor space, independent of the sun or window.
function contactShadow(group,span){
  const width=span.x+.44,depth=span.z+.44,n=112;
  const points=new Uint8ClampedArray(n*n),v=new T.Vector3();
  group.updateMatrixWorld(true);
  group.traverse(o=>{
    if(!o.isMesh)return;
    const positions=o.geometry.attributes.position,step=Math.max(1,Math.ceil(positions.count/65000));
    for(let i=0;i<positions.count;i+=step){
      v.fromBufferAttribute(positions,i).applyMatrix4(o.matrixWorld).sub(group.position);
      if(v.y>1.45)continue;
      const x=Math.floor((.5+v.x/width)*n),z=Math.floor((.5+v.z/depth)*n);
      const at=z*n+x,opacity=255*(.48*Math.exp(-v.y*7)+.29*Math.exp(-v.y*1.9));
      points[at]=Math.max(points[at],opacity);
    }
  });
  const mask=document.createElement('canvas');mask.width=mask.height=n;
  const ctx=mask.getContext('2d'),rgba=ctx.createImageData(n,n);
  for(let i=0;i<points.length;i++)rgba.data[i*4+3]=points[i];
  ctx.putImageData(rgba,0,0);
  // A contact core plus a wider penumbra, in the same real-world scale.
  const canvas=document.createElement('canvas');canvas.width=canvas.height=n;
  const paint=canvas.getContext('2d');
  for(const [blur,alpha] of [[.105,.74],[.028,.63]]){
    const spread=Math.max(1,Math.round(blur*n/Math.max(width,depth)));
    paint.globalAlpha=alpha;paint.filter='blur('+spread+'px)';paint.drawImage(mask,0,0);
  }
  const texture=new T.CanvasTexture(canvas);texture.magFilter=T.LinearFilter;
  const material=new T.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
  const shadow=new T.Mesh(new T.PlaneGeometry(width,depth),material);
  shadow.rotation.x=-Math.PI/2;shadow.position.copy(group.position);shadow.position.y+=.003;
  return shadow;
}

export async function loadRoomDressing(id,loader,signal){
  const placementsHere=placements[id],pieces=new Map(),shadows=[],failed=[];
  const tasks=placementsHere.map(async ([name,anchor,limit,yaw])=>{
    let prop;
    try{
      const response=await fetch(dir+name+'.glb',{signal});
      if(!response.ok)throw Error('HTTP '+response.status);
      const bytes=await response.arrayBuffer();signal.throwIfAborted();
      prop=(await loader.parseAsync(bytes,dir)).scene;signal.throwIfAborted();
      const group=new T.Group();group.add(prop);prop.rotation.y=yaw;
      const bounds=new T.Box3().setFromObject(group,true),extent=bounds.getSize(new T.Vector3());
      const scale=Math.min(...limit.map((n,i)=>n/extent.getComponent(i)));
      prop.position.sub(new T.Vector3((bounds.min.x+bounds.max.x)/2,bounds.min.y,(bounds.min.z+bounds.max.z)/2));
      group.scale.setScalar(scale);group.position.fromArray(anchor);group.name='Tripo / '+name;
      prop.traverse(o=>{if(o.isMesh){o.castShadow=o.receiveShadow=true;
        for(const m of [].concat(o.material))if(m.map)m.map.anisotropy=8;}});
      shadows.push(contactShadow(group,extent.multiplyScalar(scale)));pieces.set(name,group);
    }catch(error){if(prop)disposeProp(prop);if(!signal.aborted){failed.push(name);console.warn('Room furnishing unavailable:',name,error.message);}}
  });
  const [wall,planks]=await Promise.all([loadSurface('plaster_grey_04'),loadSurface('wood_floor_deck'),...tasks]);
  const result={pieces,shadows,wall,planks,failed,dispose(){
    for(const p of [...pieces.values(),...shadows]){p.removeFromParent();disposeProp(p);}
    pieces.clear();shadows.length=0;
  }};
  if(signal.aborted){result.dispose();signal.throwIfAborted();}
  return result;
}

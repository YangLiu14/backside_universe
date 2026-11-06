import * as THREE from '../vendor/three.module.js';
import {printBook} from './bookroom-book.js';
export const P=(x,y,z)=>new THREE.Vector3(x,z,-y);
export const room={minX:-.061,maxX:.230,minY:.522,maxY:.674,floor:.008,eye:.100,doorX:.043,doorY:.682,doorMin:.010,doorMax:.076};
export const eyeHeight=y=>room.eye+.0275*THREE.MathUtils.smoothstep(y,.645,.690);
export async function buildInterior(scene,loader,{furnitureWidthScale=1,grotto=false,deferFurniture=false}={}){
 const root=new THREE.Group();root.name='crafted-bookroom-interior';scene.add(root);
 const material=(color,roughness=.75,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
 const plaster=material('#d8c7a6'),wood=material('#725039'),darkWood=material('#463327'),brass=material('#a88342',.32,.72),green=material('#306c58',.52),paper=material('#eee0b7');
 function box(name,c,s,mat=plaster,parent=root){const o=new THREE.Mesh(new THREE.BoxGeometry(s[0],s[2],s[1]),mat);o.position.copy(P(...c));o.name=name;o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
 const canvas=document.createElement('canvas');canvas.width=256;canvas.height=512;const ctx=canvas.getContext('2d');ctx.fillStyle='#927552';ctx.fillRect(0,0,256,512);let seed=34;const rand=()=>((seed=seed*16807%2147483647)/2147483647);
 for(let i=0;i<240;i++){ctx.strokeStyle=`rgba(${rand()>.5?'49,30,15':'195,165,111'},${.03+rand()*.13})`;ctx.lineWidth=.3+rand()*1.2;ctx.beginPath();const x=rand()*256;ctx.moveTo(x,0);ctx.bezierCurveTo(x+rand()*8,180,x-rand()*7,350,x,512);ctx.stroke();}
 const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
 const oak=new THREE.MeshStandardMaterial({map:tex,roughness:.68,color:'#d0ae82'});
 box('floor-underlay',[.084,.597,.004],[.303,.164,.008],darkWood);
 for(let x=0;x<14;x++)for(let y=0;y<3;y++)box('oak-floorboard',[-.061+(x+.5)*.291/14,.522+(y+.5)*.152/3,.008],[.291/14-.0004,.152/3-.0005,.003],oak);
 box('ceiling',[.084,.597,.154],[.303,.164,.008],plaster);
 box('back-wall',[.084,.518,.081],[.303,.008,.154],plaster);
 // The domed bay keeps its open arches, with a glazed reading alcove set
 // behind the original stonework rather than a solid infill across it.
 const glass=new THREE.MeshPhysicalMaterial({color:'#d9e8df',transparent:true,opacity:.10,roughness:.12,metalness:0,depthWrite:false,side:THREE.DoubleSide});
 box('bay-low-wall',[.234,.597,.027],[.008,.164,.046],plaster);
 if(grotto){
  // Timber spandrel joins the new mezzanine to the existing wood balcony.
  box('loggia-timber-apron',[.174,.680,.027],[.128,.003,.046],wood);
  for(let i=0;i<7;i++)box('loggia-apron-stile',[.115+i*.0195,.682,.027],[.003,.002,.042],darkWood);
  for(const z of [.005,.049])box('loggia-apron-rail',[.174,.682,z],[.128,.003,.003],darkWood);
  for(const y of [.540,.652])box('grotto-bay-side-jamb',[.239,y,.0865],[.018,.004,.081],wood);
  for(const z of [.048,.125])box('grotto-bay-side-rail',[.239,.596,z],[.018,.116,.004],wood);
 }
 const sideGlass=box('bay-side-glazing',[.234,.597,.100],[.002,.150,.100],glass);sideGlass.castShadow=false;
 for(const y of [.523,.670])box('bay-side-frame',[.234,y,.100],[.006,.005,.100],wood);
 // Left window is a real opening aligned with the cut in the generated shell.
 for(const [c,s] of [[[-.065,.535,.081],[.008,.026,.154]],[[-.065,.649,.081],[.008,.054,.154]],[[-.065,.585,.027],[.008,.074,.046]],[[-.065,.585,.140],[.008,.074,.03]]])box('window-wall',c,s,plaster);
 for(const [c,s] of [[[(-.067+.009)/2,.673,.081],[.076,.010,.154]],[[.094,.673,.081],[.034,.010,.154]],[[.174,.673,.027],[.128,.010,.046]],[[.043,.673,.150],[.068,.010,.012]]])box('entrance-wall',c,s,plaster);
 const frontGlass=box('bay-front-glazing',[.174,.673,.100],[.124,.002,.100],glass);frontGlass.castShadow=false;
 for(const x of [.112,.234])box('bay-front-frame',[x,.673,.100],[.005,.006,.100],wood);
 box('bay-window-sill',[.174,.670,.051],[.131,.017,.004],oak);
 box('bay-side-sill',[.231,.597,.051],[.017,.155,.004],oak);
 // Low wood panelling and fine coving give near views actual relief.
 for(const z of [.014,.048,.145]){
  box('back-wall-moulding',[.084,.525,z],[.293,.003,.0025],wood);
  box('right-wall-moulding',[.228,.597,z],[.003,.15,.0025],wood);
 }
 for(let i=0;i<10;i++)box('wainscot-stile',[-.049+i*.029,.525,.030],[.0016,.002,.032],wood);
 for(let i=0;i<5;i++)box('ceiling-beam',[-.045+i*.063,.597,.148],[.004,.150,.006],darkWood);
 for(const y of [.548,.622])box('window-jamb',[-.062,y,.086],[.014,.004,.082],wood);
 for(const z of [.047,.125])box('window-jamb',[-.062,.585,z],[.014,.079,.004],wood);
 box('window-sill',[-.052,.585,.046],[.029,.082,.004],oak);
 box('window-mullion',[-.063,.585,.086],[.004,.002,.077],wood);
 box('window-crossbar',[-.063,.585,.092],[.004,.074,.002],wood);
 // Door rotates around a real hinge. Outside shutters remain in the source mesh.
 for(const x of [.008,.078])box('door-jamb',[x,.681,.074],[.006,.020,.142],wood);
 box('door-lintel',[.043,.681,.145],[.076,.020,.006],wood);
 // The generated terrace is at Z=.037: two shallow inner steps join it to
 // the reading room floor. A landing also closes the shell's cut floor edge.
 box('entry-lower-step',[.043,.657,.01375],[.076,.022,.0075],oak);
 box('entry-upper-step',[.043,.676,.0185],[.076,.020,.017],oak);
 box('threshold-landing',[.043,.710,.02275],[.076,.050,.0295],oak);
 const pivot=new THREE.Group();pivot.name='green-door-hinge';pivot.position.copy(P(.011,.684,.038));root.add(pivot);
 const doorW=.064,doorH=.104;
 const door=box('green-door-leaf',[doorW/2,0,doorH/2],[doorW,.005,doorH],green,pivot);door.userData.door=true;
 for(const side of [-1,1]){
  for(const [fraction,height] of [[.19,.205],[.538,.265],[.826,.205]])box('door-raised-panel',[doorW/2,side*.003,doorH*fraction],[doorW-.012,.002,doorH*height],green,pivot);
  for(const x of [.005,doorW-.005])box('door-stile',[x,side*.004,doorH/2],[.003,.0015,doorH-.006],green,pivot);
  const knob=new THREE.Mesh(new THREE.SphereGeometry(.0018,12,8),brass);knob.position.copy(P(doorW-.009,side*.006,doorH*.5));pivot.add(knob);
 }
 // Millimetre-scale panel relief otherwise self-shadows into noisy stripes.
 // Keep its cast shadow on the floor while lighting the painted panels cleanly.
 pivot.traverse(o=>{if(o.isMesh)o.receiveShadow=false;});
 // Woven rug, with a separate border and repeated small geometric stitches.
 box('rug-border',[.095,.600,.0105],[.113,.091,.001],material('#815345'));
 box('rug-field',[.095,.600,.0112],[.101,.079,.0005],material('#b58d67'));
 for(let i=0;i<9;i++)for(const y of [.561,.639]){const o=box('rug-stitch',[.052+i*.0105,y,.0116],[.003,.003,.0003],paper);o.rotation.y=Math.PI/4;}
 for(const [x,y] of [[.16,.53],[-.05,.655]]){
  box('wall-sconce-back',[x,y,.112],[.009,.004,.018],brass);
  const globe=new THREE.Mesh(new THREE.SphereGeometry(.0045,16,12),new THREE.MeshStandardMaterial({color:'#fff1d1',emissive:'#ffd895',emissiveIntensity:1.5}));globe.position.copy(P(x,y+.006,.117));root.add(globe);
  const lamp=new THREE.PointLight('#ffddb0',.003,.23,2);lamp.position.copy(P(x,y+.012,.112));root.add(lamp);
 }
 const fill=new THREE.PointLight('#ffe4bb',.010,.35,2);fill.position.copy(P(.08,.595,.137));root.add(fill);
 const tableLight=new THREE.PointLight('#ffd7a0',.002,.16,2);tableLight.position.copy(P(-.022,.583,.073));root.add(tableLight);
 const furniture=[],contents=new THREE.Group();
 contents.name='bookroom-furnishings';contents.visible=!deferFurniture;
 const result={root,pivot,door,furniture,contents,loadFurniture,book:null};
 async function asset(slug,axis,length,x,y,yaw){
  const gltf=await loader.loadAsync(new URL(`assets/bookroom/${slug}.glb`,import.meta.url).href);const book=slug==='desk'?await printBook(gltf.scene):null;const group=new THREE.Group();group.name='tripo-'+slug;group.add(gltf.scene);
  const bounds=new THREE.Box3().setFromObject(gltf.scene),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  gltf.scene.position.sub(new THREE.Vector3(center.x,bounds.min.y,center.z));const scale=length/size[axis];group.scale.setScalar(scale);group.rotation.y=yaw;const placement=new THREE.Group();placement.name='placement-'+slug;placement.position.copy(P(x,y,.011));placement.scale.x=furnitureWidthScale;placement.add(group);
  let triangles=0;group.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;}});
  placement.updateMatrixWorld(true);const bb=new THREE.Box3().setFromObject(placement);return {placement,book,obstacle:{slug,triangles,bounds:{min:bb.min.toArray(),max:bb.max.toArray()}}};
 }
 // Tripo's canonical front is +X; rotations orient each item into the room.
 const specs=[['bookcase','y',.117,.133,.542,Math.PI/2],['desk','z',.084,-.017,.585,Math.PI],['chair','y',.055,.183,.616,Math.PI*.65]];
 const parts=new Map();
 let loading;
 function loadFurniture(){
  if(!loading){
   loading=Promise.all(specs.map(spec=>{
    const slug=spec[0];
    if(!parts.has(slug))parts.set(slug,asset(...spec).catch(error=>{parts.delete(slug);throw error;}));
    return parts.get(slug);
   })).then(items=>{
    for(const item of items){
     contents.add(item.placement);furniture.push(item.obstacle);
     if(item.book)result.book=item.book;
    }
    root.add(contents);
   }).catch(error=>{loading=null;throw error;});
  }
  return loading;
 }
 if(!deferFurniture)await loadFurniture();
 return result;
}

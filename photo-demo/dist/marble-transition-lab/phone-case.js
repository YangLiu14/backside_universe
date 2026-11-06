import * as THREE from '../vendor/three.module.js';

// In the unified port GLB's coordinates. The upper lip sits at the surveyed
// height of the quay. Its hollow centre lets the actual desk sea reach the piers.
export const handset={width:.584,length:.995,top:.049,water:.010,radius:.074};
export const silenceKey={z:-.19,height:.028};

const cameraDeckEnd=x=>-.255-.097*THREE.MathUtils.smoothstep(x,-.042,.16);

function perimeter(inset){
  const x=handset.width/2-inset,z=handset.length/2-inset,r=handset.radius-inset;
  const points=[];
  for(let k=0;k<4;k++){
    const cx=k===0||k===3?x-r:r-x,cz=k<2?z-r:r-z;
    for(let j=0;j<=7;j++){
      const angle=(k+j/7)*Math.PI/2;
      points.push(new THREE.Vector2(cx+r*Math.cos(angle),cz+r*Math.sin(angle)));
    }
  }
  return points;
}

// The ocean shader samples eight coastline points for each island.
export const handsetShore=perimeter(0).filter((_,i)=>i%8===0||i%8===7).map(p=>p.toArray());

// Follow the actual stone banks where they meet the inner edge of the
// pearl back. The camera end is solid, the middle opens onto the moving sea.
function harborOpening(){
  const path=new THREE.Shape();path.moveTo(-.257,cameraDeckEnd(-.257));
  for(const x of [-.18,-.08,-.042,0,.04,.08,.12,.155])path.lineTo(x,cameraDeckEnd(x));
  path.bezierCurveTo(.181,-.347,.195,-.271,.212,-.221);
  path.bezierCurveTo(.235,-.162,.253,-.096,.254,-.044);
  path.lineTo(.263,.364);path.quadraticCurveTo(.266,.455,.202,.458);
  path.lineTo(-.192,.458);path.quadraticCurveTo(-.257,.457,-.261,.391);
  path.lineTo(-.257,cameraDeckEnd(-.257));return path.getPoints(7).slice(0,-1);
}

const opening=harborOpening();
function insideHarbor(x,z){
  let inside=false;
  for(let i=0,j=opening.length-1;i<opening.length;j=i++){
    const a=opening[i],b=opening[j];
    if((a.y>z)!==(b.y>z)&&x<(b.x-a.x)*(z-a.y)/(b.y-a.y)+a.x)inside=!inside;
  }
  return inside;
}

function railFinish(loop,distances,total){
  // An unwrapped, millimetre-scale hardware finish around all four sides.
  // Side ports stay fixed to the metal as the camera moves or the tide changes.
  const c=document.createElement('canvas');c.width=3072;c.height=128;
  const g=c.getContext('2d');g.fillStyle='#dfdcce';g.fillRect(0,0,c.width,c.height);
  for(let y=0;y<c.height;y+=2){
    g.fillStyle=y%6?'rgba(75,69,59,.035)':'rgba(255,255,245,.12)';g.fillRect(0,y,c.width,1);
  }
  g.fillStyle='#85857f';g.fillRect(0,11,c.width,3);
  const u=d=>d/total*c.width;
  const corner=distances[7],short=handset.width-2*handset.radius,long=handset.length-2*handset.radius;
  const left=2*corner+short;
  const slot=(x,y,w,h,fill)=>{
    g.fillStyle=fill;g.beginPath();g.roundRect(x-w/2,y-h/2,w,h,h/2);g.fill();
  };
  const bottom=u(corner+short/2); // from the rounded corner along the short end
  slot(bottom,68,87,35,'#a4a397');slot(bottom,68,79,27,'#302f2d');
  slot(bottom,69,64,10,'#5e5b52');
  for(const sign of [-1,1])for(let i=0;i<5;i++){
    const px=bottom+sign*(65+i*15);slot(px,67,8,14,'#595954');slot(px,66,6,10,'#303333');
  }
  // The long left edge runs from positive Z towards the camera end.
  for(const z of [-.085,.020]){
    const x=u(left+loop[15].y-z);slot(x,51,u(.081),30,'#8e8e85');slot(x,50,u(.077),22,'#e5e4da');
  }
  for(const [from,length] of [[corner,short],[left,long],[left+long+corner,short],[total-long,long]]){
    for(const d of [from+.036,from+length-.036]){
      g.fillStyle='#9b9c92';g.fillRect(u(d)-1.7,0,3.4,c.height);
    }
  }
  const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;return map;
}

export function createPhoneCase(){
  const loop=perimeter(0),distances=[0];
  for(let i=0;i<loop.length;i++)distances.push(distances[i]+loop[i].distanceTo(loop[(i+1)%loop.length]));
  const total=distances.at(-1),positions=[],uv=[],index=[],stride=loop.length+1;
  // Each pair of rings is an independent strip, with a sharp normal where
  // the fine chamfer meets the brushed rail and the pearl back.
  const profile=[
    [.006,-.011],[0,-.005],[0,.042],[.004,handset.top],
  ];
  const geo=new THREE.BufferGeometry();
  for(let j=1;j<profile.length;j++){
    const first=index.length;
    for(const [side,[inset,y]] of profile.slice(j-1,j+1).entries()){
      const ring=perimeter(inset);
      for(let i=0;i<stride;i++){
        const p=ring[i%loop.length];
        positions.push(p.x,y,p.y);uv.push(distances[i]/total,side);
      }
    }
    for(let i=0;i<loop.length;i++){
      const a=2*(j-1)*stride+i,b=a+1,c=a+stride,d=c+1;
      index.push(a,c,b,b,c,d);
    }
    geo.addGroup(first,index.length-first,j===2?0:1);
  }
  // Triangulate the deck as a real annulus: its asymmetric inner coastline
  // has a different vertex count from the four rounded outside corners.
  const outer=perimeter(.004),deckStart=index.length,deckBase=positions.length/3;
  for(const p of outer){positions.push(p.x,handset.top,p.y);uv.push(0,0);}
  for(const p of opening){positions.push(p.x,.044,p.y);uv.push(0,0);}
  for(const [a,b,c] of THREE.ShapeUtils.triangulateShape(outer,[opening])){
    index.push(deckBase+c,deckBase+b,deckBase+a);
  }
  const inner=positions.length/3;
  for(const y of [.044,-.009])for(const p of opening){positions.push(p.x,y,p.y);uv.push(0,0);}
  const n=opening.length;
  for(let i=0;i<n;i++){
    const a=inner+i,b=inner+(i+1)%n;index.push(a,a+n,b,b,a+n,b+n);
  }
  geo.addGroup(deckStart,index.length-deckStart,2);
  geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(index);geo.computeVertexNormals();
  const rail=new THREE.MeshStandardMaterial({map:railFinish(loop,distances,total),metalness:.58,roughness:.35});
  const bevel=new THREE.MeshStandardMaterial({color:'#d7d8d1',roughness:.22,metalness:.76});
  const back=new THREE.MeshStandardMaterial({color:'#dedfd9',roughness:.48,metalness:.26});
  const shell=new THREE.Mesh(geo,[rail,bevel,back]);
  shell.name='Brushed handset frame';shell.castShadow=shell.receiveShadow=true;shell.layers.enable(3);
  shell.add(cameraHardware());
  return shell;
}

// The generated rear camera face stood almost vertically. Let the low rocks
// meet a flush glass back at the camera end and retire the old raised lenses.
// Work from the same local shoreline in both GLBs, independent of topology.
export function fitCoastToCase(model){
  model.updateWorldMatrix(true,true);
  model.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const g=mesh.geometry,pos=g.attributes.position,indices=g.index;
    const inside=new Uint8Array(pos.count),changed=new Uint8Array(pos.count);
    const inverse=mesh.matrixWorld.clone().invert(),p=new THREE.Vector3();
    for(let i=0;i<pos.count;i++){
      p.fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld);
      const shore=p.z-cameraDeckEnd(p.x);
      inside[i]=Number(shore<-.010);
      if(p.y<=.030)continue;
      const y=p.y;
      if(shore<.030)p.y=THREE.MathUtils.lerp(.030,y,THREE.MathUtils.smoothstep(shore,0,.030));
      // Tuck the old uneven side rail under the new deck. High outcrops
      // retain their relief, including those that straddle the opening.
      else if(y<.088&&!insideHarbor(p.x,p.z)){
        p.y=THREE.MathUtils.lerp(Math.min(y,.038),y,THREE.MathUtils.smoothstep(y,.060,.088));
      }
      if(y===p.y)continue;
      p.applyMatrix4(inverse);pos.setXYZ(i,p.x,p.y,p.z);changed[i]=1;
    }
    const keep=[];
    for(let i=0;i<indices.count;i+=3){
      const a=indices.getX(i),b=indices.getX(i+1),c=indices.getX(i+2);
      if(!(inside[a]&&inside[b]&&inside[c]))keep.push(a,b,c);
    }
    g.setIndex(keep);pos.needsUpdate=true;
    const original=g.attributes.normal;g.deleteAttribute('normal');g.computeVertexNormals();
    const normals=g.attributes.normal;
    for(let i=0;i<pos.count;i++)if(!changed[i])normals.setXYZ(i,original.getX(i),original.getY(i),original.getZ(i));
    g.computeBoundingBox();g.computeBoundingSphere();
  });
}

// Subsurface iris and coating, underneath the view-dependent glass highlight.
function objectiveMap(){
  const c=document.createElement('canvas');c.width=c.height=128;
  const g=c.getContext('2d'),iris=g.createRadialGradient(65,65,4,64,64,64);
  for(const [at,color] of [[0,'#070d13'],[.30,'#0b1520'],[.34,'#263745'],[.43,'#121d28'],[.62,'#202d37'],[.89,'#101820'],[1,'#283139']])iris.addColorStop(at,color);
  g.fillStyle=iris;g.fillRect(0,0,128,128);
  g.save();g.translate(45,40);g.rotate(-.55);g.scale(1,.50);
  const glint=g.createRadialGradient(0,0,0,0,0,22);
  glint.addColorStop(0,'rgba(172,200,214,.65)');glint.addColorStop(.5,'rgba(105,152,181,.35)');glint.addColorStop(1,'rgba(81,147,177,0)');
  g.fillStyle=glint;g.fillRect(-24,-24,48,48);g.restore();
  const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;return map;
}

function cameraHardware(){
  const positions=[],colors=[],uv=[],batches=[[],[],[]];
  const color=new THREE.Color();
  // Short concentric bands keep the polished bezels, recessed optics and flash
  // round at this viewing distance. Batch by finish instead of by lens.
  function stack(outline,x,z,rings,capColor,capMaterial=0,down=false){
    const count=outline.length;
    function ring(scale,y,tint){
      const start=positions.length/3;color.set(tint);
      for(const p of outline){
        positions.push(x+p.x*scale,y,z+p.y*scale);colors.push(color.r,color.g,color.b);uv.push(.5+p.x/2,.5+p.y/2);
      }
      return start;
    }
    for(let j=1;j<rings.length;j++){
      const [ra,ya]=rings[j-1],[rb,yb,tint,material=0]=rings[j];
      const a=ring(ra,ya,tint),b=ring(rb,yb,tint);
      for(let i=0;i<count;i++){
        const k=(i+1)%count;
        if(down)batches[material].push(a+i,a+k,b+i,a+k,b+k,b+i);
        else batches[material].push(a+i,b+i,a+k,a+k,b+i,b+k);
      }
    }
    const [r,y]=rings.at(-1),edge=ring(r,y,capColor);
    const center=positions.length/3;positions.push(x,y,z);colors.push(color.r,color.g,color.b);uv.push(.5,.5);
    for(let i=0;i<count;i++){
      const k=(i+1)%count;batches[capMaterial].push(edge+i,down?edge+k:center,down?center:edge+k);
    }
  }
  const foot=perimeter(.006);
  stack(foot,0,0,[[1,-.011],[.98,-.030,'#434749']], '#242b31',1,true);
  const pad=[];
  for(let k=0;k<4;k++){
    const cx=k===0||k===3?.077:-.077,cz=k<2?.058:-.058;
    for(let j=0;j<=5;j++){const a=(k+j/5)*Math.PI/2;pad.push(new THREE.Vector2(cx+.036*Math.cos(a),cz+.036*Math.sin(a)));}
  }
  stack(pad,-.130,-.368,[[.98,.040],[1,.053,'#bac0b9'],[.974,.060,'#e2e5db']], '#d2d4cb');
  const circle=Array.from({length:26},(_,i)=>new THREE.Vector2(Math.cos(i*Math.PI/13),Math.sin(i*Math.PI/13)));
  for(const [x,z] of [[-.183,-.414],[-.183,-.323],[-.080,-.368]]){
    stack(circle,x,z,[[.042,.059],[.042,.072,'#787e7d'],[.039,.077,'#dce1df'],[.035,.077,'#3e4649'],
      [.033,.074,'#20282b',1]],'#ffffff',2);
  }
  stack(circle,-.076,-.430,[[.014,.060],[.014,.063,'#99978a'],[.011,.064,'#ede2b8']], '#f1dfb1');
  stack(circle,-.073,-.310,[[.009,.060],[.008,.062,'#777e79']], '#323b3e',1);
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(batches.flat());g.computeVertexNormals();
  let first=0;
  batches.forEach((indices,i)=>{g.addGroup(first,indices.length,i);first+=indices.length;});
  const metal=new THREE.MeshStandardMaterial({vertexColors:true,metalness:.50,roughness:.34});
  const glass=new THREE.MeshPhysicalMaterial({vertexColors:true,metalness:.20,roughness:.18,clearcoat:1,clearcoatRoughness:.12});
  const lens=glass.clone();lens.map=objectiveMap();
  const hardware=new THREE.Mesh(g,[metal,glass,lens]);hardware.name='Flush triple-camera back and front glass';
  hardware.castShadow=hardware.receiveShadow=true;hardware.layers.enable(3);return hardware;
}

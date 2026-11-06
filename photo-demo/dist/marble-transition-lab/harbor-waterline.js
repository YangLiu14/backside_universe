import * as THREE from '../vendor/three.module.js';

// Surveyed planes of the baked pools in Y-up asset coordinates (y = ax + bz + c).
// The orange riverbed and the grotto pool slope inland. Lowering their highest
// point rigidly would also put the seaward end of the pier under water.
export const harborFits = {
  grotto: {plane:[.0485,.1890,-.1584], clearance:.006, maxDrop:.023},
  'orange-book': {plane:[.0051,-.1251,.0673], clearance:.006, maxDrop:.025},
  phone: {plane:[.0150,-.0492,.0263], clearance:.004, maxDrop:.012, basinOnly:true},
  cup: {plane:[-.0083,-.0556,.0626], clearance:.004, maxDrop:.012, seaward:[.09,.42]},
};

export const grottoDraft = .006;
export const cupDraft = .004;
export const cupCottageDraft = .0105;
export const cupHarborDraft = .0215;

// The ceramic rests on its saucer. At high tide only the rear rim and the
// lower sill open into the harbour. The deep channel must also clear a trough.
export function fitCupInlet(mesh,center,rear,surface) {
  const base=surface(0,0);
  mesh.material.uniforms.cupSea.value.set(surface(1,0)-base,surface(0,1)-base,base);
  const geometry=mesh.geometry, target=geometry.clone(), p=target.attributes.position;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
    const dx=x-center.x,dz=z-center.z;
    const along=dx*rear.x+dz*rear.y,across=dx*rear.y-dz*rear.x;
    const mouth=THREE.MathUtils.smoothstep(along,-.008,.015);
    const halfWidth=.015-.005*THREE.MathUtils.smoothstep(along,.020,.060);
    const banks=1-THREE.MathUtils.smoothstep(Math.abs(across),halfWidth,halfWidth+.015);
    const foot=1-THREE.MathUtils.smoothstep(y-surface(x,z),.025,.045);
    const channel=mouth*banks*foot;
    if(mesh.name==='saucer'){
      // Ease the photographed tilt at the lip while keeping the cup's seat.
      const lip=THREE.MathUtils.smoothstep(Math.hypot(dx,dz),.030,.054);
      const level=lip*(-.078*along+.022*across);
      const inset=.012*lip*channel;
      p.setXYZ(i,x-inset*rear.x,y+level-.0185*channel,z-inset*rear.y);
    }else p.setY(i,y-.0215*channel);
  }
  target.computeVertexNormals();
  geometry.morphAttributes.position=[p];
  geometry.morphAttributes.normal=[target.attributes.normal];
  mesh.updateMorphTargets();
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
}

// Fit the loaded shore once in its final berth. The same correction applies to
// dock and shore vertices at a given XZ, retaining their relief above the water.
// Higher terrain, the house, and the interactive door stay in their rigid frame.
export function seatHarborBase(model, berth, surface, {plane,clearance,maxDrop,seaward,basinOnly}) {
  const [a,b,c] = plane;
  const assetPoint = new THREE.Vector3(), pool = new THREE.Vector3(), world = new THREE.Vector3();
  model.updateWorldMatrix(true,true);
  const assetFromWorld=new THREE.Matrix4();
  if(model.parent)assetFromWorld.copy(model.parent.matrixWorld).invert();
  model.traverse(mesh => {
    if (!mesh.isMesh) return;
    const assetFromMesh = new THREE.Matrix4().multiplyMatrices(assetFromWorld,mesh.matrixWorld);
    const worldFromMesh = new THREE.Matrix4().multiplyMatrices(berth,assetFromMesh);
    const inverse = worldFromMesh.clone().invert();
    const down = new THREE.Vector3(0,-1,0).applyMatrix3(new THREE.Matrix3().setFromMatrix4(inverse));
    const g = mesh.geometry, p = g.attributes.position;
    const normals = g.attributes.normal;
    const moved = new Uint8Array(p.count);
    const vertex = new THREE.Vector3();
    for (let i=0;i<p.count;i++) {
      vertex.fromBufferAttribute(p,i);
      assetPoint.copy(vertex).applyMatrix4(assetFromMesh);
      world.copy(assetPoint).applyMatrix4(berth);
      const height = world.y-surface(world.x,world.z);
      if (height<.070) {
        pool.set(assetPoint.x,a*assetPoint.x+b*assetPoint.z+c,assetPoint.z).applyMatrix4(berth);
        const excess = THREE.MathUtils.clamp(pool.y-surface(pool.x,pool.z)+clearance,0,maxDrop);
        let drop = excess*(1-THREE.MathUtils.smoothstep(height,.032,.070));
        if(basinOnly){
          // The surveyed teal bed and the timber decking belong to a single
          // textured mesh. Grade by relief above the bed and leave the metal
          // lip and the raised camera shoulder at their authored heights.
          const {x,y,z}=assetPoint;
          const right=.275-.12*THREE.MathUtils.smoothstep(-z,.06,.48);
          const edge=Math.min(x+.275,right-x,z+.48,.475-z);
          drop*=THREE.MathUtils.smoothstep(edge,.008,.034)
            *(1-THREE.MathUtils.smoothstep(y-(a*x+b*z+c),.008,.033))
            *THREE.MathUtils.smoothstep(z,-.36,-.28);
        }
        if(seaward)drop*=THREE.MathUtils.smoothstep(assetPoint.z,seaward[0],seaward[1]);
        if (drop>0) {
          vertex.addScaledVector(down,drop);
          p.setXYZ(i,vertex.x,vertex.y,vertex.z);
          moved[i]=1;
        }
      }
    }
    p.needsUpdate=true;
    if (normals) {
      g.deleteAttribute('normal');
      g.computeVertexNormals();
      // Keep authored cliff and roof shading away from the fitted shore.
      const updated=g.attributes.normal;
      for(let i=0;i<p.count;i++)if(!moved[i])updated.setXYZ(i,normals.getX(i),normals.getY(i),normals.getZ(i));
    }
    g.computeBoundingBox();g.computeBoundingSphere();
  });
}

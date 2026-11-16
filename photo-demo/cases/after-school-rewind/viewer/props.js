// Normalize real Hi3D meshes once. Keep their source UVs, normals, PBR materials and textures.
import * as T from 'three';
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
function bounds(root){return new T.Box3().setFromObject(root,true);}
function baked(gltf){
 const out=new T.Group();gltf.scene.updateMatrixWorld(true);
 gltf.scene.traverse(o=>{if(!o.isMesh)return;
  const g=o.geometry.clone().applyMatrix4(o.matrixWorld);if(!g.attributes.normal)g.computeVertexNormals();
  const mat=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();
  const mesh=new T.Mesh(g,mat);mesh.name=o.name;out.add(mesh);});return out;
}
function eachVertex(model,fn){model.traverse(o=>{const a=o.geometry?.attributes.position;if(!a)return;const v=V();for(let i=0;i<a.count;i++)fn(v.fromBufferAttribute(a,i),o,i);});}
function dimensionSort(v){return ['x','y','z'].sort((a,b)=>v[b]-v[a]);}
function principal(root){
 let c=V(),n=0;eachVertex(root,p=>{c.add(p);n++;});c.divideScalar(n);const cov=Array(9).fill(0);
 eachVertex(root,p=>{const a=p.sub(c).toArray();for(let i=0;i<3;i++)for(let j=0;j<3;j++)cov[i*3+j]+=a[i]*a[j];});
 let v=V(1,.73,.49);for(let i=0;i<22;i++){const [x,y,z]=v.toArray();v.set(cov[0]*x+cov[1]*y+cov[2]*z,cov[3]*x+cov[4]*y+cov[5]*z,cov[6]*x+cov[7]*y+cov[8]*z).normalize();}return v;
}
function originalPencilAxis(root){
 const axis=principal(root);let lo=Infinity,hi=-Infinity;eachVertex(root,p=>{const t=p.dot(axis);lo=Math.min(lo,t);hi=Math.max(hi,t);});
 // The graphite point tapers; the dipped cap is near full diameter. Positive axis points toward the cap.
 const tips=[[],[]];eachVertex(root,p=>{const t=(p.dot(axis)-lo)/(hi-lo);if(t<.045||t>.955)tips[t>.5?1:0].push(p.clone().addScaledVector(axis,-p.dot(axis)));});
 const spread=a=>{if(!a.length)return 0;const mid=a.reduce((v,p)=>v.add(p),V()).divideScalar(a.length);return Math.max(...a.map(p=>p.distanceToSquared(mid)).slice(0,40000));};
 if(spread(tips[0])>spread(tips[1]))axis.negate();return axis;
}
export function prepare(role,gltf,calibration){
 const root=baked(gltf),size=bounds(root).getSize(V()),axes=dimensionSort(size),orient=new T.Quaternion();
 if(calibration)orient.setFromRotationMatrix(new T.Matrix4().set(...calibration.axes[0],0,...calibration.axes[1],0,...calibration.axes[2],0,0,0,0,1));
 if(role==='pencil')orient.setFromUnitVectors(originalPencilAxis(root),V(0,0,1));
 if(role==='microphone')orient.setFromAxisAngle(V(0,1,0),-Math.PI/2);
 if(role==='announcer'||role==='announcer-head')orient.setFromAxisAngle(V(0,1,0),Math.PI/2);
 // Measured normal of the oblique hub in the approved Hi3D reel (least-variance axis).
 if(role==='reel')orient.setFromUnitVectors(V(.84193635,-.05731017,-.53652468).normalize(),V(0,0,1));
 if(role==='shell'){const thin=axes[2],a=V();a[thin]=1;orient.setFromUnitVectors(a,V(0,0,1));}
 for(const o of root.children)o.geometry.applyQuaternion(orient);
 if(role==='shell'&&bounds(root).getSize(V()).y>bounds(root).getSize(V()).x)for(const o of root.children)o.geometry.rotateZ(Math.PI/2);
 const b=bounds(root),center=b.getCenter(V()),s=b.getSize(V());
 // Center every asset at its own physical pivot. Normalized bounds now span exactly one per axis.
 for(const o of root.children){const g=o.geometry;g.translate(-center.x,-center.y,-center.z);g.scale(1/Math.max(s.x,1e-8),1/Math.max(s.y,1e-8),1/Math.max(s.z,1e-8));g.computeBoundingSphere();}
 root.name=role;root.userData.native=s.toArray();return root;
}

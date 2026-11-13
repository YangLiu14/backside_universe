// Normalize real Hi3D meshes once. Keep their source UVs, normals, PBR materials and textures.
import * as T from 'three';
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),clamp=T.MathUtils.clamp;
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
// Soft pose weights preserve sleeves and fingers of the source photo-mesh. No frame-to-frame integration.
export function poseActor(root,kind){
 for(const mesh of root.children){const g=mesh.geometry,a=g.attributes.position,delta=new Float32Array(a.count*3);
  for(let i=0;i<a.count;i++){const x=a.getX(i),y=a.getY(i),z=a.getZ(i);
   if(kind==='shooter'){
    // On this scan the forearms project forward of the jersey and below the chin.
    // Rotate about the elbows in physical proportions; the chest and head stay on the torso.
    const arm=T.MathUtils.smoothstep(z,.012,.255)*T.MathUtils.smoothstep(y,.085,.18)*(1-T.MathUtils.smoothstep(y,.335,.385));
    const dy=(y-.17)*1.70,dz=(z-.08)*.46,angle=.54;
    delta[i*3]=0;
    delta[i*3+1]=arm*((Math.cos(angle)-1)*dy+Math.sin(angle)*dz+.095)/1.70;
    delta[i*3+2]=arm*(-Math.sin(angle)*dy+(Math.cos(angle)-1)*dz+.12)/.46;
   }else{
    const leg=1-T.MathUtils.smoothstep(y,-.46,-.02),sign=Math.sign(x||1);
    delta[i*3]=leg*sign*.20;delta[i*3+1]=leg*.035;delta[i*3+2]=leg*sign*.20;
   }
  }
  g.morphTargetsRelative=true;g.morphAttributes.position=[new T.BufferAttribute(delta,3)];mesh.updateMorphTargets();
 }
}
export function applyActor(root,v){for(const m of root.children)if(m.morphTargetInfluences)m.morphTargetInfluences[0]=v;}
export function palmLandmark(root){
 const wanted=V(.14,.288,.44);let best=Infinity,hit;
 eachVertex(root,(p,o,i)=>{const score=p.distanceToSquared(wanted);if(score<best){best=score;hit={rest:p.clone(),delta:V().fromBufferAttribute(o.geometry.morphAttributes.position[0],i)};}});
 if(!hit)throw Error('投篮者模型缺少手部表面');return hit;
}

import * as T from 'three';import {SparkRenderer,SplatMesh} from '@sparkjsdev/spark';
const $=id=>document.getElementById(id);
async function start(){
 const r=await (await fetch('registration.json')).json(),[fx,fy,cx,cy]=r.intrinsics,stage=$('stage'),frame=$('frame');
 const gs=new T.WebGLRenderer({canvas:$('gs'),alpha:true,antialias:false});gs.setPixelRatio(Math.min(devicePixelRatio,1.6));gs.setClearColor(0,0);
 const scene=new T.Scene(),cam=new T.PerspectiveCamera(40,1,.001,90),pivot=new T.Vector3(r.pivot_opencv[0],-r.pivot_opencv[1],-r.pivot_opencv[2]);
 const spark=new SparkRenderer({renderer:gs,enableLod:false,sortRadial:false,blurAmount:.3}),asset=new SplatMesh({url:'source.ply',lod:false,extSplats:true}),axes=new T.Group();axes.rotation.x=Math.PI;axes.add(asset);scene.add(spark,axes);
 await asset.initialized;const n=cam.near;cam.projectionMatrix.makePerspective(-cx*n/fx,(r.width-cx)*n/fx,cy*n/fy,-(r.height-cy)*n/fy,n,cam.far);cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
 function resize(){const box=stage.getBoundingClientRect(),s=Math.min(box.width/r.width,box.height/r.height),w=Math.round(r.width*s),h=Math.round(r.height*s);frame.style.width=w+'px';frame.style.height=h+'px';gs.setSize(w,h,false);}
 function apply(){const v=+$('range').value/100,angle=T.MathUtils.degToRad(v),q=cam.quaternion.setFromAxisAngle(new T.Vector3(0,1,0),angle);cam.position.copy(pivot).negate().applyQuaternion(q).add(pivot);cam.updateMatrixWorld();$('photo').style.opacity=String(Math.max(0,1-Math.abs(v)*2));$('deg').textContent=v.toFixed(2)+'°';}
 new ResizeObserver(resize).observe(stage);resize();apply();await spark.update({scene,camera:cam});gs.render(scene,cam);
 let design=false;const info='这段可拖动的实景由 01D 单张照片重建，观察范围为左右各 3°。';$('status').textContent=info;
 $('range').disabled=false;$('range').oninput=apply;gs.setAnimationLoop(()=>{if(!design)gs.render(scene,cam);});
 function mode(a){design=a;$('art').hidden=!a;$('controls').hidden=a;$('live').setAttribute('aria-pressed',String(!a));$('design').setAttribute('aria-pressed',String(a));$('status').textContent=a?'概念图用于核对材质、窗洞和倒带动作的构图；这张图不是实机三维画面。':info;}
 $('design').onclick=()=>mode(true);$('live').onclick=()=>mode(false);
 let down=null;stage.onpointerdown=e=>{if(design)return;down=[e.clientX,+$('range').value];stage.setPointerCapture(e.pointerId);};stage.onpointermove=e=>{if(!down)return;$('range').value=down[1]+(down[0]-e.clientX)*620/stage.clientWidth;apply();};stage.onpointercancel=stage.onpointerup=()=>down=null;
 const voice=$('voice');$('listen').onclick=()=>{voice.currentTime=0;voice.play().catch(()=>{});};voice.onplay=()=>$('listen').textContent='广播中…';voice.onended=()=>$('listen').textContent='再听一次';window.proofState=()=>({splats:asset.numSplats,angle:+$('range').value/100,pose:cam.matrixWorld.toArray(),design});}
start().catch(e=>{$('status').textContent='实景无法载入：'+e.message;console.error(e);});

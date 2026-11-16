// Inspect all three actors through the real walking, aiming and rewind controls.
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const readline=require('node:readline');
const {playwright,installedBrowser}=require('../../pipeline/verify.cjs');

function assertHandContacts(state){
  const contacts=state.handContacts;
  assert(Array.isArray(contacts)&&contacts.length>=2,'Both actual palm surface contacts must be reported');
  assert(new Set(contacts.map(c=>c.side)).size>=2,'Both hands must have independent surface samples');
  for(const contact of contacts){
    assert(Number.isFinite(contact.gap),'Palm surface gap must be finite');
    assert(Array.isArray(contact.point)&&contact.point.length===3&&contact.point.every(Number.isFinite),'Palm contact must use a real world-space surface point');
    // 25 mm allows palm/finger curvature around the 242 mm basketball; unlike
    // the old algebraic anchor, this must be measured from the skinned surface.
    assert(Math.abs(contact.gap)<=.025,`${contact.side} palm is ${contact.gap} m from the ball surface`);
  }
}
function assertSkeletalActors(state){
  assert(Array.isArray(state.actors)&&state.actors.length===3,'Three characters are present');
  assert.equal(new Set(state.actors.map(a=>a.head)).size,3,'Three independent heads remain');
  for(const actor of state.actors){
    assert(actor.skinnedMeshes>0&&actor.bones>0&&actor.clips>0,'Each character retains skin, bones, and an animation clip');
    assert(Number.isFinite(actor.clipDuration)&&Number.isFinite(actor.declaredClipDuration),'Actual and declared selected-clip durations are reported');
    assert(Math.abs(actor.clipDuration-actor.declaredClipDuration)<=1e-5,'The selected exported clip agrees with its metadata duration');
  }
}
function assertDuration(state){
  assert(Number.isFinite(state.duration)&&state.duration>0,'The runtime declares its complete performance duration');
  return state.duration;
}
function assertShootingMotion(samples){
  const release=samples[0]?.releaseTime;
  assert(Number.isFinite(release),'Shooting motion declares the real release time');
  const wristLimit=95,elbowLimit=45,window=[release+.20,release+.60];
  const sides=new Map(['L','R'].map(side=>[side,{side,maxWristDirectionDegrees:0,maximumAtSeconds:null}]));
  const follow=[];
  const difference=(a,b)=>a.map((value,i)=>value-b[i]);
  const angle=(a,b)=>{
    const lengthA=Math.hypot(...a),lengthB=Math.hypot(...b);
    assert(lengthA>1e-5&&lengthB>1e-5,'Arm and palm directions use distinct actual bone points');
    return Math.acos(Math.max(-1,Math.min(1,a.reduce((sum,value,i)=>sum+value*b[i],0)/(lengthA*lengthB))))*180/Math.PI;
  };
  for(const sample of samples){
    const actor=sample.actors.find(a=>a.id==='shooter');
    assert(actor?.bones,'Every sample retains the shooting skeleton');
    const point=name=>{
      const matrix=actor.bones[name];
      assert(Array.isArray(matrix)&&matrix.length===16&&matrix.every(Number.isFinite),'Actual exported bone is required: '+name);
      return matrix.slice(12,15);
    };
    for(const side of ['L','R']){
      const shoulder=point('UpperArm'+side),elbow=point('Forearm'+side),wrist=point('Hand'+side);
      const bases=['index0','middle0','ring0','pinky0'].map(name=>point(name+side));
      const knuckles=[0,1,2].map(axis=>bases.reduce((sum,p)=>sum+p[axis],0)/bases.length);
      // Direction change: 0° is straight ahead, near 180° folds the palm back
      // over the forearm. This uses actual exported world points, not FK goals.
      const wristDegrees=angle(difference(wrist,elbow),difference(knuckles,wrist));
      const report=sides.get(side);
      if(wristDegrees>report.maxWristDirectionDegrees){report.maxWristDirectionDegrees=wristDegrees;report.maximumAtSeconds=sample.time;}
      if(side==='R'&&sample.time>=window[0]-1e-9&&sample.time<=window[1]+1e-9){
        follow.push({time:sample.time,elbowBendDegrees:angle(difference(elbow,shoulder),difference(wrist,elbow))});
      }
    }
  }
  // Rig-author reviewed limits for THIS throw, not clinical joint ranges.
  // 95° preserves the existing ~76° held-ball wrist bend while rejecting the
  // observed 172° post-release reversal. Only the main throwing arm must extend
  // after its 0.20 s transition; recovery and held-ball poses remain unrestricted.
  for(const side of sides.values())assert(side.maxWristDirectionDegrees<=wristLimit,
    `${side.side} palm reverses over forearm: ${side.maxWristDirectionDegrees} degrees at ${side.maximumAtSeconds} s`);
  assert(follow.length>=20,'The main arm is sampled across the full follow-through window');
  const worst=follow.reduce((a,b)=>a.elbowBendDegrees>b.elbowBendDegrees?a:b);
  assert(worst.elbowBendDegrees<=elbowLimit,
    `Throwing elbow stays folded: ${worst.elbowBendDegrees} degrees at ${worst.time} s`);
  return {wristDirectionLimitDegrees:wristLimit,wrists:[...sides.values()],followThroughWindow:window,
    elbowBendLimitDegrees:elbowLimit,followThroughSamples:follow.length,maximumElbowBendDegrees:worst.elbowBendDegrees,maximumElbowBendAtSeconds:worst.time};
}
const neutralArmLimits={shoulderForeAftMetres:.04,upperArmFromDownDegrees:20,elbowBendDegrees:35,bendFromForwardDegrees:60,elbowFlexorFromForwardDegrees:60,palmToThighDegrees:60};
function assertNeutralArmPose(audit,time){
  // Scene-specific relaxed rest pose, not general anatomical ranges. Chest is
  // independent of clavicles; a shoulder-line basis would hide the old error.
  assert.equal(audit?.method,'actual-chest-relative-neutral-arm-v1','Natural rest requires the independent chest frame and actual elbow surfaces');
  assert.deepEqual(audit.sides.map(s=>s.side).sort(),['L','R'],'Both arm chains are measured');
  for(const s of audit.sides){
    const label=`${s.side} rest arm at ${time} s`;
    for(const key of ['clavicleChestOffset','upperArmRootChestOffset']){
      assert(Array.isArray(s[key]?.residual)&&s[key].residual.length===3&&s[key].residual.every(Number.isFinite),label+' actual shoulder offset');
      assert(Math.abs(s[key].residual[2])<=neutralArmLimits.shoulderForeAftMetres,`${label}: ${key} remains ${s[key].residual[2]} m forward/back of neutral chest position`);
    }
    for(const key of ['upperArmFromDownDegrees','elbowBendDegrees','elbowFlexorFromForwardDegrees','palmToActualThighDegrees','upperArmMaterialRollDegrees'])assert(Number.isFinite(s[key]),label+' finite '+key);
    assert(s.upperArmFromDownDegrees<=neutralArmLimits.upperArmFromDownDegrees,`${label}: upper arm is ${s.upperArmFromDownDegrees} degrees away from hanging down`);
    assert(s.elbowBendDegrees<=neutralArmLimits.elbowBendDegrees,`${label}: elbow remains bent ${s.elbowBendDegrees} degrees`);
    // The bending-plane direction is undefined for an almost straight elbow.
    if(s.elbowBendDegrees>=5){assert(Number.isFinite(s.bendFromForwardDegrees));assert(s.bendFromForwardDegrees<=neutralArmLimits.bendFromForwardDegrees,`${label}: elbow bends ${s.bendFromForwardDegrees} degrees away from forward`);}
    assert(s.elbowFlexorPatch?.vertexCount>=20&&s.elbowTipPatch?.vertexCount>=20&&s.upperArmMaterialVertexCount>=100,label+' retains actual anatomical-side surface coverage');
    assert(s.elbowFlexorFromForwardDegrees<=neutralArmLimits.elbowFlexorFromForwardDegrees,`${label}: actual elbow flexor surface faces ${s.elbowFlexorFromForwardDegrees} degrees away from forward`);
    assert(Array.isArray(s.palmNormalTorso)&&s.palmNormalTorso.every(Number.isFinite)&&Array.isArray(s.actualNearestThighPoint)&&s.actualNearestThighPoint.every(Number.isFinite),label+' palm uses actual ipsilateral thigh segment');
    assert(s.palmToActualThighDegrees<=neutralArmLimits.palmToThighDegrees,`${label}: palm is ${s.palmToActualThighDegrees} degrees away from the actual thigh`);
  }
  return audit;
}
function assertArmRecovery(samples){
  // Forearm pronation is necessary to turn the palm toward the thigh. The old
  // 30-degree material-twist ceiling was not a naturalness test: rejected 69ca
  // had <3 degrees while the approved neutral 883d has normal pronation. Keep
  // real ring diagnostics, and test the complete chest/shoulder/elbow chain.
  const settledStart=3.3,reports=new Map();let frames=0;
  for(const sample of samples){
    if(sample.time<settledStart-1e-8)continue;
    const actor=sample.actors.find(a=>a.id==='shooter'),audit=actor?.armRecovery;
    assert.equal(audit?.method,'actual-skinned-material-rings-v1','Recovery retains actual deformed material diagnostics');
    assert.deepEqual(audit.sides.map(s=>s.side).sort(),['L','R']);
    const rest=assertNeutralArmPose(actor.armRest,sample.time);frames++;
    for(const side of audit.sides){
      assert(side.vertexCount>=100&&side.palmTriangleCount>=3,'Real arm/palm surface coverage required');assert.equal(side.rings.length,5);
      for(const ring of side.rings){assert(ring.vertexCount>=20);for(const key of ['u','materialDegrees','circularResidualDegrees','radialRmsRatio'])assert(Number.isFinite(ring[key]));}
      assert(Number.isFinite(side.materialTwistDegrees));const r=rest.sides.find(s=>s.side===side.side);
      let report=reports.get(side.side);
      if(!report){report={side:side.side,maxAbsMaterialTwistDegrees:0,maxShoulderForeAftResidualMetres:0,maxUpperArmFromDownDegrees:0,maxElbowBendDegrees:0,maxBendFromForwardDegrees:0,maxElbowFlexorFromForwardDegrees:0,maxPalmToActualThighDegrees:0,maxAbsUpperArmMaterialRollDegrees:0,maxRingResidualDegrees:0,minimumRingVertices:Infinity};reports.set(side.side,report);}
      report.maxAbsMaterialTwistDegrees=Math.max(report.maxAbsMaterialTwistDegrees,Math.abs(side.materialTwistDegrees));
      report.maxShoulderForeAftResidualMetres=Math.max(report.maxShoulderForeAftResidualMetres,Math.abs(r.clavicleChestOffset.residual[2]),Math.abs(r.upperArmRootChestOffset.residual[2]));
      for(const [key,value]of Object.entries({maxUpperArmFromDownDegrees:r.upperArmFromDownDegrees,maxElbowBendDegrees:r.elbowBendDegrees,maxBendFromForwardDegrees:r.elbowBendDegrees>=5?r.bendFromForwardDegrees:0,maxElbowFlexorFromForwardDegrees:r.elbowFlexorFromForwardDegrees,maxPalmToActualThighDegrees:r.palmToActualThighDegrees,maxAbsUpperArmMaterialRollDegrees:Math.abs(r.upperArmMaterialRollDegrees)}))report[key]=Math.max(report[key],value);
      report.maxRingResidualDegrees=Math.max(report.maxRingResidualDegrees,...side.rings.map(r=>r.circularResidualDegrees));report.minimumRingVertices=Math.min(report.minimumRingVertices,...side.rings.map(r=>r.vertexCount));
    }
  }
  assert(frames>=20,'Continuous settled frames through the endpoint are required');
  return {settledStart,neutralArmLimits,frames,sides:[...reports.values()],materialTwistNote:'Diagnostic only: absolute forearm pronation does not establish anatomical rest quality.',reference:'Chest bind-relative axes; palms face the nearest point on the actual same-side Thigh–Shin segment.'};
}
async function actorControls(page,out,prefix='desktop'){
  const state=()=>page.evaluate(()=>rewindState());
  const frame=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const stage=await page.locator('#stage').boundingBox(),records=[];
  const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
  async function aim(target){
    for(let i=0;i<5;i++){
      const s=await state(),d=target.map((v,i)=>v-s.eye[i]);
      const yaw=Math.atan2(d[0],-d[2]),pitch=Math.atan2(d[1],Math.hypot(d[0],d[2]));
      const dx=Math.max(-.3,Math.min(.3,wrap(yaw-Math.atan2(-s.pose[8],s.pose[10]))/3.8));
      const dy=Math.max(-.3,Math.min(.3,-(pitch+Math.asin(s.pose[9]))/2.25));
      if(Math.abs(dx)+Math.abs(dy)<.0001)return;
      const x=stage.x+stage.width*.5,y=stage.y+stage.height*.5;
      await page.mouse.move(x,y);await page.mouse.down();
      await page.mouse.move(x+dx*stage.width,y+dy*stage.height,{steps:4});await page.mouse.up();await frame();
    }
  }
  async function walk(x,z){
    const before=await state();await aim([x,before.eye[1],z]);
    const dx=x-before.eye[0],dz=z-before.eye[2],length=Math.hypot(dx,dz);
    if(length<.08)return;
    await page.keyboard.down('KeyW');
    try{await page.waitForFunction(([bx,bz,dx,dz,length])=>{
      const e=rewindState().eye;return ((e[0]-bx)*dx+(e[2]-bz)*dz)/length>=length-.08;
    },[before.eye[0],before.eye[2],dx,dz,length],{timeout:18000});}
    finally{await page.keyboard.up('KeyW');}await frame();
    assert(Math.hypot((await state()).eye[0]-x,(await state()).eye[2]-z)<.42,'Actor inspection route reached its viewpoint');
  }
  async function shot(label,target){
    if(target)await aim(target);await frame();
    await page.screenshot({path:path.join(out,prefix+'-'+label+'.jpg'),type:'jpeg',quality:96});
    records.push({label,...await state()});
  }
  return {state,frame,aim,walk,shot,records};
}
async function inspectActors(page,out,prefix='desktop'){
  const {state,frame,aim,walk,shot,records}=await actorControls(page,out,prefix);
  const duration=assertDuration(await state()),releaseTime=await page.evaluate(()=>rewindMotionSample(0).releaseTime);
  await walk(10.7,3);await walk(10.7,.45);
  await shot('shooter-full',[7.15,.95,.45]);
  await walk(8.2,.45);await shot('shooter-face',[7.15,1.58,.45]);
  await aim([7.4,1.48,.45]);await page.keyboard.down('KeyR');await page.waitForFunction(()=>rewindState().time===0);
  await shot('shooter-in-hand');
  assertHandContacts(await state());
  await page.keyboard.up('KeyR');await page.waitForFunction(t=>rewindState().time>=t,releaseTime+.03);
  await shot('shooter-release',[7.4,1.55,.45]);
  await page.waitForFunction(()=>{const s=rewindState();return s.time===s.duration;});
  await walk(9.6,2.2);await shot('shooter-side',[7.15,1.33,.45]);
  await walk(8.1,1.45);await shot('shooter-recovery-right',[7.15,.94,.45]);
  await walk(8.5,1.45);await walk(8.5,-.65);await walk(8.1,-.65);await shot('shooter-recovery-left',[7.15,.94,.45]);
  await walk(9.6,2.2);
  const students=(await state()).actors.slice(1).map(a=>a.worldPosition);
  assert(students.every(p=>Array.isArray(p)&&p.length===3),'Animated student positions are available for close-up framing');
  const farX=Math.max(...students.map(p=>p[0])),midX=students.reduce((n,p)=>n+p[0],0)/2,midZ=students.reduce((n,p)=>n+p[2],0)/2;
  await walk(farX+2.7,2.2);await walk(farX+2.7,midZ+.2);
  await shot('students-full',[midX,.95,midZ]);
  await walk(students[0][0]+1.17,students[0][2]+.35);await shot('student-bob-face',[students[0][0],1.47,students[0][2]]);
  await walk(students[1][0]+1.22,students[1][2]+.9);await shot('student-ponytail-face',[students[1][0],1.52,students[1][2]]);
  await walk(farX+1.72,midZ+2.1);await shot('students-side',[midX,1,midZ]);
  await aim([midX-.8,.9,midZ]);await page.keyboard.down('KeyR');await page.waitForFunction(t=>rewindState().time<t,duration*.55);
  await shot('students-rewind');
  await page.waitForFunction(()=>rewindState().time===0);
  await page.keyboard.up('KeyR');await page.waitForFunction(()=>{const s=rewindState();return s.time===s.duration;});
  const s=await state();
  assertSkeletalActors(s);
  assert(s.actors.every(a=>a.removedHeadTriangles>10000),'Old heads remain removed');
  if(s.actors[0].sourceReplaced===true){
    assert.equal(s.actors[0].noDetachedHandFragments,true,'The replacement body has an inspected clean hand region');
  }else{
    assert(s.actors[0].removedDebrisTriangles>0,'The original detached hand fragment remains removed');
  }
  assert(s.actors.slice(1).every(a=>Math.abs(a.yaw-Math.PI/2)<1e-6),'Students face their path');
  await fs.writeFile(path.join(out,prefix+'-actor-views.json'),JSON.stringify(records,null,2));
  return records.map(({label,eye,pose,time})=>({label,eye,pose,time}));
}
module.exports={inspectActors,actorControls,assertHandContacts,assertSkeletalActors,assertShootingMotion,assertArmRecovery,assertNeutralArmPose,assertDuration};
async function main(){
  const [site,out]=process.argv.slice(2);await fs.mkdir(out,{recursive:true});
  const server=spawn('python3',['-u','-c','from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler\ns=ThreadingHTTPServer(("127.0.0.1",0),SimpleHTTPRequestHandler)\nprint(s.server_port,flush=True);s.serve_forever()'],{cwd:site,stdio:['ignore','pipe','ignore']});
  let browser;const errors=[];
  try{
    const [port]=await once(readline.createInterface({input:server.stdout}),'line');
    browser=await playwright().chromium.launch({headless:true,executablePath:await installedBrowser(),args:['--use-angle=metal']});
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(/Shader Error|VALIDATE_STATUS/.test(m.text()))errors.push(m.text());});
    await page.goto('http://127.0.0.1:'+port);
    await page.waitForFunction(()=>typeof rewindState==='function',{},{timeout:120000});
    await page.locator('#progress').fill('1000');await page.locator('#enter').click();
    assertDuration(await page.evaluate(()=>rewindState()));
    await page.waitForFunction(()=>{const s=rewindState();return s.time===s.duration;});
    await page.locator('#yard').click();await page.waitForFunction(()=>rewindState().tour==='court');
    await inspectActors(page,out);assert.deepEqual(errors,[]);console.log('PASS actor inspection',out);
  }finally{if(browser)await browser.close();server.kill();}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});

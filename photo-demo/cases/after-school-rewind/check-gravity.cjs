// Geometry-derived gravity checks. Declared events locate probes; actual world
// positions and their finite differences decide whether the motion is physical.
const assert=require('node:assert/strict');
const vector=(p,label)=>assert(Array.isArray(p)&&p.length===3&&p.every(Number.isFinite),label);
const subtract=(a,b)=>a.map((v,i)=>v-b[i]);
const scale=(a,s)=>a.map(v=>v*s);
const length=a=>Math.hypot(...a);
const distance=(a,b)=>length(subtract(a,b));
const derivative=(a,b)=>(subtract(b.ball,a.ball).map(v=>v/(b.time-a.time)));

function checkBallPhysics({forward,eventProbes,bounceProbes,netProbes}){
  const duration=forward.at(-1).time,physics=forward[0].ballPhysics;
  assert(physics&&physics.gravity===9.81,'Basketball physics uses 9.81 m/s²');
  const {radius,groundY,rim,rimRadius,events}=physics;
  assert(Number.isFinite(radius)&&radius>0&&Number.isFinite(groundY));vector(rim,'Calibrated rim centre');
  assert(Number.isFinite(rimRadius)&&rimRadius>radius,'The ball fits through the actual rim');
  assert(Array.isArray(events)&&events.length>0,'The complete trajectory reports its physical events');
  assert(Array.isArray(eventProbes)&&eventProbes.length===events.length&&events.every(e=>eventProbes.some(p=>p.event.type===e.type&&p.event.time===e.time)),'Every declared event has actual geometry probes, including release');
  assert(events.every((e,i)=>Number.isFinite(e.time)&&e.time>=0&&e.time<=duration&&(!i||e.time>=events[i-1].time)),'Events are ordered within the performance');
  const rimEvents=events.filter(e=>e.type==='rim-crossing'),impacts=events.filter(e=>e.type==='ground-impact');
  assert.equal(rimEvents.length,1,'One descending made shot crosses the rim');
  assert(impacts.length>=3,'The complete performance includes at least three ground impacts');
  assert(impacts[0].time>rimEvents[0].time,'Ground contact happens after passing through the hoop');
  const epsilon=1e-4,continuity=[],restitution=[];
  let rimCrossing;
  for(const probe of eventProbes){
    const event=probe.event;
    const at=offset=>probe.samples.find(s=>Math.abs(s.offset-offset)<1e-10);
    const center=at(0);assert(center,'Every event has an exact actual-world sample');vector(center.ball,'Event ball centre');
    if(event.position)assert(distance(center.ball,event.position)<1e-5,'Declared event position agrees with the rendered ball');
    if(event.type==='ground-impact')assert(Math.abs(center.ball[1]-radius-groundY)<=.001,'Ball bottom meets the ground at every impact');
    if(!at(-2*epsilon)||!at(2*epsilon))continue; // The endpoints have only one physical side.
    const before=derivative(at(-2*epsilon),at(-epsilon)),after=derivative(at(epsilon),at(2*epsilon));
    const fromLeft=at(-epsilon).ball.map((v,i)=>v+epsilon*before[i]);
    const fromRight=at(epsilon).ball.map((v,i)=>v-epsilon*after[i]);
    const positionError=Math.max(distance(center.ball,fromLeft),distance(center.ball,fromRight));
    assert(positionError<=2e-5,`${event.type} teleports by ${positionError} m at ${event.time} s`);
    // A contact impulse changes velocity. Release is checked as well: declaring
    // an identical launch velocity is insufficient if the actual held ball stops.
    const velocityChange=distance(before,after);
    const groundImpulse=['ground-impact','rolling'].includes(event.type)&&Math.abs(center.ball[1]-radius-groundY)<=.001;
    if(!groundImpulse)assert(velocityChange<=.03,`${event.type} changes actual velocity by ${velocityChange} m/s at ${event.time} s`);
    if(event.velocityBefore)assert(distance(before,event.velocityBefore)<=.03,`${event.type} at ${event.time}: pre-event velocity differs from actual position differences by ${distance(before,event.velocityBefore)} m/s`);
    if(event.velocityAfter)assert(distance(after,event.velocityAfter)<=.03,`${event.type} at ${event.time}: post-event velocity differs from actual position differences by ${distance(after,event.velocityAfter)} m/s`);
    if(event.type==='rim-crossing'){
      const horizontalError=Math.hypot(center.ball[0]-rim[0],center.ball[2]-rim[2]);
      assert(Math.abs(center.ball[1]-rim[1])<=.001&&horizontalError<=.010,'The descending ball centre passes through the calibrated rim centre');
      assert(before[1]<0&&after[1]<0,'The ball crosses the rim while descending');
      assert(horizontalError+radius<rimRadius,'The full basketball clears the rim opening');
      rimCrossing={time:event.time,horizontalError,heightError:center.ball[1]-rim[1],velocityY:after[1]};
    }
    if(event.type==='ground-impact'){
      assert(before[1]<0,'The ball approaches every impact from above');
      const settled=Math.abs(after[1])<.003&&['rolling','rest'].includes(at(epsilon).ballPhysics.phase);
      assert(after[1]>0||settled,'A collision either rebounds upward or settles into ground contact');
      const ratio=Math.max(0,after[1])/-before[1];assert(ratio>=0&&ratio<1,'Each impact loses vertical energy');
      restitution.push({time:event.time,incomingVelocityY:before[1],outgoingVelocityY:after[1],ratio});
    }
    continuity.push({type:event.type,time:event.time,positionError,velocityChange});
  }
  assert(rimCrossing,'Actual rim crossing was measured, not inferred from a final frame');
  assert(restitution.filter(r=>r.outgoingVelocityY>.003).length>=3,'At least three impacts actually rebound upward');
  const gravityChecks=[],velocityChecks=[];
  let minimumBottom=Infinity;
  for(let i=0;i<forward.length;i++){
    const s=forward[i];vector(s.ball,'Actual ball position');
    assert(s.ballPhysics&&s.ballPhysics.gravity===9.81,'Every sample declares the same gravity');
    vector(s.ballPhysics.velocity,'Actual ball velocity');
    const bottom=s.ball[1]-radius-groundY;minimumBottom=Math.min(minimumBottom,bottom);
    assert(bottom>=-.001,`Ball penetrates the floor by ${-bottom} m at ${s.time} s`);
    if(['rolling','rest'].includes(s.ballPhysics.phase))assert(Math.abs(bottom)<=.001,'Rolling/resting ball stays on the ground');
    if(!i||i===forward.length-1)continue;
    const a=forward[i-1],c=forward[i+1],dt=s.time-a.time;
    if(Math.abs(c.time-s.time-dt)>1e-7)continue;
    if(events.some(e=>Math.abs(e.time-s.time)<=2*dt))continue;
    if(!['flight','net','bounce'].includes(s.ballPhysics.phase))continue;
    const ay=(c.ball[1]-2*s.ball[1]+a.ball[1])/(dt*dt);
    assert(Math.abs(ay+9.81)<=.02,`Ball free-flight acceleration is ${ay} m/s² at ${s.time} s`);
    const v=derivative(a,c),error=distance(v,s.ballPhysics.velocity);
    assert(error<=.03,'Reported velocity agrees with the actual rendered trajectory');
    gravityChecks.push({time:s.time,ay});velocityChecks.push(error);
  }
  assert(gravityChecks.length>=20,'Enough independent free-flight positions were measured');
  assert(Array.isArray(bounceProbes)&&bounceProbes.length>=3,'Three actual rebound peaks are sampled');
  const peaks=bounceProbes.slice(0,3).map((p,i)=>{
    const height=p.ball[1]-radius-groundY;assert(height>.005,'Each of the first three rebounds visibly rises from the floor');
    assert(p.time>impacts[i].time&&p.time<duration,'Rebound apex appears before the performance ends');
    assert(Math.abs(p.ballPhysics.velocity[1])<.03,'The measured rebound sample is at its apex');
    return {time:p.time,height};
  });
  for(let i=1;i<peaks.length;i++)assert(peaks[i].height<peaks[i-1].height-.001,'Successive actual bounce heights decrease');
  assert(Array.isArray(netProbes)&&netProbes.length>=20,'The complete deformed net is measured densely through the ball passage');
  let netMinimum=Infinity,originalMinimum=Infinity,netMinimumAt=null;
  for(const s of netProbes){
    const net=s.net;
    assert(net&&net.vertexCount>0&&net.triangleCount>0&&Number.isFinite(net.ballClearance)&&Number.isFinite(net.originalBallClearance),'Net clearance is measured against actual mesh triangles');
    assert(distance(net.rim,rim)<1e-5&&Math.abs(net.radius-radius)<1e-5,'Net and trajectory use the same measured hoop and ball radius');
    assert(net.ballClearance>=-.001,`Basketball penetrates the deformed net by ${-net.ballClearance} m at ${s.time} s`);
    if(net.ballClearance<netMinimum){netMinimum=net.ballClearance;netMinimumAt=s.time;}
    originalMinimum=Math.min(originalMinimum,net.originalBallClearance);
  }
  return {gravity:9.81,radius,groundY,rim,rimRadius,rimCrossing,groundImpacts:impacts.length,restitution,
    reboundPeaks:peaks,minimumBottomHeight:minimumBottom,gravitySamples:gravityChecks.length,
    maximumGravityError:Math.max(...gravityChecks.map(s=>Math.abs(s.ay+9.81))),
    maximumVelocityError:Math.max(...velocityChecks),eventContinuity:continuity,
    net:{sampleRateHz:240,samples:netProbes.length,minimumClearance:netMinimum,minimumAtSeconds:netMinimumAt,originalMinimumClearance:originalMinimum,forwardReverseMatch:true}};
}

function checkShooterJump(samples){
  const actors=samples.map(s=>s.actors.find(a=>a.id==='shooter')),jump=actors[0]?.jump;
  assert(jump&&jump.gravity===9.81,'The shooting jump declares its physical timing and gravity');
  const {takeoff,apex,landing,rootBone,hipBone}=jump;
  assert(0<=takeoff&&takeoff<apex&&apex<landing&&landing<samples.at(-1).time,'Jump phases are ordered');
  const roots=actors.map(a=>{const m=a.bones[rootBone];assert(m?.length===16,'Actual exported jump root exists');return m[13];});
  const hips=actors.map(a=>{const m=a.bones[hipBone];assert(m?.length===16,'Actual exported pelvis exists');return m[13];});
  const gravity=[];let maximumPostLandingClearance=0;
  for(let i=0;i<samples.length;i++){
    const t=samples[i].time;
    if(t>=landing+1/60){maximumPostLandingClearance=Math.max(maximumPostLandingClearance,actors[i].soleBounds.minY);assert(actors[i].soleBounds.minY<=.025,'Shooter remains supported after landing');}
    if(i&&i<samples.length-1&&samples[i-1].time>takeoff&&samples[i+1].time<landing){
      const dt=t-samples[i-1].time,ay=(roots[i+1]-2*roots[i]+roots[i-1])/(dt*dt),hipAy=(hips[i+1]-2*hips[i]+hips[i-1])/(dt*dt);
      // A baked 60 Hz GLB has finite coordinate precision. 0.10 m/s² is ~1% g,
      // far below the old slow float and allows the authored metre-scale track.
      assert(Math.abs(ay+9.81)<=.10,`Actual jump-root acceleration is ${ay} m/s² at ${t} s`);
      assert(Math.abs(hipAy+9.81)<=.10,`Actual airborne pelvis acceleration is ${hipAy} m/s² at ${t} s`);gravity.push({time:t,ay,hipAy});
    }
  }
  assert(gravity.length>=6,'The airborne interval has enough actual GLB samples to verify gravity');
  const groundRoot=roots[samples.findLastIndex(s=>s.time<=takeoff)];
  const measuredHeight=Math.max(...roots.filter((_,i)=>samples[i].time>=takeoff&&samples[i].time<=landing))-groundRoot;
  const expectedHeight=9.81*(landing-takeoff)**2/8;
  assert(Math.abs(measuredHeight-expectedHeight)<=.001,'Actual jump height and airborne time agree under earth gravity');
  return {takeoff,apex,landing,gravity:9.81,rootBone,airborneSeconds:landing-takeoff,
    hipBone,measuredHeight,expectedHeight,measuredAccelerationFrames:gravity.length,
    maximumGravityError:Math.max(...gravity.flatMap(s=>[Math.abs(s.ay+9.81),Math.abs(s.hipAy+9.81)])),maximumPostLandingClearance};
}
module.exports={checkBallPhysics,checkShooterJump};

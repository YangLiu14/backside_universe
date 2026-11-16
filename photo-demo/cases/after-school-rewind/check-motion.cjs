// Continuous rendered evidence and geometry checks for the real skinned actors.
// Run only against a built candidate with rewindMotionSample; a static/morph-only
// release must fail rather than acquire a new motion-quality approval.
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {spawn,execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {once}=require('node:events');
const readline=require('node:readline');
const exec=promisify(execFile);
const {playwright,installedBrowser}=require('../../pipeline/verify.cjs');
const {actorControls,assertHandContacts,assertSkeletalActors,assertShootingMotion,assertArmRecovery,assertDuration}=require('./check-actors.cjs');
const {checkBallPhysics,checkShooterJump}=require('./check-gravity.cjs');

function compareSample(a,b,label,tolerance=1e-6){
  if(typeof a==='number'){
    assert(Number.isFinite(a)&&Number.isFinite(b),label+' contains non-finite numbers');
    assert(Math.abs(a-b)<=tolerance,`${label}: ${a} != ${b}`);return;
  }
  if(a===null||typeof a!=='object'){assert.equal(a,b,label);return;}
  assert(b&&typeof b==='object',label+' is missing');
  assert.deepEqual(Object.keys(a).sort(),Object.keys(b).sort(),label+' structure differs');
  for(const key of Object.keys(a))compareSample(a[key],b[key],label+'.'+key,tolerance);
}
function checkContacts(samples){
  const runs=new Map(),actors=new Set(),soles=new Map();
  for(const sample of samples){
    for(const actor of sample.actors){
      assert(Array.isArray(actor.root)&&actor.root.length===3&&actor.root.every(Number.isFinite));
      assert(actor.bones&&Object.keys(actor.bones).length>0,'Sample retains actual bone matrices');
      for(const matrix of Object.values(actor.bones))assert(Array.isArray(matrix)&&matrix.length===16&&matrix.every(Number.isFinite));
      assert(actor.id==='shooter'||actor.id.startsWith('walker-'),'Known character identity is required');
      actors.add(actor.id);
      const bounds=actor.soleBounds;
      assert(bounds&&bounds.vertexCount>0&&Number.isFinite(bounds.minY)&&Number.isFinite(bounds.maxY),'Every character reports the full deformed shoe-region height bounds');
      assert(bounds.maxY>=bounds.minY,'Shoe bounds are ordered');
      if(!soles.has(actor.id))soles.set(actor.id,{actor:actor.id,vertexCount:bounds.vertexCount,minimumHeight:Infinity,minimumAtSeconds:null,maximumSoleClearance:-Infinity,maximumClearanceAtSeconds:null});
      const sole=soles.get(actor.id);
      if(bounds.minY<sole.minimumHeight){sole.minimumHeight=bounds.minY;sole.minimumAtSeconds=sample.time;}
      if(bounds.minY>sole.maximumSoleClearance){sole.maximumSoleClearance=bounds.minY;sole.maximumClearanceAtSeconds=sample.time;}
      assert(Array.isArray(actor.contacts)&&actor.contacts.length>=2,'Each character exposes fixed sole surface samples');
      for(const contact of actor.contacts){
        assert(Array.isArray(contact.position)&&contact.position.length===3&&contact.position.every(Number.isFinite));
        if(!contact.planted)continue;
        assert(contact.id&&contact.side&&contact.contactId!==undefined,'Contact identity/side/stance interval are required');
        const key=[actor.id,contact.side,contact.id,contact.contactId].join('/');
        if(!runs.has(key))runs.set(key,{actor:actor.id,side:contact.side,id:contact.id,contactId:contact.contactId,points:[],times:[]});
        runs.get(key).points.push(contact.position);runs.get(key).times.push(sample.time);
      }
    }
  }
  assert.equal([...actors].filter(id=>id.startsWith('walker-')).length,2,'Both walking characters are measured');
  for(const sole of soles.values()){
    assert(sole.minimumHeight>=-.005,`${sole.actor} shoe penetrates ground by ${-sole.minimumHeight} m at ${sole.minimumAtSeconds} s`);
    // Slow walking has a supporting foot throughout the cycle. The lowest
    // actual vertex of BOTH complete shoe regions must stay within 25 mm of
    // ground, including heel/toe handover outside labelled fixed contacts.
    if(sole.actor.startsWith('walker-'))assert(sole.maximumSoleClearance<=.025,`${sole.actor} both shoes leave ground: ${sole.maximumSoleClearance} m clearance at ${sole.maximumClearanceAtSeconds} s`);
  }
  const reports=[];
  for(const run of runs.values()){
    if(run.times.at(-1)-run.times[0]<.12)continue;
    const first=run.points[0],heights=run.points.map(p=>p[1]);
    const maxPlanarDrift=Math.max(...run.points.map(p=>Math.hypot(p[0]-first[0],p[2]-first[2])));
    const heightRange=Math.max(...heights)-Math.min(...heights);
    // Project gates in metres: <=10 mm support-point drift, <=15 mm vertical
    // variation. IDs must split heel/toe rolling contacts instead of declaring
    // a rolling heel fixed. These are quality gates, not mocap-source filters.
    assert(maxPlanarDrift<=.010,`${run.actor}/${run.side}/${run.contactId} slips ${maxPlanarDrift} m`);
    assert(heightRange<=.015,`${run.actor}/${run.side}/${run.contactId} changes support height ${heightRange} m`);
    assert(Math.min(...heights)>=-.005&&Math.max(...heights)<=.025,`${run.actor}/${run.side} sole contact leaves the ground plane`);
    reports.push({...run,points:undefined,times:undefined,start:run.times[0],end:run.times.at(-1),samples:run.times.length,maxPlanarDrift,heightRange,minimumHeight:Math.min(...heights),maximumHeight:Math.max(...heights)});
  }
  for(const actor of actors)assert(new Set(reports.filter(r=>r.actor===actor).map(r=>r.side)).size===2,actor+' needs a measured support interval for each foot');
  return {supports:reports,soles:[...soles.values()]};
}
async function inspectMotionNumbers(page,out,prefix){
  const payload=await page.evaluate(()=>{
    if(typeof window.rewindMotionSample!=='function')throw Error('Built candidate does not expose actual skinned motion samples');
    const before=rewindState();
    const sample=t=>JSON.parse(JSON.stringify(rewindMotionSample(t)));
    const duration=before.duration;
    if(!Number.isFinite(duration)||duration<=0)throw Error('Runtime performance duration is missing');
    const times=Array.from({length:Math.ceil(duration*60)},(_,i)=>i/60);times.push(duration);
    const forward=times.map(sample),reverse=[...times].reverse().map(sample);
    const indices=[0,1,.3125,.125,.9375,.5,.3125,1,0].map(v=>Math.round(v*(times.length-1)));
    const jumps=indices.map(i=>sample(times[i]));
    const events=forward[0].ballPhysics?.events;
    if(!Array.isArray(events))throw Error('Actual ball trajectory events are missing');
    const ballSample=t=>{const s=sample(t);return {time:s.time,ball:s.ball,ballPhysics:s.ballPhysics,net:s.net};};
    const eventProbes=events.map(event=>({event,samples:[-2e-4,-1e-4,0,1e-4,2e-4].filter(d=>event.time+d>=0&&event.time+d<=duration).map(offset=>({offset,...ballSample(event.time+offset)}))}));
    const bounceProbes=events.filter(e=>e.type==='ground-impact'&&e.velocityAfter[1]>0).slice(0,3).map(e=>ballSample(e.time+e.velocityAfter[1]/forward[0].ballPhysics.gravity));
    const netStart=Math.max(0,events.find(e=>e.type==='rim-crossing').time-.06),netEnd=Math.min(duration,events.find(e=>e.type==='net-exit').time+.08);
    const netTimes=Array.from({length:Math.ceil((netEnd-netStart)*240)},(_,i)=>netStart+i/240);netTimes.push(netEnd);
    const netProbes=netTimes.map(ballSample),netReverse=[...netTimes].reverse().map(ballSample);
    const after=rewindState();
    return {before,after,forward,reverse,jumps,eventProbes,bounceProbes,netProbes,netReverse};
  });
  await fs.writeFile(path.join(out,prefix+'-motion-samples.json'),JSON.stringify(payload,null,2));
  // Sampling is diagnostic: it must leave the actual clock, camera and displayed
  // characters untouched. Both states are read in the same browser task.
  for(const key of ['time','pose','actors','ball','duration','releaseTime','ballPhysics'])compareSample(payload.before[key],payload.after[key],'restored.'+key);
  assertSkeletalActors(payload.before);
  const duration=assertDuration(payload.before),count=payload.forward.length;
  assertDuration(payload.after);
  for(let i=0;i<count;i++)compareSample(payload.forward[i],payload.reverse[count-1-i],'reverse.'+i);
  for(const sample of payload.jumps)compareSample(sample,payload.forward.find(s=>s.time===sample.time),'jump.'+sample.time);
  for(let i=0;i<payload.netProbes.length;i++)compareSample(payload.netProbes[i],payload.netReverse[payload.netProbes.length-1-i],'net.reverse.'+i);
  let heldFrames=0,maxHandSurfaceGap=0;
  for(const sample of payload.forward){
    assert.deepEqual(sample.actors.map(actor=>actor.id).sort(),['shooter','walker-0','walker-1'],'Every full-scene sample retains all three actors');
    assert.equal(assertDuration(sample),duration,'Every sample uses the same complete duration');
    assert(Number.isFinite(sample.releaseTime)&&sample.releaseTime>0&&sample.releaseTime<duration,'A real release time is reported');
    assert.equal(sample.holding,sample.time<=sample.releaseTime,'Holding state agrees with the release instant');
    if(!sample.holding)continue;
    assertHandContacts(sample);heldFrames++;
    maxHandSurfaceGap=Math.max(maxHandSurfaceGap,...sample.handContacts.map(c=>Math.abs(c.gap)));
  }
  assert(heldFrames>1,'Contact evidence covers a holding interval, not a single frame');
  const shootingPose=assertShootingMotion(payload.forward),armRecovery=assertArmRecovery(payload.forward);
  const feet=checkContacts(payload.forward);
  const basketball=checkBallPhysics(payload),jump=checkShooterJump(payload.forward);
  const trajectoryBounds={min:[0,1,2].map(i=>Math.min(...payload.forward.map(s=>s.ball[i]))),max:[0,1,2].map(i=>Math.max(...payload.forward.map(s=>s.ball[i])))};
  const report={sampleRateHz:60,samples:count,durationSeconds:duration,boneMatrixTolerance:1e-6,normalReverseAndRandomSeekMatch:true,diagnosticSamplingRestoresLiveState:true,holdingFrames:heldFrames,releaseTime:payload.forward[0].releaseTime,maxHandSurfaceGap,handContacts:payload.forward[0].handContacts,shootingPose,armRecovery,contacts:feet.supports,soleBounds:feet.soles,basketball,jump,trajectoryBounds};
  await fs.writeFile(path.join(out,prefix+'-motion-metrics.json'),JSON.stringify(report,null,2));
  return {report,endpoints:[payload.forward[0],payload.forward.at(-1)]};
}
async function startRecording(page){
  await page.evaluate(()=>{
    if(window.__motionEvidenceRecorder)throw Error('A motion recording is already active');
    const canvas=document.getElementById('mesh');
    if(!(canvas instanceof HTMLCanvasElement))throw Error('Scene canvas is absent');
    const mime=['video/webm;codecs=vp8','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));
    if(!mime)throw Error('WebM MediaRecorder is unavailable');
    const stream=canvas.captureStream(30),recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:8000000});
    const chunks=[],frames=[];let raf;
    const observe=now=>{frames.push({wallMs:now,time:rewindState().time});raf=requestAnimationFrame(observe);};
    const done=new Promise((resolve,reject)=>{
      recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      recorder.onerror=e=>reject(Error(e.error?.message||'MediaRecorder failed'));
      recorder.onstop=()=>{cancelAnimationFrame(raf);for(const track of stream.getTracks())track.stop();const reader=new FileReader();reader.onload=()=>resolve({base64:reader.result.split(',')[1],mime,width:canvas.width,height:canvas.height,frames});reader.onerror=()=>reject(Error('Cannot read recorded media'));reader.readAsDataURL(new Blob(chunks,{type:mime}));};
    });
    window.__motionEvidenceRecorder={recorder,done};recorder.start(250);raf=requestAnimationFrame(observe);
  });
}
async function stopRecording(page){
  return page.evaluate(async()=>{
    const state=window.__motionEvidenceRecorder;if(!state)throw Error('No active recording');
    state.recorder.stop();try{return await state.done;}finally{delete window.__motionEvidenceRecorder;}
  });
}
async function recordPerformance(page,out,prefix,label){
  const performanceDuration=assertDuration(await page.evaluate(()=>rewindState()));
  await page.locator('#stage').focus();await page.keyboard.down('KeyR');
  try{await page.waitForFunction(()=>rewindState().time===0,null,{timeout:Math.max(10000,performanceDuration*1000+5000)});}
  catch(error){await page.keyboard.up('KeyR');throw error;}
  await startRecording(page);await page.waitForTimeout(150);
  await page.keyboard.up('KeyR');
  try{await page.waitForFunction(()=>{const s=rewindState();return s.time===s.duration;},null,{timeout:performanceDuration*1000+8000});await page.waitForTimeout(200);}
  catch(error){await stopRecording(page).catch(()=>{});throw error;}
  const capture=await stopRecording(page),file=path.join(out,`${prefix}-${label}.webm`),normal=path.join(out,`${prefix}-${label}.mp4`),slow=path.join(out,`${prefix}-${label}-slow.mp4`);
  await fs.writeFile(file,Buffer.from(capture.base64,'base64'));
  await exec('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',file,'-an','-vf','pad=ceil(iw/2)*2:ceil(ih/2)*2','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',normal]);
  await exec('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',file,'-an','-vf','pad=ceil(iw/2)*2:ceil(ih/2)*2,setpts=4*(PTS-STARTPTS),fps=30','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',slow]);
  const {stdout}=await exec('ffprobe',['-v','error','-count_frames','-select_streams','v:0','-show_frames','-show_entries','frame=best_effort_timestamp_time:stream=width,height,nb_read_frames,avg_frame_rate:format=duration','-of','json',file]);
  const probe=JSON.parse(stdout),decodedFrames=Number(probe.streams[0].nb_read_frames),timestamps=probe.frames.map(f=>Number(f.best_effort_timestamp_time)).filter(Number.isFinite);
  // MediaRecorder WebM may omit the duration header; packet timestamps still
  // provide the actual recorded span, without inventing a playback duration.
  const duration=Number(probe.format.duration)||timestamps.at(-1)-timestamps[0]+1/30;
  assert(decodedFrames>=performanceDuration*15&&duration>=performanceDuration,'Motion evidence needs a continuous full performance at least 15 decoded frames per second, not isolated screenshots');
  const times=capture.frames.map(f=>f.time);assert(Math.min(...times)===0&&Math.max(...times)===performanceDuration,'Rendered capture covers the complete declared performance');
  const report={label,file:path.basename(file),normalFile:path.basename(normal),normalPlaybackRate:1,slowFile:path.basename(slow),slowPlaybackRate:.25,width:capture.width,height:capture.height,decodedFrames,durationSeconds:duration,performanceDuration,renderFrames:capture.frames.length,timeline:capture.frames};
  await fs.writeFile(path.join(out,`${prefix}-${label}-capture.json`),JSON.stringify(report,null,2));
  return report;
}
async function inspectMotion(page,out,prefix='desktop'){
  assert.equal((await page.evaluate(()=>rewindState())).tour,'court','Enter court through the real portal before inspection');
  const numeric=await inspectMotionNumbers(page,out,prefix),c=await actorControls(page,out,prefix),records=[];
  const first=numeric.endpoints[0],last=numeric.endpoints[1];
  const shooter=first.actors.find(a=>a.id==='shooter').root;
  await c.walk(10.7,3);await c.walk(shooter[0]+3.5,shooter[2]);await c.aim([shooter[0],.95,shooter[2]]);
  records.push(await recordPerformance(page,out,prefix,'motion-shooter-front'));
  await c.walk(shooter[0]+1.20,shooter[2]+.90);await c.aim([shooter[0]+.15,1.48,shooter[2]]);
  records.push(await recordPerformance(page,out,prefix,'motion-shooter-hands'));
  await c.walk(shooter[0]+1.20,shooter[2]-.90);await c.aim([shooter[0]+.15,1.48,shooter[2]]);
  records.push(await recordPerformance(page,out,prefix,'motion-shooter-hands-left'));
  await c.walk(shooter[0]+2.3,shooter[2]+2.5);await c.aim([shooter[0],1.0,shooter[2]]);
  records.push(await recordPerformance(page,out,prefix,'motion-shooter-side'));
  await c.walk(shooter[0]+.95,shooter[2]+1.0);await c.aim([shooter[0],.94,shooter[2]]);
  records.push(await recordPerformance(page,out,prefix,'motion-shooter-recovery-right'));
  await c.walk(shooter[0]+1.35,shooter[2]+1.0);await c.walk(shooter[0]+1.35,shooter[2]-1.1);await c.walk(shooter[0]+.95,shooter[2]-1.1);await c.aim([shooter[0],.94,shooter[2]]);
  records.push(await recordPerformance(page,out,prefix,'motion-shooter-recovery-left'));
  await c.walk(shooter[0]+2.3,shooter[2]+2.5);
  const students=[...first.actors,...last.actors].filter(a=>a.id.startsWith('walker-')).map(a=>a.root);
  const minX=Math.min(...students.map(p=>p[0])),maxX=Math.max(...students.map(p=>p[0]));
  const midX=(minX+maxX)/2,midZ=students.reduce((n,p)=>n+p[2],0)/students.length;
  // Side view covers the full root path at the actual candidate's stride length.
  // projection[0] includes the actual portrait/landscape camera aspect and FOV.
  // A fixed desktop distance cuts off the start/end of a walk on narrow screens.
  const horizontalProjection=(await c.state()).projection[0];
  // Use the far side of the walkers so the shooter cannot occlude their feet.
  const sideDistance=Math.max(5.5,(maxX-minX+1.3)*horizontalProjection*.56);
  await c.walk(maxX+2.0,2.2);await c.walk(maxX+2.0,midZ-sideDistance);await c.walk(midX,midZ-sideDistance);await c.aim([midX,.9,midZ]);
  records.push(await recordPerformance(page,out,prefix,'motion-students-side'));
  await c.walk(maxX+3.8,midZ);await c.aim([midX,.9,midZ]);
  records.push(await recordPerformance(page,out,prefix,'motion-students-front'));
  // This closer view shows the feet passing the camera over complete strides;
  // the wider side view above already covers the whole path. It also stays
  // behind the stationary shooter rather than walking through his collider.
  await c.walk(maxX+3.8,midZ+sideDistance);await c.walk(midX,midZ+2.8);await c.aim([midX,.18,midZ]);
  records.push(await recordPerformance(page,out,prefix,'motion-students-feet'));
  // Keep the rim, ground impacts and the whole measured ball path visible from
  // a real reachable side-court viewpoint. The actor close-ups do not replace it.
  const bounds=numeric.report.trajectoryBounds,midBall=bounds.min.map((v,i)=>(v+bounds.max[i])/2);
  const projection=(await c.state()).projection;
  const ballDistance=Math.max(8,(bounds.max[0]-bounds.min[0])*projection[0]/2+3,(bounds.max[1]-bounds.min[1])*projection[5]/2+3);
  await c.walk(Math.max(maxX,bounds.max[0])+3.8,2.2);
  await c.walk(Math.max(maxX,bounds.max[0])+3.8,midBall[2]+ballDistance);
  await c.walk(midBall[0],midBall[2]+ballDistance);await c.aim(midBall);
  records.push(await recordPerformance(page,out,prefix,'motion-ball-hoop-bounces'));
  const report={numeric:numeric.report,recordings:records.map(({timeline,...r})=>r),note:'Numerical gates and continuous recordings are evidence; final naturalness still requires visual review of normal and 0.25x playback.'};
  await fs.writeFile(path.join(out,prefix+'-motion-report.json'),JSON.stringify(report,null,2));return report;
}
exports.inspectMotion=inspectMotion;
exports.recordPerformance=recordPerformance;
exports.inspectMotionNumbers=inspectMotionNumbers;
exports.checkContacts=checkContacts;
exports.compareSample=compareSample;
async function main(){
  const [site,out,prefix='desktop']=process.argv.slice(2);assert(site&&out,'Usage: node check-motion.cjs RELEASE_DIR OUTPUT_DIR [desktop|mobile]');await fs.mkdir(out,{recursive:true});
  const server=spawn('python3',['-u','-c','from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler\ns=ThreadingHTTPServer(("127.0.0.1",0),SimpleHTTPRequestHandler)\nprint(s.server_port,flush=True);s.serve_forever()'],{cwd:site,stdio:['ignore','pipe','ignore']});
  let browser;const errors=[];
  try{
    const [port]=await once(readline.createInterface({input:server.stdout}),'line');
    browser=await playwright().chromium.launch({headless:true,executablePath:await installedBrowser(),args:process.platform==='darwin'?['--use-angle=metal']:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const mobile=prefix==='mobile',page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},hasTouch:mobile});
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(/Shader Error|VALIDATE_STATUS/.test(m.text()))errors.push(m.text());});
    await page.goto('http://127.0.0.1:'+port);await page.waitForFunction(()=>typeof rewindState==='function',null,{timeout:120000});
    assertDuration(await page.evaluate(()=>rewindState()));
    await page.locator('#progress').fill('1000');await page.locator('#enter').click();await page.waitForFunction(()=>{const s=rewindState();return s.time===s.duration;});
    await page.locator('#yard').click();await page.waitForFunction(()=>rewindState().tour==='court');
    await inspectMotion(page,out,prefix);assert.deepEqual(errors,[]);console.log('PASS motion evidence',out);
  }finally{await fs.writeFile(path.join(out,prefix+'-motion-browser-errors.json'),JSON.stringify(errors,null,2));if(browser)await browser.close();server.kill();}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});

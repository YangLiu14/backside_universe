const assert = require('node:assert/strict');
const path = require('node:path');
exports.orbit = {range:'progress',state:'soleCityState',pose:'pose',handoff:[.05,.35],streamedLOD:'nearBuildingRole'};
exports.check = async (page,device,viewport,out,url,firstOrbit,manifest) => {
  const seek = async value => { await page.locator('#progress').fill(String(value)); return page.evaluate(() => window.soleCityState()); };
  const shots = {};
  for (const [p,label] of [[0,'photo'],[13,'photo-handoff'],[24,'moving-handoff'],[64,'registered-shoe'],[139,'shoe-contact'],[160,'shoe-low'],[192,'floor-edge'],[251,'outsole'],[303,'outsole-turn'],[367,'first-streets'],[426,'growth'],[608,'sole-city'],[706,'gate'],[828,'street-facades'],[916,'street'],[1000,'soy-milk']]) {
    shots[label] = await seek(p);
    await page.evaluate(()=>window.soleCityWaitForDetail?.());
    await page.screenshot({path:path.join(out,device+'-'+label+'.jpg'),type:'jpeg',quality:85});
    if(device==='desktop' && ['sole-city','soy-milk'].includes(label))
      await page.locator('#stage').screenshot({path:path.join(out,'album-'+label+'.png'),
        style:'.album-head { visibility: hidden !important }'});
  }
  assert(shots.photo.cameraY > 0 && shots['sole-city'].cameraY < 0);
  assert(shots.photo.road === 0 && shots['sole-city'].road === 1);
  assert(shots.growth.partial > 0 && shots['sole-city'].full === shots['sole-city'].total);
  for(const label of ['outsole','outsole-turn']){
    const frame=shots[label];
    assert(frame.cameraY<0 && frame.surface.rubber && !frame.surface.pavement);
    assert.equal(frame.visibleFeatures,0,'A rooftop or landmark appeared before the street reveal');
    assert.equal(frame.road,0);
  }
  // Scrub through the former pause in 1/8-second increments. A camera can
  // drift numerically while looking frozen; measure displacement in the scene.
  let previous;
  for(let value=245;value<=330;value+=5){
    const {pose}=await seek(value);
    if(previous)assert(Math.hypot(...[12,13,14].map(i=>pose[i]-previous[i]))>.012,
      'Camera lingered on the underside at film progress '+value/1000);
    previous=pose;
  }
  const growing=shots['first-streets'];
  assert(growing.visibleFeatures>0 && growing.surface.rubber && growing.surface.pavement);
  assert(growing.surface.heel>0 && growing.surface.toe===0 && growing.road>0);
  assert(!shots['sole-city'].surface.rubber && shots['sole-city'].surface.toe===1);
  assert.deepEqual(await seek(251),shots.outsole,'Rewinding must restore the intact outsole');
  assert.deepEqual((await seek(426)).heights, shots.growth.heights);
  assert.deepEqual((await seek(426)).pose, shots.growth.pose);
  const street=await page.evaluate(()=>window.soleCityCheckStreet());
  assert.equal(street.collisions.length,0,'Camera path intersects real geometry: '+JSON.stringify(street.collisions.slice(0,5)));
  const registered=await page.evaluate(()=>{
    const slider=document.querySelector('#progress');slider.value=0;slider.dispatchEvent(new Event('input'));
    const source=document.querySelector('#photo'),gs=document.querySelector('#gaussian');
    const scale=Math.min(gs.width/source.naturalWidth,gs.height/source.naturalHeight),w=scale*source.naturalWidth,h=scale*source.naturalHeight;
    const c=document.createElement('canvas');c.width=150;c.height=100;const ctx=c.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(gs,(gs.width-w)/2,(gs.height-h)/2,w,h,0,0,150,100);
    const A=ctx.getImageData(0,0,150,100).data;ctx.drawImage(source,0,0,150,100);
    const B=ctx.getImageData(0,0,150,100).data;let n=0,vis=0,x=0,y=0,xx=0,yy=0,xy=0;
    for(let j=3;j<97;j++)for(let i=4;i<146;i++){let k=(j*150+i)*4;n++;if(A[k+3]>127)vis++;
      const a=(A[k]+2*A[k+1]+A[k+2])/4,b=(B[k]+2*B[k+1]+B[k+2])/4;x+=a;y+=b;xx+=a*a;yy+=b*b;xy+=a*b;}
    return {coverage:vis/n,correlation:(xy-x*y/n)/Math.sqrt((xx-x*x/n)*(yy-y*y/n))};
  });
  assert(registered.coverage>.97&&registered.correlation>.94,'Photo/splat mismatch: '+JSON.stringify(registered));
  await page.locator('#home').click();
  assert.equal((await page.evaluate(() => window.soleCityState())).progress,0);
  const walk=await require('./check-walk.cjs').checkWalk(page,device,out);
  const hasWaterTarget=manifest?.artTargets?.some(({id})=>id==='pavement'||id==='puddle-reflection');
  const water=hasWaterTarget ? await require('./check-water.cjs').checkWater(page,device,out) : undefined;
  return {device,viewport,shots,street,registered,walk,water};
};

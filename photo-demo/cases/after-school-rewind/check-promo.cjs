// Check the actual offline-render capture, including the previously rushed return.
const fs=require('node:fs');
const assert=require('node:assert/strict');
const file=process.argv[2];if(!file)throw Error('Expected capture-video.json');
const data=JSON.parse(fs.readFileSync(file,'utf8')),frames=data.frames;
assert.equal(data.mode,'video');assert.equal(data.duration,42);
assert.equal(frames.length,data.duration*data.fps);assert.deepEqual(data.errors,[]);
const frame=t=>frames[Math.round(t*data.fps)];
for(let i=0;i<frames.length;i++){
  const f=frames[i];assert.equal(f.time,i/data.fps);
  assert(f.width===data.width&&f.height===data.height,'All frames have the declared resolution');
  assert(f.memory>=0&&f.memory<=8);
  for(const n of [...f.miniCamera.position,...f.miniCamera.quaternion,...f.camera.projection])assert(Number.isFinite(n));
}
assert.equal(frame(20).memory,0);assert.equal(frame(28).memory,8);
assert(frame(20-1/data.fps).memory>0&&frame(20+1/data.fps).memory>0,'The first rewind immediately changes to playback');
assert(frame(28+1/data.fps).memory<8,'The second rewind starts immediately');
for(let i=1;i<frames.length;i++){
  const a=frames[i-1],b=frames[i];
  if(b.time>8&&b.time<=20||b.time>28)assert(b.memory<=a.memory);
  if(b.time>20&&b.time<=28)assert(b.memory>a.memory);
}
assert.deepEqual(frame(8).miniCamera,frame(35).miniCamera,'The return reaches the exact same exterior booth pose');
assert.deepEqual(frame(0).miniCamera,frame(41).miniCamera,'The return restores the original camera');
assert.equal(frame(0).layers.photoAlpha,1);assert.equal(frame(41).layers.photoAlpha,1);
let maxRotationDegreesPerSecond=0,peakTime;
for(let i=1;i<frames.length;i++){
  const a=frames[i-1].miniCamera.quaternion,b=frames[i].miniCamera.quaternion;
  const dot=Math.min(1,Math.abs(a.reduce((sum,n,j)=>sum+n*b[j],0)));
  const speed=2*Math.acos(dot)*180/Math.PI*data.fps;
  if(speed>maxRotationDegreesPerSecond){maxRotationDegreesPerSecond=speed;peakTime=frames[i].time;}
}
assert(maxRotationDegreesPerSecond<80,'Return rotation is too rushed: '+maxRotationDegreesPerSecond);
console.log(JSON.stringify({result:'PASS',frames:frames.length,duration:data.duration,width:data.width,height:data.height,maxRotationDegreesPerSecond,peakTime,errors:data.errors}));

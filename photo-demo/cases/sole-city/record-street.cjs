// Record a repeatable walk through an actual packaged release. The capture-only
// adapter drives the visitor's camera, collision solver and stair surfaces.
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { playwright, installedBrowser } = require('../../pipeline/verify.cjs');

// Seconds, outsole-local X/Z, yaw and pitch in degrees. The west stair has
// a solid underside, so the return passes north of it before turning in.
const bridgeMarks = [
  [0, .008, .129, 156, 4], [1.4, .009, .151, 151, 3],
  [3.1, .016, .185, 137, 1], [4.6, .030, .206, 122, -1],
  [6.2, .043, .220, 100, -5], [7.1, .041, .222, 95, -4],
  [8.3, .025, .198, 157, 0], [9.7, .002, .163, 210, 3],
  [11.8, -.116, .162, 131, 5], [13, -.166, .162, 112, 5],
  [14.1, -.173, .146, 99, 7], [15.2, -.158, .1395, 89, 12],
  [17.5, -.062, .1395, 91, 12], [18.8, -.024, .1395, 102, 2],
  [20.4, .006, .1395, 133, -18], [21.5, .011, .1395, 139, -23],
];
const shopMarks = [
  [0, .004, .217, -105, -12], [.8, .004, .217, -105, -12],
  [2.4, -.004, .224, -99, -14], [3.8, -.005, .240, -72, -14],
  [5.3, -.004, .218, -106, -13], [7.0, -.005, .191, -129, -10],
  [8.6, -.009, .174, -140, -7], [10.3, -.032, .166, -159, -7],
  [12, -.049, .166, -172, -7],
];
// Cross the deck once and descend the east flight. The lane behind the grain
// shop runs east from z=.3085, past the drain and the utility trench.
const alleyMarks = [
  [0, .008, .129, 155, 2], [1.1, .010, .147, 151, -6],
  [2.7, .012, .170, 151, -19], [4.0, .018, .190, 134, -12],
  [5.7, .032, .207, 117, -2], [7.0, .043, .219, 98, -4],
  [8.0, .043, .222, 95, 3], [9.1, .039, .220, 104, 9],
  [10.9, .012, .179, 177, 0], [12.0, -.009, .162, 222, -5],
  [14.2, -.122, .162, 247, 3], [15.3, -.173, .162, 238, 3],
  [16.6, -.173, .142, 131, 6], [17.7, -.159, .1395, 91, 10],
  [20.0, -.064, .1395, 90, 11], [21.2, -.026, .1395, 104, 3],
  [22.8, .005, .1395, 139, -21], [24.5, .012, .1395, 152, -24],
  [25.8, .029, .1395, 132, -15], [27.0, .068, .1395, 99, -12],
  [29.0, .144, .1395, 144, -8], [30.2, .188, .1395, 175, -1],
  [31.2, .196, .155, 170, -2], [32.0, .181, .162, 236, 2],
  [34.0, .071, .162, 267, 3], [35.5, .024, .176, 211, 2],
  [37.5, .020, .243, 163, -4], [38.7, .021, .289, 127, -8],
  [39.6, .038, .321, 103, -4], [40.5, .050, .3232, 91, 0],
  [41.9, .086, .3232, 92, -3], [43.3, .116, .3232, 79, -30],
  [44.0, .132, .3232, 69, -48],
  [44.7, .137, .3232, 62, -56], [45.6, .154, .3085, 2, -10], [46.9, .158, .301, -26, 2],
  [48.5, .158, .298, -30, 3], [49.5, .158, .298, -30, 3],
];
const [release, output, label, mode, routeName] = process.argv.slice(2);
const closeShop = routeName === 'shop';
const throughAlley = routeName === 'alley';
const citywide = routeName === 'city';
const cityRoute = require('./city-route.cjs');
const marks = citywide ? cityRoute.marks : throughAlley ? alleyMarks : closeShop ? shopMarks : bridgeMarks;
const fps = 24;
const duration = marks.at(-1)[0];
function captionAt(t) {
  if (citywide) return label + '   ·   ' + cityRoute.stages.find(([end]) => t < end)[1];
  if (!throughAlley) return label;
  const stops = [
    [4.5, '桥下，沿旧水泥路走'],
    [9.6, '豆浆摊前，看檐下与柜面'],
    [21, '经过桥脚五金店，登上西侧楼梯'],
    [26, '在桥上回望豆浆摊'],
    [32, '沿东侧楼梯下桥'],
    [39, '经过粮油铺，转向支巷'],
    [45, '走进粮油铺旁的东巷'],
    [Infinity, '从巷内看店铺侧面'],
  ];
  return label + '   ·   ' + stops.find(([end]) => t < end)[1];
}

// Monotone cubic interpolation keeps clearances at the landings and avoids
// snapping the look direction at each change of heading.
function poseAt(t) {
  let i = marks.findIndex(m => m[0] >= t);
  if (i <= 0) return marks[i === 0 ? 0 : marks.length - 1].slice(1);
  const a = marks[i - 1], b = marks[i], dt = b[0] - a[0], u = (t - a[0]) / dt;
  function tangent(index, col) {
    if (index === 0 || index === marks.length - 1) return 0;
    const left = marks[index - 1], mid = marks[index], right = marks[index + 1];
    const dl = (mid[col] - left[col]) / (mid[0] - left[0]);
    const dr = (right[col] - mid[col]) / (right[0] - mid[0]);
    return dl * dr > 0 ? 2 * dl * dr / (dl + dr) : 0;
  }
  return [1, 2, 3, 4].map(c =>
    (2 * u**3 - 3 * u**2 + 1) * a[c] + (u**3 - 2 * u**2 + u) * dt * tangent(i - 1, c)
    + (-2 * u**3 + 3 * u**2) * b[c] + (u**3 - u**2) * dt * tangent(i, c));
}

// Insert instrumentation only into this Playwright session's copy of the
// street controller. The release on disk stays byte-for-byte identical.
const adapter = `
  window.recordStreetFrame = function([x,z,yaw,pitch], first) {
    const pos = walk.position, rad = Math.PI / 180;
    if (first) {
      if (!layout.walkSurface(x,z,false)) throw new Error('Blocked initial camera pose');
      pos.set(x,.033,z);
      above = false;
    }
    const dir = walk.target().sub(pos).normalize();
    const heading = Math.atan2(dir.x,-dir.z);
    const dx = x - pos.x, dz = z - pos.z;
    walk.move(dx*Math.cos(heading) + dz*Math.sin(heading), dx*Math.sin(heading) - dz*Math.cos(heading));
    walk.look(yaw*rad - heading, pitch*rad - Math.asin(dir.y));
    draw();
    if (Math.hypot(pos.x-x,pos.z-z) > .00005)
      throw new Error('Blocked on route: ' + JSON.stringify({x,z,actual:pos.toArray()}));
    return {above, position:eye().toArray()};
  };
`;

async function recordIntro(page,target,output,label,errors) {
  await page.goto(target);
  await page.addStyleTag({content:'nav,#pad{display:none!important}main{display:block}#stage{height:100dvh}'});
  await page.waitForFunction(()=>typeof window.soleCityState==='function',null,{timeout:180000});
  const sceneDuration=await page.evaluate(async()=> (await (await fetch('scene.json')).json()).animation.durationSeconds);
  const end=.706, frames=Math.round(sceneDuration*end*fps);
  const encoder=spawn('ffmpeg',['-y','-loglevel','error','-f','image2pipe','-framerate',String(fps),'-c:v','mjpeg','-i','pipe:0',
    '-c:v','libx264','-preset','fast','-crf','17','-pix_fmt','yuv420p','-movflags','+faststart',output],{stdio:['pipe','inherit','inherit']});
  const done=once(encoder,'close');
  try {
    for(let frame=0;frame<frames;frame++){
      const p=end*frame/(frames-1);
      const bytes=await page.evaluate(async({p,label})=>{
        const get=id=>document.getElementById(id),slider=get('progress');
        slider.value=p*1000;slider.dispatchEvent(new Event('input'));
        await window.soleCityWaitForDetail?.();
        const gl=get('mesh'),gs=get('gaussian'),photo=get('photo');
        const c=window.reviewIntro??=document.createElement('canvas');
        if(c.width!==gl.width||c.height!==gl.height+38){c.width=gl.width;c.height=gl.height+38;}
        const g=c.getContext('2d');
        g.globalAlpha=1;g.drawImage(gl,0,0);
        if(gs&&+gs.style.opacity>0){g.globalAlpha=+gs.style.opacity;g.drawImage(gs,0,0,gl.width,gl.height);}
        if(+photo.style.opacity>0){
          const k=Math.min(gl.width/photo.naturalWidth,gl.height/photo.naturalHeight),w=k*photo.naturalWidth,h=k*photo.naturalHeight;
          g.globalAlpha=+photo.style.opacity;g.drawImage(photo,(gl.width-w)/2,(gl.height-h)/2,w,h);
        }
        g.globalAlpha=1;g.fillStyle='#151814';g.fillRect(0,gl.height,c.width,38);
        g.fillStyle='#f4f0e6';g.font='500 18px system-ui,sans-serif';g.textBaseline='middle';
        const cue=p<.215?'从照片绕到地板背面':p<.325?'鞋底的橡胶和底纹':p<.55?'底纹升起，街道展开':'整城定位，靠近小区门';
        g.fillText(label+'   ·   '+cue,17,gl.height+19);
        return c.toDataURL('image/jpeg',.94).split(',')[1];
      },{p,label});
      if(!encoder.stdin.write(Buffer.from(bytes,'base64')))await once(encoder.stdin,'drain');
    }
    encoder.stdin.end();const [code]=await done;if(code)throw Error('Intro encoder '+code);
    if(errors.length)throw Error(errors.join('\n'));
    console.log('Opening sequence',frames,'frames from film progress 0 to',end);
  } finally {if(encoder.exitCode===null)encoder.kill();}
}

async function record(site, output, label, stills) {
  const root = path.resolve(site);
  const browser = await playwright().chromium.launch({
    headless: true, executablePath: await installedBrowser(),
    args: process.platform === 'darwin' ? ['--use-angle=metal'] : ['--use-angle=swiftshader','--enable-unsafe-swiftshader'],
  });
  let encoder;
  const errors = [];
  const shots = [];
  const target = 'http://127.0.0.1:38219';
  const types = { '.js':'application/javascript', '.json':'application/json', '.html':'text/html',
    '.jpg':'image/jpeg', '.png':'image/png', '.css':'text/css', '.wasm':'application/wasm', '.m4a':'audio/mp4' };
  try {
    const page = await browser.newPage({viewport:{width:1120,height:700}});
    await page.route(target+'/**', async route => {
      const pathname = decodeURIComponent(new URL(route.request().url()).pathname);
      const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!file.startsWith(root + path.sep)) return route.abort();
      const contentType = types[path.extname(file)] || 'application/octet-stream';
      if (pathname === '/street-walk.js') {
        const source = await fs.readFile(file, 'utf8');
        const hook = '  return {start,stop,draw,get position()';
        if (!source.includes(hook)) throw new Error('Walk controller capture hook changed');
        return route.fulfill({contentType,body:source.replace(hook, adapter + hook)});
      }
      return route.fulfill({path:file,contentType}).catch(async e => {errors.push(e.message);await route.abort().catch(()=>{});});
    });
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console', m=>{if(/Shader Error|VALIDATE_STATUS|WebGL: INVALID/.test(m.text())) errors.push(m.text());});
    if (citywide && process.env.CITY_INTRO)
      await recordIntro(page,target,process.env.CITY_INTRO,label,errors);
    await page.goto(target+'/?explore=bridge');
    await page.waitForFunction(()=>window.soleCityState?.().mode==='walk',null,{timeout:180000});
    await page.addStyleTag({content:'nav,#pad{display:none!important}main{display:block}#stage{height:100dvh}'});
    await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
    const frameCount = Math.round(duration*fps);
    if (!stills) {
      encoder = spawn('ffmpeg',['-y','-loglevel','error','-f','image2pipe','-framerate',String(fps),'-c:v','mjpeg','-i','pipe:0',
        '-c:v','libx264','-preset','fast','-crf','17','-pix_fmt','yuv420p','-movflags','+faststart',output],{stdio:['pipe','inherit','inherit']});
    } else await fs.mkdir(output,{recursive:true});
    const finished = encoder && once(encoder,'close');
    for (let frame=0;frame<frameCount;frame++) {
      const t=duration*frame/(frameCount-1);
      const index=marks.findIndex(m=>Math.round(m[0]/duration*(frameCount-1))===frame);
      const result=await page.evaluate(async({pose,first,label,pixels})=>{
        const state=window.recordStreetFrame(pose,first);
        if(!pixels)return {state};
        await window.soleCityWaitForDetail?.();
        const gl=document.getElementById('mesh');
        const c=window.reviewCanvas??=document.createElement('canvas');
        if(c.width!==gl.width || c.height!==gl.height+38){c.width=gl.width;c.height=gl.height+38;}
        const g=c.getContext('2d');
        g.drawImage(gl,0,0);g.fillStyle='#151814';g.fillRect(0,gl.height,c.width,38);
        g.fillStyle='#f4f0e6';g.font='500 18px system-ui,sans-serif';g.textBaseline='middle';
        g.fillText(label,17,gl.height+19);
        return {state,image:c.toDataURL('image/jpeg',.94).split(',')[1]};
      },{pose:poseAt(t),first:frame===0,label:captionAt(t),pixels:!stills||index>=0});
      const requireDeck = throughAlley ? (t>21 && t<26) : (citywide ? t>54 && t<58.6 : (!closeShop && t>18));
      if (requireDeck && (!result.state.above || result.state.position[1] < .075)) throw new Error('Walk did not reach deck');
      if (((throughAlley && t>31.3) || (citywide && t>62.9)) && result.state.above) throw new Error('Walk did not descend east flight');
      if(index>=0 && citywide) shots.push({index, frame, seconds:t, pose:poseAt(t), eye:result.state.position, onBridge:result.state.above});
      if(index>=0)console.log(t.toFixed(1),result.state.position.map(n=>n.toFixed(3)).join(','),result.state.above?'bridge':'street');
      if(result.image){
        const bytes=Buffer.from(result.image,'base64');
        if(stills)await fs.writeFile(path.join(output,'mark-'+String(index).padStart(2,'0')+'.jpg'),bytes);
        else {
          if (index >= 0 && process.env.REVIEW_MARKS) {
            const marksDir = process.env.REVIEW_MARKS;
            if (index === 0) await fs.mkdir(marksDir, { recursive:true });
            await fs.writeFile(path.join(marksDir,'mark-'+String(index).padStart(2,'0')+'.jpg'),bytes);
          }
          if(!encoder.stdin.write(bytes))await once(encoder.stdin,'drain');
        }
      }
    }
    if(encoder){encoder.stdin.end();const [code]=await finished;if(code!==0)throw new Error('ffmpeg '+code);}
    if(citywide && process.env.CITY_WALK_REPORT) await fs.writeFile(process.env.CITY_WALK_REPORT,
      JSON.stringify({release:path.basename(root), fps, frames:frameCount, shots}, null, 2)+'\n');
    if(errors.length)throw new Error(errors.join('\n'));
  } finally {
    if(encoder && encoder.exitCode===null)encoder.kill();
    await browser.close();
  }
}

record(release, output, label, mode==='stills').catch(e=>{console.error(e);process.exitCode=1;});

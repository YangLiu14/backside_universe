// Capture the real 3DGS → sunset → bookroom → original-3DGS loop.
// Requires the local server, Playwright/Chrome (marble-browser.cjs), and ffmpeg.
// Pass --encode-only to recompress an existing capture without recording again.
const {baseURL,launchBrowser}=require('./marble-browser.cjs');
const fs=require('node:fs/promises');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const directory=path.join(root,'.cache/readme-transition/loop');
const output=path.join(root,'docs/media/desk-to-islands.gif');
const fps=12,limit=16*1024*1024;
const smooth=t=>t*t*(3-2*t);

async function record(){
  await fs.mkdir(directory,{recursive:true});
  const browser=await launchBrowser(),errors=[],frames=[];
  try{
    const page=await browser.newPage({viewport:{width:960,height:600},deviceScaleFactor:1});
    // A recording-only diagnostic getter allows the existing lamp to move
    // during the existing bookroom approach; production UI stays unchanged.
    await page.route('**/marble-transition-lab/app.js',async route=>{
      const response=await route.fetch(),source=await response.text();
      const marker='window.__marbleTransition={';
      assert(source.includes(marker),'Missing scene diagnostics');
      await route.fulfill({response,body:source.replace(marker,marker+'get daylight(){return holiday?.daylight;},')});
    });
    page.on('pageerror',error=>errors.push(error.message));
    // Install before Three.js captures requestAnimationFrame. Pausing later
    // lets every rendered frame advance the same amount of simulation time.
    await page.clock.install();
    await page.goto(`${baseURL}/marble-transition-lab/index.html`);
    await page.addStyleTag({content:`
      main{padding:0;max-width:none}
      header,.intro,.story-tour{display:none!important}
      .experience{border:0;border-radius:0}
      .stage{height:600px;min-height:0}
      .stage>:not(canvas):not(#book-photo-bridge){visibility:hidden!important}
    `});
    await page.waitForFunction(()=>document.querySelector('#world').dataset.ready==='true',null,{timeout:180000});
    await page.evaluate(()=>window.__marbleTransition.setProgress(1));
    await page.waitForFunction(()=>window.__marbleTransition.islands.every(i=>i.level==='hd'&&i.amount===1),null,{timeout:90000});
    await page.evaluate(()=>window.__marbleTransition.grotto.prepareVisit());
    await page.clock.pauseAt(new Date(Date.now()+100));
    await page.evaluate(()=>{
      window.__marbleTransition.daylight.setPhase(0);
      window.__marbleTransition.setProgress(0);
    });
    await page.clock.runFor(300);
    async function shoot(label,settings={}){
      await page.evaluate(({progress,daylight})=>{
        const api=window.__marbleTransition;
        if(progress!==undefined)api.setProgress(progress);
        if(daylight!==undefined)api.daylight.setPhase(daylight);
      },settings);
      await page.clock.runFor(1000/fps);
      const file=`${String(frames.length).padStart(4,'0')}.png`;
      // Include the production photo bridge used when entering the book page.
      await page.locator('#stage').screenshot({path:path.join(directory,file)});
      frames.push({file,label,...await page.evaluate(()=>{
        const api=window.__marbleTransition,s=api.state;
        return {progress:s.progress,camera:s.camera,projection:s.projection,visit:s.visit,
          daylight:api.daylight.phase,photo:Number(document.querySelector('#book-photo-bridge').style.opacity||0)};
      })});
      if(frames.length%24===0)console.log(`Captured ${frames.length} frames · ${label}`);
    }
    async function hold(label,seconds){for(let i=0;i<Math.round(seconds*fps);i++)await shoot(label);}
    async function action(name){
      await page.evaluate(name=>{void window.__marbleTransition.visit.actions[name]();},name);
      for(let i=0;i<fps*30;i++){
        await shoot(name);
        if(!await page.evaluate(()=>window.__marbleTransition.visit.busy))return;
      }
      throw Error(`Bookroom action did not finish: ${name}`);
    }
    await hold('original-3dgs',.8);
    const steps=Math.round(4.8*fps);
    for(let i=1;i<=steps;i++)await shoot('orbit',{progress:smooth(i/steps)});
    await hold('sunrise-islands',.5);
    await page.evaluate(()=>{void window.__marbleTransition.visit.start();});
    for(let i=0;i<fps*12;i++){
      await shoot('approach-and-sunset',{daylight:smooth(Math.min(1,(i+1)/(4.2*fps)))});
      if(!await page.evaluate(()=>window.__marbleTransition.visit.busy))break;
    }
    assert.equal(frames.at(-1).visit.stage,'terrace');
    assert.equal(frames.at(-1).daylight,1);
    await hold('sunset-at-the-door',.4);
    await action('door');
    assert(frames.at(-1).visit.doorOpen);
    await hold('open-door',.3);
    await action('enter');
    assert.equal(frames.at(-1).visit.stage,'inside');
    await hold('inside-bookroom',.5);
    await action('read');
    assert.equal(frames.at(-1).visit.stage,'book');
    await hold('photograph-on-the-page',1);
    await action('photo');
    assert.equal(frames.at(-1).visit.stage,'desk');
    assert.equal(frames.at(-1).visit.cycles,1);
    await hold('returned-3dgs',.8);
    const first=frames[0],last=frames.at(-1);
    for(const key of ['camera','projection'])assert(first[key].every((v,i)=>Math.abs(v-last[key][i])<1e-9),`Loop ${key} must match`);
    assert.equal(last.progress,0);assert.equal(last.photo,0);
    assert.deepEqual(errors,[]);
    await fs.writeFile(path.join(directory,'capture.json'),JSON.stringify({baseURL,viewport:[960,600],fps,frames,errors},null,2));
    console.log(`Recorded complete loop: ${frames.length} frames, ${(frames.length/fps).toFixed(1)} seconds`);
  }finally{await browser.close();}
}

async function encode(){
  const capture=JSON.parse(await fs.readFile(path.join(directory,'capture.json'),'utf8'));
  const sequence=path.join(directory,'sequence.txt');
  await fs.writeFile(sequence,capture.frames.map(f=>`file '${f.file}'\nduration ${1/capture.fps}`).join('\n')+`\nfile '${capture.frames[0].file}'\n`);
  await fs.mkdir(path.dirname(output),{recursive:true});
  // Preserve resolution first, reducing only if the complete story is too big.
  for(const [width,rate] of [[800,12],[720,12],[720,10],[640,10]]){
    execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',sequence,
      '-filter_complex',`fps=${rate},scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=full[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`,
      '-loop','0',output],{stdio:'inherit'});
    const {size}=await fs.stat(output);
    console.log(JSON.stringify({output,bytes:size,seconds:capture.frames.length/capture.fps,width,fps:rate}));
    if(size<=limit)return;
  }
  throw Error('README story GIF exceeds 16 MiB');
}
(async()=>{if(!process.argv.includes('--encode-only'))await record();await encode();})().catch(error=>{console.error(error);process.exitCode=1;});

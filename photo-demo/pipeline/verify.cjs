// Run against the exact, independently served release that will be delivered.
const assert = require('node:assert/strict');
const {spawn} = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const readline = require('node:readline');
const {once} = require('node:events');
const {coldOrbit}=require('./qa/orbit.cjs');
function playwright() {
  if(process.env.PLAYWRIGHT_MODULE) return require(process.env.PLAYWRIGHT_MODULE);
  try { return require('playwright'); } catch {
    return require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
  }
}
async function installedBrowser() {
  if(process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  if(process.platform!=='darwin') return undefined;
  const root=path.join(os.homedir(),'Library/Caches/ms-playwright');
  const dirs=await fs.readdir(root).catch(()=>[]);
  const arch=process.arch==='arm64'?'arm64':'x64';
  for(const dir of dirs.filter(d=>d.startsWith('chromium_headless_shell-')).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}))){
    const bin=path.join(root,dir,'chrome-headless-shell-mac-'+arch,'chrome-headless-shell');
    if(await fs.stat(bin).then(f=>f.isFile()).catch(()=>false))return bin;
  }
}
async function main() {
  const [site, out] = process.argv.slice(2);
  await fs.mkdir(out,{recursive:true});
  const receipt=path.join(out,'report.json');
  await fs.rm(receipt,{force:true});
  const server = spawn('python3',['-u','-c',[
    'from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler',
    's=ThreadingHTTPServer(("127.0.0.1",0),SimpleHTTPRequestHandler)',
    'print(s.server_port,flush=True); s.serve_forever()'].join('\n')],{cwd:site,stdio:['ignore','pipe','ignore']});
  let browser;
  const errors=[], report=[];
  try {
    const lines=readline.createInterface({input:server.stdout});
    const [port]=await once(lines,'line');
    const {chromium}=playwright();
    browser=await chromium.launch({headless:true,executablePath:await installedBrowser(),
      args:process.platform==='darwin'?['--use-angle=metal']:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    for(const [name,viewport] of [['desktop',{width:1024,height:800}],['mobile',{width:390,height:844}]]){
      const page=await browser.newPage({viewport,hasTouch:name==='mobile',reducedMotion:name==='mobile'?'reduce':'no-preference'});
      page.on('pageerror',error=>errors.push(error.message));
      page.on('console',msg=>{if(/Shader Error|VALIDATE_STATUS|WebGL: INVALID/i.test(msg.text()))errors.push(msg.text());});
      page.on('response',response=>{if(response.status()>=400)errors.push(response.status()+' '+new URL(response.url()).pathname);});
      const url='http://127.0.0.1:'+port;
      await page.goto(url);
      const manifest=JSON.parse(await fs.readFile(path.join(site,'scene.json'),'utf8'));
      let specific,orbit={range:'progress',state:'universeState',pose:'pose',handoff:[.25,.44]};
      if(manifest.experience){
        if(!/^[a-z0-9-]+$/.test(manifest.experience))throw new Error('Invalid case name');
        specific=require('../cases/'+manifest.experience+'/check.cjs');
        if(!specific.orbit)throw new Error('案例 check.cjs 须导出 orbit：range、state、pose、handoff');
        orbit=specific.orbit;
      }
      await page.waitForFunction(key=>typeof window[key]==='function',orbit.state,{timeout:120000});
      const firstOrbit=await coldOrbit(page,orbit);
      await page.evaluate(({range})=>{
        const el=document.getElementById(range);el.value=el.min||'0';el.dispatchEvent(new Event('input',{bubbles:true}));
        return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      },orbit);
      if(specific){
        const details=await specific.check(page,name,viewport,out,url,firstOrbit);
        report.push({...details,coldOrbit:firstOrbit});
        await page.close();continue;
      }
      const state=()=>page.evaluate(()=>window.universeState());
      const initial=await state();
      assert(initial.splats>0 && initial.triangles>0);
      const seek=async p=>{
        await page.locator('#progress').fill(String(p));
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      };
      const shot=label=>page.screenshot({path:path.join(out,name+'-'+label+'.jpg'),type:'jpeg',quality:86});
      const poses=new Map();
      for(const [step,label] of [[0,'source'],[200,'real'],[350,'handoff'],[470,'mesh'],[1000,'reveal']]){
        await seek(step); await shot(label); poses.set(step,await state());
      }
      await page.locator('#enter').click(); assert((await state()).close); await shot('close');
      if(name==='mobile')await page.locator('#action').tap();
      else await page.locator('#action').click();
      assert((await state()).acted); await shot('action');
      await page.locator('#enter').click(); assert.deepEqual((await state()).pose,poses.get(1000).pose);
      for(const step of [470,350,200,0]){
        await seek(step); const s=await state();
        assert.deepEqual(s.pose,poses.get(step).pose);assert.deepEqual(s.projection,poses.get(step).projection);
      }
      const bounds=await page.locator('#stage').boundingBox();
      const x=bounds.x+bounds.width*.74,y=bounds.y+bounds.height*.5;
      if(name==='mobile'){
        const cdp=await page.context().newCDPSession(page);
        for(const [type,points] of [['touchStart',[{x,y}]],['touchMove',[{x:x-bounds.width*.3,y}]],['touchEnd',[]]]){
          await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points});
        }
      }else{
        await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x-bounds.width*.3,y,{steps:4});await page.mouse.up();
      }
      assert((await state()).progress>.1);
      await page.locator('#home').click();assert.equal((await state()).progress,0);
      await page.locator('#stage').press('End');await page.locator('#enter').click();assert((await state()).close);
      await page.locator('#home').click();assert.deepEqual((await state()).pose,initial.pose);
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      report.push({viewport,device:name,coldOrbit:firstOrbit,triangles:initial.triangles,splats:initial.splats,roles:initial.roles});
      await page.close();
    }
    assert.deepEqual(errors,[]);
    const tmp=receipt+'.'+process.pid+'.tmp';
    await fs.writeFile(tmp,JSON.stringify({version:path.basename(site),report,errors},null,2));
    await fs.rename(tmp,receipt);
    console.log('PASS',out);
  } finally {if(browser)await browser.close();server.kill();}
}
module.exports={playwright,installedBrowser};
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});

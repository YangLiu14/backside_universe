const {playwright, installedBrowser} = require('../../pipeline/verify.cjs');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {execFileSync} = require('node:child_process');

(async () => {
  const [url, out] = process.argv.slice(2);
  if (!url || !out) throw Error('usage: node record.cjs RELEASE_URL OUT_DIR');
  await fs.mkdir(out, {recursive: true});
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cassette-capture-'));
  const browser = await playwright().chromium.launch({executablePath: await installedBrowser(),
    args: process.platform === 'darwin' ? ['--use-angle=metal'] : ['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try {
    const size = {width: 1600, height: 1000}, page = await browser.newPage({viewport:size});
    // Tap the actual speaker mix, including the player's tape motor. The video is a browser screencast.
    await page.addInitScript(() => {
      const original = AudioNode.prototype.connect;
      AudioNode.prototype.connect = function (target, ...args) {
        if (target === this.context.destination) {
          window.recordingBus ??= this.context.createMediaStreamDestination();
          original.call(this, window.recordingBus);
        }
        return original.call(this, target, ...args);
      };
    });
    await page.goto(url);
    await page.waitForFunction(() => Boolean(window.rewindState), null, {timeout:120000});
    await page.locator('#sound').click();
    await page.evaluate(() => {
      const cursor = document.createElement('span');
      cursor.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;z-index:20;width:13px;height:13px;border-radius:50%;border:1.5px solid white;background:#322f2480;box-shadow:0 1px 3px #0008;opacity:0';
      document.body.append(cursor);
      window.addEventListener('pointermove', e => { cursor.style.opacity = '.95'; cursor.style.transform = 'translate('+(e.clientX-6)+'px,'+(e.clientY-6)+'px)'; });
      window.addEventListener('pointerdown', () => {cursor.style.background = '#e8bd73';});
      window.addEventListener('pointerup', () => {cursor.style.background = '#322f2480';});
    });
    await page.screencast.start({path:path.join(tmp, 'live.webm'), size, quality:93});
    await page.evaluate(() => {
      const chunks = [], recorder = new MediaRecorder(window.recordingBus.stream, {mimeType:'audio/webm;codecs=opus'});
      recorder.ondataavailable = e => chunks.push(e.data);
      window.finishSound = () => new Promise(resolve => {
        recorder.onstop = async () => {
          const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer());
          let text = ''; for (const b of bytes) text += String.fromCharCode(b);
          resolve(btoa(text));
        };
        recorder.stop();
      });
      recorder.start();
    });
    const stage = await page.locator('#stage').boundingBox();
    const drag = async (x, y, distance, ms) => {
      await page.mouse.move(x, y); await page.mouse.down();
      const start = Date.now();
      for (;;) {
        const t = Math.min(1, (Date.now() - start) / ms), u = t*t*(3-2*t);
        await page.mouse.move(x + distance*u, y);
        if (t === 1) break;
        await page.waitForTimeout(17);
      }
    };
    const still=label=>page.locator('#frame').screenshot({path:path.join(out,label+'.jpg'),type:'jpeg',quality:96});
    await still('书桌原照机位');
    await page.waitForTimeout(650);
    await drag(stage.x+.88*stage.width, stage.y+.56*stage.height, -.67*stage.width, 2400);
    await page.mouse.up(); await page.waitForTimeout(650);
    await still('磁带背面剖面');
    await page.locator('#enter').click();
    await page.waitForFunction(() => rewindState().time === 4);
    await page.waitForTimeout(500);
    const grip = await page.locator('#grip').boundingBox(), x = grip.x+grip.width/2, y = grip.y+grip.height/2;
    const sign = x < stage.x+stage.width/2 ? 1 : -1;
    await drag(x,y,sign*stage.width*.39,1900);
    await page.waitForFunction(() => rewindState().held === 'pencil' && rewindState().time === 0);
    await page.waitForTimeout(850); await page.mouse.up();
    await page.waitForTimeout(300);await page.locator('#yard').click();
    await page.waitForTimeout(1300);await still('穿过广播室窗口');
    await page.waitForFunction(()=>rewindState().tour==='court');await still('场边第一眼');
    await page.waitForTimeout(350);
    await page.keyboard.down('KeyA');await page.waitForFunction(()=>rewindState().eye[0]<-18.5,null,{timeout:22000});await page.keyboard.up('KeyA');
    await page.keyboard.down('KeyS');await page.waitForFunction(()=>rewindState().eye[2]>7.1,null,{timeout:8000});await page.keyboard.up('KeyS');
    // Turn from the west baseline towards the opposite basket using the visitor's mouse controls.
    const mx=stage.x+.42*stage.width,my=stage.y+.45*stage.height;
    await page.mouse.move(mx,my);await page.mouse.down();await page.mouse.move(mx+stage.width*.205,my+stage.height*.043,{steps:36});await page.mouse.up();
    await page.mouse.move(6,12);await page.waitForTimeout(500);await still('篮球场与周边校舍');
    await page.waitForTimeout(700);await page.locator('#yard').click();await page.waitForFunction(()=>rewindState().tour==='booth');await page.waitForTimeout(320);
    const audio = await page.evaluate(() => window.finishSound());
    await page.screencast.stop();
    await fs.writeFile(path.join(tmp, 'speaker.webm'), Buffer.from(audio,'base64'));
    execFileSync('ffmpeg',['-v','error','-y','-i',path.join(tmp,'live.webm'),'-i',path.join(tmp,'speaker.webm'),
      '-map','0:v:0','-map','1:a:0','-c:v','libx264','-preset','fast','-crf','17','-pix_fmt','yuv420p',
      '-c:a','aac','-b:a','160k','-movflags','+faststart',path.join(out,'穿窗走进篮球场.mp4')]);
  } finally { await browser.close(); await fs.rm(tmp,{recursive:true,force:true}); }
})().catch(e => { console.error(e); process.exitCode=1; });

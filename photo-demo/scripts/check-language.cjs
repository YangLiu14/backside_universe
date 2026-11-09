// Test language as application state: synchronize frames, preserve journeys,
// translate live messages, reload the preference, and select English narration.
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {baseURL,launchBrowser}=require('./marble-browser.cjs');
const out=path.resolve(__dirname,'../evidence/language');
async function noChinese(page){
  await page.waitForTimeout(60);
  const left=await page.evaluate(()=>{
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT),found=[];
    while(walker.nextNode()){
      const n=walker.currentNode,p=n.parentElement;
      if(!p||p.closest('script,style,.language-switch,code,pre')||!p.getClientRects().length)continue;
      if(/[\u3400-\u9fff]/.test(n.nodeValue))found.push(n.nodeValue.trim());
    }
    return [...new Set(found)];
  });
  assert.deepEqual(left,[],'Untranslated visible text: '+left.join(' | '));
}
async function choose(page,language){
  await page.locator(`.language-switch [data-language="${language}"]`).click();
  await page.waitForFunction(language=>document.documentElement.lang===(language==='en'?'en':'zh-CN'),language);
}
async function main(){
  await fs.mkdir(out,{recursive:true});const browser=await launchBrowser();
  const {messages:en}=await import('../dist/i18n/messages.en.js');
  const errors=[];
  try{
    const page=await browser.newPage({viewport:{width:1280,height:900},reducedMotion:'reduce'});
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(baseURL+'/?lang=en');await page.waitForFunction(()=>window.__universeLanguage);
    assert.equal(await page.locator('#album-title').innerText(),'Photo Album');await noChinese(page);
    await page.locator('[data-preview=back]').click();await noChinese(page);
    await page.locator('[data-preview=front]').click();
    await page.locator('[data-work=desk]').click();
    await page.waitForFunction(()=>[...document.querySelectorAll('iframe')].some(f=>f.contentWindow.location.pathname.includes('/marble-transition-lab/')));
    const desk=page.frames().find(f=>f.url().includes('/marble-transition-lab/'));
    await desk.locator('#world[data-ready=true]').waitFor({timeout:180000});await noChinese(desk);
    await desk.locator('#tour-next').click();
    const next=desk.locator('#tour-next');
    const waitNext=zh=>desk.waitForFunction(label=>document.querySelector('#tour-label').textContent===label&&document.querySelector('#tour-next').getAttribute('aria-disabled')==='false',en[zh],{timeout:45000});
    await waitNext('折成纸船');await noChinese(desk);
    const pose=await desk.evaluate(()=>window.__marbleTransition.state.camera);
    const textureVersion=()=>desk.evaluate(()=>{
      const maps=new Set();window.__marbleTransition.dreamScene.traverse(o=>{for(const m of [].concat(o.material||[]))if(m.map?.image?.width===1024&&m.map.image.height===576)maps.add(m.map);});
      return [...maps].map(m=>m.version);
    });
    const before=await textureVersion();assert(before.length,'Paper note texture must exist');
    await choose(desk,'zh');assert.equal(await next.innerText(),'折成纸船');
    await page.waitForFunction(()=>document.documentElement.lang==='zh-CN');
    assert.equal(new URL(page.url()).searchParams.get('lang'),'zh');
    assert.deepEqual(await desk.evaluate(()=>window.__marbleTransition.state.camera),pose);
    assert((await textureVersion()).some((n,i)=>n>before[i]),'3D text must redraw on language change');
    await choose(desk,'en');await waitNext('折成纸船');await noChinese(desk);
    const steps=[['折成纸船','推船出海'],['推船出海','下一站 · 蓝书白崖'],['下一站 · 蓝书白崖','望向纸船'],['望向纸船','下一站 · 橙书峡谷'],['下一站 · 橙书峡谷','压低书签'],['压低书签','下一站 · 手机潮港'],['下一站 · 手机潮港','拨到静音'],['拨到静音','下一站 · 洞窟书屋'],['下一站 · 洞窟书屋','开门进书屋'],['开门进书屋','走近桌上的书'],['走近桌上的书','从书页回到工位'],['从书页回到工位','再游览一次']];
    function translated(zh){if(zh.startsWith('下一站 · '))return 'Next stop · '+en[zh.slice(6)];return en[zh];}
    for(const [from,to]of steps){
      assert.equal((await next.innerText()).trim(),translated(from));await next.click();
      await desk.waitForFunction(label=>document.querySelector('#tour-label').textContent.trim()===label&&document.querySelector('#tour-next').getAttribute('aria-disabled')==='false',translated(to),{timeout:45000});
      await noChinese(desk);console.log('English story:',to);
      if(to==='从书页回到工位')await desk.locator('#stage').screenshot({path:path.join(out,'bookpage-en.png')});
    }
    assert.equal(await desk.locator('#world').getAttribute('data-cycles'),'1');
    await desk.locator('[data-album-back]').click();await page.locator('#album:visible').waitFor();await noChinese(page);
    await page.reload();await page.waitForFunction(()=>window.__universeLanguage);assert.equal(await page.locator('html').getAttribute('lang'),'en');
    await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(out,'album-en-mobile.png'),fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await choose(page,'zh');assert.equal(await page.locator('#album-title').innerText(),'放映相簿');await choose(page,'en');
    await page.locator('[data-work=canine]').click();await page.waitForFunction(()=>[...document.querySelectorAll('iframe')].some(f=>f.contentWindow.location.pathname.includes('/canine-museum/')));const dog=page.frames().find(f=>f.url().includes('/canine-museum/'));
    const audio=[];page.on('request',r=>{if(r.url().includes('/digestion/')&&r.url().endsWith('.m4a'))audio.push(r.url());});
    await dog.locator('#stage[data-ready=true]').waitFor({timeout:180000});await noChinese(dog);
    await dog.locator('#food-start').click();await dog.waitForFunction(()=>window.__photoOrbit.state.tour.active);
    await noChinese(dog);assert(audio.some(s=>s.endsWith('/en/mouth.m4a')),'English narration requested');
    await dog.locator('#tour-play').click();
    const state=await dog.evaluate(()=>window.__photoOrbit.state.tour);
    await choose(dog,'zh');assert.equal(await dog.locator('#tour-heading').innerText(),'口腔 · 咬碎与吞咽');
    const after=await dog.evaluate(()=>window.__photoOrbit.state.tour);assert.equal(after.index,state.index);assert.equal(after.elapsed,state.elapsed);
    await choose(dog,'en');await noChinese(dog);
    await dog.locator('#tour-next').click();await noChinese(dog);assert(audio.some(s=>s.endsWith('/en/esophagus.m4a')));
    await dog.locator('#tour-first-landing').count();
    await dog.locator('#tour-exit').click();await noChinese(dog);
    await dog.locator('#turn').click();await dog.locator('#stage[data-browsing=true]').waitFor();
    await dog.locator('#galleries [data-gallery=heart]').click();await dog.waitForTimeout(900);await noChinese(dog);
    await dog.locator('#stage').screenshot({path:path.join(out,'dog-en-mobile.png')});
    assert.equal(await dog.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await dog.goto(baseURL+'/canine-museum/index.html?lang=en&tour=food&stop=chest');
    await dog.locator('#tour-doorways [data-organ=heart]:visible').waitFor({timeout:150000});
    await dog.locator('#tour-doorways [data-organ=heart]').click();
    await dog.waitForFunction(()=>window.__photoOrbit.state.tour.visiting==='heart');await noChinese(dog);
    assert(audio.some(s=>s.endsWith('/en/galleries/heart.m4a')),'English gallery narration requested');
    await page.close();assert.deepEqual(errors,[]);console.log('PASS bilingual album, two live scenes, complete island loop, in-place switching, canvas redraw, English narration, persistence, and mobile layout.');
  }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});

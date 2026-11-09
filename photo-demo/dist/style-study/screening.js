const pauseMark = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>';
const splitMark = '<svg aria-hidden="true" viewBox="0 0 28 20" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m8 5-5 5 5 5m12-10 5 5-5 5"/></svg>';
const pad = number => String(number).padStart(2,'0');
const formatTime = seconds => Math.floor(seconds/60)+':'+pad(Math.floor(seconds%60));
function makePanel(section,p) {
  const panel = document.createElement('article');
  panel.className = 'panel';
  panel.setAttribute('aria-label', p.title+' · '+document.querySelector('#'+section+'-title').lastChild.textContent);
  document.querySelector('#'+section+' .pair').append(panel);
  return panel;
}
function wordmark() {
  return '<span class="wordmark">'+icon('mark')+'背面宇宙</span>';
}

function mountPremiere(p) {
  const panel = makePanel('premiere',p);
  const film = p.edition==='01' ? 'desk' : 'canine';
  panel.innerHTML = `
    <div class="premiere-top">${wordmark()}<span>第 ${p.edition} 场</span></div>
    <div class="projection">
      <video preload="metadata" muted playsinline poster="./films/${film}.jpg" aria-label="${p.title}作品录屏"></video>
      <div class="title-card"><h3>${p.title}</h3><p>${p.lead}</p></div>
    </div>
    <footer class="transport">
      <button type="button" class="run">${icon('play')}<span>放映短片</span></button>
      <input class="time-track" type="range" min="0" max="1" value="0" step="0.05" aria-label="${p.title}放映进度" disabled>
      <span class="clock">0:00</span>
    </footer><p class="film-error" role="status" hidden></p>`;
  const movie = panel.querySelector('video');
  const run = panel.querySelector('.run');
  const slider = panel.querySelector('input');
  const clock = panel.querySelector('.clock');
  const error = panel.querySelector('.film-error');
  const source = './films/'+film+'.mp4';
  let loading;
  async function attachMovie() {
    if (location.protocol==='file:') { movie.src=source; return; }
    // The project's static server returns whole files. A local Blob lets the
    // player seek throughout the short film without HTTP byte-range support.
    const response = await fetch(source);
    if (!response.ok) throw Error('Film unavailable');
    const data = await response.blob();
    if (movie.src.startsWith('blob:')) URL.revokeObjectURL(movie.src);
    movie.src = URL.createObjectURL(data.slice(0,data.size,'video/mp4'));
  }
  function prepare() {
    if (!loading) loading = attachMovie().catch(e=>{loading=undefined; throw e;});
    return loading;
  }
  function updateClock() {
    const duration = movie.duration;
    if (!Number.isFinite(duration)) return;
    slider.max = duration;
    slider.value = movie.currentTime;
    slider.disabled = false;
    slider.style.setProperty('--played',100*movie.currentTime/duration+'%');
    const now = formatTime(movie.currentTime);
    const end = formatTime(duration);
    clock.textContent = now+' / '+end;
    slider.setAttribute('aria-valuetext',now+'，全长 '+end);
  }
  function showControl(mark,label) {
    run.innerHTML = mark+'<span>'+label+'</span>';
  }
  function fail() {
    error.hidden = false;
    error.textContent = '短片暂时未能播放。可重新放映，或在下方剪辑台浏览本作镜头。';
    showControl(icon('reset'),'重试放映');
  }
  movie.addEventListener('error',fail);
  movie.addEventListener('loadedmetadata',updateClock);
  movie.addEventListener('timeupdate',updateClock);
  movie.addEventListener('play',()=>{
    document.querySelectorAll('.projection video').forEach(other=>{ if (other!==movie) other.pause(); });
    panel.classList.add('projecting');
    showControl(pauseMark,'暂停');
  });
  movie.addEventListener('pause',()=>{
    showControl(icon('play'),'继续放映');
  });
  movie.addEventListener('ended',()=>{
    showControl(icon('reset'),'重新放映');
    updateClock();
  });
  run.addEventListener('click',async()=>{
    if (!movie.paused) { movie.pause(); return; }
    error.hidden = true;
    if (movie.error) loading = undefined;
    if (movie.ended) movie.currentTime = 0;
    try { await prepare(); await movie.play(); } catch (e) { if (e.name!=='AbortError') fail(); }
  });
  slider.addEventListener('input',()=>{
    panel.classList.toggle('projecting',Number(slider.value)>0 || !movie.paused);
    movie.currentTime = Number(slider.value);
    updateClock();
  });
  const near = new IntersectionObserver(entries=>{
    if (entries.some(entry=>entry.isIntersecting)) {
      near.disconnect();
      prepare().catch(fail);
    }
  },{rootMargin:'300px'});
  near.observe(panel);
  updateClock();
}

function mountCutting(p) {
  const panel = makePanel('cutting',p);
  const scenes = frames(p);
  const cells = scenes.map((scene,i)=>`
    <button class="cell" type="button" data-index="${i}" aria-label="放大第 ${i+1} 格，${scene.label}">
      <img src="${scene.src}" alt=""><span class="cell-caption"><b>${pad(i+1)}</b>${scene.label}</span>
    </button>`).join('');
  panel.innerHTML = `
    <header class="bench-head">${wordmark()}<span>卷 ${p.edition} <i>/</i> ${pad(scenes.length)} 格</span></header>
    <div class="bench-title"><h3>${p.title}</h3><button type="button" class="start-cut">从头看片 ${icon('play')}</button></div>
    <div class="sheet ${scenes.length===7?'seven':''}" role="group" aria-label="镜头表">${cells}</div>
    <div class="loupe" hidden>
      <figure><img src="${p.front}" alt=""></figure>
      <div class="loupe-controls">
        <button class="all-cuts" type="button">${icon('prev')} 镜头表</button>
        <span class="cut-name" aria-live="polite"></span>
        <button class="cut-prev" type="button" aria-label="上一格">${icon('prev')}</button>
        <button class="cut-next" type="button" aria-label="下一格">${icon('next')}</button>
      </div>
    </div>`;
  const sheet = panel.querySelector('.sheet');
  const loupe = panel.querySelector('.loupe');
  const still = loupe.querySelector('img');
  const back = panel.querySelector('.all-cuts');
  const start = panel.querySelector('.start-cut');
  const prev = panel.querySelector('.cut-prev');
  const next = panel.querySelector('.cut-next');
  let current = 0;
  let opener = start;
  function show(index) {
    current = Math.min(scenes.length-1,Math.max(0,index));
    const scene = scenes[current];
    still.src = scene.src;
    still.alt = scene.alt || p.title+'中的'+scene.label;
    panel.querySelector('.cut-name').textContent = pad(current+1)+' / '+scene.label;
    prev.disabled = current===0;
    next.disabled = current===scenes.length-1;
    if (document.activeElement===prev && prev.disabled) next.focus({preventScroll:true});
    if (document.activeElement===next && next.disabled) prev.focus({preventScroll:true});
  }
  function enter(index,button) {
    opener = button;
    sheet.hidden = true;
    start.hidden = true;
    loupe.hidden = false;
    show(index);
    back.focus({preventScroll:true});
  }
  function leave() {
    sheet.hidden = false;
    start.hidden = false;
    loupe.hidden = true;
    opener.focus({preventScroll:true});
  }
  start.addEventListener('click',()=>enter(0,start));
  sheet.addEventListener('click',event=>{
    const cell = event.target.closest('.cell');
    if (cell) enter(Number(cell.dataset.index),cell);
  });
  back.addEventListener('click',leave);
  prev.addEventListener('click',()=>show(current-1));
  next.addEventListener('click',()=>show(current+1));
  panel.addEventListener('keydown',event=>{
    if (loupe.hidden) return;
    if (event.key==='Escape') leave();
    else if (event.key==='ArrowLeft') show(current-1);
    else if (event.key==='ArrowRight') show(current+1);
    else return;
    event.preventDefault();
  });
}

function mountDual(p) {
  const panel = makePanel('dual',p);
  const scenes = frames(p);
  const options = scenes.slice(1).map((scene,i)=>'<option value="'+(i+1)+'">'+scene.label+'</option>').join('');
  panel.innerHTML = `
    <header class="dual-head">${wordmark()}<span>双机 / ${p.edition}</span></header>
    <div class="dual-title"><h3>${p.title}</h3></div>
    <div class="comparison">
      <img class="right-shot" src="${scenes[1].src}" alt="${scenes[1].label}">
      <img class="left-shot" src="${p.front}" alt="${p.alt}">
      <div class="channel-labels" aria-hidden="true"><span>A　原照</span><span>B　背面</span></div>
      <div class="boundary" aria-hidden="true"><span>${splitMark}</span></div>
      <input class="wipe" type="range" min="0" max="100" value="50" aria-label="${p.title}，左右拖动比较原照与背面">
    </div>
    <footer class="dual-foot">
      <label><span>B 机选片</span><select aria-label="${p.title}的 B 机画面">${options}</select></label>
      <button type="button" class="center-wipe" aria-label="将分界线移回中线">恢复对半</button>
    </footer>`;
  const screen = panel.querySelector('.comparison');
  const wipe = screen.querySelector('input');
  const right = screen.querySelector('.right-shot');
  const select = panel.querySelector('select');
  const reset = panel.querySelector('.center-wipe');
  function position() {
    screen.style.setProperty('--split',wipe.value+'%');
    wipe.setAttribute('aria-valuetext','原照 '+wipe.value+'%，背面 '+(100-Number(wipe.value))+'%');
    reset.disabled = Number(wipe.value)===50;
  }
  select.addEventListener('change',()=>{
    const scene = scenes[Number(select.value)];
    right.src = scene.src;
    right.alt = scene.label;
  });
  reset.addEventListener('click',()=>{wipe.value=50; position(); wipe.focus({preventScroll:true});});
  wipe.addEventListener('input',position);
  position();
}

projects.forEach(p=>{
  mountPremiere(p);
  mountCutting(p);
  mountDual(p);
});

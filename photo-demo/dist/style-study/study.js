function imprint(label) {
  return '<header class="imprint"><span class="brand">'+icon('mark')+'背面宇宙</span><span class="edition">'+label+'</span><button type="button" class="return" data-home hidden>'+icon('reset')+'回到原照</button></header>';
}
function title(p) {
  return '<h3>'+p.lines.map(line=>'<span>'+line+'</span>').join('')+'</h3>';
}
function action() { return '<button type="button" class="action" data-next></button>'; }
function arrows() {
  return '<div class="arrows"><button type="button" data-prev aria-label="上一幅">'+icon('prev')+'</button><button type="button" data-next aria-label="下一幅">'+icon('next')+'</button></div>';
}
function folio(p) {
  return imprint('图鉴 · 第 '+p.edition+' 册')+
    '<div class="spread"><div class="folio-copy">'+title(p)+'<p>'+p.lead+'</p>'+action()+'</div>'+
    '<figure class="plate"><img class="picture" src="'+p.front+'" alt=""><figcaption><i>Fig.</i> <span class="figure-n"></span> / <span class="live-label"></span></figcaption></figure>'+
    '<button class="inset" type="button" data-frame="2" aria-label="看局部图版，'+p.stops[0][1]+'"><img src="'+still(p.stops[0][0])+'" alt=""><span>'+p.stops[0][1]+' '+icon('next')+'</span></button></div>'+
    '<footer class="folio-foot"><span>'+p.series+' <i>/</i> '+p.collection+'</span><span class="folio-pages"></span>'+arrows()+'</footer>';
}
function cinema(p, shots) {
  const strip = shots.map((shot,i)=>'<button type="button" data-frame="'+i+'" aria-label="放映'+shot.label+'"><img alt="" src="'+shot.src+'"></button>').join('');
  return imprint('场次 '+p.edition+' / 02')+
    '<div class="screen"><img class="picture" src="'+p.front+'" alt=""><div class="screen-copy">'+title(p)+'<p>'+p.lead+'</p>'+action()+'</div></div>'+
    '<footer class="cinema-foot"><div class="reel-status"><span class="live-label"></span><span class="reel-count"></span></div><div class="filmstrip" role="group" aria-label="镜头选择">'+strip+'</div></footer>';
}
function map(p) {
  const stops = p.stops.map(([,name],i)=>'<button type="button" data-frame="'+(i+2)+'" aria-label="查看'+name+'"><span class="stop-dot"></span><span>'+name+'</span></button>').join('');
  return imprint('路线 '+p.edition)+
    '<div class="ticket"><div class="ticket-copy">'+title(p)+'<p>'+p.lead+'</p>'+action()+'</div>'+
    '<figure class="map-photo"><img class="picture" src="'+p.front+'" alt=""><figcaption class="live-label"></figcaption></figure></div>'+
    '<footer class="map-foot"><div class="map-legend"><b>'+p.route+'</b><span>'+p.collection+'</span></div><div class="route" role="group" aria-label="'+p.route+'">'+stops+'</div></footer>';
}
const renderers = {folio,cinema,map};
const studies = [];
function mount(section, p) {
  const style = section.id;
  const views = frames(p);
  const paper = document.createElement('article');
  paper.className = 'sample '+style;
  paper.dataset.project = p.edition;
  paper.setAttribute('aria-label',p.title+'界面试样');
  paper.innerHTML = renderers[style](p,views);
  section.querySelector('.pair').append(paper);
  const art = paper.querySelector('.picture');
  const cta = paper.querySelector('.action');
  const label = paper.querySelector('.live-label');
  label.setAttribute('aria-live','polite');
  const first = {folio:'翻到背面',cinema:'放映背面',map:'查看全景'};
  let current = 0;
  function show(index) {
    current = index;
    const view = views[index];
    art.src = view.src;
    art.alt = view.alt || p.title+'中的'+view.label;
    label.textContent = view.label;
    paper.dataset.state = index === 0 ? 'front' : 'inside';
    const heading = paper.querySelector('h3');
    heading.innerHTML = index === 0 ? p.lines.map(line=>'<span>'+line+'</span>').join('') : view.label;
    heading.nextElementSibling.textContent = view.note || p.lead;
    paper.querySelector('.edition').hidden = index !== 0;
    paper.querySelector('[data-home]').hidden = index === 0;
    const back = index === views.length-1;
    const verb = index === 0 ? first[style] : back ? '回到原照' : index === 1 ? '看'+p.stops[0][1] : '下一处';
    cta.innerHTML = style==='cinema' ? icon(back?'reset':'play')+'<span>'+verb+'</span>' : '<span>'+verb+'</span>'+icon(back?'reset':'next');
    paper.querySelectorAll('.filmstrip button, .route button').forEach(button => button.setAttribute('aria-pressed',String(Number(button.dataset.frame)===index)));
    const pos = String(index+1).padStart(2,'0');
    const count = String(views.length).padStart(2,'0');
    if (style==='folio') {
      const inset = paper.querySelector('.inset');
      const detailIndex = index===0 ? 2 : 0;
      inset.dataset.frame = detailIndex;
      inset.setAttribute('aria-label','查看'+views[detailIndex].label);
      inset.querySelector('img').src = views[detailIndex].src;
      inset.querySelector('span').innerHTML = (index===0 ? p.stops[0][1] : '原照')+' '+icon('next');
      paper.querySelector('.figure-n').textContent = pos;
      paper.querySelector('.folio-pages').textContent = pos+' / '+count;
      paper.querySelector('[data-prev]').disabled = index===0;
    }
    if (style==='cinema') paper.querySelector('.reel-count').textContent = pos+' / '+count;
  }
  paper.addEventListener('click',event=>{
    const button = event.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-home')) { show(0); cta.focus({preventScroll:true}); }
    else if (button.hasAttribute('data-frame')) show(Number(button.dataset.frame));
    else if (button.hasAttribute('data-prev')) show(Math.max(0,current-1));
    else if (button.hasAttribute('data-next')) show((current+1)%views.length);
    syncToolbar();
  });
  show(0);
  studies.push({show,index:()=>current});
}
function syncToolbar() {
  document.querySelectorAll('[data-all]').forEach(button=>{
    const target = button.dataset.all==='front' ? 0 : 1;
    button.setAttribute('aria-pressed',String(studies.every(study=>study.index()===target)));
  });
}
document.querySelectorAll('.proposal').forEach(section=>projects.forEach(p=>mount(section,p)));
document.querySelectorAll('[data-all]').forEach(button=>button.addEventListener('click',()=>{
  const frame = button.dataset.all==='front' ? 0 : 1;
  studies.forEach(study=>study.show(frame));
  syncToolbar();
}));

import {getLanguage, onLanguageChange, t} from '../i18n/core.js';

const album = document.querySelector('#album');
const container = document.querySelector('#rooms');
const spread = album.querySelector('.spread');
const previewSwitch = album.querySelector('.preview-switch');
const status = album.querySelector('#catalog-status');
const retry = album.querySelector('#catalog-retry');
const works = new Map(), photos = new Map(), rooms = new Map();
let current = null;
let returning = false;

function localPath(value) {
  if (typeof value !== 'string' || !value) throw new Error('Missing catalog URL');
  const url = new URL(value, document.baseURI);
  if (url.origin !== location.origin || !['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Invalid catalog URL');
  }
  return value;
}

function updateEntry(key) {
  photos.get(key).querySelector('.entry-label').textContent = t(rooms.has(key) ? '继续放映' : '进入放映');
}

function updateTitle() {
  for (const [key, room] of rooms) room.title = works.get(key).title[getLanguage()];
  document.title = current ? rooms.get(current).title + ' · ' + t('背面宇宙') : t('Backside Universe · 放映相簿');
}

function updatePrint(link, work) {
  const view = album.dataset.preview === 'back' ? work.back : work.front;
  const image = link.querySelector('.print img');
  if (image.getAttribute('src') !== view.src) image.src = localPath(view.src);
  image.alt = view.alt[getLanguage()];
  link.querySelector('.print figcaption').textContent = view.caption[getLanguage()];
}

function updateCard(key, index) {
  const link = photos.get(key), work = works.get(key), lang = getLanguage();
  const number = document.createElement('i');
  number.textContent = String(index + 1).padStart(2, '0');
  link.querySelector('.folio > span').replaceChildren(lang === 'en' ? 'Screening ' : '第 ', number, lang === 'en' ? '' : ' 场');
  link.querySelector('.theme').textContent = work.theme[lang];
  link.querySelector('h2').textContent = work.title[lang];
  link.querySelector('.legend p').textContent = work.description[lang];
  link.querySelectorAll('.filmstrip figcaption').forEach((caption, i) => {
    caption.textContent = work.strip[i].caption[lang];
  });
  updatePrint(link, work);
  updateEntry(key);
}

function makeCard(work) {
  const link = album.querySelector('#work-card').content.firstElementChild.cloneNode(true);
  link.dataset.work = work.id;
  link.href = localPath(work.entry);
  link.querySelector('h2').id = work.id + '-title';
  link.querySelector('.entry').id = work.id + '-enter';
  link.setAttribute('aria-labelledby', work.id + '-title ' + work.id + '-enter');
  link.querySelector('.print img').dataset.still = localPath(work.back.src);
  for (const still of work.strip) {
    const figure = document.createElement('figure');
    const image = document.createElement('img');
    image.width = 248;
    image.height = 136;
    image.alt = '';
    image.src = localPath(still.src);
    figure.append(image, document.createElement('figcaption'));
    link.querySelector('.filmstrip').append(figure);
  }
  return link;
}

async function loadCatalog() {
  retry.hidden = true;
  status.textContent = '正在打开相簿…';
  try {
    const response = await fetch('./catalog/works.json', {cache: 'no-cache'});
    if (!response.ok) throw new Error('Catalog HTTP ' + response.status);
    const data = await response.json();
    const cards = document.createDocumentFragment();
    for (const [index, work] of data.works.entries()) {
      if (!/^[a-z0-9-]+$/.test(work.id) || works.has(work.id)) throw new Error('Invalid work ID');
      const link = makeCard(work);
      works.set(work.id, work);
      photos.set(work.id, link);
      updateCard(work.id, index);
      cards.append(link);
    }
    spread.replaceChildren(cards);
    status.hidden = works.size > 0;
    status.textContent = works.size ? '' : '暂无放映作品';
    album.querySelector('.edition b').textContent = String(works.size);
    album.querySelector('.edition').hidden = false;
    previewSwitch.hidden = works.size === 0;
    route();
  } catch (error) {
    works.clear();
    photos.clear();
    status.hidden = false;
    status.textContent = '作品目录暂时无法打开。';
    retry.hidden = false;
    console.error(error);
  }
}

retry.addEventListener('click', loadCatalog);
onLanguageChange(() => {
  [...works.keys()].forEach(updateCard);
  updateTitle();
});
previewSwitch.addEventListener('click', event => {
  const selected = event.target.closest('button[data-preview]');
  if (!selected || selected.getAttribute('aria-pressed') === 'true') return;
  album.dataset.preview = selected.dataset.preview;
  for (const [key, link] of photos) updatePrint(link, works.get(key));
  for (const button of previewSwitch.querySelectorAll('button')) {
    button.setAttribute('aria-pressed', String(button === selected));
  }
});

function show(key) {
  const link = photos.get(key);
  const previous = current;
  current = link ? key : null;
  album.hidden = Boolean(link);
  document.body.classList.toggle('in-room', Boolean(link));
  if (link && !rooms.has(key)) {
    if (rooms.size >= 2) {
      const oldest = rooms.keys().next().value;
      rooms.get(oldest).remove();
      rooms.delete(oldest);
      updateEntry(oldest);
    }
    const room = document.createElement('iframe');
    room.title = works.get(key).title[getLanguage()];
    room.dataset.screeningRoom = key;
    const url=new URL(link.href);url.searchParams.set('lang',getLanguage());
    room.src = url;
    rooms.set(key,room);
    container.append(room);
    updateEntry(key);
  }
  if (link) {
    const active = rooms.get(key);
    rooms.delete(key);
    rooms.set(key, active);
  }
  for (const [id, room] of rooms) {
    room.inert = id!==current;
    room.contentWindow.postMessage({type:'album:visibility'},location.origin);
  }
  updateTitle();
  if (link) rooms.get(key).focus({preventScroll:true});
  else if (previous) photos.get(previous)?.focus({preventScroll:true});
}
function route() {
  returning=false;
  const key=location.hash.slice(1);
  if ((photos.has(key)?key:null)!==current) show(key);
}
album.addEventListener('click',event=>{
  const link = event.target.closest('a[data-work]');
  if (!link || event.button!==0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  const key = link.dataset.work;
  history.pushState({fromAlbum:true},'','#'+key);
  show(key);
});
window.addEventListener('hashchange',route);
window.addEventListener('popstate',()=>{
  // Changing language in a room can change the search string as well as the
  // hash on Back. Browsers may emit only popstate for that traversal.
  const url=new URL(location.href);
  if(url.searchParams.has('lang') && url.searchParams.get('lang')!==getLanguage()){
    url.searchParams.set('lang',getLanguage());history.replaceState(history.state,'',url);
  }
  route();
});
window.addEventListener('message',event=>{
  if (returning || event.origin!==location.origin || event.source!==rooms.get(current)?.contentWindow || event.data?.type!=='album:return') return;
  if (history.state?.fromAlbum) { returning=true; history.back(); }
  else { history.replaceState(null,'',location.pathname+location.search); show(null); }
});
loadCatalog();

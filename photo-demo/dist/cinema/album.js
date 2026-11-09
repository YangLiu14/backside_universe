// Retain the live documents, including decoded meshes, textures and camera position.
const album = document.querySelector('#album');
const container = document.querySelector('#rooms');
const photos = new Map([...album.querySelectorAll('[data-work]')].map(a=>[a.dataset.work,a]));
const rooms = new Map();
album.querySelector('.edition b').textContent = String(photos.size);
const albumTitle = document.title;
let current = null;
let returning = false;

const previewSwitch = album.querySelector('.preview-switch');
const prints = [...photos.values()].map(link => {
  const image = link.querySelector('.print img');
  const caption = link.querySelector('.print figcaption');
  return {image, caption, source: image.getAttribute('src'), alt: image.alt, label: caption.textContent};
});
previewSwitch.addEventListener('click', event => {
  const selected = event.target.closest('button[data-preview]');
  if (!selected || selected.getAttribute('aria-pressed') === 'true') return;
  const back = selected.dataset.preview === 'back';
  album.dataset.preview = selected.dataset.preview;
  for (const {image, caption, source, alt, label} of prints) {
    image.src = back ? image.dataset.still : source;
    image.alt = back ? image.dataset.stillAlt : alt;
    caption.textContent = back ? caption.dataset.stillCaption : label;
  }
  for (const button of previewSwitch.querySelectorAll('button')) {
    button.setAttribute('aria-pressed', String(button === selected));
  }
});
previewSwitch.hidden = false;

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
      photos.get(oldest).querySelector('.entry-label').textContent = '进入放映';
    }
    const room = document.createElement('iframe');
    room.title = link.querySelector('h2').textContent;
    room.dataset.screeningRoom = key;
    room.src = link.href;
    rooms.set(key,room);
    container.append(room);
    link.querySelector('.entry-label').textContent = '继续放映';
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
  document.title = link ? rooms.get(key).title+' · 背面宇宙' : albumTitle;
  if (link) rooms.get(key).focus({preventScroll:true});
  else if (previous) photos.get(previous)?.focus({preventScroll:true});
}
function route() { returning=false; show(location.hash.slice(1)); }
album.addEventListener('click',event=>{
  const link = event.target.closest('a[data-work]');
  if (!link || event.button!==0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  const key = link.dataset.work;
  history.pushState({fromAlbum:true},'','#'+key);
  show(key);
});
window.addEventListener('hashchange',route);
window.addEventListener('message',event=>{
  if (returning || event.origin!==location.origin || event.source!==rooms.get(current)?.contentWindow || event.data?.type!=='album:return') return;
  if (history.state?.fromAlbum) { returning=true; history.back(); }
  else { history.replaceState(null,'',location.pathname+location.search); show(null); }
});
route();

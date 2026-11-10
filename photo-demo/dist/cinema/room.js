// The album owns at most one document per photograph. Its inert flag is also
// readable during module startup if the visitor leaves before loading finishes.
let host;
try { host = window.frameElement?.hasAttribute('data-screening-room') ? window.frameElement : null; } catch {}
export const roomVisible = () => !document.hidden && !host?.inert;
export function onRoomVisibility(listener) {
  let previous;
  function update() {
    const visible = roomVisible();
    if (visible!==previous) { previous=visible; listener(visible); }
  }
  document.addEventListener('visibilitychange',update);
  if (host) window.addEventListener('message',event=>{
    if (event.origin===location.origin && event.source===parent && event.data?.type==='album:visibility') update();
  });
  update();
}
const back = document.querySelector('[data-album-back]');
if (host) back?.addEventListener('click',event=>{
  if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  parent.postMessage({type:'album:return'},location.origin);
});

// Keep the same sampling density as the stage grows or moves between displays.
export function resizeScreen(renderer,width,height){
  const ratio=Math.min(devicePixelRatio||1,1.5);
  renderer.setDrawingBufferSize(width,height,ratio);
}

// Browsers can discard a background GPU context on memory-constrained devices.
const canvas = document.querySelector('#world');
canvas?.addEventListener('webglcontextlost',()=>{
  const stage = document.querySelector('#stage');
  if (!stage || stage.querySelector('.projection-recovery')) return;
  const recovery = document.createElement('div');
  recovery.className = 'projection-recovery';
  recovery.setAttribute('role','alert');
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = '重新打开放映';
  retry.addEventListener('click',()=>location.reload());
  recovery.append('三维画面已中断。',retry);
  stage.append(recovery);
});
canvas?.addEventListener('webglcontextrestored',()=>{
  document.querySelector('.projection-recovery')?.remove();
});

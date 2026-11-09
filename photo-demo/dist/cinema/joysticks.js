import {onRoomVisibility} from './room.js';

export function createJoysticks(stage) {
  const touch = matchMedia('(any-pointer: coarse)');
  const orientation = matchMedia('(orientation: landscape)');
  const bar = document.createElement('div');
  bar.className = 'scene-sticks';
  bar.hidden = true;
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', '游览摇杆');
  stage.after(bar);

  function makeStick(name, label, sensitivity) {
    const pad = document.createElement('div');
    pad.className = 'scene-stick';
    pad.dataset.stick = name;
    const knob = document.createElement('span');
    knob.className = 'stick-knob';
    const caption = document.createElement('span');
    caption.className = 'stick-label';
    caption.textContent = label;
    pad.append(knob, caption);
    bar.append(pad);

    const axis = {x: 0, y: 0};
    let pointer = null, centerX, centerY, radius;
    function reset() {
      const id = pointer;
      pointer = null;
      if (id !== null && pad.hasPointerCapture(id)) pad.releasePointerCapture(id);
      axis.x = axis.y = 0;
      knob.style.removeProperty('transform');
      pad.removeAttribute('data-held');
    }
    function track(e) {
      if (pointer !== e.pointerId) return;
      const x = e.clientX - centerX, y = e.clientY - centerY;
      const length = Math.hypot(x, y);
      const travel = Math.min(1, length / radius);
      const gain = sensitivity * Math.max(0, (travel - .12) / .88) / (length || 1);
      axis.x = x * gain;
      axis.y = y * gain;
      const scale = Math.min(1, radius / (length || 1));
      knob.style.transform = `translate(${x * scale}px, ${y * scale}px)`;
    }
    pad.addEventListener('pointerdown', e => {
      if (pointer !== null || e.button !== 0) return;
      e.preventDefault();
      const box = pad.getBoundingClientRect();
      centerX = box.left + box.width / 2;
      centerY = box.top + box.height / 2;
      radius = (box.width - knob.offsetWidth) / 2 - 3;
      pointer = e.pointerId;
      pad.setPointerCapture(pointer);
      pad.setAttribute('data-held', '');
      track(e);
    });
    pad.addEventListener('pointermove', track);
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      pad.addEventListener(type, e => { if (e.pointerId === pointer) reset(); });
    }
    return {axis, reset};
  }

  const move = makeStick('move', '移动', 1);
  const look = makeStick('look', '视角', .8);
  let owner = null;
  function reset() { move.reset(); look.reset(); }
  for (const event of ['blur', 'pagehide']) window.addEventListener(event, reset);
  orientation.addEventListener('change', reset);
  onRoomVisibility(visible => { if (!visible) reset(); });
  stage.querySelector('canvas')?.addEventListener('webglcontextlost', () => activate(null));
  const axes = {move: move.axis, look: look.axis};
  function activate(next) {
    if (!touch.matches) next = null;
    if (owner !== next) {
      reset();
      owner = next;
      bar.hidden = !owner;
      stage.toggleAttribute('data-joysticks', Boolean(owner));
    }
    return owner ? axes : null;
  }
  return {activate, reset};
}

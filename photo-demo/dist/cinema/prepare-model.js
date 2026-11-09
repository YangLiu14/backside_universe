// Stream GPU uploads across frames, including when several GLBs finish together.
export function createModelPreparation(renderer, compile) {
  const uploaded = new WeakSet();
  const queue = [];
  function nextFrame() {
    queue.shift()();
    if (queue.length) requestAnimationFrame(nextFrame);
  }
  function schedule() {
    return new Promise(resolve => {
      queue.push(resolve);
      if (queue.length === 1) requestAnimationFrame(nextFrame);
    });
  }
  return async function prepare(model) {
    const textures = new Set();
    model.traverse(object => {
      if (!object.isMesh) return;
      for (const material of [].concat(object.material)) {
        for (const value of Object.values(material)) {
          if (value?.isTexture && !uploaded.has(value)) textures.add(value);
        }
      }
    });
    const programs = compile(model);
    for (const texture of textures) {
      if (uploaded.has(texture)) continue;
      await schedule();
      renderer.initTexture(texture);
      uploaded.add(texture);
    }
    await programs;
  };
}

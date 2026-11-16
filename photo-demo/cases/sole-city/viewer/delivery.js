// Phone delivery changes texture resolution and transport, never scene geometry.
// Keep the original package available to older browsers and for visual comparison.
const full = new URLSearchParams(location.search).get('quality') === 'full';
export const mobileDelivery = !full && matchMedia('(pointer:coarse)').matches;

async function unpack(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Asset unavailable (${response.status}): ${url}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  // Hosts may declare Content-Encoding:gzip, in which case fetch already decoded it.
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes.buffer;
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}

export async function loadModel(loader, file) {
  const source = new URL(file, import.meta.url);
  const name = source.pathname.slice(source.pathname.lastIndexOf('/') + 1);
  const delivered = mobileDelivery ? new URL(`./mobile/${name}`, import.meta.url) : source;
  if (typeof DecompressionStream === 'undefined') return loader.loadAsync(delivered.href);
  const bytes = await unpack(delivered.href + '.gz');
  return loader.parseAsync(bytes, new URL('./', delivered).href);
}

export async function roomSource(file) {
  if (!file.endsWith('.ply') || typeof DecompressionStream === 'undefined') return {url:file};
  return {fileBytes:new Uint8Array(await unpack(file + '.gz')),fileType:'ply'};
}

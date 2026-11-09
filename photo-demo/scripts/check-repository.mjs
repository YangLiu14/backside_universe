// Inspect staged Git objects, not working-tree sizes, before committing source.
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const appRoot=fileURLToPath(new URL('../',import.meta.url));
const repoRoot=execFileSync('git',['rev-parse','--show-toplevel'],{cwd:appRoot,encoding:'utf8'}).trim();
const entries=execFileSync('git',['ls-files','--stage','-z'],{cwd:repoRoot,encoding:'utf8'}).split('\0').filter(Boolean).map(line=>{
  const [metadata,...name]=line.split('\t');const [mode,oid,stage]=metadata.split(' ');return {mode,oid,stage,path:name.join('\t')};
});
const sizes=execFileSync('git',['cat-file','--batch-check=%(objectname) %(objecttype) %(objectsize)'],{cwd:repoRoot,input:entries.map(e=>e.oid).join('\n')+'\n',encoding:'utf8'}).trim().split('\n');
const media=/\.(?:png|jpe?g|webp|gif|svg|bmp|ico|tiff?|avif|heic|heif|exr|hdr|mp4|mov|webm|mp3|wav|ogg|glb|gltf|obj|fbx|blend|stl|ply|splat|ksplat|spz|rad|usda?|usdc|usdz|bin|npy|npz|pt|pth|ckpt|safetensors|onnx|h5|hdf5|zip|tar|gz|tgz|7z|whl|dmg|bundle)$/i;
const local=/(?:^|\/)(?:node_modules|\.venv|venv|__pycache__|evidence|checkpoints|wheels)(?:\/|$)/;
// Explicit README preview exception; scene assets remain local-only.
const documentationMedia=new Map([
  ['docs/media/desk-to-islands.gif',16*1024*1024],
  ['docs/diagrams/photo-to-world.svg',128*1024],
  ['docs/diagrams/photo-to-world-mobile.svg',128*1024],
]);
const problems=[];let total=0,largest=0;
for(let i=0;i<entries.length;i++){
  const e=entries[i],size=Number(sizes[i]?.split(' ')[2]);total+=size;largest=Math.max(largest,size);
  if(e.stage!=='0')problems.push(`${e.path}: unresolved merge stage`);
  if(e.mode==='160000')problems.push(`${e.path}: nested repository/gitlink; source must be tracked as ordinary files`);
  const limit=documentationMedia.get(e.path)||2*1024*1024;
  if(!Number.isFinite(size)||size>limit)problems.push(`${e.path}: exceeds the ${limit/1024/1024} MiB file limit`);
  if((media.test(e.path)&&!documentationMedia.has(e.path))||local.test(e.path))problems.push(`${e.path}: local-only asset or environment is tracked`);
  if(/(?:^|\/)\.env(?:\.[^/]*)?$/.test(e.path)&&!e.path.endsWith('/.env.example')&&e.path!=='.env.example')problems.push(`${e.path}: local credentials are tracked`);
  if(/\.(?:pem|key)$/i.test(e.path))problems.push(`${e.path}: private key file is tracked`);
  if(/(?:^|\/)dist\/[^/]+-lab\/assets\//.test(e.path)&&!e.path.endsWith('/scene.json'))problems.push(`${e.path}: generated lab asset is tracked`);
}
if(problems.length){console.error(problems.join('\n'));process.exit(1);}
console.log(`Repository index OK: ${entries.length} source/config/doc files, ${total} bytes total, largest ${largest} bytes; no local-only media, models, or environments.`);

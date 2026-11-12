import http from 'node:http';
import {createReadStream} from 'node:fs';
import {access, stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';

const {values} = parseArgs({options:{
  album:{type:'string'}, scenes:{type:'string'}, host:{type:'string', default:'127.0.0.1'},
}});
if (Boolean(values.album) !== Boolean(values.scenes)) {
  throw new Error('Preview a release with both --album and --scenes');
}
const albumRoot = values.album ? path.resolve(values.album) : fileURLToPath(new URL('../dist', import.meta.url));
const sceneRoot = values.scenes ? path.resolve(values.scenes) : albumRoot;
await Promise.all([access(path.join(albumRoot,'index.html')), access(path.join(sceneRoot,'catalog/works.json'))]);
const port=Number(process.env.PORT||9988);
const mime={
  '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8',
  '.json':'application/json','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp',
  '.glb':'model/gltf-binary','.wasm':'application/wasm','.mp4':'video/mp4','.m4a':'audio/mp4','.mp3':'audio/mpeg',
};
http.createServer(async(req,res)=>{
  if (!['GET','HEAD'].includes(req.method)) return res.writeHead(405,{Allow:'GET, HEAD'}).end();
  try {
    const urlPath=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const root=/^\/(catalog|releases)\//.test(urlPath) ? sceneRoot : albumRoot;
    const file=path.resolve(root,'.'+urlPath+(urlPath.endsWith('/')?'index.html':''));
    if (!file.startsWith(root+path.sep)) return res.writeHead(403).end();
    const info=await stat(file);
    if (!info.isFile()) return res.writeHead(404).end();
    const etag='"'+info.size.toString(16)+'-'+info.mtimeMs.toString(16)+'"';
    const headers={
      'Content-Type':mime[path.extname(file)]||'application/octet-stream',
      'Cache-Control':'private, no-cache', ETag:etag, 'Last-Modified':info.mtime.toUTCString(),
      'Accept-Ranges':'bytes',
    };
    // A refreshed scene may reuse the bytes on disk after validating its version.
    const validators=req.headers['if-none-match']?.split(',').map(s=>s.trim().replace(/^W\//,''));
    if (validators?.includes(etag)||validators?.includes('*')) return res.writeHead(304,headers).end();
    let start=0,end=info.size-1,status=200;
    const range=req.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
    if (range && (range[1]||range[2]) && (!req.headers['if-range']||req.headers['if-range']===etag)) {
      start=range[1]?Number(range[1]):Math.max(0,info.size-Number(range[2]));
      if (range[1]&&range[2]) end=Math.min(end,Number(range[2]));
      if (start>end) return res.writeHead(416,{...headers,'Content-Range':'bytes */'+info.size}).end();
      headers['Content-Range']='bytes '+start+'-'+end+'/'+info.size; status=206;
    }
    res.writeHead(status,{...headers,'Content-Length':end-start+1});
    if (req.method==='HEAD'||!info.size) return res.end();
    const stream=createReadStream(file,{start,end});
    res.on('close',()=>stream.destroy());
    stream.on('error',()=>res.destroy());
    stream.pipe(res);
  } catch { res.writeHead(404).end(); }
}).listen(port,values.host,()=>console.log('Preview: http://'+values.host+':'+port+'/'));

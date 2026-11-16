// Exercise both HTTP gzip delivery modes through the actual room loader.
const assert=require('node:assert/strict');
const http=require('node:http');
const {gzipSync}=require('node:zlib');
const {once}=require('node:events');
const {test}=require('node:test');

test('lossless room transport, browser-decoded gzip, errors and legacy fallback',async()=>{
  global.location={search:''};global.matchMedia=()=>({matches:true});
  const {roomSource}=await import('./viewer/delivery.js');
  const original=Buffer.from('ply\nformat binary_little_endian 1.0\nend_header\n\0\1\2\3');
  const zipped=gzipSync(original);
  const server=http.createServer((req,res)=>{
    if(req.url.includes('missing')){res.writeHead(503);res.end('Unavailable');return;}
    res.writeHead(200,req.url.includes('automatic')?{'Content-Encoding':'gzip'}:{});
    res.end(zipped);
  }).listen(0,'127.0.0.1');
  await once(server,'listening');
  const origin=`http://127.0.0.1:${server.address().port}`;
  const native=global.DecompressionStream;
  const nativeFetch=global.fetch;
  try{
    for(const name of ['raw','automatic']){
      const result=await roomSource(`${origin}/${name}.ply`);
      assert.equal(result.fileType,'ply');
      assert.deepEqual(Buffer.from(result.fileBytes),original);
    }
    await assert.rejects(roomSource(`${origin}/missing.ply`),/503/);
    global.DecompressionStream=undefined;
    assert.deepEqual(await roomSource('room.ply'),{url:'room.ply'});
    assert.deepEqual(await roomSource('room.spz'),{url:'room.spz'});
    global.DecompressionStream=native;
    const requested=[];
    global.fetch=url=>{requested.push(new URL(url).pathname);return nativeFetch(`${origin}/raw.ply`);};
    for(const [mode,touch,search,mobile] of [
      ['phone',true,'',true],['desktop',false,'',false],['full',true,'?quality=full',false],
    ]){
      global.matchMedia=()=>({matches:touch});global.location={search};
      const delivery=await import(`./viewer/delivery.js?test=${mode}`);
      const loader={
        parseAsync:async(bytes,base)=>({bytes:Buffer.from(bytes),base}),
        loadAsync:async url=>({legacy:url}),
      };
      const model=await delivery.loadModel(loader,'building.glb');
      assert.deepEqual(model.bytes,original);
      assert.equal(model.base.endsWith('/mobile/'),mobile);
      assert(requested.at(-1).endsWith(mobile?'/mobile/building.glb.gz':'/viewer/building.glb.gz'));
      global.DecompressionStream=undefined;
      const fallback=await delivery.loadModel(loader,'building.glb');
      assert(fallback.legacy.endsWith(mobile?'/mobile/building.glb':'/viewer/building.glb'));
      global.DecompressionStream=native;
    }
  }finally{
    global.DecompressionStream=native;
    global.fetch=nativeFetch;
    server.close();server.closeAllConnections();
    delete global.location;delete global.matchMedia;
  }
});

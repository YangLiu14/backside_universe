// Run against the local asset server. With --write, record a new calibration;
// without it, compare the checked-in surfaces against both actual curved pages.
const {launchBrowser,baseURL}=require('./marble-browser.cjs');
const {createHash}=require('node:crypto');
const {readFile,writeFile}=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const folder=path.join(__dirname,'../dist/holiday-assets/assets/bookroom');

(async()=>{
 const browser=await launchBrowser();
 try{
  const page=await browser.newPage();
  await page.route('**/book-calibration',r=>r.fulfill({contentType:'text/html',body:
    '<script type="importmap">{"imports":{"three":"/vendor/three.module.js","three/addons/":"/vendor/addons/"}}</script>'}));
  await page.goto(baseURL+'/book-calibration');
  const calibration=await page.evaluate(async verifyInk=>{
   const THREE=await import('three');
   const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
   const {DRACOLoader}=await import('three/addons/loaders/DRACOLoader.js');
   const loader=new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath('/vendor/draco/'));
   const {scene}=await loader.loadAsync('/holiday-assets/assets/bookroom/desk.glb');
   scene.updateMatrixWorld(true);
   const ray=new THREE.Raycaster(), down=new THREE.Vector3(0,-1,0);
   function heightAt(x,z){
    ray.set(new THREE.Vector3(x,2,z),down);
    const hit=ray.intersectObject(scene,true)[0];
    if(!hit)throw Error('Missing desk surface');
    return hit.point.y+.00065;
   }
   const columns=20,rows=28,centerX=.047;
   function sample(z,height){
    const width=.125;
    const vertices=new THREE.PlaneGeometry(width,height,columns,rows).attributes.position;
    const heights=Array.from({length:vertices.count},(_,i)=>Math.fround(heightAt(centerX+vertices.getY(i),z+vertices.getX(i))));
    return {z,width,height,heights};
   }
   const surface={columns,rows,centerX,centerY:heightAt(centerX,.108),photo:sample(.108,.125*1739/1320),dedication:sample(-.065,.165)};
   if(verifyInk){
    const {printBook}=await import('/holiday-assets/bookroom-book.js');
    const book=await printBook(scene);
    for(const [mesh,grid] of [[book.photo,surface.photo],[scene.getObjectByName('book-dedication'),surface.dedication]]){
     const positions=mesh.geometry.attributes.position;
     if(positions.count!==grid.heights.length||grid.heights.some((h,i)=>positions.getY(i)!==h))throw Error('Ink does not follow the calibrated page');
    }
   }
   return surface;
  },!process.argv.includes('--write'));
  calibration.deskSHA256=createHash('sha256').update(await readFile(path.join(folder,'desk.glb'))).digest('hex');
  const output=path.join(folder,'page-surfaces.json');
  if(process.argv.includes('--write'))await writeFile(output,JSON.stringify(calibration)+'\n');
  else assert.deepEqual(calibration,JSON.parse(await readFile(output,'utf8')));
  console.log((calibration.photo.heights.length+calibration.dedication.heights.length)+' curved page vertices verified');
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});

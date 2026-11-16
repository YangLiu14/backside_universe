import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const vendor=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../dist/vendor');
export async function resolve(specifier,context,nextResolve){
  if(specifier==='three')return {url:pathToFileURL(path.join(vendor,'three.module.js')).href,shortCircuit:true};
  if(specifier.startsWith('three/addons/'))return {url:pathToFileURL(path.join(vendor,specifier.slice(6))).href,shortCircuit:true};
  return nextResolve(specifier,context);
}

import {LoadingManager} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';

export async function createDeskModelLoader() {
  const manager = new LoadingManager();
  if (matchMedia('(any-pointer: coarse)').matches) {
    const root = new URL('../', import.meta.url);
    const mobile = new URL('desk-mobile/', root);
    const response = await fetch(new URL('catalog.json', mobile));
    if (!response.ok) throw new Error('工位移动端模型清单加载失败');
    const variants = new Map((await response.json()).map(path => [
      new URL(path, root).href, new URL(path, mobile).href,
    ]));
    manager.setURLModifier(path => variants.get(new URL(path, document.baseURI).href) ?? path);
  }
  const draco = new DRACOLoader().setDecoderPath('../vendor/draco/').setWorkerLimit(2);
  return new GLTFLoader(manager).setDRACOLoader(draco);
}

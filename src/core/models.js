// Model loading. glTF with Draco geometry and KTX2 textures, decoders from the CDN.
// Each URL downloads once per page, however many mounts use it.

import { Box3, Vector3, Group } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

const THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.185.1/examples/jsm/libs/';

const draco = new DRACOLoader().setDecoderPath(THREE_CDN + 'draco/gltf/');
const ktx2 = new KTX2Loader().setTranscoderPath(THREE_CDN + 'basis/');
const gltf = new GLTFLoader().setDRACOLoader(draco).setKTX2Loader(ktx2);

let ktx2Ready = false;
const downloads = new Map();

// KTX2 needs to know what the GPU supports before the first texture is decoded.
export function initKTX2(renderer) {
  if (ktx2Ready) return;
  ktx2.detectSupport(renderer);
  ktx2Ready = true;
}

function download(url) {
  if (!downloads.has(url)) downloads.set(url, gltf.loadAsync(url));
  return downloads.get(url);
}

// Start downloads early (from attribute parsing), before any renderer exists.
export function preloadModels(urls) {
  for (const url of urls) if (url) download(url).catch(() => {});
}

// A fresh, centred, unit-height copy of the model for one mount.
export async function loadModel(url) {
  const { scene } = await download(url);
  const model = scene.clone(true);
  const box = new Box3().setFromObject(model);
  const size = box.getSize(new Vector3());
  const centre = box.getCenter(new Vector3());
  model.position.sub(centre);
  const holder = new Group();
  holder.add(model);
  holder.scale.setScalar(1 / (size.y || 1));
  holder.userData.aspect = size.x / (size.y || 1);
  holder.traverse((o) => {
    if (o.isMesh) {
      o.material = o.material.clone();
      o.material.transparent = true;
      o.frustumCulled = false;
    }
  });
  return holder;
}

export function setModelOpacity(model, opacity) {
  model.traverse((o) => {
    if (o.isMesh) {
      o.material.opacity = opacity;
      o.material.depthWrite = opacity > 0.99;
    }
  });
}

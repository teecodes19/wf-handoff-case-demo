// Lighting presets. Reflections come from a prefiltered room environment; the preset sets
// its strength and the key light. Set once per mount, not switchable at runtime.

import { PMREMGenerator, DirectionalLight, AmbientLight } from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const PRESETS = {
  light: { envIntensity: 1, key: 2.2, keyColor: 0xffffff, ambient: 0.35, exposure: 1 },
  dark: { envIntensity: 0.6, key: 3.0, keyColor: 0xfff1e0, ambient: 0.12, exposure: 0.9 }
};

const cache = new WeakMap();

export function buildEnvironment(renderer, scene, name = 'light', { intensity = 1, exposure } = {}) {
  const preset = PRESETS[name] || PRESETS.light;

  // One prefiltered environment per renderer; it's the expensive part.
  let env = cache.get(renderer);
  if (!env) {
    const pmrem = new PMREMGenerator(renderer);
    env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    cache.set(renderer, env);
  }
  scene.environment = env;
  scene.environmentIntensity = preset.envIntensity * intensity;

  const key = new DirectionalLight(preset.keyColor, preset.key);
  key.position.set(2.5, 3, 4);
  scene.add(key, new AmbientLight(0xffffff, preset.ambient));

  renderer.toneMappingExposure = exposure ?? preset.exposure;
  return { key, preset };
}

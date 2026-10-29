// A stage is one renderer + scene + camera bound to one element. It renders only while the
// element is on screen and something changed, follows the element's size, and survives a
// lost WebGL context.

import { WebGLRenderer, Scene, PerspectiveCamera, ACESFilmicToneMapping, SRGBColorSpace } from 'three';
import { gsap } from './gsap.js';

const MAX_DPR = 2;

export function createStage(el, { fixed = false, fov = 30 } = {}) {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_DPR));
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.outputColorSpace = SRGBColorSpace;

  const canvas = renderer.domElement;
  canvas.style.cssText = fixed
    ? 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;display:block'
    : 'position:absolute;inset:0;width:100%;height:100%;display:block';
  if (!fixed && getComputedStyle(el).position === 'static') el.style.position = 'relative';
  el.appendChild(canvas);

  const scene = new Scene();
  const camera = new PerspectiveCamera(fov, 1, 0.1, 100);
  camera.position.set(0, 0, 4);

  const stage = {
    el, renderer, scene, camera, canvas,
    width: 1, height: 1,
    visible: true,
    dirty: true,
    updaters: new Set(),
    onResize: new Set(),
    invalidate() { stage.dirty = true; },
    dispose
  };

  // ---- size ----------------------------------------------------------------
  function resize() {
    const w = fixed ? window.innerWidth : el.clientWidth;
    const h = fixed ? window.innerHeight : el.clientHeight;
    if (!w || !h) return;
    stage.width = w;
    stage.height = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    stage.onResize.forEach((fn) => fn(stage));
    stage.dirty = true;
  }
  const ro = new ResizeObserver(resize);
  ro.observe(fixed ? document.documentElement : el);
  if (fixed) window.addEventListener('resize', resize);
  resize();

  // ---- visibility ----------------------------------------------------------
  const io = new IntersectionObserver(([entry]) => {
    stage.visible = fixed || entry.isIntersecting;
    if (stage.visible) stage.dirty = true;
  }, { rootMargin: '200px' });
  io.observe(el);

  // ---- context loss ----------------------------------------------------------
  // preventDefault lets the browser restore the context; three re-uploads on its own.
  canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
  canvas.addEventListener('webglcontextrestored', () => (stage.dirty = true));

  // ---- loop ------------------------------------------------------------------
  const tick = (time, delta) => {
    if (!stage.visible) return;
    stage.updaters.forEach((fn) => {
      if (fn(time, delta / 1000) !== false) stage.dirty = true;
    });
    if (!stage.dirty) return;
    stage.dirty = false;
    renderer.render(scene, camera);
  };
  gsap.ticker.add(tick);

  function dispose() {
    gsap.ticker.remove(tick);
    ro.disconnect();
    io.disconnect();
    renderer.dispose();
    canvas.remove();
  }

  return stage;
}

// Pixel rect on screen -> world-space centre and height at z = 0 for this camera.
export function screenToWorld(stage, rect) {
  const { camera } = stage;
  const dist = camera.position.z;
  const worldH = 2 * Math.tan((camera.fov * Math.PI) / 360) * dist;
  const perPx = worldH / stage.height;
  return {
    x: (rect.left + rect.width / 2 - stage.width / 2) * perPx,
    y: -(rect.top + rect.height / 2 - stage.height / 2) * perPx,
    height: rect.height * perPx
  };
}

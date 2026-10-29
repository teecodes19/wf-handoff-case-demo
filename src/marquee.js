// Warp marquee. A WebGL canvas repaints an existing image slider as an endless strip whose
// ends bend toward the camera. Each page opts in with markup alone:
//
//   .bullet-carousel > .swiper-wrapper > .swiper-slide > img
//
// The slider markup stays in the layout, so CSS still defines slide size and gap and the
// images still load, but it isn't painted. Sizes are read from the real boxes on every
// resize, so "how many are visible" is a CSS decision, not a JS one.

import {
  WebGLRenderer, Scene, PerspectiveCamera, PlaneGeometry, Mesh, ShaderMaterial,
  TextureLoader, SRGBColorSpace, LinearMipmapLinearFilter, Vector2
} from 'three';
import { gsap } from './core/gsap.js';

const CONFIG = {
  speed: 60,          // px per second
  depth: 0.3,         // how far the ends bend toward the camera, share of width
  flat: 1,            // undistorted centre window, in slide pitches
  perspective: 0.69,  // camera distance as a share of width; lower is stronger
  ease: 0.09,         // smoothing on the scroll position
  dragScale: 1.6,     // drag multiplier
  scrollBoost: 0.4    // page scroll velocity added to the strip
};

const vertex = /* glsl */ `
  uniform float uWidth;
  uniform float uDepth;
  uniform float uFlat;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    // Distance from the centre window, normalised to half the strip width.
    float d = max(abs(world.x) - uFlat * 0.5, 0.0) / (uWidth * 0.5);
    world.z += uDepth * uWidth * d * d;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragment = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec2 uPlane;
  uniform vec2 uImage;
  varying vec2 vUv;
  void main() {
    // object-fit: cover inside the slide box.
    vec2 ratio = vec2(
      min((uPlane.x / uPlane.y) / (uImage.x / uImage.y), 1.0),
      min((uPlane.y / uPlane.x) / (uImage.y / uImage.x), 1.0)
    );
    vec2 uv = vec2(vUv.x * ratio.x + (1.0 - ratio.x) * 0.5, vUv.y * ratio.y + (1.0 - ratio.y) * 0.5);
    gl_FragColor = texture2D(uMap, uv);
    #include <colorspace_fragment>
  }
`;

function marquee(section) {
  const wrapper = section.querySelector('.swiper-wrapper');
  const slides = [...section.querySelectorAll('.swiper-slide')];
  const imgs = slides.map((s) => s.querySelector('img')).filter(Boolean);
  if (!wrapper || imgs.length < 2) return;

  const renderer = new WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  const canvas = renderer.domElement;
  canvas.className = 'warp-canvas';
  section.appendChild(canvas);
  section.classList.add('is-draggable');
  section.tabIndex = 0;

  const scene = new Scene();
  const camera = new PerspectiveCamera(40, 1, 1, 10000);
  const geometry = new PlaneGeometry(1, 1, 24, 1);
  const loader = new TextureLoader();
  const uniforms = { uWidth: { value: 1 }, uDepth: { value: CONFIG.depth }, uFlat: { value: 1 } };

  const meshes = imgs.map((img) => {
    const texture = loader.load(img.currentSrc || img.src, (t) => {
      material.uniforms.uImage.value.set(t.image.width, t.image.height);
      dirty = true;
    });
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const material = new ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms: { ...uniforms, uMap: { value: texture }, uPlane: { value: new Vector2(1, 1) }, uImage: { value: new Vector2(1, 1) } }
    });
    const mesh = new Mesh(geometry, material);
    scene.add(mesh);
    return mesh;
  });

  // ---- layout --------------------------------------------------------------
  let width = 1, height = 1, pitch = 1, slideW = 1, slideH = 1, span = 1;
  function layout() {
    const box = section.getBoundingClientRect();
    width = box.width;
    height = box.height;
    const a = slides[0].getBoundingClientRect();
    const b = slides[1].getBoundingClientRect();
    slideW = a.width;
    slideH = a.height;
    pitch = b.left - a.left || slideW;
    span = pitch * meshes.length;

    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.position.z = width * CONFIG.perspective;
    camera.fov = (2 * Math.atan(height / 2 / camera.position.z) * 180) / Math.PI;
    camera.updateProjectionMatrix();

    uniforms.uWidth.value = width;
    uniforms.uFlat.value = CONFIG.flat * pitch;
    meshes.forEach((m) => {
      m.scale.set(slideW, slideH, 1);
      m.material.uniforms.uPlane.value.set(slideW, slideH);
    });
    dirty = true;
  }
  new ResizeObserver(layout).observe(section);
  layout();

  // ---- motion --------------------------------------------------------------
  let target = 0;
  let offset = 0;
  let dirty = true;
  let visible = true;
  let dragging = false;
  let lastX = 0;

  new IntersectionObserver(([e]) => (visible = e.isIntersecting), { rootMargin: '100px' }).observe(section);

  section.addEventListener('pointerdown', (e) => {
    dragging = true;
    lastX = e.clientX;
    section.classList.add('is-dragging');
    section.setPointerCapture(e.pointerId);
  });
  section.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    target -= (e.clientX - lastX) * CONFIG.dragScale;
    lastX = e.clientX;
  });
  const endDrag = () => {
    dragging = false;
    section.classList.remove('is-dragging');
  };
  section.addEventListener('pointerup', endDrag);
  section.addEventListener('pointercancel', endDrag);
  section.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') target += pitch;
    if (e.key === 'ArrowLeft') target -= pitch;
  });

  let lastScroll = window.scrollY;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  gsap.ticker.add((time, delta) => {
    if (!visible) return;
    const dt = Math.min(delta, 64) / 1000;
    const scrollY = window.scrollY;
    if (!reduce && !dragging) target += CONFIG.speed * dt + Math.abs(scrollY - lastScroll) * CONFIG.scrollBoost;
    lastScroll = scrollY;

    const before = offset;
    offset += (target - offset) * CONFIG.ease;
    if (Math.abs(offset - before) < 0.01 && !dirty) return;

    // Wrap each slide into [-span/2, span/2) around the centre for an endless strip.
    meshes.forEach((m, i) => {
      let x = i * pitch - offset;
      x = ((((x + span / 2) % span) + span) % span) - span / 2;
      m.position.x = x;
    });
    renderer.render(scene, camera);
    dirty = false;
  });

  wrapper.style.visibility = 'hidden';
}

document.querySelectorAll('.bullet-carousel').forEach(marquee);

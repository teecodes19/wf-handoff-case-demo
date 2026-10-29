// Can mounts, configured entirely through data attributes in the Webflow designer.
//
//   data-can                  marks the mount
//   data-can-behavior         ambient | drift
//   data-can-src              .glb url
//   data-can-models           roster for switching, JS-object style:
//                             {'day':{src:'…',facing:0},'night':{cycle:['a','b'],everySecs:4}}
//   data-can-env              light | dark
//   data-can-env-intensity    reflection strength multiplier
//   data-can-exposure         overall brightness
//   data-can-facing           degrees, which side faces the camera
//   data-can-slant            degrees, static lean
//   data-can-spin-secs        seconds per turn
//   data-can-poster           image shown until the 3D frame is ready
//   data-can-gate             "off": don't hold the page loader for this mount
//   data-can-from / -to       drift anchors
//   data-can-debug            expose window.__can
//
// The page runtime (window.bullet) owns scrolling and the loader. Without it every mount
// boots at once and nothing is gated.

import { gsap } from './core/gsap.js';
import { createStage } from './core/stage.js';
import { buildEnvironment } from './core/environments.js';
import { loadModel, preloadModels, initKTX2, setModelOpacity } from './core/models.js';
import { createPoster } from './core/poster.js';
import { createRig } from './core/rig.js';
import behaviors from './behaviors/index.js';

const site = window.bullet;
if (!site) console.warn('[data-can] no site runtime (window.bullet): mounts will not gate the loader');

// Webflow wraps attribute values in double quotes, so rosters are written JS-object style:
// single quotes, bare keys, trailing commas. Turn that into JSON without eval.
function looseJSON(text) {
  if (!text) return null;
  try {
    const json = text
      .replace(/'/g, '"')
      .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":')
      .replace(/,\s*([}\]])/g, '$1');
    return JSON.parse(json);
  } catch (err) {
    console.warn('[data-can] could not read', text, err);
    return null;
  }
}

const num = (v, d) => (v === undefined || v === '' || isNaN(+v) ? d : +v);

function readOptions(el) {
  const d = el.dataset;
  return {
    behavior: behaviors[d.canBehavior] ? d.canBehavior : 'ambient',
    src: d.canSrc,
    models: looseJSON(d.canModels),
    env: d.canEnv || 'light',
    envIntensity: num(d.canEnvIntensity, 1),
    exposure: d.canExposure ? num(d.canExposure, 1) : undefined,
    facing: num(d.canFacing, 0),
    slant: num(d.canSlant, 0),
    spinSecs: num(d.canSpinSecs, 12),
    poster: d.canPoster,
    gate: d.canGate !== 'off',
    from: d.canFrom,
    to: d.canTo,
    debug: 'canDebug' in d
  };
}

// ---- one mount -------------------------------------------------------------

async function boot(el, opts) {
  const roster = opts.models || {};
  const firstKey = Object.keys(roster).find((k) => roster[k].src);
  const src = opts.src || (firstKey && roster[firstKey].src);
  if (!src) return console.warn('[data-can] mount has no model', el);

  const poster = createPoster(el, opts.poster);
  const stage = createStage(el, { fixed: opts.behavior === 'drift' });
  initKTX2(stage.renderer);
  buildEnvironment(stage.renderer, stage.scene, opts.env, { intensity: opts.envIntensity, exposure: opts.exposure });

  const model = await loadModel(src);
  const facing = firstKey && !opts.src ? roster[firstKey].facing ?? opts.facing : opts.facing;
  const rig = createRig(model, { slant: opts.slant, facing });
  stage.scene.add(rig.root);
  behaviors[opts.behavior]({ stage, rig, opts, el });

  // Compile shaders and upload textures now, behind the poster, so the first visible frame
  // doesn't stutter.
  await stage.renderer.compileAsync(stage.scene, stage.camera);
  stage.renderer.render(stage.scene, stage.camera);
  setModelOpacity(model, 0);
  gsap.to({ o: 0 }, { o: 1, duration: 0.6, ease: 'power2.out', onUpdate() { setModelOpacity(model, this.targets()[0].o); stage.invalidate(); } });
  poster.reveal();

  const mount = { el, stage, rig, roster, current: firstKey, timer: null };
  if (opts.debug) window.__can = mount;
  return mount;
}

// ---- roster switching ------------------------------------------------------

async function setModel(mount, key) {
  const entry = mount.roster[key];
  if (!entry) return console.warn('[canflow] no model named', key);
  clearInterval(mount.timer);
  mount.current = key;

  if (entry.cycle) {
    let i = 0;
    const step = () => swapTo(mount, mount.roster[entry.cycle[i++ % entry.cycle.length]]);
    step();
    mount.timer = setInterval(step, (entry.everySecs || 4) * 1000);
    return;
  }
  return swapTo(mount, entry);
}

async function swapTo(mount, entry) {
  if (!entry || !entry.src) return;
  const next = await loadModel(entry.src);
  const prev = mount.rig.model;
  setModelOpacity(next, 0);
  mount.rig.swap(next);
  mount.rig.setFacing(entry.facing || 0);
  await mount.stage.renderer.compileAsync(mount.stage.scene, mount.stage.camera);
  gsap.to({ o: 0 }, { o: 1, duration: 0.45, onUpdate() { setModelOpacity(next, this.targets()[0].o); mount.stage.invalidate(); } });
  prev.traverse((o) => o.isMesh && o.material.dispose());
}

// ---- start -----------------------------------------------------------------

const mounts = [];
const els = [...document.querySelectorAll('[data-can]')];
const allOpts = els.map(readOptions);

// Start every model download now, before WebGL is even set up.
preloadModels(allOpts.flatMap((o) => [o.src, ...Object.values(o.models || {}).map((m) => m.src)]));

let gated = false;
els.forEach((el, i) => {
  const opts = allOpts[i];
  const booting = boot(el, opts).then((m) => m && mounts.push(m)).catch((err) => console.error('[data-can]', err));
  // The first mount that wants to gate holds the loader until its can is renderable.
  if (site && opts.gate && !gated) {
    gated = true;
    site.gate(booting);
  }
});

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-can-set]');
  if (btn) window.canflow.set(btn.getAttribute('data-can-set'));
});

window.canflow = Object.assign(window.canflow || {}, {
  mounts,
  // Switch every mount that has this model in its roster.
  set(key) {
    return Promise.all(mounts.filter((m) => m.roster[key]).map((m) => setModel(m, key)));
  },
  // Older page code calls canflow.scroll; the runtime owns it now.
  scroll: site ? site.scroll : { hold() {}, release() {} }
});

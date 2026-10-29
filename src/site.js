// Demo site runtime (clean-room stand-in for a real client runtime, used by the wf-handoff
// case study). Smooth scroll, scroll holds, the loader and the 3D bundle loader. No three.js.
//
//   <script src="…/site.min.js" data-canflow="…/can.min.js"></script>
//
//   bullet.scroll.hold(reason) / release(reason) / held
//   bullet.lenis      the page's Lenis, null until DOMContentLoaded
//   bullet.ready      resolves when the page is ready to be seen
//   bullet.progress   0..1, what the loader is showing
//   bullet.gate(p)    hold `ready` until promise `p` settles
//
//   <body data-smooth-scroll="off">   no smooth scroll on this page
//   <body data-page-loop>             wrap from the bottom back to the top
//   <div data-loader>                 loader overlay: gets --p and .is-done
//   <div data-loader-pct>             gets "LOADING n%"
//   [data-can]                        any mount makes this page load the 3D bundle

import Lenis from 'lenis';

const doc = document;
const root = doc.documentElement;
const tag = doc.currentScript;

const emit = (name, detail) => doc.dispatchEvent(new CustomEvent('bullet:' + name, { detail }));

// ---- scroll holds ----------------------------------------------------------

// Holds are keyed by reason, so the same reason held twice needs one release and
// mismatched stop/start calls from different features can't strand the page.
const holds = new Set();
let lenis = null;
const syncScroll = () => {
  if (lenis) holds.size ? lenis.stop() : lenis.start();
  root.classList.toggle('is-scroll-held', holds.size > 0);
};
const scroll = {
  hold(reason = 'api') {
    if (holds.has(reason)) return;
    holds.add(reason);
    syncScroll();
  },
  release(reason = 'api') {
    if (holds.delete(reason)) syncScroll();
  },
  get held() {
    return holds.size > 0;
  }
};

// ---- the loader ------------------------------------------------------------

// Everything the page waits on registers a gate. Progress is the share of settled gates,
// eased so the number never jumps backwards.
const gates = [];
let settled = 0;
let progress = 0;
let shown = 0;
let resolveReady;
const ready = new Promise((r) => (resolveReady = r));

const loader = () => doc.querySelector('[data-loader]');
const pctEl = () => doc.querySelector('[data-loader-pct]');

function gate(promise) {
  gates.push(promise);
  Promise.resolve(promise).catch(() => {}).finally(() => {
    settled++;
    setProgress(settled / gates.length);
  });
  return promise;
}

function setProgress(p) {
  progress = Math.max(progress, Math.min(1, p));
  emit('progress', { progress });
}

function paintLoader() {
  shown += (progress - shown) * 0.12;
  if (progress - shown < 0.002) shown = progress;
  const el = loader();
  if (el) {
    el.style.setProperty('--p', shown.toFixed(4));
    el.setAttribute('aria-valuenow', String(Math.round(shown * 100)));
  }
  const pct = pctEl();
  if (pct) pct.textContent = `LOADING ${Math.round(shown * 100)}%`;
  if (shown < 1) requestAnimationFrame(paintLoader);
}

async function finishLoading() {
  scroll.hold('loader');
  gate(doc.fonts ? doc.fonts.ready : Promise.resolve());
  gate(new Promise((r) => (doc.readyState === 'complete' ? r() : addEventListener('load', r, { once: true }))));
  requestAnimationFrame(paintLoader);

  // Gates can be added while earlier ones settle (the 3D bundle adds its own), so wait
  // until a pass completes without new ones.
  let count = -1;
  while (count !== gates.length) {
    count = gates.length;
    await Promise.allSettled(gates);
  }
  setProgress(1);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  const el = loader();
  if (el) el.classList.add('is-done');
  root.classList.add('is-ready');
  scroll.release('loader');
  emit('ready');
  resolveReady();
}

// ---- the 3D bundle ---------------------------------------------------------

// Only pages with a mount pay for three.js. The preload hint starts the download while the
// rest of the page parses; the script itself is added once GSAP has run.
const canSrc = tag && tag.dataset.canflow;
let loadCan = null;
if (canSrc && doc.querySelector('[data-can], .bullet-carousel')) {
  const hint = doc.createElement('link');
  hint.rel = 'preload';
  hint.as = 'script';
  hint.href = canSrc;
  doc.head.appendChild(hint);
  let done;
  gate(new Promise((r) => (done = r)));
  loadCan = () => {
    if (window.canflow) return done();
    const s = doc.createElement('script');
    s.src = canSrc;
    s.onload = s.onerror = done;
    doc.body.appendChild(s);
  };
}

// ---- page loop -------------------------------------------------------------

// The page ends with a one-viewport copy of its top. Reaching it jumps back to the top
// without a visible seam, so the page reads as endless.
function setupLoop() {
  if (!lenis || !doc.body.hasAttribute('data-page-loop')) return;
  lenis.on('scroll', ({ scroll: y, limit }) => {
    if (limit > 0 && y >= limit - 1) lenis.scrollTo(0, { immediate: true, force: true });
  });
}

// ---- start -----------------------------------------------------------------

function start() {
  const { gsap, ScrollTrigger } = window;
  if (doc.body.dataset.smoothScroll !== 'off') {
    lenis = new Lenis({ syncTouch: true, lerp: 0.1 });
    if (gsap && ScrollTrigger) {
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add((t) => lenis.raf(t * 1000));
      gsap.ticker.lagSmoothing(0);
    } else {
      const raf = (t) => {
        lenis.raf(t);
        requestAnimationFrame(raf);
      };
      requestAnimationFrame(raf);
    }
    bullet.lenis = lenis;
    syncScroll();
    setupLoop();
  }
  if (loadCan) loadCan();
  finishLoading();
}

const bullet = (window.bullet = {
  scroll,
  lenis: null,
  ready,
  gate,
  get progress() {
    return progress;
  }
});

if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start, { once: true });
else start();

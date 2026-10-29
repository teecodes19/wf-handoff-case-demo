// drift: one can travels between two anchors as the page scrolls. The mount is a fixed,
// full-viewport layer; the anchors are ordinary elements that only get measured, so their
// size sets the can's size at each end.
//
//   data-can-from   selector of the start anchor
//   data-can-to     selector of the end anchor

import { screenToWorld } from '../core/stage.js';
import { ScrollTrigger } from '../core/gsap.js';

const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);

export default function drift({ stage, rig, opts }) {
  const from = document.querySelector(opts.from);
  const to = document.querySelector(opts.to);
  if (!from || !to) {
    console.warn('[canflow] drift needs both anchors:', opts.from, opts.to);
    return;
  }

  // Progress runs from the start anchor leaving its place to the end anchor arriving.
  let progress = 0;
  ScrollTrigger.create({
    trigger: from,
    start: 'top top',
    endTrigger: to,
    end: 'center center',
    onUpdate: (st) => {
      progress = st.progress;
      stage.invalidate();
    }
  });

  const secs = Math.max(1, opts.spinSecs || 14);
  stage.updaters.add((time, dt) => {
    const a = screenToWorld(stage, from.getBoundingClientRect());
    const b = screenToWorld(stage, to.getBoundingClientRect());
    const t = ease(progress);
    rig.root.position.set(lerp(a.x, b.x, t), lerp(a.y, b.y, t), 0);
    rig.root.scale.setScalar(lerp(a.height, b.height, t) * 0.92);
    rig.spin.rotation.y += (dt * Math.PI * 2) / secs;
  });
}

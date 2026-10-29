// ambient: the can spins slowly in its own box. Product cards, footers.
//
//   data-can-spin-secs   seconds per full turn (default 12)

import { fitToEl } from '../core/fit.js';

export default function ambient({ stage, rig, opts }) {
  const secs = Math.max(1, opts.spinSecs || 12);
  const fit = () => fitToEl(stage, rig.model.userData.aspect);
  stage.onResize.add(fit);
  fit();

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  stage.updaters.add((time, dt) => {
    if (reduce) return false;
    rig.spin.rotation.y += (dt * Math.PI * 2) / secs;
  });
}

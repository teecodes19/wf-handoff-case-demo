// The poster: a still image of the model shown until the 3D frame is ready, so the mount is
// never empty and the largest paint can come straight from HTML. If the page already has an
// <img> inside the mount it's adopted instead of duplicated.

import { gsap } from './gsap.js';

export function createPoster(el, src) {
  let img = el.querySelector('img[data-can-poster-img]') || el.querySelector(':scope > img');
  if (!img && !src) return { reveal() {}, remove() {} };
  if (!img) {
    img = document.createElement('img');
    img.src = src;
    img.alt = '';
    img.decoding = 'async';
    img.setAttribute('aria-hidden', 'true');
    el.appendChild(img);
  }
  img.style.cssText += ';position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none';

  return {
    // Cross-fade: the canvas has already drawn its first frame underneath.
    reveal(duration = 0.6) {
      return gsap.to(img, { opacity: 0, duration, ease: 'power2.out', onComplete: () => (img.style.visibility = 'hidden') });
    },
    remove() {
      img.remove();
    }
  };
}

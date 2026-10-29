// GSAP is a peer dependency: the page loads it, the bundle uses that copy. Two GSAP cores
// can't share ScrollTrigger, so bundling our own would break the page's animations.

const g = typeof window !== 'undefined' ? window : {};
export const gsap = g.gsap;
export const ScrollTrigger = g.ScrollTrigger;

if (!gsap || !ScrollTrigger) {
  console.error('[canflow] GSAP and ScrollTrigger must be loaded before the 3D bundle.');
} else {
  gsap.registerPlugin(ScrollTrigger);
}

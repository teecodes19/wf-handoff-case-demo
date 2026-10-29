// Fit a unit-height model to its element: pick the camera distance so the model fills the
// element's height with a margin, or its width when the element is the narrower side.

export function fitToEl(stage, aspect = 0.4, margin = 0.9) {
  const { camera, width, height } = stage;
  const vFov = (camera.fov * Math.PI) / 180;
  const elAspect = width / height;
  // Height that must be visible: the model, or more if its width is the limit.
  const needH = Math.max(1, aspect / elAspect) / margin;
  camera.position.z = needH / 2 / Math.tan(vFov / 2);
  camera.updateProjectionMatrix();
}

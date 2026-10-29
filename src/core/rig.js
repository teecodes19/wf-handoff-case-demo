// The rig: nested groups so each motion owns one transform and they never fight.
//
//   position   where the can sits (drift moves this)
//   slant      static lean, degrees around Z
//   spin       continuous rotation around the can's own axis
//   facing     which side faces the camera at rest
//   model      the unit-height model itself

import { Group, MathUtils } from 'three';

export function createRig(model, { slant = 0, facing = 0 } = {}) {
  const position = new Group();
  const slantG = new Group();
  const spin = new Group();
  const facingG = new Group();
  position.add(slantG);
  slantG.add(spin);
  spin.add(facingG);
  facingG.add(model);

  slantG.rotation.z = MathUtils.degToRad(-slant);
  facingG.rotation.y = MathUtils.degToRad(facing);

  return {
    root: position,
    spin,
    model,
    swap(next) {
      facingG.remove(this.model);
      facingG.add(next);
      this.model = next;
    },
    setFacing(deg) {
      facingG.rotation.y = MathUtils.degToRad(deg);
    }
  };
}

import type { DieDefinition, Rotation, Vec3 } from "./types";

/**
 * Returns the Face Value of the Die resting with the given rotation: the
 * value of whichever of its readings points most nearly straight up (world +Y).
 */
export function readFace(dieType: DieDefinition, rotation: Rotation): number {
  let best = dieType.readings[0];
  let bestUp = -Infinity;
  for (const reading of dieType.readings) {
    const up = worldUpComponent(reading.direction, rotation);
    if (up > bestUp) {
      bestUp = up;
      best = reading;
    }
  }
  return best.value;
}

/** The world-space Y component of a local vector after rotating it by `q`. */
function worldUpComponent(v: Vec3, q: Rotation): number {
  // y-row of the rotation matrix built from a unit quaternion.
  return (
    2 * (q.x * q.y + q.w * q.z) * v.x +
    (1 - 2 * (q.x * q.x + q.z * q.z)) * v.y +
    2 * (q.y * q.z - q.w * q.x) * v.z
  );
}

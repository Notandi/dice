import type { DieDefinition, Rotation, Vec3 } from "./types";

/** How far from straight up a face (or a d4's corner) may point and still be read. */
export const COCKED_ANGLE_DEGREES = 10;
const MIN_UP = Math.cos((COCKED_ANGLE_DEGREES * Math.PI) / 180);

/**
 * Returns the Face Value of the Die resting with the given rotation: the
 * value of whichever of its readings points most nearly straight up (world +Y).
 * Returns undefined if the Die is Cocked: none of its readings is within
 * {@link COCKED_ANGLE_DEGREES} of straight up.
 */
export function readFace(dieType: DieDefinition, rotation: Rotation): number | undefined {
  let best = dieType.readings[0];
  let bestUp = -Infinity;
  for (const reading of dieType.readings) {
    const up = worldUpComponent(reading.direction, rotation);
    if (up > bestUp) {
      bestUp = up;
      best = reading;
    }
  }
  return bestUp >= MIN_UP ? best.value : undefined;
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

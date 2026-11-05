import type { DieDefinition, Rotation, Vec3 } from "./types";

/**
 * Returns the Face Value of the face pointing most nearly straight up
 * (world +Y) when the Die rests with the given rotation.
 */
export function readFace(dieType: DieDefinition, rotation: Rotation): number {
  let best = dieType.faces[0];
  let bestUp = -Infinity;
  for (const face of dieType.faces) {
    const up = worldUpComponent(face.normal, rotation);
    if (up > bestUp) {
      bestUp = up;
      best = face;
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

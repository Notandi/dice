export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** A unit quaternion, as Rapier and three.js both hand them out. */
export interface Rotation {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface Face {
  value: number;
  /** Outward normal of the face, in the Die's own (local) frame. */
  normal: Vec3;
}

export interface DieDefinition {
  name: string;
  /** Edge length of the Die, in Tray units. */
  size: number;
  faces: Face[];
}

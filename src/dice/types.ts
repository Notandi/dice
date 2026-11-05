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

/** A number printed on a face, either in its centre or next to one of its corners. */
export interface Label {
  text: string;
  /** "centre", or the index (into the Die's vertices) of the corner it sits beside. */
  at: "centre" | number;
}

export interface Face {
  /** Indices into the Die's vertices, counter-clockwise seen from outside. */
  corners: number[];
  /** Outward unit normal, in the Die's own (local) frame. */
  normal: Vec3;
  labels: Label[];
}

/**
 * A direction in the Die's own frame and the Face Value the Die shows when
 * that direction points most nearly straight up. Face normals for most Die
 * Types; corners for the d4, which is read at the corner pointing up.
 */
export interface Reading {
  value: number;
  direction: Vec3;
}

export interface DieDefinition {
  name: string;
  /** Body colour, unique to the Die Type. */
  colour: string;
  /** Colour of the printed numbers. */
  inkColour: string;
  /** Corner positions in the Die's own frame, in Tray units. */
  vertices: Vec3[];
  faces: Face[];
  readings: Reading[];
  /** Distance from the centre to the farthest corner, in Tray units. */
  radius: number;
}

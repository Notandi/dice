import type { DieDefinition, Face, Label, Reading, Vec3 } from "./types";

const EPSILON = 1e-6;

/**
 * How a Die Type is numbered:
 * - "corners": each corner carries a number, printed beside it on every face
 *   that meets there, and the Die is read at the corner pointing up (the d4).
 * - faces: each face carries one number in its centre. Opposite faces add up
 *   to `oppositeSum`, and numbers run up from `firstLabel`. A face printed 0
 *   reads as the number of faces (a plain d10).
 */
export type Numbering = "corners" | { firstLabel: number; oppositeSum: number };

export interface DieSpec {
  name: string;
  colour: string;
  inkColour: string;
  /** Corner positions of the convex polyhedron, at any scale, centred on the origin. */
  vertices: Vec3[];
  /** Scale so the farthest corner is this far from the centre. */
  radius: number;
  numbering: Numbering;
}

/** Builds a Die Type from the corners of its polyhedron. */
export function buildDie(spec: DieSpec): DieDefinition {
  const farthest = Math.max(...spec.vertices.map(length));
  const vertices = spec.vertices.map((v) => scale(v, spec.radius / farthest));
  const shapes = hullFaces(vertices);

  if (spec.numbering === "corners") {
    const faces = shapes.map(({ corners, normal }) => ({
      corners,
      normal,
      labels: corners.map((c): Label => ({ text: String(c + 1), at: c })),
    }));
    const readings = vertices.map((v, i): Reading => ({ value: i + 1, direction: normalize(v) }));
    return { name: spec.name, colour: spec.colour, inkColour: spec.inkColour, vertices, faces, readings, radius: spec.radius };
  }

  const labels = numberOppositePairs(shapes, spec.numbering);
  const faces: Face[] = shapes.map(({ corners, normal }, i) => ({
    corners,
    normal,
    labels: [{ text: String(labels[i]), at: "centre" }],
  }));
  const readings = shapes.map(({ normal }, i): Reading => ({
    value: labels[i] === 0 ? shapes.length : labels[i],
    direction: normal,
  }));
  return { name: spec.name, colour: spec.colour, inkColour: spec.inkColour, vertices, faces, readings, radius: spec.radius };
}

interface FaceShape {
  corners: number[];
  normal: Vec3;
}

/**
 * Numbers faces in opposite pairs. Faces are visited from the top down
 * (then +X first, then +Z first); each face not yet numbered takes the next
 * label and its opposite face takes the remainder of `oppositeSum`.
 */
function numberOppositePairs(
  shapes: FaceShape[],
  { firstLabel, oppositeSum }: { firstLabel: number; oppositeSum: number },
): number[] {
  const labels: (number | undefined)[] = shapes.map(() => undefined);
  const order = shapes.map((_, i) => i).sort((a, b) => compareTopDown(shapes[a].normal, shapes[b].normal));
  let next = firstLabel;
  for (const i of order) {
    if (labels[i] !== undefined) continue;
    const opposite = shapes.findIndex((s) => dot(s.normal, shapes[i].normal) < -1 + EPSILON);
    if (opposite < 0) throw new Error("face has no opposite face");
    labels[i] = next;
    labels[opposite] = oppositeSum - next;
    next++;
  }
  return labels as number[];
}

function compareTopDown(a: Vec3, b: Vec3): number {
  for (const axis of ["y", "x", "z"] as const) {
    if (Math.abs(a[axis] - b[axis]) > EPSILON) return b[axis] - a[axis];
  }
  return 0;
}

/**
 * The faces of the convex hull of `vertices`, each with its corners ordered
 * counter-clockwise seen from outside. Brute force, which is plenty for dice.
 */
function hullFaces(vertices: Vec3[]): FaceShape[] {
  const faces: FaceShape[] = [];
  const seen = new Set<string>();
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (let k = j + 1; k < n; k++) {
        const c = cross(sub(vertices[j], vertices[i]), sub(vertices[k], vertices[i]));
        if (length(c) < EPSILON) continue;
        let normal = normalize(c);
        let offset = dot(normal, vertices[i]);
        if (offset < 0) {
          normal = scale(normal, -1);
          offset = -offset;
        }
        if (vertices.some((v) => dot(normal, v) > offset + EPSILON)) continue;
        const onPlane = vertices.flatMap((v, index) => (Math.abs(dot(normal, v) - offset) < EPSILON ? [index] : []));
        const key = onPlane.join(",");
        if (seen.has(key)) continue;
        seen.add(key);
        faces.push({ corners: counterClockwise(onPlane, vertices, normal), normal });
      }
    }
  }
  return faces;
}

function counterClockwise(corners: number[], vertices: Vec3[], normal: Vec3): number[] {
  const centre = scale(corners.reduce((sum, c) => add(sum, vertices[c]), { x: 0, y: 0, z: 0 }), 1 / corners.length);
  const u = normalize(sub(vertices[corners[0]], centre));
  const v = cross(normal, u);
  const angle = (c: number) => {
    const d = sub(vertices[c], centre);
    return Math.atan2(dot(d, v), dot(d, u));
  };
  return [...corners].sort((a, b) => angle(a) - angle(b));
}

export const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
export const length = (a: Vec3) => Math.hypot(a.x, a.y, a.z);
export const normalize = (a: Vec3) => scale(a, 1 / length(a));

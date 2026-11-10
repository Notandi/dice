import * as THREE from "three";
import { add, cross, dot, length, normalize, scale, sub } from "../dice/polyhedron";
import type { DieDefinition, Face, Vec3 } from "../dice/types";

/**
 * Each Die Type's faces are printed side by side on one texture, its atlas,
 * so a Die is a single mesh with a single material: one draw call, not one
 * per face. That keeps a 50-dice Roll smooth on a phone.
 */

/** Space kept around each face inside its cell, so neighbouring faces don't bleed into each other. */
const CELL_PADDING = 0.03;

/**
 * How far each face is cut back from the edges of the polyhedron, in Tray
 * units. The gap is filled with a smoothly shaded bevel, so edges and corners
 * catch the light like a moulded die's rather than meeting knife-sharp.
 */
const BEVEL = 0.05;

/** A face's area of the atlas, in texture coordinates (0–1, v up). */
export interface AtlasCell {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

/** How many cells across and down the Die Type's atlas has: as square as fits every face. */
export function atlasGrid(dieType: DieDefinition): { columns: number; rows: number } {
  const columns = Math.ceil(Math.sqrt(dieType.faces.length));
  return { columns, rows: Math.ceil(dieType.faces.length / columns) };
}

/** The cell of the atlas that face `faceIndex` is printed in, filling the grid from the top left. */
export function atlasCell(dieType: DieDefinition, faceIndex: number): AtlasCell {
  const { columns, rows } = atlasGrid(dieType);
  const column = faceIndex % columns;
  const row = Math.floor(faceIndex / columns);
  return { u0: column / columns, u1: (column + 1) / columns, v0: 1 - (row + 1) / rows, v1: 1 - row / rows };
}

/** Where a point of the face (0–1 across its own square, v up) lies on the atlas. */
export function onAtlas(cell: AtlasCell, [u, v]: [number, number]): [number, number] {
  const inset = (low: number, high: number, t: number) =>
    low + (high - low) * (CELL_PADDING + (1 - 2 * CELL_PADDING) * t);
  return [inset(cell.u0, cell.u1, u), inset(cell.v0, cell.v1, v)];
}

/**
 * A spot of the atlas that is never printed on, only the body colour: the
 * corner of the first cell, which no face reaches. The bevels are drawn with it.
 */
export function atlasBlank(dieType: DieDefinition): [number, number] {
  const cell = atlasCell(dieType, 0);
  return [cell.u0 + 0.05 * (cell.u1 - cell.u0), cell.v1 - 0.05 * (cell.v1 - cell.v0)];
}

export interface FaceFrame {
  centre: Vec3;
  /** Texture coordinates (0–1 across the face's own square, v up) of a point on the face. */
  uv(p: Vec3): [number, number];
}

/**
 * A 2D frame on the face, centred on it, with "up" being the way a number
 * printed in the centre reads. The face's farthest corner touches the edge
 * of its square.
 */
export function faceFrame(dieType: DieDefinition, face: Face): FaceFrame {
  const corners = face.corners.map((c) => dieType.vertices[c]);
  const centre = scale(corners.reduce(add, { x: 0, y: 0, z: 0 }), 1 / corners.length);
  const extent = Math.max(...corners.map((p) => length(sub(p, centre))));
  const up = normalize(sub(textTop(corners), centre));
  const right = cross(up, face.normal);
  const uv = (p: Vec3): [number, number] => {
    const d = sub(p, centre);
    return [0.5 + dot(d, right) / (2 * extent), 0.5 + dot(d, up) / (2 * extent)];
  };
  return { centre, uv };
}

/**
 * The Die Type's polyhedron with bevelled edges and corners, every face
 * mapped onto its cell of the atlas. Faces are flat; each bevel is shaded
 * smoothly between the faces it joins, so it reads as rounded. The bevels are
 * cut into the polyhedron, so the faces stay in their planes.
 */
export function dieGeometry(dieType: DieDefinition): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const blank = atlasBlank(dieType);

  interface Point {
    position: Vec3;
    normal: Vec3;
    uv: [number, number];
  }
  /** Adds a triangle, wound to face outwards whatever order its points come in. */
  const triangle = (a: Point, b: Point, c: Point) => {
    const facing = cross(sub(b.position, a.position), sub(c.position, a.position));
    const outwards = dot(facing, add(a.position, add(b.position, c.position))) > 0;
    for (const { position, normal, uv } of outwards ? [a, b, c] : [a, c, b]) {
      positions.push(position.x, position.y, position.z);
      normals.push(normal.x, normal.y, normal.z);
      uvs.push(...uv);
    }
  };
  const fan = (points: Point[]) => {
    for (let i = 1; i < points.length - 1; i++) triangle(points[0], points[i], points[i + 1]);
  };

  /** Each face's cut-back corners, by the index of the vertex they were cut back from. */
  const cutBack = dieType.faces.map((face, faceIndex) => {
    const frame = faceFrame(dieType, face);
    const cell = atlasCell(dieType, faceIndex);
    const corners = insetCorners(face.corners.map((c) => dieType.vertices[c]), face.normal);
    fan(corners.map((position) => ({ position, normal: face.normal, uv: onAtlas(cell, frame.uv(position)) })));
    return new Map(
      face.corners.map((c, i): [number, Point] => [c, { position: corners[i], normal: face.normal, uv: blank }]),
    );
  });

  // A strip along every edge, between the two faces that meet there.
  dieType.faces.forEach((face, f) => {
    face.corners.forEach((a, i) => {
      const b = face.corners[(i + 1) % face.corners.length];
      // The neighbour runs along the same edge the other way; draw each edge once.
      const g = dieType.faces.findIndex((other, o) => o > f && other.corners.includes(a) && other.corners.includes(b));
      if (g < 0) return;
      fan([cutBack[f].get(a)!, cutBack[f].get(b)!, cutBack[g].get(b)!, cutBack[g].get(a)!]);
    });
  });

  // A cap over every corner, between all the faces that meet there.
  dieType.vertices.forEach((vertex, c) => {
    const around = cutBack.flatMap((corners) => corners.get(c) ?? []);
    fan(inOrderAround(normalize(vertex), around));
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeBoundingSphere();
  return geometry;
}

/** A face's corners (counter-clockwise seen from outside) moved in so each edge is {@link BEVEL} further in. */
function insetCorners(corners: Vec3[], normal: Vec3): Vec3[] {
  const n = corners.length;
  const inward = corners.map((p, i) => cross(normal, normalize(sub(corners[(i + 1) % n], p))));
  return corners.map((p, i) => {
    const a = inward[(i + n - 1) % n];
    const b = inward[i];
    return add(p, scale(add(a, b), BEVEL / (1 + dot(a, b))));
  });
}

/** Points ringed around an axis, sorted by their angle around it. */
function inOrderAround<T extends { position: Vec3 }>(axis: Vec3, points: T[]): T[] {
  const centre = scale(points.map((p) => p.position).reduce(add), 1 / points.length);
  const u = normalize(sub(points[0].position, centre));
  const v = cross(axis, u);
  const angle = (p: T) => {
    const d = sub(p.position, centre);
    return Math.atan2(dot(d, v), dot(d, u));
  };
  return [...points].sort((a, b) => angle(a) - angle(b));
}

/**
 * Where the top of a centred number points: the face's sharpest corner if it
 * has one (the pole of a d10 kite), otherwise its first corner, or the middle
 * of its first edge on an even-sided regular face (so d6 numbers sit square).
 */
function textTop(corners: Vec3[]): Vec3 {
  const n = corners.length;
  const angles = corners.map((p, i) => {
    const a = normalize(sub(corners[(i + n - 1) % n], p));
    const b = normalize(sub(corners[(i + 1) % n], p));
    return Math.acos(dot(a, b));
  });
  const sharpest = Math.min(...angles);
  const sharpCorners = angles.filter((a) => a - sharpest < 1e-6).length;
  if (sharpCorners === 1) return corners[angles.indexOf(sharpest)];
  if (sharpCorners === n && n % 2 === 0) return scale(add(corners[0], corners[1]), 0.5);
  return corners[0];
}

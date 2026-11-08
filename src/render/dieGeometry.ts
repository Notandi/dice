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

/** The Die Type's flat-shaded polyhedron, every face mapped onto its cell of the atlas. */
export function dieGeometry(dieType: DieDefinition): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  dieType.faces.forEach((face, faceIndex) => {
    const frame = faceFrame(dieType, face);
    const cell = atlasCell(dieType, faceIndex);
    const corners = face.corners.map((c) => dieType.vertices[c]);
    // Fan triangulation; corners are counter-clockwise seen from outside.
    for (let i = 1; i < corners.length - 1; i++) {
      for (const p of [corners[0], corners[i], corners[i + 1]]) {
        positions.push(p.x, p.y, p.z);
        normals.push(face.normal.x, face.normal.y, face.normal.z);
        uvs.push(...onAtlas(cell, frame.uv(p)));
      }
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeBoundingSphere();
  return geometry;
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

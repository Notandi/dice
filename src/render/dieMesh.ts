import * as THREE from "three";
import { add, cross, dot, length, normalize, scale, sub } from "../dice/polyhedron";
import type { DieDefinition, Face, Vec3 } from "../dice/types";

const TEXTURE_SIZE = 256;
const EDGE_SHADE = "rgba(0, 0, 0, 0.18)";

interface DieLook {
  geometry: THREE.BufferGeometry;
  materials: THREE.Material[];
}

/** Geometry and textures are built once per Die Type and shared by every Die of it. */
const looks = new Map<DieDefinition, DieLook>();

/** A flat-shaded polyhedron mesh in the Die Type's colour, with its numbers printed on. */
export function createDieMesh(dieType: DieDefinition): THREE.Mesh {
  let look = looks.get(dieType);
  if (!look) {
    look = buildLook(dieType);
    looks.set(dieType, look);
  }
  const mesh = new THREE.Mesh(look.geometry, look.materials);
  mesh.castShadow = true;
  return mesh;
}

function buildLook(dieType: DieDefinition): DieLook {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const geometry = new THREE.BufferGeometry();
  const allLabels = dieType.faces.flatMap((f) => f.labels.map((l) => l.text));
  const underlineSixAndNine = allLabels.includes("6") && allLabels.includes("9");

  const materials = dieType.faces.map((face, faceIndex) => {
    const frame = faceFrame(dieType, face);
    const corners = face.corners.map((c) => dieType.vertices[c]);

    // Fan triangulation; corners are counter-clockwise seen from outside.
    const start = positions.length / 3;
    for (let i = 1; i < corners.length - 1; i++) {
      for (const p of [corners[0], corners[i], corners[i + 1]]) {
        positions.push(p.x, p.y, p.z);
        normals.push(face.normal.x, face.normal.y, face.normal.z);
        const [u, v] = frame.uv(p);
        uvs.push(u, v);
      }
    }
    geometry.addGroup(start, positions.length / 3 - start, faceIndex);

    return new THREE.MeshStandardMaterial({
      map: faceTexture(dieType, face, frame, underlineSixAndNine),
      roughness: 0.45,
    });
  });

  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  return { geometry, materials };
}

interface FaceFrame {
  centre: Vec3;
  /** Distance from the centre to the farthest corner. */
  extent: number;
  /** Texture coordinates (0–1) of a point on the face. */
  uv(p: Vec3): [number, number];
  /** Canvas pixel position of a point on the face. */
  px(p: Vec3): [number, number];
}

/**
 * A 2D frame on the face, centred on it, with "up" being the way a number
 * printed in the centre reads.
 */
function faceFrame(dieType: DieDefinition, face: Face): FaceFrame {
  const corners = face.corners.map((c) => dieType.vertices[c]);
  const centre = scale(corners.reduce(add, { x: 0, y: 0, z: 0 }), 1 / corners.length);
  const extent = Math.max(...corners.map((p) => length(sub(p, centre))));
  const up = normalize(sub(textTop(corners), centre));
  const right = cross(up, face.normal);
  const uv = (p: Vec3): [number, number] => {
    const d = sub(p, centre);
    return [0.5 + dot(d, right) / (2 * extent), 0.5 + dot(d, up) / (2 * extent)];
  };
  const px = (p: Vec3): [number, number] => {
    const [u, v] = uv(p);
    return [u * TEXTURE_SIZE, (1 - v) * TEXTURE_SIZE];
  };
  return { centre, extent, uv, px };
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

function faceTexture(dieType: DieDefinition, face: Face, frame: FaceFrame, underlineSixAndNine: boolean) {
  const size = TEXTURE_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = dieType.colour;
  ctx.fillRect(0, 0, size, size);

  // Darken the rim of the face so the edges read clearly.
  ctx.beginPath();
  face.corners.forEach((c, i) => {
    const [x, y] = frame.px(dieType.vertices[c]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.strokeStyle = EDGE_SHADE;
  ctx.lineWidth = size * 0.05;
  ctx.stroke();

  const [cx, cy] = frame.px(frame.centre);
  const inradiusPx = Math.min(...face.corners.map((c, i) => {
    const a = frame.px(dieType.vertices[c]);
    const b = frame.px(dieType.vertices[face.corners[(i + 1) % face.corners.length]]);
    return distanceToLine([cx, cy], a, b);
  }));

  for (const label of face.labels) {
    const underline = underlineSixAndNine && (label.text === "6" || label.text === "9");
    if (label.at === "centre") {
      drawNumber(ctx, label.text, cx, cy, 0, inradiusPx * 1.25, inradiusPx * 1.5, dieType.inkColour, underline);
    } else {
      // Beside its corner, with the top of the number pointing at the corner.
      const [kx, ky] = frame.px(dieType.vertices[label.at]);
      const x = cx + (kx - cx) * 0.5;
      const y = cy + (ky - cy) * 0.5;
      const angle = Math.atan2(kx - cx, -(ky - cy));
      drawNumber(ctx, label.text, x, y, angle, inradiusPx * 0.75, inradiusPx, dieType.inkColour, underline);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function drawNumber(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  angle: number,
  fontSize: number,
  maxWidth: number,
  ink: string,
  underline: boolean,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
  const width = ctx.measureText(text).width;
  if (width > maxWidth) {
    fontSize *= maxWidth / width;
    ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
  }
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 0, fontSize * 0.06);
  if (underline) {
    const w = ctx.measureText(text).width;
    ctx.fillRect(-w / 2, fontSize * 0.45, w, fontSize * 0.08);
  }
  ctx.restore();
}

function distanceToLine([px, py]: [number, number], [ax, ay]: [number, number], [bx, by]: [number, number]) {
  return Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / Math.hypot(bx - ax, by - ay);
}

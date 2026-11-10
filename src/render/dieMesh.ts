import * as THREE from "three";
import type { DieDefinition, Face, Vec3 } from "../dice/types";
import { atlasCell, atlasGrid, dieGeometry, faceFrame, onAtlas } from "./dieGeometry";

/** Pixels across each face's cell of the atlas. */
const CELL_SIZE = 256;
/** How much lighter the middle of a face is printed, and how much darker its rim: a moulded look. */
const FACE_HIGHLIGHT = "rgba(255, 255, 255, 0.1)";
const FACE_SHADE = "rgba(0, 0, 0, 0.16)";
/** How glossy the dice are: low enough to mirror the lights, not so low they look wet. */
const ROUGHNESS = 0.35;
/** How deeply the numbers look engraved, and how soft the engraving's walls are, in atlas pixels. */
const ENGRAVING_DEPTH = 3;
const ENGRAVING_SOFTNESS = 3;
/** How bright and how opaque a Dropped Die is drawn. */
const DIMMED_BRIGHTNESS = 0.4;
const DIMMED_OPACITY = 0.55;

interface DieLook {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
  dimmedMaterial: THREE.MeshStandardMaterial;
}

/** Geometry and texture are built once per Die Type and shared by every Die of it. */
const looks = new Map<DieDefinition, DieLook>();

/** A glossy, bevelled polyhedron mesh in the Die Type's colour, with its numbers engraved and inked. */
export function createDieMesh(dieType: DieDefinition): THREE.Mesh {
  const look = lookOf(dieType);
  const mesh = new THREE.Mesh(look.geometry, look.material);
  mesh.castShadow = true;
  return mesh;
}

/** Draws a Die's mesh dimmed (darker and see-through), as for a Dropped Die, or normally. */
export function setDimmed(mesh: THREE.Mesh, dieType: DieDefinition, dimmed: boolean): void {
  const look = lookOf(dieType);
  mesh.material = dimmed ? look.dimmedMaterial : look.material;
}

function lookOf(dieType: DieDefinition): DieLook {
  let look = looks.get(dieType);
  if (!look) {
    look = buildLook(dieType);
    looks.set(dieType, look);
  }
  return look;
}

function buildLook(dieType: DieDefinition): DieLook {
  const { colour, engraving } = atlasTextures(dieType);
  const material = new THREE.MeshStandardMaterial({
    map: colour,
    bumpMap: engraving,
    bumpScale: ENGRAVING_DEPTH,
    roughness: ROUGHNESS,
  });
  const dimmedMaterial = material.clone();
  dimmedMaterial.color.setScalar(DIMMED_BRIGHTNESS);
  dimmedMaterial.transparent = true;
  dimmedMaterial.opacity = DIMMED_OPACITY;
  return { geometry: dieGeometry(dieType), material, dimmedMaterial };
}

/**
 * Every face of the Die Type printed in its cell of one texture, matching
 * {@link dieGeometry}: once in colour, and once as a height map (white high,
 * black low) that sinks the numbers into the face.
 */
function atlasTextures(dieType: DieDefinition): { colour: THREE.CanvasTexture; engraving: THREE.CanvasTexture } {
  const { columns, rows } = atlasGrid(dieType);
  const canvas = (fill: string) => {
    const canvas = document.createElement("canvas");
    canvas.width = columns * CELL_SIZE;
    canvas.height = rows * CELL_SIZE;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return ctx;
  };
  const colour = canvas(dieType.colour);
  const height = canvas("#fff");
  // A blurred shadow under each number slopes the walls of its engraving.
  height.shadowColor = "#000";
  height.shadowBlur = ENGRAVING_SOFTNESS;

  const allLabels = dieType.faces.flatMap((f) => f.labels.map((l) => l.text));
  const underlineSixAndNine = allLabels.includes("6") && allLabels.includes("9");
  dieType.faces.forEach((face, faceIndex) => {
    const frame = faceFrame(dieType, face);
    const cell = atlasCell(dieType, faceIndex);
    const px = (p: Vec3): [number, number] => {
      const [u, v] = onAtlas(cell, frame.uv(p));
      return [u * colour.canvas.width, (1 - v) * colour.canvas.height];
    };
    shadeFace(colour, dieType, face, frame.centre, px);
    printNumbers(colour, dieType, face, frame.centre, px, dieType.inkColour, underlineSixAndNine);
    printNumbers(height, dieType, face, frame.centre, px, "#000", underlineSixAndNine);
  });

  const texture = (ctx: CanvasRenderingContext2D) => {
    const texture = new THREE.CanvasTexture(ctx.canvas);
    texture.anisotropy = 8;
    return texture;
  };
  const colourTexture = texture(colour);
  colourTexture.colorSpace = THREE.SRGBColorSpace;
  return { colour: colourTexture, engraving: texture(height) };
}

/** Shades one face a little lighter in the middle and darker towards its edges. `px` gives a point's canvas position. */
function shadeFace(
  ctx: CanvasRenderingContext2D,
  dieType: DieDefinition,
  face: Face,
  centre: Vec3,
  px: (p: Vec3) => [number, number],
) {
  const corners = face.corners.map((c) => px(dieType.vertices[c]));
  const [cx, cy] = px(centre);
  const reach = Math.max(...corners.map(([x, y]) => Math.hypot(x - cx, y - cy)));
  const shade = ctx.createRadialGradient(cx, cy, 0, cx, cy, reach);
  shade.addColorStop(0, FACE_HIGHLIGHT);
  shade.addColorStop(0.45, "rgba(0, 0, 0, 0)");
  shade.addColorStop(1, FACE_SHADE);
  ctx.beginPath();
  corners.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  ctx.fillStyle = shade;
  ctx.fill();
}

/** Prints one face's numbers in `ink`. `px` gives a point's canvas position. */
function printNumbers(
  ctx: CanvasRenderingContext2D,
  dieType: DieDefinition,
  face: Face,
  centre: Vec3,
  px: (p: Vec3) => [number, number],
  ink: string,
  underlineSixAndNine: boolean,
) {
  const [cx, cy] = px(centre);
  const inradiusPx = Math.min(...face.corners.map((c, i) => {
    const a = px(dieType.vertices[c]);
    const b = px(dieType.vertices[face.corners[(i + 1) % face.corners.length]]);
    return distanceToLine([cx, cy], a, b);
  }));

  for (const label of face.labels) {
    const underline = underlineSixAndNine && (label.text === "6" || label.text === "9");
    if (label.at === "centre") {
      drawNumber(ctx, label.text, cx, cy, 0, inradiusPx * 1.15, inradiusPx * 1.35, ink, underline);
    } else {
      // Beside its corner, with the top of the number pointing at the corner.
      const [kx, ky] = px(dieType.vertices[label.at]);
      const x = cx + (kx - cx) * 0.5;
      const y = cy + (ky - cy) * 0.5;
      const angle = Math.atan2(kx - cx, -(ky - cy));
      drawNumber(ctx, label.text, x, y, angle, inradiusPx * 0.7, inradiusPx, ink, underline);
    }
  }
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

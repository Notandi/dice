import * as THREE from "three";
import type { DieDefinition } from "../dice/types";

/** three.js BoxGeometry material order: +X, -X, +Y, -Y, +Z, -Z. */
const BOX_FACE_DIRECTIONS = [
  { x: 1, y: 0, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 0, y: -1, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: 0, y: 0, z: -1 },
];

const FACE_COLOUR = "#f4efe3";
const INK_COLOUR = "#1d2433";

/** A cube mesh with each face's number taken from the Die definition. */
export function createD6Mesh(dieType: DieDefinition): THREE.Mesh {
  const materials = BOX_FACE_DIRECTIONS.map((direction) => {
    const face = dieType.faces.find(
      (f) => f.normal.x === direction.x && f.normal.y === direction.y && f.normal.z === direction.z,
    );
    if (!face) throw new Error(`${dieType.name} has no face pointing ${JSON.stringify(direction)}`);
    return new THREE.MeshStandardMaterial({
      map: numberTexture(face.value),
      roughness: 0.45,
    });
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(dieType.edgeLength, dieType.edgeLength, dieType.edgeLength), materials);
  mesh.castShadow = true;
  return mesh;
}

function numberTexture(value: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = FACE_COLOUR;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "#cfc7b3";
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, size - 10, size - 10);
  ctx.fillStyle = INK_COLOUR;
  ctx.font = `bold ${size * 0.6}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(value), size / 2, size / 2 + size * 0.04);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

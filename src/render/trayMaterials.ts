import * as THREE from "three";

/**
 * The Tray's materials, their textures painted once at start-up: there are no
 * image files to load.
 */

const FELT_COLOUR = "#2f6b4f";
const WOOD_COLOUR = "#6b4526";
const WOOD_GRAIN_COLOUR = "#2e1a0c";

/** Felt for the Tray floor: finely speckled, and darker towards the walls. */
export function feltMaterial(): THREE.MeshStandardMaterial {
  const size = 1024;
  const ctx = canvas(size, size, FELT_COLOUR);
  const random = seededRandom(1);
  const image = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < image.data.length; i += 4) {
    const fibre = 0.86 + 0.28 * random();
    for (let channel = 0; channel < 3; channel++) image.data[i + channel] *= fibre;
  }
  ctx.putImageData(image, 0, 0);
  const shade = ctx.createRadialGradient(size / 2, size / 2, size * 0.2, size / 2, size / 2, size * 0.75);
  shade.addColorStop(0, "rgba(0, 0, 0, 0)");
  shade.addColorStop(1, "rgba(0, 0, 0, 0.4)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, size, size);
  return new THREE.MeshStandardMaterial({ map: texture(ctx), roughness: 1 });
}

/** Varnished wood for the Tray walls, its grain running along each wall. */
export function woodMaterial(): THREE.MeshStandardMaterial {
  const width = 1024;
  const height = 128;
  const ctx = canvas(width, height, WOOD_COLOUR);
  const random = seededRandom(2);
  ctx.strokeStyle = WOOD_GRAIN_COLOUR;
  for (let line = 0; line < 70; line++) {
    // Each grain line wanders gently along the length of the wall.
    let y = random() * height;
    ctx.globalAlpha = 0.05 + 0.2 * random();
    ctx.lineWidth = 0.5 + 2 * random();
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= width; x += 32) {
      y += (random() - 0.5) * 5;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return new THREE.MeshStandardMaterial({ map: texture(ctx), roughness: 0.55 });
}

function canvas(width: number, height: number, fill: string): CanvasRenderingContext2D {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, width, height);
  return ctx;
}

function texture(ctx: CanvasRenderingContext2D): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(ctx.canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Random numbers from 0 to 1 that come out the same every time, so the Tray always looks the same. */
function seededRandom(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

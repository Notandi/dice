import * as THREE from "three";
import type { TrayDimensions } from "../tray/traySimulation";

/** The vertical field of view on a wide screen. */
export const BASE_FOV = 40;
/** How far across the screen (0 to 1 from the middle) the Tray may reach, leaving a little room around it. */
const FILL = 0.94;
/** Thickness of the drawn walls, outside the Tray's inside dimensions. */
export const WALL_THICKNESS = 0.4;
/** The widest field of view tried; far wider than any phone needs. */
const MAX_FOV = 150;

/**
 * Sets the camera's field of view so the whole Tray, walls included, is in
 * view: the base field of view where it fits, otherwise the narrowest one
 * that fits, so on a portrait phone the Tray fills the screen's width.
 * With `atBottom`, the room that leaves above and below goes above, so the
 * Tray's near edge, where the Hand waits, sits by controls drawn below it.
 */
export function frameTray(camera: THREE.PerspectiveCamera, tray: TrayDimensions, atBottom = false): void {
  camera.clearViewOffset();
  camera.updateMatrixWorld();
  const corners = outsideCorners(tray);
  const onScreen = () => corners.map((corner) => corner.clone().project(camera));
  const fits = (fov: number) => {
    camera.fov = fov;
    camera.updateProjectionMatrix();
    return onScreen().every((p) => Math.abs(p.x) <= FILL && Math.abs(p.y) <= FILL);
  };

  if (fits(BASE_FOV)) return;

  let low = BASE_FOV;
  let high = MAX_FOV;
  for (let i = 0; i < 30; i++) {
    const mid = (low + high) / 2;
    if (fits(mid)) high = mid;
    else low = mid;
  }
  camera.fov = high;
  camera.updateProjectionMatrix();
  if (!atBottom) return;

  // Slide the view up by the room below the Tray (screen heights run -1 to 1, so half of it).
  const lowest = Math.min(...onScreen().map((p) => p.y));
  // A full view one unit high and `aspect` wide, as setViewOffset takes its aspect from these.
  const { aspect } = camera;
  camera.setViewOffset(aspect, 1, 0, -(lowest + FILL) / 2, aspect, 1);
}

function outsideCorners({ width, depth, wallHeight }: TrayDimensions): THREE.Vector3[] {
  const x = width / 2 + WALL_THICKNESS;
  const z = depth / 2 + WALL_THICKNESS;
  const corners: THREE.Vector3[] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [0, wallHeight]) {
    corners.push(new THREE.Vector3(sx * x, y, sz * z));
  }
  return corners;
}

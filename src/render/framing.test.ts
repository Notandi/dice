import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { TRAY } from "../tray/traySimulation";
import { BASE_FOV, frameTray, WALL_THICKNESS } from "./framing";

function cameraAt(aspect: number): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(BASE_FOV, aspect, 0.1, 100);
  camera.position.set(0, 11, 9);
  camera.lookAt(0, 0, 0.3);
  camera.updateMatrixWorld();
  return camera;
}

/** The outside corners of the Tray's walls, top and bottom, as drawn on screen (-1 to 1 across). */
function trayCornersOnScreen(camera: THREE.PerspectiveCamera): THREE.Vector3[] {
  const x = TRAY.width / 2 + WALL_THICKNESS;
  const z = TRAY.depth / 2 + WALL_THICKNESS;
  const corners: THREE.Vector3[] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [0, TRAY.wallHeight]) {
    corners.push(new THREE.Vector3(sx * x, y, sz * z).project(camera));
  }
  return corners;
}

describe("frameTray", () => {
  it("keeps the base field of view on a wide screen", () => {
    const camera = cameraAt(16 / 9);
    frameTray(camera, TRAY);
    expect(camera.fov).toBe(40);
  });

  it.each([0.45, 0.6, 0.9])("fits the whole Tray on a portrait screen of aspect %s", (aspect) => {
    const camera = cameraAt(aspect);
    frameTray(camera, TRAY);
    const corners = trayCornersOnScreen(camera);
    for (const c of corners) {
      expect(Math.abs(c.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(c.y)).toBeLessThanOrEqual(1);
    }
    // Drawn as large as fits: a side wall comes close to the screen edge, not far inside it.
    expect(Math.max(...corners.map((c) => Math.abs(c.x)))).toBeGreaterThan(0.85);
  });

  it("keeps the Tray in the middle when not asked to put it at the bottom", () => {
    const camera = cameraAt(0.6);
    frameTray(camera, TRAY);
    const ys = trayCornersOnScreen(camera).map((c) => c.y);
    expect(Math.max(...ys) + Math.min(...ys)).toBeCloseTo(0, 0);
  });

  it("puts the Tray at the bottom of a portrait screen, by the controls, leaving the room above it", () => {
    const camera = cameraAt(0.6);
    frameTray(camera, TRAY, true);
    const corners = trayCornersOnScreen(camera);
    expect(Math.min(...corners.map((c) => c.y))).toBeLessThan(-0.9);
    expect(Math.max(...corners.map((c) => c.y))).toBeLessThan(0.5);
  });

  it("goes back to the plain view when the screen turns wide again", () => {
    const camera = cameraAt(0.6);
    frameTray(camera, TRAY, true);
    camera.aspect = 16 / 9;
    frameTray(camera, TRAY);
    expect(camera.view?.enabled ?? false).toBe(false);
    expect(camera.fov).toBe(40);
  });
});

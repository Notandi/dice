import * as THREE from "three";
import type { TrayDie, TrayDimensions } from "../tray/traySimulation";
import { createDieMesh } from "./dieMesh";

const BASE_FOV = 40;

/**
 * Draws the Tray from a fixed angled camera. It only reads Die poses from
 * the Tray simulation; it never drives the physics.
 */
export class Renderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.1, 100);
  private readonly meshes = new Map<TrayDie, THREE.Mesh>();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly tray: TrayDimensions,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene.background = new THREE.Color("#20262e");

    this.camera.position.set(0, 11, 9);
    this.camera.lookAt(0, 0, 0.3);

    this.addLights();
    this.addTray();
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  /** Keeps one mesh per Die in the Tray and copies each Die's pose onto it. */
  render(dice: readonly TrayDie[]): void {
    for (const [die, mesh] of this.meshes) {
      if (!dice.includes(die)) {
        this.scene.remove(mesh);
        this.meshes.delete(die);
      }
    }
    for (const die of dice) {
      let mesh = this.meshes.get(die);
      if (!mesh) {
        mesh = createDieMesh(die.definition);
        this.meshes.set(die, mesh);
        this.scene.add(mesh);
      }
      const p = die.position;
      const q = die.rotation;
      mesh.position.set(p.x, p.y, p.z);
      mesh.quaternion.set(q.x, q.y, q.z, q.w);
    }
    this.renderer.render(this.scene, this.camera);
  }

  private resize(): void {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Keep the whole Tray in view on narrow (portrait) screens too.
    const trayAspect = (this.tray.width + 2) / (this.tray.depth + 4);
    this.camera.fov = this.camera.aspect < trayAspect ? BASE_FOV * (trayAspect / this.camera.aspect) : BASE_FOV;
    this.camera.updateProjectionMatrix();
  }

  private addLights(): void {
    this.scene.add(new THREE.HemisphereLight("#ffffff", "#3a3f48", 1.2));
    const sun = new THREE.DirectionalLight("#ffffff", 2);
    sun.position.set(-4, 12, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const shadowCamera = sun.shadow.camera;
    shadowCamera.left = -8;
    shadowCamera.right = 8;
    shadowCamera.top = 8;
    shadowCamera.bottom = -8;
    this.scene.add(sun);
  }

  private addTray(): void {
    const { width, depth, wallHeight } = this.tray;
    const thickness = 0.4;

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(width, depth),
      new THREE.MeshStandardMaterial({ color: "#2f6b4f", roughness: 0.95 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const wood = new THREE.MeshStandardMaterial({ color: "#6b4a2f", roughness: 0.7 });
    const wall = (w: number, d: number, x: number, z: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, wallHeight, d), wood);
      mesh.position.set(x, wallHeight / 2, z);
      mesh.castShadow = mesh.receiveShadow = true;
      this.scene.add(mesh);
    };
    const outer = width + 2 * thickness;
    wall(thickness, depth, width / 2 + thickness / 2, 0);
    wall(thickness, depth, -width / 2 - thickness / 2, 0);
    wall(outer, thickness, 0, depth / 2 + thickness / 2);
    wall(outer, thickness, 0, -depth / 2 - thickness / 2);
  }
}

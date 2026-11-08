import * as THREE from "three";
import type { Vec3 } from "../dice/types";
import type { HandPose } from "../hand/handLayout";
import type { TrayDie, TrayDimensions } from "../tray/traySimulation";
import { createDieMesh, setDimmed } from "./dieMesh";
import { BASE_FOV, frameTray, WALL_THICKNESS } from "./framing";

const COCKED_COLOUR = "#ffd23f";
/** How much bigger than its Die the Cocked highlight is drawn. */
const COCKED_OUTLINE_SCALE = 1.15;

/**
 * Draws the Tray from a fixed angled camera. It only reads Die poses from
 * the Tray simulation; it never drives the physics.
 */
export class Renderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.1, 100);
  private readonly meshes = new Map<TrayDie, THREE.Mesh>();
  private readonly cockedOutlines = new Map<TrayDie, THREE.Mesh>();
  private readonly raycaster = new THREE.Raycaster();
  private readonly handGroup = new THREE.Group();
  private drawnHand: readonly HandPose[] = [];
  /** A level plane above the floor, for {@link floorPointAt}. */
  private readonly level = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly tray: TrayDimensions,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // No background: the page's own shows around the Tray.

    this.camera.position.set(0, 11, 9);
    this.camera.lookAt(0, 0, 0.3);

    this.addLights();
    this.addTray();
    this.scene.add(this.handGroup);
    this.resize();
    // The canvas, not the window: on a phone it shrinks when the controls below it grow.
    new ResizeObserver(() => this.resize()).observe(canvas);
  }

  /**
   * Keeps one mesh per Die in the Tray and copies each Die's pose onto it,
   * outlining any Cocked Die and dimming any Dropped one, and draws the Hand
   * waiting at the near edge, moved by `handOffset` while the player drags it.
   */
  render(
    dice: readonly TrayDie[],
    hand: readonly HandPose[],
    dropped: ReadonlySet<TrayDie>,
    handOffset: Vec3,
  ): void {
    if (hand !== this.drawnHand) this.drawHand(hand);
    this.handGroup.position.set(handOffset.x, handOffset.y, handOffset.z);
    const inTray = new Set(dice);
    for (const [die, mesh] of this.meshes) {
      if (!inTray.has(die)) {
        this.scene.remove(mesh);
        this.meshes.delete(die);
        this.cockedOutlines.delete(die);
      }
    }
    for (const die of dice) {
      let mesh = this.meshes.get(die);
      if (!mesh) {
        mesh = createDieMesh(die.definition);
        const outline = cockedOutline(mesh);
        mesh.add(outline);
        this.cockedOutlines.set(die, outline);
        this.meshes.set(die, mesh);
        this.scene.add(mesh);
      }
      this.cockedOutlines.get(die)!.visible = die.cocked;
      setDimmed(mesh, die.definition, dropped.has(die));
      const p = die.position;
      const q = die.rotation;
      mesh.position.set(p.x, p.y, p.z);
      mesh.quaternion.set(q.x, q.y, q.z, q.w);
    }
    this.renderer.render(this.scene, this.camera);
  }

  /** The Die in the Tray drawn under a point on the page, if any. */
  dieAt(clientX: number, clientY: number): TrayDie | undefined {
    this.aimAt(clientX, clientY);
    const [hit] = this.raycaster.intersectObjects([...this.meshes.values()], false);
    if (!hit) return undefined;
    for (const [die, mesh] of this.meshes) if (mesh === hit.object) return die;
    return undefined;
  }

  /**
   * The point `height` above the Tray floor drawn under a point on the page,
   * if that level is in view there; its `y` is 0, as for a point on the floor.
   */
  floorPointAt(clientX: number, clientY: number, height = 0): Vec3 | undefined {
    this.aimAt(clientX, clientY);
    this.level.constant = -height;
    const hit = this.raycaster.ray.intersectPlane(this.level, new THREE.Vector3());
    return hit ? { x: hit.x, y: 0, z: hit.z } : undefined;
  }

  /** Points the raycaster from the camera through a point on the page. */
  private aimAt(clientX: number, clientY: number): void {
    const rect = this.canvas.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(pointer, this.camera);
  }

  private drawHand(hand: readonly HandPose[]): void {
    this.handGroup.clear();
    for (const pose of hand) {
      const mesh = createDieMesh(pose.definition);
      mesh.position.set(pose.position.x, pose.position.y, pose.position.z);
      mesh.quaternion.set(pose.rotation.x, pose.rotation.y, pose.rotation.z, pose.rotation.w);
      mesh.scale.setScalar(pose.scale);
      this.handGroup.add(mesh);
    }
    this.drawnHand = hand;
  }

  private resize(): void {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    this.renderer.setSize(w, h, false);
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    // Keep the whole Tray in view on narrow (portrait) screens too. Where the controls
    // are laid out below the canvas (on phones), the Tray sits down by them.
    const controlsBelow = this.canvas.getBoundingClientRect().bottom < window.innerHeight - 1;
    frameTray(this.camera, this.tray, controlsBelow);
  }

  private addLights(): void {
    this.scene.add(new THREE.HemisphereLight("#ffffff", "#3a3f48", 1.2));
    const sun = new THREE.DirectionalLight("#ffffff", 2);
    sun.position.set(-4, 12, 6);
    sun.castShadow = true;
    // A smaller shadow map on small screens, where the detail can't be seen, to keep large Rolls smooth.
    const shadowSize = Math.min(window.screen.width, window.screen.height) < 700 ? 1024 : 2048;
    sun.shadow.mapSize.set(shadowSize, shadowSize);
    const shadowCamera = sun.shadow.camera;
    shadowCamera.left = -8;
    shadowCamera.right = 8;
    shadowCamera.top = 8;
    shadowCamera.bottom = -8;
    this.scene.add(sun);
  }

  private addTray(): void {
    const { width, depth, wallHeight } = this.tray;
    const thickness = WALL_THICKNESS;

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

const cockedMaterial = new THREE.MeshBasicMaterial({ color: COCKED_COLOUR, side: THREE.BackSide });

/** A glowing rim behind a Die: its own shape, slightly larger, seen from inside. */
function cockedOutline(dieMesh: THREE.Mesh): THREE.Mesh {
  const outline = new THREE.Mesh(dieMesh.geometry, cockedMaterial);
  outline.scale.setScalar(COCKED_OUTLINE_SCALE);
  outline.visible = false;
  return outline;
}

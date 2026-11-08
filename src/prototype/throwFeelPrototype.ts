/**
 * PROTOTYPE: throwaway, not production code. It ships on the live site on
 * purpose so people can try every style; delete once the throw feel is decided (#7).
 *
 * Question: what should flinging the Hand feel like? The shipped fling slides
 * the dice flat, its strength doesn't match the flick, the Hand snaps into a
 * grid on release, and grabbing it is fiddly.
 *
 * Plan: two throw styles on the real Tray, switchable with `?variant=`
 * (bottom bar or ← →), each tuned live with sliders. Both pick the Hand up into a full-size bunch held high above the Tray, so
 * nothing jumps on release, and take arc and spin from the throw itself.
 *
 *   shake     press anywhere, the dice gather under your finger and rattle
 *             as you shake; the shake adds spin; flick and let go
 *   sling     press anywhere and pull back; an arrow shows aim and power;
 *             let go to launch the other way
 */
import * as THREE from "three";
import type { DieDefinition, Vec3 } from "../dice/types";
import type { HandPose } from "../hand/handLayout";
import { createDieMesh } from "../render/dieMesh";
import type { Renderer } from "../render/renderer";
import { TRAY, type Throw, type TraySimulation } from "../tray/traySimulation";
import { mountSwitcher } from "./prototypeSwitcher";

const VARIANTS = [
  { key: "shake", name: "Shake", how: "Press anywhere to pick the dice up, shake, then flick." },
  { key: "sling", name: "Sling", how: "Press anywhere, pull back to aim, and let go." },
] as const;
type VariantKey = (typeof VARIANTS)[number]["key"];

/** The tunables, edited live by the sliders. */
const p = {
  holdHeight: 3.2, // how high above the floor the held dice are, Tray units
  gain: 5, // throw speed per screen-height/s of flick
  curve: 1, // >1: gentle flicks gentler, hard ones harder
  minSpeed: 4,
  maxSpeed: 26,
  arc: 0.35, // upward speed as a share of the throw speed
  rollSpin: 1.2, // forward roll per unit of speed
  randomSpin: 8, // extra random tumble, rad/s
  slowRelease: 1, // 1 = let go slowly drops the dice; 0 = puts the Hand back
  rattle: 1, // shake: how much the held dice jiggle
  shakeSpin: 3, // shake: extra tumble per unit of shake
  maxPull: 0.35, // sling: pull, in screen heights, that gives full power
};
const SLIDERS: { key: keyof typeof p; label: string; min: number; max: number; step: number; only?: VariantKey }[] = [
  { key: "holdHeight", label: "Hold height", min: 1, max: 5.5, step: 0.1 },
  { key: "gain", label: "Strength per flick", min: 1, max: 15, step: 0.5 },
  { key: "curve", label: "Strength curve", min: 0.5, max: 2.5, step: 0.1 },
  { key: "minSpeed", label: "Gentlest throw", min: 0, max: 12, step: 0.5 },
  { key: "maxSpeed", label: "Hardest throw", min: 10, max: 45, step: 1 },
  { key: "arc", label: "Arc (up / forward)", min: 0, max: 1.2, step: 0.05 },
  { key: "rollSpin", label: "Forward roll", min: 0, max: 4, step: 0.1 },
  { key: "randomSpin", label: "Random tumble", min: 0, max: 30, step: 1 },
  { key: "slowRelease", label: "Slow let-go drops (1) / cancels (0)", min: 0, max: 1, step: 1 },
  { key: "rattle", label: "Rattle", min: 0, max: 3, step: 0.1, only: "shake" },
  { key: "shakeSpin", label: "Shake → spin", min: 0, max: 10, step: 0.5, only: "shake" },
  { key: "maxPull", label: "Pull for full power", min: 0.1, max: 0.8, step: 0.05, only: "sling" },
];

/** Lid height while a prototype variant is on, so dice can be held high. */
const PROTOTYPE_LID = 6;
/** Below this flick speed (screen heights/s) a let-go is slow, not a fling. */
const SLOW = 0.4;
/** How long the Hand takes to lift into the held bunch, ms. */
const PICKUP_MS = 160;

export interface PrototypeHost {
  canvas: HTMLCanvasElement;
  sim: TraySimulation;
  renderer: Renderer;
  handPoses(): readonly HandPose[];
  handThrowable(): boolean;
  gestureActive(): boolean;
  setHandHeld(held: boolean): void;
  throwHand(throws: Throw[]): void;
}

const variant = (): VariantKey => {
  const v = new URLSearchParams(location.search).get("variant");
  return VARIANTS.some((x) => x.key === v) ? (v as VariantKey) : "shake";
};

/** Called before the Tray is built. Returns true because a prototype variant always replaces the shipped Hand fling. */
export function prepare(): boolean {
  TRAY.lidHeight = PROTOTYPE_LID; // raise the invisible lid so the Hand can be held high
  return true;
}

interface Held {
  pointerId: number;
  dice: { definition: DieDefinition; from: HandPose; mesh: THREE.Mesh; slot: Vec3 }[];
  pickedAt: number;
  press: { x: number; y: number; floor: Vec3 };
  samples: { x: number; y: number; floor: Vec3; t: number }[];
  centre: Vec3;
  shake: number;
  lastScreenVelocity: { x: number; y: number };
}

export function start(host: PrototypeHost): void {
  const current = variant();
  const panel = mountPanel(current);

  const { canvas, renderer } = host;
  // Reaching into the renderer is fine for a throwaway prototype.
  const scene = (renderer as unknown as { scene: THREE.Scene }).scene;
  const camera = (renderer as unknown as { camera: THREE.Camera }).camera;
  const raycaster = new THREE.Raycaster();
  const heldGroup = new THREE.Group();
  scene.add(heldGroup);
  const arrow = mountArrow();
  let held: Held | undefined;

  const pointAt = (clientX: number, clientY: number, height: number): Vec3 | undefined => {
    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -height), new THREE.Vector3());
    return hit ? { x: hit.x, y: height, z: hit.z } : undefined;
  };
  const holdY = (widest: number) => Math.min(p.holdHeight, PROTOTYPE_LID - widest - 0.05);

  canvas.addEventListener("pointerdown", (event) => {
    if (held || host.gestureActive() || !host.handThrowable() || event.button !== 0) return;
    const poses = host.handPoses();
    if (poses.length === 0) return;
    const widest = Math.max(...poses.map((pose) => pose.definition.radius));
    const floor = pointAt(event.clientX, event.clientY, holdY(widest));
    if (!floor) return;

    const slots = bunch(poses.map((pose) => pose.definition));
    const dice = poses.map((pose, i) => {
      const mesh = createDieMesh(pose.definition);
      heldGroup.add(mesh);
      mesh.visible = i < slots.length;
      return { definition: pose.definition, from: pose, mesh, slot: slots[i % slots.length] };
    });
    held = {
      pointerId: event.pointerId,
      dice,
      pickedAt: performance.now(),
      press: { x: event.clientX, y: event.clientY, floor },
      samples: [{ x: event.clientX, y: event.clientY, floor, t: event.timeStamp }],
      centre: current === "sling" ? handHome(poses, holdY(widest)) : floor,
      shake: 0,
      lastScreenVelocity: { x: 0, y: 0 },
    };
    host.setHandHeld(true);
    canvas.setPointerCapture(event.pointerId);
    canvas.style.cursor = "grabbing";
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!held) {
      if (!host.gestureActive()) canvas.style.cursor = host.handThrowable() ? "grab" : "";
      return;
    }
    if (event.pointerId !== held.pointerId) return;
    const coalesced = event.getCoalescedEvents?.() ?? [];
    for (const e of coalesced.length ? coalesced : [event]) addSample(held, e);
    if (current === "sling") showSling(held, event);
  });

  const addSample = (h: Held, e: PointerEvent) => {
    const floor = pointAt(e.clientX, e.clientY, h.centre.y);
    if (!floor) return;
    const prev = h.samples[h.samples.length - 1];
    h.samples.push({ x: e.clientX, y: e.clientY, floor, t: e.timeStamp });
    while (h.samples.length > 2 && h.samples[0].t < e.timeStamp - 250) h.samples.shift();
    const dt = Math.max(1, e.timeStamp - prev.t) / 1000;
    const v = { x: (e.clientX - prev.x) / dt / canvas.clientHeight, y: (e.clientY - prev.y) / dt / canvas.clientHeight };
    h.shake += Math.hypot(v.x - h.lastScreenVelocity.x, v.y - h.lastScreenVelocity.y) * 0.05;
    h.lastScreenVelocity = v;
    if (current !== "sling") h.centre = floor;
  };

  const showSling = (h: Held, e: PointerEvent) => {
    const pullX = e.clientX - h.press.x;
    const pullY = e.clientY - h.press.y;
    const power = Math.min(1, Math.hypot(pullX, pullY) / canvas.clientHeight / p.maxPull);
    arrow.show(h.press.x, h.press.y, h.press.x - pullX * 1.6, h.press.y - pullY * 1.6, power);
  };

  canvas.addEventListener("pointerup", (event) => {
    if (!held || event.pointerId !== held.pointerId) return;
    addSample(held, event);
    release(held, event);
  });
  for (const type of ["pointercancel", "lostpointercapture"] as const) {
    canvas.addEventListener(type, (event) => {
      if (held && event.pointerId === held.pointerId) putBack();
    });
  }

  function release(h: Held, event: PointerEvent): void {
    let direction: Vec3 = { x: 0, y: 0, z: -1 };
    let speed = 0;
    let flick = 0;
    if (current === "sling") {
      const pull = Math.hypot(event.clientX - h.press.x, event.clientY - h.press.y) / canvas.clientHeight;
      const power = Math.min(1, pull / p.maxPull);
      const end = h.samples[h.samples.length - 1].floor;
      direction = flat(h.press.floor.x - end.x, h.press.floor.z - end.z);
      flick = power;
      speed = power < 0.08 ? 0 : p.minSpeed + (p.maxSpeed - p.minSpeed) * Math.pow(power, p.curve);
    } else {
      const last = h.samples[h.samples.length - 1];
      const first = h.samples.find((s) => s.t >= last.t - 80) ?? last;
      const dt = (last.t - first.t) / 1000;
      flick = dt > 0 ? Math.hypot(last.x - first.x, last.y - first.y) / dt / canvas.clientHeight : 0;
      direction = flat(last.floor.x - first.floor.x, last.floor.z - first.floor.z);
      speed = flick < SLOW ? 0 : clamp(p.gain * Math.pow(flick, p.curve), p.minSpeed, p.maxSpeed);
    }
    if (speed === 0 && p.slowRelease < 0.5) return putBack();

    const shakeTumble = current === "shake" ? h.shake * p.shakeSpin : 0;
    const perWave = h.dice.filter((d) => d.mesh.visible).length;
    const throws = h.dice.map((d, i): Throw => {
      const turn = (Math.random() - 0.5) * 0.2;
      const vx = (direction.x * Math.cos(turn) - direction.z * Math.sin(turn)) * speed;
      const vz = (direction.x * Math.sin(turn) + direction.z * Math.cos(turn)) * speed;
      const tumble = () => (Math.random() * 2 - 1) * (p.randomSpin + shakeTumble);
      const q = d.mesh.quaternion;
      return {
        position: { x: d.mesh.position.x, y: d.mesh.position.y, z: d.mesh.position.z },
        rotation: { x: q.x, y: q.y, z: q.z, w: q.w },
        linearVelocity: { x: vx, y: speed * p.arc, z: vz },
        // Rolling forward: spin about (up × velocity).
        angularVelocity: { x: vz * p.rollSpin + tumble(), y: tumble(), z: -vx * p.rollSpin + tumble() },
        delay: Math.floor(i / perWave) * 0.2,
      };
    });
    host.throwHand(throws);
    panel.lastThrow({
      flick: `${flick.toFixed(2)} ${current === "sling" ? "power" : "screens/s"}`,
      speed: speed.toFixed(1),
      up: (speed * p.arc).toFixed(1),
      roll: (speed * p.rollSpin).toFixed(1),
      shake: current === "shake" ? h.shake.toFixed(2) : "–",
    });
    clearHeld();
  }

  function putBack(): void {
    clearHeld();
  }

  function clearHeld(): void {
    if (held && canvas.hasPointerCapture(held.pointerId)) canvas.releasePointerCapture(held.pointerId);
    held = undefined;
    heldGroup.clear();
    arrow.hide();
    host.setHandHeld(false);
    canvas.style.cursor = "";
  }

  // Animate the held bunch every frame: lift from the Hand, follow the pointer, rattle.
  const jiggle = new THREE.Quaternion();
  const target = new THREE.Vector3();
  let lastFrame = performance.now();
  const animate = (now: number) => {
    const dt = (now - lastFrame) / 1000;
    lastFrame = now;
    if (held) {
      held.shake *= Math.exp(-dt * 2.5);
      const t = Math.min(1, (now - held.pickedAt) / PICKUP_MS);
      const ease = 1 - Math.pow(1 - t, 3);
      const centre = { ...held.centre };
      if (current === "sling") {
        // The bunch eases back a little as you pull, like a sling.
        const end = held.samples[held.samples.length - 1].floor;
        centre.x += (end.x - held.press.floor.x) * 0.25;
        centre.z += (end.z - held.press.floor.z) * 0.25;
      }
      const shift = keepInside(centre, held.dice);
      const rattle = current === "shake" ? Math.min(0.3, held.shake * p.rattle * 0.15) : 0;
      for (const d of held.dice) {
        const r = () => (Math.random() * 2 - 1) * rattle;
        target.set(shift.x + d.slot.x + r(), shift.y + d.slot.y + r(), shift.z + d.slot.z + r());
        const from = new THREE.Vector3(d.from.position.x, d.from.position.y, d.from.position.z);
        d.mesh.position.lerpVectors(from, target, ease);
        d.mesh.scale.setScalar(d.from.scale + (1 - d.from.scale) * ease);
        const rest = new THREE.Quaternion(d.from.rotation.x, d.from.rotation.y, d.from.rotation.z, d.from.rotation.w);
        if (t < 1) d.mesh.quaternion.copy(rest);
        if (rattle > 0) {
          jiggle.setFromEuler(new THREE.Euler(r() * 2, r() * 2, r() * 2));
          d.mesh.quaternion.multiply(jiggle).normalize();
        }
      }
    }
    requestAnimationFrame(animate);
  };
  requestAnimationFrame(animate);
}

/** Full-size slots for the held dice around their centre; dice past the first bunch follow in waves. */
function bunch(dice: DieDefinition[]): Vec3[] {
  const widest = Math.max(...dice.map((d) => d.radius));
  const cell = 2 * widest + 0.15;
  const maxCols = Math.max(1, Math.floor(TRAY.width / cell));
  const maxRows = Math.max(1, Math.min(3, Math.floor(TRAY.depth / cell)));
  const cols = Math.min(maxCols, Math.ceil(Math.sqrt(dice.length)));
  const rows = Math.min(maxRows, Math.ceil(dice.length / cols));
  const slots: Vec3[] = [];
  for (let i = 0; i < Math.min(dice.length, cols * rows); i++) {
    const inRow = Math.min(cols, dice.length - Math.floor(i / cols) * cols);
    slots.push({
      x: ((i % cols) - (inRow - 1) / 2) * cell,
      y: 0,
      z: (Math.floor(i / cols) - (rows - 1) / 2) * cell,
    });
  }
  return slots;
}

/** Moves the bunch's centre so every held Die is inside the walls. */
function keepInside(centre: Vec3, dice: { slot: Vec3; definition: DieDefinition }[]): Vec3 {
  let { x, z } = centre;
  for (const d of dice) {
    const r = d.definition.radius + 0.05;
    x = clamp(x, -TRAY.width / 2 + r - d.slot.x, TRAY.width / 2 - r - d.slot.x);
    z = clamp(z, -TRAY.depth / 2 + r - d.slot.z, TRAY.depth / 2 - r - d.slot.z);
  }
  return { x, y: centre.y, z };
}

function handHome(poses: readonly HandPose[], y: number): Vec3 {
  const n = poses.length;
  return {
    x: poses.reduce((s, pose) => s + pose.position.x, 0) / n,
    y,
    z: poses.reduce((s, pose) => s + pose.position.z, 0) / n,
  };
}

function flat(x: number, z: number): Vec3 {
  const n = Math.hypot(x, z);
  return n < 1e-6 ? { x: 0, y: 0, z: -1 } : { x: x / n, y: 0, z: z / n };
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Fills the Throw style card's tuning drawer: sliders, the last throw's numbers, and a copy button. */
function mountPanel(current: VariantKey) {
  const card = mountSwitcher(VARIANTS, current);
  const { drawer } = card;

  for (const s of SLIDERS) {
    if (s.only && s.only !== current) continue;
    const row = document.createElement("label");
    row.className = "ts-slider";
    const head = document.createElement("span");
    head.className = "ts-slider-head";
    const value = document.createElement("span");
    value.className = "ts-slider-value";
    value.textContent = String(p[s.key]);
    head.append(s.label, value);
    const input = document.createElement("input");
    Object.assign(input, { type: "range", min: s.min, max: s.max, step: s.step, value: p[s.key] });
    input.addEventListener("input", () => {
      p[s.key] = Number(input.value);
      value.textContent = input.value;
    });
    row.append(head, input);
    drawer.append(row);
  }

  const foot = document.createElement("div");
  foot.className = "ts-foot";
  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "ts-copy";
  copy.textContent = "Copy settings";
  copy.addEventListener("click", () => {
    navigator.clipboard?.writeText(JSON.stringify({ variant: current, ...p })).catch(() => {});
    copy.textContent = "Copied ✓";
    setTimeout(() => (copy.textContent = "Copy settings"), 1500);
  });
  card.showStats("Throw to see its numbers.");
  foot.append(copy, card.stats);
  drawer.append(foot);

  return {
    lastThrow(values: Record<string, string>) {
      card.showStats(Object.entries(values).map(([k, v]) => `${k} ${v}`).join(" · "));
    },
  };
}

/** The slingshot's aim arrow, drawn over the Tray in screen space. */
function mountArrow() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:10";
  svg.innerHTML =
    '<defs><marker id="proto-head" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">' +
    '<path d="M0,0 L10,5 L0,10 z" fill="context-stroke"/></marker></defs>' +
    '<line stroke-width="8" stroke-linecap="round" marker-end="url(#proto-head)" />';
  const line = svg.querySelector("line")!;
  svg.style.display = "none";
  document.body.append(svg);
  return {
    show(x1: number, y1: number, x2: number, y2: number, power: number) {
      svg.style.display = "";
      Object.entries({ x1, y1, x2, y2 }).forEach(([k, v]) => line.setAttribute(k, String(v)));
      line.setAttribute("stroke", `hsl(${50 - power * 50} 90% 55%)`);
    },
    hide() {
      svg.style.display = "none";
    },
  };
}

import { cross, dot } from "../dice/polyhedron";
import type { DieDefinition, Rotation, Vec3 } from "../dice/types";
import type { TrayDimensions } from "../tray/traySimulation";

/** Where and how big to draw one Die of the Hand. */
export interface HandPose {
  definition: DieDefinition;
  position: Vec3;
  rotation: Rotation;
  scale: number;
}

/** Floor space each Hand Die gets at full size. */
const CELL = 1.7;
/** Depth of the strip along the near edge the Hand keeps to, shrinking its dice to fit. */
const HAND_DEPTH = 2 * CELL;
/** Gap between the near wall and the Hand, so the wall doesn't hide the front row. */
const WALL_GAP = 0.4;
const UP: Vec3 = { x: 0, y: 1, z: 0 };

/**
 * Lays the Hand out in rows along the near edge of the Tray, each Die sitting
 * on the floor with its highest Face Value up. A large Hand is drawn smaller
 * so it stays at the near edge; the dice are thrown at full size.
 */
export function handLayout(tray: TrayDimensions, dice: DieDefinition[]): HandPose[] {
  const { columns, scale } = bestGrid(tray, dice.length);
  const cell = CELL * scale;

  return dice.map((definition, i) => {
    const row = Math.floor(i / columns);
    const inRow = Math.min(columns, dice.length - row * columns);
    const rotation = restingRotation(definition);
    const lowest = Math.min(...definition.vertices.map((v) => rotate(v, rotation).y));
    return {
      definition,
      rotation,
      scale,
      position: {
        x: ((i % columns) - (inRow - 1) / 2) * cell,
        y: -lowest * scale,
        z: tray.depth / 2 - WALL_GAP - cell / 2 - row * cell,
      },
    };
  });
}

/** Extra floor around the Hand that still counts as grabbing it, for fingertips. */
const GRAB_MARGIN = 0.5;

/** Whether a point on the Tray floor is on or right beside the Hand, so pressing there picks it up. */
export function handContains(hand: readonly HandPose[], point: Vec3): boolean {
  return hand.some((pose) => {
    const reach = (CELL * pose.scale) / 2 + GRAB_MARGIN;
    return Math.abs(point.x - pose.position.x) <= reach && Math.abs(point.z - pose.position.z) <= reach;
  });
}

/** The number of columns that lets `count` dice be drawn largest within the Hand's strip. */
function bestGrid(tray: TrayDimensions, count: number): { columns: number; scale: number } {
  let best = { columns: 1, scale: 0 };
  for (let columns = 1; columns <= Math.max(1, count); columns++) {
    const rows = Math.ceil(count / columns);
    const scale = Math.min(1, tray.width / (columns * CELL), HAND_DEPTH / (rows * CELL));
    if (scale > best.scale) best = { columns, scale };
  }
  return best;
}

/** Turns the Die so its highest-valued reading points straight up. */
function restingRotation(definition: DieDefinition): Rotation {
  const highest = definition.readings.reduce((a, b) => (b.value > a.value ? b : a));
  return rotationBetween(highest.direction, UP);
}

/** The shortest rotation taking unit vector `from` onto unit vector `to`. */
function rotationBetween(from: Vec3, to: Vec3): Rotation {
  const w = 1 + dot(from, to);
  if (w < 1e-6) return { x: 1, y: 0, z: 0, w: 0 }; // opposite: half a turn about X
  const { x, y, z } = cross(from, to);
  const n = Math.hypot(x, y, z, w);
  return { x: x / n, y: y / n, z: z / n, w: w / n };
}

function rotate(v: Vec3, q: Rotation): Vec3 {
  // v + 2w(q × v) + 2 q × (q × v)
  const t = cross(q, v);
  const u = cross(q, t);
  return { x: v.x + 2 * (q.w * t.x + u.x), y: v.y + 2 * (q.w * t.y + u.y), z: v.z + 2 * (q.w * t.z + u.z) };
}

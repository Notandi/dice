import type { DieDefinition, Vec3 } from "../dice/types";
import type { Throw, TrayDimensions } from "./traySimulation";

/** Seconds between waves when there are more dice than lanes. */
const WAVE_GAP = 0.2;

/**
 * The automatic Thrower: throws dice from the near edge of the Tray towards
 * the far wall, with random aim, force and spin. Each Die starts in its own
 * lane across the near edge so no two start overlapping; when there are more
 * dice than lanes, the rest follow in quick waves. Randomness only shapes the
 * throw, never the Face Value (ADR 0001).
 */
export function autoThrow(tray: TrayDimensions, dice: DieDefinition[]): Throw[] {
  const widest = Math.max(...dice.map((d) => d.radius));
  const lanes = Math.max(1, Math.min(dice.length, Math.floor(tray.width / (2 * widest + 0.2))));
  const laneWidth = tray.width / lanes;
  return dice.map((die, i) => {
    const left = -tray.width / 2 + (i % lanes) * laneWidth;
    return { ...throwOne(tray, die, left, left + laneWidth), delay: Math.floor(i / lanes) * WAVE_GAP };
  });
}

/** A Die already in the Tray, which a new throw must not start inside. */
export interface Obstacle {
  position: Vec3;
  definition: DieDefinition;
}

/** Candidate throws tried when looking for a clear start. */
const RETHROW_TRIES = 12;

/**
 * Throws one Die again, as {@link autoThrow} would, but starting where it has
 * the most room from the dice already in the Tray, so it never appears inside one.
 */
export function autoRethrow(tray: TrayDimensions, die: DieDefinition, others: readonly Obstacle[]): Throw {
  const room = (t: Throw) =>
    Math.min(Infinity, ...others.map((o) => distance(t.position, o.position) - o.definition.radius - die.radius));
  let best = throwOne(tray, die, -tray.width / 2, tray.width / 2);
  for (let i = 1; i < RETHROW_TRIES && room(best) < 0; i++) {
    const candidate = throwOne(tray, die, -tray.width / 2, tray.width / 2);
    if (room(candidate) > room(best)) best = candidate;
  }
  return best;
}

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** A throw for one Die starting between `left` and `right` along the near edge. */
function throwOne(tray: TrayDimensions, die: DieDefinition, left: number, right: number): Throw {
  const random = Math.random;
  const between = (min: number, max: number) => min + (max - min) * random();
  const margin = die.radius + 0.1;

  return {
    position: {
      x: between(left + margin, right - margin),
      y: between(margin, tray.lidHeight - margin),
      z: tray.depth / 2 - margin,
    },
    rotation: randomRotation(random),
    linearVelocity: {
      x: between(-4, 4),
      y: between(0, 2),
      z: -between(10, 18),
    },
    angularVelocity: {
      x: between(-25, 25),
      y: between(-25, 25),
      z: between(-25, 25),
    },
  };
}

/** A uniformly random unit quaternion (Shoemake's method). */
function randomRotation(random: () => number) {
  const u1 = random();
  const u2 = random() * 2 * Math.PI;
  const u3 = random() * 2 * Math.PI;
  const a = Math.sqrt(1 - u1);
  const b = Math.sqrt(u1);
  return { x: a * Math.sin(u2), y: a * Math.cos(u2), z: b * Math.sin(u3), w: b * Math.cos(u3) };
}

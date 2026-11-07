import type { DieDefinition, Rotation, Vec3 } from "../dice/types";
import { randomRotation, WAVE_GAP } from "./autoThrower";
import type { Throw, TrayDimensions } from "./traySimulation";

/** Where the pointer was over the Tray floor, and when (ms, as pointer events report it). */
export interface GestureSample {
  point: Vec3;
  time: number;
}

/** How far back from release the fling's velocity is measured, in ms. */
const RELEASE_WINDOW = 100;

/**
 * The velocity of a fling across the Tray floor, in Tray units per second,
 * measured over the last moment before release so a drag that stopped
 * before letting go has no speed.
 */
export function releaseVelocity(samples: readonly GestureSample[]): Vec3 {
  const last = samples[samples.length - 1];
  const first = samples.find((s) => s.time >= last.time - RELEASE_WINDOW) ?? last;
  const seconds = (last.time - first.time) / 1000;
  if (seconds <= 0) return { x: 0, y: 0, z: 0 };
  return { x: (last.point.x - first.point.x) / seconds, y: 0, z: (last.point.z - first.point.z) / seconds };
}

/** A fling released over the Tray: where the pointer let go, and how fast it was moving. */
export interface Fling {
  from: Vec3;
  velocity: Vec3;
}

/** Slower than this at release (Tray units/s) and the pointer was let go, not flung. */
const FLING_THRESHOLD = 1.5;
/** The gentlest throw a fling makes, so the dice still tumble. */
export const MIN_THROW_SPEED = 6;
/** The hardest throw a fling makes, however fast the pointer moved. */
export const MAX_THROW_SPEED = 22;

/** Largest random turn of each Die's direction away from the fling's, in radians. */
const AIM_SPREAD = (8 * Math.PI) / 180;

/**
 * Throws the whole Hand the way the player flung it. Randomness only shapes
 * the throw, never the Face Value (ADR 0001).
 */
export function flingThrow(tray: TrayDimensions, dice: DieDefinition[], fling: Fling): Throw[] | undefined {
  const velocity = throwVelocity(fling);
  if (!velocity) return undefined;
  const starts = startingSpots(tray, dice, fling.from);
  return starts.map(({ position, delay }) => ({ ...throwFrom(position, velocity), delay }));
}

/** How far a flung Cocked Die is lifted before it is thrown. */
const LIFT = 0.3;

/**
 * Re-throws a Cocked Die the way the player flung it: picked straight up as
 * it lies, so it can't start inside a wall or another Die, then thrown.
 */
export function flingRethrow(
  tray: TrayDimensions,
  die: { definition: DieDefinition; position: Vec3; rotation: Rotation },
  fling: Fling,
): Throw | undefined {
  const velocity = throwVelocity(fling);
  if (!velocity) return undefined;
  const { x, y, z } = die.position;
  const lifted = { x, y: Math.min(y + LIFT, tray.lidHeight - die.definition.radius), z };
  return { ...throwFrom(lifted, velocity), rotation: die.rotation };
}

/** Most rows of dice that start together, so the Hand stays a tight bunch. */
const MAX_ROWS = 2;

/**
 * Where each Die starts: a grid of cells around the release point, moved
 * clear of the walls, with one Die per cell. When there are more dice than
 * cells, the rest follow from the same cells in quick waves.
 */
function startingSpots(tray: TrayDimensions, dice: DieDefinition[], from: Vec3): { position: Vec3; delay: number }[] {
  const widest = Math.max(...dice.map((d) => d.radius));
  const cell = 2 * widest + 0.2;
  const maxColumns = Math.max(1, Math.floor(tray.width / cell));
  const maxRows = Math.max(1, Math.min(MAX_ROWS, Math.floor(tray.depth / cell)));
  const perWave = maxColumns * maxRows;
  const inFirstWave = Math.min(dice.length, perWave);
  const columns = Math.min(maxColumns, Math.ceil(inFirstWave / maxRows));
  const rows = Math.ceil(inFirstWave / columns);
  const centreX = clamp(from.x, -tray.width / 2 + (columns * cell) / 2, tray.width / 2 - (columns * cell) / 2);
  const centreZ = clamp(from.z, -tray.depth / 2 + (rows * cell) / 2, tray.depth / 2 - (rows * cell) / 2);
  const y = Math.min(widest + 0.3, tray.lidHeight - widest);

  return dice.map((_, i) => {
    const slot = i % perWave;
    return {
      position: {
        x: centreX + ((slot % columns) - (columns - 1) / 2) * cell,
        y,
        z: centreZ + (Math.floor(slot / columns) - (rows - 1) / 2) * cell,
      },
      delay: Math.floor(i / perWave) * WAVE_GAP,
    };
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * The fling's velocity across the floor, kept between the gentlest and
 * hardest throw; undefined if the pointer was barely moving at release.
 */
function throwVelocity(fling: Fling): Vec3 | undefined {
  const { x, z } = fling.velocity;
  const flingSpeed = Math.hypot(x, z);
  if (flingSpeed < FLING_THRESHOLD) return undefined;
  const speed = clamp(flingSpeed, MIN_THROW_SPEED, MAX_THROW_SPEED);
  return { x: (x / flingSpeed) * speed, y: 0, z: (z / flingSpeed) * speed };
}

/** A throw starting at `position`, flung with `velocity` turned a little at random, tumbling. */
function throwFrom(position: Vec3, velocity: Vec3): Throw {
  const between = (min: number, max: number) => min + (max - min) * Math.random();
  const turn = between(-AIM_SPREAD, AIM_SPREAD);
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  return {
    position,
    rotation: randomRotation(),
    linearVelocity: {
      x: velocity.x * cos - velocity.z * sin,
      y: between(0, 2),
      z: velocity.x * sin + velocity.z * cos,
    },
    angularVelocity: { x: between(-25, 25), y: between(-25, 25), z: between(-25, 25) },
  };
}

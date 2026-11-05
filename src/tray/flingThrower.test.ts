import { describe, expect, it } from "vitest";
import { d6, d20 } from "../dice/dieTypes";
import type { DieDefinition, Vec3 } from "../dice/types";
import { flingRethrow, flingThrow, MAX_THROW_SPEED, MIN_THROW_SPEED, releaseVelocity } from "./flingThrower";
import { TIMESTEP, TRAY, TraySimulation, type Throw } from "./traySimulation";

const NEAR_CENTRE: Vec3 = { x: 0, y: 0, z: TRAY.depth / 2 - 1 };

const speed = (t: Throw) => Math.hypot(t.linearVelocity.x, t.linearVelocity.z);
/** Angle in degrees between a throw's travel across the floor and a direction. */
const angleTo = (t: Throw, direction: Vec3) => {
  const v = t.linearVelocity;
  const cos = (v.x * direction.x + v.z * direction.z) / (speed(t) * Math.hypot(direction.x, direction.z));
  return (Math.acos(Math.min(1, cos)) * 180) / Math.PI;
};

describe("releaseVelocity", () => {
  it("is the speed and direction of the pointer across the floor just before release", () => {
    const v = releaseVelocity([
      { point: { x: 0, y: 0, z: 3 }, time: 1000 },
      { point: { x: 0, y: 0, z: 2 }, time: 1050 },
      { point: { x: 0, y: 0, z: 1 }, time: 1100 },
    ]);
    expect(v.x).toBeCloseTo(0);
    expect(v.y).toBe(0);
    expect(v.z).toBeCloseTo(-20); // 2 units in 0.1 s
  });

  it("only counts the last moment of the drag, so a drag that stops before release has no speed", () => {
    const v = releaseVelocity([
      { point: { x: 0, y: 0, z: 3 }, time: 1000 },
      { point: { x: 2, y: 0, z: 0 }, time: 1100 },
      { point: { x: 2, y: 0, z: 0 }, time: 1400 },
    ]);
    expect(Math.hypot(v.x, v.z)).toBeCloseTo(0);
  });

  it("has no speed from a single sample, as when the pointer is pressed and let go", () => {
    expect(releaseVelocity([{ point: { x: 1, y: 0, z: 1 }, time: 500 }])).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe("flingThrow: the whole Hand", () => {
  const hand = [d6, d6, d20];

  it("throws every Die of the Hand in the direction of the fling", () => {
    for (const velocity of [
      { x: 0, y: 0, z: -15 },
      { x: 10, y: 0, z: -10 },
      { x: -12, y: 0, z: -3 },
    ]) {
      const throws = flingThrow(TRAY, hand, { from: NEAR_CENTRE, velocity })!;
      expect(throws).toHaveLength(3);
      for (const t of throws) expect(angleTo(t, velocity)).toBeLessThan(15);
    }
  });

  it("throws harder the faster the fling", () => {
    const fling = (z: number) => flingThrow(TRAY, hand, { from: NEAR_CENTRE, velocity: { x: 0, y: 0, z } })!;
    const slowest = Math.max(...fling(-8).map(speed));
    const fastest = Math.min(...fling(-16).map(speed));
    expect(fastest).toBeGreaterThan(slowest);
  });

  it("caps how hard a very fast fling throws", () => {
    const throws = flingThrow(TRAY, hand, { from: NEAR_CENTRE, velocity: { x: 300, y: 0, z: -400 } })!;
    for (const t of throws) expect(speed(t)).toBeCloseTo(MAX_THROW_SPEED);
  });

  it("throws a gentle but real fling at least hard enough to tumble", () => {
    const throws = flingThrow(TRAY, hand, { from: NEAR_CENTRE, velocity: { x: 0, y: 0, z: -3 } })!;
    for (const t of throws) expect(speed(t)).toBeCloseTo(MIN_THROW_SPEED);
  });

  it("doesn't throw when the pointer was barely moving at release", () => {
    expect(flingThrow(TRAY, hand, { from: NEAR_CENTRE, velocity: { x: 0.5, y: 0, z: -0.5 } })).toBeUndefined();
  });

  /** Dice starting at the same moment must start apart, and inside the Tray's walls and lid. */
  function expectClearStarts(dice: DieDefinition[], throws: Throw[]) {
    throws.forEach((t, i) => {
      const r = dice[i].radius;
      expect(Math.abs(t.position.x)).toBeLessThanOrEqual(TRAY.width / 2 - r);
      expect(Math.abs(t.position.z)).toBeLessThanOrEqual(TRAY.depth / 2 - r);
      expect(t.position.y).toBeGreaterThanOrEqual(r);
      expect(t.position.y).toBeLessThanOrEqual(TRAY.lidHeight - r);
      throws.forEach((other, j) => {
        if (j <= i || (other.delay ?? 0) !== (t.delay ?? 0)) return;
        const gap = Math.hypot(
          t.position.x - other.position.x,
          t.position.y - other.position.y,
          t.position.z - other.position.z,
        );
        expect(gap).toBeGreaterThanOrEqual(r + dice[j].radius);
      });
    });
  }

  it("starts the Hand's dice apart, around where the fling was released", () => {
    const from = { x: 2, y: 0, z: 1 };
    const throws = flingThrow(TRAY, hand, { from, velocity: { x: 0, y: 0, z: -10 } })!;
    expectClearStarts(hand, throws);
    for (const t of throws) expect(Math.hypot(t.position.x - from.x, t.position.z - from.z)).toBeLessThan(3);
  });

  it("keeps the dice inside the Tray when the fling is released at or past a wall", () => {
    for (const from of [
      { x: TRAY.width / 2, y: 0, z: TRAY.depth / 2 },
      { x: -TRAY.width, y: 0, z: -TRAY.depth },
    ]) {
      expectClearStarts(hand, flingThrow(TRAY, hand, { from, velocity: { x: 0, y: 0, z: -10 } })!);
    }
  });

  it("throws a Hand too big to start all at once in quick waves", () => {
    const big = Array.from({ length: 50 }, () => d20);
    const throws = flingThrow(TRAY, big, { from: NEAR_CENTRE, velocity: { x: 0, y: 0, z: -10 } })!;
    expect(throws).toHaveLength(50);
    expectClearStarts(big, throws);
    expect(Math.max(...throws.map((t) => t.delay ?? 0))).toBeGreaterThan(0);
  });
});

describe("flingRethrow: a Cocked Die", () => {
  // Against the left wall, closer than its radius as a resting Die can be.
  const cocked = { definition: d20, position: { x: -4.1, y: 0.8, z: 2 }, rotation: { x: 0, y: 0.6, z: 0, w: 0.8 } };

  it("picks the Die up as it lies and re-throws it in the direction and strength of the fling", () => {
    const velocity = { x: 6, y: 0, z: -8 };
    const t = flingRethrow(TRAY, cocked, { from: { x: -3, y: 0, z: 1 }, velocity })!;
    expect(t.position.x).toBeCloseTo(-4.1);
    expect(t.position.z).toBeCloseTo(2);
    expect(t.position.y).toBeGreaterThan(0.8);
    expect(t.position.y).toBeLessThanOrEqual(TRAY.lidHeight - d20.radius);
    expect(t.rotation).toEqual(cocked.rotation);
    expect(angleTo(t, velocity)).toBeLessThan(15);
    expect(speed(t)).toBeCloseTo(10);
  });

  it("doesn't re-throw when the pointer was barely moving at release", () => {
    expect(flingRethrow(TRAY, cocked, { from: NEAR_CENTRE, velocity: { x: 0, y: 0, z: 0.2 } })).toBeUndefined();
  });
});

describe("flinging in the Tray", () => {
  it("sends the Hand's dice across the Tray the way they were flung", async () => {
    const sim = await TraySimulation.create();
    const hand = [d6, d6, d20];
    for (const [velocity, travels] of [
      [{ x: 15, y: 0, z: 0 }, (start: Vec3, now: Vec3) => now.x - start.x],
      [{ x: -15, y: 0, z: 0 }, (start: Vec3, now: Vec3) => start.x - now.x],
      [{ x: 0, y: 0, z: -15 }, (start: Vec3, now: Vec3) => start.z - now.z],
    ] as const) {
      sim.clear();
      const throws = flingThrow(TRAY, hand, { from: { x: 0, y: 0, z: 0 }, velocity })!;
      const dice = hand.map((die, i) => sim.throwDie(die, throws[i]));
      for (let step = 0; step < 0.15 / TIMESTEP; step++) sim.step();
      dice.forEach((die, i) => expect(travels(throws[i].position, die.position)).toBeGreaterThan(1));
    }
  });
});

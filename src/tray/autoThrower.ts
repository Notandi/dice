import type { DieDefinition } from "../dice/types";
import type { Throw, TrayDimensions } from "./traySimulation";

/**
 * The automatic Thrower: a throw from the near edge of the Tray towards the
 * far wall, with random aim, force and spin. Randomness only shapes the throw,
 * never the Face Value (ADR 0001).
 */
export function autoThrow(tray: TrayDimensions, dieType: DieDefinition): Throw {
  const random = Math.random;
  const between = (min: number, max: number) => min + (max - min) * random();
  const margin = dieType.edgeLength;

  return {
    position: {
      x: between(-tray.width / 2 + margin, tray.width / 2 - margin),
      y: between(dieType.edgeLength / 2 + 0.1, tray.wallHeight - dieType.edgeLength / 2 - 0.1),
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

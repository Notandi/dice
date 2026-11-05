import { buildDie } from "./polyhedron";
import type { DieDefinition, Vec3 } from "./types";

const PHI = (1 + Math.sqrt(5)) / 2;

/** Tetrahedron, read at the corner pointing up. */
export const d4 = buildDie({
  name: "d4",
  colour: "#e3c04a",
  inkColour: "#1d2433",
  vertices: [
    { x: 1, y: 1, z: 1 },
    { x: 1, y: -1, z: -1 },
    { x: -1, y: 1, z: -1 },
    { x: -1, y: -1, z: 1 },
  ],
  radius: 0.95,
  numbering: "corners",
});

/** Cube with an edge of 1. Opposite faces add up to 7, like a real d6. */
export const d6 = buildDie({
  name: "d6",
  colour: "#f4efe3",
  inkColour: "#1d2433",
  vertices: [-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => ({ x, y, z })))),
  radius: Math.sqrt(3) / 2,
  numbering: { labels: [1, 2, 3], oppositeSum: 7 },
});

/** Octahedron. Opposite faces add up to 9. */
export const d8 = buildDie({
  name: "d8",
  colour: "#3b6fd6",
  inkColour: "#ffffff",
  vertices: [
    { x: 1, y: 0, z: 0 },
    { x: -1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 },
    { x: 0, y: -1, z: 0 },
    { x: 0, y: 0, z: 1 },
    { x: 0, y: 0, z: -1 },
  ],
  radius: 0.85,
  numbering: { labels: [1, 2, 3, 4], oppositeSum: 9 },
});

/**
 * Pentagonal trapezohedron, poles on the Y axis, printed 0 to 9. Like a real
 * d10, the odd numbers meet at one pole and the even at the other, opposite
 * faces add up to 9, and a 0 reads as 10.
 */
const d10Shape = { vertices: trapezohedronVertices(5), radius: 0.85 };
const d10Numbering = { labels: [1, 3, 5, 7, 9], oppositeSum: 9 };

export const d10 = buildDie({
  name: "d10",
  colour: "#e07b2e",
  inkColour: "#1d2433",
  ...d10Shape,
  numbering: d10Numbering,
});

/**
 * The Tens Die of a d100: a d10 printed 00 to 90, giving the tens digit.
 * A 00 reads as 0.
 */
export const tensDie = buildDie({
  name: "d100 Tens Die",
  colour: "#1f7a6d",
  inkColour: "#ffffff",
  ...d10Shape,
  numbering: { ...d10Numbering, print: (n) => `${n}0`, value: (n) => n * 10 },
});

/**
 * The Units Die of a d100: a d10 printed 0 to 9, giving the ones digit.
 * A 0 reads as 0. Paler than the Tens Die so the pair can be told apart.
 */
export const unitsDie = buildDie({
  name: "d100 Units Die",
  colour: "#8fd6c9",
  inkColour: "#1d2433",
  ...d10Shape,
  numbering: { ...d10Numbering, value: (n) => n },
});

/** Dodecahedron. Opposite faces add up to 13. */
export const d12 = buildDie({
  name: "d12",
  colour: "#8e4bb5",
  inkColour: "#ffffff",
  vertices: [
    ...[-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => ({ x, y, z })))),
    ...cyclicPermutations(1 / PHI, PHI),
  ],
  radius: 0.9,
  numbering: { labels: [1, 2, 3, 4, 5, 6], oppositeSum: 13 },
});

/** Icosahedron. Opposite faces add up to 21. */
export const d20 = buildDie({
  name: "d20",
  colour: "#c23b3b",
  inkColour: "#ffffff",
  vertices: cyclicPermutations(1, PHI),
  radius: 0.95,
  numbering: { labels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], oppositeSum: 21 },
});

/** Every Die Type a single Die can be, in picker order. */
export const DIE_TYPES = [d4, d6, d8, d10, d12, d20];

/**
 * A Die Type as a Roll asks for it: the dice thrown for it and how their
 * Face Values combine into one value.
 */
export interface RolledDieType {
  name: string;
  dice: DieDefinition[];
  combine(faceValues: number[]): number;
}

/** A d100, thrown as a Tens Die and a Units Die together. */
export const d100: RolledDieType = {
  name: "d100",
  dice: [tensDie, unitsDie],
  combine: ([tens, units]) => d100Value(tens, units),
};

/** Every Die Type a Roll can ask for, in picker order. */
export const ROLLED_DIE_TYPES: RolledDieType[] = [
  ...DIE_TYPES.map((die) => ({ name: die.name, dice: [die], combine: ([value]: number[]) => value })),
  d100,
];

/** Tens + units, where 00 with 0 reads as 100. */
function d100Value(tens: number, units: number): number {
  return tens + units === 0 ? 100 : tens + units;
}

/**
 * Corners of an n-sided trapezohedron: two poles and two zig-zag rings of n
 * corners, the upper ring offset half a step from the lower. The pole height
 * keeps each kite-shaped face flat.
 */
function trapezohedronVertices(n: number) {
  const ringHeight = 0.1;
  const halfStep = Math.cos(Math.PI / n);
  const poleHeight = (ringHeight * (1 + halfStep)) / (1 - halfStep);
  const ring = (offset: number, y: number) =>
    Array.from({ length: n }, (_, i) => {
      const angle = ((2 * i + offset) * Math.PI) / n;
      return { x: Math.cos(angle), y, z: Math.sin(angle) };
    });
  return [{ x: 0, y: poleHeight, z: 0 }, { x: 0, y: -poleHeight, z: 0 }, ...ring(0, ringHeight), ...ring(1, -ringHeight)];
}

/** (0, ±a, ±b) and its two cyclic permutations. */
function cyclicPermutations(a: number, b: number): Vec3[] {
  return [-1, 1].flatMap((sa) =>
    [-1, 1].flatMap((sb) => [
      { x: 0, y: sa * a, z: sb * b },
      { x: sa * a, y: sb * b, z: 0 },
      { x: sb * b, y: 0, z: sa * a },
    ]),
  );
}

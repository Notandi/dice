import { describe, expect, it } from "vitest";
import { d4, d6, d8, d10, d12, d20, tensDie, unitsDie } from "./dieTypes";
import { readFace } from "./faceReader";
import { add, cross, dot, normalize, scale } from "./polyhedron";
import type { DieDefinition, Face, Rotation, Vec3 } from "./types";

const q = Math.SQRT1_2; // sin(45°) = cos(45°): the quaternion parts of a quarter turn

describe("Face Reader: d6", () => {
  it("reads 1 when the d6 rests unrotated", () => {
    expect(readFace(d6, { x: 0, y: 0, z: 0, w: 1 })).toBe(1);
  });

  it("reads 6 when the d6 is flipped upside down", () => {
    expect(readFace(d6, { x: 1, y: 0, z: 0, w: 0 })).toBe(6);
  });

  it("reads 1 however far the d6 is turned about the vertical", () => {
    // 100° about Y: sin(50°), cos(50°)
    expect(readFace(d6, { x: 0, y: 0.766044, z: 0, w: 0.642788 })).toBe(1);
  });

  it("reads 2 after a quarter turn counter-clockwise about Z", () => {
    expect(readFace(d6, { x: 0, y: 0, z: q, w: q })).toBe(2);
  });

  it("reads 5 after a quarter turn clockwise about Z", () => {
    expect(readFace(d6, { x: 0, y: 0, z: -q, w: q })).toBe(5);
  });

  it("reads 3 after a quarter turn clockwise about X", () => {
    expect(readFace(d6, { x: -q, y: 0, z: 0, w: q })).toBe(3);
  });

  it("reads 4 after a quarter turn counter-clockwise about X", () => {
    expect(readFace(d6, { x: q, y: 0, z: 0, w: q })).toBe(4);
  });
});

describe("Face Reader: d4", () => {
  it("reads the number printed at the top corner, whichever face it rests on", () => {
    for (const bottom of d4.faces) {
      const rotation = turnTo(bottom.normal, DOWN);
      const topCornerLabels = d4.faces
        .filter((face) => face !== bottom)
        .map((face) => labelAtCorner(face, topCorner(d4, rotation)));

      expect(new Set(topCornerLabels).size).toBe(1);
      expect(readFace(d4, rotation)).toBe(Number(topCornerLabels[0]));
    }
  });

  it("reads each of 1 to 4 on exactly one corner", () => {
    const values = d4.faces.map((bottom) => readFace(d4, turnTo(bottom.normal, DOWN)));
    expect(values.sort()).toEqual([1, 2, 3, 4]);
  });

  it("still reads the top corner when the d4 is tilted a little", () => {
    for (const bottom of d4.faces) {
      const resting = turnTo(bottom.normal, DOWN);
      expect(readFace(d4, compose(TILT, resting))).toBe(readFace(d4, resting));
    }
  });
});

/** Dice numbered in the centre of each face: d6, d8, d10, d12 and d20. */
function describeFaceNumberedDie(die: DieDefinition, faceCount: number, oppositeSum: number) {
  describe(`Face Reader: ${die.name}`, () => {
    it(`has ${faceCount} faces, each with one number printed in its centre`, () => {
      expect(die.faces).toHaveLength(faceCount);
      for (const face of die.faces) {
        expect(face.labels).toEqual([{ text: expect.any(String), at: "centre" }]);
      }
    });

    it("reads the number printed on whichever face points up", () => {
      for (const face of die.faces) {
        expect(readFace(die, turnTo(face.normal, UP))).toBe(printedValue(face, faceCount));
      }
    });

    it(`reads each of 1 to ${faceCount} on exactly one face`, () => {
      const values = die.faces.map((face) => readFace(die, turnTo(face.normal, UP)));
      expect(values.sort((a, b) => a! - b!)).toEqual(Array.from({ length: faceCount }, (_, i) => i + 1));
    });

    it(`has opposite faces printed with numbers adding up to ${oppositeSum}`, () => {
      for (const face of die.faces) {
        const top = turnTo(face.normal, DOWN);
        const opposite = die.faces.find((f) => dot(rotate(f.normal, top), UP) > 0.999)!;
        expect(Number(face.labels[0].text) + Number(opposite.labels[0].text)).toBe(oppositeSum);
      }
    });

    it("still reads the top face when the Die is tilted a little", () => {
      for (const face of die.faces) {
        const resting = turnTo(face.normal, UP);
        expect(readFace(die, compose(TILT, resting))).toBe(readFace(die, resting));
      }
    });
  });
}

describeFaceNumberedDie(d6, 6, 7);
describeFaceNumberedDie(d8, 8, 9);
describeFaceNumberedDie(d10, 10, 9);
describeFaceNumberedDie(d12, 12, 13);
describeFaceNumberedDie(d20, 20, 21);

describe("Face Reader: d10", () => {
  it("reads a 0 face as 10", () => {
    const zero = d10.faces.find((face) => face.labels[0].text === "0")!;
    expect(readFace(d10, turnTo(zero.normal, UP))).toBe(10);
  });

  it("is printed 0 to 9", () => {
    const printed = d10.faces.map((face) => face.labels[0].text).sort();
    expect(printed).toEqual(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]);
  });

  it("has the odd numbers around one pole and the even numbers around the other", () => {
    const facesAt = (corner: number) => d10.faces.filter((f) => f.corners.includes(corner));
    const poles = d10.vertices.map((_, i) => i).filter((i) => facesAt(i).length === 5);
    const parityAround = (corner: number) => [...new Set(facesAt(corner).map((f) => Number(f.labels[0].text) % 2))];

    expect(poles).toHaveLength(2);
    expect(poles.map(parityAround)).toEqual(expect.arrayContaining([[0], [1]]));
  });
});

describe("Face Reader: Tens Die", () => {
  it("is printed 00 to 90 in tens, one number in the centre of each face", () => {
    const printed = tensDie.faces.map((face) => face.labels[0].text).sort();
    expect(printed).toEqual(["00", "10", "20", "30", "40", "50", "60", "70", "80", "90"]);
    for (const face of tensDie.faces) expect(face.labels).toHaveLength(1);
  });

  it("reads the tens printed on whichever face points up, with 00 as 0", () => {
    const expected: Record<string, number> = { "00": 0, "10": 10, "20": 20, "30": 30, "40": 40, "50": 50, "60": 60, "70": 70, "80": 80, "90": 90 };
    for (const face of tensDie.faces) {
      expect(readFace(tensDie, turnTo(face.normal, UP))).toBe(expected[face.labels[0].text]);
    }
  });

  it("still reads the top face when tilted a little", () => {
    for (const face of tensDie.faces) {
      const resting = turnTo(face.normal, UP);
      expect(readFace(tensDie, compose(TILT, resting))).toBe(readFace(tensDie, resting));
    }
  });
});

describe("Face Reader: Units Die", () => {
  it("is printed 0 to 9, one number in the centre of each face", () => {
    const printed = unitsDie.faces.map((face) => face.labels[0].text).sort();
    expect(printed).toEqual(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]);
    for (const face of unitsDie.faces) expect(face.labels).toHaveLength(1);
  });

  it("reads the number printed on whichever face points up, with 0 as 0", () => {
    for (const face of unitsDie.faces) {
      expect(readFace(unitsDie, turnTo(face.normal, UP))).toBe(Number(face.labels[0].text));
    }
  });

  it("still reads the top face when tilted a little", () => {
    for (const face of unitsDie.faces) {
      const resting = turnTo(face.normal, UP);
      expect(readFace(unitsDie, compose(TILT, resting))).toBe(readFace(unitsDie, resting));
    }
  });

  it("looks different from the Tens Die", () => {
    expect(unitsDie.colour).not.toBe(tensDie.colour);
  });
});

describe("Face Reader: Cocked", () => {
  /** Each Die Type resting squarely on each of its faces. */
  const restingPoses = [d4, d6, d8, d10, d12, d20, tensDie, unitsDie].flatMap((die) =>
    die.faces.map((face) => ({
      die,
      rotation: die === d4 ? turnTo(face.normal, DOWN) : turnTo(face.normal, UP),
    })),
  );

  it("reads a Face Value when the top face or corner is just inside 10° of straight up", () => {
    for (const { die, rotation } of restingPoses) {
      const tilted = compose(leanBy(9.5), rotation);
      expect(readFace(die, tilted), die.name).toBe(readFace(die, rotation));
      expect(readFace(die, tilted), die.name).toBeTypeOf("number");
    }
  });

  it("is Cocked when no face or corner is within 10° of straight up", () => {
    for (const { die, rotation } of restingPoses) {
      expect(readFace(die, compose(leanBy(10.5), rotation)), die.name).toBeUndefined();
    }
  });

  it("is Cocked when a d6 balances on an edge", () => {
    expect(readFace(d6, axisAngle({ x: 0, y: 0, z: 1 }, Math.PI / 4))).toBeUndefined();
  });
});

// --- helpers -------------------------------------------------------------

const UP: Vec3 = { x: 0, y: 1, z: 0 };
const DOWN: Vec3 = { x: 0, y: -1, z: 0 };
/** 8° about an axis that is neither vertical nor horizontal: tilted, but not Cocked. */
const TILT = axisAngle({ x: 1, y: 0.3, z: 0.5 }, (8 * Math.PI) / 180);

/** A lean of `degrees` about a horizontal axis, so whatever pointed straight up ends that far from it. */
function leanBy(degrees: number): Rotation {
  return axisAngle({ x: 1, y: 0, z: 0.4 }, (degrees * Math.PI) / 180);
}

/** The shortest rotation that turns local direction `from` to world direction `to`. */
function turnTo(from: Vec3, to: Vec3): Rotation {
  const a = normalize(from);
  const d = dot(a, to);
  if (d < -0.999999) {
    // Half turn about any axis perpendicular to `from`.
    const axis = Math.abs(a.x) < 0.9 ? cross(a, { x: 1, y: 0, z: 0 }) : cross(a, { x: 0, y: 0, z: 1 });
    return axisAngle(axis, Math.PI);
  }
  const c = cross(a, to);
  const n = Math.hypot(c.x, c.y, c.z, 1 + d);
  return { x: c.x / n, y: c.y / n, z: c.z / n, w: (1 + d) / n };
}

function axisAngle(axis: Vec3, angle: number): Rotation {
  const a = normalize(axis);
  const s = Math.sin(angle / 2);
  return { x: a.x * s, y: a.y * s, z: a.z * s, w: Math.cos(angle / 2) };
}

/** The rotation that applies `second` after `first`. */
function compose(second: Rotation, first: Rotation): Rotation {
  const a = second;
  const b = first;
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}

function rotate(v: Vec3, r: Rotation): Vec3 {
  // v' = v + 2w(u × v) + 2u × (u × v), where u is the vector part of r.
  const u = { x: r.x, y: r.y, z: r.z };
  const t = scale(cross(u, v), 2);
  const rotated = add(add(v, scale(t, r.w)), cross(u, t));
  return rotated;
}

/** Index of the vertex that sits highest when the Die has the given rotation. */
function topCorner(die: DieDefinition, rotation: Rotation): number {
  let best = 0;
  die.vertices.forEach((v, i) => {
    if (dot(rotate(v, rotation), UP) > dot(rotate(die.vertices[best], rotation), UP)) best = i;
  });
  return best;
}

function labelAtCorner(face: Face, corner: number): string {
  const label = face.labels.find((l) => l.at === corner);
  if (!label) throw new Error(`face has no label at corner ${corner}`);
  return label.text;
}

/** The Face Value printed on a face: its number, except that a 0 reads as the number of faces. */
function printedValue(face: Face, faceCount: number): number {
  const n = Number(face.labels[0].text);
  return n === 0 ? faceCount : n;
}

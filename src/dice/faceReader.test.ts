import { describe, expect, it } from "vitest";
import { d6 } from "./d6";
import { readFace } from "./faceReader";

const s = Math.SQRT1_2; // sin(45°) = cos(45°): a quarter turn

describe("Face Reader: d6", () => {
  it("reads 1 when the d6 rests unrotated", () => {
    expect(readFace(d6, { x: 0, y: 0, z: 0, w: 1 })).toBe(1);
  });

  it("reads 6 when the d6 is flipped upside down", () => {
    expect(readFace(d6, { x: 1, y: 0, z: 0, w: 0 })).toBe(6);
  });

  it("reads 2 after a quarter turn counter-clockwise about Z", () => {
    expect(readFace(d6, { x: 0, y: 0, z: s, w: s })).toBe(2);
  });

  it("reads 5 after a quarter turn clockwise about Z", () => {
    expect(readFace(d6, { x: 0, y: 0, z: -s, w: s })).toBe(5);
  });

  it("reads 3 after a quarter turn clockwise about X", () => {
    expect(readFace(d6, { x: -s, y: 0, z: 0, w: s })).toBe(3);
  });

  it("reads 4 after a quarter turn counter-clockwise about X", () => {
    expect(readFace(d6, { x: s, y: 0, z: 0, w: s })).toBe(4);
  });
});

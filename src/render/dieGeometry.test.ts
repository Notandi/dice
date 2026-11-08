import { describe, expect, it } from "vitest";
import { d4, d6, d8, d10, d12, d20, tensDie, unitsDie } from "../dice/dieTypes";
import { dot } from "../dice/polyhedron";
import type { DieDefinition } from "../dice/types";
import { atlasCell, dieGeometry } from "./dieGeometry";

const ALL = [d4, d6, d8, d10, d12, d20, tensDie, unitsDie];

describe.each(ALL.map((die) => [die.name, die] as const))("dieGeometry: %s", (_, die: DieDefinition) => {
  it("is drawn as one piece, with one material", () => {
    expect(dieGeometry(die).groups).toHaveLength(0);
  });

  it("maps every face onto its own cell of the texture", () => {
    const geometry = dieGeometry(die);
    const normals = geometry.getAttribute("normal");
    const uvs = geometry.getAttribute("uv");

    die.faces.forEach((face, i) => {
      const cell = atlasCell(die, i);
      let points = 0;
      for (let v = 0; v < normals.count; v++) {
        const normal = { x: normals.getX(v), y: normals.getY(v), z: normals.getZ(v) };
        if (dot(normal, face.normal) < 0.999) continue;
        points++;
        expect(uvs.getX(v)).toBeGreaterThanOrEqual(cell.u0);
        expect(uvs.getX(v)).toBeLessThanOrEqual(cell.u1);
        expect(uvs.getY(v)).toBeGreaterThanOrEqual(cell.v0);
        expect(uvs.getY(v)).toBeLessThanOrEqual(cell.v1);
      }
      expect(points).toBeGreaterThanOrEqual(3);
    });
  });

  it("gives no two faces overlapping cells, all within the texture", () => {
    const cells = die.faces.map((_, i) => atlasCell(die, i));
    for (const c of cells) {
      expect(c.u0).toBeGreaterThanOrEqual(0);
      expect(c.v0).toBeGreaterThanOrEqual(0);
      expect(c.u1).toBeLessThanOrEqual(1);
      expect(c.v1).toBeLessThanOrEqual(1);
    }
    for (let a = 0; a < cells.length; a++) {
      for (let b = a + 1; b < cells.length; b++) {
        const A = cells[a];
        const B = cells[b];
        const overlap = A.u0 < B.u1 && B.u0 < A.u1 && A.v0 < B.v1 && B.v0 < A.v1;
        expect(overlap, `faces ${a} and ${b}`).toBe(false);
      }
    }
  });
});

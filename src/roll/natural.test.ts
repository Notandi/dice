import { describe, expect, it } from "vitest";
import { parseNotation } from "../notation/diceNotation";
import { natural } from "./natural";
import { RollEngine } from "./roll";

/** The Natural of a Roll of `notation` whose dice show `faceValues`, in Tray order. */
function naturalOf(notation: string, faceValues: number[]) {
  const parsed = parseNotation(notation);
  if (!parsed.ok) throw new Error(parsed.error);
  const step = new RollEngine(parsed.plan).settle(faceValues);
  if (step.kind !== "done") throw new Error(`${notation} needs more throws`);
  return natural(step.result.breakdown);
}

describe("natural", () => {
  it("is a Natural 20 when a d20 shows 20", () => {
    expect(naturalOf("1d20+5", [20])).toBe("Natural 20");
  });

  it("is a Natural 1 when a d20 shows 1", () => {
    expect(naturalOf("1d20+5", [1])).toBe("Natural 1");
  });

  it("is neither for any other d20 Face Value", () => {
    expect(naturalOf("1d20", [12])).toBeUndefined();
  });

  it("only counts d20s", () => {
    expect(naturalOf("1d4+1d6", [1, 1])).toBeUndefined();
  });

  it("prefers a Natural 20 when one d20 shows 20 and another 1", () => {
    expect(naturalOf("2d20", [1, 20])).toBe("Natural 20");
  });

  it("ignores Dropped d20s", () => {
    expect(naturalOf("2d20kh1", [20, 5])).toBe("Natural 20");
    expect(naturalOf("2d20kh1", [1, 5])).toBeUndefined();
    expect(naturalOf("2d20kl1", [20, 5])).toBeUndefined();
  });
});

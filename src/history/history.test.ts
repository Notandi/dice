import { describe, expect, it } from "vitest";
import { parseNotation, type RollPlan } from "../notation/diceNotation";
import { rollResult } from "../roll/roll";
import { History } from "./history";

function plan(notation: string): RollPlan {
  const parsed = parseNotation(notation);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.plan;
}

function record(history: History, notation: string, faceValues: number[]) {
  const p = plan(notation);
  return history.add(p, rollResult(p, faceValues));
}

describe("History", () => {
  it("is empty before any Roll", () => {
    expect(new History().entries).toEqual([]);
  });

  it("records a finished Roll's notation, Breakdown and Total", () => {
    const history = new History();
    record(history, "2d6+3", [3, 5]);

    expect(history.entries).toMatchObject([{ notation: "2d6+3", breakdown: "2d6 (3, 5) + 3", total: 11 }]);
  });

  it("keeps each Roll's plan so it can be loaded back into the Hand", () => {
    const history = new History();
    record(history, "1d20+1d4-2", [9, 3]);

    expect(history.entries[0].plan).toEqual(plan("1d20+1d4-2"));
  });

  it("lists the newest Roll first", () => {
    const history = new History();
    record(history, "1d20", [14]);
    record(history, "1d4-1", [2]);
    record(history, "d%", [70, 3]);

    expect(history.entries.map((entry) => entry.notation)).toEqual(["1d100", "1d4-1", "1d20"]);
  });
});

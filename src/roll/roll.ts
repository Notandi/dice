import type { DieDefinition } from "../dice/types";
import { diceTermNotation, type DiceTerm, type KeepDrop, type RollPlan } from "../notation/diceNotation";

/** The most dice a single Roll may put in the Tray. */
export const MAX_DICE = 50;

/** A Die's value in a Breakdown; a d100's is its Tens Die and Units Die combined. */
export interface BreakdownValue {
  value: number;
  dropped: boolean;
}

/** One part of a Breakdown: a dice group with each Die's value, or a Modifier. */
export type BreakdownPart =
  | { kind: "dice"; sign: 1 | -1; notation: string; values: BreakdownValue[] }
  | { kind: "modifier"; value: number };

export interface RollResult {
  total: number;
  breakdown: BreakdownPart[];
  /**
   * One entry per Die in the Tray, in the order of {@link diceToThrow}: true
   * if it was Dropped. Both dice of a d100 share their pair's entry.
   */
  droppedByTrayDie: boolean[];
}

/** How many dice the Tray needs for the plan; a d100 needs two. */
export function diceNeeded(plan: RollPlan): number {
  return diceTerms(plan).reduce((n, t) => n + t.count * t.dieType.dice.length, 0);
}

/** Why the plan can't be rolled, or undefined if it can. */
export function refusal(plan: RollPlan): string | undefined {
  const needed = diceNeeded(plan);
  if (needed > MAX_DICE) return `That Roll needs ${needed} dice, but the Tray holds at most ${MAX_DICE}.`;
  return undefined;
}

/** Every Die to put in the Tray for the plan, group by group. */
export function diceToThrow(plan: RollPlan): DieDefinition[] {
  return diceTerms(plan).flatMap((t) => Array.from({ length: t.count }, () => t.dieType.dice).flat());
}

/**
 * The Total and Breakdown once every Die has rested. `faceValues` holds one
 * Face Value per Die, in the order of {@link diceToThrow}.
 */
export function rollResult(plan: RollPlan, faceValues: number[]): RollResult {
  let faceIndex = 0;
  const droppedByTrayDie: boolean[] = [];
  const breakdown = plan.terms.map((term): BreakdownPart => {
    if (term.kind === "modifier") return term;
    const perDie = term.dieType.dice.length;
    const combined = Array.from({ length: term.count }, () => {
      const value = term.dieType.combine(faceValues.slice(faceIndex, faceIndex + perDie));
      faceIndex += perDie;
      return value;
    });
    const dropped = droppedIndices(combined, term.keepDrop);
    const values = combined.map((value, i) => ({ value, dropped: dropped.has(i) }));
    for (const v of values) droppedByTrayDie.push(...Array<boolean>(perDie).fill(v.dropped));
    return { kind: "dice", sign: term.sign, notation: diceTermNotation(term), values };
  });
  const total = breakdown.reduce((running, part) => {
    if (part.kind === "modifier") return running + part.value;
    const kept = part.values.reduce((sum, v) => (v.dropped ? sum : sum + v.value), 0);
    return running + part.sign * kept;
  }, 0);
  return { total, breakdown, droppedByTrayDie };
}

/**
 * Which of a group's values are Dropped. Among equal values, the earlier
 * Die counts as the higher one, so ties are settled the same way every time.
 */
function droppedIndices(values: number[], keepDrop: KeepDrop | undefined): Set<number> {
  if (!keepDrop) return new Set();
  const highestFirst = values.map((_, i) => i).sort((a, b) => values[b] - values[a] || a - b);
  const dropCount = keepDrop.keep ? values.length - keepDrop.count : keepDrop.count;
  // Keeping the highest N drops the lowest rest, and vice versa.
  const dropHighest = keepDrop.keep ? !keepDrop.highest : keepDrop.highest;
  return new Set(dropHighest ? highestFirst.slice(0, dropCount) : highestFirst.slice(values.length - dropCount));
}

function diceTerms(plan: RollPlan): DiceTerm[] {
  return plan.terms.filter((t): t is DiceTerm => t.kind === "dice");
}

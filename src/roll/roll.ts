import type { DieDefinition } from "../dice/types";
import type { DiceTerm, RollPlan } from "../notation/diceNotation";

/** The most dice a single Roll may put in the Tray. */
export const MAX_DICE = 50;

/** One part of a Breakdown: a dice group with each Die's value, or a Modifier. */
export type BreakdownPart =
  | { kind: "dice"; sign: 1 | -1; notation: string; values: number[] }
  | { kind: "modifier"; value: number };

export interface RollResult {
  total: number;
  breakdown: BreakdownPart[];
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
  const breakdown = plan.terms.map((term): BreakdownPart => {
    if (term.kind === "modifier") return term;
    const values = Array.from({ length: term.count }, () => {
      const perDie = term.dieType.dice.length;
      const value = term.dieType.combine(faceValues.slice(faceIndex, faceIndex + perDie));
      faceIndex += perDie;
      return value;
    });
    return { kind: "dice", sign: term.sign, notation: `${term.count}${term.dieType.name}`, values };
  });
  const total = breakdown.reduce(
    (running, part) => running + (part.kind === "modifier" ? part.value : part.sign * part.values.reduce((a, b) => a + b, 0)),
    0,
  );
  return { total, breakdown };
}

function diceTerms(plan: RollPlan): DiceTerm[] {
  return plan.terms.filter((t): t is DiceTerm => t.kind === "dice");
}

/** A Breakdown as text, e.g. `1d20 (14) + 2d6 (3, 5) − 1`. */
export function formatBreakdown(parts: BreakdownPart[]): string {
  return parts
    .map((part, i) => {
      const negative = part.kind === "dice" ? part.sign < 0 : part.value < 0;
      const sign = negative ? (i > 0 ? " − " : "−") : i > 0 ? " + " : "";
      const body = part.kind === "dice" ? `${part.notation} (${part.values.join(", ")})` : String(Math.abs(part.value));
      return sign + body;
    })
    .join("");
}

import type { BreakdownPart } from "./roll";

export type Natural = "Natural 20" | "Natural 1";

/**
 * Whether a Roll's d20s came up a Natural 20 or a Natural 1. Only d20s that
 * count toward the Total do: Dropped ones are left out. A 20 wins over a 1.
 */
export function natural(breakdown: readonly BreakdownPart[]): Natural | undefined {
  const values = breakdown.flatMap((part) =>
    part.kind === "dice" && part.dieType === "d20" ? part.dice.filter((d) => !d.dropped).map((d) => d.value) : [],
  );
  if (values.includes(20)) return "Natural 20";
  if (values.includes(1)) return "Natural 1";
  return undefined;
}

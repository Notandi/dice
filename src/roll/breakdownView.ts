import type { BreakdownPart, DieResult } from "./roll";

/**
 * Shows a Breakdown in `el`, e.g. `1d20r1 (~~1~~ 14) + 2d6! (6!, 2, 5) − 1`:
 * Re-rolled values struck through before the one that counts, and `!` on
 * each Die that Exploded.
 */
export function renderBreakdown(el: HTMLElement, parts: readonly BreakdownPart[]): void {
  el.replaceChildren();
  parts.forEach((part, i) => {
    const negative = part.kind === "dice" ? part.sign < 0 : part.value < 0;
    el.append(negative ? (i > 0 ? " − " : "−") : i > 0 ? " + " : "");
    if (part.kind === "modifier") return el.append(String(Math.abs(part.value)));
    el.append(`${part.notation} (`);
    part.dice.forEach((die, j) => {
      if (j > 0) el.append(", ");
      el.append(...dieNodes(die));
    });
    el.append(")");
    if (part.explosionsCapped) el.append(" [no more Explodes: limit reached]");
  });
}

function dieNodes(die: DieResult): (Node | string)[] {
  const rerolled = die.rerolled.flatMap((value) => {
    const struck = document.createElement("s");
    struck.className = "rerolled";
    struck.title = "Re-rolled";
    struck.textContent = String(value);
    return [struck, " "];
  });
  if (!die.exploded) return [...rerolled, String(die.value)];
  const exploded = document.createElement("span");
  exploded.className = "exploded";
  exploded.title = "Exploded";
  exploded.textContent = `${die.value}!`;
  return [...rerolled, exploded];
}

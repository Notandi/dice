import type { BreakdownPart, DieResult } from "./roll";

/**
 * Shows a Breakdown in `el`, e.g. `1d20r1 (1 14) + 2d6! (6!, 2, 5) − 1`:
 * Re-rolled values (the 1 here) struck through before the one that counts,
 * `!` on each Die that Exploded, and Dropped values struck through too.
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
  const rerolled = die.rerolled.flatMap((value) => [labelled("s", "rerolled", "Re-rolled", String(value)), " "]);
  const text = die.exploded ? `${die.value}!` : String(die.value);
  if (die.dropped) return [...rerolled, labelled("s", "dropped", die.exploded ? "Exploded, Dropped" : "Dropped", text)];
  if (die.exploded) return [...rerolled, labelled("span", "exploded", "Exploded", text)];
  return [...rerolled, text];
}

function labelled(tag: "s" | "span", className: string, title: string, text: string): HTMLElement {
  const el = document.createElement(tag);
  el.className = className;
  el.title = title;
  el.textContent = text;
  return el;
}

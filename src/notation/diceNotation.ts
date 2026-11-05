import { ROLLED_DIE_TYPES, type RolledDieType } from "../dice/dieTypes";

/** `NdX`: a group of N dice of one Die Type, added to or subtracted from the Total. */
export interface DiceTerm {
  kind: "dice";
  sign: 1 | -1;
  count: number;
  dieType: RolledDieType;
}

/** A Modifier, signed: `-1` is `{ value: -1 }`. */
export interface ModifierTerm {
  kind: "modifier";
  value: number;
}

export type Term = DiceTerm | ModifierTerm;

/** A Roll as Dice Notation describes it: dice groups and Modifiers, in the order written. */
export interface RollPlan {
  terms: Term[];
}

export type ParseResult = { ok: true; plan: RollPlan } | { ok: false; error: string };

export const EMPTY_PLAN: RollPlan = { terms: [] };

const DIE_TYPE_LIST = ROLLED_DIE_TYPES.map((d) => d.name).join(", ");
const TERM = /^(\d*)d(\d+|%)|^(\d+)/i;

/**
 * Reads Dice Notation such as `1d20+1d4+3`: dice groups (`NdX`, `dX` for one
 * die, `d%` for d100) and Modifiers, joined with `+` or `-`. Spaces between
 * terms are allowed. Empty text is an empty Roll.
 */
export function parseNotation(text: string): ParseResult {
  const terms: Term[] = [];
  let rest = text.trim();

  while (rest) {
    let sign: 1 | -1 = 1;
    if (rest[0] === "+" || rest[0] === "-") {
      sign = rest[0] === "-" ? -1 : 1;
      rest = rest.slice(1).trimStart();
      if (!rest) return error(`Add dice (like 2d6) or a number after the last "${sign < 0 ? "-" : "+"}".`);
    } else if (terms.length > 0) {
      return error(`Couldn't read "${rest}". Join dice and numbers with + or -.`);
    }

    const match = TERM.exec(rest);
    if (!match) return error(`Couldn't read "${rest}". Write dice like 2d6, or a number like 3.`);
    const [whole, count, sides, modifier] = match;
    rest = rest.slice(whole.length).trimStart();

    if (modifier !== undefined) {
      terms.push({ kind: "modifier", value: sign * Number(modifier) });
      continue;
    }
    const name = sides === "%" ? "d100" : `d${Number(sides)}`;
    const dieType = ROLLED_DIE_TYPES.find((d) => d.name === name);
    if (!dieType) return error(`There's no ${whole.slice(count.length)}. Use ${DIE_TYPE_LIST}.`);
    const n = count === "" ? 1 : Number(count);
    if (n === 0) return error(`${whole} has no dice in it. Use at least 1.`);
    terms.push({ kind: "dice", sign, count: n, dieType });
  }

  return { ok: true, plan: { terms } };
}

/** Writes a Roll plan back as Dice Notation, e.g. `1d20+1d4+3`. */
export function formatNotation(plan: RollPlan): string {
  return plan.terms
    .map((term, i) => {
      const negative = term.kind === "dice" ? term.sign < 0 : term.value < 0;
      const sign = negative ? "-" : i > 0 ? "+" : "";
      const body = term.kind === "dice" ? `${term.count}${term.dieType.name}` : String(Math.abs(term.value));
      return sign + body;
    })
    .join("");
}

/**
 * Adds one Die of the given type to the plan: one more in its existing added
 * group if there is one, otherwise a new group after the last dice group.
 */
export function addDie(plan: RollPlan, dieType: RolledDieType): RollPlan {
  const terms = [...plan.terms];
  const group = terms.findIndex((t) => t.kind === "dice" && t.sign > 0 && t.dieType === dieType);
  if (group >= 0) {
    const term = terms[group] as DiceTerm;
    terms[group] = { ...term, count: term.count + 1 };
  } else {
    const afterLastDice = terms.reduce((at, t, i) => (t.kind === "dice" ? i + 1 : at), 0);
    terms.splice(afterLastDice, 0,{ kind: "dice", sign: 1, count: 1, dieType });
  }
  return { terms };
}

function error(message: string): ParseResult {
  return { ok: false, error: message };
}

import { ROLLED_DIE_TYPES, type RolledDieType } from "../dice/dieTypes";

/** A Face Value condition: exactly N (`rN`), N or lower (`r<N`), or N or higher (`r>N`). */
export interface Condition {
  compare: "=" | "<=" | ">=";
  value: number;
}

/**
 * Keep / Drop on a dice group: `kh2` keeps the highest 2 Face Values, `dl1`
 * drops the lowest 1. Dice that don't count toward the Total are Dropped.
 */
export interface KeepDrop {
  keep: boolean;
  highest: boolean;
  count: number;
}

/** `NdX`: a group of N dice of one Die Type, added to or subtracted from the Total. */
export interface DiceTerm {
  kind: "dice";
  sign: 1 | -1;
  count: number;
  dieType: RolledDieType;
  /** `!`: each Die showing its maximum Explodes. */
  explode?: boolean;
  /** `r`: a Die whose value meets this is Re-rolled, again and again while it does. */
  reroll?: Condition;
  /** `khN`, `klN`, `dhN` or `dlN`: only some of the group's values count. */
  keepDrop?: KeepDrop;
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
const REROLL = /^r([<>]?)(\d+)/i;
const KEEP_DROP = /^([kd])([hl])(\d+)/i;
const KEEP_DROP_START = /^(k[hl]?|d[hl])/i;
/** How each comparison is written after `r`. */
const COMPARE_SYMBOL: Record<Condition["compare"], string> = { "=": "", "<=": "<", ">=": ">" };

/**
 * Reads Dice Notation such as `1d20+1d4+3`: dice groups (`NdX`, `dX` for one
 * die, `d%` for d100) and Modifiers, joined with `+` or `-`. Spaces between
 * terms are allowed. Empty text is an empty Roll. A dice group may be
 * followed, in any order, by `!` to Explode, `rN`, `r<N` or `r>N` to
 * Re-roll, and `khN`, `klN`, `dhN` or `dlN` to Keep / Drop (as in `2d20kh1`
 * or `4d6dl1`).
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

    const noDieType = /^\d*d(?!\d|%)/i.exec(rest);
    if (noDieType) return error(`"${noDieType[0]}" needs a Die Type after the d, like ${noDieType[0]}6.`);
    const match = TERM.exec(rest);
    if (!match) return error(`Couldn't read "${rest}". Write dice like 2d6, or a number like 3.`);
    const [whole, count, sides, modifier] = match;
    rest = rest.slice(whole.length);

    if (modifier !== undefined) {
      terms.push({ kind: "modifier", value: sign * Number(modifier) });
      continue;
    }
    const name = sides === "%" ? "d100" : `d${Number(sides)}`;
    const dieType = ROLLED_DIE_TYPES.find((d) => d.name === name);
    if (!dieType) return error(`There's no ${whole.slice(count.length)}. Use ${DIE_TYPE_LIST}.`);
    const n = count === "" ? 1 : Number(count);
    if (n === 0) return error(`${whole} has no dice in it. Use at least 1.`);
    const term: DiceTerm = { kind: "dice", sign, count: n, dieType };

    // Explode, Re-roll and Keep / Drop options, written straight after the group.
    for (;;) {
      if (rest[0] === "!") {
        if (term.explode) return error(`${whole} has "!" twice. Write it once to Explode.`);
        term.explode = true;
        rest = rest.slice(1);
        continue;
      }
      const reroll = REROLL.exec(rest);
      if (reroll) {
        if (term.reroll) return error(`${whole} has two Re-rolls. Use one r per group.`);
        const [option, direction, value] = reroll;
        const compare = (Object.keys(COMPARE_SYMBOL) as Condition["compare"][]).find((c) => COMPARE_SYMBOL[c] === direction)!;
        term.reroll = { compare, value: Number(value) };
        if (rerollsEverything(term.reroll, dieType))
          return error(`"${option}" would Re-roll every ${dieType.name} forever. Pick a number some faces miss.`);
        rest = rest.slice(option.length);
        continue;
      }
      if (/^r/i.test(rest)) return error(`"r" needs a number to Re-roll, like r1, r<2 or r>19.`);
      const keepDrop = KEEP_DROP.exec(rest);
      if (keepDrop) {
        if (term.keepDrop) return error(`${whole} keeps or drops twice. Use one of kh, kl, dh or dl per group.`);
        const [option, keepOrDrop, highOrLow, countText] = keepDrop;
        const keepDropCount = Number(countText);
        const verb = keepOrDrop.toLowerCase() === "k" ? "keep" : "drop";
        if (keepDropCount === 0) return error(`${whole}${option} would ${verb} no dice. Use at least 1.`);
        if (keepDropCount > n)
          return error(`${whole}${option} can't ${verb} ${keepDropCount} of only ${n} ${n === 1 ? "die" : "dice"}.`);
        if (verb === "drop" && keepDropCount === n)
          return error(`${whole}${option} would drop every Die. Drop fewer than ${n}.`);
        term.keepDrop = { keep: verb === "keep", highest: highOrLow.toLowerCase() === "h", count: keepDropCount };
        rest = rest.slice(option.length);
        continue;
      }
      if (KEEP_DROP_START.test(rest))
        return error(`Couldn't read "${rest.trimEnd()}" after ${whole}. Keep or drop dice with kh1, kl1, dh1 or dl1.`);
      break;
    }
    rest = rest.trimStart();
    terms.push(term);
  }

  return { ok: true, plan: { terms } };
}

/** Writes a Roll plan back as Dice Notation, e.g. `1d20+1d4+3`. */
export function formatNotation(plan: RollPlan): string {
  return plan.terms
    .map((term, i) => {
      const negative = term.kind === "dice" ? term.sign < 0 : term.value < 0;
      const sign = negative ? "-" : i > 0 ? "+" : "";
      return sign + (term.kind === "dice" ? formatDice(term) : String(Math.abs(term.value)));
    })
    .join("");
}

/** A dice group without its sign, e.g. `2d6!r1` or `4d6dl1`. */
export function formatDice(term: DiceTerm): string {
  const explode = term.explode ? "!" : "";
  const reroll = term.reroll ? `r${COMPARE_SYMBOL[term.reroll.compare]}${term.reroll.value}` : "";
  const { keepDrop } = term;
  const keepDropText = keepDrop ? `${keepDrop.keep ? "k" : "d"}${keepDrop.highest ? "h" : "l"}${keepDrop.count}` : "";
  return `${term.count}${term.dieType.name}${explode}${reroll}${keepDropText}`;
}

/** Whether a value meets the condition. */
export function meets(condition: Condition, value: number): boolean {
  if (condition.compare === "<=") return value <= condition.value;
  if (condition.compare === ">=") return value >= condition.value;
  return value === condition.value;
}

/** True if every value the Die Type can give would be Re-rolled, so it would never stop. */
function rerollsEverything(condition: Condition, dieType: RolledDieType): boolean {
  return Array.from({ length: dieType.maxValue }, (_, i) => i + 1).every((value) => meets(condition, value));
}

/**
 * Adds one Die of the given type to the plan: one more in its existing added
 * group if there is one (and it has no options, whose meaning would change),
 * otherwise a new group after the last dice group.
 */
export function addDie(plan: RollPlan, dieType: RolledDieType): RollPlan {
  const terms = [...plan.terms];
  const group = terms.findIndex(
    (t) => t.kind === "dice" && t.sign > 0 && t.dieType === dieType && !t.explode && !t.reroll && !t.keepDrop,
  );
  if (group >= 0) {
    const term = terms[group] as DiceTerm;
    terms[group] = { ...term, count: term.count + 1 };
  } else {
    const afterLastDice = terms.reduce((at, t, i) => (t.kind === "dice" ? i + 1 : at), 0);
    terms.splice(afterLastDice, 0, { kind: "dice", sign: 1, count: 1, dieType });
  }
  return { terms };
}

function error(message: string): ParseResult {
  return { ok: false, error: message };
}

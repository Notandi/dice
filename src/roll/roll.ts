import type { DieDefinition } from "../dice/types";
import { formatDice, meets, type DiceTerm, type KeepDrop, type RollPlan } from "../notation/diceNotation";

/** The most dice a single Roll may put in the Tray. */
export const MAX_DICE = 50;

/** The most times dice may Explode in a single Roll. */
export const MAX_EXPLOSIONS = 20;

/** One Die of a dice group in the Breakdown. */
export interface DieResult {
  value: number;
  /** Values it showed before being Re-rolled, oldest first. None of them count. */
  rerolled: number[];
  /** It showed its maximum and Exploded, so the next Die in the group was thrown for it. */
  exploded: boolean;
  /** Left out of the Total by Keep / Drop. */
  dropped: boolean;
}

/** One part of a Breakdown: a dice group with each Die's result, or a Modifier. */
export type BreakdownPart =
  | {
      kind: "dice";
      sign: 1 | -1;
      /** The group's Die Type, e.g. `d20`. */
      dieType: string;
      notation: string;
      dice: DieResult[];
      /** A Die showed its maximum but couldn't Explode: the Roll hit the explosion cap or the dice limit. */
      explosionsCapped: boolean;
    }
  | { kind: "modifier"; value: number };

export interface RollResult {
  total: number;
  breakdown: BreakdownPart[];
  /** Tray indices of the Dropped dice, to dim them: both dice of a d100. */
  droppedTrayIndices: number[];
}

/**
 * What the Tray must do once every Die has rested with a Face Value: throw
 * some dice again and add new ones, then report back; or show the result.
 */
export type RollStep =
  | {
      kind: "throw";
      /** Tray indices of dice to throw again, for a Re-roll. */
      rethrow: number[];
      /** New dice to throw, for Explodes. They take the next Tray indices, in this order. */
      add: DieDefinition[];
    }
  | { kind: "done"; result: RollResult };

/** How many dice the Tray needs for the plan before any Explodes; a d100 needs two. */
export function diceNeeded(plan: RollPlan): number {
  return diceTerms(plan).reduce((n, t) => n + t.count * t.dieType.dice.length, 0);
}

/** Why the plan can't be rolled, or undefined if it can. */
export function refusal(plan: RollPlan): string | undefined {
  const needed = diceNeeded(plan);
  if (needed > MAX_DICE) return `That Roll needs ${needed} dice, but the Tray holds at most ${MAX_DICE}.`;
  return undefined;
}

/** Every Die to put in the Tray for the plan, group by group, before any Explodes. */
export function diceToThrow(plan: RollPlan): DieDefinition[] {
  return diceTerms(plan).flatMap((t) => Array.from({ length: t.count }, () => t.dieType.dice).flat());
}

/** A Die the engine is following, from its first throw to its final value. */
interface TrackedDie {
  /** Indices of its dice in the Tray: two for a d100. */
  trayIndices: number[];
  rerolled: number[];
  /** Set once the Die has a value that won't be Re-rolled. */
  value?: number;
  exploded: boolean;
}

interface Group {
  term: DiceTerm;
  dice: TrackedDie[];
  explosionsCapped: boolean;
}

/**
 * The rules of a Roll. It starts with {@link diceToThrow}'s dice in the Tray.
 * Each time every Die has rested with a Face Value, {@link settle} applies
 * Re-rolls, then Explodes, and says which dice to throw next, until no Die is
 * waiting for a value and the Roll is done. Re-rolled dice are thrown again in
 * place; each Explode adds a new Die, which is Re-rolled and Explodes in turn.
 * Keep / Drop then picks from every Die's final value, Exploded ones included.
 */
export class RollEngine {
  private readonly groups: Group[] = [];
  private trayCount = 0;
  private explosions = 0;

  constructor(private readonly plan: RollPlan) {
    for (const term of diceTerms(plan)) {
      const dice = Array.from({ length: term.count }, () => this.newDie(term));
      this.groups.push({ term, dice, explosionsCapped: false });
    }
  }

  /**
   * Takes the Face Value of every Die in the Tray, in Tray order (first throw,
   * then each added Die), once all have rested and none is Cocked.
   */
  settle(faceValues: readonly number[]): RollStep {
    if (faceValues.length !== this.trayCount)
      throw new Error(`expected ${this.trayCount} Face Values, got ${faceValues.length}`);

    const rethrow: number[] = [];
    const add: DieDefinition[] = [];
    for (const group of this.groups) {
      const { term } = group;
      const awaitingValue = group.dice.filter((die) => die.value === undefined);
      for (const die of awaitingValue) {
        const value = term.dieType.combine(die.trayIndices.map((i) => faceValues[i]));
        if (term.reroll && meets(term.reroll, value)) {
          die.rerolled.push(value);
          rethrow.push(...die.trayIndices);
          continue;
        }
        die.value = value;
        if (!term.explode || value !== term.dieType.maxValue) continue;
        if (this.explosions >= MAX_EXPLOSIONS || this.trayCount + term.dieType.dice.length > MAX_DICE) {
          group.explosionsCapped = true;
          continue;
        }
        this.explosions++;
        die.exploded = true;
        group.dice.splice(group.dice.indexOf(die) + 1, 0, this.newDie(term));
        add.push(...term.dieType.dice);
      }
    }

    if (rethrow.length > 0 || add.length > 0) return { kind: "throw", rethrow, add };
    return { kind: "done", result: this.result() };
  }

  private newDie(term: DiceTerm): TrackedDie {
    const perDie = term.dieType.dice.length;
    const trayIndices = Array.from({ length: perDie }, (_, i) => this.trayCount + i);
    this.trayCount += perDie;
    return { trayIndices, rerolled: [], exploded: false };
  }

  private result(): RollResult {
    const groups = [...this.groups];
    const droppedTrayIndices: number[] = [];
    const breakdown = this.plan.terms.map((term): BreakdownPart => {
      if (term.kind === "modifier") return term;
      const group = groups.shift()!;
      const values = group.dice.map((die) => die.value!);
      const dropped = droppedIndices(values, term.keepDrop);
      for (const i of dropped) droppedTrayIndices.push(...group.dice[i].trayIndices);
      return {
        kind: "dice",
        sign: term.sign,
        dieType: term.dieType.name,
        notation: formatDice(term),
        dice: group.dice.map(({ rerolled, exploded }, i) => ({ value: values[i], rerolled, exploded, dropped: dropped.has(i) })),
        explosionsCapped: group.explosionsCapped,
      };
    });
    const total = breakdown.reduce((running, part) => {
      if (part.kind === "modifier") return running + part.value;
      const kept = part.dice.reduce((groupTotal, die) => (die.dropped ? groupTotal : groupTotal + die.value), 0);
      return running + part.sign * kept;
    }, 0);
    return { total, breakdown, droppedTrayIndices };
  }
}

/**
 * Which of a group's values are Dropped. Among equal values, the earlier
 * Die counts as the higher one, so ties are settled the same way every time.
 */
function droppedIndices(values: number[], keepDrop: KeepDrop | undefined): Set<number> {
  if (!keepDrop) return new Set();
  const highestFirst = values.map((_, i) => i).sort((a, b) => values[b] - values[a] || a - b);
  // Explodes can add dice, so keeping N may drop more than the group started with.
  const dropCount = keepDrop.keep ? Math.max(0, values.length - keepDrop.count) : keepDrop.count;
  // Keeping the highest N drops the lowest rest, and vice versa.
  const dropHighest = keepDrop.keep ? !keepDrop.highest : keepDrop.highest;
  return new Set(dropHighest ? highestFirst.slice(0, dropCount) : highestFirst.slice(values.length - dropCount));
}

function diceTerms(plan: RollPlan): DiceTerm[] {
  return plan.terms.filter((t): t is DiceTerm => t.kind === "dice");
}

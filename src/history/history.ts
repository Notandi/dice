import { formatNotation, type RollPlan } from "../notation/diceNotation";
import type { BreakdownPart, RollResult } from "../roll/roll";

/** One past Roll in the History. */
export interface HistoryEntry {
  notation: string;
  breakdown: BreakdownPart[];
  total: number;
  /** The Roll as planned, to load back into the Hand. */
  plan: RollPlan;
}

/** The Rolls of this session, held in memory only. */
export class History {
  private readonly recorded: HistoryEntry[] = [];

  /** Newest first. */
  get entries(): readonly HistoryEntry[] {
    return this.recorded;
  }

  /** Records a finished Roll. */
  add(plan: RollPlan, result: RollResult): HistoryEntry {
    const entry = { notation: formatNotation(plan), breakdown: result.breakdown, total: result.total, plan };
    this.recorded.unshift(entry);
    return entry;
  }
}

import { ROLLED_DIE_TYPES } from "../dice/dieTypes";
import { addDie, EMPTY_PLAN, formatNotation, parseNotation, type RollPlan } from "../notation/diceNotation";
import { refusal } from "../roll/roll";

export interface HandElements {
  dieButtons: HTMLElement;
  notation: HTMLInputElement;
  clear: HTMLButtonElement;
  error: HTMLElement;
}

/**
 * The Die Type buttons and the Dice Notation field, kept in step both ways.
 * Clicking a button adds a Die and rewrites the notation; typing valid
 * notation replaces the Hand. Invalid notation, or a Roll over the dice
 * limit, shows why and leaves the Hand as it was, marked as not rollable.
 */
export class HandControls {
  private current: RollPlan = EMPTY_PLAN;
  private valid = true;

  constructor(
    private readonly el: HandElements,
    /** Called whenever the Hand or its validity changes. */
    private readonly onChange: () => void,
  ) {
    for (const dieType of ROLLED_DIE_TYPES) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = dieType.name;
      button.style.setProperty("--die-colour", dieType.dice[0].colour);
      button.style.setProperty("--die-ink", dieType.dice[0].inkColour);
      button.addEventListener("click", () => this.add(addDie(this.current, dieType)));
      el.dieButtons.append(button);
    }
    el.notation.addEventListener("input", () => this.typed());
    el.clear.addEventListener("click", () => this.replace(EMPTY_PLAN, true));
  }

  /** The Hand: the last valid plan. */
  get plan(): RollPlan {
    return this.current;
  }

  /** False while the notation field holds something that can't be rolled. */
  get rollable(): boolean {
    return this.valid;
  }

  private add(next: RollPlan): void {
    const refused = refusal(next);
    if (refused) this.showError(`${refused} The Hand wasn't changed.`);
    else this.replace(next, true);
  }

  private typed(): void {
    const parsed = parseNotation(this.el.notation.value);
    if (!parsed.ok) return this.invalid(parsed.error);
    const refused = refusal(parsed.plan);
    if (refused) return this.invalid(refused);
    this.replace(parsed.plan, false);
  }

  private replace(plan: RollPlan, rewrite: boolean): void {
    this.current = plan;
    this.valid = true;
    if (rewrite) this.el.notation.value = formatNotation(plan);
    this.el.notation.removeAttribute("aria-invalid");
    this.showError("");
    this.onChange();
  }

  private invalid(message: string): void {
    this.valid = false;
    this.el.notation.setAttribute("aria-invalid", "true");
    this.showError(message);
    this.onChange();
  }

  private showError(message: string): void {
    this.el.error.textContent = message;
  }
}

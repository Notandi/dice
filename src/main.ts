import { HandControls } from "./hand/handControls";
import { handLayout, type HandPose } from "./hand/handLayout";
import type { RollPlan } from "./notation/diceNotation";
import { Renderer } from "./render/renderer";
import { diceNeeded, diceToThrow, RollEngine, type BreakdownPart, type DieResult, type RollStep } from "./roll/roll";
import { autoRethrow, autoThrow } from "./tray/autoThrower";
import type { DieDefinition } from "./dice/types";
import { TIMESTEP, TraySimulation, type TrayDie } from "./tray/traySimulation";

const MAX_STEPS_PER_FRAME = 10; // don't spiral after a long pause (e.g. a background tab)
const NO_HAND: readonly HandPose[] = [];
const COCKED_HINT = "Cocked! Click a highlighted Die to re-throw it.";

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const canvas = $<HTMLCanvasElement>("#tray");
const rollButton = $<HTMLButtonElement>("#roll");
const totalEl = $("#total");
const breakdownEl = $("#breakdown");

const sim = await TraySimulation.create();
const renderer = new Renderer(canvas, sim.tray);

/** The Hand as drawn at the near edge; hidden while its Roll is being thrown. */
let drawnPlan: RollPlan | undefined;
let handPoses: readonly HandPose[] = NO_HAND;
let handShown = true;
/** The Roll in the Tray, until its rules are done. `dice` is in Tray order, as the engine counts them. */
let rolling: { engine: RollEngine; dice: TrayDie[] } | undefined;

const hand = new HandControls(
  { dieButtons: $("#die-buttons"), notation: $("#notation"), clear: $("#clear"), error: $("#notation-error") },
  () => {
    if (hand.plan !== drawnPlan) {
      drawnPlan = hand.plan;
      handPoses = handLayout(sim.tray, diceToThrow(hand.plan));
      handShown = true;
    }
    rollButton.disabled = !hand.rollable || diceNeeded(hand.plan) === 0;
  },
);

rollButton.addEventListener("click", () => {
  const plan = hand.plan;
  const dice = diceToThrow(plan);
  sim.clear();
  const throws = autoThrow(sim.tray, dice);
  rolling = { engine: new RollEngine(plan), dice: dice.map((die, i) => sim.throwDie(die, throws[i])) };
  handShown = false;
  totalEl.textContent = "…";
  totalEl.classList.add("pending");
  breakdownEl.textContent = "";
});

// Clicking a Cocked Die re-throws just that Die; the others stay where they are.
canvas.addEventListener("click", (event) => {
  const die = renderer.dieAt(event.clientX, event.clientY);
  if (!rolling || !die?.cocked) return;
  rethrow(die);
});
canvas.addEventListener("pointermove", (event) => {
  canvas.style.cursor = renderer.dieAt(event.clientX, event.clientY)?.cocked ? "pointer" : "";
});

/** Throws one Die again from a clear spot, leaving the others where they are. */
function rethrow(die: TrayDie): void {
  const others = sim.trayDice.filter((other) => other !== die);
  sim.rethrowDie(die, autoRethrow(sim.tray, die.definition, others));
}

/** Throws a new Die into the Tray, from a clear spot, while the others stay put. */
function throwExtra(definition: DieDefinition): TrayDie {
  return sim.throwDie(definition, autoRethrow(sim.tray, definition, sim.trayDice));
}

/**
 * Carries out the engine's next step: Re-rolled dice are thrown again,
 * Explodes add new ones. Every other Die has already counted, so it is held
 * in place and the face it shows stays the face in the Breakdown.
 */
function throwFollowUps(dice: TrayDie[], step: Extract<RollStep, { kind: "throw" }>): void {
  sim.holdAllInPlace();
  for (const i of step.rethrow) rethrow(dice[i]);
  for (const definition of step.add) dice.push(throwExtra(definition));
}

/**
 * e.g. `1d20r1 (~~1~~ 14) + 2d6! (6!, 2, 5) − 1`: Re-rolled values struck
 * through before the one that counts, and `!` on each Die that Exploded.
 */
function renderBreakdown(parts: BreakdownPart[]): void {
  breakdownEl.replaceChildren();
  parts.forEach((part, i) => {
    const negative = part.kind === "dice" ? part.sign < 0 : part.value < 0;
    breakdownEl.append(negative ? (i > 0 ? " − " : "−") : i > 0 ? " + " : "");
    if (part.kind === "modifier") return breakdownEl.append(String(Math.abs(part.value)));
    breakdownEl.append(`${part.notation} (`);
    part.dice.forEach((die, j) => {
      if (j > 0) breakdownEl.append(", ");
      breakdownEl.append(...dieNodes(die));
    });
    breakdownEl.append(")");
    if (part.explosionsCapped) breakdownEl.append(" [no more Explodes: limit reached]");
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

let last = performance.now();
let accumulator = 0;

function frame(now: number) {
  accumulator += (now - last) / 1000;
  last = now;

  let steps = 0;
  while (accumulator >= TIMESTEP && steps < MAX_STEPS_PER_FRAME) {
    sim.step();
    accumulator -= TIMESTEP;
    steps++;
  }
  if (steps === MAX_STEPS_PER_FRAME) accumulator = 0;

  if (rolling && sim.allAtRest) {
    const faceValues = rolling.dice.map((die) => die.faceValue);
    if (faceValues.every((value) => value !== undefined)) {
      // Re-rolls and Explodes only happen once no Die is Cocked, so they use correct Face Values.
      const step = rolling.engine.settle(faceValues);
      if (step.kind === "throw") throwFollowUps(rolling.dice, step);
      else {
        rolling = undefined;
        totalEl.textContent = String(step.result.total);
        totalEl.classList.remove("pending");
        renderBreakdown(step.result.breakdown);
        handShown = true; // ready to throw again
      }
    } else {
      // The Total stays pending until every Cocked Die is re-thrown.
      breakdownEl.textContent = COCKED_HINT;
    }
  } else if (breakdownEl.textContent === COCKED_HINT) {
    breakdownEl.textContent = "";
  }

  renderer.render(sim.trayDice, handShown ? handPoses : NO_HAND);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

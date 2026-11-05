import { HandControls } from "./hand/handControls";
import { handLayout, type HandPose } from "./hand/handLayout";
import type { RollPlan } from "./notation/diceNotation";
import { Renderer } from "./render/renderer";
import { diceNeeded, diceToThrow, rollResult, type BreakdownPart } from "./roll/roll";
import { autoThrow } from "./tray/autoThrower";
import { TIMESTEP, TraySimulation, type TrayDie } from "./tray/traySimulation";

const MAX_STEPS_PER_FRAME = 10; // don't spiral after a long pause (e.g. a background tab)
const NO_HAND: readonly HandPose[] = [];

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const canvas = $<HTMLCanvasElement>("#tray");
const rollButton = $<HTMLButtonElement>("#roll");
const totalEl = $("#total");
const breakdownEl = $("#breakdown");

const sim = await TraySimulation.create();
const renderer = new Renderer(canvas, sim.tray);

/** The Hand as drawn at the near edge; hidden once thrown, until it changes again. */
let drawnPlan: RollPlan | undefined;
let handPoses: readonly HandPose[] = NO_HAND;
let handShown = true;
/** The Roll in the Tray, until every Die has rested. */
let rolling: { plan: RollPlan; dice: TrayDie[] } | undefined;

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
  if (rollButton.disabled) return;
  const plan = hand.plan;
  const dice = diceToThrow(plan);
  sim.clear();
  const throws = autoThrow(sim.tray, dice);
  rolling = { plan, dice: dice.map((die, i) => sim.throwDie(die, throws[i])) };
  handShown = false;
  totalEl.textContent = "…";
  totalEl.classList.add("pending");
  breakdownEl.textContent = "";
});

/** e.g. `1d20 (14) + 2d6 (3, 5) − 1` */
function formatBreakdown(parts: BreakdownPart[]): string {
  return parts
    .map((part, i) => {
      const negative = part.kind === "dice" ? part.sign < 0 : part.value < 0;
      const sign = negative ? (i > 0 ? " − " : "−") : i > 0 ? " + " : "";
      const body = part.kind === "dice" ? `${part.notation} (${part.values.join(", ")})` : String(Math.abs(part.value));
      return sign + body;
    })
    .join("");
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
    const result = rollResult(rolling.plan, rolling.dice.map((die) => die.faceValue));
    rolling = undefined;
    totalEl.textContent = String(result.total);
    totalEl.classList.remove("pending");
    breakdownEl.textContent = formatBreakdown(result.breakdown);
  }

  renderer.render(sim.trayDice, handShown ? handPoses : NO_HAND);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

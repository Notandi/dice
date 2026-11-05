import type { DieDefinition, Vec3 } from "./dice/types";
import { HandControls } from "./hand/handControls";
import { handContains, handLayout, type HandPose } from "./hand/handLayout";
import type { RollPlan } from "./notation/diceNotation";
import { Renderer } from "./render/renderer";
import { diceNeeded, diceToThrow, rollResult, type BreakdownPart } from "./roll/roll";
import { autoRethrow, autoThrow } from "./tray/autoThrower";
import { flingRethrow, flingThrow, releaseVelocity, type GestureSample } from "./tray/flingThrower";
import { TIMESTEP, TraySimulation, type Throw, type TrayDie } from "./tray/traySimulation";

const MAX_STEPS_PER_FRAME = 10; // don't spiral after a long pause (e.g. a background tab)
const NO_HAND: readonly HandPose[] = [];
const COCKED_HINT = "Cocked! Click or fling a highlighted Die to re-throw it.";
/** A press that moves less than this many pixels is a click, not a fling. */
const CLICK_SLOP = 6;
/** Gesture samples older than this (ms) can't affect the fling, so they are dropped. */
const SAMPLE_KEEP = 250;
/**
 * Height above the floor that a press is taken at: about the middle of a Die,
 * so pressing on a Die's top picks up that Die and not the floor behind it.
 */
const GRAB_HEIGHT = 0.7;
const NO_OFFSET: Vec3 = { x: 0, y: 0, z: 0 };

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

/** True when the Hand is waiting at the near edge and can be thrown. */
const handThrowable = () => handShown && !rolling && !rollButton.disabled;

/** Starts a Roll of the Hand: clears the Tray and throws its dice with the given throws. */
function throwHand(throwsFor: (dice: DieDefinition[]) => Throw[] | undefined): void {
  const plan = hand.plan;
  const dice = diceToThrow(plan);
  const throws = throwsFor(dice);
  if (!throws) return;
  sim.clear();
  rolling = { plan, dice: dice.map((die, i) => sim.throwDie(die, throws[i])) };
  handShown = false;
  totalEl.textContent = "…";
  totalEl.classList.add("pending");
  breakdownEl.textContent = "";
}

rollButton.addEventListener("click", () => throwHand((dice) => autoThrow(sim.tray, dice)));

/**
 * A drag in progress: of the whole Hand, or of a Cocked Die. Releasing it
 * flings what was grabbed; a Cocked Die that is only clicked is re-thrown
 * automatically. The others stay where they are.
 */
let gesture:
  | { grabbed: TrayDie | "hand"; pointerId: number; startX: number; startY: number; samples: GestureSample[] }
  | undefined;
/** How far the Hand has been dragged from the near edge. */
let handOffset = NO_OFFSET;

canvas.addEventListener("pointerdown", (event) => {
  if (gesture || event.button !== 0) return;
  const point = grabPointAt(event);
  const die = renderer.dieAt(event.clientX, event.clientY);
  let grabbed: TrayDie | "hand";
  if (rolling && die?.cocked) grabbed = die;
  else if (overHand(point)) grabbed = "hand";
  else return;
  canvas.setPointerCapture(event.pointerId);
  gesture = {
    grabbed,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    samples: point ? [{ point, time: event.timeStamp }] : [],
  };
  canvas.style.cursor = "grabbing";
});

canvas.addEventListener("pointermove", (event) => {
  if (!gesture) {
    canvas.style.cursor = cursorAt(event.clientX, event.clientY);
    return;
  }
  if (event.pointerId !== gesture.pointerId) return;
  const coalesced = event.getCoalescedEvents?.() ?? [];
  for (const moved of coalesced.length > 0 ? coalesced : [event]) sample(moved);
  const [first] = gesture.samples;
  const last = gesture.samples[gesture.samples.length - 1];
  if (gesture.grabbed === "hand" && first && last) {
    // Follow the pointer, but keep the Hand's middle inside the Tray.
    const centre = handCentre();
    const { width, depth } = sim.tray;
    handOffset = {
      x: clamp(centre.x + last.point.x - first.point.x, -width / 2, width / 2) - centre.x,
      y: 0,
      z: clamp(centre.z + last.point.z - first.point.z, -depth / 2, depth / 2) - centre.z,
    };
  }
});

canvas.addEventListener("pointerup", (event) => {
  if (!gesture || event.pointerId !== gesture.pointerId) return;
  sample(event);
  const { grabbed, samples, startX, startY } = gesture;
  // The Hand is thrown from where it was dragged to, before the drag is undone.
  const centre = handCentre();
  const from = { x: centre.x + handOffset.x, y: 0, z: centre.z + handOffset.z };
  endGesture(event);
  const clicked = Math.hypot(event.clientX - startX, event.clientY - startY) < CLICK_SLOP;
  const velocity = samples.length > 0 ? releaseVelocity(samples) : NO_OFFSET;

  if (grabbed === "hand") {
    if (!clicked && handThrowable()) throwHand((dice) => flingThrow(sim.tray, dice, { from, velocity }));
  } else if (rolling && grabbed.cocked) {
    // A click, or a drag let go without a fling, re-throws it automatically.
    const others = sim.trayDice.filter((other) => other !== grabbed);
    const dieThrow =
      (!clicked && flingRethrow(sim.tray, grabbed, { from: grabbed.position, velocity })) ||
      autoRethrow(sim.tray, grabbed.definition, others);
    sim.rethrowDie(grabbed, dieThrow);
  }
});

// Losing the pointer without a pointerup (cancelled touch, capture taken away) drops the drag.
for (const type of ["pointercancel", "lostpointercapture"] as const) {
  canvas.addEventListener(type, (event) => {
    if (gesture && event.pointerId === gesture.pointerId) endGesture(event);
  });
}

/** Adds where the pointer is over the floor to the gesture, forgetting samples too old to matter. */
function sample(event: PointerEvent): void {
  if (!gesture) return;
  const point = grabPointAt(event);
  if (!point) return;
  gesture.samples.push({ point, time: event.timeStamp });
  // Keep the first sample: the Hand follows the pointer from where it was grabbed.
  while (gesture.samples.length > 2 && gesture.samples[1].time < event.timeStamp - SAMPLE_KEEP) {
    gesture.samples.splice(1, 1);
  }
}

function endGesture(event: PointerEvent): void {
  gesture = undefined;
  handOffset = NO_OFFSET;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  canvas.style.cursor = cursorAt(event.clientX, event.clientY);
}

function cursorAt(clientX: number, clientY: number): string {
  if (rolling && renderer.dieAt(clientX, clientY)?.cocked) return "grab";
  return overHand(grabPointAt({ clientX, clientY })) ? "grab" : "";
}

/** Where a press is over the Tray, at {@link GRAB_HEIGHT}. */
function grabPointAt({ clientX, clientY }: { clientX: number; clientY: number }): Vec3 | undefined {
  return renderer.floorPointAt(clientX, clientY, GRAB_HEIGHT);
}

/** Whether a press there would pick up the Hand. */
function overHand(point: Vec3 | undefined): boolean {
  return handThrowable() && point !== undefined && handContains(handPoses, point);
}

/** The middle of the Hand as drawn at the near edge. */
function handCentre(): Vec3 {
  const n = Math.max(1, handPoses.length);
  const sum = (axis: "x" | "z") => handPoses.reduce((total, pose) => total + pose.position[axis], 0) / n;
  return { x: sum("x"), y: 0, z: sum("z") };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

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
    const faceValues = rolling.dice.map((die) => die.faceValue);
    if (faceValues.every((value) => value !== undefined)) {
      const result = rollResult(rolling.plan, faceValues);
      rolling = undefined;
      totalEl.textContent = String(result.total);
      totalEl.classList.remove("pending");
      breakdownEl.textContent = formatBreakdown(result.breakdown);
      handShown = true; // ready to throw again
    } else {
      // The Total stays pending until every Cocked Die is re-thrown.
      breakdownEl.textContent = COCKED_HINT;
    }
  } else if (breakdownEl.textContent === COCKED_HINT) {
    breakdownEl.textContent = "";
  }

  renderer.render(sim.trayDice, handShown ? handPoses : NO_HAND, handOffset);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

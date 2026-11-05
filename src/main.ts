import { DIE_TYPES } from "./dice/dieTypes";
import { Renderer } from "./render/renderer";
import { autoThrow } from "./tray/autoThrower";
import { TIMESTEP, TraySimulation } from "./tray/traySimulation";

const MAX_STEPS_PER_FRAME = 10; // don't spiral after a long pause (e.g. a background tab)

const canvas = document.querySelector<HTMLCanvasElement>("#tray")!;
const rollButton = document.querySelector<HTMLButtonElement>("#roll")!;
const totalEl = document.querySelector<HTMLDivElement>("#total")!;
const dieTypePicker = document.querySelector<HTMLSelectElement>("#die-type")!;

// Temporary picker for the single Die Type Roll throws; the Hand (#5) replaces it.
for (const dieType of DIE_TYPES) dieTypePicker.add(new Option(dieType.name, dieType.name, false, dieType.name === "d6"));
const pickedDieType = () => DIE_TYPES.find((d) => d.name === dieTypePicker.value) ?? DIE_TYPES[0];

const sim = await TraySimulation.create();
const renderer = new Renderer(canvas, sim.tray);
let rolling = false;

rollButton.addEventListener("click", () => {
  sim.clear();
  const dieType = pickedDieType();
  sim.throwDie(dieType, autoThrow(sim.tray, dieType));
  rolling = true;
  totalEl.textContent = "…";
  totalEl.classList.add("pending");
});

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
    rolling = false;
    const total = sim.trayDice.reduce((total, die) => total + die.faceValue, 0);
    totalEl.textContent = String(total);
    totalEl.classList.remove("pending");
  }

  renderer.render(sim.trayDice);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

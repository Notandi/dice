import { d6 } from "./dice/d6";
import { Renderer } from "./render/renderer";
import { autoThrow } from "./tray/autoThrower";
import { TIMESTEP, TraySimulation } from "./tray/traySimulation";

const MAX_STEPS_PER_FRAME = 10; // don't spiral after a long pause (e.g. a background tab)

const canvas = document.querySelector<HTMLCanvasElement>("#tray")!;
const rollButton = document.querySelector<HTMLButtonElement>("#roll")!;
const totalEl = document.querySelector<HTMLDivElement>("#total")!;

const sim = await TraySimulation.create();
const renderer = new Renderer(canvas, sim.tray);
let rolling = false;

rollButton.addEventListener("click", () => {
  sim.clear();
  sim.throwDie(d6, autoThrow(sim.tray, d6));
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

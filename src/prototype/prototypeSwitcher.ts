/**
 * PROTOTYPE: throwaway. The "Throw style" card at the top of the page: pick
 * how to throw, read how it works, and open the tuning sliders. Shown on the
 * live site too, so anyone can try every style (#7).
 *
 * Switching reloads the page, because a style can change how the Tray is
 * built; the Dice Notation is carried over so the Hand isn't lost.
 */
export interface ThrowStyle {
  key: string;
  name: string;
  how: string;
}

const NOTATION_KEY = "prototype-throw-style-notation";

const CSS = `
.ts-card {
  position: fixed; top: 24px; left: 50%; transform: translateX(-50%); z-index: 30;
  width: min(420px, calc(100vw - 24px)); box-sizing: border-box;
  display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center;
  grid-template-areas: "head head" "options gear" "how how" "drawer drawer";
  gap: 10px 6px; color: #f3f1ec; font: 14px/1.35 "Inter", system-ui, sans-serif;
  transition: opacity 0.15s;
}
.ts-card.ts-leaving { opacity: 0.5; }
.ts-head { grid-area: head; display: flex; align-items: center; justify-content: center; gap: 10px; }
.ts-title { font-size: 12px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: #a9b0bf; }
.ts-badge { padding: 3px 8px; border-radius: 999px; font-size: 12px; font-weight: 600;
  background: rgba(232, 176, 74, 0.16); color: #f0c36e; }
.ts-gear { all: unset; grid-area: gear; cursor: pointer; width: 44px; height: 44px; display: grid; place-items: center;
  border-radius: 50%; color: #c9ced9; transition: background 0.15s, color 0.15s; }
.ts-gear:hover { color: #f3f1ec; background: rgba(255, 255, 255, 0.06); }
.ts-gear[aria-expanded="true"] { color: #e8b04a; background: rgba(232, 176, 74, 0.12); }
.ts-gear:focus-visible, .ts-option:focus-visible, .ts-copy:focus-visible { outline: 2px solid #e8b04a; outline-offset: 2px; }
.ts-options { grid-area: options; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 2px; padding: 4px;
  border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 999px; background: rgba(255, 255, 255, 0.05); }
.ts-option { all: unset; cursor: pointer; text-align: center; height: 40px; line-height: 40px; border-radius: 999px;
  font-size: 15px; font-weight: 600; color: #c9ced9; transition: background 0.2s, color 0.2s; }
.ts-option:hover { color: #f3f1ec; background: rgba(255, 255, 255, 0.06); }
.ts-option[aria-checked="true"] { background: #f3f1ec; color: #161a23; }
.ts-how { grid-area: how; margin: 0; min-height: 1.35em; color: #a9b0bf; text-align: center; }
.ts-drawer { grid-area: drawer; padding: 12px 14px 4px; border-radius: 18px;
  background: rgba(22, 26, 35, 0.86); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
  border: 1px solid rgba(255, 255, 255, 0.1); box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
  max-height: min(36vh, 420px); overflow: auto; overscroll-behavior: contain; }
.ts-drawer[hidden] { display: none; }
.ts-slider { display: block; margin: 0 0 10px; font-size: 13px; }
.ts-slider-head { display: flex; justify-content: space-between; color: #c9ced9; }
.ts-slider-value { font-variant-numeric: tabular-nums; color: #e8b04a; }
.ts-slider input { width: 100%; margin: 4px 0 0; accent-color: #e8b04a; }
.ts-foot { display: flex; align-items: flex-start; gap: 10px; margin-top: 4px; }
.ts-copy { all: unset; cursor: pointer; flex: none; padding: 6px 14px; border-radius: 999px; font-weight: 600;
  font-size: 13px; background: rgba(232, 176, 74, 0.16); color: #f0c36e; }
.ts-copy:hover { background: rgba(232, 176, 74, 0.26); }
.ts-stats { margin: 0; font: 12px/1.4 ui-monospace, monospace; color: #a9b0bf; white-space: pre-wrap; }
@media (max-width: 640px) {
  .ts-card { top: 16px; gap: 8px 0; grid-template-areas: "head gear" "options options" "how how" "drawer drawer"; }
  .ts-head { justify-content: flex-start; padding-left: 8px; }
  .ts-title { font-size: 11px; }
  .ts-badge { display: none; }
  .ts-option { font-size: 14px; }
  .ts-how { font-size: 13px; }
}
`;

/** Mounts the card. Returns the tuning drawer to fill, and where to show the last throw's numbers. */
export function mountSwitcher(styles: readonly ThrowStyle[], current: string) {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.append(style);

  const index = Math.max(0, styles.findIndex((s) => s.key === current));
  const card = document.createElement("section");
  card.className = "ts-card";
  card.setAttribute("aria-label", "Throw style");
  card.innerHTML = `
    <div class="ts-head">
      <span class="ts-title">Throw style</span><span class="ts-badge">Try them out</span>
    </div>
    <div class="ts-options" role="radiogroup" aria-label="Throw style"></div>
    <button class="ts-gear" type="button" aria-label="Tune this throw style" aria-expanded="false">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
        stroke-linecap="round" aria-hidden="true"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/>
        <circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></svg>
    </button>
    <p class="ts-how"></p>
    <div class="ts-drawer" hidden></div>`;
  const options = card.querySelector<HTMLElement>(".ts-options")!;
  const gear = card.querySelector<HTMLButtonElement>(".ts-gear")!;
  const drawer = card.querySelector<HTMLElement>(".ts-drawer")!;
  card.querySelector(".ts-how")!.textContent = styles[index].how;

  const go = (next: number) => {
    const target = styles[(next + styles.length) % styles.length];
    if (target.key === styles[index].key) return;
    try {
      sessionStorage.setItem(NOTATION_KEY, document.querySelector<HTMLInputElement>("#notation")?.value ?? "");
    } catch {
      // No storage: the Hand just starts empty after switching.
    }
    card.classList.add("ts-leaving");
    const url = new URL(location.href);
    url.searchParams.set("variant", target.key);
    location.replace(url);
  };

  styles.forEach((s, i) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "ts-option";
    option.textContent = s.name;
    option.setAttribute("role", "radio");
    option.setAttribute("aria-checked", String(i === index));
    option.title = s.how;
    option.addEventListener("click", () => go(i));
    options.append(option);
  });

  gear.addEventListener("click", () => {
    drawer.hidden = !drawer.hidden;
    gear.setAttribute("aria-expanded", String(!drawer.hidden));
  });

  addEventListener("keydown", (event) => {
    if ((event.target as HTMLElement).closest("input, textarea, [contenteditable]")) return;
    if (event.key === "ArrowLeft") go(index - 1);
    if (event.key === "ArrowRight") go(index + 1);
  });

  document.body.append(card);
  restoreNotation();

  const stats = document.createElement("pre");
  stats.className = "ts-stats";
  return {
    drawer,
    stats,
    showStats(text: string) {
      stats.textContent = text;
    },
  };
}

/** Puts back the Dice Notation from before the switch, so the Hand is the same. */
function restoreNotation(): void {
  let saved: string | null = null;
  try {
    saved = sessionStorage.getItem(NOTATION_KEY);
    sessionStorage.removeItem(NOTATION_KEY);
  } catch {
    return;
  }
  const input = document.querySelector<HTMLInputElement>("#notation");
  if (!saved || !input) return;
  input.value = saved;
  input.dispatchEvent(new Event("input"));
}

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
  position: fixed; top: 12px; left: 50%; transform: translateX(-50%); z-index: 30;
  width: min(440px, calc(100vw - 32px)); box-sizing: border-box;
  padding: 10px; border-radius: 18px;
  background: rgba(17, 21, 26, 0.72); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
  border: 1px solid rgba(244, 239, 227, 0.1); box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
  color: #f4efe3; font: 14px/1.35 system-ui, sans-serif;
  transition: opacity 0.15s;
}
.ts-card.ts-leaving { opacity: 0.5; }
.ts-head { display: flex; align-items: center; justify-content: space-between; padding: 0 4px 8px; }
.ts-title { font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.6; }
.ts-badge { margin-left: 8px; padding: 1px 6px; border-radius: 999px; font-size: 10px; letter-spacing: 0.06em;
  background: rgba(232, 176, 74, 0.16); color: #e8b04a; }
.ts-gear { all: unset; cursor: pointer; width: 28px; height: 28px; display: grid; place-items: center;
  border-radius: 50%; opacity: 0.7; transition: opacity 0.15s, background 0.15s, color 0.15s; }
.ts-gear:hover { opacity: 1; background: rgba(244, 239, 227, 0.08); }
.ts-gear[aria-expanded="true"] { opacity: 1; color: #e8b04a; background: rgba(232, 176, 74, 0.12); }
.ts-gear:focus-visible, .ts-option:focus-visible, .ts-copy:focus-visible { outline: 2px solid #e8b04a; outline-offset: 2px; }
.ts-options { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; padding: 4px;
  border-radius: 999px; background: rgba(244, 239, 227, 0.06); }
.ts-option { all: unset; cursor: pointer; text-align: center; padding: 8px 0; border-radius: 999px;
  font-weight: 600; color: rgba(244, 239, 227, 0.75); transition: background 0.2s, color 0.2s; }
.ts-option:hover { color: #f4efe3; background: rgba(244, 239, 227, 0.06); }
.ts-option[aria-checked="true"] { background: #e8b04a; color: #20262e; box-shadow: 0 2px 8px rgba(232, 176, 74, 0.35); }
.ts-how { margin: 8px 4px 0; min-height: 1.35em; opacity: 0.8; text-align: center; }
.ts-drawer { margin-top: 10px; padding: 10px 4px 2px; border-top: 1px solid rgba(244, 239, 227, 0.1);
  max-height: min(36vh, 420px); overflow: auto; overscroll-behavior: contain; }
.ts-drawer[hidden] { display: none; }
.ts-slider { display: block; margin: 0 0 10px; font-size: 13px; }
.ts-slider-head { display: flex; justify-content: space-between; opacity: 0.85; }
.ts-slider-value { font-variant-numeric: tabular-nums; color: #e8b04a; }
.ts-slider input { width: 100%; margin: 4px 0 0; accent-color: #e8b04a; }
.ts-foot { display: flex; align-items: flex-start; gap: 10px; margin-top: 4px; }
.ts-copy { all: unset; cursor: pointer; flex: none; padding: 6px 14px; border-radius: 999px; font-weight: 600;
  font-size: 13px; background: rgba(232, 176, 74, 0.16); color: #e8b04a; }
.ts-copy:hover { background: rgba(232, 176, 74, 0.26); }
.ts-stats { margin: 0; font: 12px/1.4 ui-monospace, monospace; opacity: 0.7; white-space: pre-wrap; }
.ts-empty { margin: 0 0 8px; opacity: 0.7; font-size: 13px; }
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
      <span><span class="ts-title">Throw style</span><span class="ts-badge">Try them out</span></span>
      <button class="ts-gear" type="button" aria-label="Tune this throw style" aria-expanded="false">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/>
          <circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>
      </button>
    </div>
    <div class="ts-options" role="radiogroup" aria-label="Throw style"></div>
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

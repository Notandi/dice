import { renderBreakdown } from "../roll/breakdownView";
import type { HistoryEntry } from "./history";

/**
 * Shows the History as a list, newest first. Each entry is a button that
 * hands its entry to `onPick`, e.g. to load it into the Hand.
 */
export function renderHistory(
  list: HTMLElement,
  entries: readonly HistoryEntry[],
  onPick: (entry: HistoryEntry) => void,
): void {
  list.replaceChildren(
    ...entries.map((entry) => {
      const button = document.createElement("button");
      button.type = "button";
      button.title = `Load ${entry.notation} into the Hand`;
      const notation = document.createElement("span");
      notation.className = "history-notation";
      notation.textContent = entry.notation;
      const total = document.createElement("span");
      total.className = "history-total";
      total.textContent = String(entry.total);
      const breakdown = document.createElement("span");
      breakdown.className = "history-breakdown";
      renderBreakdown(breakdown, entry.breakdown);
      button.append(notation, total, breakdown);
      button.addEventListener("click", () => onPick(entry));
      const item = document.createElement("li");
      item.append(button);
      return item;
    }),
  );
}

/**
 * The History button on phones, where the History is hidden until opened.
 * It closes again on Escape, a press outside it, or by calling `close`, e.g.
 * once an entry is picked.
 */
export function historyToggle(button: HTMLButtonElement, panel: HTMLElement): { close: () => void } {
  const setOpen = (open: boolean) => {
    panel.classList.toggle("open", open);
    button.setAttribute("aria-expanded", String(open));
  };
  const close = () => setOpen(false);
  button.addEventListener("click", () => setOpen(!panel.classList.contains("open")));
  addEventListener("keydown", (event) => {
    if (event.key === "Escape" && panel.classList.contains("open")) {
      close();
      button.focus();
    }
  });
  addEventListener("pointerdown", (event) => {
    const target = event.target as Node;
    if (!panel.contains(target) && !button.contains(target)) close();
  });
  return { close };
}

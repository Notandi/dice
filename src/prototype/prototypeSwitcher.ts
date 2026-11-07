/**
 * PROTOTYPE: throwaway. A floating bar to flip between `?variant=` options.
 * Only mounted in dev builds. Switching reloads the page, because a variant
 * can change how the Tray is built.
 */
export function mountSwitcher(variants: { key: string; name: string }[], current: string): void {
  const index = Math.max(0, variants.findIndex((v) => v.key === current));
  const go = (step: number) => {
    const next = variants[(index + step + variants.length) % variants.length];
    const url = new URL(location.href);
    url.searchParams.set("variant", next.key);
    location.replace(url);
  };

  const bar = document.createElement("div");
  bar.style.cssText =
    "position:fixed;left:50%;top:12px;transform:translateX(-50%);display:flex;align-items:center;gap:6px;" +
    "padding:6px;background:#f4efe3;color:#11151a;border-radius:999px;box-shadow:0 4px 18px #0008;z-index:30;" +
    "font:600 14px system-ui;white-space:nowrap";
  const button = (text: string, step: number) => {
    const b = document.createElement("button");
    b.textContent = text;
    b.style.cssText = "width:32px;height:32px;border-radius:50%;background:#11151a;color:#f4efe3;font-size:16px";
    b.addEventListener("click", () => go(step));
    return b;
  };
  const label = document.createElement("span");
  label.style.padding = "0 8px";
  label.textContent = `${variants[index].key} (${variants[index].name})`;
  bar.append(button("←", -1), label, button("→", 1));
  document.body.append(bar);

  addEventListener("keydown", (event) => {
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, [contenteditable]")) return;
    if (event.key === "ArrowLeft") go(-1);
    if (event.key === "ArrowRight") go(1);
  });
}

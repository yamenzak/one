/**
 * Theme (light/dark) — system preference on first load, with a manual override
 * remembered per-device.
 *
 * ⚠️ The choice stamps `data-theme` on <html>, NOT a `.dark` class.
 *
 * `@4dl/ui`'s tokens are DARK-FIRST: `:root` is the dark palette and the light
 * one lives under `:root[data-theme="light"]`. Toggling a class therefore did
 * nothing at all to a shared component — it kept resolving `--card`,
 * `--muted-foreground` and the rest against dark while Scena's own screens
 * flipped. Both halves compiled and rendered; only the colours disagreed.
 *
 * Dark is the default because that is what `:root` holds: a first paint before
 * any script runs is dark, which is the app's own surface language rather than
 * a flash of the wrong one.
 */
import { useEffect, useState, useCallback } from "react";

const KEY = "scena.theme"; // "light" | "dark" | absent = follow system
type Choice = "light" | "dark" | "system";

function systemDark(): boolean {
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolved(choice: Choice): boolean {
  return choice === "dark" || (choice === "system" && systemDark());
}

function apply(choice: Choice): void {
  // Set, never toggle: the attribute has two meaningful values and the absence
  // of one is "dark", which is what `:root` already is.
  const el = document.documentElement;
  if (resolved(choice)) el.removeAttribute("data-theme");
  else el.setAttribute("data-theme", "light");
}

/** Read the stored choice (called once at boot in main.tsx too). */
export function storedChoice(): Choice {
  const v = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
  return v === "light" || v === "dark" ? v : "system";
}

/** Apply the theme as early as possible to avoid a flash of the wrong theme. */
export function initTheme(): void {
  apply(storedChoice());
}

/** Hook: current resolved dark state + a toggle that persists the override. */
export function useTheme() {
  const [choice, setChoice] = useState<Choice>(storedChoice);

  // Follow the OS when in "system" mode.
  useEffect(() => {
    if (choice !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [choice]);

  const isDark = resolved(choice);

  const toggle = useCallback(() => {
    const next: Choice = resolved(choice) ? "light" : "dark";
    localStorage.setItem(KEY, next);
    apply(next);
    setChoice(next);
  }, [choice]);

  return { isDark, toggle };
}

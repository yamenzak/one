/**
 * Theme (light/dark) — system preference on first load, with a manual override
 * remembered per-device. The choice stamps `.dark` on <html> so the CSS-var
 * theme (index.css) flips instantly. Kept tiny and dependency-free.
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
  document.documentElement.classList.toggle("dark", resolved(choice));
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

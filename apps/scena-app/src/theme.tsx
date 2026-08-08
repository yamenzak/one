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

/**
 * Where a person's light/dark choice lives. "light" | "dark" | absent = follow
 * the system.
 *
 * Exported because `brand-theme.ts` hands it to `@4dl/ui`'s `configureTheme` —
 * Scena does not use the platform's two-state mode helpers (this module has a
 * third state, "system", which is genuinely richer), but the design system must
 * not be left holding a DIFFERENT key: two keys for one preference is how a
 * future `applyMode` call silently resets everyone's choice.
 *
 * It is load-bearing beyond that: this is the one thing a preference survives a
 * sign-out in, so renaming it after launch resets every device.
 */
export const THEME_STORAGE_KEY = "scena.theme";
const KEY = THEME_STORAGE_KEY;
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

/**
 * FORCE THE DARK PALETTE FOR AS LONG AS THIS SCREEN IS MOUNTED.
 *
 * The customer-facing surfaces — the take-a-ticket kiosk, the board control
 * tablet — are dark by design: they hang in a lobby, they are looked at from
 * across a room, and they are not somebody's dashboard to have opinions about.
 * Both said so with `className="dark"`, which stopped meaning anything the
 * moment Stage 7a moved the palette from a `.dark` CLASS to a `data-theme`
 * ATTRIBUTE on `<html>`. Nothing broke loudly: the class is inert, the pages
 * render, and they quietly inherit whatever theme that tablet's browser (or an
 * operator who once opened the dashboard on it — same origin, same
 * localStorage) last chose.
 *
 * Dark is the ABSENCE of the attribute, because `:root` already holds the dark
 * palette. So this removes it, and puts back exactly what it found on unmount —
 * these pages are usually the whole session on their device, but the operator
 * console is one route away and must not be left recoloured.
 */
export function useForcedDark(): void {
  useEffect(() => {
    const el = document.documentElement;
    const previous = el.getAttribute("data-theme");
    el.removeAttribute("data-theme");
    return () => { if (previous !== null) el.setAttribute("data-theme", previous); };
  }, []);
}

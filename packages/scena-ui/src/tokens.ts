/**
 * Design tokens (BLUEPRINT design ref; §29.2 "lift them into the design-token
 * layer"). OKLCH throughout; brand ≈ oklch(0.58 0.17 300) violet. Type is
 * Hanken Grotesk (UI) + JetBrains Mono (numeric/mono). These values are lifted
 * verbatim from the Claude Design prototype so the app matches the spec.
 */

export const color = {
  brand: "oklch(0.58 0.17 300)",
  brandStrong: "oklch(0.46 0.16 285)",
  brandInk: "oklch(0.45 0.16 300)",
  brandTint: "oklch(0.58 0.17 300 / 0.07)",
  brandTintBorder: "oklch(0.58 0.17 300 / 0.18)",

  bg: "oklch(0.98 0.004 300)",
  surface: "#ffffff",
  border: "oklch(0.93 0.005 300)",
  borderSoft: "oklch(0.95 0.004 300)",
  hover: "oklch(0.96 0.004 300)",
  inputBg: "oklch(0.97 0.004 300)",

  text: "oklch(0.24 0.015 300)",
  textMuted: "oklch(0.55 0.01 300)",
  textFaint: "oklch(0.68 0.01 300)",

  online: "oklch(0.68 0.16 155)",
  onlineInk: "oklch(0.5 0.13 155)",
  warning: "oklch(0.75 0.15 75)",
  warningInk: "oklch(0.58 0.13 75)",
  offline: "oklch(0.6 0.2 25)",
  offlineInk: "oklch(0.55 0.18 25)",
} as const;

export const font = {
  ui: "'Hanken Grotesk', system-ui, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, monospace",
} as const;

export const radius = { sm: "8px", md: "10px", lg: "14px", xl: "16px", pill: "20px" } as const;

export const shadow = {
  card: "0 1px 2px oklch(0.4 0.02 300 / 0.06)",
  pop: "0 40px 90px -30px oklch(0.3 0.05 300 / 0.5)",
} as const;

/** The Google Fonts link the prototype uses; apps inject it in their <head>. */
export const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap";

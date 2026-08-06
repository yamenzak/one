/**
 * <ScenaMascot> — the Scena character as a React component, wrapping the shared
 * `@scena/brand` SVG builder. Give it a `mood` (scenario) and it draws the right
 * pose + expression; pass `tokens` to tint it with the tenant's live design
 * tokens, or a `palette` for a fixed look. Sizing is via `size` (px) or CSS.
 */
import { useId, useMemo } from "react";
import {
  scenaMascotSvg,
  scenaIconSvg,
  SCENA_TOKEN_PALETTE,
  type ScenaMood,
  type ScenaPose,
  type ScenaExpression,
  type ScenaPalette,
} from "@scena/brand";

export interface ScenaMascotProps {
  mood?: ScenaMood;
  pose?: ScenaPose;
  expression?: ScenaExpression;
  /** Follow the tenant's design tokens (--primary/--accent). Default true. */
  tokens?: boolean;
  /** A fixed palette (wins over `tokens`). */
  palette?: ScenaPalette;
  animate?: boolean;
  cheeks?: boolean;
  /** Square size in px. Omit to fill the parent (100%). */
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function ScenaMascot({
  mood = "idle",
  pose,
  expression,
  tokens = true,
  palette,
  animate = true,
  cheeks = true,
  size,
  className,
  style,
}: ScenaMascotProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const html = useMemo(
    () =>
      scenaMascotSvg({
        mood, pose, expression, animate, cheeks, uid,
        palette: palette ?? (tokens ? SCENA_TOKEN_PALETTE : undefined),
        attrs: 'style="width:100%;height:100%;display:block"',
      }),
    [mood, pose, expression, animate, cheeks, uid, palette, tokens],
  );
  return (
    <div
      className={className}
      style={{ width: size, height: size, ...style }}
      // The SVG is built from a fixed template with sanitized enum inputs — no user HTML.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export interface ScenaIconProps {
  /** Face on the tile. Default cheerful. */
  expression?: ScenaExpression;
  /** Follow the tenant's design tokens. Default true. */
  tokens?: boolean;
  palette?: ScenaPalette;
  /** Full-bleed square (no rounding) for masked contexts. Default false. */
  maskable?: boolean;
  cheeks?: boolean;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

/** The compact Scena logo mark — the face on a rounded tile (no antennas/feet),
 *  legible small. Use for the shell logo, avatars, chips; use <ScenaMascot> for
 *  full-character moments. */
export function ScenaIcon({
  expression = "cheerful",
  tokens = true,
  palette,
  maskable = false,
  cheeks = true,
  size,
  className,
  style,
}: ScenaIconProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const html = useMemo(
    () =>
      scenaIconSvg({
        expression, maskable, cheeks, uid,
        palette: palette ?? (tokens ? SCENA_TOKEN_PALETTE : undefined),
        attrs: 'style="width:100%;height:100%;display:block"',
      }),
    [expression, maskable, cheeks, uid, palette, tokens],
  );
  return (
    <div
      className={className}
      style={{ width: size, height: size, ...style }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** Re-exported so a consumer needs one import for the mark and its moods.
 *  `@scena/ui` used to do this; it is gone (see docs/SCENA-REWRITE.md §7a). */
export type { ScenaMood } from "@scena/brand";

/**
 * A Code 128 barcode, as SVG.
 *
 * SVG rather than canvas because these are PRINTED: a canvas bitmap is rendered
 * at screen resolution and a printer then scales it up, softening every bar edge
 * — which is precisely the failure that makes a label read at 40 cm and not at
 * 15. Vector bars stay crisp at whatever DPI the printer has.
 *
 * `shapeRendering="crispEdges"` for the same reason at the other end: anti-
 * aliasing a bar edge on screen is what makes an on-screen preview fail to scan
 * from a phone held up to a monitor, which is exactly how somebody will first
 * try this.
 */

import { code128Bars } from "@tessa/domain";
import { useT } from "./i18n.js";

export function Barcode({ value, height = 48, className }: { value: string; height?: number; className?: string }) {
  const t = useT();
  let bars: { x: number; width: number }[];
  let modules: number;
  try {
    ({ bars, modules } = code128Bars(value));
  } catch {
    // An unencodable code is a real state — a label code with an umlaut in it —
    // and it must say so rather than rendering an empty box that looks like a
    // print failure.
    return <span className={className}>{t("labels.cantPrint", { code: value })}</span>;
  }

  return (
    <svg
      className={className}
      viewBox={`0 0 ${modules} ${height}`}
      // A fixed viewBox with `preserveAspectRatio="none"` would let CSS stretch
      // the symbol horizontally; the module RATIOS are what a reader decodes, so
      // they must survive whatever width the label ends up.
      preserveAspectRatio="xMidYMid meet"
      shapeRendering="crispEdges"
      role="img"
      aria-label={`Code 128: ${value}`}
    >
      {/* An explicit white ground, because a printed barcode on a transparent
          background inherits whatever is behind it and a reader needs contrast. */}
      <rect x="0" y="0" width={modules} height={height} fill="#fff" />
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y="0" width={b.width} height={height} fill="#000" />
      ))}
    </svg>
  );
}

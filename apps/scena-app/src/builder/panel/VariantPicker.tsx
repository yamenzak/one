/**
 * Live variant picker (§17) — instead of a dropdown, each display variant is a
 * real, miniature render of the widget so operators pick by *seeing* it. The
 * thumbnails use the same `WidgetContent` renderer the canvas + player use, with
 * the variant applied, so they're always accurate.
 */
import { cn } from "@/lib/utils";
import { WidgetContent } from "../WidgetView.js";
import type { WNode } from "../types.js";

const PREVIEW_W = 132;
const PREVIEW_H = 78;
// Design-space size the preview is rendered at (card aspect), then scaled down.
const DESIGN_W = 640;
const DESIGN_H = Math.round((DESIGN_W * PREVIEW_H) / PREVIEW_W);

export function VariantPicker({
  node, configKey = "variant", value, options, onPick,
}: {
  node: WNode;
  configKey?: string;
  value: string;
  options: { id: string; label: string }[];
  onPick: (id: string) => void;
}) {
  const scale = PREVIEW_W / DESIGN_W;
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map((o) => {
        const active = value === o.id;
        const preview: WNode = { ...node, w: DESIGN_W, h: DESIGN_H, rot: 0, config: { ...node.config, [configKey]: o.id } };
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onPick(o.id)}
            className={cn("group flex flex-col overflow-hidden rounded-lg border-2 text-left transition-colors", active ? "border-primary" : "border-transparent hover:border-border")}
          >
            <div className="relative" style={{ width: "100%", height: PREVIEW_H, background: "linear-gradient(135deg, oklch(0.28 0.03 300), oklch(0.19 0.02 300))" }}>
              <div style={{ position: "absolute", inset: 0 }}>
                <div style={{ width: DESIGN_W, height: DESIGN_H, transform: `scale(${scale})`, transformOrigin: "top left" }}>
                  <WidgetContent node={preview} />
                </div>
              </div>
            </div>
            <span className={cn("truncate px-1.5 py-1 text-[10.5px] font-medium", active ? "bg-primary/10 text-primary" : "bg-muted/50 text-muted-foreground")}>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

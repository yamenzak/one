/**
 * The builder property panel's control kit — built on the app's shadcn tokens
 * (not the legacy @scena/ui inline styles) so the panel matches the rest of the
 * product. Compact, label-left rows plus a few composite controls (segmented
 * toggle, colour, slider-with-readout) a real builder needs.
 */
import * as React from "react";
import { ChevronDown, Link2, Unlink2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input, Select, Switch } from "@4dl/ui";

/** A labelled row: caption on the left, control on the right. */
export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="w-[86px] shrink-0 text-xs text-muted-foreground">{label}</span>
        <span className="min-w-0 flex-1">{children}</span>
      </div>
      {hint && <span className="pl-[86px] text-[10.5px] leading-tight text-muted-foreground/70">{hint}</span>}
    </label>
  );
}

/** A collapsible titled group. */
export function Group({ title, children, defaultOpen = true, right }: { title: string; children: React.ReactNode; defaultOpen?: boolean; right?: React.ReactNode }) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className="border-b last:border-b-0">
      <div className="flex items-center">
        <button type="button" onClick={() => setOpen((o) => !o)} className="flex flex-1 items-center gap-1.5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <ChevronDown className={cn("size-3.5 transition-transform", !open && "-rotate-90")} />
          {title}
        </button>
        {right}
      </div>
      {open && <div className="flex flex-col gap-2.5 pb-3.5">{children}</div>}
    </div>
  );
}

export function TextField({ value, onChange, placeholder, mono }: { value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean }) {
  return <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cn("h-8 text-xs", mono && "font-mono")} />;
}

export function AreaField({ value, onChange, rows = 3, placeholder }: { value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }) {
  return <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} placeholder={placeholder} className="w-full resize-y rounded-md border border-input bg-transparent px-2.5 py-1.5 text-xs shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />;
}

export function NumberField({ value, onChange, min, max, step, suffix }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; suffix?: string }) {
  // A local draft so mid-edit input (a decimal point, a leading "-", a cleared
  // field) isn't clobbered by the controlled value — which read as the setting
  // "resetting" while you typed. The draft masks the field until blur, then it
  // re-syncs to the committed value.
  const [draft, setDraft] = React.useState<string | null>(null);
  const shown = draft ?? (Number.isFinite(value) ? String(Math.round(value * 100) / 100) : "0");
  const commit = (raw: string) => {
    if (raw.trim() === "") return;
    let n = Number(raw);
    if (!Number.isFinite(n)) return;
    if (min != null) n = Math.max(min, n);
    if (max != null) n = Math.min(max, n);
    onChange(n);
  };
  return (
    <div className="relative">
      <Input
        type="text"
        inputMode="decimal"
        value={shown}
        step={step}
        onChange={(e) => { setDraft(e.target.value); commit(e.target.value); }}
        onBlur={() => { if (draft !== null) { commit(draft); setDraft(null); } }}
        className={cn("h-8 px-2 font-mono text-xs tabular-nums", suffix && "pr-8")}
      />
      {suffix && <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">{suffix}</span>}
    </div>
  );
}

/** A range slider with a live numeric readout. */
export function SliderField({ value, onChange, min, max, step = 1 }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-primary" />
      <span className="w-9 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">{Math.round(value)}</span>
    </div>
  );
}

export function SelectField<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { id: T; label: string }[] }) {
  return (
    <Select value={value} onChange={(v) => onChange(v as T)} className="h-8 w-full text-xs" options={[
      ...options.map((o) => ({ value: o.id, label: o.label })),
    ]} />
  );
}

/** A segmented control (radio-as-buttons) — good for 2–4 mutually exclusive picks. */
export function SegField<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { id: T; label: React.ReactNode }[] }) {
  return (
    <div className="flex gap-1 rounded-lg bg-muted p-0.5">
      {options.map((o) => (
        <button key={o.id} type="button" onClick={() => onChange(o.id)}
          className={cn("flex-1 rounded-[6px] px-2 py-1 text-[11px] font-medium transition-colors", value === o.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * A four-value control with a link toggle: one number when linked (all sides
 * equal), four labelled numbers when unlinked. Used for radius (corners) and
 * border width (sides). `all` is the shared value; `sides` the per-side values.
 */
export function QuadField({ all, sides, labels, onAll, onSide, min = 0, max = 400 }: {
  all: number;
  sides: [number, number, number, number];
  labels: [string, string, string, string];
  onAll: (v: number) => void;
  onSide: (i: number, v: number) => void;
  min?: number;
  max?: number;
}) {
  const uniform = sides.every((s) => s === sides[0]);
  const [linked, setLinked] = React.useState(uniform);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={() => setLinked((l) => !l)} title={linked ? "Per-side" : "Link sides"}
          className={cn("flex size-8 shrink-0 items-center justify-center rounded-md border", linked ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent")}>
          {linked ? <Link2 className="size-3.5" /> : <Unlink2 className="size-3.5" />}
        </button>
        {linked && <span className="min-w-0 flex-1"><NumberField value={all} onChange={onAll} min={min} max={max} suffix="px" /></span>}
        {!linked && <span className="flex-1 text-[10.5px] text-muted-foreground">Independent sides</span>}
      </div>
      {!linked && (
        <div className="grid grid-cols-4 gap-1">
          {([0, 1, 2, 3] as const).map((i) => (
            <div key={i} className="flex flex-col items-center gap-0.5">
              <NumberField value={sides[i]} onChange={(v) => onSide(i, v)} min={min} max={max} />
              <span className="text-[9.5px] uppercase text-muted-foreground/70">{labels[i]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function SwitchField({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-2 py-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Switch checked={value} onCheckedChange={onChange} />
    </label>
  );
}

/** A colour control: a swatch that opens the native picker (writes hex) next to a
 *  free-text field that also accepts oklch()/rgba() strings. */
export function ColorField({ value, onChange, fallback = "#ffffff" }: { value: string; onChange: (v: string) => void; fallback?: string }) {
  const hex = /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
  return (
    <div className="flex items-center gap-1.5">
      <span className="relative size-8 shrink-0 overflow-hidden rounded-md border shadow-xs" style={{ background: value || fallback }}>
        <input type="color" value={hex} onChange={(e) => onChange(e.target.value)} className="absolute -inset-1 size-[140%] cursor-pointer opacity-0" />
      </span>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="#hex or oklch(…)" className="h-8 font-mono text-[11px]" />
    </div>
  );
}

/**
 * Home-widget kit — a swipeable 2×3 hero grid (like Google Health). Every
 * widget has a big ring form (1 col × 3 rows) and a small card form (1 × 1);
 * users pick which appear, at which size, in which order. Widgets are
 * theme-tone coded and their renderers format values in the user's units.
 */

import { useRef, useState, type ReactNode } from "react";
import { Sheet, Button, IconBadge, ProgressRing, cn, toneVar, ChevronDown, X, LayoutGrid, type Tone, type LucideIcon } from "@mossa/ui";
import type { WidgetItem } from "@mossa/protocol";

export type { WidgetItem };
export type WidgetSize = "big" | "small";

export interface WidgetDef<D> {
  id: string;
  title: string;
  icon: LucideIcon;
  renderBig: (data: D) => ReactNode;
  renderSmall: (data: D) => ReactNode;
  available?: (data: D) => boolean;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Big widget shell: a metric ring that fills its 1×3 cell. */
export function RingCard({ tone, value, label, sublabel, progress }: { tone: Tone; value: ReactNode; label: string; sublabel?: string; progress: number }) {
  return (
    <div className="relative flex h-full items-center justify-center overflow-hidden rounded-2xl bg-card p-2">
      <div className="pointer-events-none absolute -right-8 -top-8 size-24 rounded-full opacity-[0.1] blur-2xl" style={{ background: toneVar[tone] }} />
      <ProgressRing size={148} strokeWidth={10} tone={tone} progress={progress} value={value} label={label} sublabel={sublabel} />
    </div>
  );
}

/** Small widget shell: an icon + value card filling its 1×1 cell. */
export function MiniCard({ icon: Icon, tone, value, label, progress }: { icon: LucideIcon; tone: Tone; value: ReactNode; label: string; progress?: number }) {
  return (
    <div className="relative flex h-full flex-col justify-center gap-0.5 overflow-hidden rounded-2xl bg-card px-3.5 py-2">
      <div className="pointer-events-none absolute -right-5 -top-5 size-12 rounded-full opacity-[0.12] blur-xl" style={{ background: toneVar[tone] }} />
      <div className="relative flex items-center gap-1.5"><Icon className="size-3.5 shrink-0" style={{ color: toneVar[tone] }} /><span className="truncate text-[0.65rem] font-medium text-muted-foreground">{label}</span></div>
      <div className="numeral relative truncate text-lg font-bold leading-none">{value}</div>
      {progress != null && <div className="relative mt-1 h-1 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full transition-all" style={{ width: `${clamp01(progress) * 100}%`, background: toneVar[tone] }} /></div>}
    </div>
  );
}

const norm = (x: WidgetItem | string): WidgetItem => (typeof x === "string" ? { id: x, size: "small" } : x);

function resolveItems<D>(catalog: WidgetDef<D>[], saved: readonly (WidgetItem | string)[] | null | undefined, defaults: WidgetItem[], data: D): { def: WidgetDef<D>; size: WidgetSize }[] {
  const byId = new Map(catalog.map((w) => [w.id, w]));
  const raw = saved && saved.length ? saved.map(norm) : defaults;
  return raw
    .map((it) => { const def = byId.get(it.id); return def && (!def.available || def.available(data)) ? { def, size: it.size } : null; })
    .filter((x): x is { def: WidgetDef<D>; size: WidgetSize } => !!x);
}

type Col<D> = { big: { def: WidgetDef<D>; size: WidgetSize } } | { smalls: { def: WidgetDef<D>; size: WidgetSize }[] };
/** Pack placements into columns (big = a whole 3-row column; smalls = up to 3),
 *  then group columns into 2-column pages. */
function packPages<D>(items: { def: WidgetDef<D>; size: WidgetSize }[]): Col<D>[][] {
  const cols: Col<D>[] = [];
  let cur: { def: WidgetDef<D>; size: WidgetSize }[] = [];
  const flush = () => { if (cur.length) { cols.push({ smalls: cur }); cur = []; } };
  for (const it of items) {
    if (it.size === "big") { flush(); cols.push({ big: it }); }
    else { cur.push(it); if (cur.length === 3) flush(); }
  }
  flush();
  const pages: Col<D>[][] = [];
  for (let i = 0; i < cols.length; i += 2) pages.push(cols.slice(i, i + 2));
  return pages;
}

const HERO_H = "16rem";
const PAGE_GAP = 12;

/** The swipeable hero grid. */
export function WidgetCarousel<D>({ catalog, items, defaults, data, onCustomize }: {
  catalog: WidgetDef<D>[]; items: readonly (WidgetItem | string)[] | null | undefined; defaults: WidgetItem[]; data: D; onCustomize: () => void;
}) {
  const pages = packPages(resolveItems(catalog, items, defaults, data));
  const [page, setPage] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const onScroll = () => { const el = ref.current; if (el) setPage(Math.round(el.scrollLeft / (el.clientWidth + PAGE_GAP))); };

  if (pages.length === 0) {
    return <button onClick={onCustomize} className="flex h-32 w-full items-center justify-center rounded-2xl border border-dashed border-border text-sm text-muted-foreground transition-colors hover:bg-secondary [&_svg]:mr-1.5 [&_svg]:size-4"><LayoutGrid /> Add widgets</button>;
  }
  return (
    <div className="space-y-2">
      <div ref={ref} onScroll={onScroll} className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {pages.map((cols, pi) => (
          <div key={pi} className="grid w-full shrink-0 snap-start grid-cols-2 grid-rows-3 gap-2.5" style={{ height: HERO_H }}>
            {cols.flatMap((col, ci) =>
              "big" in col
                ? [<div key={col.big.def.id} style={{ gridColumnStart: ci + 1, gridRowStart: 1, gridRowEnd: 4 }}>{col.big.def.renderBig(data)}</div>]
                : col.smalls.map((s, ri) => <div key={s.def.id} style={{ gridColumnStart: ci + 1, gridRowStart: ri + 1 }}>{s.def.renderSmall(data)}</div>),
            )}
          </div>
        ))}
      </div>
      {pages.length > 1 && (
        <div className="flex items-center justify-center gap-1.5">
          {pages.map((_, i) => <span key={i} className={cn("h-1.5 rounded-full transition-all", i === page ? "w-4 bg-primary" : "w-1.5 bg-surface-3")} />)}
        </div>
      )}
    </div>
  );
}

/** Add / remove / resize / reorder the hero widgets. */
export function WidgetCustomizeSheet<D>({ catalog, items, defaults, onClose, onSave }: {
  catalog: WidgetDef<D>[]; items: readonly (WidgetItem | string)[] | null | undefined; defaults: WidgetItem[]; onClose: () => void; onSave: (items: WidgetItem[]) => void;
}) {
  const [list, setList] = useState<WidgetItem[]>(() => (items && items.length ? items.map(norm) : defaults));
  const sel = new Set(list.map((i) => i.id));
  const available = catalog.filter((w) => !sel.has(w.id));
  const defOf = (id: string) => catalog.find((w) => w.id === id);
  const move = (i: number, dir: number) => setList((l) => { const n = [...l]; const j = i + dir; if (j < 0 || j >= n.length) return l; [n[i], n[j]] = [n[j]!, n[i]!]; return n; });
  const setSize = (i: number, size: WidgetSize) => setList((l) => l.map((it, k) => (k === i ? { ...it, size } : it)));
  const remove = (i: number) => setList((l) => l.filter((_, k) => k !== i));
  const add = (id: string) => setList((l) => [...l, { id, size: "small" }]);

  return (
    <Sheet open onClose={onClose} title="Customize hero">
      <div className="space-y-4">
        <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Showing · ring or card</div>
        <div className="space-y-1.5">
          {list.map((it, i) => {
            const def = defOf(it.id);
            return (
              <div key={it.id} className="flex items-center gap-2 rounded-xl bg-surface-2 p-2">
                <div className="flex flex-col text-muted-foreground [&_svg]:size-4">
                  <button onClick={() => move(i, -1)} disabled={i === 0} className="disabled:opacity-30"><ChevronDown className="rotate-180" /></button>
                  <button onClick={() => move(i, 1)} disabled={i === list.length - 1} className="disabled:opacity-30"><ChevronDown /></button>
                </div>
                {def && <IconBadge icon={def.icon} tone="primary" size="sm" />}
                <span className="flex-1 truncate text-sm font-medium">{def?.title ?? it.id}</span>
                <div className="flex rounded-full bg-surface-3 p-0.5 text-xs font-medium">
                  <button onClick={() => setSize(i, "small")} className={cn("rounded-full px-2.5 py-1 transition-colors", it.size === "small" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}>Card</button>
                  <button onClick={() => setSize(i, "big")} className={cn("rounded-full px-2.5 py-1 transition-colors", it.size === "big" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}>Ring</button>
                </div>
                <button onClick={() => remove(i)} className="grid size-7 place-items-center rounded-full text-muted-foreground hover:text-danger [&_svg]:size-4"><X /></button>
              </div>
            );
          })}
          {list.length === 0 && <p className="px-1 text-sm text-muted-foreground">Nothing yet — add a widget below.</p>}
        </div>
        {available.length > 0 && (
          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Add</div>
            <div className="flex flex-wrap gap-2">
              {available.map((w) => <button key={w.id} onClick={() => add(w.id)} className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-2 text-sm font-medium transition-colors hover:bg-surface-3 active:scale-95 [&_svg]:size-4"><w.icon /> {w.title}</button>)}
            </div>
          </div>
        )}
        <Button size="lg" className="w-full" onClick={() => { onSave(list); onClose(); }}><LayoutGrid /> Save layout</Button>
      </div>
    </Sheet>
  );
}

/**
 * The hero grid and its builder.
 *
 * Two components that MUST agree: `WidgetCarousel` draws the client's layout on
 * Today, and `WidgetBuilder` lets them change it. They agree by construction —
 * both lay out through `packPages` and both render through the same `<Grid>`,
 * so the builder is a live preview of the hero rather than a description of it.
 *
 * That is the whole point of the rewrite. The old customizer was a list of rows
 * with up/down arrows and a Card/Ring toggle: you could not see what you were
 * making, the words "big" and "small" did not tell you how much space anything
 * took, and the only way to find out was to save and go back. Widgets also had
 * only two shapes, so the arrangement you could describe was never the
 * arrangement you wanted.
 */

import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  Sheet, Button, IconBadge, EmptyState, cn, TILE_FOOTPRINT, TILE_FORM_LABEL,
  Check, X, Plus, LayoutGrid, Trash2, type TileForm, type Tone, type LucideIcon,
} from "@4dl/ui";
import type { WidgetItem } from "@kova/protocol";
import { packPages, fits, formOf, GRID_COLS, GRID_ROWS, type Placement } from "./widget-pack.js";

export type { WidgetItem };

/** What the kit needs to know about a widget, whoever supplies it. */
export interface KitDef<D> {
  id: string;
  title: string;
  blurb: string;
  icon: LucideIcon;
  tone: Tone;
  forms: TileForm[];
  render: (form: TileForm, data: D) => ReactNode;
  available?: (data: D) => boolean;
}

const HERO_H = "14rem";

/** Grid-position style for a placement. */
const cellStyle = (p: { col: number; row: number; cols: number; rows: number }) => ({
  gridColumnStart: p.col + 1,
  gridColumnEnd: p.col + 1 + p.cols,
  gridRowStart: p.row + 1,
  gridRowEnd: p.row + 1 + p.rows,
});

/** One page of the 2×3 grid. Shared by the hero and the builder canvas so a
 *  preview can never be a different shape from the real thing. */
function Grid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid w-full shrink-0 gap-2.5", className)} style={{ height: HERO_H, gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${GRID_ROWS}, minmax(0, 1fr))` }}>
      {children}
    </div>
  );
}

function resolve<D>(catalog: KitDef<D>[], saved: readonly WidgetItem[] | null | undefined, defaults: readonly WidgetItem[], data: D): WidgetItem[] {
  const byId = new Map(catalog.map((w) => [w.id, w]));
  const raw = saved && saved.length ? saved : defaults;
  return raw.filter((it) => { const def = byId.get(it.id); return !!def && (!def.available || def.available(data)); });
}

// ── The hero ─────────────────────────────────────────────────────────────────

export function WidgetCarousel<D>({ catalog, items, defaults, data, onCustomize }: {
  catalog: KitDef<D>[]; items: readonly WidgetItem[] | null | undefined; defaults: readonly WidgetItem[]; data: D; onCustomize: () => void;
}) {
  const byId = useMemo(() => new Map(catalog.map((w) => [w.id, w])), [catalog]);
  const pages = useMemo(
    () => packPages(resolve(catalog, items, defaults, data), (it) => ({ form: formOf(it), page: it.page })),
    [catalog, items, defaults, data],
  );
  const [page, setPage] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const onScroll = () => { const el = ref.current; if (el) setPage(Math.round(el.scrollLeft / Math.max(1, el.clientWidth))); };
  const goTo = (i: number) => ref.current?.scrollTo({ left: i * ref.current.clientWidth, behavior: "smooth" });

  if (pages.length === 0) {
    return (
      <button onClick={onCustomize} className="flex h-32 w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border text-sm text-muted-foreground transition-colors hover:bg-secondary [&_svg]:size-4">
        <LayoutGrid /> Add widgets
      </button>
    );
  }
  return (
    <div className="space-y-2.5">
      <div ref={ref} onScroll={onScroll} className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain">
        {pages.map((placements, pi) => (
          <Grid key={pi} className="snap-center snap-always">
            {placements.map((p) => (
              <div key={p.item.id} style={cellStyle(p)}>{byId.get(p.item.id)!.render(p.form, data)}</div>
            ))}
          </Grid>
        ))}
      </div>
      {pages.length > 1 && (
        <div className="flex items-center justify-center gap-1.5">
          {pages.map((_, i) => (
            <button key={i} onClick={() => goTo(i)} aria-label={`Page ${i + 1}`} className={cn("h-1.5 rounded-full transition-all", i === page ? "w-5 bg-primary" : "w-1.5 bg-surface-3 hover:bg-surface-2")} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── The builder ──────────────────────────────────────────────────────────────

/** A form's shape, drawn to scale — so "Trend" is a wide bar and "Ring" is a
 *  tall column, and the words never have to explain the geometry. */
function FormGlyph({ form, active }: { form: TileForm; active: boolean }) {
  const fp = TILE_FOOTPRINT[form];
  return (
    <span className="grid h-4 w-3 gap-0.5" style={{ gridTemplateColumns: "repeat(2, 1fr)", gridTemplateRows: "repeat(3, 1fr)" }} aria-hidden>
      {/* rounded-full rather than a hairline radius: at glyph size it is also
          the clearest reading — a card is a dot, a ring a tall pill, a trend a
          wide one — and an arbitrary radius could not follow tenant branding. */}
      <span className={cn("rounded-full", active ? "bg-primary-foreground" : "bg-muted-foreground/70")} style={{ gridColumn: `1 / span ${fp.cols}`, gridRow: `1 / span ${fp.rows}` }} />
    </span>
  );
}

/**
 * The builder. Direct manipulation on real canvases:
 *  · every page is the actual hero grid at the actual size, with the actual
 *    widgets rendered in it — no abstraction to translate;
 *  · an empty slot is a tap target that opens the picker;
 *  · tapping a placed widget selects it, and the toolbar underneath changes its
 *    form or removes it. Only forms that (a) suit the metric and (b) still fit
 *    the page are offered, so you cannot build a layout the grid will refuse.
 */
export function WidgetBuilder<D>({ catalog, items, defaults, data, onClose, onSave }: {
  catalog: KitDef<D>[]; items: readonly WidgetItem[] | null | undefined; defaults: readonly WidgetItem[]; data: D; onClose: () => void; onSave: (items: WidgetItem[]) => void;
}) {
  const byId = useMemo(() => new Map(catalog.map((w) => [w.id, w])), [catalog]);
  // Normalise on entry: legacy layouts arrive without `form`/`page`, and the
  // builder always writes both, so what the client arranges is what renders.
  const [list, setList] = useState<WidgetItem[]>(() => {
    const src = items && items.length ? items : defaults;
    const normalised = src.map((it) => ({ ...it, form: formOf(it) }));
    if (normalised.some((it) => it.page != null)) return normalised.map((it) => ({ ...it, page: it.page ?? 0 }));
    // Legacy: let the packer decide the pages once, then keep them explicit.
    return packPages(normalised, (it) => ({ form: formOf(it) }))
      .flatMap((page, pi) => page.map((p) => ({ ...p.item, page: pi })));
  });
  const [sel, setSel] = useState<string | null>(null);
  const [picking, setPicking] = useState<number | null>(null);

  const pageCount = Math.max(1, list.reduce((n, it) => Math.max(n, (it.page ?? 0) + 1), 0));
  const pageItems = (pi: number) => list.filter((it) => (it.page ?? 0) === pi);
  const placements = useMemo(
    () => packPages(list, (it) => ({ form: formOf(it), page: it.page ?? 0 })),
    [list],
  );

  const selDef = sel ? byId.get(list.find((i) => i.id === sel)?.id ?? "") : null;
  const selItem = sel ? list.find((i) => i.id === sel) ?? null : null;

  const setForm = (id: string, form: TileForm) => setList((l) => l.map((it) => (it.id === id ? { ...it, form } : it)));
  const remove = (id: string) => { setList((l) => l.filter((it) => it.id !== id)); setSel(null); };
  const addTo = (pi: number, id: string) => {
    const def = byId.get(id)!;
    const onPage = pageItems(pi).map((it) => ({ form: formOf(it) }));
    // Place it in the first of its forms that still fits this page.
    const form = def.forms.find((f) => fits(onPage, f)) ?? def.forms[0]!;
    setList((l) => [...l, { id, form, page: pi }]);
    setPicking(null);
    setSel(id);
  };

  /** Free cells on a page, so the canvas can show real tap targets. */
  const holes = (pi: number): { col: number; row: number }[] => {
    const used = new Set<string>();
    for (const p of placements[pi] ?? []) {
      for (let r = p.row; r < p.row + p.rows; r++) for (let c = p.col; c < p.col + p.cols; c++) used.add(`${r},${c}`);
    }
    const out: { col: number; row: number }[] = [];
    for (let r = 0; r < GRID_ROWS; r++) for (let c = 0; c < GRID_COLS; c++) if (!used.has(`${r},${c}`)) out.push({ col: c, row: r });
    return out;
  };

  const canAdd = (pi: number) => catalog.filter((w) => !list.some((it) => it.id === w.id) && (!w.available || w.available(data)) && w.forms.some((f) => fits(pageItems(pi).map((it) => ({ form: formOf(it) })), f)));

  return (
    <Sheet
      open
      onClose={onClose}
      size="tall"
      title="Your home screen"
      footer={<Button size="lg" className="w-full" onClick={() => { onSave(list); onClose(); }}><Check /> Save layout</Button>}
    >
      <div className="space-y-5">
        <p className="text-caption text-muted-foreground">
          Tap an empty space to add. Tap a widget to change its shape or take it off.
        </p>

        {Array.from({ length: pageCount }, (_, pi) => (
          <div key={pi} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-micro uppercase text-muted-foreground">Page {pi + 1}</span>
              {pageCount > 1 && (
                <button
                  onClick={() => setList((l) => l.filter((it) => (it.page ?? 0) !== pi).map((it) => ({ ...it, page: (it.page ?? 0) > pi ? (it.page ?? 0) - 1 : it.page })))}
                  className="inline-flex items-center gap-1 text-caption text-muted-foreground transition-colors hover:text-danger [&_svg]:size-3.5"
                >
                  <Trash2 /> Remove page
                </button>
              )}
            </div>
            <Grid>
              {(placements[pi] ?? []).map((p: Placement<WidgetItem>) => {
                const def = byId.get(p.item.id)!;
                const isSel = sel === p.item.id;
                return (
                  <button
                    key={p.item.id}
                    onClick={() => setSel(isSel ? null : p.item.id)}
                    style={cellStyle(p)}
                    aria-label={`${def.title} — ${TILE_FORM_LABEL[p.form]}`}
                    className={cn("relative overflow-hidden rounded-2xl text-left transition-all", isSel ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "hover:opacity-80")}
                  >
                    {/* The real widget, with real data — this IS the preview. */}
                    <span className="pointer-events-none block h-full">{def.render(p.form, data)}</span>
                  </button>
                );
              })}
              {holes(pi).map((h) => (
                <button
                  key={`${h.row},${h.col}`}
                  onClick={() => setPicking(pi)}
                  style={cellStyle({ ...h, cols: 1, rows: 1 })}
                  aria-label={`Add a widget to page ${pi + 1}`}
                  className="grid place-items-center rounded-2xl border border-dashed border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary [&_svg]:size-4"
                >
                  <Plus />
                </button>
              ))}
            </Grid>
          </div>
        ))}

        {/* A new page starts by choosing what goes on it — an empty page you
            then have to fill is a step with nothing in it. */}
        <Button variant="outline" className="w-full" onClick={() => setPicking(pageCount)}>
          <Plus /> Add a page
        </Button>

        {/* Selection toolbar — the shape choices for whatever is selected. */}
        {selItem && selDef && (() => {
          const others = pageItems(selItem.page ?? 0).filter((it) => it.id !== selItem.id).map((it) => ({ form: formOf(it) }));
          const blocked = selDef.forms.filter((f) => !fits(others, f));
          return (
          <div className="sticky bottom-0 space-y-2 rounded-2xl bg-surface-2 p-3">
            <div className="flex items-center gap-2">
              <IconBadge icon={selDef.icon} tone={selDef.tone} size="sm" />
              <span className="flex-1 truncate text-sm font-semibold">{selDef.title}</span>
              <button onClick={() => remove(selItem.id)} aria-label={`Remove ${selDef.title}`} className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:text-danger [&_svg]:size-4"><X /></button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {selDef.forms.map((f) => {
                const ok = fits(others, f);
                const active = formOf(selItem) === f;
                return (
                  <button
                    key={f}
                    disabled={!ok}
                    onClick={() => setForm(selItem.id, f)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-caption font-medium transition-colors",
                      active ? "bg-primary text-primary-foreground" : "bg-surface-3 text-muted-foreground hover:text-foreground",
                      !ok && "opacity-30",
                    )}
                  >
                    <FormGlyph form={f} active={active} />
                    {TILE_FORM_LABEL[f]}
                  </button>
                );
              })}
            </div>
            {/*
              A greyed-out chip with no reason is a dead end: switch a ring to a
              card and the ring no longer fits, so the way back is invisible.
              The constraint is real — the grid genuinely has no free column —
              so the fix is to say what would free one, not to fake the space.
            */}
            {blocked.length > 0 && (
              <p className="text-caption text-muted-foreground">
                {blocked.map((f) => TILE_FORM_LABEL[f]).join(" and ")} {blocked.length === 1 ? "needs" : "need"} more room — take something off this page, or start a new one.
              </p>
            )}
          </div>
          );
        })()}
      </div>

      {picking != null && (
        <Sheet open onClose={() => setPicking(null)} title={`Add to page ${picking + 1}`}>
          {canAdd(picking).length === 0 ? (
            <EmptyState icon={LayoutGrid} title="Nothing left to add" description="Every widget your plan includes is already on your home screen." />
          ) : (
            <div className="space-y-1.5">
              {canAdd(picking).map((w) => (
                <button key={w.id} onClick={() => addTo(picking, w.id)} className="flex w-full items-center gap-3 rounded-xl bg-surface-2 p-3 text-left transition-colors hover:bg-surface-3">
                  <IconBadge icon={w.icon} tone={w.tone} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{w.title}</span>
                    <span className="block truncate text-caption text-muted-foreground">{w.blurb}</span>
                  </span>
                  <Plus className="size-4 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
        </Sheet>
      )}
    </Sheet>
  );
}

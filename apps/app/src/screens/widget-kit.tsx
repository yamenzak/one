/**
 * Home-screen widget kit — the shared shell (StatTile), the widget contract,
 * and the customize sheet used by both the client and coach home surfaces.
 * A widget is a small, self-describing card; users pick which ones to show.
 */

import { useState, type ReactNode } from "react";
import { Sheet, Button, IconBadge, cn, motion, toneVar, Check, LayoutGrid, type Tone, type LucideIcon } from "@mossa/ui";

/** A widget definition. `render` returns the full tile node (use StatTile for
 *  the common stat case). `available` hides a widget when its data is absent. */
export interface WidgetDef<D> {
  id: string;
  title: string;
  icon: LucideIcon;
  wide?: boolean;
  available?: (data: D) => boolean;
  render: (data: D) => ReactNode;
}

/** The common widget body: an accent glow, icon, big value, label + optional sub. */
export function StatTile({ icon: Icon, tone, value, label, sub, wide, onClick }: {
  icon: LucideIcon; tone: Tone; value: ReactNode; label: string; sub?: ReactNode; wide?: boolean; onClick?: () => void;
}) {
  const Comp = onClick ? motion.button : motion.div;
  return (
    <Comp
      onClick={onClick}
      whileTap={onClick ? { scale: 0.97 } : undefined}
      className={cn("relative flex flex-col gap-1 overflow-hidden rounded-2xl bg-card p-3.5 text-left", wide && "col-span-2")}
    >
      <div className="pointer-events-none absolute -right-6 -top-6 size-16 rounded-full opacity-[0.12] blur-2xl" style={{ background: toneVar[tone] }} />
      <Icon className="relative size-4" style={{ color: toneVar[tone] }} />
      <div className="numeral relative mt-0.5 text-xl font-bold leading-none">{value}</div>
      <div className="relative text-[0.65rem] leading-tight text-muted-foreground">{label}</div>
      {sub != null && <div className="relative text-[0.6rem] leading-tight text-muted-foreground/80">{sub}</div>}
    </Comp>
  );
}

/** Resolve a saved id list against the catalog: keep known + available ids in
 *  saved order, falling back to the defaults when the user hasn't customized. */
export function resolveWidgets<D>(catalog: WidgetDef<D>[], saved: string[] | null | undefined, defaults: string[], data: D): WidgetDef<D>[] {
  const byId = new Map(catalog.map((w) => [w.id, w]));
  const ids = saved && saved.length ? saved : defaults;
  return ids.map((id) => byId.get(id)).filter((w): w is WidgetDef<D> => !!w && (!w.available || w.available(data)));
}

/** Toggle-list sheet to choose which widgets appear (saved order = add order). */
export function WidgetCustomizeSheet<D>({ catalog, selected, defaults, onClose, onSave }: {
  catalog: WidgetDef<D>[]; selected: string[] | null | undefined; defaults: string[]; onClose: () => void; onSave: (ids: string[]) => void;
}) {
  const [ids, setIds] = useState<string[]>(selected && selected.length ? selected : defaults);
  const toggle = (id: string) => setIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  return (
    <Sheet open onClose={onClose} title="Customize widgets">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Tap to choose what shows on your home screen.</p>
        <div className="max-h-[60vh] space-y-1.5 overflow-y-auto">
          {catalog.map((w) => {
            const on = ids.includes(w.id);
            return (
              <button key={w.id} onClick={() => toggle(w.id)} className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors active:scale-[0.99]", on ? "bg-primary/10" : "bg-surface-2 hover:bg-surface-3")}>
                <IconBadge icon={w.icon} tone={on ? "primary" : "neutral"} size="sm" />
                <span className="flex-1 text-sm font-medium">{w.title}</span>
                <span className={cn("grid size-6 place-items-center rounded-full transition-colors [&_svg]:size-3.5", on ? "bg-primary text-primary-foreground" : "bg-surface-3 text-transparent")}><Check strokeWidth={3} /></span>
              </button>
            );
          })}
        </div>
        <Button size="lg" className="w-full" onClick={() => { onSave(ids); onClose(); }}><LayoutGrid /> Save layout</Button>
      </div>
    </Sheet>
  );
}

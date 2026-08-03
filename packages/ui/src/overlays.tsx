/**
 * Overlay primitives — Dialog (radix), Sheet (vaul drawer), DropdownMenu,
 * Tabs + SegmentedControl (animated), Select, Tooltip, Avatar. Polished,
 * animated, theme-driven.
 */

import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as DropdownPrimitive from "@radix-ui/react-dropdown-menu";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as SelectPrimitive from "@radix-ui/react-select";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { Drawer } from "vaul";
import { motion } from "motion/react";
import { SPRING, SPRING_SNAP, DUR } from "./lib/animation.js";
import { Check, ChevronDown, X, type LucideIcon } from "./lib/icons.js";
import { cn } from "./lib/utils.js";
import { Button } from "./primitives.js";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * The house focus ring (§12). Every focusable control in this file sets
 * `outline-none`, which is only defensible if something replaces it — three of
 * them did not, so a keyboard user tabbing through a dialog, a tab bar or a
 * segmented control saw nothing move.
 */
const FOCUS = "focus-visible:ring-2 focus-visible:ring-ring/70";

/**
 * The dim behind every overlay. **One constant, used by all of them**: the
 * Sheet used to hard-code the same colours without the animation classes, so
 * its scrim snapped on and off while the sheet itself slid (§8 — the dim fades
 * WITH the layer, never after it).
 */
const overlayCls =
  "fixed inset-0 z-50 bg-scrim backdrop-blur-sm data-[state=open]:animate-[overlay-in_0.2s_ease] data-[state=closed]:animate-[overlay-out_0.15s_ease]";

/**
 * How many px the on-screen keyboard overlaps the layout viewport, via the
 * VisualViewport API. On both iOS and Android the keyboard covers (not
 * resizes) the layout viewport, so bottom-anchored drawers hide their footer
 * behind it. Drawers lift by this inset and clamp their height to the space
 * above the keyboard. Small deltas (address-bar chrome) are ignored.
 */
function useKeyboardInset(active: boolean) {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!active || !vv) return;
    const update = () => {
      const overlap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setInset(overlap > 90 ? Math.round(overlap) : 0);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      setInset(0);
    };
  }, [active]);
  return inset;
}

/**
 * Modal a11y for hand-rolled full-screen overlays (the workout/meal plan
 * surfaces) that can't use the Dialog/Sheet primitives. Returns a ref to spread
 * on the overlay element; it moves focus into the modal on mount, keeps Tab
 * focus inside it (yielding to nested portaled drawers, which manage their own
 * focus), locks body scroll, and closes on Escape. Give the initial-focus
 * target a `data-autofocus` attribute, else the container itself is focused.
 */
export function useModalOverlay(onClose?: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });
  useEffect(() => {
    const el = ref.current;
    const prevFocus = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const initial = el?.querySelector<HTMLElement>("[data-autofocus]") ?? el;
    initial?.focus?.();
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !el) return; // a nested drawer already handled it
      if (e.key === "Escape") { closeRef.current?.(); return; }
      if (e.key !== "Tab") return;
      if (!el.contains(document.activeElement)) return; // nested portal owns focus
      const nodes = el.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])',
      );
      if (nodes.length === 0) return;
      const first = nodes[0]!, last = nodes[nodes.length - 1]!;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prevOverflow; prevFocus?.focus?.(); };
  }, []);
  return ref;
}

// ── Dialog (centered modal) ─────────────────────────────────────────────────
export function Dialog({ open, onOpenChange, children }: { open: boolean; onOpenChange: (o: boolean) => void; children: ReactNode }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      {children}
    </DialogPrimitive.Root>
  );
}

export function DialogContent({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlayCls} />
      <DialogPrimitive.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-border/60 bg-popover p-6 shadow-lg outline-none",
          "data-[state=open]:animate-[content-in_var(--dur-base)_var(--ease-out)] data-[state=closed]:animate-[content-out_var(--dur-fast)_var(--ease-out)]",
          className,
        )}
      >
        {title && <DialogPrimitive.Title className="mb-4 text-title-3">{title}</DialogPrimitive.Title>}
        {!title && <DialogPrimitive.Title className="sr-only">Dialog</DialogPrimitive.Title>}
        <DialogPrimitive.Close className={cn("absolute right-4 top-4 grid size-9 place-items-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-secondary hover:text-foreground", FOCUS)}>
          <X className="size-4" />
        </DialogPrimitive.Close>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

/** Lightweight confirm step for consequential/destructive actions — a centered
 *  Dialog with a cancel + confirm pair. Confirming runs `onConfirm` and closes. */
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = "Confirm", cancelLabel = "Cancel", destructive, onConfirm }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: ReactNode;
  confirmLabel?: string; cancelLabel?: string; destructive?: boolean; onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title}>
        {description && <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>}
        <div className="mt-5 flex gap-3">
          <Button variant="ghost" className="flex-1" onClick={() => onOpenChange(false)}>{cancelLabel}</Button>
          <Button variant={destructive ? "destructive" : "default"} className="flex-1" onClick={() => { onConfirm(); onOpenChange(false); }}>{confirmLabel}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── FixedDrawer — fixed-height bottom drawer with a sticky header + footer.
// Use for multi-step forms: set `dismissible={false}` so an accidental
// outside-tap/drag can't discard in-progress input; close via the header X. ──
export function FixedDrawer({ open, onClose, dismissible = true, title, headerAction, footer, children }: {
  open: boolean; onClose: () => void; dismissible?: boolean; title?: string; headerAction?: ReactNode; footer?: ReactNode; children: ReactNode;
}) {
  const kb = useKeyboardInset(open);
  return (
    <Drawer.Root open={open} onOpenChange={(o) => dismissible && !o && onClose()} dismissible={dismissible} repositionInputs={false}>
      <Drawer.Portal>
        <Drawer.Overlay className={overlayCls} />
        {/* Lift above the keyboard and clamp height so header + footer stay on
            screen; the scroll area shrinks and keeps the focused field in view. */}
        <Drawer.Content
          style={{ bottom: kb || undefined, maxHeight: kb ? `calc(100dvh - ${kb}px)` : undefined }}
          className="fixed inset-x-0 bottom-0 z-50 mx-auto flex h-[87vh] w-full max-w-xl flex-col rounded-t-[--radius-sheet] border-t border-border/60 bg-popover shadow-2xl outline-none transition-[max-height,bottom] duration-200 ease-out"
        >
          <div className="flex items-center justify-between gap-3 border-b border-border/50 px-5 py-3">
            <Drawer.Title className={cn("truncate text-title-3", !title && "sr-only")}>{title ?? "Sheet"}</Drawer.Title>
            {headerAction}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
          {footer && <div className="border-t border-border/50 px-5 py-3" style={{ paddingBottom: kb ? "0.75rem" : "calc(0.75rem + env(safe-area-inset-bottom))" }}>{footer}</div>}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

/**
 * The bottom sheet — the mobile default for **doing** (§7). Drag-to-dismiss.
 *
 * ── Three parts, and why the height is quantized ────────────────────────────
 *
 * A sheet is a **header, a scrolling body, and a pinned footer**. Only the body
 * scrolls. That is the whole design, and it exists because of what the app
 * looked like without it:
 *
 *  • **Heights ranged from ~25vh to 92vh**, set by whatever the content
 *    happened to be. Opening three sheets in a row moved the surface under your
 *    thumb by half a screen each time. Now every sheet lands between a FLOOR
 *    and a CEILING — a two-field form reads as a deliberate surface instead of
 *    a popup, and nothing ever quite reaches the top of the display.
 *  • **The primary action was the last element of the scroll area** in 48 of
 *    the 69 sheets, so on a long form it sat below the fold and the way to
 *    submit was to scroll past everything you had just filled in. Pinned, it is
 *    always in the same place, and the body scrolls behind it.
 *  • The header scrolled away with the content, so half-way down a picker there
 *    was nothing on screen saying which sheet you were in.
 *
 * `size="tall"` fixes the height at the ceiling — for pickers and lists, where
 * a sheet that resizes as you filter is worse than one that doesn't.
 *
 * The header takes its hairline **on scroll only**, exactly like the `AppBar`
 * (§7): chrome recedes until it has something to separate.
 *
 * Its title is `title-2` while `FixedDrawer`'s is `title-3`, which looks like
 * drift and isn't: a sheet's title names the SUBJECT of the surface, and a
 * fixed drawer's is chrome around a form that carries its own headings. Same
 * rule as everywhere else — a component never decides its own importance, its
 * container does. Set them equal and one of the two stops reading correctly.
 */
// ── Sheet (bottom drawer, drag-to-dismiss) ──────────────────────────────────
export function Sheet({ open, onClose, title, titleAction, footer, size = "default", children }: {
  open: boolean; onClose: () => void; title?: string; titleAction?: ReactNode;
  /** Pinned below the scroll area. The sheet's primary action belongs here. */
  footer?: ReactNode;
  /** `tall` pins the height at the ceiling — for pickers and filterable lists. */
  size?: "default" | "tall";
  children: ReactNode;
}) {
  const kb = useKeyboardInset(open);
  const [scrolled, setScrolled] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  // Re-arm on every open: the same node is reused across openings, so a sheet
  // closed mid-scroll would otherwise reopen wearing a hairline it hasn't
  // earned.
  useEffect(() => { if (!open) setScrolled(false); }, [open]);
  return (
    <Drawer.Root open={open} onOpenChange={(o) => !o && onClose()} repositionInputs={false}>
      <Drawer.Portal>
        <Drawer.Overlay className={overlayCls} />
        <Drawer.Content
          style={{ bottom: kb || undefined, maxHeight: kb ? `calc(100dvh - ${kb}px)` : undefined }}
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-xl flex-col rounded-t-[--radius-sheet] border-t border-border/60 bg-popover outline-none transition-[max-height,bottom] duration-200 ease-out",
            // The keyboard already clamps maxHeight inline; a `tall` sheet must
            // yield to it rather than fight it for the space.
            size === "tall" && !kb ? "h-[86dvh]" : "max-h-[86dvh] min-h-[40dvh]",
          )}
        >
          <div className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-surface-3" />
          <div className={cn("flex shrink-0 items-center justify-between gap-3 px-5 pb-3 pt-4 transition-colors", scrolled && "border-b border-border/50")}>
            <Drawer.Title className={cn("min-w-0 truncate text-title-2", !title && "sr-only")}>{title ?? "Sheet"}</Drawer.Title>
            {titleAction}
          </div>
          <div
            ref={bodyRef}
            onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 4)}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-1"
            style={{ paddingBottom: footer ? "1rem" : kb ? "1.5rem" : "calc(1.5rem + env(safe-area-inset-bottom))" }}
          >
            {children}
          </div>
          {footer && (
            <div
              className="shrink-0 border-t border-border/50 px-5 pt-3"
              style={{ paddingBottom: kb ? "0.75rem" : "calc(0.75rem + env(safe-area-inset-bottom))" }}
            >
              {footer}
            </div>
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

// ── Dropdown menu ────────────────────────────────────────────────────────────
export const DropdownMenu = DropdownPrimitive.Root;
export const DropdownMenuTrigger = DropdownPrimitive.Trigger;

export function DropdownMenuContent({ children, align = "end", className }: { children: ReactNode; align?: "start" | "end" | "center"; className?: string }) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content
        align={align}
        sideOffset={8}
        className={cn(
          "z-50 min-w-48 rounded-2xl border border-border/60 bg-popover p-1.5 shadow-lg outline-none",
          "data-[state=open]:animate-[menu-in_var(--dur-fast)_var(--ease-out)]",
          className,
        )}
      >
        {children}
      </DropdownPrimitive.Content>
    </DropdownPrimitive.Portal>
  );
}

export function DropdownMenuItem({ children, onSelect, className, destructive }: { children: ReactNode; onSelect?: () => void; className?: string; destructive?: boolean }) {
  return (
    <DropdownPrimitive.Item
      onSelect={onSelect}
      className={cn(
        "flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-body outline-none transition-colors [&_svg]:size-4 [&_svg]:text-muted-foreground",
        destructive
          ? "text-danger hover:bg-danger-soft data-[highlighted]:bg-danger-soft [&_svg]:text-danger"
          : "text-foreground hover:bg-secondary data-[highlighted]:bg-secondary",
        className,
      )}
    >
      {children}
    </DropdownPrimitive.Item>
  );
}

export function DropdownMenuLabel({ children }: { children: ReactNode }) {
  return <div className="px-3 py-2 text-micro uppercase text-muted-foreground">{children}</div>;
}
export function DropdownMenuSeparator() {
  return <div className="my-1 h-px bg-border" />;
}

// ── Tabs ─────────────────────────────────────────────────────────────────────
export const Tabs = TabsPrimitive.Root;
export function TabsList({ children, className }: { children: ReactNode; className?: string }) {
  return <TabsPrimitive.List className={cn("inline-flex items-center gap-1 rounded-full bg-secondary p-1", className)}>{children}</TabsPrimitive.List>;
}
export function TabsTrigger({ value, children }: { value: string; children: ReactNode }) {
  return (
    <TabsPrimitive.Trigger
      value={value}
      className={cn("rounded-full px-4 py-1.5 text-sm font-medium text-muted-foreground outline-none transition-colors data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm", FOCUS)}
    >
      {children}
    </TabsPrimitive.Trigger>
  );
}
export const TabsContent = TabsPrimitive.Content;

/** Segmented control with a sliding indicator.
 *  The indicator is positioned from the *measured* geometry of the active
 *  segment (a single absolutely-positioned pill), not Framer's `layoutId`
 *  projection. Layout projection re-animates on ANY box change — including when
 *  an ancestor (a drawer, an expanding accordion) grows — which made the pill
 *  visibly fly across the container. Measuring keeps it inside the control, so
 *  it only ever springs between its own segments. */
export function SegmentedControl<T extends string>({ options, value, onChange, className, fill }: { options: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; className?: string; fill?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const el = btnRefs.current[value];
      if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [value, options.length]);

  return (
    <div ref={containerRef} className={cn("relative items-center gap-1 rounded-full bg-secondary p-1", fill ? "flex w-full" : "inline-flex", className)}>
      {pill && (
        <motion.span
          aria-hidden
          className="absolute inset-y-1 rounded-full bg-primary"
          initial={false}
          animate={{ left: pill.left, width: pill.width }}
          transition={SPRING}
        />
      )}
      {options.map((o) => (
        <button
          key={o.value}
          ref={(el) => { btnRefs.current[o.value] = el; }}
          onClick={() => onChange(o.value)}
          className={cn("relative z-10 truncate rounded-full py-1.5 text-sm font-medium outline-none transition-colors", FOCUS, fill ? "flex-1 basis-0 px-2 text-center" : "px-4", value === o.value ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Icon tabs — the answer when a tabbed surface has more segments than a
 * `SegmentedControl` can label (§7 caps that at four).
 *
 * Every tab is its icon; only the ACTIVE one keeps its label, and the label
 * grows in beside it. That is the navbar grammar the bottom tabs already use,
 * so it needs no explaining, and it means six tabs fit a phone at full
 * legibility instead of six truncated to "Prog…", "Repo…", "Man…" — which is
 * what a six-item `fill` segmented control degrades to, and it shipped on the
 * coach's client detail.
 *
 * The `layoutId` is generated per instance: two of these on one screen sharing
 * a projection id makes the pill fly between them.
 *
 * **Give every item a real `label`.** It is the accessible name and the tooltip;
 * an icon alone is not a name.
 */
export function IconTabs<T extends string>({
  items,
  value,
  onChange,
  className,
}: {
  items: readonly { value: T; label: string; icon: LucideIcon }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  const pillId = useId();
  return (
    <div className={cn("relative flex items-center gap-0.5 rounded-full border border-border/50 bg-secondary p-1", className)} role="tablist">
      {items.map((it) => {
        const on = value === it.value;
        const Icon = it.icon;
        return (
          <button
            key={it.value}
            type="button"
            role="tab"
            aria-selected={on}
            aria-label={it.label}
            title={it.label}
            onClick={() => onChange(it.value)}
            className={cn(
              // `flex-1` and a 44px floor: the rail used to pack its items to
              // the left at 34x30, leaving dead width on the right and a target
              // under the accessibility floor (§12). Now every tab is an equal
              // share of the bar and the whole share is tappable.
              "relative z-10 flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full px-2 text-sm font-medium outline-none transition-colors",
              FOCUS,
              on ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {on && <motion.span layoutId={pillId} initial={false} transition={SPRING_SNAP} className="absolute inset-0 rounded-full bg-primary" />}
            <Icon aria-hidden className="relative size-4 shrink-0" strokeWidth={on ? 2.4 : 2} />
            {on && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                transition={{ duration: DUR.base }}
                className="relative overflow-hidden whitespace-nowrap"
              >
                {it.label}
              </motion.span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Select ───────────────────────────────────────────────────────────────────
/**
 * The one dropdown. Not `<select>` — and the difference is not cosmetic.
 *
 * A native `<select>` can hold a `value` that none of its `<option>`s carry, and
 * when it does it renders BLANK or silently shows the first option instead. That
 * is not a styling nit: it is the exact failure mode of a picker whose stored
 * choice has since been withdrawn (a model an operator disabled, a coach who
 * left, a package that was retired). The control shows something plausible, the
 * database still holds the withdrawn value, and nobody is told. This component
 * cannot do that — the trigger renders the placeholder when nothing matches, so
 * a caller with a stale value has to decide what to say about it.
 *
 * It also honours the tokens on iOS, where a native `<select>` ignores nearly
 * every style, and it can carry a two-line item where an `<option>` cannot.
 *
 * `options` may include a `value: ""` entry — Radix 2.3.3 permits it, and it is
 * how "no choice / auto" is spelled. `disabled` on an option keeps a value
 * VISIBLE but unpickable, which is what a withdrawn-but-stored choice needs.
 */
export function Select<T extends string>({ value, onChange, options, placeholder, className, disabled, "aria-label": ariaLabel }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; disabled?: boolean }[]; placeholder?: string; className?: string; disabled?: boolean; "aria-label"?: string }) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={(v) => onChange(v as T)} disabled={disabled}>
      <SelectPrimitive.Trigger
        aria-label={ariaLabel}
        className={cn(
          "inline-flex h-11 w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-input bg-secondary/50 px-3.5 text-sm outline-none transition-colors focus-visible:border-primary/70 data-[placeholder]:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60",
          FOCUS,
          className,
        )}
      >
        {/* The label truncates rather than widening the trigger. A model name
            with its price appended is long, and these sit in right-aligned slots
            that must not push the label beside them off the row. */}
        <span className="min-w-0 truncate text-left"><SelectPrimitive.Value placeholder={placeholder} /></span>
        <SelectPrimitive.Icon>
          <ChevronDown className="size-4 text-muted-foreground" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content position="popper" sideOffset={6} className="z-50 max-h-72 min-w-[--radix-select-trigger-width] overflow-hidden rounded-2xl border border-border/60 bg-popover p-1.5 shadow-lg data-[state=open]:animate-[menu-in_var(--dur-fast)_var(--ease-out)]">
          <SelectPrimitive.Viewport>
            {options.map((o) => (
              <SelectPrimitive.Item
                key={o.value}
                value={o.value}
                disabled={o.disabled}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm outline-none transition-colors data-[highlighted]:bg-secondary data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50"
              >
                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator>
                  <Check className="size-4 text-primary" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

// ── Tooltip ──────────────────────────────────────────────────────────────────
export function Tooltip({ content, children }: { content: ReactNode; children: ReactNode }) {
  return (
    <TooltipPrimitive.Provider delayDuration={200}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content sideOffset={6} className="z-50 rounded-lg bg-foreground px-2.5 py-1.5 text-caption font-medium text-background shadow-md data-[state=delayed-open]:animate-[menu-in_var(--dur-fast)_var(--ease-out)]">
            {content}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

// ── Avatar ───────────────────────────────────────────────────────────────────
/** DiceBear v9 generated avatar URL for a seed (deterministic, no upload). */
export function dicebearUrl(seed: string, style = "toon-head"): string {
  return `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(seed)}&radius=50&backgroundType=gradientLinear`;
}

export function Avatar({ name, src, seed, className }: { name: string; src?: string | null; seed?: string | null; className?: string }) {
  const initials = name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const imageSrc = src || (seed ? dicebearUrl(seed) : null);
  return (
    <AvatarPrimitive.Root className={cn("grid size-10 place-items-center overflow-hidden rounded-full bg-primary/15 text-sm font-semibold text-primary", className)}>
      {imageSrc && <AvatarPrimitive.Image src={imageSrc} className="size-full object-cover" />}
      <AvatarPrimitive.Fallback>{initials}</AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}

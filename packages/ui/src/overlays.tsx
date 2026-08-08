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

/**
 * `title` is a NODE, not a string: a dialog whose heading carries an icon or a
 * status pill beside the words is ordinary, and the alternative is every such
 * caller reaching past this component to build its own heading — which is how
 * a design system ends up with four dialog headers.
 *
 * `srTitle` is for the rare dialog with no visible heading at all (a legal
 * reader, a media picker that is all chrome). Radix requires an accessible
 * name; without one this falls back to the literal word "Dialog", which is a
 * name that tells a screen-reader user nothing.
 */
export function DialogContent({ title, srTitle, children, className, dismissible = true }: {
  title?: ReactNode;
  srTitle?: string;
  children: ReactNode;
  className?: string;
  /**
   * `false` for a dialog that must be ANSWERED, not escaped — the X goes, and
   * so do Escape and the outside click. Hiding only the button is the trap:
   * Radix still closes on both, so the dialog looks unavoidable and is not.
   * Same name and same meaning as `FixedDrawer`'s.
   */
  dismissible?: boolean;
}) {
  const block = (e: Event) => { if (!dismissible) e.preventDefault(); };
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlayCls} />
      <DialogPrimitive.Content
        onEscapeKeyDown={block}
        onPointerDownOutside={block}
        onInteractOutside={block}
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-border/60 bg-popover p-6 shadow-lg outline-none",
          "data-[state=open]:animate-[content-in_var(--dur-base)_var(--ease-out)] data-[state=closed]:animate-[content-out_var(--dur-fast)_var(--ease-out)]",
          className,
        )}
      >
        {title && <DialogPrimitive.Title className="mb-4 pr-10 text-title-3">{title}</DialogPrimitive.Title>}
        {!title && <DialogPrimitive.Title className="sr-only">{srTitle ?? "Dialog"}</DialogPrimitive.Title>}
        {dismissible && (
          <DialogPrimitive.Close aria-label="Close" className={cn("absolute right-4 top-4 grid size-9 place-items-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-secondary hover:text-foreground", FOCUS)}>
            <X className="size-4" />
          </DialogPrimitive.Close>
        )}
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

/**
 * The line under the title that says what the dialog is for.
 *
 * It is Radix's `Description`, not a styled paragraph, so it becomes the
 * dialog's `aria-describedby` and is read out with the title. A hand-rolled
 * `<p className="text-muted-foreground">` looks identical and is silent, which
 * is why every app was writing one.
 *
 * ⚠️ It sits directly under the title, so it carries a NEGATIVE top margin —
 * `DialogContent` already spaces the title away from the body.
 */
export function DialogDescription({ children, className }: { children: ReactNode; className?: string }) {
  return <DialogPrimitive.Description className={cn("-mt-2 mb-4 text-body text-muted-foreground", className)}>{children}</DialogPrimitive.Description>;
}

/**
 * The action row a dialog ends in.
 *
 * Right-aligned on a pointer, FULL-WIDTH AND STACKED below `sm` — a pair of
 * small buttons in the bottom-right corner of a phone dialog is the hardest
 * place on the screen to hit with a thumb, and reversing the order there puts
 * the confirming action on top where the thumb already is.
 */
export function DialogFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end [&>button]:w-full sm:[&>button]:w-auto",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Confirm step for a consequential or destructive action.
 *
 * ── `onConfirm` MAY BE ASYNC, and that is the whole design ───────────────────
 *
 * The dialog closes when the ACTION IS DONE, not when the button is pressed. If
 * `onConfirm` returns a promise this awaits it: the confirm button says it is
 * working, both buttons refuse a second press, and Escape and the outside click
 * are blocked — because a half-finished delete you can dismiss is a delete
 * whose outcome nobody sees. It closes on resolve and STAYS OPEN on reject,
 * with the failure shown in place.
 *
 * A synchronous `onConfirm` closes immediately, exactly as before.
 *
 * This replaces the `busy` prop an app would otherwise have to thread: Scena
 * kept a whole second `ConfirmDialog` for it, which then shadowed this one.
 */
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = "Confirm", cancelLabel = "Cancel", busyLabel = "Working…", destructive, onConfirm }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: ReactNode;
  confirmLabel?: string; cancelLabel?: string; busyLabel?: string; destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-arm on every opening: the same node is reused, so a dialog closed after
  // a failure would otherwise reopen still wearing the previous error.
  useEffect(() => { if (!open) { setBusy(false); setError(null); } }, [open]);

  async function run() {
    setError(null);
    let result: void | Promise<void>;
    try {
      result = onConfirm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn’t work.");
      return;
    }
    if (!(result instanceof Promise)) { onOpenChange(false); return; }
    setBusy(true);
    try {
      await result;
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn’t work.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent title={title} dismissible={!busy}>
        {description && <p className="text-body leading-relaxed text-muted-foreground">{description}</p>}
        {error && <p role="alert" className="mt-3 text-caption text-danger">{error}</p>}
        <div className="mt-5 flex gap-3">
          <Button variant="ghost" className="flex-1" disabled={busy} onClick={() => onOpenChange(false)}>{cancelLabel}</Button>
          <Button variant={destructive ? "destructive" : "default"} className="flex-1" disabled={busy} onClick={() => void run()}>
            {busy ? busyLabel : confirmLabel}
          </Button>
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

/**
 * `side` for the same reason `Tooltip` has one: a menu triggered from a footer
 * pinned to the bottom of a left-hand rail has nowhere to open downward, and
 * Radix's collision handling flips it into a position nothing was designed at.
 * Naming the side is the caller saying where the rail is.
 */
export function DropdownMenuContent({ children, align = "end", side, className }: { children: ReactNode; align?: "start" | "end" | "center"; side?: "top" | "right" | "bottom" | "left"; className?: string }) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content
        align={align}
        side={side}
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

/**
 * ⚠️ `onSelect`, not `onClick`. Radix forwards DOM props, so an `onClick` here
 * compiles, renders, and works with a mouse — and does nothing on Enter or
 * Space, because keyboard activation of a menu item is not a click. The two
 * look identical in review and differ only for people not using a pointer.
 *
 * `disabled` is the honest form of an action that exists but is not available
 * right now: removing the row instead makes the menu change length between
 * openings, so nobody learns where anything is.
 */
export function DropdownMenuItem({ children, onSelect, className, destructive, disabled }: { children: ReactNode; onSelect?: () => void; className?: string; destructive?: boolean; disabled?: boolean }) {
  return (
    <DropdownPrimitive.Item
      onSelect={onSelect}
      disabled={disabled}
      className={cn(
        "flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-body outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-45 [&_svg]:size-4 [&_svg]:text-muted-foreground",
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
/**
 * `disabled` is not decoration: a tab whose content does not exist yet has to
 * be reachable-but-refused rather than absent, or the row of tabs changes width
 * as data loads. `className` is the same escape hatch `TabsList` already takes —
 * without it a caller cannot make tabs share the width evenly, which is the one
 * layout decision only the caller knows.
 */
export function TabsTrigger({ value, children, className, disabled }: { value: string; children: ReactNode; className?: string; disabled?: boolean }) {
  return (
    <TabsPrimitive.Trigger
      value={value}
      disabled={disabled}
      className={cn(
        "rounded-full px-4 py-1.5 text-caption font-medium text-muted-foreground outline-none transition-colors data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm disabled:pointer-events-none disabled:opacity-45",
        FOCUS,
        className,
      )}
    >
      {children}
    </TabsPrimitive.Trigger>
  );
}
export const TabsContent = TabsPrimitive.Content;

/**
 * Segmented control with a sliding indicator.
 *
 * The indicator is positioned from the *measured* geometry of the active
 * segment (a single absolutely-positioned pill), not Framer's `layoutId`
 * projection. Layout projection re-animates on ANY box change — including when
 * an ancestor (a drawer, an expanding accordion) grows — which made the pill
 * visibly fly across the container. Measuring keeps it inside the control, so
 * it only ever springs between its own segments.
 *
 * ── One physical standard for every segmented thing ─────────────────────────
 *
 * This and `IconTabs` are the same object at two label densities, and they had
 * drifted into two different controls: the icon rail was 44px tall inside a
 * real border with equal-share segments, and this one was 30px tall in a
 * borderless fill with segments sized by their text. Two of them on one screen
 * — which is exactly what a tabbed surface with a filter on it looks like —
 * read as two unrelated widgets.
 *
 * So the geometry moved here: `min-h-11` (the §12 floor, and the same height as
 * the icon rail), the same `border-border/50` hairline so a studio that set
 * `--border-width: 0` gets none and one that set 2 gets two, and the same
 * spring. Nothing at any call site had to change; every segmented control in
 * every app grew to the floor at once.
 */
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
    <div
      ref={containerRef}
      role="tablist"
      className={cn("relative items-center gap-0.5 rounded-full border border-border/50 bg-secondary p-1", fill ? "flex w-full" : "inline-flex", className)}
    >
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
          type="button"
          role="tab"
          aria-selected={value === o.value}
          ref={(el) => { btnRefs.current[o.value] = el; }}
          onClick={() => onChange(o.value)}
          className={cn(
            "relative z-10 flex min-h-11 items-center justify-center truncate rounded-full text-caption font-medium outline-none transition-colors",
            FOCUS,
            fill ? "flex-1 basis-0 px-2 text-center" : "px-4",
            value === o.value ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
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
              "relative z-10 flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full px-2 text-caption font-medium outline-none transition-colors",
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
/**
 * A select is a LIST, so it takes one — not eight components you assemble.
 *
 * `label` is a `ReactNode` because the selected value is rendered through
 * Radix's `ItemText`, which carries whatever the item held: an option with a
 * flag, a swatch, or a capitalised span is ordinary, and the alternative is
 * every such caller dropping back to the primitive.
 *
 * `size="sm"` is the dense form for a toolbar or a table row, where the 44px
 * default control is taller than the row it sits in. `id` so a `<Label htmlFor>`
 * can point at it — without one, a labelled select in a form has no label.
 */
export function Select<T extends string>({ value, onChange, options, placeholder, className, disabled, id, size = "default", title, "aria-label": ariaLabel }: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; disabled?: boolean }[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  size?: "default" | "sm";
  /** Native tooltip for a trigger whose label is truncated. */
  title?: string;
  "aria-label"?: string;
}) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={(v) => onChange(v as T)} disabled={disabled}>
      <SelectPrimitive.Trigger
        id={id}
        title={title}
        aria-label={ariaLabel}
        className={cn(
          "inline-flex w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-input bg-secondary/50 outline-none transition-colors focus-visible:border-primary/70 data-[placeholder]:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60",
          size === "sm" ? "h-9 px-3 text-caption" : "h-11 px-3.5 text-body",
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
                className="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-body outline-none transition-colors data-[highlighted]:bg-secondary data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50"
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
/**
 * `side` matters on a rail. The default is `top`, which is right for a button
 * in a row and wrong for an icon in a left-hand navigation rail — the label
 * opens over the rail itself and covers the item above the one being pointed
 * at. `delay` is here for the same reason: a rail whose every icon needs its
 * label wants them instantly, while a tooltip that merely elaborates should
 * wait so it does not flicker past on the way to something else.
 */
export function Tooltip({ content, children, side = "top", delay = 200 }: {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  delay?: number;
}) {
  return (
    <TooltipPrimitive.Provider delayDuration={delay}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content side={side} sideOffset={6} className="z-50 rounded-lg bg-foreground px-2.5 py-1.5 text-caption font-medium text-background shadow-md data-[state=delayed-open]:animate-[menu-in_var(--dur-fast)_var(--ease-out)]">
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
  /*
    A BLANK DISC IS NOT A FALLBACK.

    `name.split(" ").map((w) => w[0])` returns `[undefined]` for an empty string
    and `["", ""]` for a name with a double space, so the fallback rendered
    NOTHING — a flat coloured circle that reads as a broken image rather than as
    a person. It shipped that way on Tessa's settings and app bar, because the
    caller wrote `user.name ?? user.email` and `??` does not fall through for
    `""`, which is exactly what a server sends for a person who never set one.

    Fixing it at the call site fixes one call site. The component is handed a
    string and can see that the string yields no letters, so it is the component
    that has to refuse to draw an empty circle: empty words are dropped, and
    anything with no usable glyph at all falls back to `?` — which is at least a
    legible statement that the name is unknown.
  */
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .filter((ch): ch is string => Boolean(ch))
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";
  const imageSrc = src || (seed ? dicebearUrl(seed) : null);
  return (
    <AvatarPrimitive.Root className={cn("grid size-10 place-items-center overflow-hidden rounded-full bg-primary/15 text-caption font-semibold text-primary", className)}>
      {imageSrc && <AvatarPrimitive.Image src={imageSrc} className="size-full object-cover" />}
      <AvatarPrimitive.Fallback>{initials}</AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}

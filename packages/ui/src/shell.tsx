/**
 * App shell — AppBar, BottomTabs / NavRail (animated indicator), TimelineFeed /
 * InsightCard, WavyDivider, SettingsList, EmptyState. Icon-based, animated.
 */

import { motion } from "motion/react";
import { chromeIn , SPRING_SNAP, DUR} from "./lib/animation.js";
import { EASE_OUT, settle } from "./lib/animation.js";
import { Group, Row } from "./layout.js";
import type { ReactNode } from "react";
import { cn } from "./lib/utils.js";
import { toneVar, type Tone } from "./primitives.js";
import { ChevronRight, ThumbsDown, ThumbsUp, type LucideIcon } from "./lib/icons.js";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import * as DialogPrimitive from "@radix-ui/react-dialog";

export interface TabDef {
  key: string;
  label: string;
  icon: LucideIcon;
  /** Domain token for the active-tab tint (when the tinted nav is enabled). */
  tone?: Tone;
}

const pillTween = { backgroundColor: { type: "tween" as const, duration: DUR.slow, ease: "easeOut" as const } };
/** The active tab's tint colour — its domain token when tinting is on, else the brand accent. */
const activeColor = (tabs: TabDef[], active: string, tinted?: boolean): string => {
  const tone = tabs.find((t) => t.key === active)?.tone;
  // `!` because the tone maps are TOTAL for any string key (see `toneMap` in
  // primitives.tsx) — `noUncheckedIndexedAccess` cannot know that now that a
  // tone may be any accent name the app registered.
  return tinted && tone ? toneVar[tone]! : "var(--primary)";
};

export function AppBar({ leading, title, trailing, bare, scrolled }: { leading?: ReactNode; title?: ReactNode; trailing?: ReactNode; bare?: boolean; scrolled?: boolean }) {
  // `bare` drops the tint, border AND blur so an ambient page wash bleeds all the
  // way up behind the bar, crisp — no frosted-glass compositing lag on load.
  // Once you scroll off the top (`scrolled`), the brand + actions grow their own
  // glass pills so they stay legible over the content passing beneath the bar.
  const showPills = bare && scrolled;
  // Keep ONLY the rounding constant so the fill fades as a pill (not a briefly
  // square box), while the border, bg and blur stay scroll-only — an always-on
  // border box renders a faint ring at the top, so it must not exist at rest.
  const cluster = bare
    ? cn("flex items-center rounded-full px-3 py-1.5 transition-colors duration-300", showPills && "border border-border/40 bg-background/60 backdrop-blur-md")
    : "flex items-center";
  return (
    // `--app-bar-h` rather than the literal, so a shell can set `--chrome-top`
    // from the bar's height instead of re-typing it (tokens.css).
    <motion.header initial="hidden" animate="show" variants={chromeIn} className={cn("sticky top-0 z-30 flex h-[var(--app-bar-h)] items-center justify-between gap-3 px-4 pt-[env(safe-area-inset-top)]", !bare && "border-b border-border/40 bg-background/80 backdrop-blur-xl")}>
      <div className={cn(cluster, "min-w-0 gap-2")}>{leading}</div>
      {title && <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-body-lg">{title}</div>}
      <div className={cn(cluster, "gap-1.5")}>{trailing}</div>
    </motion.header>
  );
}

/** The nav pill. `SPRING_SNAP` — it is the most-pressed indicator in the app. */
const navSpring = SPRING_SNAP;

export function BottomTabs({ tabs, active, onSelect, tinted }: { tabs: TabDef[]; active: string; onSelect: (k: string) => void; tinted?: boolean }) {
  const color = activeColor(tabs, active, tinted);
  // When the pill is tinted to a domain tone, its text needs THAT TONE's on-tone
  // foreground; otherwise the pill is the brand primary and takes the brand
  // foreground. Per tone rather than the one shared `--tone-foreground`, which
  // is only right while every accent in a mode sits at a similar lightness —
  // false as soon as a studio's brand derives them. The shared token stays as
  // the var fallback, for a tone an app registered without one.
  const activeTone = tabs.find((t) => t.key === active)?.tone;
  const onFg = tinted && activeTone && activeTone !== "primary"
    ? `var(--${activeTone}-foreground, var(--tone-foreground))`
    : "var(--primary-foreground)";
  return (
    <motion.nav aria-label="Sections" initial="hidden" animate="show" variants={chromeIn} className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+0.7rem)] md:hidden">
      <div className="pointer-events-auto flex max-w-full items-center gap-0.5 rounded-full border border-border/60 bg-card/75 p-1.5 shadow-lg backdrop-blur-2xl">
        {tabs.map((t) => {
          const on = active === t.key;
          return (
            <button
              key={t.key}
              onClick={() => onSelect(t.key)}
              aria-label={t.label}
              aria-current={on ? "page" : undefined}
              style={on ? { color: onFg } : undefined}
              className={cn(
                "relative flex items-center gap-1.5 rounded-full px-3 py-2.5 transition-colors duration-200",
                on ? "" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {on && <motion.span layoutId="tab-pill" initial={false} animate={{ backgroundColor: color }} transition={{ ...navSpring, ...pillTween }} className="absolute inset-0 rounded-full" />}
              <t.icon className="relative size-[1.25rem]" strokeWidth={on ? 2.4 : 2} />
              {on && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: "auto" }}
                  transition={{ duration: DUR.base }}
                  className="relative overflow-hidden whitespace-nowrap text-caption font-semibold"
                >
                  {t.label}
                </motion.span>
              )}
            </button>
          );
        })}
      </div>
    </motion.nav>
  );
}

export function NavRail({ tabs, active, onSelect, footer, brand, brandPlate, tinted }: {
  tabs: TabDef[];
  active: string;
  onSelect: (k: string) => void;
  footer?: ReactNode;
  brand?: ReactNode;
  /**
   * The plate behind `brand`, from `markPlateClass(branding)`.
   *
   * The rail cannot work this out for itself — it is handed a `ReactNode`, not a
   * branding — and it must not assume: a studio whose generated mark already
   * carries its own plate gets a second one painted behind it here, which is
   * exactly what the boot splash used to do. Omitted falls back to the solid
   * accent, which is the generator's own default.
   */
  brandPlate?: string;
  tinted?: boolean;
}) {
  const color = activeColor(tabs, active, tinted);
  const soft = `color-mix(in oklch, ${color} 14%, transparent)`;
  return (
    /*
      A GRADIENT, NOT A FLAT WASH. `bg-card/40` over the page's atmosphere read
      as "a slightly different dark" — the rail had no material of its own, so it
      looked like a region of the page rather than a frame around it. A vertical
      fade plus a hairline highlight down its inner edge is the cheapest honest
      depth cue there is: it says "this is in front" without a shadow, which
      would cast onto content that scrolls beneath it.
    */
    <motion.nav
      initial="hidden"
      animate="show"
      variants={chromeIn}
      aria-label="Sections"
      className="fixed inset-y-0 left-0 z-30 hidden w-24 flex-col items-center border-r border-border/40 bg-gradient-to-b from-card/70 via-card/45 to-card/60 py-5 backdrop-blur-xl after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-gradient-to-b after:from-transparent after:via-foreground/8 after:to-transparent md:flex"
    >
      {/* No letter fallback. This shipped as a hardcoded "M" — a leftover from
          the old product name, which on any other app consuming this package
          would render a stranger's initial. An absent brand renders an empty
          mark, which is honest. */}
      {brand !== undefined && (
        <div className={cn("grid size-11 shrink-0 place-items-center overflow-hidden rounded-2xl text-title-3 font-bold", brandPlate ?? "bg-primary text-primary-foreground")}>{brand}</div>
      )}
      {/*
        A HAIRLINE UNDER THE BRAND, and the items directly beneath it.

        Centring them was tried first and is worse: it balances the void above
        and below the list, but it strands the mark alone at the top of a
        hundred-pixel gap, which reads as a header that lost its content. A rail
        whose lower half is empty is the normal shape — every desk app has one —
        and the rule is only that nothing should look ABANDONED. The rule the
        separator carries: the mark is the app, the items are the app's places,
        and a line is the cheapest way to say they are two different things.
      */}
      <div className="my-4 h-px w-10 shrink-0 bg-border/60" aria-hidden />
      <div className="flex w-full flex-1 flex-col items-center gap-1 px-2.5">
        {tabs.map((t) => {
          const on = active === t.key;
          return (
            <button
              key={t.key}
              onClick={() => onSelect(t.key)}
              aria-current={on ? "page" : undefined}
              className="group relative flex w-full flex-col items-center gap-1.5 rounded-2xl py-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              {/* The edge marker, flush to the rail's own border. `layoutId` so
                  it TRAVELS between destinations rather than blinking off and
                  on — the one motion in this component that carries meaning:
                  where you were, and where you now are. */}
              {on && <motion.span layoutId="rail-bar" initial={false} animate={{ backgroundColor: color }} transition={{ ...navSpring, ...pillTween }} className="absolute -left-2.5 top-1/2 h-8 w-[3px] -translate-y-1/2 rounded-r-full" />}
              {/*
                THE ICON SITS IN A CONTAINER, which is this language's own idiom
                for "what this row is about" — `Row`'s leading squircle, the
                section menu's tinted tiles. The active state was a 14% wash
                across the WHOLE item, which at rail width is a faint rectangle
                you have to look for. A tinted tile around the glyph reads at a
                glance, and it is the same shape the rest of the system uses.
              */}
              <span
                className={cn(
                  "relative grid size-11 place-items-center rounded-2xl transition-colors",
                  !on && "group-hover:bg-foreground/6",
                )}
              >
                {on && <motion.span layoutId="rail-pill" initial={false} animate={{ backgroundColor: soft }} transition={{ ...navSpring, ...pillTween }} className="absolute inset-0 rounded-2xl" />}
                <t.icon
                  style={on ? { color } : undefined}
                  className={cn("relative size-[1.3rem] transition-colors", !on && "text-muted-foreground group-hover:text-foreground")}
                  strokeWidth={on ? 2.4 : 2}
                />
              </span>
              {/*
                `caption` (13), not `micro` (11).

                §12's floor is 13px — "`caption` is the floor; there is nothing
                below it" — and §5 defines `micro` as an OVERLINE or a badge, in
                all caps. This label was `text-micro normal-case`: two sizes
                below the floor, in a role that is not its own, with the role's
                defining property explicitly cancelled. `BottomTabs` has used
                `caption` all along, so the platform's two navigation surfaces
                disagreed about how big their own labels are.
              */}
              <span
                style={on ? { color } : undefined}
                className={cn("relative text-caption leading-none transition-colors", on ? "font-semibold" : "font-medium text-muted-foreground group-hover:text-foreground")}
              >
                {t.label}
              </span>
            </button>
          );
        })}
      </div>
      {footer && <div className="shrink-0 pt-2">{footer}</div>}
    </motion.nav>
  );
}

// ── Timeline feed ────────────────────────────────────────────────────────────
/**
 * `aiGlyph` is the caller's to supply — the design system has no AI mark of its
 * own. It used to default to a Sparkles icon, which is exactly the generic
 * shrug this app is trying not to make: the studio HAS an AI identity (an
 * avatar and a name it chose in Branding), and that is what belongs here. A
 * caller that passes nothing gets nothing, which is honest.
 */
export function InsightCard({ timestamp, title, aiGlyph, tone, children, onFeedback }: { timestamp: string; title: string; aiGlyph?: ReactNode; tone?: "default" | "primary"; children?: ReactNode; onFeedback?: (v: 1 | -1) => void }) {
  return (
    // `whileInView` + `viewport={{ once: true }}` rather than the spine's
    // variants, deliberately: a timeline is unbounded, so items animate as they
    // are scrolled to rather than all at once on mount. The VALUES still come
    // from the shared set (§8) — it was the one component in the package writing
    // its own duration and travel, at 10px/400ms against everything else's
    // 8px/220ms, which read as a heavier arrival than the rows beside it.
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: DUR.base, ease: EASE_OUT }}
      className="py-3"
    >
      <div className="flex items-center gap-2 text-caption text-muted-foreground">
        {aiGlyph}
        <span>{timestamp}</span>
      </div>
      <h3 className="mt-1 text-title-3">{title}</h3>
      {children && <div className="mt-3">{children}</div>}
      {onFeedback && (
        <div className="mt-3 flex items-center gap-1">
          <button onClick={() => onFeedback(1)} className="grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-success" aria-label="Helpful">
            <ThumbsUp className="size-4" />
          </button>
          <button onClick={() => onFeedback(-1)} className="grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-danger" aria-label="Not helpful">
            <ThumbsDown className="size-4" />
          </button>
        </div>
      )}
    </motion.article>
  );
}

export function WavyDivider({ label }: { label: string }) {
  const wave = (
    <svg viewBox="0 0 120 8" className="h-2 w-full text-border" preserveAspectRatio="none" aria-hidden>
      <path d="M0 4 Q 7.5 0, 15 4 T 30 4 T 45 4 T 60 4 T 75 4 T 90 4 T 105 4 T 120 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
  return (
    <div className="my-6 flex items-center gap-4">
      <div className="flex-1">{wave}</div>
      <span className="shrink-0 text-micro uppercase text-muted-foreground">{label}</span>
      <div className="flex-1">{wave}</div>
    </div>
  );
}

// ── Settings list ────────────────────────────────────────────────────────────
export interface SettingsRow {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  trailing?: ReactNode;
  destructive?: boolean;
}
/**
 * A settings surface: sections of rows.
 *
 * Rebuilt on `Group`/`Row` rather than re-implementing them (UI-LANGUAGE §7), so
 * a settings row and a roster row are the same object — same heights, same inset
 * hairline, same press feedback, same squircle icon container. They had drifted:
 * this list used a 14px hairline inset and a full-bleed divider while every other
 * list in the product inset to the text origin.
 *
 * Settings surfaces are deliberately NOT anchored (§1). A settings screen is a
 * list, not a screen about a number, and a display numeral on one would be
 * decoration pretending to be hierarchy.
 */
export function SettingsList({ sections }: { sections: { header: string; rows: SettingsRow[] }[] }) {
  return (
    <div className="space-y-7">
      {sections.map((s) => (
        <section key={s.header}>
          <h3 className="mb-2 px-1 text-micro uppercase text-muted-foreground">{s.header}</h3>
          <Group>
            {s.rows.map((r) => (
              <Row
                key={r.label}
                icon={r.icon}
                onClick={r.onClick}
                trailing={r.trailing}
                tone={r.destructive ? "danger" : "default"}
              >
                {r.label}
              </Row>
            ))}
          </Group>
        </section>
      ))}
    </div>
  );
}

// ── Empty state ──────────────────────────────────────────────────────────────
/**
 * A surface with nothing in it yet: one line of why, one action (§7).
 *
 * The dashed border is gone. A dashed outline is the visual language of "drop
 * something here" or "this is a placeholder that will be replaced" — neither is
 * true of an empty list, and on a dark canvas it drew a rectangle round the
 * emptiness rather than letting it be empty. Space says "nothing here" better
 * than a box does (§0 rule 4).
 *
 * Settles down like everything else (§8); it used to rise 8px with no scale,
 * which was the one entrance in the product that matched nothing around it.
 */
/**
 * `art` is the FIRST-RUN slot: a mascot, an illustration, a photograph — the
 * product's voice at the one moment there is nothing else on the screen.
 *
 * It is a slot rather than product vocabulary, which is why it belongs here.
 * Scena kept a whole wrapper component solely to branch between "medallion with
 * an icon" and "mascot", and that wrapper shadowed this component's name — so
 * an app had two `EmptyState`s and the diverging one won by import order.
 *
 * ⚠️ `art` replaces the medallion entirely and is drawn at its own size, so it
 * is for FIRST RUN ("create your first channel"), not for every empty list. An
 * illustration on every zero-state is an illustration nobody sees.
 */
export function EmptyState({ icon: Icon, art, title, description, action, className }: {
  icon?: LucideIcon;
  art?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <motion.div variants={settle} initial="hidden" animate="show" className={cn("flex flex-col items-center px-6 py-14 text-center", className)}>
      {art ?? (
        <div className="grid size-14 place-items-center rounded-xl bg-surface-2 text-muted-foreground [&_svg]:size-6">
          {/* An empty with neither art nor icon would leave the headline
              floating mid-panel, so the medallion is drawn either way. */}
          {Icon ? <Icon aria-hidden /> : null}
        </div>
      )}
      <h3 className="mt-4 text-title-3">{title}</h3>
      {description && <p className="mt-1.5 max-w-xs text-body text-muted-foreground">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </motion.div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Chrome for a WIDE navigation, and the two pieces it needs.

   `NavRail` above is the 96px icon rail: right for a product with under a dozen
   destinations that a person recognises by glyph. An operator tool with
   fourteen destinations in five named groups cannot use it — the labels ARE the
   navigation there, and dropping them would trade recognition for a row of
   ambiguous icons.

   So the language gains a second nav shape rather than one product growing its
   own. Both are built from the same tokens, the same type scale and the same
   chrome rules (§0.3: chrome recedes), which is what makes them one system —
   not that every product navigates identically.
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * A scrolling region that does not put a scrollbar in the design.
 *
 * The platform scrollbar is chrome at its loudest — it changes width between
 * operating systems, it paints over content, and it appears and disappears
 * under the pointer. This is Radix's overlay scrollbar: it sits above the
 * content, it is the same everywhere, and it fades when nothing is moving.
 *
 * `mask` fades the top and bottom edges so content that continues past the
 * fold reads as continuing, rather than as ending in a hard cut.
 */
export function ScrollArea({
  children,
  className,
  viewportClassName,
  mask,
  label,
}: {
  children: ReactNode;
  className?: string;
  viewportClassName?: string;
  /** Fade the scroll edges. Off by default — it costs a mask layer. */
  mask?: boolean;
  /**
   * Names the scrollable area for assistive tech, as a landmark.
   *
   * It has to land on the VIEWPORT and it has to bring a role: the viewport is
   * the focusable scroller, and `aria-label` on a `div` with no role is ignored
   * outright. `Shape` labelled its panes before this existed and the labels
   * were decorative — present in the source, absent from the tree.
   */
  label?: string;
}) {
  return (
    <ScrollAreaPrimitive.Root className={cn("relative overflow-hidden", className)}>
      <ScrollAreaPrimitive.Viewport
        role={label ? "region" : undefined}
        aria-label={label}
        className={cn(
          "size-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          /*
            RADIX WRAPS THE CHILDREN IN `display: table`, and it has to be
            undone. That wrapper is how the primitive lets content exceed the
            viewport horizontally — which also means nothing inside can ever be
            NARROWER than its content, so `truncate`, `min-w-0` and `flex-1`
            all stop working.

            It shows up as a layout that looks fine until the data is real: the
            first two-pane roster ran every client's email straight off the
            right edge and pushed the search field's two buttons out of the
            pane entirely, while the same rows truncated correctly one route
            away. Every `ScrollArea` here scrolls vertically, so the wrapper
            buys nothing and costs that.
          */
          "[&>div]:block!",
          // A fade distance, not a design token — there is no spacing variable
          // to resolve here, and naming a non-existent one silently voids the
          // whole mask-image rather than failing.
          mask && "[mask-image:linear-gradient(to_bottom,transparent,black_1.5rem,black_calc(100%-1.5rem),transparent)]",
          viewportClassName,
        )}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollAreaPrimitive.Scrollbar
        orientation="vertical"
        className="flex w-2 touch-none select-none p-0.5 transition-opacity duration-200 data-[state=hidden]:opacity-0"
      >
        <ScrollAreaPrimitive.Thumb className="flex-1 rounded-full bg-foreground/15" />
      </ScrollAreaPrimitive.Scrollbar>
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}

export interface Crumb {
  label: string;
  /** Absent = this is where you are. The last crumb is never a link (§10). */
  to?: string;
}

/**
 * Where you are, and the way back.
 *
 * ⚠️ It is CHROME (T4), so it is quiet: caption type, muted, and the trail is
 * thinner than the place. The current page is the only crumb at full contrast
 * and it is not interactive — a link to the page you are on is a control that
 * does nothing, which §7 counts as a lie.
 *
 * It never renders a single crumb: a trail with no journey in it is decoration.
 */
export function Breadcrumbs({ crumbs, onNavigate, className }: {
  crumbs: Crumb[];
  onNavigate?: (to: string) => void;
  className?: string;
}) {
  if (crumbs.length < 2) return null;
  return (
    <nav aria-label="Breadcrumb" className={cn("min-w-0", className)}>
      <ol className="flex flex-nowrap items-center gap-1.5 text-caption text-muted-foreground">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={`${c.label}-${i}`} className="flex min-w-0 items-center gap-1.5">
              {i > 0 && <ChevronRight aria-hidden className="size-3.5 shrink-0 opacity-50" />}
              {last || !c.to ? (
                // `aria-current` belongs to the page you are ON. A middle crumb
                // with no `to` is unreachable, not current — announcing it as
                // the current page would put two "current"s in one trail.
                <span aria-current={last ? "page" : undefined} className={cn("truncate", last && "text-foreground")}>
                  {c.label}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onNavigate?.(c.to!)}
                  className="truncate rounded-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  {c.label}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * The off-canvas navigation panel — a rail's mobile form.
 *
 * A dashboard app with a sidebar needs one, and the sidebar is not a thing you
 * can shrink to a phone: it is a list of destinations, and at 375px a list of
 * destinations is the whole screen or it is nothing. So it slides in over the
 * content, from the edge the sidebar lives on, and dismisses on any choice.
 *
 * ⚠️ Not `Sheet`. That is a bottom drawer with a drag handle, built for a form
 * or a picker you pull up and push back down. Navigation comes from the SIDE,
 * because that is where the thing it replaces is, and because a nav panel is
 * full-height by nature — a bottom sheet that covers 86% of the screen and
 * cannot cover the rest is a worse version of the same panel.
 *
 * The children are the same sidebar body the desktop renders. That is the
 * point: one navigation, drawn twice, never two lists that drift.
 */
export function NavDrawer({ open, onClose, side = "left", label = "Navigation", children }: {
  open: boolean;
  onClose: () => void;
  side?: "left" | "right";
  /** The panel's accessible name. It has no visible heading by design. */
  label?: string;
  children: ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay /* design-tokens-exempt: a modal scrim is black in both modes — it darkens what is behind it, so it cannot be a surface token. Same value as `overlayCls`. */
          className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px] data-[state=open]:animate-[overlay-in_var(--dur-fast)_var(--ease-out)] data-[state=closed]:animate-[overlay-out_var(--dur-fast)_var(--ease-out)]" />
        <DialogPrimitive.Content
          className={cn(
            "fixed inset-y-0 z-50 flex w-[17rem] max-w-[85vw] flex-col border-border/60 bg-sidebar text-sidebar-foreground outline-none",
            side === "left"
              ? "left-0 border-r data-[state=open]:animate-[nav-in-left_var(--dur-base)_var(--ease-out)] data-[state=closed]:animate-[nav-out-left_var(--dur-fast)_var(--ease-out)]"
              : "right-0 border-l data-[state=open]:animate-[nav-in-right_var(--dur-base)_var(--ease-out)] data-[state=closed]:animate-[nav-out-right_var(--dur-fast)_var(--ease-out)]",
          )}
        >
          {/* No visible heading: the panel IS the navigation, and a "Navigation"
              title above a list of destinations is a label for a label. Radix
              still requires an accessible name. */}
          <DialogPrimitive.Title className="sr-only">{label}</DialogPrimitive.Title>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

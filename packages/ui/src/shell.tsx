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
    <header className={cn("sticky top-0 z-30 flex h-[calc(4rem+env(safe-area-inset-top))] items-center justify-between gap-3 px-4 pt-[env(safe-area-inset-top)]", !bare && "border-b border-border/40 bg-background/80 backdrop-blur-xl")}>
      <div className={cn(cluster, "min-w-0 gap-2")}>{leading}</div>
      {title && <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-body-lg">{title}</div>}
      <div className={cn(cluster, "gap-1.5")}>{trailing}</div>
    </header>
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
    <motion.nav initial="hidden" animate="show" variants={chromeIn} className="fixed inset-y-0 left-0 z-30 hidden w-24 flex-col items-center border-r border-border/40 bg-card/40 py-6 backdrop-blur-xl md:flex">
      {/* No letter fallback. This shipped as a hardcoded "M" — a leftover from
          the old product name, which on any other app consuming this package
          would render a stranger's initial. An absent brand renders an empty
          mark, which is honest. */}
      {brand !== undefined && (
        <div className={cn("mb-6 grid size-11 place-items-center overflow-hidden rounded-2xl text-title-3 font-black", brandPlate ?? "bg-primary text-primary-foreground")}>{brand}</div>
      )}
      <div className="flex w-full flex-1 flex-col items-center gap-1.5 px-3">
        {tabs.map((t) => {
          const on = active === t.key;
          return (
            <button
              key={t.key}
              onClick={() => onSelect(t.key)}
              aria-current={on ? "page" : undefined}
              className="group relative flex w-full flex-col items-center gap-1 rounded-2xl py-2.5 transition-colors"
            >
              {on && <motion.span layoutId="rail-pill" initial={false} animate={{ backgroundColor: soft }} transition={{ ...navSpring, ...pillTween }} className="absolute inset-0 rounded-2xl" />}
              {on && <motion.span layoutId="rail-bar" initial={false} animate={{ backgroundColor: color }} transition={{ ...navSpring, ...pillTween }} className="absolute -left-3 top-1/2 h-7 w-1 -translate-y-1/2 rounded-r-full" />}
              <t.icon
                style={on ? { color } : undefined}
                className={cn("relative size-[1.35rem] transition-colors", !on && "text-muted-foreground group-hover:text-foreground")}
                strokeWidth={on ? 2.4 : 2}
              />
              <span style={on ? { color } : undefined} className={cn("relative text-micro normal-case transition-colors", !on && "text-muted-foreground group-hover:text-foreground")}>{t.label}</span>
            </button>
          );
        })}
      </div>
      {footer && <div className="mt-auto">{footer}</div>}
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
export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description?: string; action?: ReactNode }) {
  return (
    <motion.div variants={settle} initial="hidden" animate="show" className="flex flex-col items-center px-6 py-14 text-center">
      <div className="grid size-14 place-items-center rounded-xl bg-surface-2 text-muted-foreground [&_svg]:size-6">
        <Icon aria-hidden />
      </div>
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
}: {
  children: ReactNode;
  className?: string;
  viewportClassName?: string;
  /** Fade the scroll edges. Off by default — it costs a mask layer. */
  mask?: boolean;
}) {
  return (
    <ScrollAreaPrimitive.Root className={cn("relative overflow-hidden", className)}>
      <ScrollAreaPrimitive.Viewport
        className={cn(
          "size-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
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

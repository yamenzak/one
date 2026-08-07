/**
 * THE HEADER IS THE SWITCHER.
 *
 * A detail screen about ONE thing, cut into more sections than a segmented
 * control can label. The shape everything reaches for first is a tab rail, and
 * past four sections it stops working on a phone in three ways at once:
 *
 *   TAP TARGETS SHRINK.  Six cells across 412px is 68px each, and once padding
 *                        is off it, a 34×30 hit area. The floor is 44 (§12).
 *   LABELS GO.           They do not fit, so the rail becomes icons — six
 *                        glyphs with no words, which is a guessing game the
 *                        first ten times and a memory test after that.
 *   IT COSTS A ROW.      The identity of the thing needs a line, the rail needs
 *                        another, and both are sticky. On a phone that is a
 *                        fifth of the viewport spent on chrome before any
 *                        content.
 *
 * So the sections move INTO the header. The bar shows what you are looking at
 * (the leading mark and the title) and where you are in it (the current
 * section, with its icon), and tapping it opens the full list — every section
 * with a real label, a tone, and room for a line saying what is inside.
 *
 * ── The cost, stated ────────────────────────────────────────────────────────
 *
 * Switching is two taps rather than one. That is the trade and it is worth it
 * at this size: the second tap buys a readable label on every option, a 56px
 * target instead of a 30px one, a whole row of the screen back, and room for
 * an eighth section without a redesign. Below five sections it is NOT worth it
 * — use `IconTabs`, which keeps one-tap switching and still labels the active
 * one.
 *
 * The subtitle line is the current SECTION rather than a fixed caption. The
 * screen this came from wrote "COACH VIEW" there, under a header only a coach
 * can reach — a line that was true, permanent, and told nobody anything. A
 * header's second line should be the one thing on it that changes.
 */

import { useState, type ReactNode } from "react";
import { ChevronDown, Check, type LucideIcon } from "./lib/icons.js";
import { Sheet } from "./overlays.js";
import { Group, Row } from "./layout.js";
import { toneVar, type Tone } from "./primitives.js";
import { cn } from "./lib/utils.js";

export interface SectionDef<T extends string> {
  value: T;
  label: string;
  icon: LucideIcon;
  /** Colours the icon in the menu. Keeps a section recognisable by colour as
   *  well as by name — the same trick the settings index uses (§7). */
  tone?: Tone;
  /** One short line: what is in this section. Optional, and worth writing. */
  hint?: string;
}

export interface SectionSwitcherProps<T extends string> {
  sections: readonly SectionDef<T>[];
  value: T;
  onChange: (v: T) => void;
  /** What the screen is ABOUT — the person, the item, the account. */
  title: string;
  /** An avatar, a logo, a colour swatch. */
  leading?: ReactNode;
  /** Rendered as a separate control on the left. Its own tap target, because a
   *  Back nested inside the menu trigger is a Back nobody can hit. */
  onBack?: () => void;
  backLabel?: string;
  /** The sheet's title. Defaults to "Go to". */
  menuTitle?: string;
  /** Trailing content on the bar — one control at most. */
  action?: ReactNode;
  className?: string;
}

export function SectionSwitcher<T extends string>({
  sections,
  value,
  onChange,
  title,
  leading,
  onBack,
  backLabel = "Back",
  menuTitle = "Go to",
  action,
  className,
}: SectionSwitcherProps<T>) {
  const [open, setOpen] = useState(false);
  const current = sections.find((s) => s.value === value) ?? sections[0];
  const CurrentIcon = current?.icon;

  return (
    <>
      <div
        className={cn(
          // A real border, so a studio that set `--border-width: 0` gets no
          // hairline and one that set 2 gets two — the bar this replaces drew
          // its track with a fill and ignored the token entirely.
          "flex items-center gap-1 rounded-full border border-border/50 bg-background/60 p-1 backdrop-blur-md",
          className,
        )}
      >
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label={backLabel}
            className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground outline-none ring-ring transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 [&_svg]:size-[1.15rem]"
          >
            <BackArrow />
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          // The whole chip is the target — 44px tall, and everything on it is
          // one control rather than a label sitting next to a small chevron.
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-full px-1.5 text-left outline-none ring-ring transition-colors hover:bg-secondary/60 focus-visible:ring-2"
        >
          {leading}
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-body-lg font-semibold">{title}</span>
            <span className="flex items-center gap-1 text-micro uppercase text-muted-foreground">
              {CurrentIcon && <CurrentIcon aria-hidden className="size-3 shrink-0" />}
              <span className="truncate">{current?.label}</span>
            </span>
          </span>
          <ChevronDown aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        </button>
        {action}
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title={menuTitle}>
        <Group>
          {sections.map((s) => (
            <Row
              key={s.value}
              onClick={() => { onChange(s.value); setOpen(false); }}
              sub={s.hint}
              leading={
                <span
                  aria-hidden
                  className="grid size-10 shrink-0 place-items-center rounded-xl [&_svg]:size-[1.15rem]"
                  style={s.tone
                    ? { backgroundColor: `color-mix(in oklch, ${toneVar[s.tone]} 15%, transparent)`, color: toneVar[s.tone] }
                    : undefined}
                >
                  <s.icon />
                </span>
              }
              // A check on the current one and NOTHING on the rest. `Row` adds
              // a chevron to anything that navigates, which is right in a list
              // you drill into and wrong in a picker: six chevrons say "there
              // is more inside each of these" when what is inside is the screen
              // you are already on.
              chevron={false}
              trailing={s.value === value ? <Check aria-label="Current section" className="size-4 text-primary" /> : undefined}
            >
              {s.label}
            </Row>
          ))}
        </Group>
      </Sheet>
    </>
  );
}

/** Local, so the switcher does not force `ArrowLeft` into every importer. */
function BackArrow() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

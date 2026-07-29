/**
 * SETTINGS — the index/detail pattern, as components.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * Every configuration surface in the product was a horizontally-scrolling tab
 * strip over one enormous page. Studio settings shipped **seven** tabs (two of
 * them off the right edge at phone width) where the first tab alone was 5,599px
 * of a single card holding fifteen unrelated controls — theme, logo, app icon,
 * the AI coach's name, nine brand swatches, surface tint, corner radius,
 * elevation, borders, border colour, two section-colour toggles and a
 * fine-tune drawer, under one "Save". Preferences stacked FOUR levels of
 * explanatory prose (page intro, eyebrow, card intro, sub-section intro) before
 * the first control. The platform console's tenants tab scrolled to 61,541px
 * with no chunking at all.
 *
 * Tabs are the wrong control for this. They cap at 2–4 before they truncate
 * (§7), they put every sibling one flick away from the one you want, and they
 * force a whole section onto a single page — so the page grows without limit
 * and nothing on it can be found.
 *
 * ── The pattern (what phone OS settings converged on, and why it works) ─────
 *
 * **An index of grouped rows, and a page per section.**
 *
 *  • The INDEX row's sub-line says WHAT IS INSIDE — "Colours, corners, marks".
 *    It is a table of contents, so you can aim before you tap.
 *  • The SECTION PAGE's row sub-line says the CURRENT VALUE — "Elevation ·
 *    Soft", "Sign-in · Passkeys on". That is the whole trick: you can answer
 *    "what is this set to" by reading, without opening anything and without
 *    risking changing it.
 *  • A binary with nothing else to say gets an inline `Switch` and no page.
 *  • Anything with more than a value gets a page of its own.
 *
 * Two components, then: `SettingsIndex` for the first, and `SettingsPage` for
 * the frame around the second. Rows are the product's own `Row` — a settings
 * row and a roster row are the same object, which is why this file is thin.
 */

import type { ReactNode } from "react";
import { ChevronRight, type LucideIcon } from "./lib/icons.js";
import { cn } from "./lib/utils.js";
import { Group, Row } from "./layout.js";
import { IconBadge, type Tone } from "./primitives.js";
import { Stagger } from "./lib/motion.js";

export interface SettingsEntry {
  /** Stable id — also the URL segment when the index navigates by route. */
  key: string;
  icon: LucideIcon;
  /** The tinted badge behind the icon. Colour is navigation, not decoration:
   *  the same section keeps the same tone everywhere it appears. */
  tone?: Tone;
  label: string;
  /**
   * On an INDEX: what is inside ("Colours, corners, marks").
   * On a SECTION PAGE: the current value ("Soft", "Passkeys on").
   * Never both, and never a restatement of the label.
   */
  sub?: ReactNode;
  /** A status chip on the right — "Not set", "Needs attention", a count. */
  trailing?: ReactNode;
  onClick?: () => void;
  /** Renders the row as destructive. */
  destructive?: boolean;
  disabled?: boolean;
}

export interface SettingsGroup {
  /** Optional — an unlabelled group is a visual break, which is how phone OS
   *  settings separate "account" from everything else. */
  header?: string;
  rows: SettingsEntry[];
}

/**
 * The index. Groups of rows, each row a door.
 *
 * Deliberately NOT a tab strip and NOT an accordion: an accordion still puts
 * every section on one page, which is the thing being fixed.
 */
export function SettingsIndex({ groups, className }: { groups: SettingsGroup[]; className?: string }) {
  return (
    <div className={cn("space-y-6", className)}>
      {groups.filter((g) => g.rows.length > 0).map((g, i) => (
        <section key={g.header ?? `g${i}`} className="space-y-2">
          {g.header && <h2 className="px-1 text-micro uppercase text-muted-foreground">{g.header}</h2>}
          <Stagger>
            <Group>
              {g.rows.map((r) => (
                <Row
                  key={r.key}
                  leading={<IconBadge icon={r.icon} tone={r.destructive ? "danger" : (r.tone ?? "neutral")} size="sm" />}
                  sub={r.sub}
                  trailing={r.trailing}
                  onClick={r.disabled ? undefined : r.onClick}
                  tone={r.destructive ? "danger" : "default"}
                  disabled={r.disabled}
                >
                  {r.label}
                </Row>
              ))}
            </Group>
          </Stagger>
        </section>
      ))}
    </div>
  );
}

/**
 * The frame around one section: a back affordance, the section's name, and an
 * optional one-line description.
 *
 * The description is capped at ONE line on purpose. The old surfaces carried a
 * page intro, an eyebrow, a card intro and a sub-section intro before the first
 * control — four paragraphs explaining a screen you could not yet see. If a
 * section needs more than a line to introduce, its rows are named wrong.
 */
export function SettingsPage({
  title,
  description,
  onBack,
  action,
  children,
}: {
  title: string;
  description?: ReactNode;
  onBack: () => void;
  /** A single trailing control in the header — rarely needed. */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          aria-label="Back"
          className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-foreground transition-colors hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-ring/70 [&_svg]:size-[1.1rem]"
        >
          <ChevronRight className="rotate-180" />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-title-2">{title}</h1>
        {action}
      </div>
      {description && <p className="px-1 text-sm text-muted-foreground">{description}</p>}
      {children}
    </div>
  );
}

/**
 * A section that is itself several sections: an index of sub-pages, one open at
 * a time.
 *
 * **Controlled, and router-free on purpose.** This package has no router
 * dependency and must not gain one — a design system that imports one cannot be
 * consumed by an app using a different one. So the open key is a prop and the
 * product binds it to whatever its navigation is (Kova uses a query param, so
 * Back steps out of a sub-page before it leaves the section).
 *
 * Each row states its CURRENT VALUE, exactly as one level up: that is what
 * makes an index worth a tap, because you can check what a thing is set to
 * without opening it and therefore without risking changing it.
 *
 * `footer` renders under the index AND every sub-page. Pass one only when the
 * sub-pages share form state and must share a submit — a split that gives each
 * sub-page its own save can leave a half-applied configuration behind. Sections
 * whose parts save independently pass nothing.
 */
export function SectionDetail({
  subs,
  openKey,
  onOpen,
  footer,
}: {
  subs: (SettingsEntry & { render: () => ReactNode })[];
  openKey: string | null;
  onOpen: (key: string | null) => void;
  footer?: ReactNode;
}) {
  const open = subs.find((x) => x.key === openKey) ?? null;
  if (open) {
    return (
      <section className="space-y-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => onOpen(null)}
            aria-label="Back"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-foreground transition-colors hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-ring/70 [&_svg]:size-[1.1rem]"
          >
            <ChevronRight className="rotate-180" />
          </button>
          <h2 className="min-w-0 flex-1 truncate text-title-3">{open.label}</h2>
        </div>
        {open.render()}
        {footer}
      </section>
    );
  }
  return (
    <section className="space-y-5">
      <SettingsIndex groups={[{ rows: subs.map(({ render: _r, ...row }) => ({ ...row, onClick: () => onOpen(row.key) })) }]} />
      {footer}
    </section>
  );
}

/**
 * App shell components (DESIGN.md §1.11, §4): AppBar, BottomTabs / NavRail,
 * bottom Sheet, WavyDivider, TimelineFeed, SettingsList.
 */

import { clsx } from "clsx";
import { useEffect, type ReactNode } from "react";

interface AppBarProps {
  leading?: ReactNode;
  title?: ReactNode;
  trailing?: ReactNode;
}

export function AppBar({ leading, title, trailing }: AppBarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between bg-bg/90 px-4 backdrop-blur">
      <div className="flex min-w-0 items-center gap-2">{leading}</div>
      <div className="absolute left-1/2 -translate-x-1/2 text-lg font-medium text-fg-muted">{title}</div>
      <div className="flex items-center gap-2">{trailing}</div>
    </header>
  );
}

export interface TabDef {
  key: string;
  label: string;
  icon: ReactNode;
}

interface TabsProps {
  tabs: TabDef[];
  active: string;
  onSelect: (key: string) => void;
}

/** Bottom tab bar (mobile) — active tab gets the filled pill. */
export function BottomTabs({ tabs, active, onSelect }: TabsProps) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex items-stretch justify-around bg-surface-1/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onSelect(t.key)}
          className="flex flex-1 flex-col items-center gap-1 py-2.5"
          aria-current={active === t.key ? "page" : undefined}
        >
          <span
            className={clsx(
              "grid h-8 w-14 place-items-center rounded-full text-lg transition-colors",
              active === t.key ? "bg-primary-container text-on-primary-container" : "text-fg-muted",
            )}
          >
            {t.icon}
          </span>
          <span className={clsx("text-xs", active === t.key ? "font-semibold text-primary" : "text-fg-muted")}>
            {t.label}
          </span>
        </button>
      ))}
    </nav>
  );
}

/** Left nav rail (≥ md) — same tabs, desktop density. */
export function NavRail({ tabs, active, onSelect, footer }: TabsProps & { footer?: ReactNode }) {
  return (
    <nav className="fixed inset-y-0 left-0 z-30 hidden w-20 flex-col items-center gap-2 bg-surface-1 py-6 md:flex">
      <div className="mb-4 text-2xl font-black text-primary">M</div>
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onSelect(t.key)}
          className="flex w-full flex-col items-center gap-1 py-2"
          aria-current={active === t.key ? "page" : undefined}
        >
          <span
            className={clsx(
              "grid h-8 w-14 place-items-center rounded-full text-lg",
              active === t.key ? "bg-primary-container text-on-primary-container" : "text-fg-muted",
            )}
          >
            {t.icon}
          </span>
          <span className={clsx("text-[11px]", active === t.key ? "font-semibold text-primary" : "text-fg-muted")}>
            {t.label}
          </span>
        </button>
      ))}
      <div className="mt-auto">{footer}</div>
    </nav>
  );
}

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

/** Bottom sheet with grabber (mobile) / centered dialog (desktop). */
export function Sheet({ open, onClose, title, children }: SheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-[2rem] bg-surface-1 p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] md:inset-auto md:left-1/2 md:top-1/2 md:w-full md:max-w-lg md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[--radius-card]">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-surface-3 md:hidden" />
        {title && <h2 className="mb-4 text-xl font-semibold">{title}</h2>}
        {children}
      </div>
    </div>
  );
}

/** Whimsical wavy day divider for the timeline feed. */
export function WavyDivider({ label }: { label: string }) {
  const wave = (
    <svg viewBox="0 0 120 8" className="h-2 w-full text-fg-muted/30" preserveAspectRatio="none" aria-hidden>
      <path
        d="M0 4 Q 7.5 0, 15 4 T 30 4 T 45 4 T 60 4 T 75 4 T 90 4 T 105 4 T 120 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
  return (
    <div className="my-6 flex items-center gap-4">
      <div className="flex-1">{wave}</div>
      <span className="shrink-0 text-lg text-fg-muted">{label}</span>
      <div className="flex-1">{wave}</div>
    </div>
  );
}

interface InsightCardProps {
  timestamp: string;
  title: string;
  ai?: boolean;
  children?: ReactNode;
  onFeedback?: (vote: 1 | -1) => void;
}

/** Timeline feed event: ✦ timestamp, title, sub-card, 👍/👎. */
export function InsightCard({ timestamp, title, ai, children, onFeedback }: InsightCardProps) {
  return (
    <article className="py-3">
      <div className="flex items-center gap-2 text-sm text-fg-muted">
        {ai && <span className="text-primary">✦</span>}
        <span>{timestamp}</span>
      </div>
      <h3 className="mt-1 text-2xl font-semibold text-fg-muted">{title}</h3>
      {children && <div className="mt-3">{children}</div>}
      {onFeedback && (
        <div className="mt-3 flex items-center gap-4 text-fg-muted">
          <button onClick={() => onFeedback(1)} className="text-lg hover:text-fg" aria-label="Helpful">
            👍
          </button>
          <button onClick={() => onFeedback(-1)} className="text-lg hover:text-fg" aria-label="Not helpful">
            👎
          </button>
        </div>
      )}
    </article>
  );
}

interface SettingsRow {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  trailing?: ReactNode;
}

interface SettingsSection {
  header: string;
  rows: SettingsRow[];
}

/** Flat settings list: accent section headers, icon rows, zero card chrome. */
export function SettingsList({ sections }: { sections: SettingsSection[] }) {
  return (
    <div className="space-y-8">
      {sections.map((s) => (
        <section key={s.header}>
          <h3 className="mb-3 text-sm font-semibold text-good">{s.header}</h3>
          <div className="space-y-1">
            {s.rows.map((r) => (
              <button
                key={r.label}
                onClick={r.onClick}
                className="flex w-full items-center gap-4 rounded-2xl px-2 py-3 text-left hover:bg-surface-1"
              >
                <span className="text-xl text-fg-muted">{r.icon}</span>
                <span className="flex-1 text-lg">{r.label}</span>
                {r.trailing}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

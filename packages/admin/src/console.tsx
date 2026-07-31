/**
 * THE OPERATOR CONSOLE, as a shell.
 *
 * Every 4DL app has a `admin.` door and the same thing behind it: a list of
 * configuration sections, one open at a time. What DIFFERS is which sections —
 * and that is exactly the part an app should own, because a section is a
 * product decision ("Studios", "Warehouses", "Venues") wearing a generic frame.
 *
 * So this file is the frame and nothing else. It is deliberately the same
 * index-and-a-page-per-section pattern the design system already ships for
 * settings, because a console IS a settings surface — one whose subject happens
 * to be the platform rather than an account. Kova's console proved the shape the
 * hard way: its first tab measured 61,541px on a seeded install, every studio
 * ever created in one scroll, with the other six tabs invisible behind it.
 *
 * ── Router-free, on purpose ─────────────────────────────────────────────────
 *
 * `openKey` + `onOpen` are props, exactly as `@4dl/ui`'s `SectionDetail` does
 * it. A shared package that imports one router cannot be consumed by an app
 * using a different one, and the binding is four lines in the app. Kova binds it
 * to a query param so Back steps out of a section before it leaves the console.
 */

import type { ReactNode } from "react";
import {
  ArrowLeft, Button, Page, SettingsIndex, SettingsPage, ShieldCheck,
  type LucideIcon, type Tone,
} from "@4dl/ui";

export interface ConsoleSection {
  /** Stable id — also what an app puts in the URL. */
  key: string;
  label: string;
  /**
   * What is INSIDE, not what it is. This is a table of contents, so an operator
   * can aim before tapping. A blurb that promises something the section does not
   * have is worse than no blurb — Kova's "Security" once advertised "sessions,
   * admin access" and had neither.
   */
  blurb: string;
  icon: LucideIcon;
  /** Colour is navigation, not decoration: one tone per section, everywhere. */
  tone?: Tone;
  render: () => ReactNode;
}

/**
 * The console. An index of sections, or one open section.
 *
 * `onBack` is what leaves the console entirely; `onOpen(null)` closes a section
 * without leaving. Keeping them separate is what makes the browser Back button
 * behave — one level at a time rather than out of the console from three deep.
 */
export function AdminConsole({
  sections, openKey, onOpen, onBack, title, subtitle,
}: {
  sections: ConsoleSection[];
  openKey: string | null;
  onOpen: (key: string | null) => void;
  onBack: () => void;
  /** The console's own name — "Platform admin", "Operations". */
  title: string;
  /** One line naming what this console governs. */
  subtitle: string;
}) {
  const open = sections.find((s) => s.key === openKey) ?? null;

  if (open) {
    return (
      <Page className="column space-y-4 p-4 pb-28">
        <SettingsPage title={open.label} description={open.blurb} onBack={() => onOpen(null)}>
          {open.render()}
        </SettingsPage>
      </Page>
    );
  }

  return (
    <Page className="column space-y-4 p-4 pb-28">
      <div className="flex items-center gap-3">
        <Button size="icon" variant="secondary" onClick={onBack} aria-label="Back"><ArrowLeft /></Button>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-5 shrink-0 text-primary" aria-hidden />
            <h1 className="truncate text-title-3">{title}</h1>
          </div>
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <SettingsIndex
        groups={[{
          rows: sections.map((s) => ({
            key: s.key, icon: s.icon, tone: s.tone, label: s.label, sub: s.blurb,
            onClick: () => onOpen(s.key),
          })),
        }]}
      />
    </Page>
  );
}

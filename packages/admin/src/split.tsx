/**
 * A PANEL WITH SUB-PAGES — `@4dl/ui`'s `SectionDetail`, bound to the URL.
 *
 * The AI panel is three surfaces, not one: the provider and its key, what a call
 * costs in credits, and a live self-test that spends real money. Stacked, they
 * measured a megabyte of screenshot in Kova, and the pricing table — the one an
 * operator actually changes — sat below the entire provider block every time.
 *
 * Kova's own binding for this lives in the app and imports react-router. That is
 * the right call for a screen inside a routed app and the wrong one for a shared
 * package, so this is the same shape over `useUrlKey`: no router, one query param
 * per panel, and Back stepping out of a sub-page before it leaves the section.
 *
 * The param is per-panel (`a` for AI, `k` for keys…) so two panels open at
 * different times never fight over one slot.
 */

import type { ReactNode } from "react";
import { SectionDetail, type SettingsEntry } from "@4dl/ui";
import { useUrlKey } from "./use-section.js";

/**
 * `value` rather than the design system's `sub`, because at a sub-page call site
 * the field is unambiguously the CURRENT VALUE ("Gemini key set", "4 models on")
 * and naming it that stops anyone reaching for it to write a description.
 */
export type ConsoleSubSection = Omit<SettingsEntry, "sub"> & {
  value?: ReactNode;
  render: () => ReactNode;
};

export function ConsoleSplit({
  param,
  subs,
  footer,
}: {
  /** Query param holding the open sub-page. One per panel. */
  param: string;
  subs: ConsoleSubSection[];
  /** A shared action bar — only when the sub-pages share form state. */
  footer?: ReactNode;
}) {
  const [openKey, setOpen] = useUrlKey(param);
  return (
    <SectionDetail
      subs={subs.map(({ value, ...rest }) => ({ ...rest, sub: value }))}
      openKey={openKey}
      onOpen={setOpen}
      footer={footer}
    />
  );
}

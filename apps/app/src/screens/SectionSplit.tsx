/**
 * A settings SECTION that is itself several settings.
 *
 * The index/detail pattern nests. Studio settings is an index of sections; a
 * section big enough to hide its own contents becomes an index of sub-pages,
 * and the rows carry their CURRENT VALUE exactly as one level up.
 *
 * Four sections earned it, each for the same reason — everything inside was on
 * one page, so nothing on it could be found and nothing said what it was set to:
 *
 *   Brand    5,599px of theme, marks, colour, shape, section tint and tokens
 *   Email    delivery, notification policy, and templates, stacked
 *   AI       provider keys, per-lane models, voice, and the self-test
 *   Sign-in  the login link, the sign-in screen editor, and custom domains
 *
 * ── The two rules this encodes ──────────────────────────────────────────────
 *
 * **Each sub-page's row states its value.** That is what makes an index worth a
 * tap: you can check what a thing is set to by reading, without opening it and
 * therefore without risking changing it.
 *
 * **A split section keeps ONE save, if it had one.** `footer` renders under both
 * the index and every sub-page, sharing the parent's form state. Giving each
 * sub-page its own save would let a half-applied theme (or half-applied email
 * config) exist, which is worse than a long page ever was. Sections whose parts
 * save independently pass no footer.
 *
 * The sub-page key lives in its own query param so Back steps out of the
 * sub-page, then out of the section, then out of settings — one level per press,
 * which is the behaviour the whole pattern exists to buy.
 */

import type { ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { Button, SettingsIndex, ArrowLeft, type LucideIcon, type Tone } from "@kova/ui";

export interface SubSection {
  key: string;
  label: string;
  icon: LucideIcon;
  tone?: Tone;
  /** The CURRENT VALUE, shown on the index row. Never a description. */
  value?: ReactNode;
  render: () => ReactNode;
}

export function SectionSplit({
  param,
  subs,
  footer,
}: {
  /** Query param holding the open sub-page. One per section, so two nested
   *  splits can never fight over the same key. */
  param: string;
  subs: SubSection[];
  /** A shared action bar — rendered under the index AND every sub-page. */
  footer?: ReactNode;
}) {
  const [params, setParams] = useSearchParams();
  const open = subs.find((x) => x.key === params.get(param)) ?? null;
  const go = (k: string | null) =>
    setParams(
      (q: URLSearchParams) => {
        if (k) q.set(param, k);
        else q.delete(param);
        return q;
      },
      { replace: !k },
    );

  if (open) {
    return (
      <section className="space-y-5">
        <div className="flex items-center gap-3">
          <Button size="icon" variant="secondary" onClick={() => go(null)} aria-label="Back"><ArrowLeft /></Button>
          <h2 className="min-w-0 flex-1 truncate text-title-3">{open.label}</h2>
        </div>
        {open.render()}
        {footer}
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <SettingsIndex
        groups={[{
          rows: subs.map((x) => ({
            key: x.key, icon: x.icon, tone: x.tone, label: x.label, sub: x.value,
            onClick: () => go(x.key),
          })),
        }]}
      />
      {footer}
    </section>
  );
}

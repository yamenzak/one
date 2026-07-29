/**
 * `SectionDetail` bound to this app's navigation.
 *
 * The presentation lives in `@kova/ui` — index of sub-pages, one open at a
 * time, every row stating its current value. What could NOT move there is this
 * file: the package has no router dependency and must not gain one, because a
 * design system that imports one cannot be consumed by an app using a
 * different one. So the open key is a prop up there, and the glue is here.
 *
 * The key lives in a query param, one per section, so two nested splits never
 * fight over the same slot and Back steps out of a sub-page, then out of the
 * section, then out of settings — one level per press, which is the behaviour
 * the whole pattern exists to buy.
 */

import type { ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { SectionDetail, type SettingsEntry } from "@kova/ui";

/**
 * `value` rather than the package's `sub`, because at a sub-page call site the
 * field is unambiguously the CURRENT VALUE ("Soft", "13/13 to clients") and
 * naming it that stops anyone reaching for it to write a description. Mapped
 * onto `sub` below — one word, one meaning, at each layer.
 */
export type SubSection = Omit<SettingsEntry, "sub"> & { value?: ReactNode; render: () => ReactNode };

export function SectionSplit({
  param,
  subs,
  footer,
}: {
  /** Query param holding the open sub-page. One per section. */
  param: string;
  subs: SubSection[];
  /** A shared action bar — only when the sub-pages share form state. */
  footer?: ReactNode;
}) {
  const [params, setParams] = useSearchParams();
  return (
    <SectionDetail
      subs={subs.map(({ value, ...rest }) => ({ ...rest, sub: value }))}
      openKey={params.get(param)}
      onOpen={(k) =>
        setParams(
          (q: URLSearchParams) => {
            if (k) q.set(param, k);
            else q.delete(param);
            return q;
          },
          { replace: !k },
        )
      }
      footer={footer}
    />
  );
}

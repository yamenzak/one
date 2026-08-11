/**
 * CONTAINERS — where the difference between nothing and not-yet is enforced.
 *
 * ⚠️ THE TYPE MAKES THE MISTAKE UNWRITABLE. A container takes `T[] | null`, and
 * `null` renders the unknown state. `catch(() => setItems([]))` cannot be
 * expressed as "no results" here, because an empty array IS a result and the
 * component has a separate branch for not having one.
 */

import type { ReactNode } from "react";
import { dataStateOf, type DataState } from "../state.js";
import { EmptyState, Skeleton, Callout } from "./primitives.js";

export interface CollectionProps<T> {
  /** ⚠️ `null` means NOT KNOWN. `[]` means known and empty. Never conflated. */
  readonly items: readonly T[] | null;
  readonly failed?: boolean;
  /** Which shaped keys this caller received. A withheld one is not an empty one. */
  readonly included?: Readonly<Record<string, boolean>>;
  readonly empty: { readonly title: string; readonly detail?: string; readonly action?: ReactNode };
  readonly children: (items: readonly T[]) => ReactNode;
  /** Rendered above the rows when a lens was withheld rather than empty. */
  readonly withheld?: (keys: readonly string[]) => ReactNode;
}

export function Collection<T>({ items, failed, included, empty, children, withheld }: CollectionProps<T>) {
  const state: DataState = dataStateOf({ value: items, failed: failed ?? false, ...(included ? { withheld: included } : {}) });

  switch (state) {
    case "unknown":
      /*
        ⚠️ NOT AN EMPTY STATE. A container that has not been answered yet says
        "nothing here" for the length of a round trip, and says it permanently
        when the round trip failed and somebody swallowed the error.
      */
      return <div data-one="collection" data-state="unknown"><Skeleton /></div>;
    case "error":
      return (
        <div data-one="collection" data-state="error">
          <Callout tone="danger" title="That didn't load">Try again in a moment.</Callout>
        </div>
      );
    case "empty":
      return <div data-one="collection" data-state="empty"><EmptyState {...empty} /></div>;
    case "partial": {
      const missing = Object.entries(included ?? {}).filter(([, on]) => !on).map(([key]) => key);
      return (
        <div data-one="collection" data-state="partial">
          {withheld ? withheld(missing) : <Callout tone="info" title="Some of this isn't in your plan" />}
          {children(items ?? [])}
        </div>
      );
    }
    case "ready":
      return <div data-one="collection" data-state="ready">{children(items ?? [])}</div>;
  }
}

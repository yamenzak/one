/**
 * A COLLECTION — the one shape every list of accumulated things takes.
 *
 * People, plans, files, templates, exercises, invoices. Every product grows a
 * handful of these and every one of them was, until now, hand-built: its own
 * search box (or none), its own empty state (or a bare "No data"), its own
 * loading treatment (usually a spinner), and no way to switch how it is shown.
 * Six screens, six behaviours, and a reader who has to learn each one.
 *
 * So it is a component, in the design system, and it owns the whole state
 * machine (UI-LANGUAGE §7 "Collections"):
 *
 *   LOADING     a skeleton in the geometry of the view actually chosen — not a
 *               spinner, and not list-shaped bars behind a grid.
 *   EMPTY       nothing exists yet: one line of why, one action to fix it.
 *   NO RESULTS  something exists, the search excluded it. A DIFFERENT state,
 *               because the fix is different — clear the search, not create a
 *               thing — and treating them the same tells someone with 200
 *               clients that they have none.
 *   FAILED      what broke, and a retry. Never an endless shimmer.
 *   FULL        the items, in the chosen view.
 *
 * ── What it does NOT own ────────────────────────────────────────────────────
 *
 * The rows. `renderList`/`renderGrid` are the caller's, because a person, a
 * workout and an invoice do not share a row and pretending they do produces a
 * component with fifteen props. This owns the CHROME and the STATES; the caller
 * owns what one item looks like.
 */

import { useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { LayoutGrid, List, Search, type LucideIcon } from "./lib/icons.js";
import { contentIn, contentStagger } from "./lib/animation.js";
import { Button, Field } from "./primitives.js";
import { EmptyState } from "./shell.js";
import { LoadError } from "./patterns.js";
import { SkeletonLine, SkeletonList } from "./skeleton.js";
import { cn } from "./lib/utils.js";

export type CollectionView = "list" | "grid";

/**
 * Remember which view this collection was last shown in.
 *
 * PER COLLECTION and per device. Two decisions are load-bearing:
 *
 *   the KEY is the collection's, not the screen's — the same collection reached
 *   from two places is one preference, and two collections on one screen are
 *   two.
 *
 *   the PREFIX is `4dl.view.`, deliberately outside any app's sign-out sweep.
 *   How you like your lists shown is not account data, and a preference that
 *   resets when you sign out is a preference nobody sets twice. (Kova's sweep
 *   clears everything starting `kova`; this never matches.)
 */
export function useCollectionView(key: string, fallback: CollectionView = "list") {
  const storageKey = `4dl.view.${key}`;
  const [view, setView] = useState<CollectionView>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved === "grid" || saved === "list" ? saved : fallback;
    } catch {
      return fallback;
    }
  });
  const choose = (next: CollectionView) => {
    setView(next);
    try {
      localStorage.setItem(storageKey, next);
    } catch {
      /* private mode — the choice holds for this session and no longer */
    }
  };
  return [view, choose] as const;
}

export interface CollectionProps<T> {
  items: T[] | null;
  itemKey: (item: T) => string;
  /** Null while loading. A failed load passes `error` instead. */
  error?: string | null;
  onRetry?: () => void;
  /** What this collection holds, lower-case plural — "clients", "workouts".
   *  Used in the copy the component writes for itself. */
  noun: string;

  /** Omit to render a list with no toggle. */
  view?: CollectionView;
  onView?: (v: CollectionView) => void;

  /** Controlled search. Omit for a collection nobody would search. */
  query?: string;
  onQuery?: (q: string) => void;

  /** The one primary action, on the header row beside the controls. */
  action?: ReactNode;

  empty: { icon: LucideIcon; title: string; description?: string; action?: ReactNode };
  renderList: (item: T) => ReactNode;
  renderGrid?: (item: T) => ReactNode;
  /** Row height hint for the list skeleton, so the shimmer matches the rows. */
  thumb?: number;
  className?: string;
}

export function Collection<T>({
  items,
  itemKey,
  error = null,
  onRetry,
  noun,
  view = "list",
  onView,
  query,
  onQuery,
  action,
  empty,
  renderList,
  renderGrid,
  thumb = 44,
  className,
}: CollectionProps<T>) {
  const searching = Boolean(query?.trim());
  const grid = view === "grid" && Boolean(renderGrid);
  /*
   * The search box is always there, if the collection has one at all.
   *
   * It used to appear at eight items, on the reasoning that a search above four
   * rows is a control asking to be used on a list you can already see. That is
   * true of the control and false of the HEADER: a header that grows a field
   * when the ninth item is added changes shape under someone who has learned
   * it, and until then the screen looks like a screen you cannot search — which
   * is the thing people ask about. Every app this borrows from keeps it pinned.
   *
   * It also removed the box mid-keystroke, since the query changes the count
   * that decided whether to show the box.
   */
  const showSearch = Boolean(onQuery);

  const header = (showSearch || onView || action) && (
    <div className="flex items-center gap-2">
      {showSearch && (
        <Field
          label={`Search ${noun}`}
          labelHidden
          icon={Search}
          type="search"
          className="min-w-0 flex-1"
          value={query ?? ""}
          placeholder={`Search ${noun}…`}
          onChange={(e) => onQuery?.(e.target.value)}
        />
      )}
      {onView && renderGrid && <ViewToggle value={view} onChange={onView} noun={noun} />}
      {action}
    </div>
  );

  return (
    <div className={cn("space-y-3", className)}>
      {header}
      {error ? (
        <LoadError what={noun} error={error} onRetry={onRetry ?? (() => undefined)} />
      ) : items === null ? (
        // The skeleton follows the CHOSEN view. A column of list bars behind a
        // grid teaches the eye one layout and then replaces it with another,
        // which is the reflow a skeleton exists to prevent.
        grid ? <GridSkeleton /> : <SkeletonList rows={6} thumb={thumb} card />
      ) : items.length === 0 ? (
        searching ? (
          <EmptyState
            icon={Search}
            title={`No ${noun} match “${query!.trim()}”`}
            description="Try a shorter search, or clear it to see everything."
            action={
              <button
                onClick={() => onQuery?.("")}
                className="min-h-12 text-sm font-medium text-primary"
              >
                Clear search
              </button>
            }
          />
        ) : (
          <EmptyState icon={empty.icon} title={empty.title} description={empty.description} action={empty.action} />
        )
      ) : (
        <motion.div
          // Keyed on the view so switching re-runs the entrance: the items are
          // genuinely re-laid-out, and settling them in reads as a change rather
          // than as a glitch.
          key={view}
          variants={contentStagger}
          initial="hidden"
          animate="show"
          className={grid ? "grid grid-cols-2 gap-3 sm:grid-cols-3" : "overflow-hidden rounded-2xl bg-card"}
        >
          {items.map((item, i) => (
            <motion.div
              key={itemKey(item)}
              variants={contentIn}
              className={grid ? undefined : cn(i > 0 && "border-t border-border/50")}
            >
              {grid ? renderGrid!(item) : renderList(item)}
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}

/**
 * List or grid — ONE button, showing where it takes you.
 *
 * This was a two-button segmented pill, which is the shape you reach for when
 * the choice is a setting. It is not: there are exactly two views and you are
 * always in one of them, so the second button is permanently a no-op taking up
 * the width the search field wants. A single control carrying the icon of the
 * OTHER view says the same thing in half the space and reads as an action
 * rather than as configuration — which is what the Library had already got
 * right, and this is now the one implementation both use.
 *
 * The label names the DESTINATION for the same reason ("Show as a grid"), and
 * there is no `aria-pressed`: this is not a toggle button holding a state, it
 * is a button that switches.
 */
export function ViewToggle({ value, onChange, noun }: {
  value: CollectionView;
  onChange: (v: CollectionView) => void;
  noun?: string;
}) {
  const next = value === "list" ? "grid" : "list";
  const Icon = value === "list" ? LayoutGrid : List;
  return (
    <Button
      variant="ghost"
      className="shrink-0"
      aria-label={`Show ${noun ?? "items"} as a ${next}`}
      onClick={() => onChange(next)}
    >
      <Icon aria-hidden />
    </Button>
  );
}

/** The grid's own loading geometry — tiles, not rows. */
function GridSkeleton({ tiles = 6 }: { tiles?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {Array.from({ length: tiles }).map((_, i) => (
        <div key={i} className="space-y-2.5 rounded-2xl bg-card p-3">
          {/* The tile's own geometry: the image square, then the two lines
              under it. A row-shaped shimmer here is the reflow a skeleton is
              for preventing. */}
          <div className="aspect-square w-full animate-pulse rounded-xl bg-surface-2" />
          <SkeletonLine w="75%" h="text" />
          <SkeletonLine w="50%" h="xs" />
        </div>
      ))}
    </div>
  );
}

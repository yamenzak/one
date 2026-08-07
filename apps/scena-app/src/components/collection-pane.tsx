/**
 * A COLLECTION DESTINATION, IN ONE LINE PER COLLECTION.
 *
 * §11.3: a destination whose job is "work through a set of things" is a
 * Two-pane at ≥1100 — the list stays on screen beside whatever is open, so
 * moving to the next item is a click instead of Back-then-click. Scena had six
 * of these and every one of them rendered Focus: a list that a record REPLACED,
 * and at 1440 four rows of a playlist library stretched across 1120px with
 * their content in the left fifth and two thirds of the panel empty.
 *
 * `Shape` is controlled — `@4dl/ui` imports no router — so something has to
 * answer "is a record open?" from the URL. This is that something, once, rather
 * than six copies of the same five lines.
 *
 * ── Why the pathname and not `useParams` ────────────────────────────────────
 *
 * A layout route does not see the params its CHILDREN match: `useParams` here
 * returns `{}` on both `/playlists` and `/playlists/abc`. The pathname is what
 * distinguishes them, and it is the same test in every app that has tried this.
 *
 * ── The phone is untouched, and that is the whole argument ──────────────────
 *
 * Below 1100 `Shape` is a pass-through, so the index route renders the list as
 * the full page and `:id` renders the record as the full page — exactly the two
 * routes that existed before. Which is why the index element must be the REAL
 * list page and not `null`: at desktop the placeholder wins and it is never
 * rendered, but on a phone it is the entire screen.
 */

import type { ReactNode } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { EmptyState, Shape, type LucideIcon } from "@4dl/ui";

export function CollectionPane({
  base,
  list,
  icon,
  title,
  description,
}: {
  /** The list route's path, e.g. `/playlists`. A deeper path means a record. */
  base: string;
  /** The list, in its pane form. */
  list: ReactNode;
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  const { pathname } = useLocation();
  const selected = pathname.startsWith(`${base}/`);
  return (
    <Shape
      list={list}
      selected={selected}
      placeholder={<EmptyState icon={icon} title={title} description={description} />}
    >
      <Outlet />
    </Shape>
  );
}

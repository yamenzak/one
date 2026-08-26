/**
 * THE DESIGN PACKAGE'S HALF OF THE BLOCK REGISTRY — id to component.
 *
 * ⚠️ THE JOIN IS A STRING AND IT HAS TO BE, WHICH IS WHY IT IS GUARDED. The
 * kernel cannot import this file: `defineApp` runs in a Worker and this pulls in
 * React and the whole library. So the registry names components by string, and
 * something has to turn a name back into a component — this is that something,
 * and `vocabulary.test.mjs` is what refuses a name on either side that the other
 * does not have.
 *
 * ⚠️ IT IS A SEPARATE FILE FROM THE RENDERER ON PURPOSE. `body.tsx` decides
 * where a block goes and what it is handed; this decides only what the name
 * means. Merged, one import in the map would drag the whole library into every
 * module that wanted to read the placement rules — and the map is the half a
 * bundler cannot split.
 */

import type * as React from "react";
import {
  ActionRow, AmountRow, CopyRow, FieldRow, NavRow, NoteRow, PersonRow, QuickActions,
  SeeAll, StepRow, TileGrid,
} from "../parts/surfaces.js";
import { Crumbs, Document, Faq, Gauge, Steps, Timeline, Tree } from "../parts/blocks.js";
import { Guide, Milestones } from "../parts/guide.js";
import { Listing } from "../parts/listing.js";
import { Delta, Hero, Meter, Score, Stat } from "../chart/figures.js";
import { BarChart, LineChart } from "../chart/charts.js";
import { Bars } from "../parts/bars.js";
import { Face } from "../parts/face.js";
import { Markdown } from "../parts/prose.js";

/**
 * ⚠️ THE VALUE TYPE IS DELIBERATELY LOOSE, AND THE TIGHTNESS IS ELSEWHERE. Each
 * component has its own props and no union of thirty of them is a type anything
 * can call — so what makes a binding safe is the kernel refusing a slot that is
 * not in the entry, and the guard refusing an entry whose slot is not a prop.
 * A cast here that pretended otherwise would be the type system agreeing with a
 * claim nothing checked.
 */
export const PARTS: Readonly<Record<string, React.ComponentType<never>>> = {
  /* rows */
  FieldRow, AmountRow, NavRow, PersonRow, NoteRow, CopyRow, ActionRow, StepRow, SeeAll,
  /* structures */
  Listing, Tree, Timeline, TileGrid, QuickActions, Crumbs, Faq, Steps,
  /* books */
  Guide, Milestones,
  /* figures */
  Hero, Stat, Meter, Delta, Score, Gauge,
  /* charts */
  LineChart, BarChart,
  /* marks */
  Bars, Face, Markdown, Document,
} as Readonly<Record<string, React.ComponentType<never>>>;

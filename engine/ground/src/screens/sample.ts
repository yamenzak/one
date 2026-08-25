/**
 * THE WORLD GROUND SHOWS — sample, and openly so.
 *
 * ⚠️ GROUND IS THE MOCK APP, WHICH IS WHY THIS IS HONEST RATHER THAN A FIXTURE.
 * A reference app exists to be looked at and copied; it has no customers and no
 * database, so its content is written down here where anybody can read it. What
 * would be dishonest is sample data inside a product somebody pays for, and no
 * screen here is that.
 *
 * ⚠️ AND IT IS SHAPED LIKE REAL DATA, NOT LIKE A DEMO. A run with a gap in it, a
 * roster where somebody has not accepted, a note nobody published, a figure that
 * went down, an hour of the week nobody has ever written in. A sample world
 * where everything is present and tidy is one that renders every empty state and
 * every refusal exactly never.
 *
 * ⚠️ EVERY SERIES HERE IS WRITTEN OUT RATHER THAN GENERATED FROM A SINE. A
 * smooth wave is the one shape a chart is never asked to draw: no plateau, no
 * spike, no run of equal values, nothing to round awkwardly and no reason for a
 * label to collide with its neighbour. The numbers below are lumpy on purpose.
 */

/* ------------------------------------------------------------------ notes --- */

/**
 * ⚠️ THIS MIRRORS THE DECLARED COLLECTION, FIELD FOR FIELD. `Note` is what
 * `GROUND`'s `note` says a note is — so a field added to the manifest and not to
 * a screen is a type error rather than a column nobody drew.
 */
export interface Note {
  readonly id: string;
  readonly title: string;
  /** The first line of the body, which is what a row shows. */
  readonly said: string;
  readonly body: string;
  readonly at: string;
  readonly published: boolean;
  readonly pinned: boolean;
  readonly kind: "idea" | "decision" | "question" | "record";
  readonly happened: string;
  readonly minutes: number;
  /** Minor units — see the manifest. */
  readonly cost: number;
  readonly colour: string;
  readonly link: string;
  readonly ask: string;
  /** The note this one came out of, or nothing. */
  readonly follows: string | null;
  readonly by: string;
}

export const NOTES: readonly Note[] = [
  {
    id: "n1", title: "Rewrite the onboarding email", said: "Third draft — shorter",
    body: "Third draft. The first two explained the product; this one asks for one thing and gets out of the way. Cut the feature list entirely — nobody reads a list before they have a reason to.",
    at: "2026-08-14", published: true, pinned: true, kind: "decision",
    happened: "2026-08-14", minutes: 45, cost: 0, colour: "#3f7d58",
    link: "https://example.com/onboarding-v3", ask: "priya@example.com",
    follows: null, by: "p1",
  },
  {
    id: "n2", title: "Q3 pricing, one page", said: "For Thursday",
    body: "One page, three tiers, no comparison table. Thursday.",
    at: "2026-08-13", published: true, pinned: false, kind: "record",
    happened: "2026-08-13", minutes: 90, cost: 4200, colour: "#2f5d8a",
    link: "https://example.com/q3-pricing", ask: "tomas@example.com",
    follows: null, by: "p2",
  },
  {
    id: "n3", title: "What the trial hides", said: "From four support threads",
    body: "Four separate people asked the same question in week two of the trial, which means the trial is not showing them the thing they signed up for. Two of them cancelled before anybody answered.",
    at: "2026-08-11", published: false, pinned: false, kind: "question",
    happened: "2026-08-10", minutes: 25, cost: 0, colour: "#8a5a2f",
    link: "https://example.com/support/threads", ask: "aisha@example.com",
    follows: "n2", by: "p3",
  },
  {
    id: "n4", title: "Why import is slow", said: "Measured, not guessed",
    body: "Measured, not guessed: 80% of the wall clock is one query that reads the whole table to count it. The rest is fine.",
    at: "2026-08-08", published: true, pinned: false, kind: "record",
    happened: "2026-08-07", minutes: 120, cost: 0, colour: "#4a4a4a",
    link: "https://example.com/import-trace", ask: "tomas@example.com",
    follows: null, by: "p2",
  },
  {
    id: "n5", title: "Names we rejected", said: "Keep for the next one",
    body: "Keep for the next one. Every good name was taken and every free name was a misspelling of a good one.",
    at: "2026-07-30", published: false, pinned: false, kind: "idea",
    happened: "2026-07-30", minutes: 15, cost: 0, colour: "#6b4a7d",
    link: "https://example.com/names", ask: "priya@example.com",
    follows: null, by: "p1",
  },
  {
    id: "n6", title: "Stop shipping on Fridays", said: "Two incidents, same shape",
    body: "Two incidents in six weeks, both on a Friday afternoon, both found on Monday morning by a customer rather than by us.",
    at: "2026-07-24", published: true, pinned: true, kind: "decision",
    happened: "2026-07-24", minutes: 30, cost: 0, colour: "#8a2f3f",
    link: "https://example.com/incidents", ask: "jonas@example.com",
    follows: "n4", by: "p1",
  },
];

/** ⚠️ The reference a `ref` field points at — a note is chosen from the notebook. */
export const noteName = (id: string | null): string =>
  NOTES.find((n) => n.id === id)?.title ?? "";

/* ----------------------------------------------------------------- people --- */

export interface Person {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: "writer" | "reader";
  /** Invited and not yet arrived — the state a roster screen usually forgets. */
  readonly pending?: boolean;
  readonly unread?: boolean;
  readonly wrote: number;
  readonly since: string;
}

export const PEOPLE: readonly Person[] = [
  { id: "p1", name: "Priya Raman", email: "priya@example.com", role: "writer", unread: true, wrote: 34, since: "2025-11-04" },
  { id: "p2", name: "Tomas Novak", email: "tomas@example.com", role: "writer", wrote: 21, since: "2026-01-19" },
  { id: "p3", name: "Aisha Bello", email: "aisha@example.com", role: "reader", wrote: 12, since: "2026-03-02" },
  { id: "p4", name: "Jonas Lind", email: "jonas@example.com", role: "reader", pending: true, wrote: 0, since: "2026-08-12" },
];

export const personName = (id: string): string =>
  PEOPLE.find((p) => p.id === id)?.name ?? "Somebody";

/* ------------------------------------------------------------------ series --- */

export interface Reading { readonly x: number; readonly y: number | null }

/**
 * ⚠️ THE GAP AT DAY 17 IS THE POINT. A series with no missing reading never
 * exercises the one thing a line chart has to get right, and a chart that joins
 * across a gap tells a story the data does not.
 */
export const WRITTEN: readonly Reading[] = [
  6, 4, 9, 11, 7, 3, 2, 8, 12, 14, 11, 9, 4, 3, 10, 15, 13, null,
  12, 16, 18, 14, 6, 5, 17, 19, 21, 16, 9, 7,
].map((y, x) => ({ x, y }));

export const READ: readonly Reading[] = [
  18, 22, 26, 31, 24, 12, 9, 27, 33, 38, 35, 29, 14, 11, 34, 41, 39, 22,
  36, 44, 47, 42, 19, 16, 45, 51, 55, 46, 26, 21,
].map((y, x) => ({ x, y }));

/** A short run for a `Stat`'s trend, which takes twelve points and no axis. */
export const RECENT: readonly Reading[] = [
  9, 11, 8, 14, 13, 17, 16, 12, 19, 21, 16, 18,
].map((y, x) => ({ x, y }));

/* ---------------------------------------------------------- what they are --- */

/** ⚠️ Four kinds and no "other" — a fold-into-other only earns its place past
    eight, and pretending otherwise hides the smallest real category. */
export const BY_KIND: readonly { readonly label: string; readonly value: number }[] = [
  { label: "Idea", value: 34 },
  { label: "Record", value: 21 },
  { label: "Question", value: 12 },
  { label: "Decision", value: 9 },
];

/** Four weeks, the same four kinds — part-to-whole over time. */
export const KIND_BY_WEEK = {
  groups: ["Wk 30", "Wk 31", "Wk 32", "Wk 33"] as const,
  series: [
    { id: "idea", label: "Idea", values: [7, 11, 8, 8] },
    { id: "record", label: "Record", values: [4, 5, 6, 6] },
    { id: "question", label: "Question", values: [2, 4, 3, 3] },
    { id: "decision", label: "Decision", values: [1, 3, 2, 3] },
  ],
} as const;

/**
 * ⚠️ THE NULLS ARE HOURS NOBODY HAS EVER WRITTEN IN, and they are not zeroes.
 * A grid that shades a hole the same as a quiet hour is a grid that invents
 * data — which is the one thing this form is careful about.
 */
export const WHEN = {
  rows: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const,
  columns: ["6am", "9am", "12pm", "3pm", "6pm", "9pm"] as const,
  values: [
    [1, 6, 4, 7, 3, null],
    [2, 9, 5, 8, 2, 1],
    [null, 7, 6, 11, 4, 2],
    [1, 8, 3, 9, 5, null],
    [null, 5, 2, 4, 1, null],
    [null, 1, 1, null, null, null],
    [null, null, 2, 3, 1, null],
  ] as readonly (readonly (number | null)[])[],
} as const;

/** ⚠️ Either side of a weekly target of twenty — the one form where the sign
    carries the meaning rather than the length. */
export const AGAINST_TARGET: readonly { readonly label: string; readonly value: number }[] = [
  { label: "Wk 29", value: -6 },
  { label: "Wk 30", value: -6 },
  { label: "Wk 31", value: 3 },
  { label: "Wk 32", value: -1 },
  { label: "Wk 33", value: 8 },
];

/** Last month against this one, per person — before and after, never two hues. */
export const MONTH_ON_MONTH: readonly {
  readonly label: string; readonly from: number; readonly to: number;
}[] = [
  { label: "Priya", from: 12, to: 21 },
  { label: "Tomas", from: 15, to: 11 },
  { label: "Aisha", from: 4, to: 9 },
];

/**
 * ⚠️ TWO SERIES AND NOT FOUR — a scatter caps at three because any two marks can
 * land side by side, so the palette has to clear the checks across every pair.
 */
export const LENGTH_AGAINST_TIME = [
  {
    id: "published", label: "Published", subject: true,
    points: [
      { x: 15, y: 120 }, { x: 25, y: 260 }, { x: 30, y: 190 }, { x: 45, y: 410 },
      { x: 60, y: 380 }, { x: 90, y: 720 }, { x: 120, y: 640 },
    ],
  },
  {
    id: "drafts", label: "Drafts",
    points: [
      { x: 10, y: 90 }, { x: 20, y: 140 }, { x: 35, y: 150 }, { x: 55, y: 210 },
      { x: 70, y: 260 },
    ],
  },
] as const;

/* --------------------------------------------------------------- activity --- */

export const TRAIL: readonly {
  readonly id: string; readonly when: string; readonly label: string; readonly under?: string;
}[] = [
  { id: "t1", when: "Today, 09:14", label: "Priya published it", under: "Everybody here can read it now" },
  { id: "t2", when: "Yesterday, 17:02", label: "Tomas left a correction", under: "Second paragraph, the figure was stale" },
  { id: "t3", when: "12 Aug", label: "Drafted from a line about it", under: "Cost 41 credits" },
  { id: "t4", when: "11 Aug", label: "Priya wrote it" },
];

/* ------------------------------------------------------------------ asked --- */

export const ASKED: readonly {
  readonly id: string; readonly q: string; readonly a: string;
}[] = [
  { id: "q1", q: "Who can read a note?",
    a: "Everybody in the workspace who can read notes. There is no per-note audience — a notebook people have to check the permissions of is a notebook nobody writes in." },
  { id: "q2", q: "What does publishing do?",
    a: "It tells everybody once and puts the note in the shared run. A draft stays yours; nothing about it is visible to anybody else." },
  { id: "q3", q: "Can I get a note back after deleting it?",
    a: "No. Deleting is immediate and there is no bin — say so before you press it, which is what the confirmation is for." },
];

/* ---------------------------------------------------------------- pictures --- */

/**
 * A PICTURE, SO THE COMPONENTS THAT STAND ON ONE CAN BE LOOKED AT.
 *
 * ⚠️ IT IS A DATA URI AND IT IS NOT PRETENDING TO BE A PHOTOGRAPH. `Glass` and a
 * card's `media` lead both exist to survive content NOBODY CHOSE — a shelf
 * somebody photographed in a dark room, a label with a white background — and
 * the one thing a real stock photo would prove is that they work over the one
 * image they were tuned against. A gradient with a shape in it puts a light
 * region and a dark region under the same chip, which is the case that fails.
 *
 * ⚠️ AND IT IS INLINE BECAUSE THE GROUND HAS NO NETWORK. Every screen here
 * renders with no session, no worker and no database; a file fetched from
 * anywhere would make the one suite that photographs this package depend on
 * something being up.
 */
const PICTURE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 240">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#f3ede4"/><stop offset="0.55" stop-color="#c98a4b"/>
<stop offset="1" stop-color="#2a2019"/></linearGradient></defs>
<rect width="480" height="240" fill="url(#g)"/>
<circle cx="150" cy="96" r="66" fill="#fdfaf5" opacity="0.55"/>
<rect x="256" y="128" width="150" height="86" rx="14" fill="#1b1410" opacity="0.62"/>
</svg>`;

export const PICTURE = `data:image/svg+xml;utf8,${encodeURIComponent(PICTURE_SVG)}`;

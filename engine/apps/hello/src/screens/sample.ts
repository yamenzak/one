/**
 * THE WORLD HELLO SHOWS — sample, and openly so.
 *
 * ⚠️ HELLO IS THE MOCK APP, WHICH IS WHY THIS IS HONEST RATHER THAN A FIXTURE.
 * A reference app exists to be looked at and copied; it has no customers and no
 * database, so its content is written down here where anybody can read it. What
 * would be dishonest is sample data inside a product somebody pays for, and no
 * screen here is that.
 *
 * ⚠️ AND IT IS SHAPED LIKE REAL DATA, NOT LIKE A DEMO. A run with a gap in it, a
 * roster where somebody has not accepted, a note nobody published, a figure that
 * went down. A sample world where everything is present and tidy is one that
 * renders every empty state and every refusal exactly never.
 */

export interface Note {
  readonly id: string;
  readonly title: string;
  readonly said: string;
  readonly at: string;
  readonly published: boolean;
  readonly pinned: boolean;
}

export const NOTES: readonly Note[] = [
  { id: "n1", title: "Rewrite the onboarding email", said: "Third draft — shorter", at: "2026-08-14", published: true, pinned: true },
  { id: "n2", title: "Q3 pricing, one page", said: "For Thursday", at: "2026-08-13", published: true, pinned: false },
  { id: "n3", title: "What the trial hides", said: "From four support threads", at: "2026-08-11", published: false, pinned: false },
  { id: "n4", title: "Why import is slow", said: "Measured, not guessed", at: "2026-08-08", published: true, pinned: false },
  { id: "n5", title: "Names we rejected", said: "Keep for the next one", at: "2026-07-30", published: false, pinned: false },
];

export interface Person {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: "writer" | "reader";
  /** Invited and not yet arrived — the state a roster screen usually forgets. */
  readonly pending?: boolean;
  readonly unread?: boolean;
}

export const PEOPLE: readonly Person[] = [
  { id: "p1", name: "Priya Raman", email: "priya@example.com", role: "writer", unread: true },
  { id: "p2", name: "Tomas Novak", email: "tomas@example.com", role: "writer" },
  { id: "p3", name: "Aisha Bello", email: "aisha@example.com", role: "reader" },
  { id: "p4", name: "Jonas Lind", email: "jonas@example.com", role: "reader", pending: true },
];

/**
 * ⚠️ THE GAP AT DAY 17 IS THE POINT. A series with no missing reading never
 * exercises the one thing a line chart has to get right, and a chart that joins
 * across a gap tells a story the data does not.
 */
export const WRITTEN: readonly { readonly x: number; readonly y: number | null }[] =
  Array.from({ length: 30 }, (_, d) => ({
    x: d,
    y: d === 17 ? null : Math.round(6 + Math.sin(d / 3.1) * 4 + d * 0.28),
  }));

export const READ: readonly { readonly x: number; readonly y: number | null }[] =
  Array.from({ length: 30 }, (_, d) => ({ x: d, y: Math.round(18 + Math.cos(d / 4) * 7 + d * 0.6) }));

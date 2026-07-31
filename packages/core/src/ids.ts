/**
 * Time-sortable unique ids and the clock helpers everything else formats with.
 *
 * Ids are `<prefix>_<base36 ms><base36 randomness>`: lexicographic order equals
 * chronological order, so `ORDER BY id` is a valid recency sort and no table
 * needs a separate sequence. The prefix is diagnostic — an id in a log says what
 * it identifies without a lookup.
 *
 * `crypto.getRandomValues` is used rather than `Math.random`: ids appear in URLs
 * (media keys, invitation links), and a guessable id there is an access-control
 * bug however well the row is scoped.
 */

export function newId(prefix: string): string {
  const t = Date.now().toString(36).padStart(9, "0");
  const buf = new Uint8Array(8);
  crypto.getRandomValues(buf);
  const r = [...buf].map((b) => b.toString(36)[0]).join("");
  return `${prefix}_${t}${r}`;
}

/** ISO-8601 UTC instant — the storage format for every timestamp column. */
export const nowIso = (): string => new Date().toISOString();

export const nowMs = (): number => Date.now();

/** "YYYY-MM" — the idempotency key for anything granted once per calendar month. */
export const periodKey = (d = new Date()): string => d.toISOString().slice(0, 7);

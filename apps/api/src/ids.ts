/** Time-sortable unique ids (uuidv7-flavored, compact) + helpers. */

export function newId(prefix: string): string {
  const t = Date.now().toString(36).padStart(9, "0");
  const buf = new Uint8Array(8);
  crypto.getRandomValues(buf);
  const r = [...buf].map((b) => b.toString(36)[0]).join("");
  return `${prefix}_${t}${r}`;
}

export const nowIso = (): string => new Date().toISOString();
export const nowMs = (): number => Date.now();

/** "YYYY-MM" period key for idempotent monthly grants. */
export const periodKey = (d = new Date()): string => d.toISOString().slice(0, 7);

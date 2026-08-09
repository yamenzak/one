/**
 * THE OUTCOME, DELIVERED — and why it is a header.
 *
 * ⚠️ IT WAS DECLARED EVERYWHERE AND DELIVERED NOWHERE. Twelve operations in this
 * runtime carry an `outcome`, every collection derives two more, and not one of
 * them reached a client: the response was the handler's return value and nothing
 * else. A mechanism with no surface — the failure this platform was started
 * over — sitting inside the platform itself, invisible because nothing that
 * consumed it existed yet to notice.
 *
 * ⚠️ THE BODY STAYS THE DECLARED OUTPUT. Every operation declares an `output`
 * shape, and the API document, the typed client and every test are written
 * against it. Wrapping the body in `{ data, outcome }` would make all three
 * describe a shape the manifest does not mention — so this travels beside the
 * body, which is what a header is for.
 */

import { SOUND_OF, strongest, type MomentId, type Outcome, type SoundId, type Tone } from "@one/kernel";

export const OUTCOME_HEADER = "x-one-outcome";

/**
 * ⚠️ WHAT HAPPENED, NEVER WHERE TO PUT IT. There is no `surface` here and no
 * `toast`: an operation that chose its own presentation is how three products
 * end up with three answers to one interaction. The renderer decides — inline
 * for a field saved in place, a toast for something that cannot be seen happen,
 * nothing at all when the result is already visible.
 */
export interface DeliveredOutcome {
  readonly message: string;
  readonly tone: Tone;
  readonly moment?: MomentId;
  /** ⚠️ Derived from the moment, so the two cannot part. Never chosen. */
  readonly sound?: SoundId;
  readonly invalidates?: readonly string[];
}

/**
 * The header value for one response, or nothing at all.
 *
 * ⚠️ AND THE PLATFORM'S CELEBRATION REPLACES THE APP'S "SAVED". Two things can
 * land in one response — a write that also completed a milestone — and `saved`
 * standing next to `you earned something` is the smaller of the two winning by
 * being declared closer. `strongest` decides, once, and there is no queue: four
 * celebrations after a batch import is each one meaning less than the last.
 */
export interface Raised {
  readonly moment: MomentId;
  /** ⚠️ ITS OWN COPY. A celebration that wins must say what was celebrated. */
  readonly message: string;
}

export function outcomeHeader(outcome: Outcome | undefined, raised?: Raised): string | null {
  if (!outcome && !raised) return null;

  const moment = strongest(outcome?.moment, raised?.moment);
  /*
    ⚠️ THE COPY TRAVELS WITH THE MOMENT THAT WON. A celebration that replaced a
    "Saved" and kept the word "Saved" is the announcement of nothing — the
    person is shown the smaller thing's words with the larger thing's animation,
    which reads as the product having got confused rather than as an award.
  */
  const won = raised && moment === raised.moment && moment !== outcome?.moment;
  const delivered: DeliveredOutcome = {
    message: won ? raised.message : (outcome?.message ?? raised?.message ?? ""),
    tone: outcome?.tone ?? "success",
    ...(moment ? { moment, sound: SOUND_OF[moment] } : {}),
    ...(outcome?.invalidates ? { invalidates: outcome.invalidates } : {}),
  };
  /*
    ⚠️ ASCII, BECAUSE A HEADER IS BYTES — and this is the one that would have
    shipped. A header value is a ByteString: setting one containing a character
    above U+00FF THROWS, and it throws in the success path, after the write has
    already happened, turning a completed operation into a 503. Anything between
    U+0080 and U+00FF does not throw and is carried as latin-1, so it comes back
    mangled instead.

    So "Gespeichert ✓", any Arabic outcome, and every emoji a product will ever
    put in a confirmation are a 503 or a corruption — decided by the copy in a
    manifest, in a code path with no error of its own.

    `JSON.stringify` already escapes control characters, so a newline is not the
    risk here; the alphabet is. Escaping to pure ASCII is still valid JSON,
    because `\uXXXX` inside a string is exactly what JSON has for this.
  */
  return JSON.stringify(delivered).replace(
    /[^\u0020-\u007e]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

/** The other half, for a client. Absent is the ordinary case, not an error. */
export function readOutcome(headers: { get(name: string): string | null }): DeliveredOutcome | null {
  const raw = headers.get(OUTCOME_HEADER);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DeliveredOutcome;
  } catch {
    /* Presentation metadata must never be the reason a successful call fails. */
    return null;
  }
}

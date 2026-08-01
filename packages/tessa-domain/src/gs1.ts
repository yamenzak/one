/**
 * GS1 ELEMENT STRINGS — turning one scan into product, expiry and lot.
 *
 * EU MDR pushes a UDI carrier onto medical device labels, and in Europe that
 * carrier is overwhelmingly GS1: a GS1-128 barcode or a DataMatrix whose data is
 * a sequence of *element strings*, each introduced by an Application Identifier.
 *
 *   (01) GTIN          which product        ─┐ UDI-DI
 *   (17) expiry        YYMMDD               ─┐
 *   (10) batch / lot   up to 20 chars        ├ UDI-PI
 *   (21) serial        up to 20 chars       ─┘
 *
 * So a single scan of a box yields what a human would otherwise type three times
 * and mistype once. That is the entire "less typing" premise of the product, and
 * it is why this module exists before anything else does.
 *
 * ── Why this is harder than splitting a string ──────────────────────────────
 *
 * There is no delimiter between an AI and its value, and no delimiter after a
 * FIXED-LENGTH value. `010761234567890417250131` is GTIN + expiry with nothing
 * between them: you can only cut it correctly if you know that AI `01` is always
 * 14 digits and `17` is always 6. Get the table wrong and you silently read the
 * wrong expiry date off a real box — which is precisely the failure this product
 * is supposed to prevent.
 *
 * VARIABLE-length values are terminated by FNC1, which arrives in the data
 * stream as GS (ASCII 29). Many scanners emit it; some are configured not to,
 * and then a variable field runs to the end of the string. Both are handled.
 *
 * ── What this module deliberately does NOT do ───────────────────────────────
 *
 * It does not decide anything. It reports what the barcode said, plus what it
 * could not understand. A caller showing a human "expires 2027-01-31, is that
 * right?" is the design (TESSA.md Rule 3); a caller that commits this blind is
 * misusing it.
 */

/** ASCII 29 — how FNC1 reaches us from a scanner. */
export const GS = "";

/**
 * AIs whose value length is fixed by the specification, so no separator follows.
 *
 * Deliberately a SHORT list of what medical packaging actually carries, rather
 * than all ~150 AIs. An unknown AI is reported as unparsed instead of guessed
 * at — see `parseGs1`'s contract. Guessing a length is how you silently
 * mis-split a real barcode.
 *
 * Lengths are the value length, excluding the AI itself.
 */
const FIXED_LENGTH: Record<string, number> = {
  "00": 18, // SSCC — logistics unit
  "01": 14, // GTIN
  "02": 14, // GTIN of contained trade items
  "11": 6, // production date   YYMMDD
  "12": 6, // due date          YYMMDD
  "13": 6, // packaging date    YYMMDD
  "15": 6, // best before       YYMMDD
  "16": 6, // sell by           YYMMDD
  "17": 6, // EXPIRY            YYMMDD
  "20": 2, // variant
};

/** AIs we understand as variable-length. Everything else is left unparsed. */
const VARIABLE_LENGTH = new Set(["10", "21", "22", "240", "241", "30", "37", "710", "711", "712", "713"]);

/** Symbology identifiers a scanner may prepend. Stripped before parsing. */
const SYMBOLOGY_PREFIXES = ["]d2", "]C1", "]e0", "]Q3", "]d1", "]E0"];

export interface Gs1Date {
  /** ISO `YYYY-MM-DD`. */
  iso: string;
  /**
   * True when the barcode said `DD = 00`.
   *
   * GS1 allows a day of `00` to mean "the last day of that month" — it is not a
   * malformed date and must not be rejected. `iso` is already resolved to that
   * last day; this flag exists so a UI can say "end of January 2027" rather than
   * implying a precision the label never had.
   */
  endOfMonth: boolean;
}

export interface Gs1Parse {
  /** Every AI we recognised, keyed by AI. Values are raw strings. */
  ais: Record<string, string>;
  /** `(01)` — 14-digit GTIN, present only if the check digit validated. */
  gtin?: string;
  /** `(17)` expiry. */
  expiry?: Gs1Date;
  /** `(11)` production date. */
  produced?: Gs1Date;
  /** `(10)` batch or lot. */
  lot?: string;
  /** `(21)` serial — a per-unit identifier, which makes this an instrument. */
  serial?: string;
  /**
   * What we could not account for.
   *
   * NEVER silently dropped: leftover input means either an AI outside our table
   * or a mis-scan, and both are cases where a human should look rather than a
   * parser should improvise.
   */
  unparsed: string[];
  /** Reasons a field was rejected — shown to the human, never swallowed. */
  warnings: string[];
}

/**
 * GTIN-14 mod-10 check digit.
 *
 * Worth doing rather than trusting the scanner: a partial or smudged read can
 * still produce 14 digits, and an invalid GTIN silently matched against the
 * catalog is a wrong product on a patient's record. Cheap arithmetic against an
 * expensive mistake.
 */
export function isValidGtin(gtin: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(gtin)) return false;
  const digits = [...gtin].map(Number);
  const check = digits.pop()!;
  // Weights alternate 3,1 from the RIGHTMOST data digit outwards, so they depend
  // on length — computing from the end keeps this correct for GTIN-8/12/13/14.
  const sum = digits.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/**
 * `YYMMDD` → an ISO date.
 *
 * ── The two rules that are easy to get wrong ────────────────────────────────
 *
 * DAY 00 means the last day of the month. Rejecting it loses a perfectly valid
 * label; treating it as day 1 understates an expiry by up to a month.
 *
 * THE CENTURY is not fixed. GS1 specifies a 100-year window centred near the
 * present: a two-digit year maps to whichever century puts it within roughly
 * [now-50, now+49]. Hard-coding `20YY` works until it doesn't, and the failure
 * is a date that reads as valid.
 *
 * `now` is a parameter, never `new Date()` — a date rule with a hidden clock
 * cannot be tested at its boundaries, and the boundaries are the whole risk.
 */
export function parseGs1Date(yymmdd: string, now: Date): Gs1Date | null {
  if (!/^\d{6}$/.test(yymmdd)) return null;
  const yy = Number(yymmdd.slice(0, 2));
  const mm = Number(yymmdd.slice(2, 4));
  const dd = Number(yymmdd.slice(4, 6));
  if (mm < 1 || mm > 12) return null;
  if (dd > 31) return null;

  const currentYear = now.getUTCFullYear();
  let year = Math.floor(currentYear / 100) * 100 + yy;
  const diff = year - currentYear;
  if (diff >= 51) year -= 100;
  else if (diff <= -50) year += 100;

  const endOfMonth = dd === 0;
  // Day 0 of the NEXT month is the last day of this one, and it handles leap
  // years without a table.
  const date = endOfMonth ? new Date(Date.UTC(year, mm, 0)) : new Date(Date.UTC(year, mm - 1, dd));
  // Rejects the impossible (31 February): the constructor rolls it forward, so
  // a changed month is how we detect it.
  if (!endOfMonth && date.getUTCMonth() !== mm - 1) return null;
  return { iso: date.toISOString().slice(0, 10), endOfMonth };
}

/**
 * Parse a scanned GS1 element string.
 *
 * Never throws and never guesses: anything it cannot account for lands in
 * `unparsed` or `warnings` for a human to resolve.
 */
export function parseGs1(raw: string, now: Date): Gs1Parse {
  const out: Gs1Parse = { ais: {}, unparsed: [], warnings: [] };
  if (!raw) return out;

  let s = raw.trim();
  for (const p of SYMBOLOGY_PREFIXES) {
    if (s.startsWith(p)) {
      s = s.slice(p.length);
      break;
    }
  }

  let i = 0;
  while (i < s.length) {
    // A stray separator between elements is normal, not an error.
    if (s[i] === GS) {
      i++;
      continue;
    }

    // AIs are 2-4 digits. Longest match first, because "24" and "240" are both
    // real AIs and a shortest-match parser reads the wrong one.
    let ai = "";
    for (const len of [4, 3, 2]) {
      const candidate = s.slice(i, i + len);
      if (candidate.length === len && /^\d+$/.test(candidate) && (candidate in FIXED_LENGTH || VARIABLE_LENGTH.has(candidate))) {
        ai = candidate;
        break;
      }
    }
    if (!ai) {
      // Unknown AI: we cannot know where its value ends, so we cannot safely
      // continue — everything from here is reported rather than mis-split.
      out.unparsed.push(s.slice(i));
      break;
    }

    i += ai.length;
    let value: string;
    const fixed = FIXED_LENGTH[ai];
    if (fixed !== undefined) {
      value = s.slice(i, i + fixed);
      i += fixed;
      if (value.length < fixed) {
        out.warnings.push(`(${ai}) was cut short — the scan may be incomplete`);
        out.unparsed.push(value);
        break;
      }
    } else {
      const end = s.indexOf(GS, i);
      value = end === -1 ? s.slice(i) : s.slice(i, end);
      i = end === -1 ? s.length : end + 1;
    }
    out.ais[ai] = value;
  }

  // ── Interpretation. Each field is validated, and a rejection is REPORTED
  //    rather than left absent, because "no expiry on the label" and "an expiry
  //    we could not read" need different things from the person holding the box.
  const gtin = out.ais["01"];
  if (gtin) {
    if (isValidGtin(gtin)) out.gtin = gtin;
    else out.warnings.push("the product code failed its check digit — rescan");
  }

  for (const [ai, key] of [["17", "expiry"], ["11", "produced"]] as const) {
    const v = out.ais[ai];
    if (!v) continue;
    const d = parseGs1Date(v, now);
    if (d) out[key] = d;
    else out.warnings.push(`(${ai}) is not a readable date — rescan or enter it by hand`);
  }

  if (out.ais["10"]) out.lot = out.ais["10"];
  if (out.ais["21"]) out.serial = out.ais["21"];

  return out;
}

/**
 * Does this scan describe ONE object, or a batch?
 *
 * A serial number is the barcode telling us it is talking about a single
 * physical thing — which is the difference between a UNIT and a LOT in Tessa's
 * model (TESSA.md §3.1), and therefore between two different lifecycles. Worth
 * naming rather than leaving as `if (parse.serial)` scattered around.
 */
export function isSerialised(parse: Gs1Parse): boolean {
  return Boolean(parse.serial);
}

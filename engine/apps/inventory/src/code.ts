/**
 * WHAT A SCAN TURNED OUT TO BE — pure, and the sharpest arithmetic in the app.
 *
 * ⚠️ THE APP NEVER PREFERS A CODE. A scan resolves to a product, a pack level,
 * and whatever extra the carrier happened to carry; the screen then asks only
 * for what is MISSING. A DataMatrix on a box of vials arrives with the lot and
 * the expiry already on it, so receiving it is zero typing; the same product's
 * EAN-13 on the outer carton arrives with neither, so the screen asks for two
 * things. One code is not better than the other — they carry different amounts,
 * and the interface is a function of how much arrived.
 *
 * ⚠️ AND EVERY NUMERIC CODE NORMALISES TO A GTIN-14. An EAN-13 read off a box
 * and the `(01)` of a DataMatrix on the same box are the same product with a
 * different number of leading zeros — matched as strings they are two products,
 * and the workspace ends up with a duplicate catalogue entry that nobody can
 * see is a duplicate.
 *
 * ⚠️ A FAILED CHECK DIGIT IS A REFUSAL, NEVER A SHRUG. An unknown code gets
 * LEARNED — attached to a product for ever — so a mis-scan accepted here is a
 * wrong number bound permanently to a real product, and the second scan of the
 * real barcode then resolves to nothing while the mis-scan resolves confidently.
 */

/**
 * ⚠️ WHAT KIND OF CODE IT IS, AND `other` IS THE HONEST MAJORITY. A national
 * code (PZN, NDC, CIP), a manufacturer's part number and a supplier's own
 * reference are not distinguishable from each other by looking at them — what
 * says which is the row somebody imported or typed, not the string. Guessing
 * here would put a confident wrong label on the one thing a person will read
 * when a scan goes wrong.
 */
export type CodeKind = "gtin" | "gs1" | "ours" | "other";

/**
 * ⚠️ WHAT A STORED CODE MAY BE, AND IT IS WIDER THAN WHAT A SCAN CAN PROVE. A
 * reader never guesses `national` or `part` — they are not distinguishable by
 * shape — but the person typing one in KNOWS which it is, and so does a supplier
 * file. The reader's four are a subset of the six on purpose: the row can say
 * more than the camera could, and never less.
 */
export const CODE_KINDS = [
  "gtin", "gs1", "national", "part", "ours", "other",
] as const;

/** Which of OUR OWN things a code names. Prefixed, so a camera knows at once. */
export type OursOf = "location" | "batch" | "unit" | "product" | "kit";

/**
 * ⚠️ THE PACK LEVEL IS PART OF WHAT RESOLVED, NOT A SEPARATE QUESTION. The same
 * product has one barcode on a glove box and another on the carton of ten, and
 * "scan a carton, add 1" against "scan a carton, add 10" is the difference
 * between a right and a wrong number with nothing on screen to tell them apart.
 * It is `undefined` here because it is the CATALOGUE's answer — this file reads
 * a string, and the row the string is found in is what knows the pack.
 */
export interface Scanned {
  readonly kind: CodeKind;
  /** What to look a product up by — normalised, so two spellings are one key. */
  readonly value: string;
  /** Exactly as it was scanned, for a code being learned and for the audit. */
  readonly raw: string;
  /** ⚠️ Whatever the carrier ALSO carried. Absent is the ordinary case. */
  readonly lot?: string;
  /** A calendar day, never an instant — a shelf life has no time of day. */
  readonly expiry?: string;
  readonly serial?: string;
  readonly count?: number;
  readonly ours?: OursOf;
}

/** Why a string could not be read as a code at all. */
export interface Unread {
  readonly why: "empty" | "check" | "gs1";
}

export const unread = (of: Scanned | Unread): of is Unread => "why" in of;

/* ------------------------------------------------------------------- ours --- */

/**
 * ⚠️ OUR OWN LABELS CARRY WHAT THEY NAME, IN THE CODE ITSELF. When the camera
 * sees `ONE-L-…` the session MOVES to that shelf rather than adding stock to
 * it — point at a shelf, scan, scan, scan, point at the next shelf — and that
 * one behaviour is what turns a two-hour count into forty minutes. Deciding it
 * from a database lookup would put a round trip between the label and the
 * decision, on a phone, in a basement.
 */
const OURS: Readonly<Record<string, OursOf>> = {
  L: "location", B: "batch", U: "unit", P: "product", K: "kit",
};

const MINE = /^ONE-([LBUPK])-([0-9A-Z-]{2,32})$/;

/* ------------------------------------------------------------------- gtin --- */

/**
 * THE GS1 CHECK DIGIT — mod 10, weights 3 and 1 from the right.
 *
 * ⚠️ IT IS COMPUTED OVER THE PADDED FOURTEEN, which is what makes one function
 * serve EAN-8, UPC-A, EAN-13 and GTIN-14. Leading zeros do not change the
 * weighting, because the weights are assigned from the RIGHT.
 */
const checkOf = (digits: string): number => {
  let sum = 0;
  const body = digits.slice(0, -1);
  for (let i = 0; i < body.length; i++) {
    /* From the right: the last body digit is weighted 3. */
    const weight = (body.length - i) % 2 === 1 ? 3 : 1;
    sum += Number(body[i]) * weight;
  }
  return (10 - (sum % 10)) % 10;
};

export const gtinOk = (digits: string): boolean =>
  /^\d{8}$|^\d{12,14}$/.test(digits) && checkOf(digits) === Number(digits.at(-1));

/** ⚠️ ONE KEY PER PRODUCT — see the header. Padded, never trimmed. */
export const asGtin = (digits: string): string => digits.padStart(14, "0");

/* -------------------------------------------------------------------- gs1 --- */

/**
 * ⚠️ A DATE ON A LABEL IS SIX DIGITS AND THE CENTURY IS INFERRED, which is a
 * real rule rather than a convenience: GS1 puts the year in a window of −49 to
 * +50 around today, so `49` read in 2026 is 2049 and `77` is 1977. A naive
 * `2000 + yy` prints an expiry fifty years out for anything with a legacy date
 * on it, and — the direction that matters — treats a genuinely old lot as
 * current.
 */
const centuryOf = (yy: number, thisYear: number): number => {
  const here = thisYear % 100;
  const base = thisYear - here;
  const gap = yy - here;
  if (gap >= 51 && gap <= 99) return base - 100;
  if (gap >= -99 && gap <= -50) return base + 100;
  return base;
};

const LAST = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const leap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const endOf = (y: number, m: number) => (m === 2 && leap(y) ? 29 : LAST[m - 1] ?? 31);

const pad = (n: number, width: number) => String(n).padStart(width, "0");

/**
 * A GS1 DATE — `YYMMDD`, where a day of `00` means the END of that month.
 *
 * ⚠️ `00` IS NOT MISSING DATA, IT IS THE LAST DAY, and reading it as the first
 * would expire a whole month of stock early — every time, silently, on the one
 * field the product exists to get right.
 */
export function gs1Day(six: string, thisYear: number): string | null {
  if (!/^\d{6}$/.test(six)) return null;
  const yy = Number(six.slice(0, 2));
  const m = Number(six.slice(2, 4));
  const d = Number(six.slice(4, 6));
  if (m < 1 || m > 12) return null;
  const year = centuryOf(yy, thisYear) + yy;
  const day = d === 0 ? endOf(year, m) : d;
  if (day > endOf(year, m)) return null;
  return `${year}-${pad(m, 2)}-${pad(day, 2)}`;
}

/**
 * ⚠️ THE FIXED-LENGTH AIs ARE WHAT MAKES A SEPARATOR OPTIONAL. `(01)` is always
 * fourteen digits and `(17)` always six, so a scanner that swallowed the FNC1 —
 * which many do — still parses. A variable one runs to the next separator or to
 * the end of the string, and a scanner that swallowed THAT is a lot number with
 * the next field stuck on the end of it, which nothing can undo. The separator
 * is why a lot is read last where it is the final field.
 */
const FIXED: Readonly<Record<string, number>> = {
  "00": 18, "01": 14, "02": 14,
  "11": 6, "12": 6, "13": 6, "15": 6, "16": 6, "17": 6,
  "20": 2,
};

/** The variable-length ones this product reads. Anything else is skipped. */
const VARIABLE = new Set(["10", "21", "30", "37", "240", "241", "710", "711"]);

/** ⚠️ FNC1 arrives as GS (29) from most scanners, and as `\u001d` in a string. */
const GS = "\u001d";

/**
 * ⚠️ EVERY SCANNER BRANDS ITS OUTPUT AND THE BRAND IS NOT PART OF THE CODE.
 * `]d2` is a GS1 DataMatrix, `]C1` a GS1-128, `]e0` a DataBar, `]Q3` a QR. Left
 * on, the first three characters of every product code in the workspace are the
 * make of the scanner that read it — and two scanners disagree about a product.
 */
const BRAND = /^\](?:d[12]|C1|e[01]|Q[13]|E[04]|X0)/;

interface Parsed {
  readonly gtin?: string;
  readonly lot?: string;
  readonly expiry?: string;
  readonly serial?: string;
  readonly count?: number;
}

/**
 * ⚠️ IT RETURNS `null` RATHER THAN A PARTIAL READ. A DataMatrix that stops
 * making sense half way through is a damaged label or a scanner that mangled
 * the separators, and half of a lot number is worse than none: it looks like a
 * lot number, so it is what gets recorded.
 */
function parseGs1(body: string, thisYear: number): Parsed | null {
  let at = 0;
  const out: { -readonly [K in keyof Parsed]: Parsed[K] } = {};
  let read = 0;

  while (at < body.length) {
    if (body[at] === GS) { at += 1; continue; }

    /* ⚠️ TWO DIGITS FIRST, THEN THREE. The AI table is a prefix code: `24`
       alone is not an AI but `240` is, so a fixed two-digit read would take
       `24` and leave a `0` at the head of the value. */
    const two = body.slice(at, at + 2);
    const three = body.slice(at, at + 3);
    const ai = FIXED[two] !== undefined || VARIABLE.has(two)
      ? two
      : VARIABLE.has(three) ? three : null;
    if (!ai) return null;

    at += ai.length;
    const width = FIXED[ai];
    let value: string;
    if (width !== undefined) {
      value = body.slice(at, at + width);
      if (value.length !== width) return null;
      at += width;
    } else {
      const end = body.indexOf(GS, at);
      value = end === -1 ? body.slice(at) : body.slice(at, end);
      if (!value) return null;
      at = end === -1 ? body.length : end + 1;
    }

    read += 1;
    switch (ai) {
      case "01": case "02":
        if (!gtinOk(value)) return null;
        out.gtin = asGtin(value);
        break;
      case "17": {
        const day = gs1Day(value, thisYear);
        if (!day) return null;
        out.expiry = day;
        break;
      }
      case "10": out.lot = value; break;
      case "21": out.serial = value; break;
      case "30": case "37": out.count = Number(value); break;
      default: break;
    }
  }

  return read ? out : null;
}

/* ----------------------------------------------------------------- reading --- */

/**
 * WHAT A SCANNED STRING IS.
 *
 * ⚠️ `thisYear` IS A PARAMETER RATHER THAN A CLOCK READ HERE, so the century
 * window is testable at all — and so that the year is the one the DEVICE is in,
 * which is the same reason a shelf life is counted in local days.
 */
export function readScan(raw: string, thisYear: number): Scanned | Unread {
  const clean = raw.trim().replace(BRAND, "");
  if (!clean) return { why: "empty" };

  const mine = MINE.exec(clean.toUpperCase());
  if (mine) {
    return {
      kind: "ours",
      value: clean.toUpperCase(),
      raw,
      ours: OURS[mine[1] as string] as OursOf,
    };
  }

  /* ⚠️ A SEPARATOR OR AN AI AT THE HEAD IS WHAT SAYS "GS1", never the length. A
     bare fourteen-digit string is a GTIN-14, and reading it as `(01)` with the
     AI missing would take the first two digits of a real product number as an
     instruction. */
  const looksGs1 = clean.includes(GS)
    || (/^\d{16,}$/.test(clean) && (clean.startsWith("01") || clean.startsWith("00")))
    || /^(?:01|00|02|10|17|21)\d/.test(clean) && clean.length > 14;
  if (looksGs1) {
    const held = parseGs1(clean, thisYear);
    if (!held?.gtin) return { why: "gs1" };
    return {
      kind: "gs1",
      value: held.gtin,
      raw,
      ...(held.lot ? { lot: held.lot } : {}),
      ...(held.expiry ? { expiry: held.expiry } : {}),
      ...(held.serial ? { serial: held.serial } : {}),
      ...(held.count !== undefined && Number.isFinite(held.count)
        ? { count: held.count } : {}),
    };
  }

  if (/^\d{12,14}$/.test(clean)) {
    /* ⚠️ REFUSED RATHER THAN DOWNGRADED — see the header. A twelve-, thirteen-
       or fourteen-digit numeric code is unambiguously GS1, so a failed check
       digit is a mis-scan and nothing else. */
    if (!gtinOk(clean)) return { why: "check" };
    return { kind: "gtin", value: asGtin(clean), raw };
  }

  /* ⚠️ EIGHT DIGITS IS THE ONE AMBIGUOUS LENGTH, and it is why this is not a
     refusal: an EAN-8 and a German PZN are both eight digits with different
     check rules, so refusing one would make a whole country's pharmacy codes
     unscannable. A valid EAN-8 is a GTIN; anything else is looked up as it is. */
  if (/^\d{8}$/.test(clean) && gtinOk(clean)) {
    return { kind: "gtin", value: asGtin(clean), raw };
  }

  /* ⚠️ AND EVERYTHING ELSE IS STILL A CODE. A manufacturer's part number, a
     supplier's reference, a national code — none of them is recognisable by
     shape, and all of them resolve perfectly well once somebody has said what
     they belong to. Refusing what we cannot classify would make the catalogue
     unteachable, which is the one thing this design is for. */
  return { kind: "other", value: clean, raw };
}

/**
 * WHAT A SCAN STILL NEEDS BEFORE IT CAN BE RECORDED.
 *
 * ⚠️ THIS IS THE WHOLE INTERFACE RULE IN ONE FUNCTION. A screen that asked for
 * a lot and an expiry every time would make the good label worthless; a screen
 * that never asked would silently record a batch with no expiry. What is asked
 * is exactly the difference between what the product's depth REQUIRES and what
 * the carrier happened to bring.
 */
export const stillNeeded = (
  tracking: string, of: Scanned,
): readonly ("lot" | "expiry")[] =>
  tracking !== "batched"
    ? []
    : ([
      ...(of.lot ? [] : ["lot" as const]),
      ...(of.expiry ? [] : ["expiry" as const]),
    ]);

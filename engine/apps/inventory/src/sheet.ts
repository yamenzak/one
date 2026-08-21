/**
 * A SPREADSHEET SOMEBODY ALREADY HAS.
 *
 * ⚠️ NOBODY TYPES IN EIGHT HUNDRED PRODUCTS, and an inventory product without an
 * import is one that is evaluated for an afternoon and abandoned. Every real
 * customer arrives holding a spreadsheet — a stock list, a supplier's catalogue,
 * an export from whatever they are leaving — and the first thing they need is
 * for it to already be in here.
 *
 * ⚠️ THE PREVIEW AND THE COMMIT ARE THE SAME FUNCTION, which is the rule the
 * count session already follows: two implementations of "what will happen" is
 * how a screen comes to promise what a door refuses. `planIn` answers what an
 * import WOULD do; the write re-runs it and does exactly that.
 *
 * ⚠️ AND A REFUSED ROW IS NAMED, NEVER DROPPED. An import that quietly skipped
 * eleven of eight hundred rows is the worst outcome here: the catalogue looks
 * complete, the eleven are discovered months later by somebody looking for one
 * of them, and there is no record of what happened. Every row comes back with a
 * verdict and a reason.
 *
 * Pure. No I/O, no DOM.
 */

/* ------------------------------------------------------------------ reading --- */

/**
 * ⚠️ TABS AND COMMAS BOTH, DECIDED BY THE HEADER. Pasting out of a spreadsheet
 * gives tabs; a downloaded file gives commas; and a European export gives commas
 * inside quoted decimals. Asking somebody which they have is asking them to know
 * something about their own clipboard.
 */
const separatorIn = (line: string): string => {
  const tabs = (line.match(/\t/g) ?? []).length;
  const semis = (line.match(/;/g) ?? []).length;
  const commas = (line.match(/,/g) ?? []).length;
  if (tabs >= commas && tabs >= semis && tabs > 0) return "\t";
  if (semis > commas) return ";";
  return ",";
};

/**
 * ⚠️ QUOTES ARE PARSED RATHER THAN STRIPPED, because a product name with a comma
 * in it is the ordinary case — "Gloves, nitrile, M" is one field and three if
 * the quoting is ignored, which shifts every column after it. A doubled quote
 * inside a quoted field is one quote, which is what every spreadsheet writes.
 */
export function readRow(line: string, sep: string): readonly string[] {
  const out: string[] = [];
  let at = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { at += '"'; i++; } else quoted = false;
      } else at += ch;
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === sep) { out.push(at.trim()); at = ""; continue; }
    at += ch;
  }
  out.push(at.trim());
  return out;
}

export interface Sheet {
  readonly header: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

/**
 * ⚠️ A BLANK LINE ENDS NOTHING. Spreadsheets are full of them — a gap between
 * sections, a trailing newline, a row somebody cleared — and a reader that
 * stopped at the first one would import the top half of a file and report
 * success.
 *
 * ⚠️ AND THE LINE COUNT IS BOUNDED. A caller pasting a hundred thousand rows
 * into a worker is a request that times out half way through a write, which is
 * the one outcome an import must not have.
 */
export const MOST_ROWS = 2_000;

export function readSheet(text: string): Sheet {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim() !== "");
  if (!lines.length) return { header: [], rows: [] };
  const sep = separatorIn(lines[0]!);
  return {
    header: readRow(lines[0]!, sep).map((h) => h.toLowerCase()),
    rows: lines.slice(1, MOST_ROWS + 1).map((l) => readRow(l, sep)),
  };
}

/* ----------------------------------------------------------------- matching --- */

/** What this app can take out of a sheet, and every heading that means it. */
export const FIELDS = {
  name: ["name", "product", "description", "item", "title", "artikel", "produit"],
  brand: ["brand", "make", "manufacturer", "supplier brand"],
  code: ["code", "barcode", "ean", "upc", "gtin", "sku", "part", "part no", "reference"],
  unit: ["unit", "uom", "counted in", "units", "measure"],
  category: ["category", "group", "type", "class"],
  par: ["par", "minimum", "min", "reorder level", "reorder point", "tell me below"],
  quantity: ["quantity", "qty", "count", "on hand", "stock", "amount"],
  location: ["location", "place", "shelf", "bin", "where", "room", "store"],
  supplier: ["supplier", "vendor", "from", "seller"],
} as const;

export type Field = keyof typeof FIELDS;

export const FIELD_IDS = Object.keys(FIELDS) as readonly Field[];

/**
 * WHICH COLUMN IS WHICH.
 *
 * ⚠️ GUESSED AND THEN SHOWN, NEVER GUESSED AND APPLIED. A mapping this gets
 * wrong puts a supplier's name in the product name column for eight hundred
 * rows, and the only place anybody could notice is a preview. The guess is worth
 * making because it is right most of the time; the preview is what makes being
 * wrong survivable.
 *
 * ⚠️ AND THE FIRST MATCH WINS, IN THE FIELD'S OWN ORDER. A sheet with both
 * "code" and "barcode" has two headings meaning the same thing, and picking the
 * later one at random would make two identical imports differ.
 */
export function columnsIn(header: readonly string[]): Readonly<Record<string, number>> {
  const out: Record<string, number> = {};
  const taken = new Set<number>();
  for (const field of FIELD_IDS) {
    for (const want of FIELDS[field]) {
      const at = header.findIndex((h, i) => !taken.has(i) && h === want);
      if (at >= 0) { out[field] = at; taken.add(at); break; }
    }
  }
  /* ⚠️ A SECOND PASS ON PARTIAL MATCHES, because a real heading is "Product
     name" rather than "name" — and asking somebody to rename their columns is
     asking them not to use the import. */
  for (const field of FIELD_IDS) {
    if (out[field] !== undefined) continue;
    for (const want of FIELDS[field]) {
      const at = header.findIndex((h, i) => !taken.has(i) && h.includes(want));
      if (at >= 0) { out[field] = at; taken.add(at); break; }
    }
  }
  return out;
}

/**
 * WHAT SOMEBODY CORRECTED THE GUESS TO.
 *
 * ⚠️ A MAPPING ARRIVES OVER THE WIRE AS AN OPAQUE BLOB, and this is the one
 * place it is made safe. It reaches the planner as `columns[field]` and is used
 * to index a row — so a string where a number belongs reads `undefined` off
 * every row and imports eight hundred products with no name, and a field nothing
 * declares is a column claimed for a value nothing will ever write.
 *
 * ⚠️ AND `IGNORED` SURVIVES SANITISING, because it is the correction somebody
 * makes most: a sheet with a "Location" column full of a warehouse code that
 * means nothing here. It is what `columnsFor` deletes the guess on, and an
 * absent field does not overwrite what a product already has.
 */
export const IGNORED = -1;

export function mappingIn(raw: unknown): Readonly<Record<string, number>> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const field of FIELD_IDS) {
    const at = (raw as Record<string, unknown>)[field];
    if (typeof at !== "number" || !Number.isInteger(at) || at < IGNORED) continue;
    out[field] = at;
  }
  return out;
}

/**
 * ⚠️ THE GUESS, THEN THE CORRECTION — AND THE CORRECTION IS TOTAL. A person who
 * has looked at the mapping screen and turned a column off has said something
 * the guess cannot know, so an override is what the import uses for every field
 * it names. Merging per field is what makes turning one column off possible
 * without re-stating the other eight.
 */
export const columnsFor = (
  header: readonly string[], override?: unknown,
): Readonly<Record<string, number>> => {
  const said = mappingIn(override);
  const out: Record<string, number> = { ...columnsIn(header), ...said };
  /* ⚠️ A COLUMN PAST THE END OF THE HEADING IS NOT A COLUMN — it reads
     `undefined` off every row, which is silently the same as an empty sheet —
     and `IGNORED` is somebody saying so deliberately. Both leave the field
     absent, which is the state that overwrites nothing. */
  for (const field of Object.keys(out)) {
    const at = out[field] ?? IGNORED;
    if (at === IGNORED || at >= header.length) delete out[field];
  }
  return out;
};

/* ----------------------------------------------------------------- planning --- */

export type Verdict = "new" | "update" | "refused";

export interface Planned {
  /** ⚠️ The sheet's own line number, so a refusal names a row somebody can find. */
  readonly line: number;
  readonly verdict: Verdict;
  /** Empty on anything but a refusal. */
  readonly why: string;
  readonly name: string;
  readonly brand: string;
  readonly code: string;
  readonly unit: string;
  readonly category: string;
  readonly supplier: string;
  readonly location: string;
  /** ⚠️ `null` where the sheet said nothing — which is not the same as zero. */
  readonly par: number | null;
  readonly quantity: number | null;
  /** The product this row matched, where it matched one. */
  readonly product: string;
}

export interface Known {
  /** Lowercased name → product id. */
  readonly byName: Readonly<Record<string, string>>;
  /** Code → product id, from every code the workspace has learned. */
  readonly byCode: Readonly<Record<string, string>>;
}

/**
 * ⚠️ A NUMBER OUT OF A SPREADSHEET IS NOT `Number(x)`. "1 234,50" is European,
 * "1,234.50" is not, and both arrive. A thousands separator read as a decimal
 * point turns twelve hundred boxes into one, silently, in the direction that
 * makes a store room look empty.
 */
export const numberIn = (raw: string): number | null => {
  const said = raw.trim();
  if (!said) return null;
  /* ⚠️ THE LAST SEPARATOR DECIDES, which is the only rule that reads both
     conventions correctly — whichever of `.` or `,` appears last is the decimal
     point, and everything before it is grouping. */
  const cleaned = said.replace(/\s/g, "");
  const dot = cleaned.lastIndexOf(".");
  const comma = cleaned.lastIndexOf(",");
  const point = Math.max(dot, comma);
  const digits = point >= 0
    ? `${cleaned.slice(0, point).replace(/[.,]/g, "")}.${cleaned.slice(point + 1)}`
    : cleaned;
  const bare = digits.replace(/[^0-9.-]/g, "");
  /* ⚠️ "n/a", "—" AND "TBC" ARE NOT ZERO. Stripping a cell down to its digits
     leaves an empty string, and `Number("")` is 0 — so a spreadsheet's polite
     way of saying "we do not know" would import as a shelf holding none, which
     is a fact somebody then acts on. */
  if (!/[0-9]/.test(bare)) return null;
  const out = Number(bare);
  return Number.isFinite(out) ? out : null;
};

/**
 * WHAT AN IMPORT WOULD DO, ROW BY ROW.
 *
 * ⚠️ THIS IS THE PREVIEW AND IT IS ALSO THE COMMIT. Two implementations of
 * "what will happen" is how a screen comes to promise what a door refuses — the
 * count session already learned this, and an import is the same shape with eight
 * hundred rows instead of one shelf.
 *
 * ⚠️ MATCHED ON THE CODE FIRST AND THE NAME SECOND. A barcode names one thing;
 * a name is what somebody typed, and two spreadsheets of the same catalogue
 * spell it differently. Matching on the name alone is how an import makes a
 * second "Gloves, Nitrile M" beside the first.
 *
 * ⚠️ AND A DUPLICATE WITHIN THE SHEET IS REFUSED RATHER THAN APPLIED TWICE. The
 * second row would silently overwrite the first's answer, so what somebody
 * imported would depend on the order of their own file.
 */
export function planIn(
  sheet: Sheet, columns: Readonly<Record<string, number>>, known: Known,
): readonly Planned[] {
  const out: Planned[] = [];
  const seen = new Set<string>();
  const at = (row: readonly string[], field: Field): string => {
    const i = columns[field];
    return i === undefined ? "" : (row[i] ?? "").trim();
  };

  for (let i = 0; i < sheet.rows.length; i++) {
    const row = sheet.rows[i]!;
    const name = at(row, "name");
    const code = at(row, "code");
    const said = {
      line: i + 2,
      name,
      brand: at(row, "brand"),
      code,
      unit: at(row, "unit"),
      category: at(row, "category"),
      supplier: at(row, "supplier"),
      location: at(row, "location"),
      par: numberIn(at(row, "par")),
      quantity: numberIn(at(row, "quantity")),
    };

    /* ⚠️ A ROW WITH NEITHER A NAME NOR A CODE NAMES NOTHING. Imported it would
       be a product called "" that every later import matches. */
    if (!name && !code) {
      out.push({ ...said, verdict: "refused", why: "No name and no code", product: "" });
      continue;
    }

    const key = code ? `c:${code}` : `n:${name.toLowerCase()}`;
    if (seen.has(key)) {
      out.push({
        ...said, verdict: "refused",
        why: "The same thing appears twice in this sheet", product: "",
      });
      continue;
    }
    seen.add(key);

    const product = (code ? known.byCode[code] : undefined)
      ?? known.byName[name.toLowerCase()]
      ?? "";

    /* ⚠️ A QUANTITY WITH NOWHERE TO PUT IT IS A REFUSAL, not a product created
       without its stock. Half an import is worse than none: the catalogue looks
       done and every number is missing. */
    if (said.quantity !== null && !said.location) {
      out.push({ ...said, verdict: "refused", why: "A quantity with no place", product });
      continue;
    }
    if (said.quantity !== null && said.quantity < 0) {
      out.push({ ...said, verdict: "refused", why: "A negative quantity", product });
      continue;
    }

    out.push({ ...said, verdict: product ? "update" : "new", why: "", product });
  }
  return out;
}

/** ⚠️ The three counts a person decides on. A total tells nobody anything. */
export const tallyIn = (planned: readonly Planned[]): Readonly<Record<Verdict, number>> => ({
  new: planned.filter((p) => p.verdict === "new").length,
  update: planned.filter((p) => p.verdict === "update").length,
  refused: planned.filter((p) => p.verdict === "refused").length,
});

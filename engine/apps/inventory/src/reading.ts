/**
 * WHAT A MODEL ANSWERED, READ DEFENSIVELY — pure, and every field optional.
 *
 * ⚠️ A MODEL'S ANSWER IS UNTRUSTED INPUT THAT SOUNDS LIKE A COLLEAGUE. It is
 * fluent, confident and shaped like what was asked for, and it is still a string
 * that arrived over a network from a system with no idea what this workspace
 * holds. Every reader below drops what it cannot understand rather than throwing
 * — a suggestion that is half right is worth showing, and an exception on the
 * request path is a camera that appears broken.
 *
 * ⚠️ AND NOTHING HERE COMMITS ANYTHING. §6.2: AI may fill anything and may
 * commit nothing that carries consequence. These functions turn text into a
 * SUGGESTION; a person presses the button. `scripts/ai-commits.test.mjs` is what
 * keeps that structural rather than a habit.
 */

import { LADDER, type Tracking } from "./ledger.js";

/* ------------------------------------------------------------------- json --- */

/**
 * ⚠️ MODELS FENCE THEIR JSON AND TALK AROUND IT, however firmly they are asked
 * not to. "Here is the record:" followed by a ```json block is the ordinary
 * answer, not the exception — so the fence is stripped and the first balanced
 * object or array is taken. A parser that demanded a bare document would fail on
 * most real answers and report it as the model being unavailable.
 */
export function readJson(text: string): unknown {
  const clean = text.replace(/^[\s\S]*?```(?:json)?/i, "").replace(/```[\s\S]*$/, "");
  const body = clean.trim() || text.trim();

  /* ⚠️ THE FIRST BRACE TO THE LAST, because prose either side is the common
     case. It is not a parser — `JSON.parse` is the parser, and this only decides
     where to start it. */
  for (const [open, close] of [["{", "}"], ["[", "]"]] as const) {
    const from = body.indexOf(open);
    const to = body.lastIndexOf(close);
    if (from === -1 || to <= from) continue;
    try {
      return JSON.parse(body.slice(from, to + 1)) as unknown;
    } catch { /* the other bracket, or nothing */ }
  }
  return null;
}

const at = (of: unknown, key: string): unknown =>
  (of && typeof of === "object" ? (of as Record<string, unknown>)[key] : undefined);

const words = (of: unknown, max = 200): string =>
  (typeof of === "string" ? of.trim().slice(0, max) : "");

const count = (of: unknown): number => {
  const n = Number(of);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
};

/* ---------------------------------------------------------------- product --- */

/**
 * WHAT A MODEL THINKS A THING IS.
 *
 * ⚠️ EVERY FIELD IS A SUGGESTION AND THE SCREEN SAYS SO. Name, brand and
 * category are filled without asking because getting one wrong costs a rename;
 * `tracking` carries its own REASON because "batched" with no explanation is a
 * magic guess, and "batched — it has an expiry date" is something somebody can
 * agree with in half a second.
 */
export interface Guessed {
  readonly name: string;
  readonly brand: string;
  readonly category: string;
  readonly unit: string;
  /** How many base units the thing pictured holds. `0` where it did not say. */
  readonly pack: number;
  /** ⚠️ Empty where the answer named a rung this product does not have. */
  readonly tracking: Tracking | "";
  /** Why that rung — the half that makes it a suggestion rather than a guess. */
  readonly why: string;
  readonly storage: string;
  readonly handling: string;
  /**
   * ⚠️ WHAT IT IS, IN A SENTENCE, AND ONLY A PHOTOGRAPH OF THE THING CAN GIVE
   * IT. A barcode lookup answers with a name and a label answers with what is
   * printed; neither says "a 5 litre jerrican of blue screenwash with a
   * pull-out spout", which is what somebody scrolling a catalogue of four
   * hundred rows is actually reading.
   */
  readonly description: string;
  /**
   * ⚠️ THE WORDS THIS THING IS FILED UNDER, AND THEY ARE MATCHED BEFORE THEY ARE
   * MINTED. The caller hands the model the tags this workspace already uses, so
   * the answer is mostly a choice from a list — see `product.see`. Without that
   * the same model produces "Cleaning", "Cleaning products" and "Janitorial" on
   * three consecutive mornings and the catalogue cannot be filtered by the thing
   * it was filed under.
   */
  readonly tags: readonly string[];
  /**
   * ⚠️ HAZARDS ARE SUGGESTED WITH A SOURCE, NEVER FILLED. A wrong GHS class on a
   * label is a legal document that is wrong, and the person printing it is the
   * one who has to answer for it.
   */
  readonly hazards: readonly string[];
  /**
   * ⚠️ HOW LONG IT KEEPS FROM THE DAY IT WAS MADE, IN DAYS. Labels say "24
   * months from manufacture" or print an open-jar symbol reading `12M`, and
   * both are shelf lives a photograph can read — so a delivery whose box shows
   * only a manufacture date gets an expiry instead of none at all.
   *
   * ⚠️ IT IS A DURATION AND NEVER A DATE. The date on the box belongs to the
   * DELIVERY, and two deliveries of one thing expire on different days; how
   * long the thing keeps is a fact about the thing. A model answering with a
   * date would put one delivery's expiry on the whole catalogue row.
   */
  readonly shelfDays: number;
  /** ⚠️ Days after opening — the PAO symbol, and "use within 28 days". */
  readonly openDays: number;
  /**
   * ⚠️ A PICTOGRAM WAS SEEN, WHICH IS NOT A CLASSIFICATION AND MUST NOT BECOME
   * ONE. Reading "there is an orange diamond on this" off a photograph is
   * observation; deciding WHICH hazard class it declares is a legal statement,
   * and it is `product.read`'s to make against a label somebody deliberately
   * photographed. This is what lets the sheet say "read the label" instead of
   * quietly registering a solvent as if it were shampoo.
   */
  readonly hazardous: boolean;
}

const EMPTY: Guessed = {
  name: "", brand: "", category: "", unit: "", pack: 0, tracking: "", why: "",
  storage: "", handling: "", description: "", tags: [], hazards: [],
  shelfDays: 0, openDays: 0, hazardous: false,
};

export function guessedIn(of: unknown): Guessed {
  if (!of || typeof of !== "object") return EMPTY;
  const rung = words(at(of, "tracking"), 20).toLowerCase();
  return {
    name: words(at(of, "name")),
    brand: words(at(of, "brand"), 120),
    category: words(at(of, "category"), 120),
    unit: words(at(of, "unit"), 24),
    pack: count(at(of, "pack")),
    /* ⚠️ CLAMPED TO THE LADDER THIS PRODUCT ACTUALLY HAS. A model answering
       "serialised" is answering a question about a different app, and storing it
       would put a rung in the column that no branch anywhere reads. */
    tracking: (LADDER as readonly string[]).includes(rung) ? rung as Tracking : "",
    why: words(at(of, "why"), 200),
    storage: words(at(of, "storage"), 2_000),
    handling: words(at(of, "handling"), 2_000),
    description: words(at(of, "description"), 400),
    /* ⚠️ SIX, AND TRIMMED. A model handed a picture and asked for categories
       will produce fifteen, every one arguably true, and a product filed under
       fifteen things is filed under none of them. */
    tags: Array.isArray(at(of, "tags"))
      ? (at(of, "tags") as readonly unknown[]).map((t) => words(t, 60)).filter(Boolean).slice(0, 6)
      : [],
    hazards: Array.isArray(at(of, "hazards"))
      ? (at(of, "hazards") as readonly unknown[]).map((h) => words(h, 80)).filter(Boolean).slice(0, 12)
      : [],
    /* ⚠️ CLAMPED TO TEN YEARS, THE SAME CEILING THE FIELD DECLARES. A model
       answering `36500` for "10 years" and one answering `36500` for a typo are
       the same number; what stops the second is the column's own bound, and a
       reader that let it through would be handing the door a value it refuses. */
    shelfDays: Math.min(count(at(of, "shelfDays")), 3_650),
    openDays: Math.min(count(at(of, "openDays")), 3_650),
    /* ⚠️ ONLY EXACTLY `true`. A model answering "maybe" or "1" is a model that
       did not answer this question, and a truthiness test would read either as
       yes — which puts a hazard warning on a box of gloves. */
    hazardous: at(of, "hazardous") === true,
  };
}

/* ------------------------------------------------------------ a delivery --- */

/**
 * ONE LINE A DELIVERY NOTE APPEARS TO CARRY.
 *
 * ⚠️ EVERY LINE IS CONFIRMED, WITHOUT EXCEPTION. A photograph of a delivery note
 * replaces thirty scans, which is the whole value of it — and a quantity read
 * off a creased page by a model is exactly the kind of consequence §6.2 refuses
 * to commit. The screen shows the lines; a person presses receive.
 */
export interface Noted {
  readonly code: string;
  readonly name: string;
  readonly quantity: number;
  readonly lot: string;
  readonly expiry: string;
}

/** ⚠️ A delivery note is one page. More rows than this is a misread page. */
const MOST_LINES = 60;

export function notedIn(of: unknown): readonly Noted[] {
  const rows = Array.isArray(of) ? of : Array.isArray(at(of, "lines")) ? at(of, "lines") : null;
  if (!Array.isArray(rows)) return [];

  const out: Noted[] = [];
  for (const row of rows.slice(0, MOST_LINES)) {
    const name = words(at(row, "name"));
    const code = words(at(row, "code"), 64);
    /* ⚠️ A LINE WITH NEITHER A NAME NOR A CODE IS NOT A LINE. It is a total, a
       column heading or a smudge, and putting it on screen as something to
       receive makes the person check every row rather than the wrong ones. */
    if (!name && !code) continue;
    out.push({
      code, name,
      quantity: count(at(row, "quantity")),
      lot: words(at(row, "lot"), 64),
      /* ⚠️ ONLY A REAL CALENDAR DAY. "Q3 2027" and "see box" are things a page
         says and a date column cannot hold; storing either would put a string
         where every shelf-life comparison expects `YYYY-MM-DD`. */
      expiry: /^\d{4}-\d{2}-\d{2}$/.test(words(at(row, "expiry"), 10))
        ? words(at(row, "expiry"), 10)
        : "",
    });
  }
  return out;
}

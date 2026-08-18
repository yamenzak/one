/**
 * WHAT A CALL COSTS, AND WHO PAYS FOR THE DIFFERENCE.
 *
 * ⚠️ A RESERVE IS A CEILING ON REVENUE, NOT AN ESTIMATE. Settlement charges
 * `min(held, actual)`, so every unit an estimate fails to anticipate is a unit
 * the platform pays for and the customer does not — silently, on every call,
 * for ever. The cap is there so a runaway cannot bankrupt a customer; the
 * consequence is that an optimistic estimate cannot be caught by anything
 * downstream, because nothing downstream is allowed to charge more.
 *
 * ⚠️ SO THE RESERVE AND THE THING RESERVED FOR COME FROM ONE CALL. `plan` returns
 * the prompt AND the reserve it implies together, because a caller that computes
 * them separately can hand a different text to each — and unit tests on the two
 * halves separately pass while it does.
 *
 * ⚠️ AND A MISSING USAGE REPORT FALLS BACK TO THE RESERVE, NEVER TO A RECOUNT. A
 * recount is a guess, and because of the cap a guess can only ever charge less
 * than the truth. The reserve is the number that was already justified.
 *
 * Layer 2. Imports primitives.
 */

/* ------------------------------------------------------------------ shape --- */

export interface Reserve {
  readonly credits: number;
  /** What it was held for. Carried so a settlement cannot be applied to another. */
  readonly of: string;
}

export interface Usage {
  readonly input: number;
  readonly output: number;
}

/**
 * What is actually charged.
 *
 * ⚠️ THE `Math.min` IS THE INVARIANT AND IT IS ONE LINE. Removing it makes a bad
 * estimate a customer's bill; keeping it makes a bad estimate ours. Both are
 * costs — this is the one we chose, and it is only survivable because the
 * estimate is honest.
 */
export const settle = (held: Reserve, actual: number | null): number =>
  Math.min(held.credits, actual ?? held.credits);

/* --------------------------------------------------------------- estimate --- */

export interface Rate {
  /** Credits per thousand input units. */
  readonly input: number;
  readonly output: number;
  /** ⚠️ Per model, never global. A global markup is one number for twelve
      different margins, and the cheapest model subsidises the dearest. */
  readonly markup: number;
}

export interface Shape {
  /** Everything sent, characters. ⚠️ INCLUDING the system text — see `plan`. */
  readonly promptChars: number;
  /** The ceiling actually requested of the model, not a typical answer. */
  readonly maxOutput: number;
  /**
   * ⚠️ CHARACTERS PER UNIT, AND FOUR IS AN ENGLISH AVERAGE. Arabic runs nearer
   * two, so a fixed four halves the estimate for a whole market — a market that
   * is then served at a loss without anything reporting it.
   */
  readonly charsPerUnit: number;
  /** ⚠️ A model that thinks bills for tokens nobody asked for and nobody sees. */
  readonly thinks?: boolean;
}

/** ⚠️ Room for reasoning nobody requested. Measured, not chosen for tidiness. */
export const THINKING_HEADROOM = 1.4;

export function estimate(shape: Shape, rate: Rate): number {
  const input = Math.ceil(shape.promptChars / Math.max(1, shape.charsPerUnit));
  const output = shape.thinks ? Math.ceil(shape.maxOutput * THINKING_HEADROOM) : shape.maxOutput;
  const raw = (input / 1000) * rate.input + (output / 1000) * rate.output;
  return Math.ceil(raw * (1 + rate.markup));
}

/**
 * ⚠️ THE SHAPE THAT MAKES THE FIX HOLD. The prompt and the reserve leave
 * together, so nothing can budget for one text and send another. A previous
 * platform fixed the same four under-counts as separate functions and a later
 * edit restored the defect with every test still green — which is what the
 * defect WAS.
 */
export interface Planned {
  readonly system: string;
  readonly prompt: string;
  readonly reserve: Reserve;
}

export function plan(
  of: string,
  system: string,
  prompt: string,
  rate: Rate,
  maxOutput: number,
  opts: { readonly charsPerUnit?: number; readonly thinks?: boolean } = {},
): Planned {
  const credits = estimate({
    promptChars: system.length + prompt.length,
    maxOutput,
    charsPerUnit: opts.charsPerUnit ?? 4,
    thinks: opts.thinks,
  }, rate);
  return { system, prompt, reserve: { credits, of } };
}

/** Credits from a real usage report, at the same rate the reserve used. */
/* DEFER(engine-27) stage:27 — the settle half of a reserve nothing takes. */
export const charged = (usage: Usage, rate: Rate): number =>
  Math.ceil(((usage.input / 1000) * rate.input + (usage.output / 1000) * rate.output) * (1 + rate.markup));

/* ------------------------------------------------------------------ packs --- */

/**
 * WHAT SOMEBODY BUYS WHEN THE MONTH'S ALLOWANCE RUNS OUT.
 *
 * ⚠️ THE PACKS ARE THE DEPLOYMENT'S, LIKE THE PLANS, AND FOR THE SAME REASON.
 * There is one wallet per workspace; a pack declared by a product would be a
 * top-up into a shared balance that only one product could sell, and the second
 * product's customers would be told to buy credits somewhere else.
 *
 * ⚠️ AND WHAT IS BOUGHT NEVER EXPIRES, so there is no `expiresDays` here. An
 * expiring pack is a third balance and a sweep to empty it, and it takes back
 * something somebody paid cash for on a day they were not looking. The month's
 * ALLOWANCE is the thing that lapses, and it lapses because it was free.
 */
export interface PackDef {
  readonly id: string;
  readonly name: string;
  readonly credits: number;
  /** Minor units. */
  readonly price: number;
  readonly currency: string;
  readonly order: number;
}

export type PackRefusal = "free_credits" | "empty_pack" | "pack_ids_clash" | "mixed_currency";

export interface PackProblem { readonly pack: string; readonly why: PackRefusal; readonly detail: string }

/**
 * ⚠️ `free_credits` IS A PRICE OF ZERO ON SOMETHING THAT COSTS US MONEY TO
 * HONOUR. It is always a mistake in the catalogue rather than a promotion —
 * a promotion is a discount on a real price, which stays a real price.
 */
export function refusePacks(packs: readonly PackDef[]): readonly PackProblem[] {
  const out: PackProblem[] = [];
  const seen = new Set<string>();
  for (const p of packs) {
    if (p.credits <= 0) out.push({ pack: p.id, why: "empty_pack", detail: "sells no credits" });
    if (p.credits > 0 && p.price <= 0) {
      out.push({ pack: p.id, why: "free_credits", detail: `${p.credits} credits for nothing` });
    }
    /* ⚠️ TWO PACKS ON ONE ID IS A CHECKOUT THAT CHARGES FOR ONE AND GRANTS THE
       OTHER, because every lookup past this point is `find` on the id. */
    if (seen.has(p.id)) out.push({ pack: p.id, why: "pack_ids_clash", detail: "two packs share an id" });
    seen.add(p.id);
  }
  /* ⚠️ ONE CURRENCY, because a wallet holds credits and not money: two packs
     priced in different currencies make "what a credit costs" a question with
     two answers and no exchange rate anywhere to reconcile them. */
  const currencies = new Set(packs.map((p) => p.currency));
  if (currencies.size > 1) {
    out.push({ pack: "", why: "mixed_currency", detail: [...currencies].join(", ") });
  }
  return out;
}

/* ------------------------------------------------------------------ meter --- */

/**
 * ⚠️ WHAT AN OPERATION SPENDS, WHERE IT IS NOT A FIXED NUMBER. A fixed cost goes
 * on the operation itself; this is for the metered path, and it names the rate
 * table row rather than carrying a number, so a price change is one row.
 */
export interface MeterDef {
  readonly id: string;
  readonly label: string;
  /** The lane — which model catalogue row supplies the rate. */
  readonly lane: string;
  /** ⚠️ The ceiling the reserve is computed from. Never "whatever it returns". */
  readonly maxOutput: number;
}

export type MeterBook = Readonly<Record<string, MeterDef>>;

/** ⚠️ A meter with no ceiling reserves nothing and settles at whatever arrived. */
export const unbounded = (book: MeterBook): readonly string[] =>
  Object.values(book).filter((m) => !(m.maxOutput > 0)).map((m) => m.id);

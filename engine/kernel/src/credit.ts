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

/**
 * ⚠️ WHATEVER THE MODEL COUNTED, WHICH IS NOT ALWAYS TOKENS. An image model
 * bills per image, a transcriber per second of audio, a voice per character.
 * Naming the field `tokens` is how a rate table comes to be unable to express
 * half the catalogue — see `Meter`.
 */
export interface Usage {
  readonly input: number;
  readonly output: number;
}

/**
 * ⚠️ A THOUSANDTH OF A CREDIT, AND IT IS WHY THERE IS NO ROUNDING GIFT. A credit
 * is worth a cent, and a small classification costs us a fraction of one — so a
 * whole-credit charge is a several-hundred-fold overcharge on a cheap call and
 * makes every call, dear or cheap, read as "1 credit" on the statement. The
 * ledger takes whole credits and the remainder accrues, exactly as the storage
 * meter already does.
 */
export const MILLI = 1000;

/**
 * What is actually charged, in MILLI-credits.
 *
 * ⚠️ THE `Math.min` IS THE INVARIANT AND IT IS ONE LINE. Removing it makes a bad
 * estimate a customer's bill; keeping it makes a bad estimate ours. Both are
 * costs — this is the one we chose, and it is only survivable because the
 * estimate is honest and because something outside our own arithmetic checks it.
 *
 * ⚠️ AND THE CAP IS THE RESERVE CONVERTED, NOT COMPARED. The hold is whole
 * credits because a balance is; the charge is milli because a price is. Comparing
 * the two without converting caps every charge at a thousandth of the hold, which
 * would not fail anywhere — it would just quietly make everything free.
 */
export const settle = (held: Reserve, actualMilli: number | null): number =>
  Math.min(held.credits * MILLI, actualMilli ?? held.credits * MILLI);

/* --------------------------------------------------------------- estimate --- */

/**
 * ⚠️ WHAT A MODEL BILLS BY, BECAUSE IT IS NOT ALWAYS A TOKEN. A rate table in
 * credits-per-thousand-tokens cannot express an image model (per image), a
 * transcriber (per second of audio) or a voice (per character in, per second
 * out) — and a platform whose pricing shape only fits text is one that meters
 * every other lane at zero or refuses to sell it.
 *
 * ⚠️ THE METER DECIDES WHAT IS COUNTED, NEVER WHAT IS CHARGED. The charge comes
 * from what the run actually consumed; this is what turns a prompt into an
 * expected consumption so a reserve can be taken before it runs.
 */
export type Meter = "token" | "image" | "second" | "character";

export interface Rate {
  readonly meter: Meter;
  /** ⚠️ MILLI-credits per thousand input units — see `MILLI`. */
  readonly input: number;
  readonly output: number;
  /**
   * ⚠️ A MULTIPLIER, SO `5` IS FIVE TIMES. It was `markup` applied as
   * `1 + markup`, which makes "five times" the number four — in a console field,
   * on a live catalogue, typed by somebody who read the label. A margin that can
   * be off by 25% because of an arithmetic convention is not a convention worth
   * keeping.
   *
   * ⚠️ AND IT IS PER MODEL, NEVER GLOBAL. One number for twelve different costs
   * is the cheapest model subsidising the dearest.
   */
  readonly multiplier: number;
}

export interface Shape {
  /** Everything sent, characters. ⚠️ INCLUDING the system text — see `plan`. */
  readonly promptChars: number;
  /** The ceiling actually requested of the model, not a typical answer. */
  readonly maxOutput: number;
  /**
   * ⚠️ WHAT THE LANE COUNTS, WHEN CHARACTERS ARE NOT IT. An image request is one
   * unit in and `n` out; a transcription is the audio's seconds. Given, the
   * character derivation below is skipped entirely — which is the only way a
   * non-text lane gets a reserve that means anything.
   */
  readonly units?: Usage;
  /** ⚠️ A model that thinks bills for tokens nobody asked for and nobody sees. */
  readonly thinks?: boolean;
  /**
   * ⚠️ HOW MANY PICTURES ARE BEING LOOKED AT, because none of them is in the
   * character count. A photograph of a delivery note costs more input than the
   * whole instruction around it, and a reserve computed from the text alone
   * budgets for a fraction of the call — which the settle cap then turns into
   * tokens the platform pays for and the workspace does not.
   */
  readonly images?: number;
}

/**
 * ⚠️ WHAT ONE PICTURE COSTS TO LOOK AT, AND IT IS DELIBERATELY GENEROUS.
 * Providers price an image by its tiles, so the true number is between about two
 * hundred and two thousand tokens depending on how big it arrives — and the two
 * directions are not symmetrical. Over-reserving holds a few credits for the
 * length of one call and releases them at settle; under-reserving is capped by
 * `settle` and paid for by us, silently, on every call for ever.
 */
export const TOKENS_PER_IMAGE = 2_000;

/** ⚠️ Room for reasoning nobody requested. Measured, not chosen for tidiness. */
export const THINKING_HEADROOM = 1.4;

/**
 * CHARACTERS PER TOKEN, MEASURED FROM THE TEXT RATHER THAN ASSUMED.
 *
 * ⚠️ FOUR IS AN ENGLISH AVERAGE AND ARABIC RUNS NEARER TWO, so a fixed four
 * halves the estimate for a whole market — which is then served at a loss, on
 * every call, with nothing reporting it. A constant somebody must remember to
 * override is a constant nobody overrides.
 *
 * ⚠️ DERIVED, NOT DETECTED. Identifying a language would be wrong on mixed text,
 * which is most text; the share of non-ASCII is a property of the actual bytes
 * being sent and is right on a sentence that switches halfway.
 */
export const DENSE = 2;
export const SPARSE = 4;

export function charsPerToken(text: string): number {
  if (!text) return SPARSE;
  let wide = 0;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) > 127) wide++;
  const share = wide / text.length;
  return SPARSE - share * (SPARSE - DENSE);
}

/**
 * WHAT A LANE'S OWN METER COUNTS, BEFORE ANY OF IT IS PRICED (D80).
 *
 * ⚠️ THE CHARACTER DERIVATION IS A TOKEN LANE'S ARITHMETIC AND MEANS NOTHING
 * ANYWHERE ELSE. A picture is not four characters and a spoken sentence is not a
 * completion; run through the token path, an image request reserves whatever its
 * prompt happened to be long, which under `settle`'s cap is a bill we pay.
 *
 * ⚠️ AND FOR THREE OF THE FOUR THIS IS STRICTER THAN THE TOKEN LANE, NOT LOOSER.
 * A token reserve estimates the answer's length from a density heuristic; these
 * count something already known — how many images were asked for, how many
 * characters were handed over — so the hold is arithmetic over a quantity rather
 * than a guess about one. "We stopped estimating" reads as a weakening and it is
 * the opposite.
 *
 * ⚠️ IT READS THE RATE'S OWN METER RATHER THAN TAKING ONE, which is what makes a
 * mismatch unwriteable: the meter and the prices it goes with are one object, so
 * nothing can price by the token and count by the second.
 */
export function unitsFor(shape: Shape, meter: Meter): Usage {
  switch (meter) {
    /* ⚠️ ONE REQUEST IN, `maxOutput` PICTURES OUT — and `promptChars` is not part
       of it. An image model prices the images; the words that asked for them are
       not what it bills. */
    case "image":
      return { input: 0, output: Math.max(1, Math.trunc(shape.maxOutput)) };
    /* ⚠️ SPOKEN TEXT IS BILLED ON WHAT WENT IN, and there is no output to guess:
       the audio's length is a consequence of the characters, which are already
       counted. `maxOutput` is not a second quantity here. */
    case "character":
      return { input: Math.max(0, Math.trunc(shape.promptChars)), output: 0 };
    /*
      ⚠️ SECONDS ARE THE ONE A CALLER CANNOT COUNT — see `lane:listen`'s marker.
      A caller holds bytes, and a container's duration is not derivable from its
      length. Reserving zero would be a call with no hold at all, so this counts
      what was HANDED OVER and leaves the lane refused at composition, where the
      absence is a build failure rather than a free call.
    */
    case "second":
      return { input: Math.max(0, Math.trunc(shape.units?.input ?? 0)), output: 0 };
    case "token":
      return shape.units ?? {
        input: Math.ceil(shape.promptChars / SPARSE),
        output: shape.maxOutput,
      };
  }
}

export function estimate(shape: Shape, rate: Rate): number {
  /* ⚠️ THE METER DECIDES WHAT IS COUNTED, and an explicit `units` still wins —
     a caller that counted for itself (a vision call with its pictures already
     tallied) is the case `units` exists for. */
  const counted = shape.units && rate.meter === "token"
    ? shape.units
    : unitsFor(shape, rate.meter);
  /* ⚠️ THINKING IS TOKENS, so the headroom belongs to the lane that counts them.
     Applied to a count of images it would reserve for 1.4 pictures, which is not
     a quantity anything can produce or bill for. */
  const output = shape.thinks && rate.meter === "token"
    ? Math.ceil(counted.output * THINKING_HEADROOM)
    : counted.output;
  /*
    ⚠️ ADDED WHETHER OR NOT THE UNITS WERE GIVEN, and that is the safe direction
    rather than an oversight. A caller who counted its pictures already is
    over-reserved by one image and gets it back at settle; a caller who did not
    would be under-reserved by the largest single input in the whole request.

    ⚠️ AND IT IS THE TOKEN LANE'S ARITHMETIC, because `TOKENS_PER_IMAGE` is
    tokens. A picture SENT to a model that bills by the character would add two
    thousand characters to the bill for a thing that is not text at all.
  */
  const input = counted.input + (rate.meter === "token"
    ? Math.max(0, Math.trunc(shape.images ?? 0)) * TOKENS_PER_IMAGE
    : 0);
  const milli = (input / 1000) * rate.input + (output / 1000) * rate.output;
  /* ⚠️ THE RESERVE IS WHOLE CREDITS BECAUSE A BALANCE IS. Rounding UP here is a
     hold that is slightly too large, released the moment it settles; rounding
     down is a hold that does not cover the call. */
  return Math.ceil((milli * rate.multiplier) / MILLI);
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
  opts: {
    readonly units?: Usage;
    readonly thinks?: boolean;
    /** ⚠️ How many pictures go with the words — see `Shape.images`. */
    readonly images?: number;
  } = {},
): Planned {
  const chars = system.length + prompt.length;
  const credits = estimate({
    promptChars: chars,
    maxOutput,
    images: opts.images,
    /* ⚠️ THE DENSITY IS TAKEN FROM THE TEXT BEING SENT, here, once — the only
       place that holds both the system half and the prompt half at the same
       time. A caller passing it separately is a caller that can pass one text's
       density with another text's characters. */
    units: opts.units ?? {
      input: Math.ceil(chars / charsPerToken(system + prompt)),
      output: maxOutput,
    },
    thinks: opts.thinks,
  }, rate);
  return { system, prompt, reserve: { credits, of } };
}

/**
 * MILLI-CREDITS FROM A USAGE REPORT, at the same rate the reserve used.
 *
 * ⚠️ THIS IS THE FALLBACK, NOT THE PRICE. What a call cost is known exactly by
 * whoever billed us for it; recomputing it from a unit count and our own copy of
 * a rate table is a second answer that drifts the day a provider changes
 * anything. Use `priced` where a real cost is available, and this only where it
 * is not.
 */
export const chargedFor = (usage: Usage, rate: Rate): number =>
  Math.round(((usage.input / 1000) * rate.input + (usage.output / 1000) * rate.output)
    * rate.multiplier);

/**
 * MILLI-CREDITS FROM WHAT IT ACTUALLY COST US.
 *
 * ⚠️ THE ONE FORMULA, FOR EVERY LANE. Tokens, images, seconds of audio, a song —
 * whoever billed us counted it in whatever unit that model bills in, so a price
 * built on their number needs no unit of its own and cannot disagree with the
 * invoice. This is what makes an image lane and a text lane the same code.
 */
export const priced = (costMilli: number, multiplier: number): number =>
  Math.round(costMilli * multiplier);

/** ⚠️ Cloudflare bills in dollars; the wallet is in credits; a credit is a cent. */
export const CREDIT_USD = 0.01;

export const milliFromUsd = (usd: number): number => Math.round((usd / CREDIT_USD) * MILLI);

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

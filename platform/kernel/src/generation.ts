/**
 * GENERATION — what an app may ASK a model for, declared.
 *
 * Layer 2. Imports primitives and the metering arithmetic.
 *
 * ⚠️ THE CATALOGUE IS THE PLATFORM'S AND THE ACTION IS THE APP'S, and the split
 * is the whole design. Rates are a fact about a provider's price list, identical
 * in every product, and getting one wrong is a transfer rather than a bug. What
 * to ask for is what makes a product different, and a platform that held prompts
 * would be a platform every app had to be edited into.
 *
 * ⚠️ SO AN APP DECLARES NO MODELS AT ALL. It used to declare both, with the
 * shared store correcting the RATES of models the app had already named — which
 * meant a model added by an operator reached nobody until every app's manifest
 * was edited and redeployed. An action names a LANE, and which models are in a
 * lane is one row an operator types once for every product behind the
 * deployment.
 *
 * ⚠️ A MODEL'S ID IS ITS PROVIDER PATH. A short slug beside a `path` column is
 * one indirection and it is the one that kept a shipping product's catalogue
 * from ever being shared: two apps chose different slugs for the same model, so
 * a rate published by one was invisible to the other. There is nothing to
 * disagree about when the key IS the address.
 */

import type { Run } from "./meter.js";
import { planImages, planRun } from "./meter.js";

/* --------------------------------------------------------------- the lane --- */

/**
 * WHAT SHAPE GOES IN AND WHAT SHAPE COMES OUT.
 *
 * ⚠️ A LANE IS A MODALITY, AND THAT IS WHY THE METER CAN READ IT. Three of these
 * are priced per unit of text and three per thing produced, and picking the
 * wrong arithmetic is not a rounding error — an image run through the unit
 * arithmetic is billed at the cost of the sentence that asked for it. Deriving
 * the shape from the lane makes it one decision instead of one per action.
 *
 * ⚠️ "SHORT TEXT" IS NOT A LANE, AND IT WAS ASKED FOR. It is a SIZE, and an
 * action already declares its own in `maxOutput`. As a lane it would be a filter
 * that refuses every capable model — a large model can produce a short answer,
 * so a `brief` action offered only `brief` models would hide the whole catalogue
 * behind a distinction with no fact under it.
 */
export type Lane = "text" | "vision" | "image" | "speech" | "transcribe" | "video";

export const LANES: readonly Lane[] = ["text", "vision", "image", "speech", "transcribe", "video"];

/**
 * ⚠️ WHICH LANES ARE PRICED PER THING PRODUCED. A picture, a spoken clip and a
 * video are billed per output by every provider that sells them; there is no
 * output ceiling that means anything and no usage report that would make one
 * cheaper.
 */
export const PRODUCING: readonly Lane[] = ["image", "speech", "video"];

/** ⚠️ Which lanes are given something besides text, and therefore priced for it. */
export const ATTACHING: readonly Lane[] = ["vision", "transcribe"];

export const produces = (lane: Lane): boolean => PRODUCING.includes(lane);
export const attaches = (lane: Lane): boolean => ATTACHING.includes(lane);

/* -------------------------------------------------------------- the model --- */

/**
 * One model in the DEPLOYMENT's catalogue. Typed here, stored by the runtime,
 * entered by an operator — never declared by an app.
 */
export interface ModelSpec {
  /** ⚠️ The provider path, exactly. `@cf/meta/llama-3.1-8b-instruct`, `gemini-2.5-flash`. */
  readonly id: string;
  /** Which lane runs it — the Workers AI binding, the Gemini key, whatever comes next. */
  readonly provider: string;
  /** ⚠️ What it does. The meter reads this to decide which arithmetic applies. */
  readonly lane: Lane;
  /**
   * ⚠️ WHAT THE PROVIDER CHARGES, in credits per unit, input and output
   * separately — because every provider prices them differently and a single
   * blended rate is wrong in whichever direction the request is unbalanced,
   * which for generation is always the output side.
   *
   * ⚠️ THIS IS COST, NOT PRICE. `markup` is what turns one into the other, and
   * nothing may compute money from this field directly — see `priced`.
   */
  readonly rate: { readonly input: number; readonly output: number };
  /**
   * ⚠️ COST PER THING PRODUCED, for the three lanes that are billed that way. A
   * picture, a spoken clip and a video are priced per output by every provider
   * that sells them; forcing one through the unit arithmetic bills it at the
   * cost of the sentence that asked for it.
   */
  readonly perOutput?: number;
  /**
   * ⚠️ INPUT UNITS ONE ATTACHMENT COSTS. Providers bill a picture or a recording
   * as a flat block of input units — more than most prompts — and none of it is
   * visible in the text. A vision call metered on its words alone holds almost
   * nothing, the cap settles at almost nothing, and every photograph is one the
   * platform pays for in full.
   */
  readonly attachmentUnits?: number;
  /**
   * ⚠️ A MODEL THAT REASONS BEFORE ANSWERING SPENDS UNITS THE REQUEST DOES NOT
   * SHOW, so the reserve widens for it. A property of the model rather than of
   * the thing being asked.
   */
  readonly thinking?: boolean;
  /**
   * ⚠️ WHAT THE PLATFORM CHARGES ON TOP, as a multiplier. `1` is at cost.
   *
   * It is on the MODEL rather than deployment-wide because margins are not
   * uniform: a model that is cheap to run and expensive to support is not the
   * same trade as one where the provider takes most of the price. One number for
   * everything means the operator sets it by the worst case and overcharges for
   * the rest.
   *
   * ⚠️ AND IT IS APPLIED EXACTLY ONCE, IN `priced`. Applied at the reserve and
   * again at the settle it doubles; applied at one and not the other, the cap
   * and the charge disagree and the difference is silently the platform's.
   */
  readonly markup: number;
  /**
   * ⚠️ WHETHER THE OPERATOR HAS IT ON. Stored as ENABLED rather than as a
   * disabled list, which is the opposite of what this was: a list of exceptions
   * was right while the catalogue shipped inside an app, because a model added
   * upstream had to reach people without anybody enabling it. The catalogue is
   * typed in by an operator now, so a row exists because somebody meant it, and
   * an explicit switch is what lets one be taken out of service without losing
   * its rate and its history.
   */
  readonly enabled: boolean;
}

export type Catalogue = readonly ModelSpec[];

/* ------------------------------------------------------------- the price --- */

declare const PRICED: unique symbol;

/**
 * A model whose numbers are what the WORKSPACE pays, not what the provider
 * charges.
 *
 * ⚠️ THE BRAND EXISTS BECAUSE MARKUP IS THE KIND OF THING THAT GETS APPLIED
 * TWICE OR NOT AT ALL. Both failures are silent and neither is visible in a
 * green suite: not at all is every generation sold at cost forever, twice is a
 * reserve that holds double and a workspace whose credits drain at twice the
 * rate it was quoted. Reserve and settle both read this type, so there is one
 * place the multiplication can happen and nothing else can reach the raw rate.
 */
export type Priced = ModelSpec & { readonly [PRICED]: true };

/**
 * Cost → price.
 *
 * ⚠️ IDEMPOTENT ON PURPOSE. The markup is spent into the numbers and the field
 * is left at 1, so a second application is arithmetic that changes nothing —
 * which is the cheapest possible defence against the one mistake this whole type
 * exists for.
 */
export function priced(model: ModelSpec): Priced {
  const m = model.markup > 0 ? model.markup : 1;
  return {
    ...model,
    rate: { input: model.rate.input * m, output: model.rate.output * m },
    ...(model.perOutput === undefined ? {} : { perOutput: model.perOutput * m }),
    markup: 1,
  } as Priced;
}

/* ------------------------------------------------------------- the action --- */

/**
 * One thing an app asks a model for.
 *
 * ⚠️ IT NAMES A LANE AND NEVER A MODEL. Naming one made the app's manifest the
 * catalogue: a model an operator added reached nobody until every product was
 * edited and redeployed, and a model an operator retired left every app pointing
 * at something the provider had stopped answering.
 */
export interface ActionSpec {
  /** One line, in the words of whoever pays for it. */
  readonly summary: string;
  /** ⚠️ What shape this asks for. Which models can serve it follows from this. */
  readonly lane: Lane;
  /**
   * ⚠️ EXACTLY THE TEXT THAT WILL BE SENT, and the app's alone. A workspace may
   * put its own words in front of the PROMPT; the system text is the product's
   * and is not editable anywhere, because it is what makes the action do what
   * the product promises rather than what one workspace felt like today.
   */
  readonly system: string;
  /**
   * ⚠️ WHAT THE REQUEST ASKS FOR, not what a typical answer is. Budgeting the
   * typical answer makes every long one partly free, and long answers are not
   * rare — they are what the expensive requests produce.
   */
  readonly maxOutput: number;
  /**
   * ⚠️ A CEILING PER PERSON PER DAY, and it is not optional. An app-wide balance
   * is spent by whoever asks first: one person looping a draft empties a
   * workspace's credits before anybody else opens the product, and the only
   * signal is a bill.
   */
  readonly dailyPerPerson: number;
  /**
   * ⚠️ HOW MANY THINGS ONE CALL ASKS FOR, in a producing lane, and it is part of
   * the reserve. A request for four that held the price of one is three the
   * platform pays for.
   */
  readonly outputs?: number;
  /**
   * ⚠️ WHETHER THIS ONE HAS TO BE GOOD, and it defaults to cheapest.
   *
   * Naming a model was how a product used to say "read this lab report with the
   * one that reasons" — and losing that with the catalogue was a real regression,
   * not a simplification: a clinical reading answered by whichever model happened
   * to be cheapest is a number a coach acts on, produced by the wrong model, with
   * nothing anywhere saying so.
   *
   * ⚠️ "CAPABLE" MEANS DEAREST IN THE LANE, and the proxy is deliberate. Price is
   * the only signal a catalogue actually carries, and providers do price by
   * capability — a quality score would be a second opinion an operator has to
   * maintain and would be wrong the week after it was typed. An app says which
   * of its actions is worth paying more for; the deployment decides what the
   * options are.
   */
  readonly prefer?: "cheapest" | "capable";
}

export interface AiSpec {
  readonly actions: Readonly<Record<string, ActionSpec>>;
}

/* ------------------------------------------------------------- the reserve --- */

/**
 * What one call to an action will hold, and exactly the two texts it will send.
 *
 * ⚠️ ONE CALL RETURNS ALL THREE, for the reason `planRun` states: separate
 * functions for what is sent and what is held is a shape in which a caller may
 * hand a different document to each, and unit tests over the halves stay green
 * through it.
 *
 * ⚠️ THE MODEL IS PASSED IN AND IS ALREADY PRICED. A reserve is a ceiling on
 * revenue, so it must be computed from the model that is actually going to run
 * and from the numbers actually going to be charged. Looking one up here would
 * be a second decision that can differ from the first.
 */
export function planAction(
  spec: AiSpec, actionId: string, prompt: string, model: Priced,
  /**
   * ⚠️ THE WORKSPACE'S OWN WORDS, MEASURED. It is prepended to the prompt rather
   * than replacing it, and the composed text comes back on the `Run` — sent
   * unmeasured it would be a document the reserve never saw, which for a long
   * preamble on a busy action is a standing discount nobody chose to give.
   */
  preamble = "",
): Run | null {
  const action = spec.actions[actionId];
  if (!action) return null;
  const asked = preamble.trim() ? `${preamble.trim()}\n\n${prompt}` : prompt;

  /*
    ⚠️ A PRODUCING LANE IS PRICED PER THING PRODUCED. Running it through the unit
    arithmetic would hold the cost of the sentence that asked for it, which is a
    fraction of a per-output price — so the cap settles at that fraction and the
    platform pays the rest on every picture, clip and video anybody makes.
  */
  if (produces(action.lane)) {
    return planImages({
      perImage: model.perOutput ?? 0, count: action.outputs ?? 1,
      system: action.system, prompt: asked,
    });
  }
  return planRun({
    system: action.system,
    prompt: asked,
    maxOutput: action.maxOutput,
    thinking: model.thinking ?? false,
    rate: model.rate,
    /*
      ⚠️ THE ATTACHMENT'S OWN UNITS, WHICH ARE NOWHERE IN THE TEXT. Taken from
      the LANE rather than from the caller, so a reserve cannot be computed for
      one request and a picture attached to another.
    */
    ...(attaches(action.lane) ? { imageUnits: model.attachmentUnits ?? 0 } : {}),
  });
}

/* -------------------------------------------------------------- refusals --- */

export interface AiProblem {
  readonly id: string;
  readonly why: string;
}

/**
 * Everything decidable about an APP's declaration before a request exists.
 *
 * ⚠️ EVERY ONE OF THESE COSTS MONEY RATHER THAN THROWING. An action with no
 * system text computes its reserve from a document that is not the one sent; an
 * absent output ceiling is a balance one call can empty; an absent daily bound
 * is one person emptying it before anybody else opens the product. None is
 * visible in a green suite, because each produces a perfectly successful
 * generation.
 *
 * ⚠️ IT NO LONGER CHECKS MODELS, because an app declares none. What a catalogue
 * can get wrong is `catalogueProblems`, and it is checked where the catalogue is
 * WRITTEN — an operator typing a rate, rather than a developer shipping one.
 */
export function aiProblems(spec: AiSpec | undefined): readonly AiProblem[] {
  if (!spec) return [];
  const out: AiProblem[] = [];

  for (const [id, action] of Object.entries(spec.actions)) {
    if (!LANES.includes(action.lane)) {
      out.push({ id, why: `asks for lane "${action.lane}", which is not one the meter can price` });
    }
    if (action.system.trim().length === 0) {
      out.push({ id, why: "sends no system text, so the reserve is computed from a document that is not the one sent" });
    }
    if (!produces(action.lane) && (!Number.isInteger(action.maxOutput) || action.maxOutput < 1)) {
      out.push({ id, why: "asks for no bounded output, so nothing caps what one call can spend" });
    }
    if (produces(action.lane) && action.outputs !== undefined && (!Number.isInteger(action.outputs) || action.outputs < 1)) {
      out.push({ id, why: "asks for a number of outputs that is not a whole number of them" });
    }
    if (!Number.isInteger(action.dailyPerPerson) || action.dailyPerPerson < 1) {
      out.push({ id, why: "sets no daily ceiling per person, so one person can empty the balance before anybody else opens the product" });
    }
  }

  return out;
}

/**
 * Everything a catalogue ROW can get wrong.
 *
 * ⚠️ CHECKED ON THE WAY IN, because this is a live write from a console rather
 * than a manifest read at boot — and a bad row here is wrong for every product
 * behind the deployment at once.
 */
export function catalogueProblems(catalogue: Catalogue): readonly AiProblem[] {
  const out: AiProblem[] = [];
  const seen = new Set<string>();
  for (const m of catalogue) {
    if (seen.has(m.id)) out.push({ id: m.id, why: "is in the catalogue twice, so which rate applies depends on order" });
    seen.add(m.id);
    for (const p of modelProblems(m)) out.push({ id: m.id, why: p });
  }
  return out;
}

/**
 * ⚠️ ONE ROW'S FAULTS, SHARED BY THE WRITE PATH AND THE SWEEP. Two copies of
 * "what makes a rate wrong" is one copy that gets a case added to it.
 */
export function modelProblems(m: ModelSpec): readonly string[] {
  const out: string[] = [];
  if (!LANES.includes(m.lane)) out.push(`is in lane "${m.lane}", which is not one the meter can price`);
  /*
    ⚠️ A ZERO RATE IS NOT "FREE", IT IS UNMETERED. The reserve is zero, the
    settle is zero, the balance never moves and the provider still invoices — so
    the model looks like the cheapest one in the catalogue right up to the end of
    the month.
  */
  if (produces(m.lane)) {
    if (!((m.perOutput ?? 0) > 0)) out.push("produces things and prices none of them, so every one is unmetered");
  } else if (!(m.rate.input > 0) || !(m.rate.output > 0)) {
    out.push("prices a unit at zero or less, so every call to it is unmetered");
  }
  /*
    ⚠️ AND AN ATTACHING LANE WITH NO ATTACHMENT PRICE IS THE EXPENSIVE ONE,
    because it SUCCEEDS: the reserve is computed from the words alone, holds
    almost nothing, settles at almost nothing, and the platform pays for every
    picture. It scales with use, so the cheapest-looking row runs the largest
    invoice.
  */
  if (attaches(m.lane) && !((m.attachmentUnits ?? 0) > 0)) {
    out.push("is given attachments and prices none, so every picture or recording on it is unmetered");
  }
  if (!(m.markup > 0)) out.push("has a markup of zero or less, which sells every call at or below cost");
  return out;
}

/* ----------------------------------------------------------- which model --- */

/**
 * WHO DECIDED WHICH MODEL RUNS THIS.
 *
 * ⚠️ FOUR LAYERS, AND EACH IS A DIFFERENT PERSON'S DECISION. The operator fills
 * and enables the catalogue, because a deployment has a contract and a bill; a
 * workspace picks from what is left, because "which company reads my clients'
 * photographs" is its decision and nobody else's; the region refuses what it
 * does not permit, because residency outranks the other two; and where nobody
 * picked, the cheapest eligible model runs.
 *
 * ⚠️ THE DEFAULT IS THE CHEAPEST RATHER THAN THE FIRST. A catalogue's order is
 * whatever an operator typed, so "first" means a price nobody decided — and it
 * is charged to every workspace that never opened the screen, which is most of
 * them. An action that says `prefer: "capable"` inverts that for itself and
 * nothing else; see `ActionSpec`.
 */
export type ModelSource = "catalogue" | "workspace";

export type ModelChoice =
  | { readonly ok: true; readonly model: Priced; readonly source: ModelSource }
  /**
   * ⚠️ A REFUSAL SAYS WHICH LAYER REFUSED, because they are different things to
   * go and do: ask an operator to add or enable one, pick a different one, or
   * accept that this region permits none. "Unavailable" makes all three the same
   * shrug.
   */
  | { readonly ok: false; readonly why: "unknown_action" | "none_in_lane" | "none_permitted" };

/** ⚠️ Whether a model can do what an action asks — one comparison, no inference. */
export const modelSuits = (model: ModelSpec, action: ActionSpec): boolean => model.lane === action.lane;

export interface Eligibility {
  readonly ai: AiSpec;
  readonly catalogue: Catalogue;
  readonly action: string;
  /**
   * ⚠️ THE REGION'S ALLOW-LIST, BY PROVIDER RATHER THAN BY MODEL. By model id it
   * was a manifest that had to be redeployed whenever an operator added a
   * catalogue row — which is the thing the catalogue move exists to remove. A
   * provider is stable, is what a processing agreement names, and is the only
   * one of the two an app can honestly promise. Empty narrows nothing.
   */
  readonly permitted?: readonly string[];
}

/**
 * Every model a workspace may legitimately choose for one action, cheapest
 * first — PRICED, because every number a screen shows beside a model is a number
 * somebody is deciding to spend.
 */
export function modelsFor(input: Eligibility): readonly Priced[] {
  const action = input.ai.actions[input.action];
  if (!action) return [];
  /* ⚠️ Dearest first where the action says it has to be good — see `prefer`. */
  const way = action.prefer === "capable" ? -1 : 1;
  const permitted = input.permitted ?? [];
  return input.catalogue
    .filter((m) => m.enabled)
    .filter((m) => permitted.length === 0 || permitted.includes(m.provider))
    .filter((m) => modelSuits(m, action))
    .filter((m) => modelProblems(m).length === 0)
    .map(priced)
    .sort((a, b) => way * (costOf(a, action) - costOf(b, action)) || a.id.localeCompare(b.id));
}

/**
 * ⚠️ ONE COMPARABLE NUMBER PER MODEL, so "cheapest" means something across two
 * lanes that are priced differently. It is a ranking rather than a quote — the
 * reserve is the quote — which is why it is deliberately crude and never shown.
 */
const costOf = (m: Priced, action: ActionSpec): number =>
  produces(action.lane)
    ? (m.perOutput ?? 0) * (action.outputs ?? 1)
    : m.rate.input * 1_000 + m.rate.output * action.maxOutput;

/**
 * The one model this call will run, and who decided.
 *
 * ⚠️ A WORKSPACE'S CHOICE IS HONOURED ONLY IF IT IS STILL ELIGIBLE. An operator
 * turning a model off, a region that does not permit it, or a catalogue that
 * dropped it must not leave a workspace pinned to something unreachable — the
 * failure would be one workspace whose generation stopped working, reported as a
 * provider error, months after the change that caused it.
 *
 * ⚠️ AND FALLING BACK IS NOT SILENT: `source` says `catalogue` whenever the
 * workspace's pick did not decide, so a screen can say the choice is no longer
 * available rather than showing it as though it were in effect.
 */
export function chooseModel(input: Eligibility & { readonly chosen?: string | null }): ModelChoice {
  if (!input.ai.actions[input.action]) return { ok: false, why: "unknown_action" };

  const eligible = modelsFor(input);
  if (input.chosen) {
    const picked = eligible.find((m) => m.id === input.chosen);
    if (picked) return { ok: true, model: picked, source: "workspace" };
  }
  const cheapest = eligible[0];
  if (cheapest) return { ok: true, model: cheapest, source: "catalogue" };

  /*
    ⚠️ NOTHING ELIGIBLE SPLITS TWO WAYS, and they are different problems. A lane
    with models that this region refuses is a residency decision somebody has to
    accept; a lane with no models at all is an operator who has not added one,
    which is a thing to go and do.
  */
  const anyInLane = input.catalogue.some((m) => m.enabled && modelSuits(m, input.ai.actions[input.action]!));
  return { ok: false, why: anyInLane ? "none_permitted" : "none_in_lane" };
}

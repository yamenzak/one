/**
 * GENERATION — what an app may ask a model for, declared.
 *
 * Layer 2. Imports primitives and the metering arithmetic.
 *
 * ⚠️ THE CATALOGUE IS THE PLATFORM'S AND THE PROMPT IS THE APP'S, and the split
 * is not stylistic. Rates are a fact about a provider's price list, identical in
 * every product, and getting one wrong is a transfer rather than a bug. What to
 * ask for is the whole of what makes a product different, and a platform that
 * held prompts would be a platform every app had to be edited into.
 *
 * ⚠️ A MODEL'S ID IS ITS PROVIDER PATH. A short slug beside a `path` column is
 * one indirection and it is the one that kept a shipping product's catalogue
 * from ever being shared: two apps chose different slugs for the same model, so
 * a rate published by one was invisible to the other. There is nothing to
 * disagree about when the key IS the address.
 */

import type { Run } from "./meter.js";
import { planImages, planRun } from "./meter.js";

/* -------------------------------------------------------------- the model --- */

export interface ModelSpec {
  /** ⚠️ The provider path, exactly. `@cf/meta/llama-3.1-8b-instruct`, `gemini-2.5-flash`. */
  readonly id: string;
  /** Which lane runs it. One catalogue may hold several. */
  readonly provider: string;
  /**
   * ⚠️ CREDITS PER UNIT, INPUT AND OUTPUT SEPARATELY, because every provider
   * prices them differently and a single blended rate is wrong in whichever
   * direction the request is unbalanced — which for generation is always the
   * output side.
   */
  readonly rate: { readonly input: number; readonly output: number };
  /**
   * ⚠️ A MODEL THAT REASONS BEFORE ANSWERING SPENDS UNITS THE REQUEST DOES NOT
   * SHOW, so the reserve widens for it. Declared per model because it is a
   * property of the model rather than of the thing being asked.
   */
  readonly thinking?: boolean;
  /**
   * ⚠️ INPUT UNITS ONE ATTACHED IMAGE COSTS. Absent means this model cannot be
   * given one — declared per model because a provider prices a picture as a flat
   * block of input units and every provider picks a different block.
   *
   * A vision feature on a model with no figure here is refused at composition,
   * because the reserve would be computed from the text alone: it would hold
   * almost nothing, the cap would settle at almost nothing, and every photograph
   * anybody sends is one the platform pays for in full.
   */
  readonly imageUnits?: number;
  /**
   * ⚠️ CREDITS PER GENERATED IMAGE. A picture is priced per picture, and forcing
   * it through the unit arithmetic bills it at the cost of the sentence that
   * asked for it.
   */
  readonly perImage?: number;
}

/* ------------------------------------------------------------ the feature --- */

export interface FeatureSpec {
  /** One line, in the words of whoever pays for it. */
  readonly summary: string;
  /** ⚠️ Names a declared model. Refused at composition otherwise. */
  readonly model: string;
  /**
   * ⚠️ EXACTLY THE TEXT THAT WILL BE SENT. It is measured to compute the
   * reserve, so a caller that appended to it afterwards would be sending one
   * document and paying for another — which is the shape `planRun` exists to
   * make impossible, carried up to the declaration.
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
   * signal is a bill. Per person per day is the bound that makes the balance a
   * budget rather than a race.
   */
  readonly dailyPerPerson: number;
  /**
   * ⚠️ WHETHER THIS FEATURE IS GIVEN A PICTURE, DECLARED RATHER THAN INFERRED
   * FROM THE CALL.
   *
   * Deciding per request means a caller can attach one to a feature whose model
   * cannot take it, or to a feature whose reserve did not budget for it — and
   * the second is the expensive one, because it succeeds. Declaring it makes the
   * catalogue answerable before anybody calls anything: a feature that takes an
   * image is refused unless its model prices one.
   */
  readonly takes?: "image";
  /**
   * What comes back. `text` unless stated.
   *
   * ⚠️ AN IMAGE IS A DIFFERENT METERING SHAPE, not a different content type on
   * the same one. It is priced per picture, there is no output ceiling that
   * means anything, and what comes back is BYTES — which have to be stored,
   * counted against the workspace's quota and erased with it, none of which a
   * text answer needs.
   */
  readonly produces?: "text" | "image";
  /**
   * ⚠️ HOW MANY IMAGES ONE CALL ASKS FOR, and it is part of the reserve. A
   * request for four that held the price of one is three the platform pays for.
   */
  readonly images?: number;
}

export interface AiSpec {
  readonly models: readonly ModelSpec[];
  readonly features: Readonly<Record<string, FeatureSpec>>;
}

/* ------------------------------------------------------------- the reserve --- */

/**
 * What one call to a feature will hold.
 *
 * ⚠️ ONE CALL RETURNS THE TEXT AND THE RESERVE TOGETHER, for the reason
 * `planRun` states: two functions, one producing what is sent and one producing
 * what is held, is a shape in which a caller may hand a different document to
 * each — and unit tests over the halves separately stay green through it.
 */
export function planFeature(
  spec: AiSpec, featureId: string, prompt: string, rates: Rates = {},
  /**
   * ⚠️ WHICH MODEL IS ACTUALLY GOING TO RUN, because a reserve is a ceiling on
   * revenue and the manifest's default is not always what runs. A workspace may
   * choose a dearer model from the catalogue; budgeting the default would hold
   * the cheap one's price, cap the settle there, and the platform would pay the
   * difference on every call — silently, because nothing fails.
   *
   * It is a parameter rather than a second lookup for the reason `planRun`
   * exists: one call decides the model, and the same decision is used for the
   * reserve and for the run.
   */
  modelId?: string,
): Run | null {
  const feature = spec.features[featureId];
  if (!feature) return null;
  const model = modelFor(spec, modelId ?? feature.model, rates);
  if (!model) return null;
  /*
    ⚠️ A PICTURE IS PRICED PER PICTURE. Running it through the unit arithmetic
    would hold the cost of the sentence that asked for it, which is a fraction
    of a per-image price — so the cap settles at that fraction and the platform
    pays the rest on every image anybody generates.
  */
  if (feature.produces === "image") {
    return planImages({ perImage: model.perImage ?? 0, count: feature.images ?? 1 });
  }
  return planRun({
    system: feature.system,
    prompt,
    maxOutput: feature.maxOutput,
    thinking: model.thinking ?? false,
    rate: model.rate,
    /*
      ⚠️ THE PICTURE'S OWN UNITS, WHICH ARE NOWHERE IN THE TEXT. Declared on the
      FEATURE rather than passed by the caller, so a reserve cannot be computed
      for one request and an image attached to another.
    */
    ...(feature.takes === "image" ? { imageUnits: model.imageUnits ?? 0 } : {}),
  });
}

/**
 * What one model costs, with the deployment's own answer preferred.
 *
 * ⚠️ A RATE IS A FACT ABOUT A PROVIDER'S PRICE LIST, IDENTICAL IN EVERY PRODUCT,
 * and getting one wrong is a transfer rather than a bug: the reserve is the cap
 * on what may be charged, so every unit an out-of-date rate fails to count is a
 * unit the platform pays for and nobody is billed. A manifest is a deploy; a
 * price change is not. So the declared catalogue is a FLOOR — what an app ships
 * knowing — and a shared, correctable rate wins over it.
 *
 * ⚠️ IT NEVER INVENTS A MODEL. A rate for something the app does not declare is
 * ignored, because the system text, the output ceiling and the daily bound are
 * the app's and there is nothing here to supply them. A catalogue entry cannot
 * turn into a feature.
 */
export function modelFor(spec: AiSpec, modelId: string, rates: Rates = {}): ModelSpec | null {
  const declared = spec.models.find((m) => m.id === modelId);
  if (!declared) return null;
  const shared = rates[modelId];
  if (!shared) return declared;
  return {
    ...declared,
    rate: shared.rate,
    /* ⚠️ Whether a model reasons is a fact about the model, so it travels too. */
    ...(shared.thinking === undefined ? {} : { thinking: shared.thinking }),
  };
}

/**
 * Rates a deployment holds centrally, by model id.
 *
 * ⚠️ THE KEY IS THE PROVIDER PATH, which is why the id IS the path. A short slug
 * beside a `path` column is one indirection, and it is the one that kept a
 * shipping product's catalogue from ever being shared: two apps chose different
 * slugs for the same model, so a rate published by one was invisible to the
 * other.
 */
export type Rates = Readonly<Record<string, { readonly rate: { readonly input: number; readonly output: number }; readonly thinking?: boolean }>>;

/* -------------------------------------------------------------- refusals --- */

export interface AiProblem {
  readonly id: string;
  readonly why: string;
}

/**
 * Everything decidable about a catalogue before a request exists.
 *
 * ⚠️ EVERY ONE OF THESE IS A FAILURE THAT COSTS MONEY RATHER THAN THROWING. A
 * feature pointed at a model nobody declared cannot compute a reserve; a rate of
 * zero holds nothing and charges nothing, so the platform pays for every call;
 * an absent ceiling is a balance one person can empty. None of them is visible
 * in a green suite, because each produces a perfectly successful generation.
 */
export function aiProblems(spec: AiSpec | undefined): readonly AiProblem[] {
  if (!spec) return [];
  const out: AiProblem[] = [];

  const seen = new Set<string>();
  for (const model of spec.models) {
    if (seen.has(model.id)) out.push({ id: model.id, why: "is declared twice, so which rate applies depends on order" });
    seen.add(model.id);
    /*
      ⚠️ A ZERO RATE IS NOT "FREE", IT IS UNMETERED. The reserve is zero, the
      settle is zero, the balance never moves and the provider still invoices —
      so the model looks like the cheapest one in the catalogue right up to the
      end of the month.
    */
    if (!(model.rate.input > 0) || !(model.rate.output > 0)) {
      out.push({ id: model.id, why: "prices a unit at zero or less, so every call to it is unmetered" });
    }
  }

  for (const [id, feature] of Object.entries(spec.features)) {
    if (!seen.has(feature.model)) {
      out.push({ id, why: `names model "${feature.model}", which this app does not declare` });
    }
    if (feature.system.trim().length === 0) {
      out.push({ id, why: "sends no system text, so the reserve is computed from a document that is not the one sent" });
    }
    if (feature.produces !== "image" && (!Number.isInteger(feature.maxOutput) || feature.maxOutput < 1)) {
      out.push({ id, why: "asks for no bounded output, so nothing caps what one call can spend" });
    }
    const model = spec.models.find((m) => m.id === feature.model);
    /*
      ⚠️ A VISION FEATURE ON A MODEL THAT DOES NOT PRICE A PICTURE. The reserve
      is then computed from the text alone: it holds almost nothing, the cap
      settles at almost nothing, and every photograph is one the platform pays
      for in full. It succeeds every time, which is why nothing else would find
      it — and it scales with USE, so the cheapest-looking line in the catalogue
      runs up the largest invoice.
    */
    if (feature.takes === "image" && model && !(model.imageUnits! > 0)) {
      out.push({ id, why: `is given a picture and its model "${feature.model}" prices none, so every image on it is unmetered` });
    }
    /* ⚠️ The same failure on the other side: an image produced and not priced. */
    if (feature.produces === "image" && model && !(model.perImage! > 0)) {
      out.push({ id, why: `produces images and its model "${feature.model}" prices none, so every one is unmetered` });
    }
    if (feature.produces === "image" && feature.images !== undefined && (!Number.isInteger(feature.images) || feature.images < 1)) {
      out.push({ id, why: "asks for a number of images that is not a whole number of images" });
    }
    if (!Number.isInteger(feature.dailyPerPerson) || feature.dailyPerPerson < 1) {
      out.push({ id, why: "sets no daily ceiling per person, so one person can empty the balance before anybody else opens the product" });
    }
  }

  return out;
}

/* ----------------------------------------------------------- which model --- */

/**
 * WHO DECIDED WHICH MODEL RUNS THIS.
 *
 * ⚠️ FOUR LAYERS, AND EACH IS A DIFFERENT PERSON'S DECISION. The manifest names
 * a default because a product has an opinion; the operator turns models on and
 * off because a deployment has a contract and a bill; a workspace picks from
 * what is left because "which company reads my clients' photographs" is its
 * decision and nobody else's; and the region refuses what it does not permit,
 * because residency outranks all three.
 *
 * They were one line — `feature.model` — so a product could offer a catalogue of
 * two providers and every workspace on every deployment got whichever one the
 * manifest happened to name.
 */
export type ModelSource = "manifest" | "workspace";

export type ModelChoice =
  | { readonly ok: true; readonly model: ModelSpec; readonly source: ModelSource }
  /**
   * ⚠️ A REFUSAL SAYS WHICH LAYER REFUSED, because the four are different things
   * to go and do: ask an operator to enable one, pick a different one, or accept
   * that this region does not permit any. "Unavailable" makes all three the same
   * shrug.
   */
  | { readonly ok: false; readonly why: "unknown_feature" | "unknown_model" | "none_permitted" };

/**
 * ⚠️ WHETHER A MODEL CAN DO WHAT A FEATURE ASKS, DERIVED RATHER THAN DECLARED.
 *
 * A model that prices no image cannot be given one, and a model with no
 * per-picture price cannot produce one — both are already in the catalogue
 * because the METER needs them, so a second `capabilities` field would be a
 * declaration that can disagree with the arithmetic. It would disagree in the
 * expensive direction: a vision feature on a text model holds a reserve computed
 * from the prompt alone, settles at almost nothing, and the platform pays for
 * every picture.
 */
export function modelSuits(model: ModelSpec, feature: FeatureSpec): boolean {
  if (feature.takes === "image" && (model.imageUnits ?? 0) <= 0) return false;
  if (feature.produces === "image" && (model.perImage ?? 0) <= 0) return false;
  /* ⚠️ And a model that prices pictures is not therefore a text model. */
  if (feature.produces !== "image" && (model.perImage ?? 0) > 0) return false;
  return true;
}

/** Every model a workspace may legitimately choose for one feature. */
export function modelsFor(input: {
  readonly ai: AiSpec;
  readonly feature: string;
  /** Turned off by the operator, deployment-wide. Absent means all are offered. */
  readonly disabled?: readonly string[];
  /** The region's allow-list. Empty means the region narrows nothing. */
  readonly permitted?: readonly string[];
  readonly rates?: Rates;
}): readonly ModelSpec[] {
  const feature = input.ai.features[input.feature];
  if (!feature) return [];
  const off = new Set(input.disabled ?? []);
  const permitted = input.permitted ?? [];
  return input.ai.models
    .map((m) => modelFor(input.ai, m.id, input.rates ?? {})!)
    .filter((m) => !off.has(m.id))
    .filter((m) => permitted.length === 0 || permitted.includes(m.id))
    .filter((m) => modelSuits(m, feature));
}

/**
 * The one model this call will run, and who decided.
 *
 * ⚠️ A WORKSPACE'S CHOICE IS HONOURED ONLY IF IT IS STILL ELIGIBLE. An operator
 * turning a model off, a region that does not permit it, or a catalogue that
 * dropped it must not leave a workspace pinned to something unreachable — the
 * failure would be one workspace whose generation stopped working, reported as a
 * provider error, months after the change that caused it.
 *
 * ⚠️ AND FALLING BACK IS NOT SILENT ELSEWHERE: `source` says `manifest` whenever
 * the workspace's pick did not decide, so a screen can say the choice is no
 * longer available rather than showing it as though it were in effect.
 */
export function chooseModel(input: {
  readonly ai: AiSpec;
  readonly feature: string;
  readonly chosen?: string | null;
  readonly disabled?: readonly string[];
  readonly permitted?: readonly string[];
  readonly rates?: Rates;
}): ModelChoice {
  const feature = input.ai.features[input.feature];
  if (!feature) return { ok: false, why: "unknown_feature" };

  const eligible = modelsFor(input);
  if (input.chosen) {
    const picked = eligible.find((m) => m.id === input.chosen);
    if (picked) return { ok: true, model: picked, source: "workspace" };
  }

  /*
    ⚠️ THE MANIFEST'S DEFAULT STILL HAS TO BE ELIGIBLE. A product's opinion does
    not outrank a region: an app naming a model the EU does not permit would
    otherwise run it there for every workspace that never chose one, which is the
    exact promise residency is.
  */
  const declared = eligible.find((m) => m.id === feature.model);
  if (declared) return { ok: true, model: declared, source: "manifest" };

  /*
    ⚠️ AND NOTHING IS PICKED FOR THEM. Quietly substituting another model would
    send a workspace's data to a company it did not choose, at a price nobody
    quoted, and the only signal would be the bill.
  */
  if (!input.ai.models.some((m) => m.id === feature.model)) return { ok: false, why: "unknown_model" };
  return { ok: false, why: "none_permitted" };
}

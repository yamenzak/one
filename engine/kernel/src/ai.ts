/**
 * WHICH MODEL, AND WHAT IT IS ALLOWED TO DO.
 *
 * ⚠️ THE CATALOGUE IS THE PLATFORM'S AND THE SELECTION IS THE APP'S. Rates come
 * from providers' own pricing and are identical for every product, so one app
 * discovering a price change and keeping it to itself means every other app
 * meters at last year's numbers. Which models a product turns ON is a product
 * decision and stays one.
 *
 * ⚠️ A LANE HAS MORE THAN ONE NAME AND THAT IS NOT A TIDYING PROBLEM. One
 * provider calls it `tts`, another calls it `speech`; a catalogue holding both
 * and a selector asking `WHERE task = 'tts'` silently cannot see half its own
 * models, and the app then reports that no voice is available while four are
 * enabled. Every selection goes through `lanesFor`.
 *
 * ⚠️ AND THE MOCK LANE IS GATED ON THE ENVIRONMENT, STRUCTURALLY. A mock that
 * can be switched on from a console fabricates output in production — including
 * numbers somebody will act on — and bills for it. There is no configuration in
 * which that is wanted, so it is not configuration.
 *
 * Layer 2. Imports primitives.
 */

import type { Meter } from "./credit.js";

/* ------------------------------------------------------------------ lanes --- */

/**
 * ⚠️ OUR NAMES FOR WHAT A MODEL DOES, and every provider's name maps into them.
 * A lane is what an app asks for; a model row is what answers.
 */
export type Lane = "text" | "vision" | "speech" | "listen" | "image" | "embed";

export const LANES: readonly Lane[] = ["text", "vision", "speech", "listen", "image", "embed"];

/**
 * THE LANES SOMETHING CAN ACTUALLY RUN, WHICH IS NOT THE SAME LIST AS `LANES`.
 *
 * ⚠️ A LANE WITH A CATALOGUE AND NO RUNNER PASSES EVERY OTHER CHECK. Models
 * answer it, `refuseCatalogue` finds them, an operator switches one on, the
 * console reports the lane healthy, composition passes and the meter prices it —
 * and the call then reaches an endpoint that cannot do the job. Every one of
 * those steps is a fact about the CATALOGUE; none of them is a fact about
 * whether the deployment can make the request.
 *
 * ⚠️ SO THE TWO QUESTIONS ARE ASKED SEPARATELY. `refuseCatalogue` asks whether a
 * model answers the lane; `refuseApp` asks whether anything can call it. A lane
 * absent here is refused at COMPOSITION, which is a build failure rather than a
 * runtime one — the trade this whole tree exists to make.
 *
 * ⚠️ AND A LANE JOINS THIS LIST IN THE SAME COMMIT AS ITS RUNNER, never before.
 * Adding the name first is how the gap this constant closes was opened.
 */
export const RUNNABLE: readonly Lane[] = ["text", "vision", "speech", "image", "embed"];

/**
 * ⚠️ THE ALIASES ARE THE POINT OF THIS TABLE. See the header — a `WHERE task =`
 * against one of these names finds a subset of the models that can do the job.
 */
const ALIASES: Readonly<Record<Lane, readonly string[]>> = {
  text: ["text", "text-generation", "chat", "completion"],
  vision: ["vision", "image-to-text", "multimodal"],
  speech: ["speech", "tts", "text-to-speech"],
  /*
   * DEFER(engine-86) stage:86 lane:listen — THIS LANE CAN BE FILLED AND CANNOT BE CALLED.
   * A catalogue's speech-recognition rows resolve here, an operator can switch
   * one on, and the console then reports the lane healthy — but `Ask` carries
   * words and pictures and nothing to hear, so no app can hand it a sound. The
   * missing half is not the message part: it is the RESERVE. Audio is metered
   * by the second and a caller holds bytes, so counting it means reading a
   * container's duration before the call — and a reserve is a ceiling on
   * revenue, so a guess can only ever under-charge.
   */
  listen: ["listen", "stt", "speech-to-text", "automatic-speech-recognition"],
  image: ["image", "text-to-image", "image-generation"],
  embed: ["embed", "embedding", "text-embeddings"],
};

/** Every provider name that answers for a lane. */
export const lanesFor = (lane: Lane): readonly string[] => ALIASES[lane];

/**
 * A PROVIDER'S NAME FOR A TASK, IN OUR SPELLING.
 *
 * ⚠️ THE ALIAS TABLE ABOVE IS HYPHENATED AND A CATALOGUE IS NOT. Cloudflare
 * publishes `Text Generation`, `Automatic Speech Recognition`, `Text
 * Embeddings` — display names, with spaces and capitals — so matching them
 * lowercased against `text-generation` finds nothing, and the lanes whose names
 * happen to be one word (`Text-to-Image`) work while the rest silently do not.
 * Four of six lanes were empty on a catalogue holding models for all six, and
 * every one of those models was present on the screen saying nothing would ever
 * select it.
 *
 * ⚠️ SO IT IS NORMALISED ONCE, HERE, AND EVERY READER GOES THROUGH IT — the
 * lane lookup, the lane's membership test, and the sync that writes the column.
 * Normalising at only the write end leaves every row already stored unreachable
 * until somebody re-syncs, which is a fix that appears not to work.
 */
export const taskKey = (task: string): string =>
  task.trim().toLowerCase().replace(/[\s_]+/g, "-");

export const laneOf = (task: string): Lane | null =>
  (LANES.find((l) => ALIASES[l].includes(taskKey(task))) ?? null);

/**
 * THE LANES A MODEL ANSWERS BESIDE THE ONE IT IS FOR.
 *
 * ⚠️ ONE TASK COLUMN CANNOT SAY THAT A CHAT MODEL READS PICTURES, and almost
 * every chat model now does. A catalogue publishes ONE task per row, so a
 * modern Gemini, Claude or GPT lands in `text-generation` and the vision lane
 * reports "nothing answers" while a dozen rows that would answer it sit enabled
 * one lane over. The lane is then filled — if it is filled at all — by whatever
 * small dedicated `Image-to-Text` model the catalogue carries, which is elected
 * over every frontier model in the deployment.
 *
 * ⚠️ IT IS ADDITIVE, NEVER A REPLACEMENT. `task` stays what the row is FOR —
 * what it is elected to do by default and what its price is quoted against.
 *
 * ⚠️ AND IT APPLIES TO CHAT MODELS ONLY. An embedder takes text and a voice
 * model speaks it; claiming vision for either elects one to read a photograph.
 *
 * ⚠️ THE MATCH IS ON THE FAMILY, NOT ON A LIST OF IDS. A list is right on the
 * day it is written and wrong at the vendor's next release, and the failure is
 * silent — a new model arrives, syncs, prices, and is quietly the only frontier
 * row that cannot see. The families are numbered, so this asks the number.
 */
const READS_PICTURES: readonly RegExp[] = [
  /* ⚠️ 1.0 is the boundary, not 1.5: Gemini has taken an image in the same
     request as the prompt since 1.5, and only the first generation cannot. */
  /^gemini-(?!1\.0)/,
  /^claude-(?!1|2)/,
  /^gpt-(?:4o|4\.|5)|^o[134](?:-|$)/,
  /^grok-(?!1)/,
  /^pixtral|-vl(?:-|$)|vision/,
  /* ⚠️ Llama and Qwen sight is per-model rather than per-generation, so it is
     the name that says so — caught by `vision`/`-vl` above; this is the pair
     whose whole generation reads pictures. */
  /^llama-4|^gemma-3/,
];

export const alsoLanes = (id: string, task: string): readonly string[] => {
  if (laneOf(task) !== "text") return [];
  const name = id.slice(id.lastIndexOf("/") + 1).toLowerCase();
  return READS_PICTURES.some((re) => re.test(name)) ? ["image-to-text"] : [];
};

/* ----------------------------------------------------------------- models --- */

export interface ModelRow {
  /**
   * ⚠️ THE ID IS THE PROVIDER PATH — `@cf/meta/llama-3.1`, `gemini-2.5-flash` —
   * and not a slug of ours with the path in a second column. One name means a
   * row cannot disagree with itself, and it is what kept two catalogues from
   * merging in a previous platform for three stages.
   */
  readonly id: string;
  readonly provider: string;
  readonly task: string;
  readonly label: string;
  /** What it is for, in the reader's words. From the catalogue, shown as-is. */
  readonly about?: string;
  /** ⚠️ What it BILLS by — see `Meter`. Not every model counts tokens. */
  readonly meter: Meter;
  /** ⚠️ MILLI-credits per thousand units, and this is our RAW COST. */
  readonly input: number;
  readonly output: number;
  /** ⚠️ Per row, and a MULTIPLIER — `5` is five times. See `Rate`. */
  readonly multiplier: number;
  readonly enabled: boolean;
  readonly isDefault?: boolean;
  /** ⚠️ A model that thinks bills for tokens nobody requested — see `credit`. */
  readonly thinks?: boolean;
  readonly maxOutput: number;
  /**
   * ⚠️ GONE FROM THE PROVIDER'S CATALOGUE, KEPT IN OURS. A row deleted on the
   * day a provider retires it takes every action bound to it down with it;
   * retired, it stops being offered and `boundModel` degrades to the lane's
   * election, which is what "nobody has chosen" already means.
   */
  readonly retired?: boolean;
  /**
   * ⚠️ THE LANES IT ANSWERS BESIDE ITS OWN, and one task column could not say so.
   * A modern Gemini model reads a picture in the same request as the prompt, so
   * a deployment reporting "nothing answers vision" while eight of them sit
   * enabled in the text lane is describing our schema rather than the world.
   *
   * ⚠️ IT IS ADDITIVE, NEVER A REPLACEMENT. `task` stays what the model is FOR —
   * what it is elected to do by default, and what its price is quoted against.
   */
  readonly also?: readonly string[];
}

/** ⚠️ What a workspace may be shown: no cost, no multiplier — see `priceFor`. */
export interface ModelOffer {
  readonly id: string;
  readonly label: string;
  readonly about?: string;
  readonly lane: Lane;
  readonly meter: Meter;
  readonly thinks: boolean;
  /** ⚠️ MILLI-credits per thousand units, AFTER the multiplier. What THEY pay. */
  readonly input: number;
  readonly output: number;
}

/**
 * WHAT A MODEL COSTS THE PERSON CHOOSING IT.
 *
 * ⚠️ THE MULTIPLIER IS APPLIED HERE AND NEVER TRAVELS. A screen handed the raw
 * cost and the multiplier can compute the margin, and one that renders both by
 * accident publishes it. What a workspace is owed is the price; how it was
 * arrived at is ours.
 */
export const priceFor = (row: ModelRow, lane: Lane): ModelOffer => ({
  id: row.id,
  label: row.label,
  ...(row.about ? { about: row.about } : {}),
  lane,
  meter: row.meter,
  thinks: !!row.thinks,
  input: Math.round(row.input * row.multiplier),
  output: Math.round(row.output * row.multiplier),
});

/** ⚠️ A retired row still RESOLVES and is never OFFERED — see `ModelRow`. */
export const inLane = (rows: readonly ModelRow[], lane: Lane): readonly ModelRow[] =>
  rows.filter((r) => {
    const names = lanesFor(lane);
    /* ⚠️ ITS OWN TASK OR ANY IT ALSO ANSWERS — see `ModelRow.also`. */
    return names.includes(taskKey(r.task))
      || (r.also ?? []).some((t) => names.includes(taskKey(t)));
  });

/** What a workspace may choose from: in the lane, enabled, and still sold. */
export const offeredIn = (rows: readonly ModelRow[], lane: Lane): readonly ModelRow[] =>
  inLane(rows, lane).filter((r) => r.enabled && !r.retired);

/**
 * ⚠️ ONE DEFAULT PER LANE, AND THE ELECTION IS DETERMINISTIC. "Whichever row
 * comes back first" is an order that changes with an insert, so the model a
 * feature uses changes without anybody editing anything.
 */
export function defaultIn(rows: readonly ModelRow[], lane: Lane): ModelRow | null {
  const usable = offeredIn(rows, lane);
  return usable.find((r) => r.isDefault)
    ?? [...usable].sort((a, b) => (a.input + a.output) - (b.input + b.output) || (a.id < b.id ? -1 : 1))[0]
    ?? null;
}

/* ------------------------------------------------------------------ tools --- */

/**
 * ⚠️ WHAT A MODEL MAY CALL ON SOMEBODY'S BEHALF. Derived from the operations, so
 * there is no second catalogue — but the exclusions are the interesting half:
 * anything that grants access, spends money or mints a credential. A model that
 * can invite somebody to a workspace from a sentence in a document it was asked
 * to summarise is a model that will be asked to.
 */
export interface ToolEntry {
  readonly id: string;
  readonly summary: string;
  readonly input: Readonly<Record<string, unknown>>;
}

/* ---------------------------------------------------------------- actions --- */

/**
 * WHAT ONE GENERATING OPERATION ASKS FOR (D19).
 *
 * ⚠️ AN APP NAMES A LANE, NEVER A MODEL. A model id in a manifest is a
 * deployment decision baked into a product: it cannot be changed without a
 * release, it is wrong the day a provider retires the row, and every app then
 * carries a different idea of which model is current. The app says what KIND of
 * work this is; the operator binds the row; the election answers when nobody
 * has.
 *
 * ⚠️ AND THE PROMPT IS A LETTERHEAD, WITH ITS VARIABLES DECLARED — exactly the
 * notification contract, because it is exactly the same problem: text somebody
 * may edit that must keep naming only what exists. A prompt naming `{coach}`
 * where the action offers `{trainer}` renders the brace and the word into a
 * model's instructions, which is worse than rendering it to a person: nobody
 * sees it, and the answer is subtly wrong instead of visibly broken.
 *
 * ⚠️ `brandable` IS THE TENANT'S PERMISSION TO ADD TO IT, and it is per action
 * rather than global. A studio's plan-draft tone is the studio's voice; a
 * lab-extraction prompt is not anybody's to edit, and the difference is a
 * product decision the app declares.
 *
 * ⚠️ A WORKSPACE ADDS AND NEVER REPLACES, WHICH IS WHY THE BASE NEVER TRAVELS.
 * It was a replacement, and a replacement has to be seeded with the current text
 * to be editable at all — so every prompt the deployment had was shipped to the
 * browser of anybody who could open the screen. An addendum needs no seed: the
 * box starts empty, what is typed is appended, and the instructions above it are
 * never sent anywhere.
 *
 * ⚠️ HIDDEN IS NOT SECRET, AND SAYING OTHERWISE WOULD BE THE LIE. A model can be
 * asked to repeat its own instructions, and no arrangement of prompts prevents
 * that. What this stops is the base being PUBLISHED — read out of a network tab
 * by anybody with the screen open. A prompt that must not be known to a customer
 * is not a prompt.
 */
export interface AiActionSpec {
  readonly lane: Lane;
  /** The instructions, with `{placeholders}` drawn from `variables`. */
  readonly prompt: string;
  /** ⚠️ What the prompt may name. Anything else is refused at the edit. */
  readonly variables: readonly string[];
  /**
   * ⚠️ THE CEILING THE RESERVE IS COMPUTED FROM, never "whatever it returns".
   * A reserve is a ceiling on revenue: every token an estimate fails to count
   * is a token the platform pays for and the tenant does not.
   */
  readonly maxOutput: number;
  /** Whether a workspace may add its own instructions after ours. */
  readonly brandable?: boolean;
  /**
   * WHETHER A WORKSPACE MAY TURN THIS OFF, AND ABSENT MEANS IT MAY NOT (D81).
   *
   * ⚠️ SOME OPERATIONS *ARE* THE GENERATION. Reading a label, identifying a
   * product from photographs — the answer IS what the model said, and without it
   * the operation has nothing to return. Offering a switch there is offering to
   * break the feature, and the person who presses it will report the break as a
   * bug rather than as their own decision.
   *
   * ⚠️ SO THE SAFE DEFAULT IS "MAY NOT", which is the opposite of the convenient
   * one. Defaulting to switchable would make every action a product ships
   * silently optional — including the ones it is built out of — and the app that
   * never thought about it would ship a switch that guts it.
   *
   * ⚠️ AND IT IS PER ACTION, LIKE `brandable`, FOR THE SAME REASON. "Does this
   * product use AI" is not a question with one answer: a draft somebody may
   * prefer to write themselves and a lab extraction nobody can do by hand are
   * both AI, and only the app knows which is which.
   */
  readonly optional?: true;
}

/** ⚠️ A workspace's own words are shorter than ours by construction. */
export const MAX_ADDENDUM = 2_000;

/**
 * THE INSTRUCTIONS AS THE MODEL RECEIVES THEM.
 *
 * ⚠️ OURS FIRST AND THEIRS LAST, WHICH IS THE ONLY ORDER THAT MEANS ANYTHING. A
 * later instruction is the one a model follows when two conflict, so a workspace
 * asking for a shorter answer gets a shorter answer — which is the feature. Put
 * first, an addendum would be silently overridden by our own text and the
 * setting would save and change nothing.
 */
export const composePrompt = (base: string, addendum?: string | null): string =>
  addendum?.trim() ? `${base}\n\n${addendum.trim()}` : base;

/** ⚠️ Enough for instructions, not for a corpus. */
export const MAX_PROMPT = 8_000;

export type PromptRefusal = "empty" | "too_long" | "unknown_variable" | "not_theirs";

/**
 * What an edited prompt can get wrong.
 *
 * ⚠️ `level` IS THE AUTHORITY ASKING, AND IT DECIDES ONE OF THESE. The operator
 * may reword any action; a tenant may reword only what the app declared
 * `brandable`. Refusing that at the write rather than in a screen is what makes
 * it true of the API, the import and the second screen as well.
 */
export function refusePrompt(
  def: AiActionSpec, text: string, level: "operator" | "tenant",
): readonly PromptRefusal[] {
  const out: PromptRefusal[] = [];
  if (level === "tenant" && !def.brandable) out.push("not_theirs");
  if (!text.trim()) out.push("empty");
  /* ⚠️ THE CEILING IS THE AUTHORITY'S. A workspace adds to our instructions;
     eight thousand characters of addition is not an addition, it is a second
     prompt appended to the first — and it is charged to their reserve on every
     single call. */
  if (text.length > (level === "tenant" ? MAX_ADDENDUM : MAX_PROMPT)) out.push("too_long");
  if (namedIn(text).some((n) => !def.variables.includes(n))) out.push("unknown_variable");
  return out;
}

const namedIn = (text: string): readonly string[] =>
  [...text.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((m) => m[1]!);

/** The variables a prompt named that the action does not offer. */
export const unknownInPrompt = (def: AiActionSpec, text: string): readonly string[] =>
  [...new Set(namedIn(text).filter((n) => !def.variables.includes(n)))];

/**
 * ⚠️ AN UNFILLED PLACEHOLDER IS SENT TO THE MODEL AS ITSELF, so every declared
 * variable resolves to something — the empty string where a caller had nothing
 * — rather than to a literal brace in the instructions.
 */
export const sayPrompt = (
  text: string, values: Readonly<Record<string, string>>,
): string => text.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, name: string) => values[name] ?? "");

/**
 * The model an action runs on: the operator's binding if it names an enabled
 * row IN THE ACTION'S OWN LANE, and the lane's election otherwise.
 *
 * ⚠️ A BINDING THAT NO LONGER RESOLVES FALLS BACK RATHER THAN FAILING. A model
 * retired by its provider would otherwise take every bound action down until
 * somebody edited a row, and the election is exactly the answer for "nobody has
 * chosen" — which is what a dead binding amounts to.
 */
export function boundModel(
  rows: readonly ModelRow[], lane: Lane, bound: string | null | undefined,
): ModelRow | null {
  if (bound) {
    const named = inLane(rows, lane).find((r) => r.id === bound && r.enabled);
    if (named) return named;
  }
  return defaultIn(rows, lane);
}

/* ------------------------------------------------------------------ rules --- */

export type AiRefusal =
  | "lane_with_no_model" | "two_defaults" | "priced_at_nothing" | "unknown_task"
  | "no_margin";

/**
 * ⚠️ THE FLOOR UNDER EVERY ROW A WORKSPACE MAY CHOOSE. A workspace picking its
 * own model is safe for exactly one reason: every choice is charged to its own
 * wallet at a margin. A row at or below cost turns that freedom into a way to
 * spend our money, and the more attractive the model the faster.
 */
export const MIN_MULTIPLIER = 1;

export interface AiProblem { readonly of: string; readonly why: AiRefusal; readonly detail: string }

/**
 * What a catalogue can get wrong.
 *
 * ⚠️ `priced_at_nothing` IS A ROW THAT COSTS US AND CHARGES NOTHING. It settles
 * to zero on every call, so usage looks free, the meter looks healthy, and the
 * provider's invoice is the first anybody hears of it.
 */
export function refuseCatalogue(rows: readonly ModelRow[], needed: readonly Lane[]): readonly AiProblem[] {
  const out: AiProblem[] = [];
  const at = (of: string, why: AiRefusal, detail: string) => out.push({ of, why, detail });

  for (const r of rows) {
    /* ⚠️ A MODEL WE DO NOT SELL IS NOT A FAULT, AND SAYING SO BURIED THE ONES
       THAT ARE. A provider's catalogue carries classifiers, translators,
       rerankers and detectors; this deployment offers six lanes and none of them
       is those. Reported per row, a sixty-model catalogue drew fifty red cards
       above the list — so the screen's one real entry, a lane with nothing
       enabled, was somewhere in the middle of them. Turning one ON is the
       contradiction: an operator has sold something nothing can ever pick. */
    if (!r.enabled || r.retired) continue;
    if (!laneOf(r.task)) {
      at(r.id, "unknown_task",
        `Switched on, but its task "${r.task}" maps to no lane, so nothing will ever select it`);
    }
    if (r.input <= 0 && r.output <= 0) {
      at(r.id, "priced_at_nothing", "Enabled and priced at zero, so every call settles free");
    }
    /* ⚠️ AT COST IS A LOSS, because the reserve is a ceiling on revenue: the
       charge can come in under the estimate and never over it. A multiplier of
       one is a row that breaks even at best. */
    if (r.multiplier <= MIN_MULTIPLIER) {
      at(r.id, "no_margin",
        `Enabled at ${r.multiplier}× cost, so every call on it is at best break-even`);
    }
  }
  for (const lane of needed) {
    const usable = offeredIn(rows, lane);
    if (!usable.length) at(lane, "lane_with_no_model", "An app asks for this lane and no enabled model answers");
    if (usable.filter((r) => r.isDefault).length > 1) {
      at(lane, "two_defaults", "Two rows claim the default, so which one runs depends on row order");
    }
  }
  return out;
}

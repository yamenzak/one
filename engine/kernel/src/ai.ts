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

/* ------------------------------------------------------------------ lanes --- */

/**
 * ⚠️ OUR NAMES FOR WHAT A MODEL DOES, and every provider's name maps into them.
 * A lane is what an app asks for; a model row is what answers.
 */
export type Lane = "text" | "vision" | "speech" | "listen" | "image" | "embed";

export const LANES: readonly Lane[] = ["text", "vision", "speech", "listen", "image", "embed"];

/**
 * ⚠️ THE ALIASES ARE THE POINT OF THIS TABLE. See the header — a `WHERE task =`
 * against one of these names finds a subset of the models that can do the job.
 */
const ALIASES: Readonly<Record<Lane, readonly string[]>> = {
  text: ["text", "text-generation", "chat", "completion"],
  vision: ["vision", "image-to-text", "multimodal"],
  speech: ["speech", "tts", "text-to-speech"],
  listen: ["listen", "stt", "speech-to-text", "automatic-speech-recognition"],
  image: ["image", "text-to-image", "image-generation"],
  embed: ["embed", "embedding", "text-embeddings"],
};

/** Every provider name that answers for a lane. */
export const lanesFor = (lane: Lane): readonly string[] => ALIASES[lane];

export const laneOf = (task: string): Lane | null =>
  (LANES.find((l) => ALIASES[l].includes(task)) ?? null);

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
  /** Credits per thousand units. */
  readonly input: number;
  readonly output: number;
  /** ⚠️ Per row. A global markup is one margin for twelve different costs. */
  readonly markup: number;
  readonly enabled: boolean;
  readonly isDefault?: boolean;
  /** ⚠️ A model that thinks bills for tokens nobody requested — see `credit`. */
  readonly thinks?: boolean;
  readonly maxOutput: number;
}

export const inLane = (rows: readonly ModelRow[], lane: Lane): readonly ModelRow[] =>
  rows.filter((r) => lanesFor(lane).includes(r.task));

/**
 * ⚠️ ONE DEFAULT PER LANE, AND THE ELECTION IS DETERMINISTIC. "Whichever row
 * comes back first" is an order that changes with an insert, so the model a
 * feature uses changes without anybody editing anything.
 */
export function defaultIn(rows: readonly ModelRow[], lane: Lane): ModelRow | null {
  const usable = inLane(rows, lane).filter((r) => r.enabled);
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
 * ⚠️ `brandable` IS THE TENANT'S PERMISSION TO EDIT IT, and it is per action
 * rather than global. A studio's plan-draft tone is the studio's voice; a
 * lab-extraction prompt is not anybody's to edit, and the difference is a
 * product decision the app declares.
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
  /** Whether a workspace may put the prompt in its own words. */
  readonly brandable?: boolean;
}

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
  if (text.length > MAX_PROMPT) out.push("too_long");
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
  | "lane_with_no_model" | "two_defaults" | "priced_at_nothing" | "unknown_task";

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
    if (!laneOf(r.task)) at(r.id, "unknown_task", `task "${r.task}" maps to no lane, so nothing will select it`);
    if (r.enabled && r.input <= 0 && r.output <= 0) {
      at(r.id, "priced_at_nothing", "enabled and priced at zero, so every call settles free");
    }
  }
  for (const lane of needed) {
    const usable = inLane(rows, lane).filter((r) => r.enabled);
    if (!usable.length) at(lane, "lane_with_no_model", "an app asks for this lane and no enabled model answers");
    if (usable.filter((r) => r.isDefault).length > 1) {
      at(lane, "two_defaults", "two rows claim the default, so the one used depends on row order");
    }
  }
  return out;
}

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

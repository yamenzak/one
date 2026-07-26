/**
 * The mock-lane decision (AGENTS §6: "the mock lane may never activate in
 * production").
 *
 * `ai.mock` is an `app_config` row a platform admin can flip from the admin
 * console. Historically `"on"` short-circuited the environment check, so one
 * click made production return fabricated output — including clinical lab
 * markers from `lab-extract` — and bill the tenant credits for it. That is not
 * an admin convenience, it is a data-integrity hazard: fabricated markers land
 * in the client's chart, then in the AI prompt's `LABS:` block and the
 * supplement recommender.
 *
 * So the environment gate is now the OUTER condition and applies to every mode:
 * outside development nothing mocks, whatever `ai.mock` says. Inside
 * development `"on"` still forces the mock (that is what the test suite and
 * `pnpm dev` rely on) and `"auto"` still falls back when no credential is
 * configured.
 *
 * Pure so it can be unit-tested without a Worker; `ai.ts` is the only caller.
 */

/** The three values `app_config["ai.mock"]` may hold. Anything else = "auto". */
export type AiMockMode = "auto" | "on" | "off";

export interface MockLaneInput {
  /** Raw `app_config["ai.mock"]` value (unknown/absent behaves as "auto"). */
  mockMode: string | null | undefined;
  /** Whether the matching real credential is present (AI binding / Gemini key). */
  canRunReal: boolean;
  /** `env.ENVIRONMENT === "development"` — the only environment that may mock. */
  isDevelopment: boolean;
}

/**
 * Whether this generation should run on the deterministic mock lane.
 * `false` in every non-development environment, by construction.
 */
export function shouldUseMockLane({ mockMode, canRunReal, isDevelopment }: MockLaneInput): boolean {
  if (!isDevelopment) return false;
  if (mockMode === "off") return false;
  return mockMode === "on" || !canRunReal;
}

/**
 * Whether a stored `ai.mock` value is settable in this environment. `"on"` is a
 * development-only override, so the admin write path refuses it in production
 * rather than persisting a setting that silently does nothing (or, before the
 * gate, something dangerous).
 */
export function mockModeSettable(mode: AiMockMode, isDevelopment: boolean): boolean {
  return mode !== "on" || isDevelopment;
}

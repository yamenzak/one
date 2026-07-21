/**
 * Persona vocabulary — the single source of truth for how a role is NAMED and
 * TONED in the UI (SPEC decision: keep `trainer` as the internal role id, but
 * always show the word **Coach** to users). Screens read the label from here so
 * "Trainer" never leaks into the interface, and a badge tone is consistent
 * wherever a persona appears.
 */

import type { Tone } from "../primitives.js";

/** The internal role ids (match @mossa/domain TENANT_ROLES + Better Auth). */
export type PersonaRole = "owner" | "trainer" | "assistant" | "client" | "member";

/** Role id → the term shown to users. `trainer` is surfaced as "Coach". */
export const PERSONA_LABELS: Record<PersonaRole, string> = {
  owner: "Owner",
  trainer: "Coach",
  assistant: "Assistant",
  client: "Client",
  member: "Member",
};

/** Role id → badge tone, so a persona reads the same colour everywhere. */
export const PERSONA_TONE: Record<PersonaRole, Tone> = {
  owner: "cardio",
  trainer: "activity",
  assistant: "nutrition",
  client: "sleep",
  member: "neutral",
};

/** The user-facing label for a role. Pass `self` to render "You" for the
 *  current user (the role-aware badge shows who *you* are in a list). */
export function personaLabel(role: string, opts?: { self?: boolean }): string {
  if (opts?.self) return "You";
  return PERSONA_LABELS[role as PersonaRole] ?? role;
}

/** The badge tone for a role (neutral for the current user / unknowns). */
export function personaTone(role: string, opts?: { self?: boolean }): Tone {
  if (opts?.self) return "primary";
  return PERSONA_TONE[role as PersonaRole] ?? "neutral";
}

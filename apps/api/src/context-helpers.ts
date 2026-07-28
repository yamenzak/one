/** Re-exports so route files import domain logic from one place. */
export {
  resolveClientFlags,
  parseFlagsJson,
  type Budget,
} from "@kova/domain";
export type PersonaRefRole = "owner" | "trainer" | "assistant" | "client";

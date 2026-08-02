/**
 * What a console panel needs from its host app, and nothing more.
 *
 * Two things, both injected rather than imported: how to talk to the server, and
 * how to turn a thrown value into a sentence. `@4dl/app-kit`'s `api` satisfies
 * `AdminApi` structurally, so an app binds it by passing it — no adapter, and no
 * dependency from this package onto the fetch layer.
 *
 * The reason it is a parameter and not an import is the same one that keeps
 * `@4dl/ui` free of one: a panel that reached for a specific client would drag a
 * transport choice into every app that wants an operator console.
 */

import { createContext, useContext } from "react";
import type { ErrorFormatter } from "@4dl/ui";

export interface AdminApi {
  get: <T>(path: string) => Promise<T>;
  post: <T>(path: string, body?: unknown) => Promise<T>;
  /**
   * PATCH is here because the model catalog needs it — switching one model on,
   * or making it its lane's default, is a partial update of one row and nothing
   * else. Modelling that as a POST would mean inventing a second endpoint shape
   * for the sake of a narrower interface.
   */
  patch: <T>(path: string, body?: unknown) => Promise<T>;
}

export interface AdminDeps {
  api: AdminApi;
  /** Usually the app's `errorText` — see `@4dl/ui`'s `ErrorFormatter`. */
  errorText: ErrorFormatter;
}

/**
 * The same two things, reachable from a panel's internals.
 *
 * Every exported section still takes `AdminDeps` as PROPS — that is the public
 * contract and it does not change. What this adds is a way for the twenty-odd
 * sub-components inside a panel like the AI one to reach them without being
 * handed `api` and `errorText` through five levels of prop drilling, which is
 * how the original grew a module-scoped import instead.
 *
 * Internal on purpose: an app never provides this context, it passes props to a
 * section and the section provides it.
 */
const DepsContext = createContext<AdminDeps | null>(null);

export const AdminDepsProvider = DepsContext.Provider;

/**
 * Throws rather than returning null. A panel rendered outside its own section
 * component is a wiring mistake, and the alternative — a silently inert `api` —
 * would show an operator an empty console instead of an error.
 */
export function useAdminDeps(): AdminDeps {
  const deps = useContext(DepsContext);
  if (!deps) throw new Error("An @4dl/admin panel was rendered outside its section component.");
  return deps;
}

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

import type { ErrorFormatter } from "@4dl/ui";

export interface AdminApi {
  get: <T>(path: string) => Promise<T>;
  post: <T>(path: string, body?: unknown) => Promise<T>;
}

export interface AdminDeps {
  api: AdminApi;
  /** Usually the app's `errorText` — see `@4dl/ui`'s `ErrorFormatter`. */
  errorText: ErrorFormatter;
}

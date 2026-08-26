/**
 * THE PRODUCT HALF — the screens a real workspace opens, and right now none.
 *
 * ⚠️ EMPTY BECAUSE THE SURFACE IS BEING REWRITTEN, NOT BECAUSE IT IS UNFINISHED.
 * Twenty-one screens stood here, ported faithfully onto the declared surface,
 * and the port was the point: the same flows drawn by the engine instead of by
 * hand. What it could not do is make them GOOD, because a faithful port of a
 * surface nobody sat down and designed is a surface nobody has designed. They
 * come back one at a time, each from the question of what somebody standing in
 * front of it is trying to do — and none of them comes back because it used to
 * be here.
 *
 * ⚠️ THE CONTRACT SURVIVED AND THE PLUMBING DID NOT, WHICH IS DELIBERATE. `Door`
 * and `Mounted` are the seam between this app and the centre — they belong to
 * the platform's shape, not to any screen, and rewriting them would be rewriting
 * something that is not in question. The fourteen hundred lines of fetching and
 * joining under them WERE per screen, so keeping them would have meant every new
 * screen inheriting the shape of the one it replaced. That is the same fault one
 * layer down from the one this rewrite exists to fix.
 *
 * ⚠️ AND THE APP UNDERNEATH IS UNTOUCHED. `../index.js` still declares every
 * collection and every operation this product has. What was emptied is the
 * surface; what it can DO was never in question. A screen that comes back binds
 * to an operation that is already there — or it names one that has to be
 * written, and that is a finding worth having rather than a gap.
 */

import type * as React from "react";
import type { Problem } from "@engine/kernel";

/**
 * THE ONE DOOR TO THE API, AND EVERY READ AND WRITE GOES THROUGH IT.
 *
 * ⚠️ ONE DOOR, BECAUSE A SECOND ONE HAS NO HOOK FOR AN EXPIRED SESSION. A screen
 * calling `fetch` itself cannot be told that the cookie died, so a dead session
 * renders as whatever empty state each failed request produces — indistinguishable
 * from a workspace with nothing in it.
 */
export interface Door {
  get<T>(op: string, input?: Record<string, string>): Promise<
    { ok: true; value: T } | { ok: false; problem: Problem }>;
  /**
   * ⚠️ THE THIRD ARGUMENT IS ONLY FOR BYTES. When the body IS a file, its type
   * is a header and everything else the operation declared travels in the
   * query — which is why `with` exists at all: without it an upload could be
   * called and could never be told what the file is FOR.
   */
  post<T>(
    op: string, input?: unknown,
    as?: { readonly contentType: string; readonly with?: Readonly<Record<string, string>> },
  ): Promise<{ ok: true; value: T } | { ok: false; problem: Problem }>;
  /**
   * ⚠️ WHAT THIS TAB HAS ALREADY BEEN TOLD, SYNCHRONOUSLY. The door holds one
   * answer per operation-and-input; this is how a screen seeds its first render
   * from it instead of painting a skeleton over something already known. A
   * product that cannot ask this question has no way to avoid blanking, which
   * is what "every navigation takes time" actually is.
   */
  known<T>(op: string, input?: Record<string, string>): T | undefined;
  /**
   * ⚠️ WHERE A STORED FILE CAN BE POINTED AT — the one thing the door hands back
   * that is not an answer. A photograph belongs in an `<img>`, and an `<img>`
   * takes an address rather than bytes; going through `get` would mean this app
   * holding every picture in memory as a blob URL it then has to revoke.
   */
  file(id: string): string;
}

/** What a mounted screen is handed — see `AppScreen` in OneSpace. */
export interface Mounted {
  readonly app: unknown;
  /** ⚠️ This app's OWN route. The centre adds the prefix. */
  readonly go: (route: string) => void;
  /** The segments past this screen's own route — what the address is about. */
  readonly at: readonly string[];
}

export interface Mounting {
  readonly register: (
    appId: string, route: string, screen: React.ComponentType<Mounted>,
  ) => void;
  readonly api: Door;
}

/**
 * REGISTERS EVERY SCREEN THIS APP DRAWS ITSELF, AND AT PRESENT THERE ARE NONE.
 *
 * ⚠️ AN EMPTY MOUNT IS NOT A BROKEN ONE. A body and a story are drawn by the
 * engine from the manifest and were never registered here; what belongs in this
 * function is the sessions — the screens that work rather than read, which draw
 * their own controls because what they do cannot be expressed as a binding. The
 * manifest declares none of any kind today, so there is nothing to hand over,
 * and saying so out loud is the difference between a stage and a fault.
 */
export function mount(_: Mounting): void {
  /* Each screen comes back here as it is designed. See the header. */
}

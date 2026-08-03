/**
 * Kova's binding of `@4dl/app-kit`'s fetch layer.
 *
 * The transport — same-origin cookies, JSON in/out, the 401 re-auth hook, the
 * three-way offline outcome (queued / offline / real
 * HTTP error) — is the platform's. One thing is Kova's, and it is bound here:
 * WHICH writes the service worker parks in its Background-Sync queue.
 *
 * That list has to mirror the `urlPattern` in `vite.config.ts`. If it drifts,
 * the failure is quiet and bad in one direction: a write the SW did NOT queue
 * gets reported as "saved, will sync", and it never syncs.
 *
 * Every existing call site imports this module unchanged — it re-exports the
 * kit whole, so `api`, `ApiError`, `errorText`, `isQueued` and friends resolve
 * exactly as they did when this file held them.
 */

import { configureApi, uploadMedia as uploadMediaKit } from "@4dl/app-kit";

export * from "@4dl/app-kit";

configureApi({
  queuedWrites: /^\/api\/(logs\/|check-ins|measurements|body-scans|supplements\/[^/]+\/log|fasting)/,
});

/**
 * Upload a file to /api/media and return its storage key.
 *
 * Kova's wrapper keeps the positional `clientId` its ~15 call sites pass. The
 * kit takes arbitrary form fields instead of naming one, because `clientId` is
 * a wire contract between Kova's app and Kova's API — the field NAME is not the
 * platform's to choose. Client-owned media (progress photos, lab files) carries
 * it so the server scopes the key per client and gates reads on assignment: a
 * client, or a non-assigned trainer, cannot read another client's file by key.
 */
export function uploadMedia(file: Blob, purpose: string, filename = "upload", clientId?: string): Promise<string> {
  return uploadMediaKit(file, purpose, { filename, fields: clientId ? { clientId } : undefined });
}

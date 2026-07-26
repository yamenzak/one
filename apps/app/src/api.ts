/** Typed fetch wrapper — same-origin cookies, JSON in/out. */

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /** The full error response body — carries `detail`, `raw`, etc. for diagnosis. */
    public body?: Record<string, unknown>,
  ) {
    super(message);
  }
  /** The raw model output the server echoed back on a parse failure, if any. */
  get raw(): string | null {
    return typeof this.body?.raw === "string" ? this.body.raw : null;
  }
}

/**
 * Optional request interceptor — the interactive tour installs one to serve
 * mock data (so every screen is populated) and to swallow writes (so tapping
 * around never touches real data). Return a value to short-circuit the request,
 * or `undefined` to fall through to the network.
 */
export type ApiInterceptor = (method: string, path: string, body?: unknown) => unknown | undefined;
let interceptor: ApiInterceptor | null = null;
export function setApiInterceptor(fn: ApiInterceptor | null): void {
  interceptor = fn;
}

/**
 * Session-expiry hook — invoked whenever a request comes back 401 (an expired /
 * missing cookie), except on the auth endpoints themselves (so re-auth can't
 * loop). SessionProvider installs a handler that clears the session and drops
 * the user back on Login instead of leaving blank screens / silent save fails.
 */
type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;
export function setUnauthorizedHandler(fn: UnauthorizedHandler | null): void {
  unauthorizedHandler = fn;
}
/** Auth/login endpoints self-report 401 (wrong OTP, no session yet) — never
 *  trigger the global re-auth for those or we'd loop on the login screen. */
const isAuthPath = (path: string): boolean => path.startsWith("/api/auth");
function onUnauthorized(status: number, path: string): void {
  if (status === 401 && unauthorizedHandler && !isAuthPath(path)) unauthorizedHandler();
}

/**
 * The log-write POSTs the service worker parks in its Background-Sync queue when
 * the network is unreachable (mirror of the `urlPattern` in vite.config.ts — keep
 * the two in lockstep).
 *
 * Why this exists: Workbox's BackgroundSyncPlugin enqueues the request in
 * `fetchDidFail` and then RE-THROWS the original error, so `fetch` rejects even
 * though the write is durably queued and WILL replay on reconnect. Reporting that
 * as a failure is worse than saying nothing: the user taps "Log it" again, a
 * second copy queues, both replay, and the day double-counts — inflating their
 * ring and the coach's compliance report. So a rejected fetch on one of these
 * paths is a DEFERRED SUCCESS, not an error.
 */
const QUEUED_POST = /^\/api\/(logs\/|check-ins|measurements|body-scans|supplements\/[^/]+\/log|fasting)/;

/** Only a service worker that is actually CONTROLLING this page can have queued
 *  anything. Without it (dev server, first load before activation, SW disabled)
 *  a failed write is simply lost, and telling the user "saved" would be a lie. */
const swQueueActive = (): boolean =>
  typeof navigator !== "undefined" && !!navigator.serviceWorker?.controller;

/**
 * A write that never reached the server but is queued in the service worker for
 * replay. Call sites should treat this as a success with a caveat ("Saved — will
 * sync when you're back online"), never as a failure to retry.
 */
export class QueuedError extends Error {
  readonly queued = true;
  constructor(message = "Saved — will sync when you're back online.") {
    super(message);
  }
}

/** A request that never left the device (offline, DNS, dropped connection) and
 *  is NOT queued — nothing was written, so retrying is the right advice. */
export class OfflineError extends Error {
  readonly offline = true;
  constructor(message = "You're offline — that didn't reach the server.") {
    super(message);
  }
}

/** The write is safely queued: show a reassuring notice, close the sheet. */
export const isQueued = (e: unknown): e is QueuedError => e instanceof QueuedError;
/** The request never left the device and nothing was written. */
export const isOffline = (e: unknown): e is OfflineError => e instanceof OfflineError;

/**
 * One place that turns any thrown value into text a user can act on, so every
 * `catch` in the app is a one-liner instead of an ad-hoc message. Real HTTP
 * errors keep the server's own message (4xx/5xx must never be dressed up as an
 * offline queue).
 */
export function errorText(e: unknown, fallback = "Something went wrong — please try again."): string {
  if (isQueued(e) || isOffline(e)) return e.message;
  if (e instanceof ApiError) return e.message || fallback;
  return fallback;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (interceptor) {
    const mocked = interceptor(method, path, body);
    if (mocked !== undefined) return mocked as T;
  }
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: "include",
      headers: body !== undefined ? { "content-type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    // `fetch` only rejects on a network-level failure — a 4xx/5xx resolves
    // normally and falls through below. Distinguish the two offline outcomes so
    // the UI can say "saved, will sync" instead of "failed" (see QUEUED_POST).
    if (method === "POST" && QUEUED_POST.test(path) && swQueueActive()) throw new QueuedError();
    throw new OfflineError();
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; message?: string; detail?: string };
  if (!res.ok) {
    onUnauthorized(res.status, path);
    throw new ApiError(res.status, data.error ?? data.message ?? `HTTP ${res.status}`, data as Record<string, unknown>);
  }
  return data;
}

/**
 * Upload a file (or blob) to /api/media and return its storage key. Unlike a
 * bare `fetch`, this checks the response: on 401/413/500 it throws an ApiError
 * (and fires the session-expiry hook on 401) so every call site surfaces the
 * failure instead of silently no-oping with an undefined key.
 */
export async function uploadMedia(file: Blob, purpose: string, filename = "upload", clientId?: string): Promise<string> {
  const fd = new FormData();
  fd.append("file", file instanceof File ? file : new File([file], filename));
  fd.append("purpose", purpose);
  // Client-owned media (progress photos, lab files) carries the owning client id
  // so the server scopes the key per client and gates reads on assignment — a
  // client / non-assigned trainer can't read another client's file by key.
  if (clientId) fd.append("clientId", clientId);
  // Uploads are NOT in the Background-Sync queue (a multipart body with a Blob
  // can't be replayed reliably), so an offline upload is a plain failure.
  let res: Response;
  try {
    res = await fetch("/api/media/upload", { method: "POST", credentials: "include", body: fd });
  } catch {
    throw new OfflineError("You're offline — the upload didn't go through.");
  }
  const data = (await res.json().catch(() => ({}))) as { key?: string; error?: string; message?: string };
  if (!res.ok || !data.key) {
    onUnauthorized(res.status, "/api/media/upload");
    throw new ApiError(res.status, data.error ?? data.message ?? "Upload failed", data as Record<string, unknown>);
  }
  return data.key;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
};

/** The client's local date (YYYY-MM-DD) — all day bucketing keys off this. */
export function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Shift a YYYY-MM-DD local date by `delta` days, formatting the result with the
 * SAME local year/month/day padding as todayLocal() — never via toISOString(),
 * which emits the UTC date and drifts a full day for every user east of UTC
 * (local midnight of `date` is the previous day in UTC). The one shared copy;
 * every screen imports this instead of hand-rolling its own.
 */
export function shiftDay(date: string, delta: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

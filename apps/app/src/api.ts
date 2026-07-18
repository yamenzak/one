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

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (interceptor) {
    const mocked = interceptor(method, path, body);
    if (mocked !== undefined) return mocked as T;
  }
  const res = await fetch(path, {
    method,
    credentials: "include",
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
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
export async function uploadMedia(file: Blob, purpose: string, filename = "upload"): Promise<string> {
  const fd = new FormData();
  fd.append("file", file instanceof File ? file : new File([file], filename));
  fd.append("purpose", purpose);
  const res = await fetch("/api/media/upload", { method: "POST", credentials: "include", body: fd });
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

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
  if (!res.ok) throw new ApiError(res.status, data.error ?? data.message ?? `HTTP ${res.status}`, data as Record<string, unknown>);
  return data;
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

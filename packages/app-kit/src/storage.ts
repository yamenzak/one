/**
 * The device's own memory — everything the app keeps in `localStorage`, and the
 * two rules that keep it from leaking between accounts.
 *
 * Every key is written under one app prefix so sign-out can sweep them all, and
 * a small keep-list survives that sweep. Both are the app's to choose; the
 * mistakes they prevent are not app-specific:
 *
 *   • sweeping too WIDE — an early version wiped every prefixed key on sign-out,
 *     so a light-theme user signed back in to a dark app and had to re-pick it
 *     every single time. Display preferences are not account data.
 *   • sweeping too NARROW — anything that could carry one account's data into
 *     the next session (a cached identity payload, per-item state) must go.
 */

export interface AppStorage {
  /** Namespaced key, e.g. `kova:ctx-cache`. */
  key: (name: string) => string;
  /** Clear every key under the prefix except the keep-list. Sign-out. */
  clear: () => void;
  read: <T>(name: string) => T | null;
  write: (name: string, value: unknown | null) => void;
}

/**
 * Bind an app's storage namespace.
 *
 * `keep` names the keys sign-out must NOT remove — display preferences, nothing
 * identifying. They are matched as full stored keys (prefix included), because
 * that is what a theme written by the design system before the app booted looks
 * like.
 */
export function appStorage(prefix: string, keep: readonly string[] = []): AppStorage {
  const kept = new Set(keep);
  const key = (name: string) => `${prefix}:${name}`;
  return {
    key,
    clear() {
      try {
        for (const k of Object.keys(localStorage)) {
          if (k.startsWith(prefix) && !kept.has(k)) localStorage.removeItem(k);
        }
      } catch { /* private mode */ }
    },
    read<T>(name: string): T | null {
      try {
        const raw = localStorage.getItem(key(name));
        return raw ? (JSON.parse(raw) as T) : null;
      } catch { return null; }
    },
    write(name: string, value: unknown | null): void {
      try {
        if (value === null || value === undefined) localStorage.removeItem(key(name));
        else localStorage.setItem(key(name), JSON.stringify(value));
      } catch { /* private mode / quota */ }
    },
  };
}

/**
 * The name of the cached identity payload.
 *
 * An offline-first app precaches its shell, but the endpoint that says WHO is
 * signed in is per-session and cannot be cached by the service worker — so a
 * cold start with no signal used to throw, null the session, and render the
 * sign-in screen. That makes the entire offline capability unreachable in its
 * primary use case: install the app, lock the phone, walk somewhere with no
 * signal, tap the icon.
 *
 * ⚠️ A UI convenience ONLY, never an authorization decision. The session cookie
 * is HttpOnly and every read and write is still authorized server-side, so a
 * restored payload cannot grant access to anything. A real 401 clears it.
 */
export const CONTEXT_CACHE = "ctx-cache";

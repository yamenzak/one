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

/**
 * The name of the cached BOOT BRAND — the studio's name and palette, remembered
 * per hostname so the first frame is already theirs.
 *
 * The problem it solves is small and very visible: branding arrives over the
 * network (`/api/host`, then `/api/context`), and the boot splash paints before
 * either lands. So a client opening a white-labelled studio met the PLATFORM's
 * mark and colour for a beat, and then the studio's — the one moment of the
 * whole product where the vendor's identity is unavoidable, on the screen every
 * single session starts with. No amount of care inside the splash fixes it: the
 * data genuinely is not there yet.
 *
 * Remembering it is what makes it not there only ONCE, on the first-ever visit
 * to a host. That limit is real and worth stating plainly: nothing here can
 * brand a first visit, because the app is a static bundle and the only thing
 * that knows the tenant at that instant is the server that served it. The fix
 * for the first frame of the first visit would be server-rendered branding in
 * the HTML; this is the fix for every visit after it, which is nearly all of
 * them, and it is also what an offline cold start has.
 *
 * ⚠️ Keyed by HOSTNAME, and the key is checked on read. One device visits
 * several studios (a coach with two, anyone who has seen the platform root), and
 * a cache that ignored the host would paint the last studio's brand over this
 * one — a worse bug than the flash, because it looks deliberate.
 *
 * ⚠️ Like the context cache: a UI convenience, never an authorization decision.
 * It holds what an unauthenticated visitor to that hostname is already shown.
 */
export const BRAND_CACHE = "brand-boot";

export interface BootBrand<B> {
  /** The hostname this was captured on. A mismatch discards it. */
  host: string;
  /** The studio's display name, for the splash's caption. */
  name: string | null;
  branding: B | null;
}

/** The remembered brand for this hostname, or null. Never throws. */
export function readBootBrand<B>(storage: AppStorage, host: string): BootBrand<B> | null {
  const cached = storage.read<BootBrand<B>>(BRAND_CACHE);
  return cached && cached.host === host ? cached : null;
}

/**
 * Remember this hostname's brand for the next boot — or forget it, on `null`.
 *
 * Forgetting is not an afterthought. A door with no studio behind it (the
 * platform root, `setup.`, a studio that was closed) must CLEAR the entry, not
 * skip the write: skipping leaves the last studio's name and colours in place,
 * and the next boot on that host paints them before the server can say there is
 * no studio there.
 */
export function writeBootBrand<B>(storage: AppStorage, entry: BootBrand<B> | null): void {
  storage.write(BRAND_CACHE, entry);
}

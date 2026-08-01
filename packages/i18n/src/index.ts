/**
 * @4dl/i18n — TRANSLATION, as small as it can honestly be.
 *
 * Tessa raised this as a platform question rather than a Tessa one (TESSA.md
 * §2.4): German is table stakes for an EU medical centre, Kova is English-only,
 * and retrofitting i18n across an app is miserable. So the answer is a shared
 * package — but a deliberately minimal one, because the alternative was reaching
 * for a general i18n library and inheriting a great deal of machinery for a
 * problem the platform does not have yet.
 *
 * ── What is here ────────────────────────────────────────────────────────────
 *
 * A dictionary per locale, `{count}`-style interpolation, one plural rule, a
 * locale resolved from the browser and overridable by the person, and typed
 * keys so a missing string is a compile error rather than a screen that says
 * `stock.shelf.empty` to a nurse.
 *
 * ── What is deliberately NOT here ───────────────────────────────────────────
 *
 * No ICU MessageFormat, no gender or ordinal categories, no lazy per-route
 * bundles, no translation-management integration, no RTL machinery. Every one of
 * those is real work that a real requirement would justify, and none of them is
 * justified by "an app in English and German". They are also all additive: a
 * dictionary of plain strings is the substrate every one of them would build on,
 * so choosing the small version now does not close a door.
 *
 * The one thing that WOULD have been expensive to add later is the typing, so
 * that is here from the start: `Dict` is derived from the reference locale, and
 * a translation missing a key does not compile.
 *
 * ── The fallback is a real decision ─────────────────────────────────────────
 *
 * A missing translation falls back to the reference locale — English — and does
 * NOT render the key. A key on screen is a bug report written in a language
 * nobody speaks, shown to a customer; an untranslated English sentence is
 * merely untranslated. Both are wrong; only one of them is usable.
 */

import { createContext, createElement, useContext, useMemo, useState, type ReactNode } from "react";

/** A flat dictionary. Nested objects were considered and rejected: a flat map
 *  makes "which keys does this locale lack" a one-line set difference. */
export type Dict = Record<string, string>;

export interface LocaleDef<D> {
  code: string;
  /** The name in its OWN language — a German speaker looks for "Deutsch". */
  label: string;
  dict: D;
}

export interface I18nConfig<D extends Dict> {
  /** The locale whose dictionary defines the key set, and the fallback. */
  reference: LocaleDef<D>;
  /** Every other locale. Each must supply the same keys — see `Translation`. */
  locales: readonly LocaleDef<Translation<D>>[];
  /** Where the person's choice is kept between visits. */
  storage?: { read: () => string | null; write: (code: string) => void };
}

/** A translation of `D`: the same keys, and no invented ones. `Partial` because
 *  a work-in-progress locale is normal and must still compile and run. */
export type Translation<D extends Dict> = Partial<Record<keyof D, string>>;

export interface I18n<D extends Dict> {
  locale: string;
  locales: { code: string; label: string }[];
  setLocale: (code: string) => void;
  t: (key: keyof D & string, vars?: Record<string, string | number>) => string;
}

/**
 * Substitute `{name}` placeholders.
 *
 * Unmatched placeholders are LEFT IN PLACE rather than blanked. A sentence that
 * reads "Expires in {days} days" is visibly broken and gets fixed; one that
 * reads "Expires in  days" looks like a rendering hiccup and survives for
 * months.
 */
function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

/**
 * Pick a plural form from `one|other`.
 *
 * English and German share the same two-form rule (n === 1), which is why one
 * rule is honest here rather than a shortcut. A language with more forms —
 * Polish, Arabic, Russian — needs real CLDR plural categories, and that is the
 * point at which this package should grow an ICU dependency rather than another
 * special case. The `|` is only consulted when a count is passed.
 */
function plural(value: string, count: number | undefined): string {
  if (count === undefined || !value.includes("|")) return value;
  const [one = "", other = ""] = value.split("|");
  return count === 1 ? one : other;
}

/**
 * Best match for what the browser asks for.
 *
 * Language-only comparison: `de-AT` and `de-CH` should both get German rather
 * than falling all the way back to English over a region tag. A centre that
 * needs Austrian-specific wording can register `de-AT` explicitly and it will
 * match exactly first.
 */
export function pickLocale(requested: readonly string[], available: readonly string[], fallback: string): string {
  for (const want of requested) {
    const exact = available.find((a) => a.toLowerCase() === want.toLowerCase());
    if (exact) return exact;
    const lang = want.split("-")[0]!.toLowerCase();
    const loose = available.find((a) => a.split("-")[0]!.toLowerCase() === lang);
    if (loose) return loose;
  }
  return fallback;
}

export function createI18n<D extends Dict>(config: I18nConfig<D>) {
  const all: LocaleDef<Dict | Translation<D>>[] = [config.reference, ...config.locales];
  const codes = all.map((l) => l.code);
  const byCode = new Map<string, LocaleDef<Dict | Translation<D>>>(all.map((l) => [l.code, l]));

  const Ctx = createContext<I18n<D> | null>(null);

  function initial(): string {
    const stored = config.storage?.read();
    if (stored && byCode.has(stored)) return stored;
    const asked = typeof navigator === "undefined" ? [] : (navigator.languages ?? [navigator.language]).filter(Boolean);
    return pickLocale(asked, codes, config.reference.code);
  }

  function I18nProvider({ children }: { children: ReactNode }) {
    const [locale, setLocaleState] = useState(initial);

    const value = useMemo<I18n<D>>(() => {
      const dict = (byCode.get(locale)?.dict ?? {}) as Dict;
      return {
        locale,
        locales: all.map((l) => ({ code: l.code, label: l.label })),
        setLocale: (code) => {
          if (!byCode.has(code)) return;
          config.storage?.write(code);
          setLocaleState(code);
          // The document's language is what a screen reader announces in and
          // what the browser hyphenates by. Setting only React state would
          // leave assistive tech reading German in an English voice.
          if (typeof document !== "undefined") document.documentElement.lang = code;
        },
        t: (key, vars) => {
          const raw = dict[key] ?? config.reference.dict[key];
          // A key that exists in NEITHER is a programming error, and returning
          // the key here is the one case where showing it is right: it is a
          // developer's mistake, not a translator's gap.
          if (raw === undefined) return key;
          return interpolate(plural(raw, vars?.count as number | undefined), vars);
        },
      };
    }, [locale]);

    return createElement(Ctx.Provider, { value }, children);
  }

  function useI18n(): I18n<D> {
    const c = useContext(Ctx);
    if (!c) throw new Error("useI18n outside I18nProvider");
    return c;
  }

  /** The common case, so screens read `t("stock.empty")` and nothing else. */
  const useT = (): I18n<D>["t"] => useI18n().t;

  return { I18nProvider, useI18n, useT };
}

/**
 * Which keys a translation is missing.
 *
 * Exported so an app can make its own gaps a TEST rather than a discovery. A
 * `Partial` type keeps a half-finished locale compiling, which is right — but it
 * also means nothing stops a half-finished locale from shipping, and this is the
 * other half of that trade.
 */
export function missingKeys<D extends Dict>(reference: D, translation: Translation<D>): string[] {
  return Object.keys(reference).filter((k) => translation[k as keyof D] === undefined);
}

/** Keys a translation has that the reference does not — a rename left behind. */
export function strayKeys<D extends Dict>(reference: D, translation: Translation<D>): string[] {
  return Object.keys(translation).filter((k) => !(k in reference));
}

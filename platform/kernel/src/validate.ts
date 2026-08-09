/**
 * THE BOUNDARY — where untyped bytes become typed values, once.
 *
 * Layer 1. Imports primitives only.
 *
 * ⚠️ A TYPE ASSERTION IS NOT A CHECK. `input as { title: string }` compiles,
 * reads like validation, and lets a number reach a TEXT column — where SQLite
 * stores it happily, because its types are per value. The row is wrong, nothing
 * throws, and the defect surfaces as a rendering bug in a screen nobody
 * associates with the write.
 *
 * ⚠️ AND THE OUTPUT IS BRANDED. `Instant` and `Id<K>` exist so a millisecond
 * number cannot reach a column that holds ISO text — but a value cast at the
 * boundary is branded by assertion rather than by inspection, which protects the
 * column and not the wire. Parsing is the only place the brand can be earned.
 *
 * No dependency: a validator is a few hundred lines, and the alternative is a
 * package whose error shape has to be translated into a `Problem` anyway.
 */

import type { Id, Instant, Money, PlainDate } from "./primitives.js";

/* ---------------------------------------------------------------- results --- */

export interface Issue {
  /** Dotted, so a form can put the message on the field: `items.2.title`. */
  readonly path: string;
  readonly message: string;
}

export type Parsed<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly issues: readonly Issue[] };

/**
 * A validator and its description, together.
 *
 * ⚠️ ONE OBJECT, so the API document cannot describe a shape the runtime does
 * not enforce. Two declarations — a validator and a hand-written schema — drift
 * the first time one is edited, and the document is the half nobody runs.
 */
export interface Shape<T> {
  parse(value: unknown, path?: string): Parsed<T>;
  readonly json: JsonShape;
}

export type JsonShape =
  | { readonly kind: "text"; readonly pattern?: string; readonly max?: number }
  | { readonly kind: "number"; readonly integer?: boolean; readonly min?: number; readonly max?: number }
  | { readonly kind: "bool" }
  | { readonly kind: "enum"; readonly of: readonly string[] }
  | { readonly kind: "id"; readonly of: string }
  | { readonly kind: "instant" }
  | { readonly kind: "plainDate" }
  | { readonly kind: "money" }
  | { readonly kind: "json" }
  | { readonly kind: "array"; readonly of: JsonShape }
  | { readonly kind: "object"; readonly fields: Readonly<Record<string, { readonly shape: JsonShape; readonly optional: boolean }>> };

/** What a shape yields — so an operation's input type is INFERRED, never restated. */
export type Infer<S> = S extends Shape<infer T> ? T : never;

const bad = (path: string, message: string): Parsed<never> => ({ ok: false, issues: [{ path, message }] });
const good = <T>(value: T): Parsed<T> => ({ ok: true, value });

/* --------------------------------------------------------------- scalars --- */

const shape = <T>(json: JsonShape, parse: (v: unknown, path: string) => Parsed<T>): Shape<T> => ({
  json,
  parse: (v, path = "") => parse(v, path),
});

export const s = {
  text(o: { min?: number; max?: number; pattern?: RegExp } = {}): Shape<string> {
    return shape({ kind: "text", ...(o.pattern ? { pattern: o.pattern.source } : {}), ...(o.max ? { max: o.max } : {}) }, (v, path) => {
      if (typeof v !== "string") return bad(path, "must be text");
      if (o.min !== undefined && v.length < o.min) return bad(path, `must be at least ${o.min} character(s)`);
      if (o.max !== undefined && v.length > o.max) return bad(path, `must be at most ${o.max} character(s)`);
      if (o.pattern && !o.pattern.test(v)) return bad(path, "is not in the expected format");
      return good(v);
    });
  },

  number(o: { integer?: boolean; min?: number; max?: number } = {}): Shape<number> {
    return shape({ kind: "number", ...o }, (v, path) => {
      /*
        ⚠️ `NaN` AND `Infinity` ARE NUMBERS to `typeof`, and both survive JSON
        round trips through some producers. Either one reaching an arithmetic
        column poisons every total computed from it, silently and permanently.
      */
      if (typeof v !== "number" || !Number.isFinite(v)) return bad(path, "must be a number");
      if (o.integer && !Number.isInteger(v)) return bad(path, "must be a whole number");
      if (o.min !== undefined && v < o.min) return bad(path, `must be at least ${o.min}`);
      if (o.max !== undefined && v > o.max) return bad(path, `must be at most ${o.max}`);
      return good(v);
    });
  },

  bool(): Shape<boolean> {
    return shape({ kind: "bool" }, (v, path) => (typeof v === "boolean" ? good(v) : bad(path, "must be true or false")));
  },

  enum<const T extends readonly string[]>(of: T): Shape<T[number]> {
    return shape({ kind: "enum", of }, (v, path) =>
      typeof v === "string" && of.includes(v) ? good(v as T[number]) : bad(path, `must be one of: ${of.join(", ")}`));
  },

  /** ⚠️ Branded on the way through, so the brand is earned rather than asserted. */
  id<K extends string>(of: K): Shape<Id<K>> {
    return shape({ kind: "id", of }, (v, path) =>
      typeof v === "string" && v.length > 0 && v.length <= 64 ? good(v as Id<K>) : bad(path, "is not a valid identifier"));
  },

  /**
   * ⚠️ ISO-8601 UTC, CHECKED — not merely "a string that parses".
   *
   * `Date.parse` accepts `"2026"`, `"March 3"` and a dozen other things, and
   * every one of them lands in a column whose values are compared
   * lexicographically. A row that sorts wrongly is not an error anywhere; it is
   * a ladder that fires on the wrong day.
   */
  instant(): Shape<Instant> {
    const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
    return shape({ kind: "instant" }, (v, path) => {
      if (typeof v !== "string" || !ISO.test(v) || Number.isNaN(Date.parse(v))) return bad(path, "must be a UTC timestamp");
      return good(v as Instant);
    });
  },

  plainDate(): Shape<PlainDate> {
    const DAY = /^\d{4}-\d{2}-\d{2}$/;
    return shape({ kind: "plainDate" }, (v, path) => {
      if (typeof v !== "string" || !DAY.test(v) || Number.isNaN(Date.parse(v))) return bad(path, "must be a date");
      return good(v as PlainDate);
    });
  },

  /** ⚠️ Minor units and a currency, together. An amount alone is a number. */
  money(): Shape<Money> {
    return shape({ kind: "money" }, (v, path) => {
      if (typeof v !== "object" || v === null) return bad(path, "must be an amount");
      const { minor, currency } = v as { minor?: unknown; currency?: unknown };
      if (typeof minor !== "number" || !Number.isInteger(minor)) return bad(`${path}.minor`, "must be a whole number of the smallest unit");
      if (typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency)) return bad(`${path}.currency`, "must be a three-letter currency");
      return good({ minor, currency });
    });
  },

  /**
   * An opaque blob, stored and returned unexamined.
   *
   * ⚠️ IT IS STILL BOUNDED. "Any JSON" with no ceiling is a request body that
   * fills a column, a row that cannot be read back, and a cheap way to fill a
   * tenant's storage from an unauthenticated form.
   */
  json(maxBytes = 64_000): Shape<unknown> {
    return shape({ kind: "json" }, (v, path) => {
      const size = JSON.stringify(v ?? null).length;
      return size > maxBytes ? bad(path, `is too large (${size} bytes)`) : good(v);
    });
  },

  array<T>(of: Shape<T>, o: { max?: number } = {}): Shape<T[]> {
    return shape({ kind: "array", of: of.json }, (v, path) => {
      if (!Array.isArray(v)) return bad(path, "must be a list");
      if (o.max !== undefined && v.length > o.max) return bad(path, `must have at most ${o.max} item(s)`);
      const out: T[] = [];
      const issues: Issue[] = [];
      v.forEach((item, i) => {
        const r = of.parse(item, path ? `${path}.${i}` : String(i));
        if (r.ok) out.push(r.value);
        else issues.push(...r.issues);
      });
      return issues.length ? { ok: false, issues } : good(out);
    });
  },

  /**
   * ⚠️ AN UNDECLARED KEY IS DROPPED, NEVER PASSED THROUGH.
   *
   * A body that carries more than the shape describes is either a client that
   * has moved on or somebody probing for a field that used to be honoured.
   * Forwarding the extra is how a mass-assignment bug happens: a field nobody
   * declared reaches a writer that spreads its input.
   */
  object<F extends Record<string, Shape<unknown> | Optional<unknown>>>(fields: F): Shape<ObjectOf<F>> {
    const json: Record<string, { shape: JsonShape; optional: boolean }> = {};
    for (const [key, f] of Object.entries(fields)) json[key] = { shape: f.json, optional: isOptional(f) };

    return shape({ kind: "object", fields: json }, (v, path) => {
      if (typeof v !== "object" || v === null || Array.isArray(v)) return bad(path, "must be an object");
      const source = v as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      const issues: Issue[] = [];

      for (const [key, f] of Object.entries(fields)) {
        const at = path ? `${path}.${key}` : key;
        const present = Object.prototype.hasOwnProperty.call(source, key) && source[key] !== undefined;
        if (!present) {
          if (isOptional(f)) continue;
          issues.push({ path: at, message: "is required" });
          continue;
        }
        const r = f.parse(source[key], at);
        if (r.ok) out[key] = r.value;
        else issues.push(...r.issues);
      }
      return issues.length ? { ok: false, issues } : good(out as ObjectOf<F>);
    });
  },

  optional<T>(of: Shape<T>): Optional<T> {
    return { ...of, [OPTIONAL]: true } as Optional<T>;
  },
};

/* -------------------------------------------------------------- optional --- */

/**
 * ⚠️ A REAL SYMBOL, NOT A `declare const`. The optional marker is read at
 * RUNTIME — it decides whether a missing key is an error — so a type-only brand
 * makes the lookup `obj[undefined]`, which compiles, returns undefined, and
 * silently makes every optional field required.
 */
const OPTIONAL: unique symbol = Symbol.for("one.shape.optional");
export type Optional<T> = Shape<T> & { readonly [OPTIONAL]: true };
const isOptional = (f: unknown): boolean => Boolean((f as Record<symbol, unknown>)[OPTIONAL]);

type OptionalKeys<F> = { [K in keyof F]: F[K] extends Optional<unknown> ? K : never }[keyof F];
type RequiredKeys<F> = Exclude<keyof F, OptionalKeys<F>>;

export type ObjectOf<F> =
  & { readonly [K in RequiredKeys<F>]: Infer<F[K]> }
  & { readonly [K in OptionalKeys<F>]?: Infer<F[K]> };

/* ----------------------------------------------------------------- empty --- */

/** An operation that takes nothing still declares that it takes nothing. */
export const nothing = (): Shape<Record<string, never>> => s.object({}) as Shape<Record<string, never>>;

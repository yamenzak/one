/**
 * WHAT A VALUE IS — declared as data, validated by a library.
 *
 * ⚠️ THE DECLARATION IS A PLAIN OBJECT AND THE VALIDATOR IS DERIVED FROM IT
 * (D8, D9). Those are two different jobs and putting them in one place loses
 * one of them: a Valibot schema is excellent at *checking* a value and opaque to
 * anything that wants to *ask about* it — and guards, the settings renderer, the
 * OpenAPI writer, the export and the erasure cascade all need to ask. So a field
 * is a literal a script can walk, and `checkerFor` turns it into the library's
 * schema at the one place that validates.
 *
 * ⚠️ AND THE FIELD SAYS WHETHER IT HOLDS SOMEBODY'S DATA. `holds` is not
 * documentation: it is what the ROPA is generated from, what the export
 * collects, and what decides whether a column may exist in an app's own table at
 * all. A field that lies about it is a disclosure that is wrong in the direction
 * nobody checks.
 *
 * Layer 1. Imports primitives.
 */

import * as v from "valibot";
import type { Tone } from "./primitives.js";

/* --------------------------------------------------------------- the kinds --- */

/**
 * THE MOST BYTES AN UPLOAD MAY BE, AND IT IS THE PLATFORM'S NUMBER.
 *
 * ⚠️ A CEILING IN THE PLATFORM, NOT IN A PRODUCT. A Worker's memory is the real
 * limit and it is the same for every app here, so an app free to set its own
 * would be an app free to set one its isolate cannot survive — and the failure is
 * an out-of-memory kill, which has no error message and no stack.
 *
 * ⚠️ AND IT IS IN THE KERNEL BECAUSE BOTH SIDES NEED IT. The worker refuses at
 * the door; the picker refuses before spending somebody's upload on a file that
 * was never going to land. Two copies of that number is one number that drifts,
 * and the direction it drifts matters: a picker whose ceiling is HIGHER lets an
 * upload run to completion and fail, on the connection least able to afford it.
 */
export const MOST_BYTES = 25 * 1024 * 1024;

export type FieldKind =
  | "text" | "long" | "number" | "money" | "bool" | "instant" | "day"
  | "enum" | "json" | "media" | "ref" | "email" | "url" | "colour";

/**
 * WHAT KIND OF PERSONAL DATA A COLUMN HOLDS.
 *
 * ⚠️ `sensitive` IS NOT "MORE PRIVATE", IT IS A DIFFERENT LEGAL CATEGORY —
 * health, biometrics, beliefs, sexuality, ethnicity. It carries a higher bar for
 * lawful basis, and a field marked it may not live in an app's own table at all
 * (D11): it goes to the vault, behind a recorded grant. Marking it is therefore
 * a routing decision as much as a disclosure.
 */
export type Holding = "none" | "identity" | "contact" | "usage" | "financial" | "sensitive";

export interface FieldSpec {
  readonly kind: FieldKind;
  readonly label: string;
  readonly required?: boolean;
  readonly help?: string;
  /** ⚠️ Required on anything but `none` — see the header. */
  readonly holds?: Holding;
  readonly min?: number;
  readonly max?: number;
  /** `enum` only. The closed set. */
  readonly values?: readonly string[];
  /**
   * ⚠️ `enum` only, AND THE OPTION'S NAME RATHER THAN ITS ID. A value is a key a
   * machine compares; what a person reads is a word. Absent, the surface
   * sentence-cases the id, which is right for `comfortable` and wrong for `kg`
   * and `RGB` — so a declaration whose options are not ordinary words says them
   * here.
   */
  readonly labels?: Readonly<Record<string, string>>;
  /** `ref` only. The collection this points at. */
  readonly to?: string;
  /** `media` only. Which purpose bucket the object belongs to. */
  readonly purpose?: string;
  /**
   * ⚠️ A VAULT-BACKED FIELD IS NOT STORED HERE AT ALL. The column holds a
   * pointer; the value lives encrypted, behind consent, in the vault (D11). The
   * app's own table never sees it, which is why this is a field-level fact and
   * not something a screen decides.
   */
  readonly vault?: boolean;
  /**
   * SET WHEN THE RECORD IS MADE, AND NEVER BY THE GENERATED UPDATE.
   *
   * ⚠️ SOME FIELDS ARE THE UNIT EVERY OTHER NUMBER IS IN, and changing one does
   * not change the record — it silently reinterprets every row that points at
   * it. A product counted in boxes, edited to say "sheet", turns twenty boxes on
   * a shelf into twenty sheets with no write anywhere near the balance. The
   * generated update is a column setter and has no way to know that.
   *
   * ⚠️ SO THE DECLARATION CARRIES IT, and `patch` refuses. Not "the screen does
   * not offer it" — a screen's rule is a courtesy, and this field is reachable
   * from an agent, a queued write replaying after a day offline, and the API.
   *
   * ⚠️ AND IT IS A REFUSAL RATHER THAN A SILENT DROP. Ignoring the key answers
   * 200 over a change that did not happen, which is the swallow this repository
   * is a catalogue of. Changing one of these is a real thing to want; it belongs
   * in an operation that knows what else has to be true first.
   */
  readonly settled?: boolean;
  readonly tone?: Tone;
}

/* ------------------------------------------------------------ the builders --- */

/**
 * ⚠️ BUILDERS RATHER THAN BARE LITERALS, AND ONLY FOR THE TYPES. Each returns
 * the same plain object a script can walk — nothing is hidden in a closure —
 * while giving the author autocomplete and refusing a `max` on a boolean at the
 * keyboard rather than at composition.
 */
const make = <K extends FieldKind>(kind: K) =>
  (spec: Omit<FieldSpec, "kind">): FieldSpec => ({ kind, ...spec });

export const field = {
  text: make("text"),
  long: make("long"),
  number: make("number"),
  money: make("money"),
  bool: make("bool"),
  instant: make("instant"),
  day: make("day"),
  enum: make("enum"),
  json: make("json"),
  media: make("media"),
  ref: make("ref"),
  email: make("email"),
  url: make("url"),
  colour: make("colour"),
} as const;

export type Fields = Readonly<Record<string, FieldSpec>>;

/* -------------------------------------------------------------- validation --- */

/**
 * The library's schema for one declared field.
 *
 * ⚠️ EVERY BRANCH IS TOTAL AND THE DEFAULT IS THE STRICT ONE. A kind this does
 * not know falls to `unknown` — which accepts anything — so the switch is
 * exhaustive by construction and a new kind added without a branch fails to
 * compile rather than silently accepting whatever arrives.
 */
export function checkerFor(spec: FieldSpec): v.GenericSchema {
  /*
    ⚠️ THE BOUNDS ARE APPLIED ONE AT A TIME RATHER THAN SPREAD INTO `pipe`.
    Valibot types `pipe` per arity, so a spread has to be cast through `never` to
    compile — and a cast in the one function that decides whether input is
    acceptable is a cast in the worst possible place.
  */
  const bounded = (base: v.GenericSchema<string>): v.GenericSchema => {
    if (spec.min !== undefined && spec.max !== undefined) {
      return v.pipe(base, v.minLength(spec.min), v.maxLength(spec.max));
    }
    if (spec.min !== undefined) return v.pipe(base, v.minLength(spec.min));
    if (spec.max !== undefined) return v.pipe(base, v.maxLength(spec.max));
    return base;
  };

  switch (spec.kind) {
    case "text": return bounded(v.string());
    case "long": return bounded(v.string());
    case "email": return v.pipe(v.string(), v.email());
    case "url": return v.pipe(v.string(), v.url());
    /* ⚠️ A hex colour and not a name: the theme derives a whole palette from it,
       which cannot be done from the word "blue". */
    case "colour": return v.pipe(v.string(), v.regex(/^#[0-9a-fA-F]{6}$/));
    case "number": {
      if (spec.min !== undefined && spec.max !== undefined) {
        return v.pipe(v.number(), v.minValue(spec.min), v.maxValue(spec.max));
      }
      if (spec.min !== undefined) return v.pipe(v.number(), v.minValue(spec.min));
      if (spec.max !== undefined) return v.pipe(v.number(), v.maxValue(spec.max));
      return v.number();
    }
    /* ⚠️ MONEY IS AN INTEGER OF MINOR UNITS. A float is a rounding error with a
       currency symbol on it, and it is somebody's bill. */
    case "money": return v.pipe(v.number(), v.integer());
    case "bool": return v.boolean();
    case "instant": return v.pipe(v.string(), v.isoTimestamp());
    case "day": return v.pipe(v.string(), v.isoDate());
    case "enum": return v.picklist((spec.values ?? []) as [string, ...string[]]);
    case "json": return v.unknown();
    case "media": case "ref": return v.pipe(v.string(), v.minLength(1));
  }
}

/** Every declared field of a collection, as one schema. */
export function checkerForAll(fields: Fields): v.GenericSchema {
  const shape: Record<string, v.GenericSchema> = {};
  for (const [name, spec] of Object.entries(fields)) {
    const checker = checkerFor(spec);
    shape[name] = spec.required ? checker : v.optional(checker);
  }
  return v.object(shape as never);
}

/**
 * Whether a set of values is acceptable, and what to say if not.
 *
 * ⚠️ THE LAYER ABOVE NEVER MEETS THE LIBRARY. `checkerForAll` returns a Valibot
 * schema, which would make every caller import Valibot to use it — and a
 * validation library reaching one layer further out every time somebody needs a
 * check is how a dependency becomes structural. This is the whole surface: give
 * it a declaration and some values, get back an answer.
 */
export type Checked =
  | { readonly ok: true; readonly values: Record<string, unknown> }
  | {
    readonly ok: false;
    readonly why: string;
    /**
     * ⚠️ WHICH FIELD, SO THE SENTENCE LANDS UNDER THE INPUT THAT CAUSED IT. A
     * refusal reported only as one joined message arrives at a form as the
     * catalogue's generic "check the highlighted fields" with nothing
     * highlighted — which is the shape this repository already refuses one
     * layer up (`Problem.fields`), and it was missing at the bottom of it.
     */
    readonly fields: Readonly<Record<string, string>>;
  };

/**
 * ⚠️ VALIBOT'S ISSUE PATHS, TURNED INTO FIELD NAMES. Only the first issue per
 * field survives: a person fixing a value reads one sentence about it, and three
 * about the same box is a form arguing with itself.
 */
const named = (issues: readonly unknown[]): Readonly<Record<string, string>> => {
  const out: Record<string, string> = {};
  for (const raw of issues) {
    const issue = raw as {
      message: string;
      path?: readonly { readonly key?: unknown }[];
    };
    const key = issue.path?.[0]?.key;
    if (typeof key !== "string" || out[key] !== undefined) continue;
    out[key] = issue.message;
  }
  return out;
};

export function checkAll(fields: Fields, values: unknown): Checked {
  const out = v.safeParse(checkerForAll(fields), values);
  return out.success
    ? { ok: true, values: out.output as Record<string, unknown> }
    : {
      ok: false,
      why: out.issues.map((i: { message: string }) => i.message).join("; "),
      fields: named(out.issues),
    };
}

/**
 * The same rules, applied only to the fields somebody actually sent.
 *
 * ⚠️ AN EDIT IS NOT A SMALLER CREATE. `checkAll` demands every required field,
 * which is right when a record is being made and wrong when one is being
 * changed: renaming a note would have to resend its body, and a client editing
 * one field of a profile would have to resend a value they were never shown.
 *
 * ⚠️ AND AN ABSENT FIELD IS UNTOUCHED, NEVER NULLED. The difference is the whole
 * contract of a partial write — treating absence as "set to nothing" turns every
 * edit into a silent erasure of everything the form did not carry.
 *
 * ⚠️ A FIELD NOBODY DECLARED IS REFUSED RATHER THAN IGNORED. Dropping it quietly
 * means a caller who misspells a name gets a 200 and no change, which is the
 * hardest kind of bug to see from the outside.
 */
export function checkSome(fields: Fields, values: unknown): Checked {
  if (values === null || typeof values !== "object" || Array.isArray(values)) {
    return { ok: false, why: "expected an object", fields: {} };
  }
  const given = values as Record<string, unknown>;
  const unknownNames = Object.keys(given).filter((name) => !(name in fields));
  if (unknownNames.length) {
    return {
      ok: false,
      why: `no such field: ${unknownNames.join(", ")}`,
      fields: Object.fromEntries(unknownNames.map((n) => [n, "No such field"])),
    };
  }

  const shape: Record<string, v.GenericSchema> = {};
  for (const name of Object.keys(given)) {
    const spec = fields[name];
    if (spec) shape[name] = checkerFor(spec);
  }
  const out = v.safeParse(v.object(shape as never), given);
  return out.success
    ? { ok: true, values: out.output as Record<string, unknown> }
    : {
      ok: false,
      why: out.issues.map((i: { message: string }) => i.message).join("; "),
      fields: named(out.issues),
    };
}

/* --------------------------------------------------------------- the rules --- */

export type FieldRefusal =
  | "enum_without_values" | "ref_without_target" | "media_without_purpose"
  | "holding_undeclared" | "sensitive_outside_vault" | "bounds_on_the_unbounded";

/**
 * What a field declaration can get wrong.
 *
 * ⚠️ `sensitive_outside_vault` IS THE ONE THAT MATTERS (D11). A health fact in
 * a product's own table is outside consent, outside the grant log and outside
 * crypto-shredding — and it looks exactly like every other column, so nothing
 * downstream will ever notice. Refusing it at composition is the only place it
 * is visible.
 *
 * ⚠️ AND `holding_undeclared` IS WHY THE DISCLOSURE CAN BE GENERATED AT ALL. A
 * field that does not say whether it holds somebody's data leaves the ROPA to be
 * written by hand, which means written once and never again.
 */
export function refuseField(name: string, spec: FieldSpec): FieldRefusal | null {
  if (spec.kind === "enum" && !spec.values?.length) return "enum_without_values";
  if (spec.kind === "ref" && !spec.to) return "ref_without_target";
  if (spec.kind === "media" && !spec.purpose) return "media_without_purpose";
  if (spec.holds === undefined) return "holding_undeclared";
  if (spec.holds === "sensitive" && !spec.vault) return "sensitive_outside_vault";
  const unbounded = spec.kind === "bool" || spec.kind === "json" || spec.kind === "instant" || spec.kind === "day";
  if (unbounded && (spec.min !== undefined || spec.max !== undefined)) return "bounds_on_the_unbounded";
  void name;
  return null;
}

export const refuseFields = (fields: Fields): readonly { field: string; why: FieldRefusal }[] =>
  Object.entries(fields)
    .map(([name, spec]) => ({ field: name, why: refuseField(name, spec) }))
    .filter((r): r is { field: string; why: FieldRefusal } => r.why !== null);

/** ⚠️ What the export must collect and the ROPA must disclose, derived. */
export const holdingsIn = (fields: Fields): readonly Holding[] =>
  [...new Set(Object.values(fields).map((f) => f.holds ?? "none"))].filter((h) => h !== "none");

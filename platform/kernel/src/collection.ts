/**
 * A COLLECTION — a table, and everything derivable from declaring one.
 *
 * Layer 2. Imports primitives.
 *
 * From one declaration: the DDL, the erasure scope, CRUD as operations (and so
 * routes, tools and webhooks), the naming counter, the document lifecycle, soft
 * delete, the activity log, the list/detail views, the search index and the
 * offline policy.
 *
 * Roughly three quarters of every surface in the three existing products is a
 * collection view or the chrome around one. This is where the manifest pays.
 */

import type { Dimension, Id, Instant } from "./primitives.js";

/* ---------------------------------------------------------------- fields --- */

interface FieldCommon {
  readonly label?: string;
  readonly required?: boolean;
  /** Who may read and write this FIELD, when that is narrower than the row. */
  readonly read?: string;
  readonly write?: string;
  /** Excluded from exports and from anything an AI tool can see. */
  readonly sensitive?: boolean;
}

export interface TextField extends FieldCommon { readonly kind: "text"; readonly max?: number; readonly multiline?: boolean }
export interface NumberField extends FieldCommon { readonly kind: "number"; readonly min?: number; readonly max?: number; readonly integer?: boolean }
export interface BoolField extends FieldCommon { readonly kind: "bool" }
export interface EnumField<V extends string = string> extends FieldCommon { readonly kind: "enum"; readonly values: readonly V[] }
export interface RefField extends FieldCommon { readonly kind: "ref"; readonly to: string; readonly onDelete: "restrict" | "cascade" | "null" }
export interface JsonField extends FieldCommon { readonly kind: "json"; readonly schema: string }
export interface MoneyField extends FieldCommon { readonly kind: "money" }
export interface InstantField extends FieldCommon { readonly kind: "instant" }
export interface PlainDateField extends FieldCommon { readonly kind: "plainDate" }

/** Stored canonical, rendered in the reader's own system. One number, two views. */
export interface QuantityField extends FieldCommon { readonly kind: "quantity"; readonly dimension: Dimension }

export interface MediaField extends FieldCommon {
  readonly kind: "media";
  readonly accept: readonly string[];
  readonly maxBytes: number;
  /**
   * ⚠️ DEFAULTS TO TRUE, AND MUST BE DISABLED DELIBERATELY.
   *
   * A photograph from a phone carries GPS coordinates, a device serial and a
   * capture time. A progress photo taken at home is a home address, and a
   * scanned document is wherever it was scanned.
   *
   * This is the sharpest of the day-zero fields in MANIFEST.md §9 because it is
   * the only one where arriving late does not help: stripping metadata next year
   * does nothing for what was uploaded this year. The default has to be right
   * the first time somebody stores an image.
   */
  readonly exifStrip?: boolean;
}

export type Field =
  | TextField | NumberField | BoolField | EnumField | RefField | JsonField
  | MoneyField | InstantField | PlainDateField | QuantityField | MediaField;

export const field = {
  text: (o: Omit<TextField, "kind"> = {}): TextField => ({ kind: "text", ...o }),
  number: (o: Omit<NumberField, "kind"> = {}): NumberField => ({ kind: "number", ...o }),
  bool: (o: Omit<BoolField, "kind"> = {}): BoolField => ({ kind: "bool", ...o }),
  enum: <const V extends string>(values: readonly V[], o: Omit<EnumField<V>, "kind" | "values"> = {}): EnumField<V> => ({ kind: "enum", values, ...o }),
  ref: (to: string, o: Omit<RefField, "kind" | "to"> = { onDelete: "restrict" }): RefField => ({ kind: "ref", to, ...o }),
  json: (schema: string, o: Omit<JsonField, "kind" | "schema"> = {}): JsonField => ({ kind: "json", schema, ...o }),
  money: (o: Omit<MoneyField, "kind"> = {}): MoneyField => ({ kind: "money", ...o }),
  instant: (o: Omit<InstantField, "kind"> = {}): InstantField => ({ kind: "instant", ...o }),
  plainDate: (o: Omit<PlainDateField, "kind"> = {}): PlainDateField => ({ kind: "plainDate", ...o }),
  quantity: (dimension: Dimension, o: Omit<QuantityField, "kind" | "dimension"> = {}): QuantityField => ({ kind: "quantity", dimension, ...o }),
  media: (o: Omit<MediaField, "kind">): MediaField => ({ kind: "media", exifStrip: true, ...o }),
} as const;

/* ----------------------------------------------------------------- scope --- */

/**
 * WHOSE ROWS THESE ARE — and the reason erasure can be derived rather than
 * maintained.
 *
 * ⚠️ `platform` is not an oversight to be tightened later. A licensed music
 * library every workspace draws from, a plan catalog, a webhook seen-set: each
 * is shared, none has a tenant to key on, and putting one in a tenant cascade
 * means the first erasure takes it away from everybody else. A collection type
 * that assumes tenancy cannot express those, so it must be a stated choice.
 */
export type Scope =
  | { readonly of: "tenant" }
  | { readonly of: "subject"; readonly subject: string }
  | { readonly of: "platform"; readonly why: string };

/* ------------------------------------------------------------- lifecycle --- */

/**
 * Draft → submitted → cancelled → amended, for records that are DOCUMENTS: a
 * sterilisation cycle, an invoice, a signed plan.
 *
 * ⚠️ Opt-in per collection, deliberately. It is exactly right for a record that
 * asserts something happened and exactly wrong for a customer profile, and a
 * framework that imposed it everywhere would be the first thing anybody had to
 * work around — which is the failure mode this whole platform is meant to avoid.
 */
export interface DocStatus {
  readonly amendable: boolean;
  /** Frozen once submitted; an amendment supersedes rather than edits. */
  readonly immutableAfterSubmit: readonly string[];
}

/** `CL-.YYYY.-.####` — a human-quotable name, allocated once, never reused. */
export interface NamingSeries { readonly series: string }

export type DeletePolicy =
  /** The row stays, hidden, recoverable, still counted for audit. */
  | { readonly on: "archive" }
  /** Actually gone. For collections where retention forbids keeping it. */
  | { readonly on: "purge" };

export interface Retention {
  /** Null means "until the tenant leaves". A number is a legal or product limit. */
  readonly days: number | null;
  readonly onTenantClose: "purge" | "export-then-purge";
}

/* ------------------------------------------------------------------ view --- */

export interface ListView {
  readonly columns: readonly string[];
  readonly filters?: readonly string[];
  readonly defaultSort?: string;
  readonly groupBy?: string;
}
export interface DetailView { readonly tabs: readonly { readonly id: string; readonly fields: readonly string[] }[] }

/** What a device keeps when it is offline, and what happens to writes made then. */
export type OfflinePolicy = "none" | "cache" | "cache-and-queue";

/* ------------------------------------------------------------- collection --- */

export interface CollectionSpec {
  readonly id: string;
  readonly label: { readonly one: string; readonly many: string };
  readonly scope: Scope;
  readonly fields: Readonly<Record<string, Field>>;

  /**
   * ⚠️ REQUIRED, AND THE FIELD MOST LIKELY TO BE RESENTED.
   *
   * An integer bumped on every write, so two people editing the same record
   * cannot silently overwrite each other — and neither can a tool call racing a
   * human, which is the same problem with worse timing and no witness.
   *
   * It is `true` rather than `boolean` because adding it later is one column on
   * every table in the platform, and because the collections most likely to opt
   * out are the busy ones that need it most.
   */
  readonly version: true;

  readonly retention: Retention;
  readonly onDelete: DeletePolicy;

  readonly naming?: NamingSeries;
  readonly docStatus?: DocStatus;
  /** The append-only record of who changed what. Off only for pure caches. */
  readonly activity?: boolean;
  readonly search?: readonly string[];
  readonly offline?: OfflinePolicy;
  /** Live updates, backed by a durable actor. */
  readonly realtime?: boolean;
  readonly views?: { readonly list?: ListView; readonly detail?: DetailView };
  /** A printable rendering. A label or a report is not a screenshot. */
  readonly print?: readonly string[];
}

export function collection<const C extends CollectionSpec>(spec: C): C {
  return spec;
}

/** The row type a collection implies, before the generated projection exists. */
export interface RowBase {
  readonly id: Id<string>;
  readonly version: number;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
  readonly deletedAt: Instant | null;
}

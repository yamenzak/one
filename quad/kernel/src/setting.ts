/**
 * A CHOICE SOMEBODY CAN MAKE — declared once, rendered by the platform.
 *
 * ⚠️ NO APP WRITES A SETTINGS SCREEN. Three of them exist — the person's, the
 * workspace's and the operator's — and each is generated from the declarations
 * whose `level` names it. An app that hand-built one would be the only place a
 * new setting has to be remembered, which is the exact shape D12 exists to
 * remove.
 *
 * ⚠️ AND THE LEVEL IS AN AUTHORITY, NOT A TAB. It decides who may write the row
 * and where the value is stored. A setting rendered on the workspace screen and
 * stored per person is one an owner changes for everybody and sees change for
 * nobody.
 *
 * ⚠️ A SECRET IS WRITE-ONLY, ALWAYS. A stored key rendered back into a form is a
 * credential handed to every screen that can open that form, to every browser
 * extension in the page, and to whatever the browser saved. It is written, it is
 * never read back, and what a screen shows is whether it is set.
 *
 * Layer 2. Imports primitives and field.
 */

import type { FieldSpec } from "./field.js";
import { refuseField } from "./field.js";

/* ------------------------------------------------------------------ shape --- */

/**
 * ⚠️ THREE LEVELS AND NO FOURTH.
 *
 *   person    theirs, everywhere, across every workspace they are in.
 *   tenant    the workspace's, set by somebody who holds `needs`.
 *   operator  the deployment's. A tenant may not write it and must not see it —
 *             it is our provider keys, our ceilings, our switches.
 */
export type Level = "person" | "tenant" | "operator";

export interface SettingDef {
  readonly id: string;
  readonly level: Level;
  readonly field: FieldSpec;
  /** ⚠️ Required. A setting with no default has no value until somebody visits
      a screen, and every reader then has to invent one — differently. */
  readonly fallback: unknown;
  /** The section it renders under. Sections are ordered by first appearance. */
  readonly group: string;
  /**
   * ⚠️ WHO MAY CHANGE IT. Absent on a `person` setting (it is theirs); required
   * on a `tenant` one, because "any member may edit the workspace" is not a
   * policy anybody chose.
   */
  readonly needs?: string;
  /**
   * ⚠️ WRITE-ONLY. See the header — this is what makes it never render back.
   */
  readonly secret?: boolean;
  /** Where the value is only meaningful with an entitlement, name it. */
  readonly entitlement?: string;
  readonly help?: string;
}

export type SettingBook = Readonly<Record<string, SettingDef>>;

export const setting = (def: SettingDef): SettingDef => def;

/* ---------------------------------------------------------------- derived --- */

/** The screens, derived. Nothing is registered and no app writes one. */
export const settingsOn = (book: SettingBook, level: Level): readonly SettingDef[] =>
  Object.values(book).filter((s) => s.level === level);

/** ⚠️ Sections in first-appearance order, so a declaration's order is the screen's. */
export const groupsOn = (book: SettingBook, level: Level): readonly string[] =>
  [...new Set(settingsOn(book, level).map((s) => s.group))];

/**
 * What a reader gets.
 *
 * ⚠️ ONE RESOLUTION, AND A MISSING ROW IS THE FALLBACK RATHER THAN `undefined`.
 * Every consumer inventing its own default is how two screens come to disagree
 * about what a workspace has switched on.
 */
export const valueOf = (
  def: SettingDef,
  stored: Readonly<Record<string, unknown>>,
): unknown => (stored[def.id] === undefined || stored[def.id] === "" ? def.fallback : stored[def.id]);

/**
 * ⚠️ A SECRET IS REPORTED AS SET OR UNSET AND NEVER AS ITSELF. This is the shape
 * every screen reads, so there is no path that returns the value to a browser.
 */
export const disclose = (
  def: SettingDef,
  stored: Readonly<Record<string, unknown>>,
): { readonly set: boolean } | { readonly value: unknown } =>
  def.secret
    ? { set: stored[def.id] !== undefined && stored[def.id] !== "" }
    : { value: valueOf(def, stored) };

/* ------------------------------------------------------------------ rules --- */

export type SettingRefusal =
  | "field_invalid" | "tenant_without_permission" | "person_with_permission"
  | "secret_at_person_level" | "operator_with_entitlement" | "no_fallback";

export interface SettingProblem {
  readonly setting: string;
  readonly why: SettingRefusal;
  readonly detail: string;
}

/**
 * What a setting declaration can get wrong.
 *
 * ⚠️ `tenant_without_permission` IS THE ONE THAT COSTS. A workspace setting
 * anybody may write is one any member can change for the whole business —
 * their retention, their branding, their payment provider — and nothing about
 * the screen says so.
 */
export function refuseSetting(def: SettingDef): readonly SettingProblem[] {
  const out: SettingProblem[] = [];
  const at = (why: SettingRefusal, detail: string) => out.push({ setting: def.id, why, detail });

  const bad = refuseField(def.id, def.field);
  if (bad) at("field_invalid", bad);
  if (def.fallback === undefined) at("no_fallback", "no fallback, so every reader must invent one");
  if (def.level === "tenant" && !def.needs) {
    at("tenant_without_permission", "any member could change it for the whole workspace");
  }
  if (def.level === "person" && def.needs) {
    at("person_with_permission", "a workspace permission on somebody's own preference");
  }
  if (def.level === "person" && def.secret) {
    at("secret_at_person_level", "a credential belongs to a workspace or the deployment, not a person");
  }
  if (def.level === "operator" && def.entitlement) {
    at("operator_with_entitlement", "the deployment's own setting, sold to a tenant");
  }
  return out;
}

export const refuseSettings = (book: SettingBook): readonly SettingProblem[] =>
  Object.values(book).flatMap(refuseSetting);

/**
 * ⚠️ A SWITCH THAT CHANGES NOTHING IS WORSE THAN AN ABSENT FEATURE. Somebody
 * turns it on, believes the thing it promised, and stops watching for the
 * problem it claimed to solve. This is the "surfaced → enforced" half of the
 * autodiscovery rule, and it is asked of every app.
 */
export const unread = (book: SettingBook, named: readonly string[]): readonly string[] =>
  Object.keys(book).filter((id) => !named.includes(id));

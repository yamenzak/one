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

/* ------------------------------------------------------------------ areas --- */

/**
 * ONE PAGE, ONE SUBJECT.
 *
 * ⚠️ A SETTINGS SCREEN THAT IS ONE COLUMN OF EVERY DECLARED ROW IS A FILING
 * CABINET. DESIGN.md §3 asks what a control CHANGES, and answers that a screen
 * where one control changes a price, one changes a person's access and one
 * changes a colour is three screens. `group` was a free string that made the
 * card's heading and nothing else — so every declaration went into one column
 * under a word somebody typed, and the screen grew a card per word.
 *
 * ⚠️ SO AN AREA IS DECLARED, AND WHAT MAKES IT ONE IS THAT IT CAN BE NAVIGATED
 * TO. It needs a glyph, because a list of destinations with no marks is a menu
 * of words; it needs a line saying what changing something here affects,
 * because that is what tells somebody whether to open it; and it needs an
 * order, because first-appearance order means adding a setting can move a
 * page.
 *
 * ⚠️ AND THE ICON IS A NAME THE SHELL ALREADY KNOWS. The same vocabulary a
 * screen's `icon` uses, so a settings area and a nav destination cannot be
 * marked in two different alphabets.
 */
export interface AreaDef {
  readonly id: string;
  readonly label: string;
  /** ⚠️ A glyph the shell knows — see `screen.icon`. */
  readonly icon: string;
  /**
   * ⚠️ WHAT CHANGING SOMETHING HERE AFFECTS, in one line. It is what a person
   * reads to decide whether to open the page, so "Notes" alone is a word they
   * have to guess at.
   */
  readonly said: string;
  /** ⚠️ Explicit, or adding a setting reorders the pages. */
  readonly order: number;
}

export type AreaBook = Readonly<Record<string, AreaDef>>;

export const area = (def: AreaDef): AreaDef => def;

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
  /**
   * ⚠️ WHICH AREA'S PAGE IT IS ON, and it must be one the app declared. This
   * was a free string used as a card heading, so a typo made a second section
   * with one row in it and nothing anywhere said so.
   */
  readonly area: string;
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

/**
 * THE PAGES A LEVEL HAS, IN THE ORDER THEY WERE GIVEN.
 *
 * ⚠️ AN AREA WITH NOTHING IN IT AT THIS LEVEL IS NOT A PAGE. Areas are declared
 * once for the app and a level uses some of them, so listing all of them would
 * offer a destination that opens onto nothing — which is the same class of
 * failure as a mechanism with no surface, one layer up.
 */
export const areasOn = (
  book: SettingBook, areas: AreaBook, level: Level,
): readonly AreaDef[] => {
  const used = new Set(settingsOn(book, level).map((s) => s.area));
  return Object.values(areas)
    .filter((a) => used.has(a.id))
    .sort((a, b) => a.order - b.order);
};

/** The rows on one page. */
export const settingsIn = (
  book: SettingBook, level: Level, areaId: string,
): readonly SettingDef[] => settingsOn(book, level).filter((s) => s.area === areaId);

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
  | "secret_at_person_level" | "operator_with_entitlement" | "no_fallback"
  | "unknown_area" | "area_without_settings";

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
export function refuseSetting(def: SettingDef, areas: AreaBook = {}): readonly SettingProblem[] {
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
  /* ⚠️ CHECKED AT COMPOSITION, because a typo here is a page with one row on it
     and a heading nobody meant to create — visible only to whoever opens it. */
  if (!areas[def.area]) {
    at("unknown_area", `no area called ${def.area || "(none)"} is declared`);
  }
  return out;
}

export function refuseSettings(
  book: SettingBook, areas: AreaBook = {},
): readonly SettingProblem[] {
  const out = Object.values(book).flatMap((def) => refuseSetting(def, areas));
  /*
    ⚠️ AND AN AREA NOTHING USES IS A DESTINATION THAT OPENS ONTO NOTHING. It
    survives every other check — the declaration is well formed, it just has no
    rows — and the first person to find out is whoever taps it.
  */
  const used = new Set(Object.values(book).map((s) => s.area));
  for (const a of Object.values(areas)) {
    if (!used.has(a.id)) {
      out.push({
        setting: a.id, why: "area_without_settings",
        detail: "a settings page with nothing on it",
      });
    }
  }
  return out;
}

/*
  ⚠️ AND WHETHER ANYTHING READS A SETTING IS NOT A QUESTION THIS FILE CAN ASK.
  A switch that changes nothing is worse than an absent feature — somebody turns
  it on, believes what it promised, and stops watching for the problem it claimed
  to solve — but "is this id ever named" is a fact about an app's SOURCE, so the
  check is `scripts/settings.test.mjs` and lives where the source is. A pure
  `unread(book, named)` here was the kernel half of a walk the kernel cannot
  perform, and nothing could hand it the second argument.
*/

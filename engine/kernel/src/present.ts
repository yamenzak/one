/**
 * HOW A FACT IS WRITTEN DOWN FOR THE PERSON READING IT.
 *
 * ⚠️ THE STORED VALUE AND THE SHOWN VALUE ARE DIFFERENT THINGS, AND CONFUSING
 * THEM IS THE FAULT THIS FILE EXISTS TO REMOVE. A moment is stored as an
 * `Instant` — ISO 8601, UTC, one representation everywhere. Money is stored as
 * MINOR UNITS beside its currency. A mass is stored in grams and a length in
 * millimetres. Nothing in a database is ever stored in the shape somebody likes
 * to read, because "the shape somebody likes to read" is a different answer per
 * person and changes when they change their mind.
 *
 * ⚠️ SO EVERY VALUE A PERSON SEES IS RENDERED, AT THE MOMENT IT IS SEEN, FROM A
 * `Presentation`. Before this existed the product had `toLocaleDateString("en-US")`
 * in one screen, `Intl.NumberFormat("en")` in another, `.slice(0, 10)` in six,
 * and `1,234.56` hard-coded for everybody — so somebody in Berlin read American
 * dates, and 08/09 meant a different day depending on which screen they were on.
 * That is not a polish problem: it is the product telling two different people
 * two different facts and both of them believing it.
 *
 * ⚠️ AND THE ENGINE IS `Intl`, NOT A LIBRARY. Every runtime this platform
 * targets ships it — the browser with full ICU, the Worker with its own — and it
 * already knows that Germany writes `1.234,56`, that Japan puts the year first,
 * that the euro goes after the number in Paris and before it in Dublin. A date
 * library would be weight added to re-answer questions the platform has already
 * answered, and it would answer them differently.
 *
 * ⚠️ WHAT `Intl` WILL NOT DO IS THE ONE OVERRIDE PEOPLE ACTUALLY WANT: "I read
 * English, I live in Germany, and I want day-month-year". There is no option for
 * a date ORDER. So `sayDate` formats with the locale and then REORDERS the parts
 * — which keeps the locale's own separators and month names and changes only the
 * sequence. Hand-building the string from the pieces is the other way, and it is
 * how a product comes to print `15/Januar/2026`.
 *
 * Layer 1. Imports primitives only.
 */

import type { Day, Instant } from "./primitives.js";

/* ------------------------------------------------------------ the choices --- */

/**
 * ⚠️ `auto` IS A REAL VALUE AND IT IS THE DEFAULT FOR EVERY FIELD. The browser
 * already knows the language, the region and the zone, and it is right about all
 * three for almost everybody — so the preferences screen exists for the minority
 * who are travelling, who moved, or whose employer set their laptop to the wrong
 * country. A product that made them choose on the way in would be asking the
 * whole world to answer a question the machine under their hands can answer.
 */
export type Auto = "auto";

/** ⚠️ Which way round a numeric date reads. The one `Intl` has no option for. */
export type DateOrder = Auto | "dmy" | "mdy" | "ymd";

/** ⚠️ `13:00` or `1:00 pm`. The override people reach for most. */
export type Clock = Auto | "12" | "24";

/**
 * ⚠️ WHAT A QUANTITY IS SHOWN IN, NEVER WHAT IT IS STORED IN. Grams and
 * millimetres are the store; this decides whether somebody reads 82 kg or
 * 181 lb, and switching it changes no row anywhere.
 */
export type Units = Auto | "metric" | "imperial";

/**
 * WHAT SOMEBODY HAS CHOSEN. Stored per ACCOUNT rather than per workspace: it
 * follows the person into every product and every workspace they are in, which
 * is the whole reason it is here and not in an app's settings.
 */
export interface Presentation {
  /** ⚠️ The WORDS — month names, "Today". BCP-47, or `auto`. */
  readonly language: Auto | string;
  /**
   * ⚠️ THE CONVENTIONS — separators, date order, currency placement, the first
   * day of the week. ISO 3166-1 alpha-2, or `auto`. One choice covering four
   * questions, which is how every operating system asks it, because the four
   * answers are not independent: nobody wants German separators with American
   * date order.
   */
  readonly region: Auto | string;
  /** ⚠️ IANA (`Europe/Berlin`), or `auto`. Without it "today" has no meaning. */
  readonly zone: Auto | string;
  readonly dateOrder: DateOrder;
  readonly clock: Clock;
  readonly units: Units;
}

export const DEFAULT_PRESENTATION: Presentation = {
  language: "auto", region: "auto", zone: "auto",
  dateOrder: "auto", clock: "auto", units: "auto",
};

/**
 * WHAT THE MACHINE REPORTS, which is what every `auto` resolves to.
 *
 * ⚠️ IT IS A PARAMETER RATHER THAN A GLOBAL, so this file is pure and testable.
 * Reaching for `navigator.language` here would make every formatter untestable
 * and unusable in the Worker, where an emailed receipt still has to say a date.
 */
export interface Machine {
  /** `navigator.language`, or the deployment's own on the server. */
  readonly locale: string;
  /** `Intl.DateTimeFormat().resolvedOptions().timeZone`. */
  readonly zone: string;
  /**
   * WHERE THE DEVICE SAYS IT IS — a country code, when one can be worked out.
   *
   * ⚠️ SEPARATE FROM `locale` BECAUSE THEY ARE SEPARATE FACTS, and conflating
   * them is the bug this field exists to close. `navigator.language` is `en-GB`
   * because somebody ran an English installer; the time zone is a statement
   * about the chair they are sitting in. Somebody in Berlin with an English
   * phone read `18/08/2026` and `€1,234.56` under a setting called "same as this
   * device" — the device did say where it was, and nothing asked.
   *
   * ⚠️ AND STITCHING IT INTO `locale` INSTEAD IS WHAT THE FIRST ATTEMPT DID,
   * which loses the device's own conventions. They are needed as the FALLBACK
   * wherever the region's cannot be borrowed (see `numeric`) — overwrite the tag
   * and an English reader in Tokyo gets American dates, from `en-JP`, which is
   * neither country's answer.
   *
   * Absent on a runtime that cannot say (and on the server, which has no place).
   */
  readonly region?: string;
}

export const MACHINE: Machine = { locale: "en-GB", zone: "UTC" };

/* ---------------------------------------------------------------- refusals --- */

export type PresentationRefusal =
  | "language_not_a_tag" | "region_not_a_country" | "zone_unknown"
  | "date_order_unknown" | "clock_unknown" | "units_unknown";

/**
 * ⚠️ A BAD TAG IS REFUSED AT THE WRITE, BECAUSE `Intl` THROWS AT THE READ. An
 * unparseable locale makes `Intl.DateTimeFormat` throw a `RangeError` — from
 * inside a render, on every screen showing a date, for as long as the row says
 * so. A person could put their own account into a state where nothing loads and
 * the only screen that could fix it is one of the ones that will not.
 */
export function refusePresentation(of: Presentation): readonly PresentationRefusal[] {
  const out: PresentationRefusal[] = [];
  if (of.language !== "auto" && !/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(of.language)) {
    out.push("language_not_a_tag");
  }
  if (of.region !== "auto" && !/^[A-Z]{2}$/.test(of.region)) out.push("region_not_a_country");
  /* ⚠️ ASKED OF `Intl` RATHER THAN MATCHED, because the zone list is data that
     changes — Europe/Kyiv was added in 2022 — and a regex would be this file
     holding an opinion about geopolitics it will get wrong. */
  if (of.zone !== "auto" && !zoneOk(of.zone)) out.push("zone_unknown");
  /*
    ⚠️ THE THREE CLOSED SETS ARE CHECKED TOO, AND SKIPPING THEM IS NOT A
    TYPE-SYSTEM MATTER. The value arriving from an operation is JSON somebody
    sent, so the union is a claim rather than a fact — and a `dateOrder` of
    "DMY" reaches `reorder`, misses the lookup table, and throws inside a render
    on every screen with a date on it.
  */
  if (!(["auto", "dmy", "mdy", "ymd"] as string[]).includes(of.dateOrder)) {
    out.push("date_order_unknown");
  }
  if (!(["auto", "12", "24"] as string[]).includes(of.clock)) out.push("clock_unknown");
  if (!(["auto", "metric", "imperial"] as string[]).includes(of.units)) out.push("units_unknown");
  return out;
}

const zoneOk = (zone: string): boolean => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch { return false; }
};

/* ---------------------------------------------------------------- resolved --- */

/**
 * EVERY `auto` ANSWERED, ONCE.
 *
 * ⚠️ RESOLVED ONCE PER RENDER TREE, NOT PER VALUE. Constructing an
 * `Intl.DateTimeFormat` is not free, and a list of two hundred rows each
 * building its own is a measurable stall on a phone. The formatters below cache
 * on this object's `locale`, which is why it is a value rather than six
 * arguments.
 */
export interface Shown {
  /**
   * ⚠️ THE WORDS. Language and region joined — month names, and nothing else.
   */
  readonly locale: string;
  /**
   * THE PATTERNS: separators, grouping, where a currency sits, how a numeric
   * date is punctuated.
   *
   * ⚠️ IT IS A SECOND TAG BECAUSE `en-DE` DOES NOT MEAN WHAT IT LOOKS LIKE.
   * Measured: `Intl.NumberFormat("en-DE")` gives `1.234.567,5` — German — while
   * `Intl.DateTimeFormat("en-DE")` gives `18/08/2026` and its currency gives
   * `€1,234.56`, both English. So somebody who set their region to Germany read
   * German numbers, British dates and an American price on ONE screen, which is
   * worse than being wrong consistently. The `-u-rg-` region-override extension
   * does not fix it either; that was measured too.
   *
   * ⚠️ SO THE PATTERNS COME FROM THE REGION'S OWN LOCALE — `de-DE`, derived
   * with `Intl.Locale.maximize()` rather than from a table of our own.
   */
  readonly numeric: string;
  readonly zone: string;
  readonly dateOrder: "dmy" | "mdy" | "ymd";
  readonly clock: "12" | "24";
  readonly units: "metric" | "imperial";
}

/**
 * ⚠️ THE LANGUAGE AND THE REGION ARE JOINED HERE AND NOWHERE ELSE. `en` + `DE`
 * is `en-DE`, which is what makes "English words, German conventions" a thing a
 * person can actually choose — and it is exactly the combination a locale picker
 * with one dropdown cannot express.
 */
export function shownAs(of: Presentation, machine: Machine = MACHINE): Shown {
  const language = of.language === "auto" ? languageOf(machine.locale) : of.language;
  /* ⚠️ THE PLACE WINS OVER THE LANGUAGE TAG — see `Machine.region`. Of the two
     things a device reports, only one of them is about where somebody is. */
  const region = of.region === "auto"
    ? (machine.region || regionOf(machine.locale))
    : of.region;
  /**
   * ⚠️ WHERE THE REGION'S PATTERNS CANNOT BE BORROWED, THE WHOLE TAG FALLS BACK
   * — and the fallback is the language with the DEVICE's region, not the raw
   * device tag and not the combination. `en-JP` is well-formed and `Intl` holds
   * no data for it, so it resolves to the root; the root is American, so an
   * English reader in Tokyo got `August 19, 2026`, `08/19/2026` and `3:47 AM`
   * from a British phone. That is neither country's convention.
   *
   * ⚠️ THE LANGUAGE SURVIVES, WHICH IS WHY IT IS NOT SIMPLY `machine.locale`.
   * `fr` + `JP` becomes `fr-GB`, which `Intl` also lacks — but a language it
   * KNOWS falls back to that language's own conventions, so the answer is
   * French. English is the pathological case precisely because its own default
   * region is the United States.
   */
  const borrowed = patternsFor(language, region);
  const locale = !region ? language
    : borrowed ? `${language}-${region}`
      : withRegion(language, regionOf(machine.locale));
  const numeric = borrowed ?? locale;

  return {
    locale,
    numeric,
    zone: of.zone === "auto" ? machine.zone : of.zone,
    /* ⚠️ ORDER AND CLOCK FOLLOW THE PATTERNS, NOT THE TAG, for the same reason:
       they are the two conventions `en-JP` answers wrongly and confidently. */
    dateOrder: of.dateOrder === "auto" ? orderIn(numeric) : of.dateOrder,
    clock: of.clock === "auto" ? (hour12In(numeric) ? "12" : "24") : of.clock,
    units: of.units === "auto" ? (imperialIn(region) ? "imperial" : "metric") : of.units,
  };
}

const languageOf = (tag: string): string => tag.split("-")[0] ?? "en";

/**
 * THE REGION'S OWN LOCALE, WHERE BORROWING IT IS SAFE.
 *
 * ⚠️ ONLY WHERE THE TWO SHARE A SCRIPT, and that is the whole rule. `de-DE` for
 * an English reader in Germany is right: same alphabet, and all that changes is
 * `.` for `/` and where the euro sits. `ar-AE` for an English reader in Dubai is
 * NOT: its numeric date carries right-to-left marks and its patterns assume a
 * script the rest of the page is not in. Same for `ja-JP`, which would render
 * `2026/08/18` in a Japanese calendar's shape.
 *
 * ⚠️ ASKED OF `Intl.Locale.maximize()` RATHER THAN LISTED. Which language a
 * country writes is CLDR's likely-subtags data, it changes, and a table here
 * would be this file holding an opinion it gets wrong for somewhere.
 */
const patternsFor = (language: string, region: string): string | null => {
  if (!region) return null;
  try {
    const theirs = new Intl.Locale(`und-${region}`).maximize();
    const ours = new Intl.Locale(language).maximize();
    if (theirs.script !== ours.script) return null;
    return `${theirs.language}-${region}`;
  } catch { return null; }
};

/**
 * ⚠️ THE REGION SUBTAG, WHICH IS NOT ALWAYS THE SECOND ONE. `zh-Hant-TW` carries
 * a SCRIPT in the second position, so taking `parts[1]` yields "Hant" — a region
 * `Intl` does not recognise, on a tag it then falls back from, silently, for
 * every reader of traditional Chinese.
 */
/**
 * ⚠️ THE REGION SUBTAG IS NOT ALWAYS THE SECOND ONE — `zh-Hant-TW` carries a
 * SCRIPT there. Replacing by position yields `zh-DE-TW`, which is not a tag, and
 * `Intl` falls back from it silently for every reader of traditional Chinese.
 */
const withRegion = (locale: string, region: string): string => {
  if (!region) return locale;
  const parts = locale.split("-");
  const at = parts.findIndex((p, i) => i > 0 && /^[A-Za-z]{2}$/.test(p));
  if (at > 0) { parts[at] = region; return parts.join("-"); }
  const script = parts[1] && /^[A-Za-z]{4}$/.test(parts[1]) ? 2 : 1;
  parts.splice(script, 0, region);
  return parts.join("-");
};

const regionOf = (tag: string): string => {
  for (const part of tag.split("-").slice(1)) {
    if (/^[A-Za-z]{2}$/.test(part)) return part.toUpperCase();
  }
  return "";
};

/**
 * ⚠️ ASKED OF THE LOCALE RATHER THAN LISTED. A table of "which countries write
 * the month first" is a table that is wrong about somewhere, and `Intl` already
 * holds the answer — so the question is put to it, by formatting a date whose
 * parts are unambiguous and reading back which came first.
 */
const orderIn = (locale: string): "dmy" | "mdy" | "ymd" => {
  const parts = safeParts(locale);
  const order = parts.filter((p) => p.type === "day" || p.type === "month" || p.type === "year")
    .map((p) => p.type[0])
    .join("");
  return order === "mdy" || order === "ymd" ? order : "dmy";
};

const safeParts = (locale: string): readonly Intl.DateTimeFormatPart[] => {
  try {
    return new Intl.DateTimeFormat(locale, { timeZone: "UTC" })
      .formatToParts(new Date(Date.UTC(2026, 0, 15)));
  } catch { return []; }
};

const hour12In = (locale: string): boolean => {
  try {
    return new Intl.DateTimeFormat(locale, { hour: "numeric", timeZone: "UTC" })
      .resolvedOptions().hour12 === true;
  } catch { return false; }
};

/**
 * ⚠️ THREE COUNTRIES, AND THE LIST IS SHORT ENOUGH TO BE HONEST ABOUT. `Intl`
 * has no measurement-system property that is safe to read across runtimes, and
 * everybody who is not on this list is on metric. Somebody on it who wants
 * kilograms says so in one control.
 */
const imperialIn = (region: string): boolean => ["US", "LR", "MM"].includes(region);

/* ---------------------------------------------------------------- the cache --- */

/**
 * ⚠️ ONE FORMATTER PER SHAPE PER LOCALE, KEPT. Every `say*` below goes through
 * this. A hundred-row table formatting a date per row built a hundred
 * `DateTimeFormat`s, each of which loads locale data; the map makes it one.
 */
const KEPT = new Map<string, Intl.DateTimeFormat | Intl.NumberFormat>();

const dates = (locale: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat => {
  const key = `d:${locale}:${JSON.stringify(opts)}`;
  const had = KEPT.get(key);
  if (had) return had as Intl.DateTimeFormat;
  /* ⚠️ A REFUSED TAG FALLS BACK RATHER THAN THROWING. `refusePresentation`
     catches this at the write; a row that predates the check, or one written by
     a migration, must not take every screen down with it. */
  let made: Intl.DateTimeFormat;
  try { made = new Intl.DateTimeFormat(locale, opts); }
  catch { made = new Intl.DateTimeFormat("en-GB", opts); }
  KEPT.set(key, made);
  return made;
};

const numbers = (locale: string, opts: Intl.NumberFormatOptions): Intl.NumberFormat => {
  const key = `n:${locale}:${JSON.stringify(opts)}`;
  const had = KEPT.get(key);
  if (had) return had as Intl.NumberFormat;
  let made: Intl.NumberFormat;
  try { made = new Intl.NumberFormat(locale, opts); }
  catch { made = new Intl.NumberFormat("en-GB", opts); }
  KEPT.set(key, made);
  return made;
};

/* ------------------------------------------------------------------- dates --- */

/** How much of a date to write. */
export type DateLength = "numeric" | "short" | "long";

const DATE_OPTS: Readonly<Record<DateLength, Intl.DateTimeFormatOptions>> = {
  numeric: { day: "2-digit", month: "2-digit", year: "numeric" },
  short: { day: "numeric", month: "short", year: "numeric" },
  long: { day: "numeric", month: "long", year: "numeric" },
};

/**
 * A DATE, IN THE ORDER THEY ASKED FOR.
 *
 * ⚠️ THE PARTS ARE REORDERED, NOT REBUILT — see the header. `formatToParts`
 * hands back the numbers, the month name and the LITERALS between them; moving
 * the three value parts and leaving the literals where they are keeps `/` in
 * Britain, `.` in Germany and `年月日` in Japan.
 *
 * ⚠️ AND A REORDER IS SKIPPED WHERE IT WOULD BE A NO-OP, which matters for the
 * scripts whose date is not three fields with two separators. Japanese numeric
 * dates carry a literal after EACH part; swapping the values there is correct
 * only because the literals stay put, and this is the sentence that says so.
 */
export function sayDate(
  shown: Shown, at: Instant | Day | Date, length: DateLength = "short",
): string {
  const on = asDate(at);
  if (!on) return String(at);
  /* ⚠️ THE NUMERIC SHAPE IS THE REGION'S AND THE MONTH NAME IS THE LANGUAGE'S —
     see `Shown.numeric`. `18.08.2026` for a German region, `18 August 2026` in
     English words, which is the pair somebody actually wants. */
  const parts = dates(length === "numeric" ? shown.numeric : shown.locale,
    { ...DATE_OPTS[length], timeZone: shown.zone }).formatToParts(on);
  return reorder(parts, shown.dateOrder);
}

type Field = Intl.DateTimeFormatPartTypes;
const WANTED: Readonly<Record<"dmy" | "mdy" | "ymd", readonly Field[]>> = {
  dmy: ["day", "month", "year"],
  mdy: ["month", "day", "year"],
  ymd: ["year", "month", "day"],
};

const reorder = (
  parts: readonly Intl.DateTimeFormatPart[], order: "dmy" | "mdy" | "ymd",
): string => {
  const values = parts.filter((p) => WANTED[order].includes(p.type));
  /* ⚠️ Anything that is not three values is left exactly as the locale wrote
     it. A calendar with an era, a two-part year, a locale that omits one — none
     of those is a shape this reordering understands, and printing them in a
     guessed sequence is worse than printing the locale's own answer. */
  if (values.length !== 3) return parts.map((p) => p.value).join("");
  const by = new Map<Field, string>(values.map((p) => [p.type, p.value] as const));
  const wanted = WANTED[order].map((t) => by.get(t) ?? "");
  let next = 0;
  return parts.map((p) => (WANTED[order].includes(p.type) ? wanted[next++] ?? p.value : p.value))
    .join("");
};

/* ------------------------------------------------------------------- times --- */

/** ⚠️ `hour12` IS THE ONE `Intl` OPTION THAT DOES WHAT IT SAYS. No reordering. */
export function sayTime(shown: Shown, at: Instant | Date, seconds = false): string {
  const on = asDate(at);
  if (!on) return String(at);
  return dates(shown.numeric, {
    hour: "numeric", minute: "2-digit", ...(seconds ? { second: "2-digit" } : {}),
    hour12: shown.clock === "12", timeZone: shown.zone,
  }).format(on);
}

/**
 * A DATE AND A TIME.
 *
 * ⚠️ ASSEMBLED FROM THE TWO RATHER THAN ASKED FOR AT ONCE, because a combined
 * `Intl` call cannot be reordered — the parts come back interleaved with the
 * time and the day/month swap would move the hour. The separator is a middle
 * dot, which is this product's own (`DESIGN.md`) and is the same in every
 * language.
 */
export const sayMoment = (
  shown: Shown, at: Instant | Date, length: DateLength = "short",
): string => `${sayDate(shown, at, length)} · ${sayTime(shown, at)}`;

/* ------------------------------------------------------------------ lists --- */

/**
 * SEVERAL THINGS, SAID AS A PERSON WOULD SAY THEM — "gloves, masks and gowns".
 *
 * ⚠️ A SENTENCE THAT NAMES THINGS NEEDS THIS OR IT IS NOT A SENTENCE. Joined
 * with commas throughout, a clause reads as a database field printed out —
 * "Filed under antibiotics, prescription, refrigerated" — and the whole point of
 * saying a decision back to somebody is that they read it without deciding to.
 *
 * ⚠️ AND THE WORD IS THE LOCALE'S, WHICH IS THE ONLY REASON THIS TAKES `Shown`.
 * "and" is "und" in German and the separator moves in Japanese; hardcoding the
 * English is the kind of thing that survives translation review because it is
 * inside a string somebody assembled rather than inside a string somebody wrote.
 *
 * ⚠️ `Intl.ListFormat` IS NOT UNIVERSAL, so a runtime without it falls back to
 * commas rather than throwing. Every runtime this deployment targets has it; a
 * sentence is not worth a crash on one that does not.
 */
export function sayList(
  shown: Shown, of: readonly string[], joining: "and" | "or" = "and",
): string {
  const kept = of.filter((one) => one.trim().length > 0);
  if (kept.length <= 1) return kept[0] ?? "";
  const List = (Intl as { ListFormat?: typeof Intl.ListFormat }).ListFormat;
  if (typeof List !== "function") return kept.join(", ");
  return new List(shown.locale, {
    style: "long",
    type: joining === "or" ? "disjunction" : "conjunction",
  }).format(kept);
}

/* ------------------------------------------------------------------- when --- */

/**
 * THE LOCAL CALENDAR DAY AN INSTANT FALLS ON.
 *
 * ⚠️ IT IS NOT `dayOf`, AND THE DIFFERENCE IS A WHOLE DAY. `dayOf` slices the
 * UTC date out of the string, which is the right answer for a row keyed by day
 * and the WRONG one for a person: a notification at 23:30 in Berlin is stamped
 * 21:30Z, and a list bucketed on the slice files it under yesterday for the
 * person who was there when it happened.
 */
export function dayIn(shown: Shown, at: Instant | Date): Day {
  const on = asDate(at);
  if (!on) return String(at).slice(0, 10) as Day;
  /* ⚠️ `en-CA` IS NOT A PREFERENCE, IT IS A FORMAT. It renders `YYYY-MM-DD`,
     which is what makes this a sortable key rather than a sentence — and using
     the person's own locale here would produce a bucket key in their date order
     that sorts wrongly and reads as a label. */
  return dates("en-CA", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone: shown.zone,
  }).format(on) as Day;
}

/**
 * WHAT TO CALL A DAY IN A LIST.
 *
 * ⚠️ "TODAY" AND "YESTERDAY" AND THEN THE DATE, and the cut-off is two days
 * rather than seven. "Last Thursday" is a phrase somebody has to do arithmetic
 * on to place, and by the fourth heading down a list nobody is reading them as
 * relative any more — they are reading them as labels, and a label should say
 * which day it is.
 *
 * ⚠️ AND IT NEVER SAYS "3 DAYS AGO". A relative phrase is a fact that goes stale
 * on a page left open, and this is the surface people leave open.
 */
export function sayWhen(shown: Shown, at: Instant | Date, now: Instant | Date): string {
  const day = dayIn(shown, at);
  const today = dayIn(shown, now);
  if (day === today) return "Today";
  if (day === dayBefore(today)) return "Yesterday";
  /* ⚠️ THE YEAR IS DROPPED INSIDE THE CURRENT ONE. "12 August 2026" in a list
     whose every heading says 2026 is a column of noise around the two fields
     that differ. */
  return sayDate(shown, day, "long")
    .replace(new RegExp(`\\s*\\p{P}?\\s*${today.slice(0, 4)}\\s*\\p{P}?\\s*$`, "u"), "")
    .trim();
}

/** ⚠️ Via UTC noon, so no daylight shift can land the arithmetic on the wrong day. */
const dayBefore = (day: Day): Day => {
  const on = new Date(`${day}T12:00:00Z`);
  on.setUTCDate(on.getUTCDate() - 1);
  return on.toISOString().slice(0, 10) as Day;
};

/**
 * A LIST CUT INTO DAYS, NEWEST FIRST.
 *
 * ⚠️ IT IS HERE RATHER THAN IN THE SCREEN because "which day is this in" is the
 * zone question, and a screen that bucketed by hand would be a screen that
 * bucketed in UTC. Every list of things that happened wants this, so it is one
 * function rather than one per list.
 */
export interface Bucket<T> {
  /** The sortable local day — `2026-08-18`. Stable, so it keys a React list. */
  readonly day: Day;
  /** What to write over it — "Today", "Yesterday", "12 August". */
  readonly says: string;
  readonly items: readonly T[];
}

export function byDay<T>(
  shown: Shown, items: readonly T[], at: (item: T) => Instant, now: Instant | Date,
): readonly Bucket<T>[] {
  const out: Bucket<T>[] = [];
  const seen = new Map<string, T[]>();
  for (const item of items) {
    const day = dayIn(shown, at(item));
    const had = seen.get(day);
    if (had) { had.push(item); continue; }
    const made: T[] = [item];
    seen.set(day, made);
    out.push({ day, says: sayWhen(shown, at(item), now), items: made });
  }
  /* ⚠️ THE ORDER IS THE CALLER'S, PRESERVED. A list arrives sorted by whoever
     read it — newest first from a query with an `ORDER BY` — and re-sorting here
     would silently overrule that, which is how a list that is deliberately
     oldest-first comes back reversed. */
  return out;
}

/* ----------------------------------------------------------------- numbers --- */

export function sayNumber(shown: Shown, value: number, places?: number): string {
  return numbers(shown.numeric, places === undefined ? {} : {
    minimumFractionDigits: places, maximumFractionDigits: places,
  }).format(value);
}

/**
 * MONEY, IN ITS OWN CURRENCY, PLACED WHERE THE READER EXPECTS IT.
 *
 * ⚠️ THE CURRENCY IS NEVER CONVERTED AND THE PLACEMENT ALWAYS IS. A workspace
 * billed in euros is billed in euros wherever its owner is standing; what
 * changes with the reader is which side of the number the symbol sits on and
 * which separator groups the thousands. Converting would be inventing a rate
 * and printing it as a fact.
 *
 * ⚠️ AND THE INPUT IS MINOR UNITS, ALWAYS. Cents, not a float — see the header.
 * `1.10` cannot be represented and `0.1 + 0.2` is famously not `0.3`; a bill
 * that is a penny out is a bill somebody does not trust.
 */
export function sayMoney(shown: Shown, minor: number, currency: string): string {
  return numbers(shown.numeric, {
    style: "currency", currency,
    /* ⚠️ Zero-decimal currencies exist (JPY, KRW) and `Intl` knows which, so the
       digits are left to it rather than divided by a hardcoded hundred. */
  }).format(minor / minorPer(currency));
}

/**
 * ⚠️ ASKED OF `Intl` RATHER THAN LISTED, for the same reason as the date order:
 * a table of zero-decimal currencies is a table that goes stale, and the runtime
 * already ships the answer.
 */
const minorPer = (currency: string): number => {
  const key = `m:${currency}`;
  const had = KEPT.get(key) as unknown as { readonly per?: number } | undefined;
  if (had?.per) return had.per;
  let per = 100;
  try {
    const digits = new Intl.NumberFormat("en", { style: "currency", currency })
      .resolvedOptions().maximumFractionDigits ?? 2;
    per = 10 ** digits;
  } catch { per = 100; }
  KEPT.set(key, { per } as never);
  return per;
};

/**
 * MONEY, TAKEN APART, SO THE FRACTION CAN BE SET SMALLER THAN THE WHOLE.
 *
 * ⚠️ `€1,051.70` AT ONE SIZE IS A NUMBER; WITH A SMALLER `.70` IT IS A SUM OF
 * MONEY. That device is the difference between a product that handles money well
 * and one that prints it, and it needs the pieces — which is why this exists
 * beside `sayMoney` rather than the component slicing the string.
 *
 * ⚠️ AND SLICING IS EXACTLY WHAT IT MUST NOT DO. `% 100` is wrong for the yen,
 * `.slice(0, -3)` is wrong wherever the decimal mark is a comma, and taking the
 * first character as the symbol is wrong in every locale that puts it last.
 * `formatToParts` is the only reading that is right in all of them.
 */
export interface MoneyParts {
  /** ⚠️ A minus, or a plus the caller asked for. Never part of the digits. */
  readonly sign: string;
  /** Whatever the locale puts before the number — a symbol, or nothing. */
  readonly before: string;
  readonly whole: string;
  /** ⚠️ WITH its own decimal mark, and `""` for a currency that has no minor unit. */
  readonly fraction: string;
  readonly after: string;
}

export function sayMoneyParts(shown: Shown, minor: number, currency: string): MoneyParts {
  const parts = numbers(shown.numeric, { style: "currency", currency })
    .formatToParts(Math.abs(minor) / minorPer(currency));

  let before = "", whole = "", fraction = "", after = "";
  let past = false;
  for (const p of parts) {
    if (p.type === "integer" || p.type === "group") { whole += p.value; past = true; continue; }
    if (p.type === "decimal" || p.type === "fraction") { fraction += p.value; past = true; continue; }
    /* ⚠️ A LITERAL BETWEEN THE SYMBOL AND THE NUMBER IS PART OF THE SYMBOL'S
       SIDE. German writes `1.234,56 €` with a narrow no-break space, and
       dropping it closes up a gap the locale deliberately opened. */
    if (past) after += p.value; else before += p.value;
  }
  return { sign: minor < 0 ? "\u2212" : "", before, whole, fraction, after };
}

/* ------------------------------------------------------------------- sizes --- */

/**
 * ⚠️ BYTES ARE POWERS OF TWO AND THE LABEL SAYS SO. A "GB" that is 10⁹ and a
 * "GB" that is 2³⁰ differ by seven percent, which is the difference between a
 * quota that looks fine and one that is about to refuse an upload.
 */
export function sayBytes(shown: Shown, bytes: number): string {
  const units = ["B", "KiB", "MiB", "GiB", "TiB"] as const;
  let value = Math.abs(bytes);
  let at = 0;
  while (value >= 1024 && at < units.length - 1) { value /= 1024; at++; }
  const places = at === 0 ? 0 : value < 10 ? 1 : 0;
  return `${sayNumber(shown, (bytes < 0 ? -1 : 1) * value, places)} ${units[at]}`;
}

/* ----------------------------------------------------------------- amounts --- */

/**
 * A PHYSICAL QUANTITY, STORED IN THE BASE UNIT AND SHOWN IN THEIRS.
 *
 * ⚠️ THE STORE IS GRAMS AND MILLIMETRES AND SECONDS, EVERYWHERE, WITHOUT
 * EXCEPTION. A column holding "whatever the person typed" needs a second column
 * saying which unit that was, and the day somebody forgets to read it a weight
 * is off by a factor of 2.2 — in a product where that number might be a dose.
 */
export type Measure = "mass" | "length" | "distance" | "volume" | "temperature";

/**
 * ⚠️ THE STORAGE CONTRACT, AND IT IS NOT EXPORTED. Nothing should be READING it
 * at runtime — a caller that asks "what unit is this stored in" is a caller
 * about to convert by hand, which is the thing `sayAmount` and `readAmount`
 * exist to make unnecessary. It is here to be READ BY A PERSON and asserted by
 * `scripts/present.test.mjs`, which checks every measure declares one.
 */
const BASE: Readonly<Record<Measure, string>> = {
  mass: "gram", length: "millimeter", distance: "meter",
  volume: "milliliter", temperature: "celsius",
};

interface Conversion {
  /**
   * ⚠️ THE SANCTIONED `Intl` IDENTIFIER, WHICH IS THE AMERICAN SPELLING AND IS
   * NOT NEGOTIABLE. `Intl.NumberFormat` accepts a fixed CLDR list — `kilometer`,
   * `centimeter`, `liter` — and anything else throws a `RangeError` from inside
   * a render, taking the whole screen down. `kilometre` did exactly that, on the
   * one screen whose job is to preview these. The WORDS a reader sees still come
   * from the locale, so a Briton is shown "km" either way.
   */
  readonly unit: string;
  readonly from: (base: number) => number;
  readonly places: number;
}

/**
 * ⚠️ EXPORTED SO THE SUITE CAN PROVE EVERY IDENTIFIER CONSTRUCTS. A wrong one
 * throws at render rather than at build, on whichever screen happens to show
 * that measure first — which is a class of fault only an exhaustive check can
 * find, because nothing else exercises all ten.
 */
export const SHOW: Readonly<Record<Measure, Readonly<Record<"metric" | "imperial", Conversion>>>> = {
  mass: {
    metric: { unit: "kilogram", from: (g) => g / 1000, places: 1 },
    imperial: { unit: "pound", from: (g) => g / 453.59237, places: 1 },
  },
  length: {
    metric: { unit: "centimeter", from: (mm) => mm / 10, places: 0 },
    imperial: { unit: "inch", from: (mm) => mm / 25.4, places: 0 },
  },
  distance: {
    metric: { unit: "kilometer", from: (m) => m / 1000, places: 1 },
    imperial: { unit: "mile", from: (m) => m / 1609.344, places: 1 },
  },
  volume: {
    metric: { unit: "liter", from: (ml) => ml / 1000, places: 2 },
    imperial: { unit: "fluid-ounce", from: (ml) => ml / 29.5735295625, places: 1 },
  },
  temperature: {
    metric: { unit: "celsius", from: (c) => c, places: 0 },
    imperial: { unit: "fahrenheit", from: (c) => c * 9 / 5 + 32, places: 0 },
  },
};

export function sayAmount(shown: Shown, base: number, measure: Measure): string {
  const how = SHOW[measure][shown.units];
  const value = how.from(base);
  /* ⚠️ AND IT DEGRADES RATHER THAN THROWING. A unit identifier the runtime does
     not know is a `RangeError` out of a render — a blank screen — and no
     fallback locale saves it, because the fault is the OPTION rather than the
     tag. `SHOW_UNITS` in the suite is what stops it happening; this is what
     stops it being fatal on a runtime whose list is older than ours. */
  try {
    return numbers(shown.numeric, {
      style: "unit", unit: how.unit, unitDisplay: "short",
      minimumFractionDigits: how.places, maximumFractionDigits: how.places,
    }).format(value);
  } catch {
    return `${sayNumber(shown, value, how.places)} ${how.unit}`;
  }
}

/* --------------------------------------------------------------- the input --- */

/**
 * ⚠️ WHAT SOMEBODY TYPES COMES BACK IN THE BASE UNIT, or a form is a place where
 * a preference becomes a corrupted row. A field showing pounds must write grams,
 * and the conversion has to be the SAME table the display uses or the number
 * drifts every time it is opened and saved.
 */
export function readAmount(shown: Shown, typed: number, measure: Measure): number {
  const how = SHOW[measure][shown.units];
  if (measure === "temperature") {
    return shown.units === "imperial" ? (typed - 32) * 5 / 9 : typed;
  }
  /* ⚠️ Derived from `from` rather than written twice — a second table of factors
     is a second place for 453.59237 to be typed with a digit missing. */
  return typed / how.from(1);
}

/* ------------------------------------------------------------------ shared --- */

const asDate = (at: Instant | Day | Date): Date | null => {
  if (at instanceof Date) return Number.isNaN(at.getTime()) ? null : at;
  /* ⚠️ A BARE `Day` IS READ AS UTC NOON, NOT MIDNIGHT. `new Date("2026-08-18")`
     is midnight UTC, and rendering that in any zone west of Greenwich prints the
     17th — so a birthday shows the day before for a third of the planet. */
  const on = new Date(/^\d{4}-\d{2}-\d{2}$/.test(at) ? `${at}T12:00:00Z` : at);
  return Number.isNaN(on.getTime()) ? null : on;
};

/**
 * THE SMALLEST THINGS, AND THE ONE PROPERTY THEY ALL SHARE.
 *
 * ⚠️ EVERY ID HERE IS A STRING AT RUNTIME AND THEY ARE ALL THE SAME SHAPE, so
 * without a brand the compiler is happy to hand a tenant's id to something
 * asking for an account's. That reads correctly, runs, and returns somebody
 * else's records — the one class of bug no test written against the happy path
 * will ever find.
 *
 * Layer 0. Imports nothing.
 */

declare const BRAND: unique symbol;

export type Id<K extends string> = string & { readonly [BRAND]: K };

export type AccountId = Id<"account">;
export type TenantId = Id<"tenant">;
export type SessionId = Id<"session">;
/** An app's id is written by hand in its manifest, so it is a plain slug. */
export type AppId = string;

/**
 * ISO-8601, UTC, milliseconds. Always.
 *
 * ⚠️ NOT A `Date`, AND NOT A NUMBER. A `Date` carries a local zone nobody asked
 * for and serialises differently per runtime; an epoch integer sorts correctly
 * and reads as nothing at all in a log or a row. A string that sorts
 * lexicographically and is legible to a person is worth the eight extra bytes.
 */
export type Instant = string & { readonly [BRAND]: "instant" };

/** A calendar day in the subject's own zone. `YYYY-MM-DD`. */
export type Day = string & { readonly [BRAND]: "day" };

export const instant = (at: Date | string = new Date()): Instant =>
  (typeof at === "string" ? new Date(at) : at).toISOString() as Instant;

/**
 * ⚠️ THE DAY OUT OF AN INSTANT, AND IT IS A FUNCTION SO IT IS NOT WRITTEN TWICE.
 * `at.slice(0, 10)` is correct and looks like a typo, so it gets copied into
 * screens with a different length by somebody who assumed it was arbitrary — and
 * a column headed "Written" showing milliseconds is four times the width of the
 * thing beside it.
 */
export const dayOf = (at: Instant): Day => at.slice(0, 10) as Day;

/**
 * A DAY, PLUS SOME DAYS. It is the only correct way to move a calendar date.
 *
 * ⚠️ ARITHMETIC ON AN INSTANT LANDS A DAY OUT, AND ONLY ON ONE SIDE OF THE
 * WORLD. `+ 7 * 86_400_000` on a local midnight is right where the offset does
 * not change and wrong where it does; a shelf life counted that way expires
 * stock early east of Greenwich (safe) and late west of it (not). A `Day` has no
 * time in it, so the arithmetic has to be done on the calendar rather than on a
 * clock.
 *
 * ⚠️ AND IT IS HERE RATHER THAN IN THE APP THAT NEEDED IT FIRST. A shelf life, a
 * due date, a grace period and a retention window are the same operation, and
 * the second product to write it would write it slightly differently — which is
 * a whole day, in one hemisphere, on the day the clocks change.
 */
export const dayPlus = (day: Day, days: number): Day => {
  const [y, m, d] = day.split("-").map(Number);
  const at = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1));
  at.setUTCDate(at.getUTCDate() + days);
  /* ⚠️ UTC THROUGHOUT, WHICH IS SAFE HERE AND NOWHERE ELSE. The date went in
     with no time on it and comes out the same way; what makes this correct is
     that no local clock was ever consulted. */
  return dayOf(at.toISOString() as Instant);
};

/**
 * HOW MANY DAYS FROM ONE CALENDAR DATE TO ANOTHER — `dayPlus`'s inverse.
 *
 * ⚠️ SUBTRACTING TWO INSTANTS IS OFF BY ONE TWICE A YEAR, and in the direction
 * that matters: a shelf life measured across a clock change is 23 or 25 hours,
 * `Math.floor` of that is a day short or a day long, and the reading somebody
 * gets is "expires tomorrow" for something that expired this morning. Both ends
 * are midnight UTC here, so the difference is exact by construction.
 *
 * ⚠️ AND IT IS SIGNED. Negative is the past, which is the answer a shelf label
 * needs — "four days ago" and "in four days" are the same question and only one
 * of them is a problem.
 */
export const daysBetween = (from: Day, to: Day): number => {
  const at = (day: Day): number => {
    const [y, m, d] = day.split("-").map(Number);
    return Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1);
  };
  return Math.round((at(to) - at(from)) / 86_400_000);
};

/**
 * ⚠️ SORTABLE, AND THAT IS THE WHOLE REASON IT IS NOT `randomUUID`. A v4 uuid is
 * random in its high bits, so a table keyed on it inserts into the middle of the
 * index for ever and a list ordered by id is ordered by nothing. This is time
 * first, randomness second: rows arrive at the end, and `ORDER BY id` is
 * `ORDER BY when it happened` without a second column.
 */
export function newId<K extends string>(prefix: K, at: Date = new Date()): Id<K> {
  const stamp = at.getTime().toString(36).padStart(9, "0");
  const noise = [...crypto.getRandomValues(new Uint8Array(8))]
    .map((b) => b.toString(36).padStart(2, "0")).join("");
  return `${prefix}_${stamp}${noise}` as Id<K>;
}

/**
 * ⚠️ THE PREFIX IS THE WIRE FORM AND THE BRAND IS THE CONCEPT, and they are
 * deliberately not the same string. An id is read by people — in a log, a URL, a
 * support conversation — so it is short; the type is read by the compiler, so it
 * is the whole word. Tying them together would make every id in the product four
 * characters longer to serve a compiler that does not care.
 */
export const newAccountId = (at?: Date): AccountId => newId("acc", at) as string as AccountId;
export const newTenantId = (at?: Date): TenantId => newId("ten", at) as string as TenantId;
export const newSessionId = (at?: Date): SessionId => newId("ses", at) as string as SessionId;

/* ------------------------------------------------------------------ tone --- */

/**
 * ⚠️ FIVE, AND THEY MEAN WHAT HAPPENED RATHER THAN WHAT COLOUR TO USE. A palette
 * word in a declaration is a declaration that has to change when the palette
 * does — and an app that says `red` has said nothing about whether that is an
 * error, a warning or a brand accent.
 */
export type Tone = "neutral" | "info" | "success" | "warning" | "danger";

/* ------------------------------------------------------------------ text --- */

/**
 * ⚠️ A SLUG IS A DNS LABEL, AND CHECKING IT IS A SECURITY CONTROL RATHER THAN
 * TIDINESS. A tenant is addressed at `<slug>.one.4dl.app`, so a slug that could
 * be `admin`, `setup` or `id` is a tenant that answers on a door it does not own.
 */
export const slugOk = (slug: string): boolean => /^[a-z][a-z0-9-]{1,38}[a-z0-9]$/.test(slug);

/**
 * ⚠️ THE DOORS AND EVERYTHING NEAR THEM. Two halves, and both are load-bearing:
 * the platform's own labels, and the words that would let somebody impersonate
 * infrastructure — mail autoconfig, ACME, and the money words a phishing page
 * would want. Adding one is cheap; removing one changes a live tenant's address.
 */
export const RESERVED_SLUGS: readonly string[] = [
  "admin", "setup", "id", "api", "app", "www", "mail", "email", "smtp", "imap", "pop",
  "autoconfig", "autodiscover", "mta-sts", "_domainkey", "dmarc", "spf",
  "acme", "acme-challenge", "well-known", "cdn", "static", "assets", "media",
  "billing", "pay", "payment", "payments", "checkout", "invoice", "account", "accounts",
  "secure", "login", "signin", "signup", "auth", "sso", "oauth",
  "status", "health", "test", "staging", "dev", "preview", "internal",
  "one", "engine", "support", "help", "docs", "blog", "about", "legal", "privacy", "terms",
];

export const slugTaken = (slug: string): boolean => RESERVED_SLUGS.includes(slug);

/* ------------------------------------------------------------------ prose --- */

export interface Passage {
  readonly heading: boolean;
  readonly text: string;
}

/**
 * A LONG TEXT, CUT INTO THE ONLY TWO SHAPES IT HAS.
 *
 * ⚠️ ONE RULE, READ BY EVERYTHING THAT DRAWS THE SAME WORDS. A legal document is
 * served as a standalone page by the worker and shown in a sheet inside the app;
 * two copies of "a blank line ends a paragraph, a leading `#` is a heading" is
 * two renderings of one text that agree until somebody edits one, and nobody
 * would ever compare them.
 *
 * ⚠️ AND IT IS DELIBERATELY NOT MARKDOWN. Two shapes are two shapes; a parser
 * for them is a dependency, an escaping surface, and a set of behaviours nobody
 * declared — links, images and raw HTML arriving in a document because the
 * library supports them.
 */
export const passagesOf = (text: string): readonly Passage[] =>
  text.trim().split(/\n{2,}/)
    .map((block) => {
      const line = block.trim();
      return line.startsWith("# ")
        ? { heading: true, text: line.slice(2).trim() }
        : { heading: false, text: line };
    })
    .filter((p) => p.text !== "");

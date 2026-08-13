/**
 * THE 4° VAULT — what is true about a person, held once, disclosed on purpose.
 *
 * Layer 1. Imports primitives and protection.
 *
 * ⚠️ THE INVERSION THIS FILE EXISTS FOR. A product that asks somebody their
 * height stores that height in its own table, and from that moment the person
 * has no relationship with the fact: they cannot see who reads it, cannot take
 * it back, cannot carry it to the next product, and cannot find out it existed
 * once they have stopped using the app. Every product repeats the collection,
 * so one person's height is in four databases under four retention policies,
 * and an erasure request reaches whichever ones somebody remembered.
 *
 * Here a sensitive fact belongs to the ACCOUNT and is stored once. An app does
 * not hold it; an app is GRANTED a view of it, at an audience the person chose,
 * for as long as they chose. Withdrawing the grant is one row, takes effect on
 * the next read, and needs nobody's cooperation.
 *
 * ⚠️ AND A GRANT IS A VIEW, NOT A COPY. The value is never handed to an app to
 * keep — which is why `vault-owns-the-fact` refuses a collection field that
 * shadows a vault fact. A copy is a disclosure that outlives its grant, and
 * there is no mechanism anywhere that could take it back.
 *
 * ⚠️ FOUR THINGS ARE SEPARATE HERE AND ARE CONSTANTLY CONFLATED ELSEWHERE:
 *
 *   WHAT IS HELD      a fact — declared once, platform-wide, closed set
 *   WHO MAY READ IT   an audience — self, an agent, a person
 *   WHAT IS SHOWN     a reading — the raw value, or something derived from it
 *   FOR HOW LONG      an expiry, resolved on read, never by a sweep
 *
 * Keeping the third apart from the first is what lets a coach see a weight
 * TREND and a body-mass index while never seeing a weight. The value is used
 * and not disclosed, which is the thing a database column cannot express and
 * the reason this is a mechanism rather than a policy.
 */

import type { Instant, UserId } from "./primitives.js";
import type { DataCategory } from "./protection.js";

/* -------------------------------------------------------------- the reach --- */

/**
 * HOW FAR A FACT MAY TRAVEL FROM THE PERSON IT IS ABOUT.
 *
 * ⚠️ IT IS A LADDER, NOT A SET, and it is ordered by how much of the person
 * leaves with it. A set would be the more general shape and the wrong one: it
 * makes "visible to a coach but not to an agent" and "visible to an agent but
 * not to a coach" equally expressible, and one of those is a sentence nobody has
 * ever wanted to say. A ladder is what a person can hold in their head while
 * deciding, and a person deciding is the whole point.
 *
 * ⚠️ `compute` IS A RUNG AND NOT A SEPARATE AXIS, and getting that wrong is what
 * a first attempt at this file did. "The maths may use my weight; nobody may see
 * it" is the most common thing somebody actually wants, and modelling it as a
 * property of the ASK rather than of the GRANT meant the person could not
 * express it — the app declared what it would do and the person had no rung to
 * agree to.
 *
 * ⚠️ AND `agent` SITS BELOW `staff` DELIBERATELY. A model summarising a week does
 * not remember, does not gossip and does not form an opinion about somebody at
 * the school gate; a person does. So "the assistant may know my weight, my coach
 * may not" is coherent and common — and until there was a rung for it, the only
 * way to have an assistant that knew anything was to expose everything to
 * everyone.
 */
export type Reach =
  /** Nowhere. The person, and nothing else. Every fact starts here. */
  | "self"
  /**
   * INTO ARITHMETIC WHOSE ANSWERS ARE SHOWN — and never the value itself.
   *
   * An energy target needs a mass, a height, an age and a sex; a coach needs the
   * target. At this rung the platform may run that calculation and show what it
   * produced, and no reader anywhere is handed an input.
   */
  | "compute"
  /**
   * A model acting for this person, inside this platform, on this request.
   *
   * ⚠️ NOT "an AI feature". What makes this rung safe is that the output is
   * returned TO THE PERSON. A model that reads at this rung and writes its answer
   * onto a screen somebody else will read has laundered a disclosure through a
   * summariser.
   */
  | "agent"
  /** A named person with a role in a workspace — a coach, a clinician. */
  | "staff";

/** Ascending. Index is the comparison; the order is the meaning. */
export const REACH: readonly Reach[] = ["self", "compute", "agent", "staff"];

/** Does a grant at `held` satisfy a read for `wanted`? */
export const reaches = (held: Reach, wanted: Reach): boolean =>
  REACH.indexOf(held) >= REACH.indexOf(wanted);

/**
 * ⚠️ THE RUNG THE ARITHMETIC RUNS AT, NAMED so no caller writes the string. A
 * derivation is refused unless every one of its inputs reaches at least this
 * far — which is what stops a reading being a side door around a fact nobody
 * shared at all.
 */
export const ARITHMETIC: Reach = "compute";

/* ----------------------------------------------------------- the facts --- */

/**
 * ⚠️ HOW A VALUE IS SHAPED, AND IT IS A SHORT CLOSED LIST ON PURPOSE. The vault
 * is not a database an app designs a schema in — it is a small number of things
 * that are true about a person, each of which several products want. A `json`
 * kind would make it the former within a quarter.
 */
export type FactKind =
  | "quantity"    // a number with a dimension. Height, mass, a girth.
  | "number"      // a bare number. A resting heart rate.
  | "text"        // short free text. What somebody is working towards.
  | "enum"        // one of a declared set. Sex, a blood group.
  | "date"        // a calendar date. A birth date.
  | "list";       // several short texts. Allergies, conditions, medication.

/**
 * WHO CAN READ THE STORED BYTES.
 *
 * ⚠️ THE FIELD THAT MAKES END-TO-END ENCRYPTION A LATER DECISION RATHER THAN A
 * REWRITE, and the constraint it carries has to be stated now because it is not
 * negotiable afterwards.
 *
 *   `server` the platform can read the value, so the platform can DERIVE from
 *            it. A body-mass index computed without disclosing a mass is only
 *            possible at this tier.
 *   `person` only a key held by the person's own device can read it. The
 *            platform stores a blob it cannot open — which is the strongest
 *            promise available, and it costs every server-side derivation.
 *
 * ⚠️ A `person`-sealed fact MAY NOT DECLARE A DERIVATION. Nothing on a server
 * can compute one, so a declaration that it does is a promise the arithmetic
 * cannot keep. `vault-sealed-facts-derive-nothing` refuses it.
 *
 * Today every fact is `server` and the envelope is the identity function. The
 * shape is what matters: values are opaque to everything outside this module,
 * derivations are computed inside it, and the day a key exists nothing above
 * has to change. A design that let handlers read values directly would make
 * that day a rewrite of every caller.
 */
export type Seal = "server" | "person";

/**
 * WHAT A READER IS SHOWN.
 *
 * ⚠️ THE SEPARATION FROM THE VALUE IS THE ENTIRE POINT OF THIS FILE. "Your
 * client is 12% down from where they started" and "your client weighs 78.4 kg"
 * are different disclosures, and until a product can express the first without
 * the second, every coach who needs progress is handed a body weight.
 *
 * A reading is computed from the fact's own history, inside the vault, and
 * carries its OWN audience. So the arithmetic can be public while the input
 * stays private, which is the shape the whole feature rests on.
 */
export interface Reading {
  /** `body.mass.trend`. Namespaced under its fact so it cannot be orphaned. */
  readonly id: string;
  readonly label: string;
  /** One line, in the words of the person deciding whether to disclose it. */
  readonly says: string;
  /**
   * ⚠️ WHAT IT CANNOT REVEAL, IN WRITING, AND IT IS NOT DECORATION. A derivation
   * discloses less than its input only if somebody checked. A percentage change
   * over a known start is an equation with one unknown; a body-mass index plus a
   * height is a weight. This sentence is what a reviewer checks the arithmetic
   * against, and `vault-reading-states-what-it-hides` refuses an empty one.
   */
  readonly hides: string;
  /**
   * Every fact this reading needs. ⚠️ Including its own — stated rather than
   * assumed, because a reading over two facts (a mass and a height) is disclosed
   * only when BOTH inputs allow it, and a resolver cannot know that from the
   * namespace.
   */
  readonly from: readonly string[];
}

/**
 * ONE THING THAT IS TRUE ABOUT A PERSON.
 *
 * ⚠️ THE REGISTRY IS THE PLATFORM'S AND IT IS CLOSED. An app that could declare
 * its own facts is an app that declares `height` a second time — and then one
 * person has two heights, in two products, with two grants and two erasure
 * paths, which is precisely the situation this replaces. Adding a fact is one
 * entry here, reviewed once, and available to every product afterwards.
 *
 * The cost is real and is the right one: a product cannot invent a private
 * sensitive field without saying so somewhere everybody can see.
 */
export interface Fact {
  /** `body.mass`. Dotted, namespaced by domain rather than by product. */
  readonly id: string;
  readonly label: string;
  readonly kind: FactKind;
  /** For `quantity`. What the stored number MEANS; display converts. */
  readonly dimension?: "mass" | "length" | "volume" | "energy" | "temperature" | "duration";
  /** For `enum`. */
  readonly values?: readonly string[];
  /**
   * ⚠️ WHAT IT IS UNDER THE LAW, and it is required for the same reason a
   * collection's `holding` is: no shape implies "this is health information", so
   * somebody has to say. The Article 30 record and the consent copy are derived
   * from this and nothing is written by hand.
   */
  readonly categories: readonly DataCategory[];
  readonly seal: Seal;
  /**
   * ⚠️ WHETHER A HISTORY IS KEPT, and it is a decision about the person rather
   * than about storage. A mass is a series — the change is the useful half and a
   * single number throws it away. A birth date is not: keeping every version of
   * it records only that somebody once typed it wrong.
   */
  readonly series: boolean;
  /**
   * THE COLUMN NAMES THAT **ARE** THIS FACT.
   *
   * ⚠️ DECLARED RATHER THAN DERIVED FROM THE ID, and the reason is `body.fat`.
   * Deriving from the last segment gives `fat`, which matches the fat content of
   * a FOOD — so the first app to declare a nutrition library was refused for
   * holding somebody's body composition. A check that refuses an honest
   * declaration teaches people to rename around it, which costs more than the
   * cases it catches.
   *
   * ⚠️ SO THE LIST IS THE UNAMBIGUOUS SPELLINGS AND NOTHING ELSE. Where a word
   * genuinely means two things, the fact does not claim it and the miss is
   * accepted: the second half of the check — that this only applies to a
   * collection holding PERSONAL data — is what makes that miss narrow.
   *
   * Lower-cased and compared whole, so `bodyFat` and `body_fat` both match and
   * `bodyFatGoal` does not.
   */
  readonly shadows: readonly string[];
  /** Computed inside the vault, disclosed on their own terms. */
  readonly readings?: readonly Reading[];
  /**
   * ⚠️ WHAT THE PLATFORM SUGGESTS, NEVER WHAT IT APPLIES. Every fact begins
   * `self` for everybody; this is the rung the consent sheet pre-highlights with
   * a reason beside it. A default that applied itself would be a disclosure
   * somebody did not make.
   */
  readonly suggests?: Reach;
  /** Why the suggestion is what it is, in the reader's own interest. */
  readonly because?: string;
}

/* -------------------------------------------------------- the registry --- */

/**
 * THE FACTS THIS PLATFORM KNOWS HOW TO HOLD.
 *
 * ⚠️ ORDERED BY HOW EXPOSING IT FEELS, not alphabetically and not by product.
 * The consent sheet renders in this order, and a list that opens with a birth
 * date and buries a training goal at the bottom teaches people to scroll past
 * the part that matters.
 */
export const FACTS: readonly Fact[] = [
  /* ------------------------------------------------------------ the body */
  {
    id: "body.mass",
    label: "Weight",
    kind: "quantity",
    dimension: "mass",
    categories: ["health"],
    seal: "server",
    series: true,
    shadows: ["weight", "bodyweight", "bodymass"],
    suggests: "self",
    because: "Somebody helping you can plan from the change without ever seeing the number.",
    readings: [
      {
        id: "body.mass.trend",
        label: "Weight trend",
        says: "Which way it is going, and how fast, over the last few weeks.",
        hides: "Every absolute weight. A direction and a rate per week, with no starting point to add them to.",
        from: ["body.mass"],
      },
      {
        id: "body.mass.progress",
        label: "Change since you started",
        says: "How much you have changed, as a percentage of where you began.",
        hides: "Both weights. A percentage of a start the reader does not know is one equation in two unknowns, and no number of readings turns it into a weight.",
        from: ["body.mass"],
      },
    ],
  },
  {
    id: "body.height",
    label: "Height",
    kind: "quantity",
    dimension: "length",
    categories: ["health"],
    seal: "server",
    series: false,
    shadows: ["height", "bodyheight", "heightcm", "stature"],
    suggests: "self",
    because: "Only needed to work out an energy target, which the platform can do without showing it.",
  },
  {
    id: "body.fat",
    label: "Body fat",
    kind: "number",
    categories: ["health"],
    seal: "server",
    series: true,
    shadows: ["bodyfat", "bodyfatpct", "bodyfatpercent"],
    suggests: "self",
  },
  {
    id: "body.girths",
    label: "Measurements",
    kind: "list",
    categories: ["health"],
    seal: "server",
    series: true,
    shadows: ["girths", "measurements", "circumferences"],
    suggests: "self",
  },
  /* -------------------------------------------------------- who they are */
  {
    id: "person.birthDate",
    label: "Date of birth",
    kind: "date",
    categories: ["identity"],
    seal: "server",
    series: false,
    shadows: ["birthdate", "dateofbirth", "dob", "birthday", "born"],
    suggests: "self",
    because: "An age band is enough for every calculation, and the platform derives one.",
    readings: [
      {
        id: "person.birthDate.ageBand",
        label: "Age band",
        says: "Which ten-year band you are in — 30s, 40s.",
        hides: "The date, the year and the exact age. A band is ten thousand people wide.",
        from: ["person.birthDate"],
      },
    ],
  },
  {
    id: "person.sex",
    label: "Sex at birth",
    kind: "enum",
    values: ["female", "male", "unstated"],
    categories: ["health"],
    seal: "server",
    series: false,
    shadows: ["sex", "gender", "sexatbirth", "biologicalsex"],
    suggests: "self",
    because: "Every energy formula needs it. None of them needs anybody to be told.",
  },
  /* ------------------------------------------------------------- health */
  {
    id: "health.conditions",
    label: "Conditions",
    kind: "list",
    categories: ["health"],
    seal: "server",
    series: false,
    shadows: ["conditions", "diagnoses", "diagnosis", "comorbidities"],
    suggests: "self",
  },
  {
    id: "health.medication",
    label: "Medication",
    kind: "list",
    categories: ["health"],
    seal: "server",
    series: false,
    shadows: ["medication", "medications", "meds", "prescriptions"],
    suggests: "self",
  },
  {
    id: "health.allergies",
    label: "Allergies",
    kind: "list",
    categories: ["health"],
    seal: "server",
    series: false,
    shadows: ["allergies", "allergens", "allergy"],
    suggests: "staff",
    because: "Somebody planning what you eat cannot avoid what they have not been told about.",
  },
  {
    id: "health.injuries",
    label: "Injuries",
    kind: "list",
    categories: ["health"],
    seal: "server",
    series: false,
    shadows: ["injuries", "injury"],
    suggests: "staff",
    because: "Somebody planning what you do cannot work around what they have not been told about.",
  },
  /* -------------------------------------------------------------- intent */
  {
    id: "goal.training",
    label: "Your goal",
    kind: "text",
    categories: ["health"],
    seal: "server",
    series: false,
    shadows: ["traininggoal", "fitnessgoal"],
    suggests: "staff",
    because: "The one thing somebody helping you genuinely cannot plan without. It is still yours to withhold.",
  },
  {
    id: "goal.eating",
    label: "How you eat",
    kind: "text",
    categories: ["health"],
    seal: "server",
    series: false,
    shadows: ["eatinggoal", "dietgoal", "dietarypreference"],
    suggests: "staff",
    because: "Nobody can plan a week of it against a preference they have not been told.",
  },
];

const BY_ID: ReadonlyMap<string, Fact> = new Map(FACTS.map((f) => [f.id, f]));
export const factOf = (id: string): Fact | undefined => BY_ID.get(id);

const READINGS: ReadonlyMap<string, Reading> = new Map(
  FACTS.flatMap((f) => (f.readings ?? []).map((r) => [r.id, r] as const)),
);
export const readingOf = (id: string): Reading | undefined => READINGS.get(id);

/* ----------------------------------------------------------- what apps ask --- */

/**
 * ⚠️ WHAT AN APP DOES WITH A FACT, AND THE THREE ARE NOT DEGREES OF THE SAME
 * THING. They are different asks, and a consent sheet that presented them as one
 * slider would be asking somebody to agree to the strongest of three.
 */
export type Need =
  /** The app computes with it and displays nothing traceable back. */
  | "compute"
  /** The app shows a READING. The value itself never leaves the vault. */
  | "derived"
  /** The app shows the value itself to somebody. The largest ask there is. */
  | "raw";

/**
 * ⚠️ ASCENDING, AND ONE WANT PER FACT AT THE LARGEST NEED. An app that computes
 * an energy target AND shows a weight trend has ONE ask about weight, not two —
 * a consent sheet with two rows for one fact is a person answering the same
 * question twice, and whichever row they answered second silently wins.
 *
 * `wantProblems` refuses the duplicate rather than merging it, because merging
 * would have to pick one of the two `why` sentences and the other one is the
 * part the person needed to read.
 */
export const NEEDS: readonly Need[] = ["compute", "derived", "raw"];

/**
 * ONE LINE IN AN APP'S ASK.
 *
 * ⚠️ `why` IS THE CONSENT SHEET'S COPY, WRITTEN BY WHOEVER WANTS THE DATA. A
 * platform that generated it would produce "Kova would like to access your
 * weight", which is the sentence every permission dialog on earth has trained
 * people to dismiss. The app has to say what it will DO, and a reviewer has to
 * be able to check the sentence against the handler.
 */
export interface Want {
  readonly fact: string;
  readonly need: Need;
  /** ⚠️ Required. `vault-want-says-why` refuses an empty one. */
  readonly why: string;
  /**
   * What the app suggests, which is a suggestion and not a default.
   *
   * ⚠️ AN APP MAY NOT SUGGEST HIGHER THAN THE FACT DOES. A platform that lets a
   * product argue for more exposure than the fact's own registry entry
   * recommends is a platform whose recommendation means nothing — every app
   * would ask for `staff` on everything and the sheet would recommend it.
   */
  readonly recommend?: Reach;
  /**
   * ⚠️ WHETHER THE APP IS USABLE WITHOUT IT, ANSWERED HONESTLY. `true` here is a
   * strong claim: it means a refusal takes a feature away, and the sheet says so
   * in those words. Everything else degrades, and the app has to cope.
   */
  readonly required?: boolean;
  /** Named readings this want covers, when `need` is `derived`. */
  readonly readings?: readonly string[];
  /**
   * WHO DOES THE READING — a model, or a person at the workspace.
   *
   * ⚠️ ONLY ON A `raw` WANT, AND IT LOWERS WHAT IS ASKED FOR RATHER THAN RAISING
   * IT. An app whose assistant needs a value declares `agent` and the person is
   * never offered the human rung at all; left out, a raw want asks at `staff`,
   * which is the safe reading of silence. `wantProblems` refuses it anywhere else,
   * because a field that quietly does nothing is one somebody believes is working.
   */
  readonly by?: Reader;
}

/** What an app declares in its manifest. */
export interface VaultSpec {
  readonly wants: readonly Want[];
}

/* ----------------------------------------------------------- the grant --- */

/**
 * ONE PERSON'S DECISION ABOUT ONE FACT AND ONE APP.
 *
 * ⚠️ PER APP, NOT PER PLATFORM. "My coaching app may see my injuries" is a
 * decision somebody can make; "any 4DL product may see my injuries" is not one
 * anybody has enough information to make, because the next product does not
 * exist yet. A grant that travelled across products would be consent given in
 * advance to a party nobody has met.
 *
 * ⚠️ AND PER WORKSPACE WHERE THERE IS ONE. Two studios on the same app are two
 * different rooms of people; `tenantId` null is the app as a whole, which is the
 * right scope for a fact the app computes with and shows to nobody.
 */
export interface Grant {
  readonly accountId: UserId;
  readonly fact: string;
  readonly appId: string;
  /** ⚠️ Null is the app itself. A named workspace is narrower, never wider. */
  readonly tenantId: string | null;
  readonly reach: Reach;
  /**
   * ⚠️ RESOLVED ON READ, NEVER BY A SWEEP. A sweep that has not run yet is a
   * disclosure that expired an hour ago and is still being served, and the
   * failure is silent in the one direction that matters. The same reason the
   * customer rail resolves a lapse lazily.
   */
  readonly expiresAt: Instant | null;
  readonly grantedAt: Instant;
  /** ⚠️ How it was given, so a review screen can say. */
  readonly via: "sheet" | "import" | "operator";
}

/** Whether a grant is live at this instant. */
export const live = (g: Grant, now: Instant): boolean => g.expiresAt === null || g.expiresAt > now;

/* ------------------------------------------------------------ resolution --- */

/** What a reader is asking for. */
export interface Ask {
  readonly fact: string;
  readonly appId: string;
  readonly tenantId: string | null;
  readonly reach: Reach;
}

export type VaultVerdict =
  | { readonly allowed: true; readonly grantedAt: Instant; readonly expiresAt: Instant | null }
  | { readonly allowed: false; readonly because: VaultRefusal };

/**
 * ⚠️ WHY A READ WAS REFUSED, AS A CODE RATHER THAN A SENTENCE. Four of these are
 * different situations that look identical from a caller and want different
 * copy: nothing was ever asked for, it was asked and declined, it was granted
 * and has run out, and it was granted to a smaller audience than this reader.
 * Collapsing them into "denied" is how a screen comes to say "you have not
 * shared this" to somebody who shared it last month and whose grant lapsed.
 */
export type VaultRefusal =
  /** No grant of any kind. The person has never been asked, or said no. */
  | "ungranted"
  /** A grant existed and its expiry has passed. */
  | "expired"
  /** A grant exists at a lower rung — an agent may read it, this reader may not. */
  | "narrower"
  /** The fact is sealed to the person's own device, so no server can read it. */
  | "sealed"
  /** The platform holds nothing under this fact for this person. */
  | "empty";

/**
 * MAY THIS READER SEE THIS FACT?
 *
 * ⚠️ PURE, TOTAL, AND THE ONE PLACE THE QUESTION IS ANSWERED. Every disclosure
 * in the platform goes through this function — the read path, the reading path,
 * the agent's tool filter and the export — because a second implementation of
 * "may they see it" is how a screen comes to show what a route would refuse.
 */
export function mayRead(input: {
  readonly ask: Ask;
  readonly grants: readonly Grant[];
  readonly has: boolean;
  readonly now: Instant;
}): VaultVerdict {
  const fact = factOf(input.ask.fact);
  /* An unknown fact is refused as ungranted rather than throwing: a manifest
     naming one is refused at composition, so reaching here means a caller
     constructed the id, and a caller does not get an oracle for what exists. */
  if (!fact) return { allowed: false, because: "ungranted" };
  if (fact.seal === "person") return { allowed: false, because: "sealed" };

  const held = reachOf(input.grants, input.ask, input.now);
  if (held.because) return { allowed: false, because: held.because };
  if (!reaches(held.reach!, input.ask.reach)) return { allowed: false, because: "narrower" };

  /*
    ⚠️ EMPTINESS IS CHECKED LAST, so "you have not shared this" and "you have
    not recorded this" stay different answers. Checking it first would tell an
    ungranted reader that the person has nothing — which is itself a disclosure,
    and one nobody granted.
  */
  if (!input.has) return { allowed: false, because: "empty" };
  return { allowed: true, grantedAt: held.grantedAt!, expiresAt: held.expiresAt ?? null };
}

/**
 * HOW FAR ONE THING HAS BEEN GRANTED TO ONE APP, AND UNTIL WHEN.
 *
 * ⚠️ ONE WALK OVER THE GRANTS, USED BY BOTH RESOLVERS. `mayRead` and `mayDerive`
 * ask the same question of different keys — a fact id and a reading id — and two
 * copies of "which grant wins" is how a reading comes to be governed by a rule
 * the value is not.
 */
function reachOf(
  grants: readonly Grant[],
  ask: { readonly fact: string; readonly appId: string; readonly tenantId: string | null },
  now: Instant,
): { reach?: Reach; grantedAt?: Instant; expiresAt?: Instant | null; because?: VaultRefusal } {
  /*
    ⚠️ A GRANT TO THE APP AS A WHOLE REACHES EVERY WORKSPACE INSIDE IT, and one
    to a named workspace reaches only that one. Both are considered, because
    narrowing later must not silently revoke what was given app-wide.
  */
  const mine = grants.filter(
    (g) => g.fact === ask.fact && g.appId === ask.appId && (g.tenantId === null || g.tenantId === ask.tenantId),
  );
  if (!mine.length) return { because: "ungranted" };

  const standing = mine.filter((g) => live(g, now));
  if (!standing.length) return { because: "expired" };

  /*
    ⚠️ THE HIGHEST RUNG WINS AMONG LIVE GRANTS, and the longest expiry with it.
    Two grants for one thing is the ordinary result of an app asking again with a
    wider ask; taking the first would make the answer depend on row order.
  */
  const best = standing.reduce((a, b) => (REACH.indexOf(b.reach) > REACH.indexOf(a.reach) ? b : a));
  const expiries = standing.filter((g) => g.reach === best.reach).map((g) => g.expiresAt);
  return {
    reach: best.reach,
    grantedAt: best.grantedAt,
    expiresAt: expiries.includes(null) ? null : (expiries.sort().at(-1) as Instant),
  };
}

/**
 * MAY THIS READER SEE THIS READING?
 *
 * ⚠️ A READING HAS ITS OWN GRANT, AND THAT IS THE WHOLE FEATURE. "My coach may
 * see which way my weight is going; my coach may not see my weight" is two
 * decisions about two different disclosures, and a design where the reading
 * inherited the value's rung cannot express it — which makes a trend either
 * impossible or free, and both are wrong.
 *
 * ⚠️ AND EVERY INPUT MUST STILL REACH `compute`. That is what stops a reading
 * being a side door: granting a trend does not grant the arithmetic behind it
 * over a fact the person shared with nobody at all. A body-mass index is a mass
 * and a height, and a grant on the index alone must not let a product read a
 * weight that was never shared.
 */
export function mayDerive(input: {
  readonly reading: string;
  readonly appId: string;
  readonly tenantId: string | null;
  readonly reach: Reach;
  readonly grants: readonly Grant[];
  readonly has: (fact: string) => boolean;
  readonly now: Instant;
}): VaultVerdict {
  const reading = readingOf(input.reading);
  if (!reading) return { allowed: false, because: "ungranted" };

  const own = reachOf(input.grants, { fact: input.reading, appId: input.appId, tenantId: input.tenantId }, input.now);
  if (own.because) return { allowed: false, because: own.because };
  if (!reaches(own.reach!, input.reach)) return { allowed: false, because: "narrower" };

  let soonest: Instant | null = own.expiresAt ?? null;
  for (const fact of reading.from) {
    const spec = factOf(fact);
    if (!spec) return { allowed: false, because: "ungranted" };
    if (spec.seal === "person") return { allowed: false, because: "sealed" };

    const input_ = reachOf(input.grants, { fact, appId: input.appId, tenantId: input.tenantId }, input.now);
    if (input_.because) return { allowed: false, because: input_.because };
    if (!reaches(input_.reach!, ARITHMETIC)) return { allowed: false, because: "narrower" };
    /* ⚠️ The SOONEST expiry across the reading and every input: it is live only
       while all of them are, so the window is the intersection. */
    if (input_.expiresAt != null && (soonest === null || input_.expiresAt < soonest)) soonest = input_.expiresAt;

    /* ⚠️ Emptiness again last, and only once every gate has passed. */
    if (!input.has(fact)) return { allowed: false, because: "empty" };
  }
  return { allowed: true, grantedAt: own.grantedAt!, expiresAt: soonest };
}

/* ------------------------------------------------------------- refusals --- */

export interface VaultProblem { readonly at: string; readonly why: string }

/**
 * ⚠️ THE REGISTRY CHECKED AGAINST ITSELF. It is a constant in this file, so
 * every one of these is a mistake made while editing it — which is exactly when
 * nobody is running a manifest composition, and exactly when a silent one would
 * ship. `vault-registry-is-coherent` runs it in the kernel's own suite.
 */
export function registryProblems(facts: readonly Fact[] = FACTS): readonly VaultProblem[] {
  const out: VaultProblem[] = [];
  const seen = new Set<string>();
  const readings = new Set<string>();

  for (const f of facts) {
    if (seen.has(f.id)) out.push({ at: f.id, why: "is declared twice, so one of the two is unreachable and nobody can tell which" });
    seen.add(f.id);
    if (!f.categories.length) out.push({ at: f.id, why: "is in no category, so nothing about it reaches the record of processing" });
    if (f.kind === "enum" && !f.values?.length) out.push({ at: f.id, why: "is an enum with no values, which is a field nobody can fill in" });
    if (f.kind === "quantity" && !f.dimension) out.push({ at: f.id, why: "is a quantity with no dimension, so a stored number means nothing" });
    /*
      ⚠️ A FACT THAT CLAIMS NO COLUMN NAME CANNOT BE SHADOW-CHECKED, so an app
      may declare it as an ordinary field and the whole mechanism is decorative
      for that fact — silently, with every consent control still working.
    */
    if (!f.shadows.length) {
      out.push({ at: f.id, why: "names no column that would be a copy of it, so an app declaring one is refused by nothing" });
    }
    for (const w of f.shadows) {
      if (w !== w.toLowerCase().replace(/[^a-z0-9]/g, "")) {
        out.push({ at: f.id, why: `shadows "${w}", which is not in the normalised form field names are compared in, so it can never match` });
      }
    }
    if (f.suggests && f.suggests !== "self" && !f.because?.trim()) {
      out.push({ at: f.id, why: `suggests ${f.suggests} and gives no reason — a recommendation with no argument beside it is a default wearing a suggestion's clothes` });
    }

    /*
      ⚠️ A SEALED FACT CANNOT DERIVE. Nothing on a server can open it, so a
      declared derivation is arithmetic that will never run — and it is worse
      than absent, because a consent sheet would offer somebody a reading the
      platform cannot produce.
    */
    if (f.seal === "person" && f.readings?.length) {
      out.push({ at: f.id, why: "is sealed to the person's own device and declares a reading, which no server can compute — the promise is unkeepable rather than merely unimplemented" });
    }

    for (const r of f.readings ?? []) {
      if (readings.has(r.id)) out.push({ at: r.id, why: "is declared twice" });
      readings.add(r.id);
      if (!r.id.startsWith(`${f.id}.`)) {
        out.push({ at: r.id, why: `is declared on ${f.id} and is not namespaced under it, so nothing connects the two and revoking the fact leaves the reading looking live` });
      }
      if (!r.hides.trim()) {
        out.push({ at: r.id, why: "does not say what it hides — a derivation discloses less than its input only if somebody checked, and this sentence is the check" });
      }
      if (!r.says.trim()) out.push({ at: r.id, why: "does not say what it shows" });
      if (!r.from.length) out.push({ at: r.id, why: "is computed from nothing" });
      if (!r.from.includes(f.id)) {
        out.push({ at: r.id, why: `does not list ${f.id} among its inputs, so revoking the fact it hangs off would leave it readable` });
      }
      for (const input of r.from) {
        if (!facts.some((g) => g.id === input)) out.push({ at: r.id, why: `reads ${input}, which is not a fact` });
      }
    }
  }
  return out;
}

/**
 * WHAT AN APP'S ASK MUST SATISFY.
 *
 * ⚠️ CHECKED AT COMPOSITION, so an app cannot ship a consent sheet nobody can
 * answer. Every one of these produces a sheet that is wrong in a way a person
 * cannot see: a fact that does not exist renders as an empty row, a missing
 * `why` renders as a blank reason, and a recommendation above the platform's own
 * turns the whole recommendation column into advertising.
 */
export function wantProblems(spec: VaultSpec | undefined, appId: string): readonly VaultProblem[] {
  if (!spec) return [];
  const out: VaultProblem[] = [];
  const seen = new Set<string>();

  for (const w of spec.wants) {
    const fact = factOf(w.fact);
    if (!fact) {
      out.push({ at: w.fact, why: `is not a fact the platform holds — ${appId} would render a consent row for something with no value behind it` });
      continue;
    }
    if (seen.has(w.fact)) out.push({ at: w.fact, why: "is asked for twice, so the sheet has two rows for one decision and the second silently wins" });
    seen.add(w.fact);

    if (!w.why.trim()) {
      out.push({ at: w.fact, why: "is asked for with no reason, and a permission prompt with no reason is the one everybody dismisses" });
    }
    /* ⚠️ ONLY A `compute` WANT HAS NO READER TO NAME. A raw want's reader looks at
       the value; a DERIVED want's reader looks at the reading — the derivation
       runs on the server, but somebody consumes what comes out, and refusing the
       field there took away the one thing a trend most needs to say. */
    if (w.by && w.need === "compute") {
      out.push({
        at: w.fact,
        why: "names a reader on a compute want, where nothing but the server ever sees anything — a declaration that does nothing is one somebody believes is working",
      });
    }
    if (w.recommend && REACH.indexOf(w.recommend) > REACH.indexOf(fact.suggests ?? "self")) {
      out.push({
        at: w.fact,
        why: `recommends ${w.recommend} where the platform recommends ${fact.suggests ?? "self"} — an app that may argue for more exposure than the fact does turns the recommendation into advertising`,
      });
    }
    if (fact.seal === "person" && w.need !== "compute") {
      out.push({ at: w.fact, why: "is sealed to the person's own device, so no server can show it or derive from it" });
    }
    for (const r of w.readings ?? []) {
      const reading = readingOf(r);
      if (!reading) out.push({ at: r, why: "is not a reading the platform computes" });
      else if (!reading.from.includes(w.fact)) out.push({ at: r, why: `is not computed from ${w.fact}` });
    }
    /*
      ⚠️ NAMING READINGS ON A `raw` WANT IS A CONTRADICTION WORTH REFUSING. The
      app is asking to see the value AND listing what it will show instead of the
      value, which is two different sentences in one row of a consent sheet.
    */
    if (w.need === "raw" && w.readings?.length) {
      out.push({ at: w.fact, why: "asks for the value itself and also names readings, which are what an app asks for INSTEAD of the value" });
    }
    if (w.need === "derived" && !w.readings?.length) {
      out.push({ at: w.fact, why: "asks for a derived view and names no reading, so there is nothing for the person to be shown" });
    }
  }
  return out;
}

/**
 * ⚠️ A COLLECTION MAY NOT SHADOW A FACT THE VAULT OWNS, and this is the check
 * that makes the whole design real rather than decorative.
 *
 * Without it an app declares `height` on its own table, the vault holds a second
 * height nobody updates, and the person's grants govern a copy of their data
 * that no screen reads. The failure is total and invisible: every consent
 * control works, and none of it is connected to what is displayed.
 *
 * ⚠️ MATCHED ON THE LAST SEGMENT, because a fact is `body.mass` and a column is
 * `mass` — and on the whole word, because `massUnit` is a display preference and
 * `bodyMassIndex` is a derived number an app may legitimately cache.
 */
export function shadowProblems(
  collections: readonly {
    readonly id: string;
    readonly fields: Readonly<Record<string, unknown>>;
    /**
     * ⚠️ WHAT THE COLLECTION SAYS IT HOLDS, AND IT IS HALF THE CHECK. `weight` on
     * a collection about a PERSON is a body weight; on a studio's library of
     * foods it is a portion size, and on a shipping product it is a parcel. The
     * word alone cannot tell them apart and neither can any list of words.
     *
     * Optional so a caller may pass a bare shape, and ABSENT MEANS PERSONAL —
     * the strict reading, because a caller who did not say is a caller who did
     * not think about it, and the failure that matters is the missed one.
     */
    readonly holding?: { readonly kind: "none" | "personal" };
  }[],
  facts: readonly Fact[] = FACTS,
): readonly VaultProblem[] {
  const owned = new Map<string, string>();
  for (const f of facts) for (const w of f.shadows) owned.set(w.toLowerCase(), f.id);

  const out: VaultProblem[] = [];
  for (const c of collections) {
    /*
      ⚠️ A COLLECTION THAT HOLDS NOTHING PERSONAL CANNOT SHADOW A FACT ABOUT A
      PERSON, and that is not a loophole: `holdingProblems` already refuses a
      collection claiming to hold nothing while carrying a body vocabulary, so
      the two checks compose. An app cannot dodge this one by declaring `none` —
      it would be refused by the other, in the same throw, with a sentence
      naming the field.
    */
    if (c.holding?.kind === "none") continue;
    for (const name of Object.keys(c.fields)) {
      /* ⚠️ `body_fat` and `bodyFat` are the same column with two conventions,
         and a check that only knew one is a check an app renames past. */
      const key = name.toLowerCase().replace(/[^a-z0-9]/g, "");
      const fact = owned.get(key);
      if (!fact) continue;
      out.push({
        at: `${c.id}.${name}`,
        why: `holds ${fact}, which the vault owns — a second copy is a disclosure that outlives every grant over it, and nothing anywhere could take it back`,
      });
    }
  }
  return out;
}

/* ------------------------------------------------------- what it discloses --- */

/**
 * THE ARTICLE 30 ROWS THE VAULT CONTRIBUTES, DERIVED FROM AN APP'S ASK.
 *
 * ⚠️ THE VAULT IS A PROCESSING ACTIVITY AND IS INVISIBLE TO THE COLLECTION-BASED
 * DERIVATION. The record is built from what collections hold; a fact the app
 * never stores appears in no collection, so an app reading somebody's health
 * data through the vault would produce a record of processing saying it holds no
 * health data — which is true and completely misleading.
 */
export interface VaultActivity {
  readonly fact: string;
  readonly label: string;
  readonly categories: readonly DataCategory[];
  readonly need: Need;
  readonly purpose: string;
  /**
   * ⚠️ ALWAYS `consent`, AND IT IS NOT A CHOICE AN APP GETS TO MAKE. A vault
   * disclosure happens because somebody granted it and stops when they withdraw
   * it, which is Article 7 whatever anybody writes in a manifest. An app
   * claiming `contract` for a fact a person can revoke with one switch is
   * claiming a basis its own mechanism contradicts.
   */
  readonly basis: "consent";
  readonly condition: "explicit_consent";
  readonly special: boolean;
}

const SPECIAL = new Set<DataCategory>([
  "health", "biometric", "genetic", "racial", "political", "religious", "union", "sexlife",
]);

export function vaultActivities(spec: VaultSpec | undefined): readonly VaultActivity[] {
  if (!spec) return [];
  return spec.wants.flatMap((w): VaultActivity[] => {
    const fact = factOf(w.fact);
    if (!fact) return [];
    return [{
      fact: fact.id,
      label: fact.label,
      categories: fact.categories,
      need: w.need,
      purpose: w.why,
      basis: "consent",
      condition: "explicit_consent",
      special: fact.categories.some((k) => SPECIAL.has(k)),
    }];
  });
}

/* ------------------------------------------------------- what a want stands at */

/**
 * THE VAULT AS A RENDERER — one declared want, resolved against what somebody
 * actually granted, with everything a screen needs and nothing it has to look up.
 *
 * ⚠️ THIS EXISTS SO NO SCREEN EVER LEARNS WHAT A FACT IS. A vault built the
 * obvious way grows a branch per fact — a sentence for height, another for
 * weight, a special case for the one that is a series — and then every app that
 * declares a thirteenth fact needs the hub edited. Everything below
 * is copied out of the manifest and the fact registry; the renderer's only job is
 * to lay it out.
 */
export interface Wanted {
  readonly fact: string;
  readonly label: string;
  /** ⚠️ The app's own sentence, from its manifest. Never written by a screen. */
  readonly why: string;
  readonly need: Need;
  readonly required: boolean;
  /**
   * ⚠️ THE ONE RUNG THIS WANT TURNS ON, which is what makes an item a switch
   * rather than a menu of four. A want declares what it NEEDS — arithmetic, a
   * derivation, or the value itself — so for any single item the rungs above that
   * buy the app nothing and the rungs between are indistinguishable to the person.
   * Off is always `self`; on is this.
   */
  readonly asks: Reach;
  /**
   * ⚠️ EVERY RUNG THIS WANT MAY STAND AT, so a surface offers a CHOICE where
   * there is one and a switch only where there is not. A want needing the value
   * itself can be held at "the assistant, no people" — a rung somebody chooses
   * deliberately, and one that a boolean control silently spends.
   */
  readonly rungs: readonly Reach[];
  /** Where it stands now. `self` when nothing is granted, or a grant has lapsed. */
  readonly reach: Reach;
  readonly granted: boolean;
  readonly expiresAt: Instant | null;
  /** ⚠️ WHETHER ANYTHING IS RECORDED, never the value. */
  readonly held: boolean;
  readonly recommend?: Reach;
  /** Why the recommendation is what it is, in the reader's own interest. */
  readonly because?: string;
  readonly categories: readonly DataCategory[];
  /**
   * ⚠️ A DERIVED WANT IS SEVERAL CONTROLS, NOT ONE. Each reading discloses a
   * different amount and says so in its own words, so collapsing them into one
   * would make the person grant the most revealing to get the least — and each is
   * resolved here, with its own rung, because a reading is granted in its own
   * right and has to be narrowable after the fact rather than only at the sheet.
   */
  readonly readings: readonly WantedReading[];
}

/** One reading of a fact, resolved the same way the fact itself is. */
export interface WantedReading extends Reading {
  readonly asks: Reach;
  readonly rungs: readonly Reach[];
  readonly reach: Reach;
  readonly granted: boolean;
  readonly expiresAt: Instant | null;
}

/** Every want one app declared, resolved for one person in one workspace. */
export interface WantedHere {
  readonly appId: string;
  readonly tenantId: string | null;
  readonly items: readonly Wanted[];
}

/**
 * ⚠️ THE RUNG A WANT ASKS FOR IS DERIVED FROM WHAT IT NEEDS, not declared twice.
 * An app that could name its own rung could name one its need does not justify,
 * and nothing would catch it — the sheet would simply ask for more.
 */
/**
 * ⚠️ WHO READS IT, WHICH IS NOT THE SAME QUESTION AS WHAT THE APP DOES WITH IT.
 * `need` says the app wants the value itself; this says whether a MODEL or a
 * PERSON is the one who ends up looking. Both are readers and they are not
 * interchangeable — "an assistant may know this, no human may" is the single
 * disclosure people most want to make, and it is unavailable to an app that
 * cannot say which of the two it is.
 */
export type Reader = "agent" | "staff";

/** The shape both derivations below need, which a `Want` satisfies structurally. */
export interface Reads {
  readonly need: Need;
  /** ⚠️ Only meaningful on a `raw` want; everything else is read by the server. */
  readonly by?: Reader;
}

/**
 * ⚠️ THE RUNG A WANT ASKS AT, AND `staff` IS A DEFAULT RATHER THAN A LAW. Every
 * raw want asked at `staff` when this took only the need — so an app whose ONLY
 * reader is its own assistant had to ask for the human rung to get the model one,
 * and the person was asked to expose a fact to a roomful of people so that a model
 * could read it. Over-asking is the thing the whole ladder exists to prevent, and
 * the platform was structurally forcing it.
 */
export const asksFor = (w: Reads): Reach =>
  (w.need === "raw" ? (w.by ?? "staff") : ARITHMETIC);

/**
 * ⚠️ A READING IS READ BY SOMEBODY ELSE THAN ITS INPUTS ARE. The derivation runs
 * on the server — so the base fact only ever asks at `compute` — and then a person
 * or a model looks at what came out. That second rung is the whole point of a
 * derived want: a coach seeing a direction while the number stays here.
 */
export const readingAsksFor = (w: Reads): Reach => w.by ?? "staff";

/**
 * WHICH RUNGS A WANT MAY STAND AT — the one list, for every surface that offers
 * a choice.
 *
 * ⚠️ IT LIVES HERE BECAUSE TWO SURFACES OFFER IT AND THEY MUST NOT DISAGREE. The
 * consent sheet asks for the first time; the vault changes it later. With a copy
 * each, the vault collapsed a `raw` want to on-or-off — so somebody who had
 * deliberately chosen "the assistant, no people" in the sheet saw a switch that
 * was ON, and turning it off and on again silently re-granted at `staff`. A
 * control that escalates a disclosure the person narrowed is the worst thing this
 * screen could do, and it typechecked.
 *
 * ⚠️ AN APP IS OFFERED NO RUNG IT COULD NOT SPEND — every rung from `self` up to
 * the one its need asks for, and none above. Showing a compute-only want `staff`
 * would be the product asking for more than it can use, which is what teaches
 * people the rungs are theatre.
 *
 * ⚠️ AND IT IS DERIVED FROM `asksFor` RATHER THAN LISTED BESIDE IT. Written as its
 * own table the two disagreed within a day: `asksFor` had a DERIVED want asking at
 * `compute` — the derivation runs server-side and the app never sees the value —
 * while this offered it all four, so the vault invited somebody to hand over a raw
 * number for a feature that had only ever asked for a direction. Two answers to
 * "how far does this want reach" is the same defect the copy of this list in the
 * consent sheet already caused, one level down.
 */
export const rungsFor = (w: Reads): readonly Reach[] =>
  REACH.slice(0, REACH.indexOf(asksFor(w)) + 1);

/**
 * ⚠️ THE HIGHEST LIVE GRANT WINS, and the walk is the same one `mayRead` does.
 * Two resolvers over one question is how a screen comes to promise what a route
 * refuses — so a fact and a reading go through this one function, keyed the same
 * way each is stored.
 */
function highest(
  grants: readonly Grant[], fact: string, appId: string, tenantId: string | null, now: Instant,
): Grant | null {
  return grants.reduce<Grant | null>((best, g) => {
    if (g.fact !== fact || g.appId !== appId || g.tenantId !== tenantId) return best;
    if (g.expiresAt !== null && g.expiresAt <= now) return best;
    return best === null || REACH.indexOf(g.reach) > REACH.indexOf(best.reach) ? g : best;
  }, null);
}

export function wantedHere(input: {
  readonly spec: VaultSpec;
  readonly appId: string;
  readonly tenantId: string | null;
  readonly grants: readonly Grant[];
  readonly held: ReadonlySet<string>;
  readonly now: Instant;
  readonly facts?: readonly Fact[];
}): WantedHere {
  const { spec, appId, tenantId, grants, held, now } = input;
  const facts = input.facts ?? FACTS;
  const byId = new Map(facts.map((f) => [f.id, f]));

  const items = spec.wants.flatMap((want): Wanted[] => {
    const fact = byId.get(want.fact);
    /* ⚠️ A want naming no fact is dropped rather than rendered blank.
       `wantProblems` refuses it at composition, so reaching here is a registry
       edited under a running app, and half a row is worse than no row. */
    if (!fact) return [];
    const at = highest(grants, want.fact, appId, tenantId, now);
    return [{
      fact: want.fact,
      label: fact.label,
      why: want.why,
      need: want.need,
      required: want.required === true,
      asks: asksFor(want),
      rungs: rungsFor(want),
      reach: at?.reach ?? "self",
      granted: at !== null,
      expiresAt: at?.expiresAt ?? null,
      held: held.has(want.fact),
      recommend: want.recommend ?? fact.suggests,
      because: fact.because,
      categories: fact.categories,
      /* ⚠️ ONLY THE READINGS THIS WANT NAMED. A fact may offer several and an app
         may want one of them; listing the rest would offer somebody a control
         over a disclosure nothing is asking to make. */
      readings: (fact.readings ?? [])
        .filter((r) => (want.readings ?? []).includes(r.id))
        .map((r): WantedReading => {
          /* ⚠️ THE READING'S OWN GRANT, keyed on the reading id exactly as
             `mayDerive` reads it. Resolving it from the fact's grant instead
             would make the two disagree, and the resolver is the half nobody
             looks at. */
          const at = highest(grants, r.id, appId, tenantId, now);
          const asks = readingAsksFor(want);
          return {
            ...r,
            asks,
            rungs: REACH.slice(0, REACH.indexOf(asks) + 1),
            reach: at?.reach ?? "self",
            granted: at !== null,
            expiresAt: at?.expiresAt ?? null,
          };
        }),
    }];
  });

  return { appId, tenantId, items };
}

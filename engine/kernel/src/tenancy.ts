/**
 * WHO EXISTS, AND WHERE THEIR RECORDS ARE.
 *
 * ⚠️ A TENANT IS PRIMARY AND AN APP IS A CAPABILITY SWITCHED ON FOR IT (D1). The
 * previous platform keyed a workspace by its product, so a business using two of
 * them had two workspaces, two addresses, two rosters and two bills. Here a
 * tenant is a business; `Enablement` is the row that says which products it has.
 *
 * ⚠️ AND ITS RECORDS ARE PLACED RATHER THAN OWNED (D5). A tenant carries a
 * `Placement` — a shard set — instead of a database of its own. That is what
 * lets a product hammering the store and a quiet one share a shard, and what
 * lets a tenant be moved off a hot one without changing anything about it.
 *
 * Layer 2. Imports primitives.
 */

import type { AccountId, AppId, Instant, TenantId } from "./primitives.js";

/* -------------------------------------------------------------- placement --- */

/**
 * WHERE A TENANT'S RECORDS LIVE.
 *
 * ⚠️ IT IS A SHARD SET AND NOT A REGION, and the distinction is the whole point
 * of D5. A region says which continent; a placement says which *database*, so
 * two tenants in the same region can sit on different shards and a full shard
 * can be relieved by moving tenants rather than by growing.
 *
 * ⚠️ THE `where` IS A COMPLIANCE PROMISE, NOT A PERFORMANCE HINT. It comes from
 * the tenant's own declared country (D6) and it is a claim we make to that
 * business about their customers' data. Anything that would take their records
 * out of it — a shard move, an AI provider, a backup — has to honour it or
 * refuse.
 */
export interface Placement {
  /** The shard this tenant's records are on. Opaque; the directory resolves it. */
  readonly shard: string;
  readonly where: Residency;
}

/**
 * ⚠️ A CLOSED SET, DELIBERATELY. Every value here is a promise the deployment
 * has to be able to keep end to end — storage, backups and every sub-processor.
 * Adding one is a commitment to build that chain, which is why it is not a
 * free-form string an app could invent.
 *
 * ⚠️ AND THE PROMISE IS ABOUT STORED RECORDS, NOT ABOUT OPERATIONAL LOGS, which
 * is a narrowing rather than a nicety. This sentence used to say "logs" as well,
 * and it was not true: the platform runs on Workers Logs, which have no
 * residency control and none is on offer. A promise a vendor gives you no way to
 * keep is one broken by the first request, so it is not made — and what is done
 * instead is the thing that actually protects anybody, which is keeping people
 * OUT of log lines. `scripts/logs.test.mjs` enforces that, because a rule about
 * what may be logged is exactly the kind that decays into a paragraph nobody
 * reads.
 *
 * ⚠️ THE AUDIT TRAIL IS NOT A LOG AND IS NOT AFFECTED. It is a table on the
 * workspace's own shard, in the workspace's own jurisdiction, and it is where
 * "who did what" is answered — deliberately, so that the question has an answer
 * that does not depend on a vendor's log retention.
 */
export type Residency = "eu" | "global";

/**
 * The EEA, plus the two that behave like it for this purpose.
 *
 * ⚠️ THIS IS A LIST OF COUNTRIES, NOT A LIST OF PEOPLE. See `Tenant.country` —
 * the question is where the business is, which they declare and we can act on,
 * rather than anybody's nationality, which is unverifiable and which asking for
 * would itself be collecting a special category.
 */
export const EEA: readonly string[] = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU",
  "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES",
  "SE", "IS", "LI", "NO", "CH", "GB",
];

/**
 * ⚠️ WHERE A NEW TENANT'S RECORDS SHOULD LIVE, AND `global` IS NOT "ANYWHERE" —
 * it is the deployment's default region, named honestly rather than promised as
 * something narrower. Offering a residency we cannot keep end to end (storage,
 * backups, logs, every sub-processor) is a promise broken by a rebalance nobody
 * connected to it.
 *
 * ⚠️ AND THIS IS A DEFAULT, NOT A CEILING. A business outside the EEA that wants
 * EU residency may have it — the rule below is what happens when nobody chose,
 * and it errs towards the stricter regime because that is the direction whose
 * mistake is recoverable.
 */
export const residencyFor = (country: string): Residency =>
  EEA.includes(country.toUpperCase()) ? "eu" : "global";

/**
 * WHAT A JURISDICTION IS CALLED IN FRONT OF SOMEBODY.
 *
 * ⚠️ `eu` AND `global` ARE KEYS, AND FOUR SCREENS WERE PRINTING THEM. A shard
 * described as "eu", a deployment "serving eu, global", a feature withheld "in
 * eu" — each is a value the code branches on, rendered where a place was meant.
 * The words are here rather than in a screen because there is one closed set and
 * four readers, and the fifth reader would invent a fifth wording.
 *
 * ⚠️ AND `global` IS NOT "ANYWHERE" — see `residencyFor`. It is where records go
 * when the EU was not promised, which is a fact about this deployment rather
 * than a promise about the world, so it is named as one.
 *
 * ⚠️ BOTH ARE MID-SENTENCE FORMS, ON PURPOSE. Every reader puts a preposition in
 * front of one ("serving …", "not in …", "kept in …"), and a capitalised phrase
 * would have to be lowered again at each of them — which is the edit somebody
 * gets wrong once and ships as "Not in The EU".
 */
const WHERE: Readonly<Record<Residency, string>> = {
  eu: "the EU",
  global: "the default region",
};

export const sayWhere = (where: Residency): string => WHERE[where] ?? where;

/* --------------------------------------------------------------- entities --- */

/** A person. One identity across every product (D1). */
export interface Account {
  readonly id: AccountId;
  readonly email: string;
  readonly name: string | null;
  readonly at: Instant;
}

/**
 * A business. Holds one or more apps.
 *
 * ⚠️ `country` IS A FACT ABOUT THE BUSINESS AND NEVER ABOUT A PERSON (D6). GDPR
 * follows where somebody *is* and whether we offer services into the EU — not
 * anybody's nationality, which is unverifiable and which we therefore never ask.
 * The country is what a placement is derived from, and it is the tenant's to
 * declare because the residency promise is made to the tenant.
 */
export interface Tenant {
  readonly id: TenantId;
  /** A DNS label. It is the address, so it is validated as one. */
  readonly slug: string;
  readonly name: string;
  /** ISO 3166-1 alpha-2, as the business declared it at signup. */
  readonly country: string;
  readonly placement: Placement;
  readonly kind: Kind;
  /**
   * ⚠️ REQUIRED OF A COMMERCIAL WORKSPACE AND MEANINGLESS TO A PERSONAL ONE.
   * `name` is what the product calls it and may be anything; this is who is
   * trading, and it is what an invoice, a contract and a processing record have
   * to carry. Null on a personal workspace, because asking a person for their
   * company's legal name is asking for something that does not exist.
   */
  readonly legalName: string | null;
  readonly at: Instant;
}

/* ------------------------------------------------------------------ kind --- */

/**
 * WHETHER THIS WORKSPACE IS SOMEBODY'S OR A BUSINESS'S.
 *
 * ⚠️ IT IS THE WORKSPACE'S KIND AND NOT THE PLAN'S, and that is the whole point.
 * A plan is what a workspace bought this month and it moves both ways; this is
 * what the workspace IS — who is trading, whose name is over the door, which law
 * applies, and whether its records may sit on a database of their own. Modelling
 * it as a tier would make "are we a business" a thing that lapses with a card.
 *
 * ⚠️ AND IT IS ONE-WAY, DELIBERATELY. Going commercial takes a legal name and a
 * payment, and rolling it back would mean withdrawing a brand a business's own
 * customers have seen, moving records off a shard they were promised, and
 * un-selling capabilities that were paid for once. There is no operation for it
 * — see `mayBecome`.
 */
export type Kind = "personal" | "commercial";

/**
 * ⚠️ ONE WAY, AND ASKED RATHER THAN REMEMBERED. Every write of `kind` goes
 * through this, so "commercial is permanent" is a property of the code instead
 * of a sentence in a document — an UPDATE somebody adds later is a test failure
 * rather than a workspace that quietly became personal again with a brand still
 * on its sign-in page.
 */
export const mayBecome = (from: Kind, to: Kind): boolean =>
  from === "personal" && to === "commercial";

/**
 * ⚠️ WHAT COMMERCIAL BUYS, IN ONE PLACE AND AS QUESTIONS RATHER THAN A LIST. A
 * capability that asked `kind === "commercial"` at its own call site is a
 * capability that can be added without anybody deciding it is a commercial one,
 * and the answer would then differ per screen.
 *
 * ⚠️ AND A PERSONAL WORKSPACE IS NOT A CRIPPLED ONE. It shares a database
 * because sharing is right for it, and it wears OUR marks because it is not
 * trading under anybody's. Neither is a withheld feature to be nagged about.
 */
export const mayBrand = (kind: Kind): boolean => isBusiness(kind);
export const mayIsolate = (kind: Kind): boolean => isBusiness(kind);

/**
 * ⚠️ FOR SAYING WHAT A WORKSPACE IS, NEVER FOR DECIDING WHAT IT MAY DO. A chip
 * beside a name, a column in the console, a sentence in an email — those are
 * labels, and a label asking `mayBrand` would be a screen that renamed itself
 * the day branding moved. Anything that WITHHOLDS asks one of the two above, so
 * that when what commercial buys changes, the capabilities move and the labels
 * do not.
 *
 * ⚠️ AND IT EXISTS SO THE COMPARISON HAS ONE HOME. Left to each screen, the
 * string `"commercial"` would be typed in twenty files, and the day the set of
 * kinds grows the labels would be the ones nobody found.
 */
export const isBusiness = (kind: Kind): boolean => kind === "commercial";

/**
 * HOW MANY COMMERCIAL WORKSPACES AN OPERATOR HAS GIVEN SOMEBODY, AND HOW MANY
 * THEY HAVE SPENT.
 *
 * ⚠️ COUNTED, NEVER A BOOLEAN. "This account may make commercial workspaces" is
 * a switch nobody can revoke without taking away the ones already made; a count
 * is a number that runs out, which is what a comp, a pilot and a partner deal
 * all actually are.
 */
export interface CommercialAllowance {
  readonly granted: number;
  readonly used: number;
}

export const allowanceLeft = (a: CommercialAllowance): number =>
  Math.max(0, a.granted - a.used);

/* --------------------------------------------------------------- the gift --- */

/**
 * SOMETHING AN OPERATOR GAVE A PERSON THAT NOBODY PAID FOR.
 *
 * ⚠️ A CASH CUSTOMER, A FRIEND, A DEMO AND A DEPLOYMENT WITH NO STRIPE KEYS ARE
 * ONE MECHANISM. All four are "this person has X and no card was involved", and
 * building them separately is how three of them end up unrecorded — the money
 * did not move through us, so the only trace is whatever somebody typed.
 *
 * ⚠️ SO IT IS A ROW BEFORE IT IS A CAPABILITY. The gift is what is written; the
 * plan on the workspace and the credits in the wallet are what it PRODUCES. The
 * other order — comp the workspace and remember why in a support thread — is the
 * state this replaces, and it cannot answer "what has this person been given"
 * from anywhere.
 */
export type GiftKind = "plan" | "credits";

export interface Gift {
  readonly id: string;
  readonly kind: GiftKind;
  /** The plan a founded workspace lands on. Empty for a gift of credits. */
  readonly planId: string | null;
  /** How many credits. Zero for a gift of a plan. */
  readonly credits: number;
  /**
   * ⚠️ HOW MANY WORKSPACES IT COVERS, WHICH IS WHY A PLAN GIFT IS A COUNT AND
   * NOT A FLAG. "You are on Max" cannot be taken back from a workspace already
   * founded on it; "you may found two more at Max" simply runs out — the same
   * argument `CommercialAllowance` is built on, one level up.
   */
  readonly workspaces: number;
  /** How many of them have been founded. */
  readonly spent: number;
  /**
   * ⚠️ NULL IS OPEN-ENDED AND IS THE COMMON CASE. Friends and family have no
   * term; a year of cash and a fortnight of demo do. One optional date covers
   * all three, and a required one would make the commonest gift a lie somebody
   * has to type a far-future date into.
   */
  readonly until: string | null;
  /** ⚠️ REQUIRED. The one write in the system that hands out value for nothing. */
  readonly why: string;
  /** ⚠️ WHICH OPERATOR. A gift nobody signed is a gift nobody can ask about. */
  readonly by: string;
  readonly at: string;
  /** ⚠️ When an operator ended it early — see `giftIsLive`. */
  readonly stoppedAt: string | null;
}

/**
 * ⚠️ STOPPED, LAPSED OR SPENT — three ways to be over, and a screen that knew
 * only one of them. A gift is live while an operator has not ended it, its date
 * has not passed, and it has workspaces left to cover; every caller asking two
 * of the three is a caller that hands out one more than was agreed.
 *
 * ⚠️ AND A GIFT OF CREDITS IS SPENT THE MOMENT IT LANDS, which is why `spent`
 * is compared against `workspaces` rather than against a kind. Credits are
 * written with `workspaces: 1`, so one arithmetic answers both.
 */
export const giftIsLive = (g: Gift, now: string): boolean =>
  !g.stoppedAt && g.spent < g.workspaces && (!g.until || g.until > now);

/**
 * ⚠️ WHY IT IS NOT LIVE, BECAUSE "no" IS NOT AN ANSWER SOMEBODY CAN ACT ON. An
 * operator looking at a person who says they were promised something needs to
 * read which of the three happened; a boolean sends them to the database.
 */
export type GiftOver = "stopped" | "lapsed" | "spent" | null;

export const giftOver = (g: Gift, now: string): GiftOver =>
  g.stoppedAt ? "stopped"
    : g.until && g.until <= now ? "lapsed"
      : g.spent >= g.workspaces ? "spent"
        : null;

/**
 * ⚠️ A PLAN GIFT CONFERS THE RIGHT TO FOUND, so it is counted with the bare
 * allowance rather than beside it. Left separate, an operator giving somebody a
 * workspace at Max would have to ALSO remember to raise their commercial count
 * — and forgetting is a person told they may not open the thing they were just
 * given.
 */
export const giftedWorkspaces = (gifts: readonly Gift[], now: string): number =>
  gifts
    .filter((g) => g.kind === "plan" && giftIsLive(g, now))
    .reduce((n, g) => n + (g.workspaces - g.spent), 0);

/* ------------------------------------------------------ becoming commercial --- */

/**
 *   already      it is commercial, and there is nothing to do.
 *   legal_name   nobody may trade under a blank.
 *   unpaid       no payment landed and no allowance was left to spend.
 */
export type CommercialRefusal = "already" | "legal_name" | "unpaid";

export interface BecomeCommercial {
  readonly legalName: string;
  /** Whether a one-time payment for this workspace has settled. */
  readonly paid: boolean;
  readonly allowance: CommercialAllowance;
}

/**
 * Whether this workspace may become commercial.
 *
 * ⚠️ THE ORDER IS WHAT SOMEBODY SHOULD FIX FIRST, and money is last on purpose:
 * taking a payment and then refusing over an empty field is a refund and an
 * apology. Everything a person can correct for free is asked before anything
 * that costs.
 *
 * ⚠️ AND AN ALLOWANCE IS AS GOOD AS A PAYMENT HERE — it is what an operator
 * hands a partner, a pilot or somebody we owe a favour. What it is NOT is a
 * second kind of commercial workspace: what comes out the other side is
 * identical, because a comped business is still a business.
 */
export function refuseCommercial(
  tenant: { readonly kind: Kind },
  ask: BecomeCommercial,
): CommercialRefusal | null {
  if (tenant.kind === "commercial") return "already";
  if (!ask.legalName.trim()) return "legal_name";
  if (!ask.paid && allowanceLeft(ask.allowance) < 1) return "unpaid";
  return null;
}

/**
 * THIS TENANT HAS THIS APP SWITCHED ON.
 *
 * ⚠️ ENABLING A PRODUCT PROVISIONS NOTHING. No worker, no database, no bucket,
 * no domain, no secret — it is this row and the schema that row implies. That is
 * the entire content of "provisioning becomes a feature flag", and it is only
 * true because a tenant is primary (D1) and storage is placed (D5).
 */
export interface Enablement {
  readonly tenantId: TenantId;
  readonly appId: AppId;
  readonly at: Instant;
  /**
   * ⚠️ TURNED OFF IS NOT REMOVED. A business that stops paying for one of our
   * products keeps its records — it has not asked to be forgotten, and erasing
   * on a downgrade is a decision nobody made. What ends is reachability.
   */
  readonly disabledAt: Instant | null;
}

/* ⚠️ AND BOTH QUESTIONS THIS SHAPE INVITES ARE ANSWERED IN SQL, deliberately —
   `liveAppsOfTenant` for what is on, `appsOfTenant` for what a shard must still
   be able to hold. A pure `enabled(row)` and `appsOf(rows)` lived here and were
   reached by nothing: two smaller answers to questions the store already answers
   correctly, which is the shape a kernel export goes wrong in. */


/* ------------------------------------------------------- the placement rule --- */

/**
 * WHETHER A TENANT MAY BE PLACED ON A SHARD.
 *
 * ⚠️ A SHARD'S SCHEMA IS THE UNION OF THE SCHEMAS ITS TENANTS' APPS NEED, and
 * that couples placement to migration: a tenant cannot land somewhere its
 * products' tables do not exist. Discovered late this is a class of outage —
 * every request for the moved tenant answering "no such table" — so it is a rule
 * with a name, asked before a move and before an app is enabled.
 */
export type PlacementRefusal =
  | "schema_missing" | "wrong_residency" | "full" | "someone_elses" | "shared";

export interface Shard {
  readonly id: string;
  readonly where: Residency;
  /** Which apps' schemas this shard has applied. */
  readonly apps: readonly AppId[];
  readonly tenants: number;
  /** What the operator set as this shard's ceiling. Never a hard limit — see below. */
  readonly ceiling: number;
  /**
   * ⚠️ WHOSE SHARD THIS IS, WHERE IT IS SOMEBODY'S. A commercial workspace may
   * have its records on a database and a bucket of their own; this is the row
   * that says so, and it is on the SHARD rather than on the tenant because the
   * question every placement asks is "may this workspace go here", and a fact
   * living only on the arriving tenant cannot answer it about the shard.
   */
  readonly dedicatedTo?: TenantId;
}

/** What a workspace needs of wherever its records land. */
export interface Placing {
  readonly where: Residency;
  readonly apps: readonly AppId[];
  /** ⚠️ Who is arriving. Absent means a placement being checked in the abstract. */
  readonly tenantId?: TenantId;
  /**
   * ⚠️ ASKED, NEVER INFERRED FROM THE KIND. `mayIsolate` says who is ALLOWED to
   * ask; a commercial workspace that has not asked belongs on a shared shard
   * like everybody else, and reading the kind here would silently give every
   * business a database of its own on the day it upgraded.
   */
  readonly alone?: boolean;
}

/**
 * ⚠️ THE CEILING REFUSES A NEW ARRIVAL AND NEVER EVICTS ONE. A shard past its
 * ceiling is a shard that stops *accepting* tenants; the ones already on it keep
 * working exactly as before. The other reading — a ceiling that forces a move —
 * turns a capacity setting into an outage trigger, at whatever hour it happens
 * to be crossed.
 *
 * ⚠️ AND A DEDICATED SHARD IS A PROMISE IN BOTH DIRECTIONS. A stranger placed on
 * one breaks the isolation somebody paid for, silently and permanently — nothing
 * downstream would notice, because both workspaces work perfectly. A workspace
 * that asked to be alone landing on a shared shard is the same broken promise
 * from the other end, so it is refused rather than quietly downgraded.
 */
export function refusePlacement(shard: Shard, wants: Placing): PlacementRefusal | null {
  if (shard.where !== wants.where) return "wrong_residency";
  if (wants.apps.some((app) => !shard.apps.includes(app))) return "schema_missing";
  if (shard.dedicatedTo !== undefined && shard.dedicatedTo !== wants.tenantId) return "someone_elses";
  if (wants.alone && shard.dedicatedTo === undefined) return "shared";
  if (shard.tenants >= shard.ceiling) return "full";
  return null;
}

/**
 * Where a tenant should go, out of what there is.
 *
 * ⚠️ THE EMPTIEST ELIGIBLE SHARD, WHICH IS A CHOICE AND NOT AN OPTIMISATION.
 * Filling one shard before starting the next would keep the number of databases
 * down and put every new tenant — the ones most likely to be evaluating us — on
 * the busiest store we have. Spreading costs a little and means a new customer's
 * first week is on quiet infrastructure.
 */
export function placeOn(shards: readonly Shard[], wants: Placing): Shard | null {
  const able = shards.filter((s) => refusePlacement(s, wants) === null);
  if (able.length === 0) return null;
  return able.reduce((best, s) => (s.tenants < best.tenants ? s : best));
}

/* ------------------------------------------------------------- headroom --- */

/**
 * ⚠️ THE NEXT SHARD IS WANTED BEFORE THE LAST ONE IS FULL, and the margin is the
 * whole point. A database is created, bound, rolled out and only THEN visible to
 * an isolate — a ladder measured in minutes at best — so a rule that reacted at
 * a hundred percent would start building capacity at the moment there was none,
 * and every signup in between is refused. Twenty percent is the room that
 * conversion takes place in.
 */
export const HEADROOM = 0.2;

/**
 * WHICH SHARDS A DEPLOYMENT SHOULD HAVE, GIVEN WHAT IT HAS.
 *
 * ⚠️ WITHOUT THIS, RUNNING OUT OF ROOM IS A CLOSED FRONT DOOR. `placeOn` returns
 * `null` when every eligible shard is at its ceiling and `createTenant` refuses
 * with `nowhere_to_put_it` — so the failure mode of success is that nobody new
 * can sign up, discovered by whoever tried.
 *
 * ⚠️ A DEDICATED SHARD IS NOT CAPACITY. It belongs to one workspace and will
 * never take another, so counting it as room is how a deployment concludes it
 * has plenty while having none — the more customers who pay for isolation, the
 * more confidently wrong the count gets.
 *
 * ⚠️ AND IT NAMES THE SHARD IT WANTS, because a want with no name cannot be
 * matched against what exists — which is how a reconciler creates the same
 * database on every pass. Ordinals are per jurisdiction and never reused: a
 * `SHARD_EU_2` that once existed and was drained is not a name to hand to a
 * different database.
 */
export function shardsWanted(
  shards: readonly Shard[], serves: readonly Residency[],
  /**
   * ⚠️ WHO HAS ASKED FOR A DATABASE OF THEIR OWN AND HAS NOT GOT ONE. Isolation
   * is a shard that has to EXIST before anybody can be moved onto it, so the
   * ask is a reason to build one exactly as running low is — and without this,
   * `Placing.alone` was a parameter nothing set and isolation was an operator
   * reserving an empty shard by hand, on a deployment that had no way to make
   * one empty.
   */
  alone: readonly { readonly where: Residency }[] = [],
): readonly { readonly id: string; readonly where: Residency }[] {
  const out: { id: string; where: Residency }[] = [];
  const taken = new Map<Residency, number>();
  /* ⚠️ Every shard ever seen in a jurisdiction decides its next ordinal,
     dedicated ones included — the name has to be unused, not merely unused BY
     CAPACITY. */
  for (const where of new Set([...serves, ...alone.map((a) => a.where)])) {
    const here = shards.filter((s) => s.where === where);
    const used = here.map((s) => Number(s.id.slice(where.length + 1)))
      .filter((n) => Number.isFinite(n) && n > 0);
    taken.set(where, Math.max(0, ...used));
  }
  const next = (where: Residency): { id: string; where: Residency } => {
    const n = (taken.get(where) ?? 0) + 1;
    taken.set(where, n);
    return { id: `${where}-${n}`, where };
  };

  for (const where of serves) {
    const shared = shards.filter((s) => s.where === where && s.dedicatedTo === undefined);
    if (shared.some((s) => s.tenants <= s.ceiling * (1 - HEADROOM))) continue;
    out.push(next(where));
  }
  /* ⚠️ ONE EACH, AND THEY DO NOT SHARE. Two workspaces asking for isolation want
     two databases; a rule that built one and dedicated it to the first would
     leave the second waiting for ever with nothing reporting why. */
  for (const a of alone) out.push(next(a.where));
  return out;
}


/* ------------------------------------------------------------- standing --- */

/**
 * WHERE A TENANT STANDS WITH US.
 *
 * ⚠️ TWO SEPARATE FACTS, AND CONFLATING THEM IS THE BUG. `writable` is the rung
 * a tenant in arrears sits on — they read everything they have and change
 * nothing. `serving` is further down: we have stopped providing the product, so
 * every ceiling clamps to nothing. A single boolean forces one to imply the
 * other, and then the first missed invoice either takes away too little or
 * withholds a business's own records.
 *
 * ⚠️ AND `reason` IS RENDERED, so it is a sentence rather than a code. Somebody
 * meeting this needs to know what to do about it, and "read_only" is not that.
 */
export interface Standing {
  readonly writable: boolean;
  readonly serving: boolean;
  readonly reason: string;
}

/** ⚠️ The ordinary case, named, so nothing has to spell it out to mean "fine". */
export const IN_GOOD_STANDING: Standing = { writable: true, serving: true, reason: "" };

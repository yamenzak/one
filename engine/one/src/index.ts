/**
 * ONE — THE DEPLOYMENT.
 *
 * ⚠️ ONE WORKER ANSWERS EVERY DOOR FOR EVERY PRODUCT (D3), and this file is the
 * whole of it. Adding a product is a line in `APPS` below and a row in a
 * database — no worker, no domain binding, no provisioning workflow, no secret.
 * The previous platform needed four YAML edits, a registry entry and a workflow
 * run per product, and that machinery existed only because resources were
 * per-app.
 *
 * ⚠️ AND THE WIRING IS THE INTERESTING PART, BECAUSE THERE IS SO LITTLE OF IT.
 * Everything below is a value handed to `serve`: which apps exist, where the
 * records are, who is asking, whether this deployment can take a payment. A
 * deployment that assembled any of it differently would be one where a gate
 * quietly reads something else — which is why `locator` is one function rather
 * than six lookups each caller does for itself.
 */

import type {
  AccountId, AppSpec, DeploymentIdentity, DeploymentLegal, Door, PackDef, PlanSpec, Residency,
  SubProcessorBook, TenantId,
} from "@engine/kernel";
import {
  LADDER, MEDIA_NEED, entitlementKeys, subProcessor, subProcessorText, under, whoWeAre,
} from "@engine/kernel";
import {
  DIRECTORY_MODULES, SHARD_MODULES,
  NOBODY, accountOfToken, addShard, applySchema, appsOfTenant, bearerFrom, acceptanceScope,
  servedVersion, stamped,
  liveAppsOfTenant,
  deploymentFaults, effectivePlans, grownShards, healthOf, isPlatformPath, locator,
  resources,
  accept, bindingKey, jobBookFor, liveBindings, memberFor, noteShardApp, observe, owedBy,
  runnerFor, schedulesOf, shards, sweep, waitingAlone, type SweepDeps,
  tenantById, tenantBySlug,
  applyEvent, becomeCommercial, markCancelled, markPaid, markPastDue, renewAllowance, stripeKey,
  subscribe, topUp, verifySignature,
  webhookSecret,
  disableApp, enableApp,
  operatorOps, permissionsResolver, personalOps, pusherOver, schemaFor, sendMail, serve,
  settleBindings,
  MEMBERSHIP, sessionIdFrom, shardFor, subscriptionFor, whoIs,
  type Bucket, type Db, type MailDeps, type Mailer, type TenantRow,
  configOf,
  DEFAULT_MULTIPLIER,
  modelsOf,
  type LogReader,
  type GatewayAt,
  mockProvider,
  type Searcher,
} from "@engine/runtime";
import { inventory } from "@engine/inventory";

/* ------------------------------------------------------------------ what --- */

/**
 * ⚠️ BUILT AT MOST ONCE, AND NOT UNTIL SOMETHING ASKS. Both halves are the
 * point. Lazy is D4 — a request composes the app it is for and no other, so the
 * catalogue can grow without every cold start paying for it. Once is what makes
 * a manifest a THING rather than a description of one: the composed surface is
 * memoised against the declaration itself, so a thunk that rebuilt it per call
 * would rebuild the whole surface behind it on every request.
 */
const once = (make: () => AppSpec): (() => AppSpec) => {
  let held: AppSpec | null = null;
  return () => (held ??= make());
};

/** The products this deployment serves. */
const APPS: Readonly<Record<string, () => AppSpec>> = {
  /* ⚠️ `under` IS WHERE EVERY PRODUCT INHERITS THE DEPLOYMENT'S SUB-PROCESSORS.
     The database, the bucket and the runtime are the same vendor behind all of
     them; declared per app it is one chance per product to forget, and the
     recipient nobody disclosed is the disclosure failure that gets found from
     outside. See `under`. */
  inventory: once(() => under(LEGAL, inventory())),
};

/**
 * WHICH OF THEM ANYBODY MAY SWITCH ON FOR THEMSELVES.
 *
 * ⚠️ THIS WAS ONE ID, HARDCODED, AND IT DECIDED EVERY WORKSPACE EVER MADE.
 * Founding took `deps.appId` — one app's id — so a person who came for one
 * product founded a workspace holding a different one, and the only way to
 * change it afterwards was to ask an operator to do it in the console.
 *
 * ⚠️ IT IS A LIST OF ITS OWN RATHER THAN `Object.keys(APPS)`, because "served"
 * and "offered" are different questions. A product mid-build stays mounted and
 * answering for the workspaces an operator put it in, and comes out of THIS list
 * — one line, in review, rather than an unmounting that breaks them.
 */
const SELLS: readonly string[] = ["inventory"];

/**
 * ONE MEMBERSHIP — WHAT THIS DEPLOYMENT SELLS, IN ONE LIST.
 *
 * ⚠️ THE PLANS ARE THE DEPLOYMENT'S, NOT A PRODUCT'S, and the limits are the
 * argument. Seats, storage and the wallet are one roster, one bucket and one
 * balance — a per-product plan has to answer "which app does this gigabyte
 * belong to" and there is no honest answer. Apps declare entitlement KEYS; this
 * list sets their VALUES, and `refuseCatalog` fails the build if any plan is
 * silent about a key any app declares.
 *
 * ⚠️ AND BUSINESS IS A TIER RATHER THAN AN ADD-ON. `mayBrand` and `mayIsolate`
 * already gate on the workspace's KIND, so pricing on the kind means the gate
 * and the price agree by construction. A "commercial" entitlement beside them
 * would be a second answer that can disagree with the first — and the kind is
 * one-way (D21), so the two could never be reconciled after they did.
 *
 * ⚠️ THE LOBBY IS NOT A FREE TIER. `none` is where a workspace sits before it
 * ever paid, after a trial ends and after it cancels. It is unsellable, costs
 * nothing, and exists so that "your trial ended" means "read and export your
 * records, and here is how to pay" rather than a locked door. With no free tier
 * it matters MORE, not less.
 *
 * ⚠️ AND STORAGE IS WHERE THE INCLUDED AMOUNT ENDS, NOT A CEILING. Above it the
 * meter draws on the wallet, so there is no cliff between tiers and no "contact
 * us" — a seat and a client are things somebody adds deliberately, so refusing
 * is fair, while storage accumulates as a side effect of ordinary work.
 */
/* ⚠️ Every product's manifest, and `once` above is what makes asking cheap. The
   entitlement KEYS are the union of these and the platform's — see
   `entitlementKeys`. */
const everyApp = () => Object.values(APPS).map((make) => make());

const GB = 1024 * 1024 * 1024;

const PLANS: readonly PlanSpec[] = [
  {
    id: "none", name: "No plan", kind: "personal", order: 0, parking: true,
    said: "Read and export what is here. Nothing new can be added.",
    price: 0, currency: "USD", credits: 0,
    includes: { seats: 1, storage: GB, domains: 0,
      products: 0, locations: 0, processes: false, jobs: false, imports: false },
  },
  {
    id: "solo", name: "Solo", kind: "personal", order: 1, trialDays: 14,
    said: "One person, everything we make.",
    price: 1200, currency: "USD", credits: 1_500,
    /*
      ⚠️ A JOB IS ORDINARY WORK AND A REGULATED RUN IS NOT. Somebody working
      alone has work orders, cases and cooks from the first day; a release rail
      with a named signatory is the compliance feature people pay for, and it
      opens one tier up rather than four — because the single-chair clinic that
      sterilises is exactly the customer a Studio-only gate would exclude.
    */
    /*
      ⚠️ AND AN IMPORT OPENS AT THE FLOOR RATHER THAN AT A TIER THAT PAYS FOR IT.
      Everybody arrives holding a spreadsheet, and a paid plan whose first
      instruction is "now type in your four hundred products" is a plan somebody
      cancels in the trial. It is off on the parking row for the same reason
      everything else is: that row adds nothing.
    */
    includes: { seats: 1, storage: 10 * GB, domains: 0,
      products: 200, locations: 25, processes: false, jobs: true, imports: true },
  },
  {
    id: "plus", name: "Plus", kind: "personal", order: 2, trialDays: 14,
    said: "Room to work, and somebody beside you.",
    price: 2500, currency: "USD", credits: 4_000,
    includes: { seats: 2, storage: 50 * GB, domains: 0,
      products: 1_000, locations: 100, processes: true, jobs: true, imports: true },
  },
  {
    id: "studio", name: "Studio", kind: "commercial", order: 3, trialDays: 14,
    said: "A business: your own name on it, your own address, your own database.",
    price: 4900, currency: "USD", credits: 7_500,
    includes: { seats: 5, storage: 250 * GB, domains: 1,
      products: 10_000, locations: 1_000, processes: true, jobs: true, imports: true },
  },
  {
    id: "company", name: "Company", kind: "commercial", order: 4, trialDays: 14,
    said: "A team, and the room a team needs.",
    price: 19900, currency: "USD", credits: 40_000,
    includes: { seats: 25, storage: 2048 * GB, domains: 3,
      products: -1, locations: -1, processes: true, jobs: true, imports: true },
  },
];

/**
 * ONEWALLET — WHAT A TOP-UP COSTS WHEN THE MONTH'S ALLOWANCE RUNS OUT.
 *
 * ⚠️ THE PACKS ARE THE DEPLOYMENT'S FOR THE SAME REASON THE PLANS ARE. There is
 * one wallet per workspace, so a pack a product declared would top up a shared
 * balance that only that product could sell — and the second product's customers
 * would be told to go and buy credits somewhere else.
 *
 * ⚠️ AND WHAT IS BOUGHT NEVER EXPIRES. The month's allowance lapses because it
 * was free; taking back something somebody paid cash for, on a day they were not
 * looking, is a different act entirely. It is also what makes a top-up safe to
 * buy at any point in the month.
 *
 * ⚠️ THE RATE IMPROVES WITH SIZE AND NEVER BEATS A TIER. A pack that undercut
 * the allowance a plan grants would price the plan out of its own catalogue —
 * somebody would buy the floor and top up for ever, which is the shape of every
 * failed usage-based upsell.
 */
/**
 * WHAT A GIGABYTE-MONTH COSTS ABOVE WHAT A PLAN INCLUDES, IN CREDITS.
 *
 * ⚠️ THERE IS NO CLIFF BETWEEN TIERS AND NO "CONTACT US". A plan's storage is
 * where the meter STARTS, not where the product stops — so the step from 50 GB
 * to 250 GB is a price rather than a wall, and somebody at 60 GB pays for 10
 * rather than being told to buy a business tier.
 *
 * ⚠️ AND IT IS A PRICE, SO IT IS DECLARED HERE. At a credit to the cent this is
 * twenty cents a gigabyte-month against about one and a half to store it —
 * enough margin to be worth running, cheap enough that nobody deletes a
 * photograph over it.
 */
const STORAGE_CREDITS_PER_GB_MONTH = 20;

const PACKS: readonly PackDef[] = [
  { id: "p1", name: "1,000 credits", credits: 1_000, price: 1000, currency: "USD", order: 0 },
  { id: "p5", name: "5,000 credits", credits: 5_000, price: 4500, currency: "USD", order: 1 },
  { id: "p20", name: "20,000 credits", credits: 20_000, price: 16000, currency: "USD", order: 2 },
];

/**
 * ⚠️ THIS DEPLOYMENT'S OWN NAME, WHICH IS ALSO THE WORKER'S. It prefixes every
 * resource this deployment makes for itself, search instances included — so a
 * staging deployment on the same Cloudflare account has its own of everything
 * rather than sharing an index with production, where a query would find live
 * records. One constant, because the reconciler, the reader and the index job
 * all have to compose the same names.
 */
const DEPLOYMENT = "one";

/**
 * ⚠️ THE SHARDS THIS DEPLOYMENT PLACES ON, NAMED ONCE. `addShard` registers them
 * and `deploymentFaults` checks each has a binding behind it, and two lists
 * would let a shard be registered and unchecked — which is precisely the state
 * whoever signed in first would discover.
 */
const SHARDS = [{ id: "eu-1", where: "eu" }] as const satisfies
  readonly { id: string; where: Residency }[];

/**
 * WHERE THIS DEPLOYMENT'S OWN RECORDS SIT WHEN NOTHING NARROWER WAS PROMISED.
 *
 * ⚠️ A DATABASE'S PLACE IS FIXED AT CREATION AND CANNOT BE CHANGED. Cloudflare
 * offers no edit, no migration and no ticket — so one made with no hint lands
 * wherever the thing that created it happened to be, which for a CI runner is
 * another continent. Measured on this deployment before this was declared: every
 * operation was four or five sequential round trips at ~260 ms each, against a
 * worker spending nine milliseconds of CPU. Distance, not work.
 *
 * ⚠️ IT IS A DECLARATION RATHER THAN A DEFAULT IN A WORKFLOW, because it is a
 * FACT ABOUT THIS DEPLOYMENT — where the people who use it are — and the same
 * fact decides the directory's placement, the hint a new shard is made with, and
 * what a guard can check the two against. A default hidden in a shell script is
 * one nobody can see and nothing can compare.
 *
 * ⚠️ AND IT IS NOT A JURISDICTION. A shard whose residency is `eu` is made with
 * `--jurisdiction eu`, which is a PROMISE and which Cloudflare says overrides a
 * hint outright. This applies to the directory — cross-region by nature:
 * accounts, sessions, and which shard a workspace is on — and to any shard
 * promised nothing narrower.
 */
const HOME = "weur";

/**
 * ⚠️ DERIVED, BECAUSE A SHARD *IS* A JURISDICTION. This was a second list beside
 * `SHARDS` — and two parallel lists is the pattern this repository keeps having
 * to fix: a shard added to one and forgotten in the other reports the wrong
 * residency for every workspace on it, which decides whether a queue carrying
 * somebody's name is a broken promise or an ordinary queue.
 */
const SHARD_RESIDENCY: readonly Residency[] = [...new Set(SHARDS.map((s) => s.where))];

/** Which jurisdiction one shard is in. One lookup, one source. */
const residencyOf = (shardId: string): Residency | undefined =>
  SHARDS.find((s) => s.id === shardId)?.where;

/**
 * ⚠️ THE SERVICE BINDINGS SOMETHING ACTUALLY REACHES. Empty is the honest answer
 * today: the AI lane and the notify lane are built and mounted nowhere (stages
 * 27 and 28), so a deployment that binds `AI` is paying for a provider no route
 * can call. Saying so at boot is the difference between finding that in a
 * fifteen-minute read and finding it on an invoice.
 */
const SERVICES_REACHED: readonly string[] = [];

/* ⚠️ THE PLATFORM'S OWN TABLES ARE `@engine/runtime`'S TO LIST, NOT THIS FILE'S.
   Nine copies of that list had drifted — see `platform-schema.ts`. */

/**
 * THE BASE EVERY PRODUCT HERE INHERITS, AND IT IS THE LIST A REGULATOR ASKS FOR.
 *
 * ⚠️ EVERY RECIPIENT, WITH WHAT IT ACTUALLY RECEIVES. `under` intersects this
 * with what each app holds, so a category left out here is a category the trust
 * screen never names — which is a disclosure with a hole in it rather than a
 * shorter disclosure. The register held one entry claiming `none` and
 * `sensitive`, so the company running the databases was disclosed as receiving
 * people's special-category data and NOT their email address.
 *
 * ⚠️ AND WHAT IS NAMED IN A DOCUMENT MUST BE HERE. The privacy notice and the
 * data processing agreement both named the payment processor in prose while it
 * was in no register — so the published list, the record of processing and the
 * trust screen, all three derived from this, disagreed with the words somebody
 * was asked to agree to.
 */
const PROCESSORS: SubProcessorBook = {
  cloudflare: subProcessor({
    id: "cloudflare", name: "Cloudflare, Inc.", country: "US",
    role: "Runs the application, stores its records and files, and carries the email we send you.",
    /* ⚠️ EVERYTHING THIS DEPLOYMENT ACTUALLY HOLDS, BECAUSE IT RUNS EVERYTHING.
       The databases, the object store, the compute and the outbound mail are all
       theirs, so every category passes through them by construction — and a
       category NO app collects is an over-claim rather than a safe margin, which
       `refuseLegal` refuses. `sensitive` belongs here the day a product declares
       a vault field for it, and not before. */
    receives: ["identity", "contact", "usage", "financial"],
    url: "https://www.cloudflare.com/trust-hub/gdpr/",
  }),
  /* ⚠️ NAMED IN TWO DOCUMENTS BEFORE IT WAS EVER IN THE REGISTER. It receives
     what a payment needs — who is paying, how to reach them, and what they
     owe — and never the records inside a workspace. */
  stripe: subProcessor({
    id: "stripe", name: "Stripe, Inc.", country: "US",
    role: "Takes the payments and holds the card details, which never reach us.",
    receives: ["identity", "contact", "financial"],
    url: "https://stripe.com/legal/dpa",
  }),
  /*
    ⚠️ NOBODY IS DECLARED HERE FOR WHERE WE SELL, AND THAT IS A DECISION NOBODY
    HAS TAKEN RATHER THAN ONE TAKEN. This deployment is established in one
    jurisdiction and stores records in another, which is the arrangement that
    normally obliges a controller to name somebody reachable where its customers
    are. Declaring one we have not appointed would put a name in a privacy notice
    that answers no letter, which is the failure this whole file is a catalogue
    of; leaving it out is visibly incomplete, which is the honest half.
    DEFER(engine-48) stage:48 — a representative where this deployment sells, or
    a written decision that selling there does not need one.
  */
  /*
    ⚠️ ONE ENTRY FOR FOUR COMPANIES, BECAUSE WHICH ONE IS YOUR BROWSER'S CHOICE
    AND NOT OURS. A push subscription is issued by whoever makes the browser, and
    a message sent to it passes through them — so somebody switching notifications
    on is adding a recipient, and they are entitled to know that before they do.
    Reached only where the switch is on.
  */
  push: subProcessor({
    id: "push", name: "Your browser's push service (Google, Apple, Microsoft or Mozilla)",
    country: "US",
    role: "Delivers a notification to your device, only if you turn notifications on.",
    receives: ["identity", "usage"],
    url: "https://www.w3.org/TR/push-api/",
  }),
};

/**
 * WHO IS ON THE OTHER SIDE OF EVERY DOCUMENT HERE.
 *
 * ⚠️ DECLARED ONCE, AND EVERY BINDING DOCUMENT ENDS WITH IT (`whoWeAre`).
 * Written into six texts instead, the address is six things to change when it
 * moves, and the one nobody changes is the one somebody writes to.
 *
 * ⚠️ THE LICENCE NAME IS THE PARTY; THE PRODUCT NAME IS WHAT THEY RECOGNISE.
 * A contract naming only the registered entity is correct and unrecognisable —
 * somebody who signed up to One reads a company they have never heard of and
 * cannot tell whether it is the same one.
 *
 * ⚠️ AND THE WORDS BELOW HAVE NOT BEEN READ BY A LAWYER. They are written from
 * the code, so every promise in them is one this deployment actually keeps —
 * which is the half that is usually wrong. The liability position, the warranty
 * position and the transfer mechanics are the ordinary ones for a business of
 * this size rather than anything tuned to this one.
 */
const IDENTITY: DeploymentIdentity | null = {
  entity: "Four Degree Labs",
  tradingAs: "4\u00b0 Labs",
  /* ⚠️ THE EMIRATE, AND NOT YET THE STREET. A data-protection request has to
     have somewhere to go, and a plausible-looking street address would be worse
     than a real jurisdiction and a real mailbox — so this is short rather than
     invented.
     DEFER(engine-48) stage:48 — the address on the licence. */
  address: "Abu Dhabi, United Arab Emirates",
  contact: "legal@fourdegreelabs.com",
  law: "the United Arab Emirates, as applied in the Emirate of Abu Dhabi",
  courts: "Abu Dhabi",
};

/**
 * ⚠️ THE PARAGRAPH THAT NAMES THE COMPANY, APPENDED RATHER THAN TYPED IN EACH.
 * Written into six texts, an address is six things to change when it moves and
 * the one nobody changes is the one somebody writes to.
 */
const binding = (body: string): string =>
  IDENTITY ? `${body.trim()}\n\n${whoWeAre(IDENTITY)}` : body.trim();

/**
 * ⚠️ THE DAY THE WORDING TAKES EFFECT, AND MOVING IT ASKS EVERYBODY AGAIN. That
 * is the feature rather than a cost: editing the text without moving this
 * records everybody who agreed to the old wording as having agreed to the new,
 * which is a record that is confidently wrong rather than merely absent.
 */
const VERSION = "2026-08-21" as never;

/**
 * ⚠️ WHAT THIS DEPLOYMENT PROMISES, AND IT IS THE DEPLOYMENT'S RATHER THAN A
 * PRODUCT'S. One company, one contract, one description of what happens to
 * somebody's data — a person opening the second product here does not sign a
 * second agreement, and four products with four privacy notices is either four
 * copies of one or four that disagree.
 *
 * ⚠️ AND `binds` IS WHEN IT IS ASKED. `person` is every human at their first
 * sign-in; `tenant` is whoever creates a workspace, on its behalf. An app may
 * add its own, and those bind where that app is enabled.
 *
 * ⚠️ THE DUNNING NUMBERS ARE READ FROM `LADDER`, NEVER TYPED. The terms said
 * records "stay readable and exportable throughout" while the ladder withheld
 * the workspace at one rung and destroyed its records at the next — a promise
 * and a behaviour that disagreed, in the one place a customer would quote us.
 * Written from the constant the sweep runs on, they cannot.
 */
const LEGAL: DeploymentLegal = {
  ...(IDENTITY ? { identity: IDENTITY } : {}),
  documents: {
    terms: {
      id: "terms", kind: "terms", title: "Terms of use",
      version: VERSION, mustAccept: true, binds: "person",
      text: binding(`
One is a place to keep your work and the records that go with it. These terms
are the agreement between you and the company that runs this deployment. They
apply from the moment you sign in.

# Your account

You sign in with a code sent to your email address. There is no password, so
access to that inbox is access to your account: keep it secure, and tell us if
you think somebody else has it. You may also mint tokens for software acting on
your behalf; a token can do what you can do, and you can revoke one at any time
from your account.

One account, one person. Sharing it is how somebody ends up seeing records they
were never given access to, and the audit trail will say it was you.

# Your workspaces

A workspace holds records. You may belong to several, and what you can do in
each is decided by whoever runs it — not by us. Someone who invites you into
their workspace decides what you can see; someone you invite into yours is your
decision in the same way.

A personal workspace is yours. A commercial one belongs to the business that
created it, and that business decides who has access to what is in it. If you
leave a commercial workspace, the records in it stay with the business — they
were never yours to take.

# The records you put in

They stay yours. We do not claim any right over them, we do not use them to
train anything, and we do not use them to advertise to you. What we do with
them is run the service you asked for.

You can take a copy of everything held about you, at any time, in a form you can
read elsewhere. It is a button, not a request.

# What you may not do

Do not use One to break the law, to store material you have no right to store,
to send anything to anybody who did not ask for it, or to attack the service or
the people using it. Do not try to reach records that are not yours, or to work
around a limit you were not sold. The acceptable use document says the same at
more length.

If a workspace does one of these we may make it read-only or close it. We will
say which rule and why, and — unless the law stops us, or acting immediately is
the only way to protect somebody — we will say so before we act rather than
afterwards.

# Paying

Plans and prices are shown before you buy and on the workspace's own billing
screen. Payment is taken monthly until you cancel, and cancelling stops the next
one rather than refunding the last. A price change applies from your next
renewal and never to a period you have already paid for.

Some things are metered rather than included, and are drawn from a balance you
can see and top up. A balance you bought does not expire while the workspace
does; an allowance that came with a plan renews with it and does not accumulate.

# When a payment fails

Nothing changes for the first ${LADDER.readOnlyAfter} days. We will tell you.

After ${LADDER.readOnlyAfter} days the workspace becomes read-only: everything is
still there, still readable, still exportable, and nothing new can be written.

After ${LADDER.blockedAfter} days the workspace stops being served. Your own
account, your export and your ability to close things stay open throughout —
paying has to be a way out and not the only one.

After ${LADDER.purgeAfter} days — three months from the first failed payment —
the workspace's records are destroyed. That is not reversible. Anything you take
a copy of before then is yours to keep, and we would much rather you told us
about a problem than let it run that far.

# Ending it

You can leave a workspace, close a workspace, or close your account, at any
time, and take a copy first.

Closing your account destroys your records immediately. There is no waiting
period and nothing to undo, which is exactly why we ask you to prove it is you
before we do it. If you are the only person who could run a workspace, that
workspace is closed and destroyed with you — leaving it behind would make it
unreachable rather than closed, with a bill still running.

# Availability

We do not promise a percentage. What we do promise is that planned interruptions
are announced in the product before they start, and that during one your records
are readable even when they cannot be changed.

# Changes to the service

Products here change. We may add, alter or withdraw a feature. If we withdraw
something you are paying for, you may cancel and we will refund the unused part
of the period.

# Changes to these terms

If these terms change we will ask you again, and the version you agreed to is
recorded against your account with the date. Nothing you already agreed to
changes retroactively, and continuing to use the service is not how you agree —
pressing the button is.

# What we are responsible for

We are responsible for running One with reasonable skill and care, and for
keeping what we say in the privacy notice and in the data processing agreement.

We are not responsible for what you or your colleagues put into a workspace, for
a decision somebody makes on the basis of what is in one, or for a service you
connect to yours yourself.

# What you are responsible for

The records you put in, and having the right to put them there. If somebody
brings a claim against us because of what a workspace of yours holds or does —
material you had no right to store, a law broken with it, a person harmed
through it — you cover what that costs us, as long as we tell you promptly and
let you take it over.

# The service as it is

We do not promise One is free of faults, that it will suit a purpose you have in
mind, or that it will never be interrupted. Where the law would otherwise imply
a promise we have not made, it is excluded as far as the law allows.

# Where the limit is

Apart from the three things in the next paragraph, the most either of us can owe
the other for anything arising out of this agreement is, in total, what you paid
us in the twelve months before the claim. Where you have paid us nothing, that
is nothing. Neither of us owes the other for lost profit, lost business, or a
loss that was not a foreseeable result of what went wrong.

That limit does not apply to death or personal injury caused by negligence, to
fraud, or to anything the law does not allow to be limited.

# Things outside anybody's control

Neither of us is in breach because of something genuinely outside our control —
a network we do not run, a change in the law, a disaster. If it lasts more than
30 days, either of us may end the agreement.

# Telling each other things

We write to you at the address you sign in with, and in the product. You write
to us at the address at the end of this document.

# The rest of it

If part of this agreement turns out to be unenforceable, the rest still stands,
and not enforcing something once does not give it up. You may not transfer this
agreement without our agreement; we may transfer it to whoever takes over the
business, and we will tell you. This document, the privacy notice, the
acceptable use document, and the data processing agreement where it applies, are
the whole of what is agreed between us about One.
`),
    },
    privacy: {
      id: "privacy", kind: "privacy", title: "Privacy notice",
      version: VERSION, mustAccept: true, binds: "person",
      text: binding(`
This explains what One holds about you, why we are allowed to, who else sees it,
and what you can do about it. It covers the service itself. Where a workspace
you belong to holds records about other people, the business running that
workspace decides what is held and why — and the data processing agreement is
the document that covers it.

# What we hold

Your email address, because it is how you sign in, and the account it belongs
to. Which workspaces you belong to and what you can do in each. The records you
or your colleagues put into a workspace. A record of what happened — which
operation ran, in which workspace, by which account, and when — so a workspace
can be audited by whoever runs it. What has been paid and what is owed. If you
turn on notifications, the address your browser gives us to reach that device.

# Why we are allowed to hold it

Your account, your workspaces and their records: because we cannot provide what
you asked for without them.

The audit record and the limits we enforce: because a shared workspace that
cannot say who did what is not safe to share, and because we have to be able to
stop abuse.

What has been paid: because we have to keep it, and because we are required to.

Special categories, and notifications: only where you have said yes, and only
for as long as you have not changed your mind. Both are a switch you control.

# What we do not do

We do not sell anything about you. We do not use your records to advertise to
you, and we do not use them to train models. We do not profile you, and nothing
here makes an automated decision that has a legal or similarly significant
effect on you.

Our operational logs record what happened, not who it happened to.

# Where it is kept

Records are stored in the region the workspace was created for, and stay there.
You are told which region before the workspace exists, and the trust screen in
every workspace names it.

We are established in the United Arab Emirates, so the people who run the
service reach it from there. Where your records are stored in the European
Economic Area, that access is a transfer out of it, and it is made under the
European Commission's standard contractual clauses, which the data processing
agreement carries.

# Who else receives it

The full list, with what each one receives, is published as its own document
here and is assembled from the same declaration the service runs on — so it
cannot quietly fall behind. Today it is the company that runs the infrastructure,
the company that takes the payments, and — only if you switch notifications on —
the push service your own browser uses.

Some of them are established outside the region your records are stored in. Where
that is so, the transfer is made under the standard contractual terms that
regime provides for, and the recipient's own commitments are linked from the
list.

# Special categories

Some products handle information the law treats as special — health, for
example. Where one does, it is stored separately from the rest, encrypted under a
key that belongs to you alone, and destroying that key destroys it. You are asked
before any of it is collected, you are told what each purpose covers, and you can
withdraw at any time. Not every product handles any.

# How long we keep it

Your account and its records: while the account exists.

A workspace's records: while the workspace exists. If it is closed, or destroyed
after ${LADDER.purgeAfter} days of non-payment, they go with it.

The audit record: with the workspace, and it is erased with it.

What was paid: for as long as we are required to keep it, which outlives the
account.

# Cookies and what is stored in your browser

One session cookie, so you stay signed in. A small amount of local storage so
the app can start without asking the server what it already knew. Nothing that
follows you anywhere else, no advertising, no analytics that identify you. There
is no banner because there is nothing to ask you about — the separate cookie
document lists exactly what is set.

# What you can ask for, and how

A copy of everything held about you, in a form you can read elsewhere.
Correction of anything wrong. Deletion of your account and what belongs to it.
Withdrawal of any consent you gave. Restriction, and objection.

Every one of these is a control in the product rather than a request you have to
make and wait for. Where you would rather write to us, the address is at the end
of this document.

# Children

One is not for people under 16, and we do not knowingly hold anything about
somebody who is.

# If you are unhappy

Tell us first, at the address below — we would rather fix it.

You can also complain to a regulator, and you do not need our permission or our
involvement to do it: the UAE Data Office if you are here, or the data
protection authority in your own country if you are in the European Economic
Area or the United Kingdom.
`),
    },
    /* ⚠️ THE BUSINESS ONE IS BOUND BY WHOEVER CREATES THE WORKSPACE, not by
       everybody in it. A colleague invited into a workspace agreed to the terms
       as a person; they did not sign the data-processing agreement, and asking
       them to would be asking somebody to bind a company they do not run. */
    dpa: {
      id: "dpa", kind: "dpa", title: "Data processing agreement",
      version: VERSION, mustAccept: true, binds: "tenant",
      text: binding(`
This applies where your workspace holds records about other people — your
customers, your staff, your clients. You decide what is held and why; we hold it
for you and act on your instructions. In data protection terms you are the
controller and we are your processor. It forms part of the terms of use and is
agreed by whoever creates the workspace, on the workspace's behalf.

# What is being processed

Subject matter: providing the products you have switched on in your workspace.

Duration: for as long as the workspace exists, and it ends when the workspace
does.

Nature and purpose: storing, organising, retrieving, transmitting and erasing
the records you put in, so that the people you give access to can work with
them.

Categories of person: whoever you choose to keep records about — your customers,
your staff, and the colleagues you invite.

Categories of record: whatever the products you enabled collect. Each product
declares its own, and your workspace's trust screen lists them, field by field,
derived from the product itself rather than written out by hand.

# What we do with it

Only what running the service requires, and only what you have asked for. We do
not use your workspace's records for our own purposes, we do not sell them, and
we do not use them to train anything.

If we ever believed an instruction from you broke the law, we would tell you
rather than carry it out quietly.

# Who touches it on our side

Only people who need to in order to run or fix the service, and they are bound
to keep it confidential. Every operation is recorded against the account that
performed it.

# Sub-processors

You agree to the ones on the published list, which is assembled from the same
declaration the service runs on and is a document here rather than a page
somebody maintains. Each is bound by terms no weaker than these, and we remain
responsible to you for what they do.

If we intend to add one or replace one, we will tell you at least 30 days before
it starts, through the workspace's own inbox and by email. If you object within
those 30 days, you may end the agreement and take your records with you; we will
not charge you for the part you have not used.

# Where it is processed

The region your workspace was created for. It is not moved out of it.

We are established in the United Arab Emirates and the sub-processors on the
published list are established in the United States. Where the region your
workspace was created for is in the European Economic Area or the United
Kingdom, reaching it from either place is a transfer out of it. The European
Commission's standard contractual clauses, and the United Kingdom's addendum to
them, are incorporated into this agreement for those transfers, and this
document supplies the details they ask for. The published list links each
sub-processor's own commitments.

# Which law this is written to

Article 28 of the European Union and United Kingdom General Data Protection
Regulation, and the corresponding requirements of the United Arab Emirates'
Federal Decree-Law No. 45 of 2021 on the protection of personal data. If a
regime that applies to you asks for something this does not cover, tell us and
we will agree it.

# Keeping it safe

Access is decided per operation, not per person: what somebody may do is
resolved from their role in that workspace every time they ask, and there is no
path around it.

Records for one workspace are stored apart from another's, and a request that
resolves to a workspace can only reach that workspace's data.

Special categories are held apart from the rest and encrypted under a key
belonging to the person they are about, so that destroying that key destroys
them even where a copy survives.

What happened is recorded — the operation, the workspace, the account and the
time — and the record is the workspace's to read.

Sign-in is a single-use code with a short life, or a token you minted and can
revoke. Anything destructive asks you to prove it is you again, within minutes.

We do not claim a certification we do not hold. If you need one named in a
contract, ask us before you sign rather than after.

# Helping you answer your own people

If one of your customers asks you for a copy of what you hold about them, or
asks you to delete it, the product gives you the controls to answer without
involving us. Where you still need us, we will help, and we will not charge you
for it.

The same applies if a regulator asks you for a record of what is processed and
by whom: it is a screen in your workspace, generated from the declarations,
rather than a document we have to write for you.

# Telling you about a breach

If we become aware of a breach affecting your workspace's records, we will tell
you without undue delay and in any case within 72 hours of becoming aware, with
what we know, what we are doing, and what we suggest you do. We will keep you
updated as we learn more rather than waiting until we have everything.

# Audits

We will answer your reasonable questions about how we do the above, and give you
what we have. Where that is not enough for you, we will agree an audit — once a
year unless something has gone wrong, at your cost, with reasonable notice, and
without exposing another customer's records.

# When it ends

You can export everything at any time, throughout, including while the workspace
is read-only or suspended for non-payment.

When you close the workspace its records are destroyed, and its files with them.
If the workspace is destroyed after ${LADDER.purgeAfter} days of non-payment, the
same happens. There is no archive we keep afterwards.

# If this and the terms disagree

This document wins on anything about the records you hold about other people.
The terms of use win on everything else.
`),
    },
    /*
      ⚠️ NOT `mustAccept`, AND THAT IS NOT A DOWNGRADE. Nothing here is a
      promise somebody gives us — it is a statement of what the browser is asked
      to store, and putting a wall in front of it would be asking for agreement
      to a fact. It is published, linked, and versioned like the rest.
    */
    cookies: {
      id: "cookies", kind: "cookies", title: "Cookies and local storage",
      version: VERSION, mustAccept: false, binds: "person",
      text: binding(`
There is no cookie banner here because there is nothing to ask you about. This
is the whole list.

# What is set

A session cookie, once you sign in, so that you stay signed in. It holds a
reference to a session and nothing about you. It is removed when you sign out,
and it expires on its own.

A small amount of local storage in your browser, holding your theme choice and
enough of what the app last knew to start without a round trip. It never leaves
your device.

If you install One as an app or turn on notifications, your browser stores what
it needs to do that. That is your browser's, not ours.

# What is not set

No advertising cookies. No analytics that identify you. Nothing shared with
another site, and nothing that follows you off this one. No third-party script
runs on these pages at all.
`),
    },
    "acceptable-use": {
      id: "acceptable-use", kind: "acceptable-use", title: "Acceptable use",
      version: VERSION, mustAccept: false, binds: "person",
      text: binding(`
The terms of use say this in a paragraph. This is the same rule at the length
somebody can actually check themselves against.

# Do not break the law with it

Anything illegal where you are or where we are. That includes material you have
no right to hold, and it includes using a workspace to plan something illegal
elsewhere.

# Do not harm other people with it

No harassment, no threats, no material that sexualises children, no content
whose purpose is to make somebody a target. No sending anything to anybody who
did not ask for it.

# Do not attack the service

No attempting to reach records that are not yours, no working around a limit you
were not sold, no probing for weaknesses without asking us first, and nothing
that degrades the service for other people. Automated access is fine and
supported — mint a token and stay within your limits.

If you think you have found a security weakness, tell us. We would rather hear
it from you, we will not take action against somebody who reports one in good
faith, and we will tell you what we did about it.

# Do not misrepresent

Not us, not somebody else, not where a message came from. Do not use a workspace
to imitate a person or a company.

# What happens

We may make a workspace read-only, or close it. We will say which rule and why.
Where we can tell you first we will; where acting immediately is the only way to
protect somebody, we will act and then tell you.
`),
    },
    /*
      ⚠️ WRITTEN BY THE REGISTER, WHICH IS THE ONLY REASON THE DPA MAY PROMISE A
      CURRENT LIST. A list of recipients maintained by hand is accurate the day
      it is typed and drifts the first time a service is added in a hurry — and
      that is not a documentation problem, it is the disclosure failure
      regulators actually find. This is the same declaration the record of
      processing is built from, in sentences.
    */
    "sub-processors": {
      id: "sub-processors", kind: "sub-processors", title: "Who else touches your data",
      version: VERSION, mustAccept: false, binds: "person",
      text: binding(subProcessorText(PROCESSORS,
        "Every company that receives any part of what this service holds, what they do "
        + "with it, and where they are. This list is assembled from the service's own "
        + "declarations rather than written out by hand, so nothing can reach one of them "
        + "without appearing here.")),
    },
  },
  processors: PROCESSORS,
};

export interface Env {
  readonly DIRECTORY: D1Database;
  readonly SHARD_EU_1: D1Database;
  /** The SPA. Served for everything that is not `/api/*` — see `fetch`. */
  readonly ASSETS: { fetch(request: Request): Promise<Response> };
  readonly ROOT: string;
  readonly ENVIRONMENT: string;
  readonly AUTH_SECRET: string;
  /**
   * ⚠️ WHO MAY OPEN THE OPERATOR CONSOLE — comma-separated addresses. Empty in
   * development means the signed-in developer; empty anywhere else means the
   * console admits NOBODY, which is the honest reading of "unconfigured".
   */
  readonly OPERATOR_EMAILS?: string;
  /**
   * ⚠️ THE VAULT'S OWN SECRET, AND ROTATING IT IS DATA LOSS. Every vault fact's
   * key is derived from this and the subject's salt, so a new value does not
   * re-encrypt anything — it makes every fact already stored undecryptable, with
   * no error until somebody reads one. It is deliberately NOT `AUTH_SECRET`,
   * which is rotated as ordinary hygiene: one name for both would have turned a
   * routine security action into the silent loss of every health record on the
   * deployment.
   *
   * ⚠️ ABSENT IS A REFUSAL, NOT A FALLBACK. With no secret an app declaring a
   * special category cannot write one, and the write says so — see `VaultSeam`.
   */
  readonly VAULT_SECRET?: string;
  /**
   * ⚠️ WHAT A STORED CREDENTIAL IS ENCRYPTED UNDER — see `config.ts`. Absent is
   * a deployment that can hold an address and cannot hold a key: the console
   * says so, and every lane behind one stays off rather than running on a value
   * this database would have held in the clear.
   *
   * ⚠️ AND IT IS NOT `VAULT_SECRET`. Rotating this one costs a re-paste of the
   * credentials; rotating that one is the silent loss of every health record on
   * the deployment. One name for both would make an ordinary security action a
   * catastrophe — which is the same argument that split it from `AUTH_SECRET`.
   */
  readonly CONFIG_SECRET?: string;
  /**
   * ⚠️ CLOUDFLARE'S OWN SEND BINDING, AND ITS ABSENCE IS A REFUSAL. A deployment
   * without it cannot send, so it says so rather than answering "check your
   * email" over nothing — see `mail.ts`.
   */
  readonly SEND_EMAIL?: { send(message: unknown): Promise<void> };
  /**
   * ⚠️ THE ACCOUNT TOKEN, AND IT IS A WORKER SECRET RATHER THAN A ROW ON
   * PURPOSE. It can create and destroy this deployment's databases and edit the
   * worker's own bindings; a row holding it is readable by anything that can
   * read the database, and this credential can rewrite what the database IS.
   *
   * ⚠️ SCOPE IT. D1:Edit, Workers KV:Edit, Workers R2:Edit, Queues:Edit and
   * Workers Scripts:Edit are the whole surface `cloudflare.ts` uses. An
   * account-wide token buys nothing here and loses everything if it leaks.
   *
   * ⚠️ ABSENT IS A WORKING DEPLOYMENT. Every declared need stays `wanted`, every
   * capability behind one reads as absent, and nothing fails — which is exactly
   * what a self-host and every test run are.
   */
  readonly CF_API_TOKEN?: string;
  readonly CF_ACCOUNT_ID?: string;
  /**
   * ⚠️ WORKERS AI'S BINDING, AND IT IS HERE FOR ITS GATEWAY HANDLE RATHER THAN
   * TO RUN ANYTHING. Every model call goes out over HTTP to the gateway's
   * `/compat` endpoint — one shape for every provider — and this binding is how
   * a run's real cost is read back out of the gateway's log afterwards. Absent
   * is a deployment that can generate and cannot check its own margin.
   */
  readonly AI?: unknown;
  /**
   * ⚠️ THE SEARCH NAMESPACE, AND IT IS A NAMESPACE RATHER THAN AN INSTANCE ON
   * PURPOSE — see the config. One binding serves every product, and which
   * instance a query goes to is derived from the deployment and the app, so a
   * product becoming searchable needs no binding, no deploy and no edit here.
   */
  readonly AI_SEARCH?: unknown;
  readonly [binding: string]: unknown;
}

/* ------------------------------------------------------------------ boot --- */

/**
 * ⚠️ THE SCHEMA IS APPLIED ONCE PER ISOLATE, NOT PER REQUEST. It is stamped with
 * a hash of itself, so the second call is a single `SELECT` — but doing that on
 * every request would still put a round trip in front of every read for no
 * possible finding.
 *
 * ⚠️ AND IT IS AWAITED RATHER THAN FIRED. A request served while the tables are
 * still being created answers "no such table" to whoever happened to be first,
 * which is a fault that appears exactly once per deploy and never reproduces.
 */
let booted: Promise<void> | null = null;

/**
 * ⚠️ THE LIVE BINDINGS, RESOLVED ONCE PER ISOLATE — and that is correct rather
 * than merely quick. A binding cannot appear or change without a new version of
 * the worker, and a new version is a new isolate, so this map is exactly as
 * fresh as `env` for as long as it exists. Re-reading it per request would put a
 * directory round trip in front of every upload to learn something that cannot
 * have changed.
 */
let live: ReadonlyMap<string, unknown> = new Map();

/**
 * THE BUCKET FOR A WORKSPACE'S JURISDICTION.
 *
 * ⚠️ THE RESIDENCY IS IN THE ADDRESSING, WHICH IS THE WHOLE SAFETY PROPERTY. An
 * EU workspace resolves the EU bucket because its residency is part of the
 * binding's name — so there is no comparison anybody can forget, and a lookup
 * that would land in the wrong regime MISSES rather than serving quietly from
 * it. A miss reads as "this deployment stores no files", which every caller
 * already refuses on.
 *
 * ⚠️ AND IT IS MODULE-LEVEL BECAUSE BOTH LANES NEED IT. The request handler
 * resolves a workspace's bucket; the nightly sweep resolves one to erase its
 * objects. Two copies is two chances for one of them to drop the residency.
 */
const bucketIn = (residency: string | undefined): Bucket | null => {
  for (const appId of Object.keys(APPS)) {
    /* ⚠️ THE EXACT KEY, WITH NO FALLBACK ACROSS JURISDICTIONS. A fallback is
       what turns "we have no bucket here" into "here is one from somewhere
       else" — and the second is a file in the wrong regime that nothing
       reports. A miss is the honest answer, and every caller refuses on it. */
    const held = live.get(bindingKey(appId, MEDIA_NEED, residency ?? null));
    if (held) return held as Bucket;
  }
  return null;
};

/**
 * ⚠️ A DEPLOYMENT WITH NO SIGNING SECRET MUST NOT SERVE. Without it every
 * sign-in code is signed with `undefined` — which is a constant, and a constant
 * anybody reading this repository already has, so the codes are forgeable and
 * nothing anywhere looks wrong. Refusing is loud; the alternative is an
 * authentication system that appears to work.
 *
 * ⚠️ AND IT IS CHECKED AT BOOT RATHER THAN AT THE SIGN-IN ROUTE. A check on the
 * route leaves `/health` answering 200 on a deployment that cannot safely sign
 * anybody in, which is the reverse of what a probe is for.
 */
const REQUIRED: readonly (keyof Env & string)[] = ["ROOT", "AUTH_SECRET"];

/**
 * ⚠️ CHECKED ON EVERY REQUEST, NOT ONCE — and the cost of that is two string
 * reads, against an invariant whose absence is forgeable sign-in codes. Folded
 * into the memoised boot below it becomes order-dependent: whichever
 * configuration reached the isolate first decides for every request after it,
 * and the check is then something that has already happened rather than
 * something that is true.
 */
const missingConfig = (env: Env): readonly string[] =>
  REQUIRED.filter((key) => !String(env[key] ?? "").trim());

/**
 * THE ONE MAIL LANE, AND EVERY SENDER GOES THROUGH IT.
 *
 * ⚠️ THE BINDING IS NAMED IN EXACTLY ONE PLACE, and it is here because this is
 * where the binding is. `@engine/runtime` builds the message and hands over
 * three strings; constructing the platform's own envelope type inside the
 * package would make it unbuildable anywhere that sends nothing — which is every
 * unit test and every self-host.
 */
function mailDeps(env: Env, directory: Db): MailDeps {
  return {
    directory,
    ...(env.CONFIG_SECRET ? { configSecret: env.CONFIG_SECRET } : {}),
    ...(env.SEND_EMAIL
      ? {
        binding: {
          send: async (from: string, to: string, raw: string): Promise<void> => {
            const { EmailMessage } = await import("cloudflare:email");
            await env.SEND_EMAIL!.send(new EmailMessage(from, to, raw));
          },
        },
      }
      : {}),
    environment: env.ENVIRONMENT,
  };
}

/**
 * HOW A NOTIFICATION LEAVES THE PROCESS.
 *
 * ⚠️ THE SAME LANE THE SIGN-IN CODE USES, and that is the whole reason it is
 * built from `sendMail` rather than beside it. A deployment must never be in the
 * state where one of them sends and the other silently does not — which is what
 * two paths to a mailbox produce the first time somebody configures one of them.
 *
 * ⚠️ AND IT SAYS WHETHER IT CAN SEND, so `availableChannels` never offers a
 * channel this deployment has switched off. A send that throws into a swallowed
 * catch is worse than a channel that is not offered: it looks delivered.
 *
 * ⚠️ ABSENT IS A DEPLOYMENT WITH NEITHER A BINDING NOR A MOCK, which is what a
 * self-host is before it configures a sender. The switch is then not drawn at
 * all, rather than drawn and inert.
 */
function mailerFor(env: Env, directory: Db): Mailer | undefined {
  const deps = mailDeps(env, directory);
  if (!deps.binding && env.ENVIRONMENT !== "development") return undefined;
  return {
    async live() {
      /* ⚠️ THE CONFIGURED ANSWER, NOT THE BINDING'S EXISTENCE. An operator who
         switched mail off has said so in one place, and every surface that
         offers an email switch has to read the same answer. */
      const provider = await configOf(directory, env.CONFIG_SECRET, "email.provider");
      return provider !== "off";
    },
    async send(mail) {
      const why = await sendMail(deps, mail);
      /* ⚠️ A THROW, BECAUSE THE CALLER IS A DISPATCH THAT HAS ALREADY FILED THE
         RECORD. It catches per recipient, so one bad address does not stop the
         other thirty-nine being told. */
      if (why) throw new Error(`mail refused: ${why}`);
    },
  };
}

/**
 * WHAT THE NIGHTLY PASS RUNS ON — and what the console runs one job with.
 *
 * ⚠️ ONE DEFINITION, BECAUSE TWO WOULD DRIFT AND THE DRIFT WOULD BE SILENT. The
 * scheduled handler built this inline, so a "Run now" button assembling its own
 * would be a second answer to what a job is handed: the same job, run from the
 * console, against a different set of shards or a different plan catalogue, with
 * nothing anywhere reporting a difference.
 *
 * ⚠️ IT IS `async` FOR ONE REASON — the catalogue. What a workspace was SOLD is
 * a read, not a constant: a sweep on the code's numbers would go on granting
 * last week's credits every night after an edit.
 */
async function sweepDeps(env: Env): Promise<SweepDeps> {
  const directory = env.DIRECTORY as unknown as Db;
  const mailer = mailerFor(env, directory);
  /* ⚠️ Read once per pass rather than per job — see `sweepWithOverrides`. */
  const named = await configOf(directory, env.CONFIG_SECRET, "ai.gateway");
  /* ⚠️ READ ONCE PER PASS, LIKE THE GATEWAY'S NAME. The catalogue sync needs it
     because Cloudflare's own list covers Cloudflare's own models and nothing
     else — see `SweepDeps.googleKey`. */
  const google = await configOf(directory, env.CONFIG_SECRET, "google.api_key");
  return {
    directory,
    shardOf: async (tenantId) => {
      const tenant = await tenantById(directory, tenantId);
      /* ⚠️ Null rather than a throw: a workspace on a shard this deployment
         does not bind is reported by the sweep, not fatal. */
      try { return tenant ? shardFor(env as never, tenant.shardId) : null; }
      catch { return null; }
    },
    apps: APPS,
    /* ⚠️ Retention is a rule about rows: one statement per table per database,
       not one per workspace. */
    shards: SHARDS.map((s) => shardFor(env as never, s.id)),
    /* ⚠️ So the last rung takes the OBJECTS and not only the rows. */
    bucketFor: (where) => bucketIn(where.residency),
    /*
      ⚠️ HOW A NIGHT'S WORK REACHES THE PEOPLE IT IS ABOUT, and it is the same
      inbox a request writes to — the same audience-by-permission, the same
      per-person channel preference, the same push lane. Without it a sweep that
      finds stock expiring on Thursday can only write the number into a run
      record, where the one person who reads it is an operator looking at
      somebody else's shelf.

      ⚠️ `pusher` ALONE, LIKE THE REQUEST SIDE. There is no `mailer` wired
      anywhere yet, and naming a channel this deployment cannot send on is what
      `availableChannels` exists to prevent.
    */
    /*
      ⚠️ AND MAIL IS ITS SIBLING. A sweep that finds stock expiring on Thursday
      and can only write the number into a run record has told nobody — the one
      person who reads a run record is an operator looking at somebody else's
      shelf.
    */
    notify: { pusher: pusherOver(directory), ...(mailer ? { mailer } : {}) },
    /* ⚠️ SO A LETTER CARRIES A WAY BACK. See `SweepDeps.root`. */
    root: env.ROOT,
    /* ⚠️ BY ID, because a move's TARGET shard has no workspace on it yet and
       `shardOf` resolves through the tenant. */
    shardById: (id) => {
      try { return shardFor(env as never, id); } catch { return null; }
    },
    residencyOf,
    /* ⚠️ WHAT A STANDING TOP-UP MAY BUY, and the key it is charged with. A
       deployment that binds neither simply never charges anybody. */
    packs: PACKS,
    /* ⚠️ WHAT IS SOLD, NOT WHAT IS DECLARED — see this function's header. */
    plans: await effectivePlans(directory, PLANS, entitlementKeys(everyApp())),
    storageRate: STORAGE_CREDITS_PER_GB_MONTH,
    /* ⚠️ A CADENCE AN OPERATOR MOVED, READ ONCE PER PASS. The declaration stays
       the authority for the floor, the budget and the failure route. */
    scheduleOf: () => undefined,
    ...(env.CONFIG_SECRET ? { configSecret: env.CONFIG_SECRET } : {}),
    /* ⚠️ SO THE CATALOGUE IS THE WHOLE CATALOGUE — Gemini is not in Cloudflare's
       list, and a deployment with the key set had no row to switch on. */
    googleKey: () => google || null,
    /* ⚠️ ONLY WHERE THERE IS A TOKEN. Absent is a deployment that cannot
       provision, which is a state it has to survive rather than an error — a
       self-host, a test run, and this one before the secret is set. */
    ...(env.CF_API_TOKEN && env.CF_ACCOUNT_ID
      ? {
        reconcile: {
          at: {
            accountId: env.CF_ACCOUNT_ID, token: env.CF_API_TOKEN,
            /* The worker's own name, from its config. */
            script: "one",
          },
          deployment: DEPLOYMENT,
          apps: Object.values(APPS).map((make) => make()),
          serves: [...new Set(SHARD_RESIDENCY)],
          /* ⚠️ WHAT THE DIRECTORY PLACES ON, so the nightly pass builds the next
             shard before the current one fills rather than letting the front
             door close. See `shardsWanted`. */
          shards: () => shards(directory),
          /* ⚠️ AND WHO IS WAITING ON ONE OF THEIR OWN — see `waitingAlone`. An
             isolation request is a reason to build a database exactly as
             running low is. */
          alone: () => waitingAlone(directory),
        },
      }
      : {}),
    /* ⚠️ THE ACCOUNT TOKEN READS THE MODEL CATALOGUE, and it is the SAME
       credential the reconciler holds rather than a second one — both are "this
       deployment acting on its own Cloudflare account". The gateway's token is
       a different thing entirely and lives in the config store. */
    ...(env.CF_API_TOKEN && env.CF_ACCOUNT_ID
      ? { account: () => ({ accountId: env.CF_ACCOUNT_ID!, token: env.CF_API_TOKEN!, script: "one" }) }
      : {}),
    /*
      ⚠️ AND THE GATEWAY BINDING IS WHERE A RUN'S REAL COST IS READ. `env.AI` is
      Workers AI's binding and `.gateway(name)` is the handle on the log — so a
      deployment with the binding but no gateway NAME configured cannot check
      anything, which is why the name is resolved rather than assumed.
    */
    ...(env.AI && named ? { logs: () => aiLogs(env, named) } : {}),
    /* ⚠️ THE SAME NAME THE READER USES. `serve` composes the instance from this
       and the app id; two spellings would be a job filling one index and every
       query reading another, which answers "no results" rather than failing. */
    deployment: DEPLOYMENT,
    multiplier: DEFAULT_MULTIPLIER,
  };
}

/**
 * ⚠️ THE GATEWAY NAME IS CONFIGURATION AND THE BINDING IS NOT. A worker with
 * `ai` in its config always has the binding; whether there is a GATEWAY to point
 * it at is something an operator typed. With no name there is nothing to read a
 * cost from, so the check is simply not in the book — which the console reports
 * rather than a screen quietly showing a margin nobody is measuring.
 */
const aiLogs = (env: Env, gateway: string): LogReader | null => {
  try {
    return (env.AI as unknown as { gateway(id: string): LogReader }).gateway(gateway);
  } catch {
    return null;
  }
};

/**
 * WHERE EVERY MODEL CALL GOES, ASSEMBLED FROM WHAT THE DEPLOYMENT WAS TOLD.
 *
 * ⚠️ THE PROVIDER KEY IS KEYED BY THE PROVIDER'S OWN NAME, because that is what
 * `/compat` addresses a model by. A map with our own spelling in it would be a
 * key that is held, looked up under the wrong name, and never sent — and the
 * symptom is every Gemini call falling through to unified billing and its fee,
 * silently, with everything working.
 */
export async function gatewayAt(env: Env): Promise<GatewayAt | null> {
  const directory = env.DIRECTORY as unknown as Db;
  const secret = env.CONFIG_SECRET;
  const [gateway, token, google] = await Promise.all([
    configOf(directory, secret, "ai.gateway"),
    configOf(directory, secret, "ai.gateway_token"),
    configOf(directory, secret, "google.api_key"),
  ]);
  if (!gateway || !token || !env.CF_ACCOUNT_ID) return null;
  return {
    accountId: env.CF_ACCOUNT_ID, gateway, token,
    ...(google ? { keys: { "google-ai-studio": google } } : {}),
  };
}

/**
 * ⚠️ THE OVERRIDES ARE READ ONCE PER PASS RATHER THAN PER JOB. There are a
 * handful of rows and the alternative is a query inside the loop that decides
 * whether to run each one.
 */
async function sweepWithOverrides(env: Env): Promise<SweepDeps> {
  const base = await sweepDeps(env);
  const moved = await schedulesOf(base.directory);
  return { ...base, scheduleOf: (id) => moved[id] };
}

const boot = (env: Env): Promise<void> => {
  /*
    ⚠️ A FAILED BOOT IS NOT REMEMBERED, AND IT WAS. `booted ??=` caches the
    promise — including a REJECTED one — so a single throw made every request
    that isolate ever served answer 503, for the life of the isolate, with no
    way back but a new version. Whatever the fault was, it is now permanent and
    self-inflicted: a D1 hiccup during the first request of a cold start reads
    exactly like a broken deployment.

    ⚠️ SO THE FAILURE IS FORGOTTEN AND THE SUCCESS IS KEPT. The next request
    tries again — the work is idempotent by construction — and a transient fault
    costs one request rather than an isolate.
  */
  booted ??= (async () => {
    const directory = env.DIRECTORY as unknown as Db;
    const shardModules = [
      ...Object.values(APPS).map((make) => schemaFor(make())),
      ...SHARD_MODULES,
    ];
    /*
      ⚠️ THE DIRECTORY AND THE SHARDS THIS DEPLOYMENT SHIPS WITH, TOGETHER —
      neither waits for the other and neither ever did, but they were awaited in
      turn. A settled database answers `applySchema` in two round trips, so
      doing that twice in sequence is four waits where two would do, on every
      cold isolate, in front of every operation.

      ⚠️ THE GROWN ONES CANNOT JOIN THEM, and that is not an oversight. Which
      shards the reconciler has built is a row in the directory, so finding out
      is itself a trip — and it can only be taken once the directory's own
      schema is there to be read. The shards in `SHARDS` are known at build
      time, which is exactly what makes them free to start with.
    */
    const applied = [...(await Promise.all([
      applySchema(directory, DIRECTORY_MODULES),
      ...SHARDS.map(({ id }) => applySchema(shardFor(env as never, id), shardModules)),
    ])).flat()];
    /*
      ⚠️ EVERY SHARD IN `SHARDS`, NOT ONE NAMED BINDING. This read
      `env.SHARD_EU_1` while `SHARDS` drove registration, so the second shard
      would have been registered, placed on, and never migrated — and the fault
      is not an error anywhere: `placeOn` picks the emptiest eligible shard, so
      the FIRST new workspace lands on it and every request it makes answers
      "no such table". One list, walked.
    */
    /*
      ⚠️ THE SEED SHARDS PLUS THE ONES THE RECONCILER HAS SINCE BUILT. `SHARDS` is
      what ships in `wrangler.jsonc`; capacity beyond it is created by `apply`,
      bound by `patchBindings` and marked live by `observe` — and until this list
      included them, that whole ladder ended in a database nothing placed on.
      A deployment that ran out of room refused signups with the shard it had
      just built sitting empty beside it.
    */
    /*
      ⚠️ READ ONCE, USED TWICE. `settleBindings` reads the same table, and
      letting it do so put a second `SELECT * FROM resource` on the boot path
      one wave after this one.

      ⚠️ AND BESIDE WHAT THE FIRST REQUEST IS ABOUT TO ASK FOR ANYWAY. `settings`
      reads the deployment's keys and its price catalogue, holds them for a
      moment, and is the very next thing every request wants — so starting it
      here costs the boot nothing (it runs beside the ledger) and takes a whole
      wave off the request that follows. It cannot be started any earlier: both
      of these read tables the schema above is there to guarantee.
    */
    const [ledger] = await Promise.all([
      resources(directory),
      settings(env, directory, Date.now()),
    ]);
    const grown = grownShards(ledger, env as never)
      .filter((g) => !SHARDS.some((s) => s.id === g.id))
      .map((g) => ({ id: g.id, where: g.where as Residency }));
    const placeable = [...SHARDS, ...grown];
    /* ⚠️ Only the grown ones are left to apply — the shipped shards went out
       beside the directory above. Together, for the same reason. */
    applied.push(...(await Promise.all(
      grown.map(({ id }) => applySchema(shardFor(env as never, id), shardModules)),
    )).flat());
    /*
      ⚠️ THE SHARD THIS DEPLOYMENT BINDS IS DECLARED AT BOOT, IDEMPOTENTLY. The
      directory places every new workspace on a registered shard — with no row,
      creating one answers "nowhere to put it" on a deployment whose database
      is RIGHT THERE, bound and migrated. Both writes are upserts, so a
      thousand cold starts write what one did.
    */
    /*
      ⚠️ AND ONLY WHEN SOMETHING ACTUALLY CHANGED. These are upserts, so a
      thousand cold starts write what one did — which is the property that makes
      them safe and also the reason they were running on every one of them.
      Two writes is the most expensive thing on this path: a read can be served
      near the request and a write goes to the primary.

      ⚠️ NOTHING RAN MEANS THIS EXACT CONFIGURATION HAS BOOTED BEFORE, so the
      rows are there. A new shard in `SHARDS` brings a database with no modules
      applied, so its schema DOES run and the registration runs with it; the
      only case this skips is a row somebody deleted by hand, which
      `deploymentFaults` reports on the same boot.
    */
    if (applied.some((a) => a.ran)) {
      for (const { id, where } of placeable) await addShard(directory, id, where, 10_000);
      for (const { id: shard } of placeable) {
        for (const id of Object.keys(APPS)) await noteShardApp(directory, shard, id as never);
      }
    }

    /*
      ⚠️ AND THEN WHAT IS WRONG WITH THE DEPLOYMENT, SAID ONCE PER ISOLATE. Every
      fault `deploymentFaults` reports is one a customer would otherwise find:
      a shard placed on and not bound, a collection erasure cannot reach, a
      provider bound and never called.

      ⚠️ LOGGED RATHER THAN REFUSED, AND THAT IS THE DECISION. None of them is
      wrong for EVERY request — a spare binding costs money and breaks nothing,
      and an unbound shard is fatal only for workspaces placed there. Refusing to
      boot over any of them would take a serving deployment down to report a
      cost. What must not happen is silence, and that is what this ends.
    */
    /*
      ⚠️ AND WHAT THE LAST RECONCILIATION ASKED FOR, CONFIRMED BY AN ISOLATE THAT
      CAN ACTUALLY SEE IT. A binding is added by a PATCH that produces a new
      version, so the isolate that asked cannot observe its own request landing;
      this one is running that version. Nothing else in the system knows the
      difference between "we asked for it" and "it is there".
    */
    /* ⚠️ ONE READ OF THE RESOURCE LEDGER FOR THE WHOLE BOOT, not one per
       question — the rows found the grown shards above and settle the bindings
       here. Letting each read for itself is a round trip nobody can see. */
    const settled = await settleBindings(directory, env, ledger);
    for (const said of settled.said) console.log(`[boot] ${said}`);
    live = settled.live;

    for (const fault of deploymentFaults({
      env,
      shards: SHARDS.map((s) => s.id),
      apps: Object.values(APPS).map((make) => make()),
      plans: PLANS,
      packs: PACKS,
      used: SERVICES_REACHED,
      /* ⚠️ EVERYTHING THIS DEPLOYMENT APPLIES, so "is every table in the erasure
         ledger" is asked of what actually exists here rather than of the
         runtime's own modules alone. */
      modules: [
        ...DIRECTORY_MODULES, ...SHARD_MODULES,
        ...Object.values(APPS).map((make) => schemaFor(make())),
      ],
      /* ⚠️ Asked of the DEPLOYMENT, once — see `missingDocuments`. */
      legal: LEGAL,
    })) console.error(`[boot] ${fault}`);
  })().catch((why) => {
    booted = null;
    throw why;
  });
  return booted;
};

/* ----------------------------------------------------------------- wiring --- */

/**
 * WHAT EVERY REQUEST NEEDS BEFORE IT CAN BE ROUTED, AND HOW OFTEN IT IS ASKED.
 *
 * ⚠️ THE HANDLER IS REBUILT PER REQUEST AND IT AWAITED TWO DATABASE READS TO DO
 * IT — the gateway's configuration and the effective plan catalogue, one after
 * the other, before the request had been looked at. That is two round trips in
 * front of every navigation, every save and every poll in the product, buying
 * two values that change when an operator edits them and at no other time.
 *
 * ⚠️ SO THEY ARE READ TOGETHER AND HELD BRIEFLY. Together is free and halves the
 * wait. The hold is what removes it: a burst of requests — which is what opening
 * a screen IS — pays for one read rather than one each.
 *
 * ⚠️ AND THE INVARIANT IS UNCHANGED, WHICH IS WHY A HOLD IS ALLOWED AT ALL. What
 * must be true is that the gate, the shelf and the handler that prices something
 * agree WITHIN one request; a snapshot satisfies that whether it was taken now
 * or ten seconds ago. What is not allowed is two reads either side of a save
 * inside one request, and there is still exactly one.
 */
/* ⚠️ SHORT ON PURPOSE. What this holds includes the PRICE CATALOGUE, so the
   window is the length of time an operator's edit can be invisible to a
   checkout. A burst of requests from one screen opening lands inside two
   seconds; an operator's next action never does. Longer would buy very little
   and would put a stale price on a real money path. */
const A_MOMENT = 2_000;
let held: { at: number; gateway: GatewayAt | null; sold: readonly PlanSpec[] } | null = null;

const settings = async (env: Env, directory: Db, now: number) => {
  if (held && now - held.at < A_MOMENT) return held;
  const [gateway, sold] = await Promise.all([
    gatewayAt(env),
    effectivePlans(directory, PLANS, entitlementKeys(everyApp())),
  ]);
  held = { at: now, gateway, sold };
  return held;
};

const handler = async (env: Env) => {
  const directory = env.DIRECTORY as unknown as Db;

  /*
    ⚠️ WHAT IS ACTUALLY SOLD, RESOLVED ONCE PER REQUEST. `PLANS` is the
    DECLARATION — the authority for which plans exist and which keys each one
    prices, checked at boot by `refuseCatalog`. The console edits the numbers
    over it, so every gate, price and standing resolution below reads the merged
    answer rather than the code's.

    ⚠️ ONCE, RATHER THAN WHEREVER IT IS NEEDED. The gate, the shelf and the
    handler that prices something must agree within one request — two reads
    either side of a save would price a checkout at one number and grant another.
  */
  const { gateway, sold } = await settings(env, directory, Date.now());
  const shardOf = (tenant: TenantRow) => shardFor(env as never, tenant.shardId);
  /* ⚠️ Built once. Two calls would be two objects, and `availableChannels` asks
     one of them whether it is live. */
  const mailer = mailerFor(env, directory);

  /**
   * ⚠️ THE BUCKET FOR THIS WORKSPACE'S JURISDICTION, AND THE RESIDENCY IS IN THE
   * ADDRESSING. An EU workspace resolves the EU bucket because its own residency
   * is part of the binding's name — there is no check to forget, and a workspace
   * cannot be served by a bucket in the wrong regime without the lookup missing
   * entirely, which reads as "no bucket" rather than as the wrong one.
   *
   * ⚠️ NULL IS AN ANSWER. A deployment whose bucket the reconciler has not made
   * live yet stores no files, and every caller already treats that as a refusal
   * rather than a crash.
   */
  const bucketOf = (where: { readonly residency?: string }) => bucketIn(where.residency);

  /*
    ⚠️ WHO RUNS THE DEPLOYMENT, DECIDED ONCE. The console is behind it and the
    OneSpace draws the operator's place from it, and two copies of this rule is how
    a place gets drawn over a console that then refuses every call. The
    development fallback admits the signed-in developer and NOBODY in
    production — an empty allow-list on a live deployment is unconfigured, not
    open.
  */
  const isOperator = (email: string | null): boolean => {
    if (!email) return false;
    const listed = (env.OPERATOR_EMAILS ?? "")
      .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
    if (listed.length) return listed.includes(email.toLowerCase());
    return env.ENVIRONMENT === "development";
  };

  /**
   * ⚠️ WHICH WORKSPACE THE PERSON IS STANDING IN FRONT OF, FROM THE HOST AND
   * NOTHING ELSE. The account centre and the setup door have none, and an
   * agreement asked there is the person's own.
   */
  /**
   * ⚠️ THE WORKSPACE AND ITS SHARD, WHICH IS ALL `placeOf` EVER WANTED. It
   * answered with `tenant.id` alone and `placeOf` read the same row back by that
   * id to find out which shard it was on — a whole round trip, in series, for
   * bytes the caller had just been handed.
   */
  const tenantAtDoor = async (door: Door): Promise<{ id: TenantId; db: Db } | null> => {
    if (door.kind !== "tenant" || !door.slug) return null;
    const row = await tenantBySlug(directory, door.slug);
    return row ? { id: row.id as TenantId, db: shardOf(row) } : null;
  };

  /**
   * WHERE SOMEBODY IS, FOR THE PURPOSE OF AN AGREEMENT — resolved ONCE, and read
   * by both the wall and the screen in front of it.
   *
   * ⚠️ TWO RESOLUTIONS IS A WALL THAT REFUSES WHAT THE SCREEN NEVER OFFERED.
   * The gate asks "what is still owed" per request and the agreements screen
   * asks the same question to draw itself; if they disagree by one document,
   * the person presses everything they are shown and stays shut out with
   * nothing left to press.
   *
   * ⚠️ AND IT WAS THREE ROUND TRIPS IN A ROW, TWO OF WHICH WERE ALREADY IN HAND.
   * `me.who` is the request the opening curtain waits on and it was the deepest
   * one in the product — ten sequential waves, measured — because this read the
   * tenant back by an id its caller had just looked up, then asked for the
   * membership and the live apps one after the other. The workspace and its
   * shard travel together now, and the two reads under them want nothing from
   * each other.
   *
   * ⚠️ AND IT TAKES A SHARD RATHER THAN A ROW, so the caller that already HAS
   * one — every operation, through `Located` — hands it over instead of paying
   * for a lookup to rediscover it.
   */
  const placeOf = async (accountId: AccountId, at: { id: TenantId; db: Db } | null) => {
    if (!at) return {};
    const [member, apps] = await Promise.all([
      memberFor(at.db, at.id, accountId),
      /* ⚠️ Only what is ON is asked about: an agreement demanded for a product
         nobody can reach is a wall with nothing behind it. */
      liveAppsOfTenant(directory, at.id),
    ]);
    return {
      tenantId: at.id,
      /* ⚠️ Only whoever runs the workspace is asked for the workspace's own
         agreement — see `owedBy`. */
      canBind: member?.platformRole === "owner",
      apps: Object.fromEntries(apps.map((id) => [id, APPS[id]?.().documents ?? {}] as const)),
    };
  };

  return serve({
    roots: { root: env.ROOT },
    apps: APPS,
    /*
      ⚠️ WHAT ANYBODY MAY SWITCH ON FOR THEMSELVES, WHICH IS EVERY PRODUCT THIS
      DEPLOYMENT SERVES. It is a separate list from `apps` on purpose — the day
      one of them is half-built, it comes out of here and stays mounted for the
      workspaces an operator put it in.

      ⚠️ AND THE SCHEMA IS ALREADY APPLIED, WHICH IS WHY THIS IS SAFE TO OFFER.
      Every product's tables are built on every shard at boot, so switching one
      on is a row in `tenant_app` and nothing else — no migration on a person's
      request, and no window where the product is on and its tables are not.
    */
    products: {
      sells: () => SELLS,
      /* ⚠️ EVERY REFUSAL TRAVELS BACK, because the caller answers `200` on a
         `true` and a product that is not there on anything less. See
         `Wiring.products`. */
      switchOn: async (tenantId, appId, now) => {
        const app = APPS[appId]?.();
        const tenant = await tenantById(directory, tenantId as never);
        if (!app || !tenant) return false;
        return !await enableApp(
          directory, shardFor(env as never, tenant.shardId),
          tenantId as never, appId as never, schemaFor(app), applySchema, now,
        );
      },
      switchOff: (tenantId, appId, now) =>
        disableApp(directory, tenantId as never, appId as never, now),
    },
    /*
      ⚠️ WHO WE ARE, FOR THE TILES THAT WEAR OUR MARK. A personal workspace is
      not trading under anybody's name, so it installs as ours — and there is no
      honest way to draw that from a hostname, which is why a deployment that
      has not said serves no manifest at all rather than a plausible wrong one.
    */
    installable: { name: "One", mark: "◇" },
    directory,
    shardOf,
    bucketOf,

    /*
      ⚠️ PUSH IS WIRED ONLY WHERE THERE IS A KEYPAIR, AND THAT IS THE WHOLE
      SWITCH. `availableChannels` reads this binding, so an unconfigured
      deployment never OFFERS the channel — the switch is absent rather than
      present and inert, and a note is never dispatched to a lane that would
      throw into a swallowed catch and read as delivered.

      ⚠️ IT IS RESOLVED PER REQUEST RATHER THAN AT BOOT, because the keypair is
      made from the console while the worker is running. Memoised at boot, the
      operator would generate one, see the console report push as live, and find
      every isolate still answering "no push" until the next deploy.

      ⚠️ AND THE KEY LIVES IN THE DIRECTORY RATHER THAN IN A SECRET. A worker
      cannot write its own secrets, so the alternative is a private key an
      operator pastes into a form — through a clipboard, an autofill store and a
      request body. It sits beside the subscriptions it signs for, which are the
      sensitive half and are already there; alone it grants nothing.
    */
    plans: sold, packs: PACKS, storageRate: STORAGE_CREDITS_PER_GB_MONTH,
    pusher: pusherOver(directory),
    /* ⚠️ THE SAME LANE THE SIGN-IN CODE GOES OUT ON — see `mailerFor`. Without
       it a notification reaches an inbox and nowhere else, which for anybody not
       looking at the app is nowhere. */
    ...(mailer ? { mailer } : {}),

    /*
      ⚠️ HOW A MODEL IS ASKED, AND ITS ABSENCE IS AN ANSWER. With no gateway
      configured there is nothing to call, so `ctx.generate` is absent and a
      handler refuses on the seam — rather than every generating request timing
      out against a URL that resolves to nothing.

      ⚠️ THE TAG IS ATTACHED HERE AND NOWHERE ELSE, and it is what makes the
      money checkable: the gateway's own billing is one number for the whole
      deployment unless a call says which workspace, which product and which
      action it was for.
    */
    ...(gateway ? { gateway } : {}),
    /*
      ⚠️ AND LOCALLY, WITH NO GATEWAY, THE MOCK — so `pnpm dev` exercises the
      whole chain rather than refusing on a seam. It is `mockProvider`'s own
      refusal that makes this safe rather than this condition: handed a
      production environment it throws on the first call, which is what keeps a
      misconfigured deploy from fabricating output and billing for it.
    */
    ...(!gateway && env.ENVIRONMENT === "development"
      ? { aiFallback: mockProvider(env.ENVIRONMENT) }
      : {}),
    environment: env.ENVIRONMENT,
    /*
      ⚠️ ONLY WHERE THE NAMESPACE IS BOUND. With no index there is nothing to
      search, so `ctx.find` is absent and the generated find operation says
      search is not on here — which is a sentence somebody can act on, rather
      than every query answering "nothing found" over a working product.
    */
    ...(env.AI_SEARCH
      ? { search: { searcher: env.AI_SEARCH as Searcher, deployment: DEPLOYMENT } }
      : {}),

    ...(env.CONFIG_SECRET ? { configSecret: env.CONFIG_SECRET } : {}),

    /*
      ⚠️ THE ONLY THING THAT STAMPS A PLAN. Nothing a caller can press writes a
      subscription row — a workspace that could would be one that grants itself
      what it has not paid for — so the ladder hangs off a SIGNED event and
      nothing else.

      ⚠️ AND THE REFUSALS ARE DIFFERENT STATUSES ON PURPOSE. A bad signature is
      400 and final: Stripe must not retry a forgery, and retrying would turn one
      bad request into hours of them. An unverifiable deployment — no secret
      stored — is 503, because that IS temporary and ours to fix, and a retry
      after we fix it is exactly what we want.
    */
    payments: {
      answer: async (raw, signature, at) => {
        const deps = {
          directory,
          ...(env.CONFIG_SECRET ? { configSecret: env.CONFIG_SECRET } : {}),
        };
        const secret = await webhookSecret(deps);
        const why = await verifySignature(secret, signature, raw, at);
        if (why === "no_secret") {
          return new Response(JSON.stringify({ refused: why }), {
            status: 503, headers: { "content-type": "application/json" },
          });
        }
        if (why) {
          return new Response(JSON.stringify({ refused: why }), {
            status: 400, headers: { "content-type": "application/json" },
          });
        }

        /* ⚠️ Parsed only AFTER the signature — see `verifySignature`. */
        const event = JSON.parse(raw) as Parameters<typeof applyEvent>[1];
        const did = await applyEvent(directory, event, {
          subscribe: (tenantId, appId, planId) =>
            subscribe(directory, tenantId, appId, planId, "active", at),
          /* ⚠️ A PAID INVOICE IS A PERIOD BEGINNING, so the month's allowance is
             set here and nowhere else. Granting it at checkout instead would
             give a workspace one month's credits and never a second. */
          paid: async (tenantId, appId) => {
            await markPaid(directory, tenantId, appId);
            await renewAllowance(directory, tenantId, PLANS, at);
          },
          pastDue: (tenantId, appId) => markPastDue(directory, tenantId, appId, at),
          cancelled: (tenantId, appId) => markCancelled(directory, tenantId, appId),

          /* ⚠️ THE PACK IS LOOKED UP HERE, NEVER READ OFF THE EVENT. What came
             back is an id; the credits behind it are ours. A count in the
             metadata is a number that made a round trip through the customer's
             browser. */
          bought: async (tenantId, packId, ref) => {
            const pack = PACKS.find((p) => p.id === packId);
            if (!pack) return;
            await topUp(directory, tenantId, pack.credits, `${pack.name}`, { ref }, at);
          },

          /* ⚠️ AND THE ONE-WAY DOOR IS OPENED BY THE MONEY, not by the request
             that started the checkout. `paid` is true here because a signed
             event says it is — which is the only claim in this file that is not
             the caller's. */
          becameBusiness: async (tenantId, legalName) => {
            await becomeCommercial(directory, tenantId, null, { legalName, paid: true }, at);
          },
        }, at);

        /* ⚠️ 200 EVEN FOR A PARKED EVENT. Stripe cannot fix an attribution
           problem by sending the same bytes again, so a retry loop would be days
           of noise over a row somebody has to read either way. */
        return new Response(JSON.stringify(did), {
          status: 200, headers: { "content-type": "application/json" },
        });
      },
    },

    /*
      ⚠️ SENDING IS THE ONE THING A DEPLOYMENT MUST NOT FAKE. In development the
      code goes to the log, which is how the suites and a person on a laptop read
      it; anywhere else, a deployment with no mailer REFUSES to pretend it sent
      something — a sign-in that answers "check your email" with nothing sent is
      a product that appears to work and cannot be used.
    */
    personal: {
      ...personalOps({
        secret: env.AUTH_SECRET,
        sells: () => SELLS,
        documents: LEGAL.documents,
        /* ⚠️ ASKED AT THE DOOR THE PERSON IS STANDING AT. On the account centre
           only what binds the PERSON is owed; at a workspace's own door the
           workspace's agreement and its apps' come with it — and it is the same
           resolution the gate uses, because two would be a wall that refuses
           what the screen never offered. */
        owed: async (ctx) => ctx.session
          ? owedBy(directory, ctx.session.accountId as never, LEGAL.documents,
            await placeOf(ctx.session.accountId as never, await tenantAtDoor(ctx.door)))
          : [],
        accept: async (ctx, document, version) => {
          if (!ctx.session) return;
          const def = LEGAL.documents[document];
          if (!def) return;
          /* ⚠️ THE SCOPE IS DERIVED, NEVER SENT. See `acceptanceScope`. */
          const where = acceptanceScope(def,
            await placeOf(ctx.session.accountId as never, await tenantAtDoor(ctx.door)));
          if (typeof where === "string") return where;
          await accept(directory, ctx.session.accountId as never, document, version,
            where, ctx.now);
        },
        deliver: async (to, code) => {
          const why = await sendMail(mailDeps(env, directory), {
            to,
            subject: `${code} is your sign-in code`,
            /* ⚠️ THE CODE IS IN THE SUBJECT AS WELL AS THE BODY, because that is
               what a phone shows on the lock screen — and typing it from there
               is the whole journey for most people. */
            text: `${code}\n\nIt is good for a few minutes. If you did not ask to sign in, ignore this — nothing happens until the code is used.`,
          });
          /* ⚠️ A REFUSAL IS A THROW HERE, and the caller withdraws the code row
             it had already written. Answering "check your email" over a send
             that did not happen is the failure `mail.ts` exists to refuse, and
             leaving the row behind refuses the next attempt as "too often"
             while nothing was ever delivered. */
          if (why) throw new Error(`mail refused: ${why}`);
        },
        /*
          ⚠️ THE LINK IS BUILT HERE BECAUSE ONLY THE DEPLOYMENT KNOWS ITS ROOT.
          An operation has a `Door`, and on the account side a door carries no
          host — so a letter whose address was guessed in the runtime would point
          somewhere nobody is served, and the person following it would meet a
          404 holding the one token they get this week.

          ⚠️ AND IT IS THE `id.` DOOR, NOT WHEREVER THEY ASKED FROM. The account
          centre is one address across every workspace and product (D20); posting
          somebody back to the workspace they happened to have open would put a
          personal act inside a business's walls.
        */
        deliverExport: async (to, token) => {
          const url = `https://id.${env.ROOT}/space/data?take=${encodeURIComponent(token)}`;
          const why = await sendMail(mailDeps(env, directory), {
            to,
            subject: "Your copy is ready",
            /* ⚠️ WHAT IT IS, HOW LONG IT LASTS, AND WHAT TO DO IF IT WAS NOT
               THEM — in that order, because the third line is the one that
               matters to the only person who did not expect this letter. */
            text: `Open this to download everything we hold about you:\n\n${url}\n\n`
              + `The link works once and expires in a day. You will need to be signed in.\n\n`
              + `If you did not ask for this, ignore it — nothing is sent anywhere `
              + `and nothing changes.`,
          });
          if (why) throw new Error(`mail refused: ${why}`);
        },
        /* ⚠️ The same allow-list the console is behind (D18) — OneSpace draws
           the operator's place from this, and a place drawn over nothing is a
           promise the next screen takes back. */
        isOperator,
        /* ⚠️ THE CATALOGUE, SO A FOUNDING CAN SPEND A GIFT. The plan an operator
           gave somebody is comped onto the workspace they make, and comping onto
           an id with no plan behind it is an empty entitlement set — so the
           application resolves the plan from here rather than from the row. */
        plans: () => PLANS,
        /*
          ⚠️ WHAT EACH WORKSPACE IS ON, INJECTED — the money tables are a module
          a deployment may not have applied. A given workspace says so on the
          screen somebody LANDS on rather than only on a billing page they may
          never open, which is the whole point of giving one.

          ⚠️ AND IT CARRIES THE STANDING, WHICH USED TO BE ASKED PER PRODUCT AND
          COULD NOT BE ANSWERED. `needsAttention` read the subscription with an
          APP's id; the membership moved to the workspace, where the row is filed
          under none — so it matched nothing on every deployment, always answered
          `false`, and the "Needs attention" chip could not appear for a
          workspace whose card had been declined. One membership, one ask.
        */
        membership: async (db, tenantId) => {
          const sub = await subscriptionFor(db, tenantId, MEMBERSHIP);
          if (!sub) return null;
          return {
            planId: sub.planId,
            given: sub.compedAt ? { at: sub.compedAt, until: sub.compedUntil } : null,
            attention: sub.status === "past_due",
          };
        },
      }),
      /*
        ⚠️ THE OPERATOR OPERATIONS RIDE THE PERSONAL LANE, on the operator door
        only, with the deployment deciding who counts. The development fallback
        admits the signed-in developer and NOBODY in production — an empty
        allow-list on a live deployment is unconfigured, not open.
      */
      ...operatorOps({
        apps: APPS, isOperator, plans: PLANS,
        /* ⚠️ THE SAME BOOK THE RUNNER RUNS, AND THE SAME DEPS. A console
           deriving its own list showed the one app job nothing executed and
           hid the seven the deployment does every night. */
        jobs: async () => jobBookFor(await sweepDeps(env)),
        runner: async () => runnerFor(await sweepWithOverrides(env)),
        /* ⚠️ THE CATALOGUE, AND ITS ABSENCE READ AS AN EMPTY ONE. `OperatorDeps`
           defaults `models` to no rows so a deployment that has wired no
           catalogue reports "no lane has anything enabled" instead of throwing —
           correct, and exactly what this console said the day after a sync wrote
           sixty-four rows. A default that degrades honestly is a default nobody
           can see is missing: the screen was right about a catalogue it was
           never given, the run path read the real table, and the two disagreed
           with nothing in between to say so. */
        models: () => modelsOf(directory),
        /* ⚠️ EVERY SHARD, because the index ledger is a table rather than a
           workspace — see `OperatorDeps.shards`. */
        shards: () => SHARDS.map((s) => shardFor(env as never, s.id)),
      /* ⚠️ Absent is a deployment that can hold an address and not a key — the
         console says so, rather than offering a field that saves nothing. */
      ...(env.CONFIG_SECRET ? { configSecret: env.CONFIG_SECRET } : {}),
        deployment: DEPLOYMENT,
        /* ⚠️ The address the VAPID subject is built from — a push service is
           entitled to reach somebody at it. */
        root: env.ROOT,
        serves: [...new Set(SHARD_RESIDENCY)],
        /*
          ⚠️ THE TOKEN COMES FROM `env` AND NEVER FROM A ROW, and this closure is
          the whole of its reach. It can create this deployment's databases and
          add bindings to this worker — so a copy in the directory would be a
          credential that can rewrite what the directory IS, readable by anything
          that can read it. Absent is a deployment that cannot provision, which
          the console reports rather than throwing over.
        */
        account: () => env.CF_API_TOKEN && env.CF_ACCOUNT_ID
          ? { accountId: env.CF_ACCOUNT_ID, token: env.CF_API_TOKEN, script: "one" }
          : null,
      }),
    },

    /*
      ⚠️ ONE FUNCTION FOR THE WHOLE RESOLUTION. The workspace, its shard, its
      standing, what its plan includes, what it has left to spend and what it has
      used — six questions with one right set of answers, every one of which
      feeds a gate.
    */
    locate: locator({
      directory,
      shardOf,
      plans: sold,
      appsOf: async (tenant) => {
        /* ⚠️ WHAT IS ON, NOT WHAT WAS EVER ON. This list becomes the composed
           surface, so a product switched off has to leave it — otherwise the
           switch changes a row and nothing else, and every one of its routes
           goes on answering. The placement question is the OTHER one, and it
           reads every app the workspace has ever had, because the tables and the
           records are still there. */
        const ids = await liveAppsOfTenant(directory, tenant.id);
        return ids.map((id) => APPS[id]?.()).filter((a): a is AppSpec => !!a);
      },
      /*
        ⚠️ THE KEY IN THE STORE, NOT AN ENV VAR, AND IT IS THE SAME KEY THE
        CHECKOUT USES. Two answers to "can this deployment charge" is a gate that
        holds a workspace read-only over an unpaid bill while nothing on the
        deployment could ever have taken the payment — or the reverse, which is
        worse: a live key and a gate that never fires.

        ⚠️ AND GATING "HAS NOT PAID" ON A DEPLOYMENT THAT CANNOT CHARGE strands
        every workspace over OUR misconfiguration. Fail closed on their
        non-payment, open on ours.
      */
      charging: async () => !!await stripeKey({
        directory,
        ...(env.CONFIG_SECRET ? { configSecret: env.CONFIG_SECRET } : {}),
      }),
    }),

    /*
      ⚠️ WHO IS ASKING COMES FROM THE SESSION AND THE WORKSPACE'S OWN ROSTER, and
      never from anything the request said about itself. Resolved per request, so
      a role taken away stops working immediately rather than at the next sign-in
      — which is exactly when it matters that it does.
    */
    ...(String(env.VAULT_SECRET ?? "").trim()
      ? { vaultSecret: String(env.VAULT_SECRET) }
      : {}),
    /*
      ⚠️ THE WALL, AND IT IS ASKED PER REQUEST. A person may agree in one tab
      while another is open, and a version may move under somebody mid-session —
      a value resolved at sign-in would let them work for hours against wording
      they never saw.
    */
    owed: async (who, located) => who.accountId
      ? owedBy(directory, who.accountId as never, LEGAL.documents,
        /*
          ⚠️ NOTHING IS READ HERE, AND THAT IS THE POINT. Every fact the wall
          needs about where somebody is standing has already crossed the wire on
          this request: `Located` carries the workspace and the products it has
          switched on, and the identity carries the roster row it resolved
          permissions from. Asking `placeOf` for them again was two round trips
          in front of every operation in the product — measured as wave two of
          four on an ordinary read — for values one line above it.

          ⚠️ IT IS STILL THE SAME RESOLUTION THE SCREEN GETS. `placeOf` remains
          for the account centre, which has no workspace resolved and must look
          one up; what must agree is the ANSWER, and both build the same three
          fields from the same rows.
        */
        {
          tenantId: located.tenantId as never,
          canBind: who.platformRole === "owner",
          apps: Object.fromEntries(located.apps
            .map((id) => [id, APPS[id]?.().documents ?? {}] as const)),
        })
      : [],
    /* ⚠️ THE SAME BOOK `owed` NAMES, so the consent screen's list and the text
       behind each row cannot be about different documents. Serving it is what
       makes `/legal/<id>` an address rather than a claim. */
    legal: LEGAL,
    identify: async (request, finding) => {
      /*
        ⚠️ TWO WAYS TO SAY WHO YOU ARE, ONE ANSWER TO WHAT YOU MAY DO. A person
        arrives with a session cookie; an agent arrives with a bearer token the
        account minted at the account centre. Both resolve to an ACCOUNT, and
        everything after — the membership, the roles, the permissions — is the
        workspace's own roster answering per request, identically. A token
        never carries `provenAt`: anything a machine can hold must not satisfy
        the `recent` proof gate, which exists against exactly that.
      */
      const now = new Date();
      /*
        ⚠️ THE SESSION IS READ BESIDE THE WORKSPACE, NOT AFTER IT. Neither is an
        input to the other — the cookie says who, the hostname says where — and
        awaiting the workspace first put the whole of `locate` in front of a
        lookup that needed one row of it. `finding` is that one row, which is why
        this seam is handed a promise (see `Wiring.identify`).
      */
      const [saying, located] = await Promise.all([
        saidBy(request, directory, env.AUTH_SECRET, now),
        finding,
      ]);
      const { session, email, accountId } = saying;

      /* ⚠️ A door that resolved to no workspace has no roster to ask, and the
         only honest answer to "what may you do here" is nothing. */
      if (!accountId || !located) return NOBODY;
      const member = await memberFor(located.db, located.tenantId as never, accountId);
      return {
        accountId,
        email,
        signedIn: true,
        provenAt: session?.provenAt ?? null,
        /* ⚠️ Per app (D15) — the flat set this replaced was resolved against
           `located.apps[0]`, so a role in the second product granted nothing. */
        permissionsIn: permissionsResolver(located.db, located.tenantId as never, member,
          (appId) => APPS[appId]?.().access.roles ?? null, now),
        /* ⚠️ FROM THE MEMBERSHIP THE ROSTER READ ONE LINE UP, never re-read. It
           is one column of a row this request already has, and a second query
           for it would be paid by every request in every product to answer a
           question most of them never ask. */
        ...(member ? { reach: member.reach } : {}),
        /* ⚠️ AND SO IS THE OFFICE, FOR THE SAME REASON AND AGAINST THE SAME
           MISTAKE. The wall asks whether this hand can bind the workspace; it
           was answering by reading this row a second time. */
        platformRole: member?.platformRole ?? null,
      };
    },
  });
};

/* ------------------------------------------------------------------ fetch --- */

/**
 * WHO IS ASKING, FROM WHICHEVER OF THE TWO THINGS THEY BROUGHT.
 *
 * ⚠️ ONE FUNCTION SO THE SEAM ABOVE CAN START IT IN A `Promise.all`. A bearer
 * token and a session cookie are the same question with two answers, and pulled
 * apart at the call site the workspace lookup could only be raced against one of
 * them.
 *
 * ⚠️ A TOKEN NEVER CARRIES `provenAt`. Anything a machine can hold must not
 * satisfy the `recent` proof gate, which exists against exactly that.
 */
const saidBy = async (
  request: Request, directory: Db, secret: string, now: Date,
): Promise<{
  readonly session: { readonly provenAt: string | null } | null;
  readonly email: string | null;
  readonly accountId: AccountId | null;
}> => {
  const bearer = bearerFrom(request);
  const account = bearer ? await accountOfToken(directory, bearer, secret, now) : null;
  if (account) return { session: null, email: null, accountId: account };
  if (bearer) return { session: null, email: null, accountId: null };
  return whoIs(directory, sessionIdFrom(request), now);
};

/** ⚠️ The reason goes to the log, where the operator is. The request gets a
    status a probe can act on and nothing about our configuration. */
/**
 * ⚠️ THE TWO FAULTS ARE NOT THE SAME FAULT, AND ONE MESSAGE FOR BOTH COST AN
 * OUTAGE ITS DIAGNOSIS. "One is not configured" was returned when `ROOT` or
 * `AUTH_SECRET` was unset AND when `boot` threw — so a deployment whose schema
 * failed to apply reported a missing environment variable, on every door, and
 * the first thing anybody would check was the one thing that was fine.
 *
 * ⚠️ THE TITLE SAYS WHICH; THE DETAIL STILL GOES TO THE LOG. What a caller gets
 * is a status a probe can act on and the CLASS of fault, never our internals —
 * "it did not start" tells an operator where to look without telling anybody
 * else what we are made of.
 */
/**
 * ⚠️ WORK THAT OUTLIVES THE ANSWER. Cloudflare keeps the isolate alive for
 * anything handed to `waitUntil`; a bare floating promise is not promised
 * anything at all, so warming the boot without this would be a migration that
 * may or may not have finished depending on whether the isolate was evicted.
 */
interface Waiting { waitUntil(p: Promise<unknown>): void }

/**
 * ⚠️ OPTIONAL, BECAUSE A TEST DRIVING THIS MODULE DIRECTLY HAS NO RUNTIME TO
 * SUPPLY ONE. Cloudflare always passes it; a suite calling `worker.fetch(req,
 * env)` does not, and making twenty call sites invent an execution context buys
 * nothing over saying so once. What the fallback must not do is drop the work
 * silently — a warm-up that vanished would be a boot the next request pays for,
 * which is the thing this exists to avoid.
 */
const warming = (ctx: Waiting | undefined, work: Promise<unknown>): void => {
  const quiet = work.catch((why) => { console.error("[boot]", why); });
  if (ctx) ctx.waitUntil(quiet);
  else void quiet;
};

const unavailable = (why: "unconfigured" | "boot"): Response =>
  new Response(
    JSON.stringify({
      problem: {
        code: "platform.unavailable",
        title: why === "unconfigured"
          ? "One is not configured"
          : "One could not start",
      },
    }),
    { status: 503, headers: { "content-type": "application/json; charset=utf-8" } },
  );

export default {
  async fetch(request: Request, env: Env, ctx?: Waiting): Promise<Response> {
    /*
      ⚠️ A DEPLOYMENT THAT CANNOT START SAYS SO ON EVERY PATH, `/health`
      INCLUDED. Letting the throw escape answers 500 with no body — which is
      what a previous platform did for a day behind a green deploy workflow,
      while the page still loaded because static assets never reach the worker.
      The reason goes to the log, where the operator is; the request gets a
      status a probe can act on.
    */
    const unconfigured = missingConfig(env);
    if (unconfigured.length) {
      console.error(
        `[boot] One cannot serve: ${unconfigured.join(", ")} is not set. ` +
        `In development copy engine/one/.dev.vars.example to .dev.vars; in a ` +
        `deployment ROOT is a var and AUTH_SECRET is a worker secret.`,
      );
      return unavailable("unconfigured");
    }

    const url = new URL(request.url);
    /*
      ⚠️ THE API IS THE PLATFORM'S AND EVERYTHING ELSE IS THE PAGE. A single-page
      app owns its own routing, so an unknown path is the SPA's business rather
      than a 404 from here — and `/api/*` is the one prefix that is ours, which
      is why every operation answers under it and nothing else does.
    */
    /* ⚠️ ONE QUESTION, ASKED WHERE THE ANSWER LIVES. This list was written out
       here and the platform's own grew past it: the manifest and the icon are
       served by `serve.ts` and were never routed to it, so a phone asking for
       the manifest got the page with a 200 on it. See `isPlatformPath`. */
    const ours = isPlatformPath(url.pathname);

    /*
      ⚠️ WHICH DOOR THIS IS, BEFORE ANYTHING IS APPLIED TO ANY DATABASE. It is
      four fields read off the hostname and it is the FIRST thing the page asks —
      the spinner that says "Finding this place" is this request — so putting a
      schema runner in front of it meant a person watched a migration to be told
      what their own address was. `healthOf` is the runtime's own; the branch
      inside `serve` calls the same function, so there is still one classifier.
    */
    if (url.pathname === "/health") {
      warming(ctx, boot(env));
      return healthOf(request, { root: env.ROOT });
    }

    /*
      ⚠️ A REQUEST THAT TOUCHES NO DATABASE DOES NOT WAIT FOR ONE, AND THIS IS
      THE LINE THAT MADE THE PRODUCT FEEL SLOW TO OPEN. `boot` applies every
      schema module to the directory and to each shard; it was awaited in front
      of EVERY request, the bundle and the stylesheet included. So a cold isolate
      served nothing at all — not a byte of HTML — until the migration runner had
      finished, and the first thing a person saw was several seconds of blank
      page. Measured on this deployment, that is the whole of "opening it takes
      seven or eight seconds".
      ⚠️ AND IT IS `isPlatformPath` RATHER THAN A SECOND LIST, because a second
      list is the failure this file already carries a warning about: the platform
      grows a path, the copy here does not, and the symptom is served by the SPA
      with a 200 on it. Every path the platform answers reaches D1 — an operation,
      the webhook, the icons, the manifest; the SPA's own files reach none.
    */
    if (ours) {
      try {
        await boot(env);
      } catch (why) {
        console.error("[boot]", why);
        return unavailable("boot");
      }
      /*
        ⚠️ THE VERSION RIDES THE ANSWER SOMEBODY IS ALREADY WAITING FOR. A tab
        left open never learns it was replaced — the bundle it fetched is the
        bundle it keeps, so a fix ships to somebody who will not see it until
        they happen to reload. Stamping every platform answer means the browser
        finds out while it is being used, and costs no request to do it.
      */
      const [answer, version] = await Promise.all([
        (await handler(env))(request),
        servedVersion(env.ASSETS, request.url),
      ]);
      return stamped(answer, version);
    }

    /*
      ⚠️ AND THE COLD START IS PAID WHILE THE BROWSER IS BUSY. The very first
      request of an isolate is almost always the page, and the very next thing
      that happens is a browser downloading and parsing several hundred kilobytes
      of bundle — which is exactly long enough to apply a schema in. Warming it
      here means the first operation the app makes usually finds the work already
      done, instead of being the request that discovers it.

      ⚠️ IT CANNOT FAIL THE REQUEST, AND MUST NOT. A static file has nothing to
      do with the database; `boot` forgets its own failures (see there) so the
      next request retries, and the caller that actually needs D1 is the one that
      reports the fault.
    */
    warming(ctx, boot(env));
    return env.ASSETS.fetch(request);
  },

  /*
    ⚠️ THE CLOCK. Standing climbs the ladder by itself — it is derived from
    `past_due_at` on every read — so the rung that needs a scheduler is the last
    one, and it is the irreversible one: at the ladder's last rung the records
    go. A deletion
    that only happens when somebody visits is a deletion that never happens for
    exactly the workspaces nobody visits.

    ⚠️ AND IT BOOTS FIRST, LIKE A REQUEST. A sweep against a database whose
    tables are half-applied deletes from the ones that exist and reports success.

    ⚠️ THE THROW IS CAUGHT AND LOGGED BECAUSE NOTHING IS LISTENING. A scheduled
    handler has no user, no response and no red test; an uncaught throw here is a
    sweep that stopped months ago and a bill nobody is chasing. `run` records
    every attempt, so the console can show the LAST one rather than the next.
  */
  async scheduled(_event: unknown, env: Env, ctx: Waiting): Promise<void> {
    const work = (async () => {
      try {
        await boot(env);
        await sweep(await sweepWithOverrides(env));
      } catch (why) {
        console.error("[sweep]", why);
      }
    })();
    ctx.waitUntil(work);
    await work;
  },
};

export { APPS, LEGAL, PACKS, PLANS };

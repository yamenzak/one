/**
 * THE PREVIEW, IN THE BROWSER.
 *
 * ⚠️ IT RUNS RATHER THAN RENDERS, and it had to start doing so the moment the
 * screen became a presentation. A dialog is a focus trap, a scroll lock, an
 * Escape key and a return of focus; a save is idle, saving, saved and failed; a
 * keyboard covers a sheet — none of which exists in static markup, so a
 * screenshot of any of it proves the CSS and nothing else.
 *
 * ⚠️ THE DIAL IS BACK, AND THE STATES ARE ALSO IN THE URL. It was removed on the
 * argument that a control floating over the screens is one more thing in every
 * picture the product will never have — which is true of a SCREENSHOT and false of
 * a thing being used: haptics and a sound cannot be photographed, and there is no
 * way to feel a save without a switch to turn it on. Closed, the dial is one small
 * round control in a corner; open, it scrolls. `#state=none&save=server` still
 * works, so a state is still a link.
 *
 * ⚠️ AND IT IS STILL ONE FILE. The bundle, the sheets and the fonts are inlined
 * into a single document — there is nowhere beside it to put anything, and an
 * external reference there does not fail loudly, it silently falls back.
 *
 * ⚠️ NOT SHIPPED CODE. Nothing in `src` may import this.
 */

import { useEffect, useState, type ElementType } from "react";
import { createRoot } from "react-dom/client";
import type { Problem } from "@one/kernel";
import { Hub } from "../src/hub/hub.js";
import { AccountDetails } from "../src/hub/details.js";
import { HubHome, type HubHomeProps } from "../src/hub/home.js";
import { AccountScreen } from "../src/hub/account.js";
import { WorkspacesScreen } from "../src/hub/workspaces.js";
import { PreferencesScreen, type Preferences } from "../src/hub/preferences.js";
import { KeptHere, meaning, VaultScreen, type Kept, type Looked, type Where as VaultWhere } from "../src/hub/vault.js";
import { LegalScreen, MustAcceptScreen, ProductScreen, ReceivingScreen, RecipientScreen, DocScreen, type Owed } from "../src/hub/legal.js";
import { ExportScreen, type Taken } from "../src/hub/export.js";
import { CloseAccountScreen } from "../src/hub/close.js";
import { keyOf, parseWhere, pathOf, upFrom, type Where } from "../src/hub/routes.js";
import type { Doc, Product } from "../src/hub/wire.js";
import { accountReceiving, transfersOf, type Held, type Instant, type Receiving, type Subprocessor } from "@one/kernel";
import { DEPLOYMENT } from "@one/deployment";
import { ValueEditor, type EditableField } from "../src/editor.js";
import { Card, Entry } from "../src/list.js";
import { Edit } from "../src/icon.js";
import { AskForIt, ConsentSheet, type Asked } from "../src/consent.js";
import { Door, type DoorWire } from "../src/door.js";
import { SetupScreen, type Place } from "../src/setup.js";
import { MarketScreen, ShelfScreen, type Sellable } from "../src/hub/market.js";
import { PlanScreen, type Holding } from "../src/hub/plan.js";
import { WorkspaceScreen, type Resolved } from "../src/hub/workspace.js";
import {
  ConsoleScreen, KeysScreen, CatalogueScreen, TenantsScreen, MaintenanceScreen, ModelsScreen, MODES,
  type Key as ConfigKey, type Model, type Tenant,
} from "../src/hub/console.js";
import { AiScreen, type Action } from "../src/hub/ai.js";
import { PeopleScreen, type Member, type Role } from "../src/hub/people.js";
import { InboxScreen, NoticeChoices, type Notice, type Reaching } from "../src/hub/inbox.js";
import { NoticePolicyScreen, type Policy as NoticePolicy } from "../src/hub/notices.js";
import { SettingsScreen } from "../src/hub/settings.js";
import type { Declaration } from "../src/hub/declared.js";
import type { Plan } from "../src/hub/offer.js";
import { CreditsScreen, type Balance, type Movement, type Pack } from "../src/hub/credits.js";
import { ProveIt } from "../src/prove.js";
import type { Ceremony } from "../src/passkey.js";
import { SignInMethods } from "../src/hub/signin.js";
import { Stack } from "../src/stack.js";
import { configureFeedback, feel, FEEDBACK_DEFAULT } from "../src/feedback.js";

/* ⚠️ BAKED AT BUILD TIME BY `dev/page.tsx`, standing in for the route that will
   serve a generated face from a seed. Keyed the way the API will key it: a
   workspace by its id, a person by the name they are known here by. */
declare const __FACES__: Readonly<Record<string, string>>;
const face = (seed: string): string | undefined => __FACES__[seed];
/* ⚠️ THE STILL ONE, FOR CHIPS. A generated face breathes, which reads as alive at
   44 pixels beside a name and as a twitch at 22 inside a sentence — three of them
   in one paragraph is a page that will not sit still while somebody reads it. The
   animation is a `<style>` inside the SVG, so it cannot be turned off by CSS: a
   still face is a different picture, which the API will serve as a second URL. */
const still = (seed: string): string | undefined => __FACES__[`still:${seed}`];

/* ⚠️ ONE PERSON, PLAUSIBLE, WITH A REAL SPREAD ACROSS PRODUCTS. Lorem in a screen
   review is a way of not looking at it: names are what overflows, roles are what
   repeats, and a workspace in trouble is the row the layout exists to surface. */
const FULL = {
  person: { name: "Nadia Haddad", email: "nadia@haddadstrength.com", avatarUrl: face("Nadia Haddad") },
  workspaces: [
    { tenantId: "t1", slug: "haddad", name: "Haddad Strength", product: "kova", role: "Owner", face: face("t1") },
    { tenantId: "t2", slug: "barre", name: "Beirut Barre Collective", product: "kova", role: "Coach", face: face("t2") },
    { tenantId: "t3", slug: "corniche", name: "Corniche Screens", product: "scena", role: "Owner", face: face("t3"), standing: { label: "Payment failed", urgent: true } },
    { tenantId: "t4", slug: "clinic", name: "Haddad Clinic", product: "tessa", role: "Member", face: face("t4"), standing: { label: "Trial · 6 days", urgent: false } },
  ],
} satisfies Pick<HubHomeProps, "person" | "workspaces">;

/*
  ⚠️ THE STATES ARE REACHABLE, NOT DESCRIBED. Not-answered-yet and
  answered-and-empty are different screens, and the second is the one a product
  ships without ever looking at — it is what a new person sees first.
  `#state=none` · `#state=waiting` · `#state=new`
*/
const CASES = {
  four: FULL,
  none: { ...FULL, workspaces: [] },
  waiting: { ...FULL, workspaces: null },
  new: { person: { email: "b.okonkwo@gmail.com", avatarUrl: face("b.okonkwo@gmail.com") }, workspaces: [] },
} satisfies Record<string, Pick<HubHomeProps, "person" | "workspaces">>;

/*
  ⚠️ THE FAILURES ARE REAL `Problem`s, not strings pretending. A per-field message
  and a general one are placed differently, read differently and are recovered
  from differently — so a preview that only ever shows one of them is a preview of
  half the design.  `#save=field` · `#save=server`
*/
const OUTCOMES = {
  ok: null,
  field: {
    code: "identity.email_taken", status: 409, retryable: false, ref: "req_8fd12c",
    title: "That address is already in use",
    fields: { email: "Someone already signs in with this address.", name: "That name is not available." },
  },
  server: {
    code: "platform.unavailable", status: 503, retryable: true, ref: "req_31ba07",
    title: "Something went wrong on our side",
    detail: "We could not reach the identity store. Nothing was changed.",
  },
} satisfies Record<string, Problem | null>;

/*
  ⚠️ ONE FACT SHARED, ONE HELD AND UNSHARED, ONE NOT RECORDED AT ALL — the three
  rows that render differently, because a fixture where everything is shared is a
  picture of one state.
*/
/*
  ⚠️ ONE WORKSPACE SHARING SOME OF WHAT IT ASKED FOR, one sharing none, and a
  fact nobody has asked for at all — the three shapes that render differently. A
  fixture where every workspace looks the same is a picture of one state.

  ⚠️ AND IT IS SHAPED LIKE A MANIFEST, because that is where it comes from. Every
  `why`, every `recommend` and every reading below is copied from a declaration in
  the real thing; the screen writes none of it.
*/
/* ⚠️ THE SAME TWO LISTS THE KERNEL DERIVES, so a fixture cannot show a control
   the real resolver would never offer. A DERIVED want takes the compute one: the
   arithmetic runs server-side and the app never sees the value, so it is offered
   no rung it could not spend. */
const RUNGS_COMPUTE = ["self", "compute"] as const;
const RUNGS_RAW = ["self", "compute", "agent", "staff"] as const;

const VAULT_WHERES: readonly VaultWhere[] = [
  {
    appId: "kova", appName: "Kova", tenantId: "t1", name: "Haddad Strength",
    face: face("t1"), product: "kova",
    items: [
      {
        fact: "goal.training", label: "Your goal", need: "raw", asks: "staff", rungs: RUNGS_RAW,
        why: "Your coach writes your programme against this.",
        required: true, reach: "staff", granted: true, expiresAt: "1 December",
        held: true, recommend: "staff", categories: [], readings: [],
        because: "The one thing somebody helping you genuinely cannot plan without.",
      },
      {
        fact: "body.height", label: "Height", need: "compute", asks: "compute", rungs: RUNGS_COMPUTE,
        why: "Used with your weight to work out an energy target and a body-mass index.",
        required: false, reach: "compute", granted: true, expiresAt: null,
        held: true, recommend: "self", categories: [], readings: [],
        because: "Only needed to work out an energy target, which the platform can do without showing it.",
      },
      {
        fact: "body.mass", label: "Weight", need: "derived", asks: "compute", rungs: RUNGS_COMPUTE,
        why: "Used to work out your energy target, and to show your coach which way things are going.",
        required: false, reach: "self", granted: false, expiresAt: null,
        held: true, recommend: "self", categories: [],
        because: "Somebody helping you can plan from the change without ever seeing the number.",
        readings: [
          /* ⚠️ THE READING IS SHARED WHILE THE NUMBER IS NOT — the state the whole
             derived idea exists for, and the one a fixture that granted both
             would never show. */
          { id: "body.mass.trend", label: "Weight trend", from: ["body.mass"],
            says: "Which way it is going, and how fast, over the last few weeks.",
            hides: "Every absolute weight — a direction and a rate, with no starting point to add them to.",
            asks: "staff", rungs: RUNGS_RAW, reach: "staff", granted: true, expiresAt: null },
        ],
      },
      {
        fact: "health.injuries", label: "Injuries", need: "raw", asks: "staff", rungs: RUNGS_RAW,
        why: "So a programme does not ask you to do something that hurts.",
        required: false, reach: "self", granted: false, expiresAt: null,
        held: false, recommend: "staff", categories: [], readings: [],
      },
      {
        fact: "person.sex", label: "Sex at birth", need: "compute", asks: "compute", rungs: RUNGS_COMPUTE,
        why: "Changes the energy-target arithmetic and nothing else.",
        required: false, reach: "self", granted: false, expiresAt: null,
        held: true, recommend: "self", categories: [], readings: [],
        because: "The arithmetic needs it; nobody there does.",
      },
    ],
  },
  {
    appId: "kova", appName: "Kova", tenantId: "t2", name: "Beirut Barre Collective",
    face: face("t2"), product: "kova",
    items: [
      {
        fact: "goal.training", label: "Your goal", need: "raw", asks: "staff", rungs: RUNGS_RAW,
        why: "Your coach writes your programme against this.",
        required: true, reach: "self", granted: false, expiresAt: null,
        held: true, recommend: "staff", categories: [], readings: [],
        because: "The one thing somebody helping you genuinely cannot plan without.",
      },
      {
        fact: "health.allergies", label: "Allergies", need: "raw", asks: "staff", rungs: RUNGS_RAW,
        why: "So nothing they suggest contains something you react to.",
        required: false, reach: "self", granted: false, expiresAt: null,
        held: false, recommend: "staff", categories: [], readings: [],
      },
    ],
  },
];

/* ⚠️ RECORDED AND WANTED BY NOBODY — the row that proves the vault is yours
   rather than an app's. It is what somebody who has left every workspace sees. */
/*
  ⚠️ TYPED AS `Doc` AND `Receiving`, WHICH CARRY THE KERNEL'S OWN SHAPES. The
  version of this fixture that preceded it invented `purpose`, `region` and
  `basis` and was believed because the screen was written to match — so the
  screenshots were photographs of a fiction. Nothing here can drift now without
  failing to compile.

  ⚠️ ONE OUTSTANDING DOCUMENT, ONE ACCEPTED AT AN OLDER VERSION, ONE CURRENT and
  one required of somebody else — the four things the detail line can say.
*/
const HELLO_DOCS: readonly Doc[] = [
  {
    doc: {
      id: "terms", version: "4", title: "Terms of service", mustAccept: ["owner", "member"],
      body: "You may use this product for what it is for.\n\nWe will keep it running, tell you when it changes, and let you take your things and leave at any time.\n\nIf you stop paying we stop serving the product. We do not hold your records over an invoice.",
    },
    acceptedOn: "2 March", outstanding: false,
  },
  {
    /* ⚠️ Accepted before, at a version no longer being asked about — what
       everybody sees the day terms change, and the state a boolean loses. */
    doc: {
      id: "privacy", version: "3", title: "Privacy notice", mustAccept: ["owner", "member"],
      body: "We hold what you give us and what you make while using this.\n\nWe do not sell it. We do not use it to train anything. Where a model is involved we name what is sent to it, on the screen you are reading now.\n\nYou can take all of it, or ask for all of it to be forgotten, from your account.",
      url: "https://example.test/privacy",
      /* ⚠️ THE ONE STATE VERSIONING EXISTS FOR. Somebody who accepted version 3
         is being re-asked, and without this they are shown the same wall of text
         with a different number on it. */
      changed: "A model may now be involved in generating an answer, and this says which one and what reaches it. Nothing else moved.",
    },
    acceptedOn: "2 March", outstanding: true,
  },
  {
    doc: { id: "processing", version: "2", title: "Data processing agreement", mustAccept: ["operator"], url: "https://example.test/dpa" },
    acceptedOn: null, outstanding: false,
  },
  {
    doc: { id: "cookies", version: "1", title: "Cookies", mustAccept: ["owner", "member"], body: "One cookie, for staying signed in. Nothing measures you." },
    acceptedOn: null, outstanding: true,
  },
];

/*
  ⚠️ THE PLATFORM'S OWN PROCESSORS, IMPORTED RATHER THAN INVENTED. Every company
  on this screen is one this deployment actually uses, named as it names itself,
  with the link to its OWN processing terms — because a disclosure fixture states
  who holds somebody's data and under what, and a plausible-looking invention
  there is a false claim about a real business, one copy-and-paste from a screen.

  ⚠️ AND IT COMES FROM THE DECLARATION, NOT FROM A COPY OF IT. `@one/deployment`
  is what every worker passes to the runtime; the preview reads the same object,
  so a processor added there appears here without this file being opened, and one
  removed cannot linger in a picture.
*/
const ACCOUNT_DOCS: readonly Doc[] = DEPLOYMENT.legal.map((doc, i) => ({
  doc,
  /* ⚠️ ONE ACCEPTED AND ONE NOT, so both states of the real documents are drawn.
     Which is which is positional rather than by id: the ids are the deployment's
     and this file must not be the thing that has to change when they do. */
  acceptedOn: i === 0 ? "2 March" : null,
  outstanding: i !== 0,
}));

/*
  ⚠️ A PRODUCT'S OWN RECIPIENTS, ON TOP OF THE PLATFORM'S. This is exactly what
  `receivingOf` assembles at runtime — the deployment's list with the app's merged
  over it — and the two extra entries are the ones Kova's manifest really
  declares, with their real roles and their real DPA addresses.
*/
const PRODUCT_SUBPROCESSORS: readonly Subprocessor[] = [
  ...DEPLOYMENT.subprocessors,
  {
    id: "gemini",
    name: "Google (Gemini API)",
    mark: "google",
    role: "Runs the generation when a model outside our own network is the one that can do it.",
    does: "Runs models",
    receives: ["content", "health"],
    where: "Google's infrastructure, outside the union.",
    safeguard: "sccs",
    terms: "https://cloud.google.com/terms/data-processing-addendum",
    trust: "https://cloud.google.com/security/compliance",
  },
  {
    id: "stripe",
    name: "Stripe, Inc.",
    mark: "stripe",
    role: "Takes a workspace's payment for its own plan. Never involved in what a workspace charges anybody else.",
    does: "Takes payment",
    receives: ["identity", "contact", "financial"],
    where: "United States and Ireland.",
    safeguard: "dpf",
    terms: "https://stripe.com/legal/dpa",
    trust: "https://stripe.com/docs/security",
  },
];

/*
  ⚠️ WHAT THE EXAMPLE PRODUCT HOLDS — the other half `transfersOf` crosses. The
  categories are the ones a coaching product genuinely declares, which is what
  makes the sensitive mark on the row above real rather than decorative.
*/
const PRODUCT_HELD: readonly Held[] = [
  { id: "people", fields: {}, retention: { days: null, onTenantClose: "export-then-purge" },
    holding: { kind: "personal", categories: ["identity", "contact", "usage"], subjects: ["member"], purpose: "Who is in this workspace.", basis: "contract" } },
  { id: "entries", fields: {}, retention: { days: null, onTenantClose: "export-then-purge" },
    holding: { kind: "personal", categories: ["content", "health", "financial"], subjects: ["member", "customer"], purpose: "What somebody records about themselves.", basis: "consent", condition: "explicit_consent" } },
];

const PRODUCT_RECEIVING: Receiving = {
  controller: DEPLOYMENT.controller,
  contact: DEPLOYMENT.contact,
  /* ⚠️ THE REGIONS A PRODUCT OFFERS, WHICH IS WHAT THE FIELD MEANS. Both of them
     are named in the kernel, so the screen shows the names rather than the ids. */
  regions: ["auto", "eu"],
  subprocessors: PRODUCT_SUBPROCESSORS,
  inference: { ai: { auto: ["gemini"], eu: [] } },
  /*
    ⚠️ DERIVED BY THE KERNEL, NOT TYPED HERE. `transfersOf` crosses what this
    product HOLDS with what each recipient claims to receive, so a hand-written
    list can show a company receiving a category the app does not have — or, as
    the first attempt did, two transfers against three recipients, which made the
    summary read "2 of 2" and mean nothing.
  */
  transfers: transfersOf({ collections: PRODUCT_HELD, subprocessors: PRODUCT_SUBPROCESSORS }),
};

/* ⚠️ THE ACCOUNT, THEN TWO PRODUCTS, because one product is a picture of the
   state where the grouping does not matter. The third asks nothing outstanding,
   which is what most products a person belongs to look like. */
const LEGAL_PRODUCTS: readonly Product[] = [
  /* ⚠️ AN EMPTY `appId` IS HOW THE RUNTIME SAYS "THIS IS THE DEPLOYMENT", and the
     disclosure is the kernel's own projection of the declaration — the same
     function `legal.mine` answers with. */
  { appId: "", appName: DEPLOYMENT.name, roles: ["account"], docs: ACCOUNT_DOCS, receiving: accountReceiving(DEPLOYMENT) },
  { appId: "kova", appName: "Kova", roles: ["client", "owner"], docs: HELLO_DOCS, receiving: PRODUCT_RECEIVING },
  {
    appId: "scena", appName: "Scena", roles: ["owner"],
    docs: [{
      doc: { id: "terms", version: "2", title: "Terms of service", mustAccept: ["owner"], body: "Short and unremarkable." },
      acceptedOn: "11 May", outstanding: false,
    }],
    /* ⚠️ A PRODUCT WHOSE DISCLOSURE HAS NOT PUBLISHED YET — a real state once a
       row predates the column, and the one the screen must not render as
       "nobody is responsible". */
    receiving: null,
  },
];


const VAULT_KEPT: readonly Kept[] = [
  { fact: "body.girths", label: "Measurements" },
];

/* ⚠️ A PERSON READING, THE SAME PERSON AGAIN, AND THE APP READING WITH NO PERSON
   AT ALL — the three rows that render differently, and the third is the one a
   fixture full of names would never show. */
const VAULT_LOOKS: readonly Looked[] = [
  { fact: "body.mass", label: "Weight", where: "Haddad Strength", face: still("t1"), product: "kova",
    who: "Shujaa Haddad", whoFace: still("Shujaa Haddad"), on: "Yesterday", times: 4 },
  { fact: "goal.training", label: "Your goal", where: "Haddad Strength", face: still("t1"), product: "kova",
    who: "Shujaa Haddad", whoFace: still("Shujaa Haddad"), on: "Yesterday", times: 1 },
  { fact: "body.mass", label: "Weight", where: "Beirut Barre Collective", face: still("t2"), product: "kova",
    on: "3 August", times: 12 },
];

/*
  ⚠️ THE SHEET AS AN APP WOULD RAISE IT, with one row of each need. A preview
  with only `raw` asks is one where the rung nobody understands is never drawn.
*/
const VAULT_ASKS: readonly Asked[] = [
  {
    fact: "body.mass", label: "Weight",
    why: "Used to work out your energy target, and to show your coach which way things are going.",
    need: "derived", required: false, recommend: "self",
    because: "Somebody helping you can plan from the change without ever seeing the number.",
    reach: "compute",
    readings: [
      { id: "body.mass.trend", label: "Weight trend", says: "Which way it is going, and how fast, over the last few weeks.", hides: "Every absolute weight — a direction and a rate, with no starting point to add them to.", reach: "staff" },
      { id: "body.mass.progress", label: "Change since you started", says: "How much you have changed, as a percentage of where you began.", hides: "Both weights. A percentage of a start the reader does not know is one equation in two unknowns.", reach: "self" },
    ],
  },
  {
    fact: "goal.training", label: "Your goal",
    why: "Your coach writes your programme against this.",
    need: "raw", required: true, recommend: "staff",
    because: "The one thing somebody helping you genuinely cannot plan without.",
    reach: "staff", readings: [],
  },
  {
    fact: "body.height", label: "Height",
    why: "Used with your weight to work out an energy target and a body-mass index.",
    need: "compute", required: false, recommend: "self",
    because: "Only needed to work out an energy target, which the platform can do without showing it.",
    reach: "self", readings: [],
  },
];

/*
  ⚠️ WHAT SOMEBODY WAS LET INTO, WHICH IS A GRANT RATHER THAN A LIST OF PRODUCTS.
  The real answer comes from `me.products`, which crosses the grant on their
  address with the products this deployment declares — so a fixture of three is a
  person the website has enabled for everything.
*/
const PRODUCTS = [
  { id: "kova", name: "Kova", does: "Coaching, for a studio and the people it trains.", setupAt: "https://setup.kova.4dl.app" },
  { id: "scena", name: "Scena", does: "Screens, playing what you tell them, everywhere at once.", setupAt: "https://setup.scena.4dl.app" },
  { id: "tessa", name: "Tessa", does: "A clinic's own practice, run end to end.", setupAt: "https://setup.tessa.4dl.app" },
];

/*
  ⚠️ TWO, BECAUSE THE PICKER ONLY EXISTS ABOVE ONE. A fixture with a single
  region draws a screen with no region row at all, which is the ordinary
  deployment and the one the default mode shows.
*/
const PLACES: readonly Place[] = [
  { id: "eu", label: "Europe", detail: "Frankfurt" },
  { id: "us", label: "United States", detail: "Virginia" },
];

/*
  ⚠️ ONE PRODUCT NOT OPEN TO THIS PERSON, because that row is the one a fixture
  of three identical products never draws — and it is the ordinary state for
  somebody who bought one thing.
*/
const SELLABLE: readonly Sellable[] = [
  { id: "kova", name: "Kova", does: "Coaching, for a studio and the people it trains.", open: true },
  { id: "scena", name: "Scena", does: "Screens, playing what you tell them, everywhere at once.", open: true },
  { id: "tessa", name: "Tessa", does: "A clinic's own practice, run end to end.", open: false },
];

/*
  ⚠️ THREE PLANS WITH DIFFERENT SHAPES OF INCLUSION — a count, a switch that is
  off, and an unlimited. A fixture where every line is a number never draws the
  em dash or the word, which are the two rows people actually squint at.
*/
const PLANS: readonly Plan[] = [
  {
    id: "solo", name: "Starter", price: { minor: 499, currency: "usd" }, period: "month", trialDays: 14,
    includes: [
      { key: "clients", label: "People you coach", value: 3, unlimited: false },
      { key: "credits", label: "Monthly credits", value: 5_000, unlimited: false },
      { key: "chat", label: "Messaging", value: false, unlimited: false },
    ],
  },
  {
    id: "pro", name: "Pro", price: { minor: 2900, currency: "usd" }, period: "month", trialDays: 14,
    includes: [
      { key: "clients", label: "People you coach", value: 40, unlimited: false },
      { key: "credits", label: "Monthly credits", value: 60_000, unlimited: false },
      { key: "chat", label: "Messaging", value: true, unlimited: false },
    ],
  },
  {
    id: "max", name: "Max", price: { minor: 9900, currency: "usd" }, period: "month", trialDays: 0,
    includes: [
      { key: "clients", label: "People you coach", value: -1, unlimited: true },
      { key: "credits", label: "Monthly credits", value: 250_000, unlimited: false },
      { key: "chat", label: "Messaging", value: true, unlimited: false },
    ],
  },
];

const BALANCE: Balance = {
  total: 41_200, granted: 28_000, purchased: 13_200,
  expiring: { at: "2026-09-01T00:00:00.000Z", amount: 28_000 },
};

const PACKS: readonly Pack[] = [
  { id: "small", name: "Small", price: { minor: 900, currency: "usd" }, credits: 10_000 },
  { id: "top", name: "Large", price: { minor: 3900, currency: "usd" }, credits: 50_000 },
];

/*
  ⚠️ A LEDGER WITH SPENDS AND GRANTS MIXED, because a fixture of one kind never
  shows the sign — which is the whole column a reader scans.
*/
const MOVEMENTS: readonly Movement[] = [
  { kind: "granted", amount: -320, reason: "hold:draft-plan", productId: "kova", at: "2026-08-13T09:20:00.000Z" },
  { kind: "granted", amount: -1_180, reason: "hold:snap-meal", productId: "kova", at: "2026-08-12T18:02:00.000Z" },
  { kind: "granted", amount: 28_000, reason: "allowance:kova", productId: "kova", at: "2026-08-01T00:00:00.000Z" },
  { kind: "purchased", amount: 50_000, reason: "pack:top", productId: "kova", at: "2026-07-19T11:41:00.000Z" },
];

/*
  ⚠️ THREE SUBSCRIPTIONS IN THE THREE STATES THAT RENDER DIFFERENTLY — one paying
  and fine, one whose card failed, and one paid for with no workspace on it. The
  third is the one that had no screen at all, and a fixture without it is a
  preview of the two states that were never broken.
*/
const HOLDINGS: readonly Holding[] = [
  {
    id: "sub_1", productId: "kova", productName: "Kova", planName: "Pro",
    price: { minor: 2900, currency: "usd" }, period: "month",
    standing: { standing: "active", reason: "ok" },
    workspace: { tenantId: "t1", name: "Haddad Strength", at: "https://haddad.kova.4dl.app" },
    payAt: "https://billing.example.test/portal",
    includes: PLANS[1]!.includes,
  },
  {
    id: "sub_2", productId: "scena", productName: "Scena", planName: "Wall",
    price: { minor: 1900, currency: "usd" }, period: "month",
    standing: { standing: "read_only", reason: "arrears", nextAt: "2026-09-04T00:00:00.000Z" as Instant },
    workspace: { tenantId: "t3", name: "Corniche Screens", at: "https://corniche.scena.4dl.app" },
    /* ⚠️ THE PROVIDER'S OWN PORTAL, which is the only thing on this screen that
       fixes the state it is reporting. */
    payAt: "https://billing.example.test/portal",
    /* ⚠️ THE PRODUCT'S OWN ENTITLEMENTS, not the shelf fixture's. A screen
       photographed with one product's lines under another product's name is a
       picture that reviews nothing. */
    includes: [
      { key: "screens", label: "Screens", value: 12, unlimited: false },
      { key: "boards", label: "Live boards", value: 3, unlimited: false },
      { key: "history", label: "Manifest history", value: true, unlimited: false },
    ],
  },
  {
    id: "sub_3", productId: "tessa", productName: "Tessa", planName: "Practice",
    price: { minor: 4900, currency: "usd" }, period: "month",
    standing: { standing: "active", reason: "ok" },
    workspace: null,
    setupAt: "https://setup.tessa.4dl.app",
    includes: [
      { key: "patients", label: "People on your list", value: 200, unlimited: false },
      { key: "letters", label: "Letters a month", value: 0, unlimited: true },
      { key: "seats", label: "Colleagues", value: 4, unlimited: false },
    ],
  },
];

/*
  ⚠️ A DECLARATION WITH ONE OF EVERY KIND, because the renderer's whole job is to
  turn kinds into controls — a fixture of six text fields would be a picture of
  one branch. The keys carry their real prefixes, so the grouping is exercised
  rather than described.
*/
const DECLARED: Declaration = {
  "brand.name": { label: "What this workspace is called", kind: "text", fallback: "", help: "Shown on the sign-in screen and in the messages you send." },
  "brand.accent": { label: "Accent colour", kind: "colour", fallback: "" },
  "mail.signature": { label: "How your messages sign off", kind: "text", fallback: "" },
  "lapse.after": { label: "Days before access lapses", kind: "number", fallback: 14, min: 0, max: 365 },
  "lapse.then": { label: "And then", kind: "enum", fallback: "read_only", values: ["read_only", "blocked", "archive"] },
  "lapse.notify": { label: "Tell them first", kind: "bool", fallback: true },
};

const CHOSEN = { "brand.name": "Haddad Strength", "lapse.after": 30, "lapse.then": "archive" };

/*
  ⚠️ ONE CEILING PER SOURCE, because `source` is the only reason this screen is
  worth opening — a fixture where everything came from the plan never draws the
  two rows that answer "why does this workspace have more than the plan says".
*/
const INCLUDED: readonly Resolved[] = [
  { key: "clients", label: "People you coach", value: 40, unlimited: false, source: "plan" },
  { key: "seats", label: "Colleagues", value: 5, unlimited: false, plan: 3, source: "grandfathered" },
  { key: "storage", label: "Storage", value: -1, unlimited: true, source: "adjusted" },
];

/*
  ⚠️ EVERY SOURCE AND A SECRET, because those are the four rows that render
  differently and the ones an operator reads the screen for.
*/
const CONFIG_KEYS: readonly ConfigKey[] = [
  { key: "stripe.mode", value: "test", secret: false, shared: true, source: "shared" },
  { key: "stripe.live.secret_key", value: true, secret: true, shared: true, source: "shared" },
  { key: "email.from", value: "Kova <noreply@4dl.app>", secret: false, shared: false, source: "app" },
  { key: "google.gemini_key", value: false, secret: true, shared: true, source: "unset" },
];

const CONSOLE_PRODUCTS = [
  { appId: "kova", appName: "Kova", manifestVersion: "0.21.0", changed: 0 },
  { appId: "scena", appName: "Scena", manifestVersion: "0.4.0", changed: 2 },
  { appId: "tessa", appName: "Tessa", manifestVersion: "0.9.0", changed: 0 },
];

/*
  ⚠️ TWO WORKSPACES AT THE SAME SLUG UNDER TWO PRODUCTS, because that is now
  legal and the row has to survive it. A fixture where every slug was unique
  would draw a list that looks right and says nothing about the case the screen
  exists to handle.

  ⚠️ AND ONE IN A REGION THAT WILL NOT ANSWER, which is the other row that
  renders differently — a workspace with no plan on it, for a reason that is ours
  rather than theirs.
*/
/*
  ⚠️ EVERY ROW THAT RENDERS DIFFERENTLY: two lanes, one model turned off, one
  reasoning model, and one an operator has priced at nothing — which is the row
  the screen exists to make visible, because it is the one that would otherwise
  sell every call for free.
*/
const MODELS: readonly Model[] = [
  {
    id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", provider: "workers-ai", lanes: ["text"], enabled: true,
    markup: 1.4, thinking: false,
    cost: { input: 1, output: 2, perOutput: null }, price: { input: 1.4, output: 2.8, perOutput: null }, problems: [],
  },
  {
    id: "gemini-2.5-pro", provider: "gemini", lanes: ["text"], enabled: true, markup: 1.25, thinking: true,
    cost: { input: 4, output: 16, perOutput: null }, price: { input: 5, output: 20, perOutput: null }, problems: [],
  },
  {
    /* ⚠️ Two lanes on one row, which is the ordinary case for a Gemini model
       and the reason a model carries a list rather than one. */
    id: "gemini-2.5-flash", provider: "gemini", lanes: ["text", "vision"], enabled: false, markup: 1.4, thinking: false,
    cost: { input: 1, output: 4, perOutput: null }, price: { input: 1.4, output: 5.6, perOutput: null }, problems: [],
  },
  {
    /* ⚠️ And one the provider has dated, with the model it names to move to. */
    id: "gemini-2.0-flash", provider: "gemini", lanes: ["text", "vision"], enabled: true, markup: 1.4, thinking: false,
    retiresAt: "2026-06-01", replacedBy: "gemini-2.5-flash",
    cost: { input: 1, output: 4, perOutput: null }, price: { input: 1.4, output: 5.6, perOutput: null }, problems: [],
  },
  {
    id: "gemini-2.5-flash-image", provider: "gemini", lanes: ["image"], enabled: true, markup: 1, thinking: false,
    retiresAt: "2026-08-17", replacedBy: "gemini-3.1-flash-image",
    cost: { input: 1, output: 4, perOutput: 600 }, price: { input: 1, output: 4, perOutput: 600 },
    problems: ["has a markup of zero or less, which sells every call at or below cost"],
  },
];

const LANES = ["text", "vision", "image", "speech", "transcribe", "video"];

/*
  ⚠️ AND EVERY STATE AN ACTION CAN BE IN: one the workspace chose, one the
  deployment chose for it, one whose pick has since been taken out of service,
  and one nothing on this deployment can run. The last two are the reason this
  screen says who decided.
*/
const ACTIONS: readonly Action[] = [
  {
    action: "draft-plan", summary: "A training plan from a sentence", lane: "text",
    options: [{ id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", provider: "workers-ai" }, { id: "gemini-2.5-pro", provider: "gemini" }],
    inEffect: "gemini-2.5-pro", decidedBy: "workspace", why: null, stale: false,
    prompt: "Always answer in German, and never suggest barbell work.",
  },
  {
    action: "parse-food", summary: "A meal described in words, as foods and portions", lane: "text",
    options: [{ id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", provider: "workers-ai" }],
    inEffect: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", decidedBy: "catalogue", why: null, stale: false, prompt: "",
  },
  {
    action: "snap-meal", summary: "A photograph of a meal, as foods and portions", lane: "vision",
    options: [{ id: "gemini-2.5-flash", provider: "gemini" }],
    inEffect: "gemini-2.5-flash", decidedBy: "workspace", why: null, stale: true, prompt: "",
  },
  {
    action: "image", summary: "A picture for the studio's own use", lane: "image",
    options: [], inEffect: null, decidedBy: null, why: "none_in_lane", stale: false, prompt: "",
  },
];

/*
  ⚠️ A ROSTER WITH BOTH STATES ON IT, because "invited" and "accepted" are the
  two rows a member list has to draw differently and the pending half is the one
  a screen forgets. The last row is somebody in a role this workspace made.
*/
const MEMBERS: readonly Member[] = [
  { id: "m1", email: "rana@haddad.test", role: "owner", state: "accepted" },
  { id: "m2", email: "sami@haddad.test", role: "reader", state: "accepted" },
  { id: "m3", email: "new-hire@haddad.test", role: "front-desk", state: "invited" },
];

const ROLES: readonly Role[] = [
  { id: "owner", name: "owner", permissions: ["note:read", "note:write", "member:read", "member:manage"], source: "app", editable: true, held: 1 },
  { id: "reader", name: "reader", permissions: ["note:read"], source: "app", editable: true, held: 1 },
  /* ⚠️ One this workspace composed itself, which is the whole feature. */
  { id: "front-desk", name: "Front desk", permissions: ["note:read", "member:read"], source: "workspace", editable: true, held: 1 },
  /* ⚠️ And one carrying a key the reader does not hold — shown, and stood down. */
  { id: "bookkeeper", name: "Bookkeeper", permissions: ["note:read", "member:manage"], source: "workspace", editable: false, held: 0 },
];

const PERMISSIONS: readonly string[] = ["note:read", "note:write", "member:read", "member:manage", "file:read", "file:write"];

/*
  ⚠️ READ AND UNREAD BOTH, because "new" is a mark on a row rather than a
  different row — a list where half the entries are styled differently is one the
  eye reads as two lists.
*/
const NOTICES: readonly Notice[] = [
  { id: "n1", type: "plan.chosen", title: "You chose Pro", icon: "card", category: "billing", at: "2026-08-13T09:00:00.000Z", read: false, open: {} },
  { id: "n2", type: "package.granted", title: "30 days added", body: "Enjoy them, Sam.", icon: "gift", category: "billing", at: "2026-08-12T09:00:00.000Z", read: false, open: {} },
  { id: "n3", type: "support.session", title: "Somebody from support was in your workspace", body: "Why: a billing question", icon: "shield", category: "service", at: "2026-08-11T09:00:00.000Z", read: true, open: {} },
  /* ⚠️ An icon name this package does not draw — it falls back to the bell
     rather than to a blank space where a glyph should be. */
  { id: "n4", type: "thing.happened", title: "Somebody did a thing", icon: "unheard-of", category: "activity", at: "2026-08-10T09:00:00.000Z", read: true, open: { collection: "note" } },
];

const REACHING: readonly Reaching[] = [
  { type: "plan.chosen", category: "billing", icon: "card", title: "You chose {planId}", reaching: ["inbox", "email"], allowed: ["inbox", "email", "push"] },
  { type: "package.granted", category: "billing", icon: "gift", title: "{days} days added", reaching: ["inbox"], allowed: ["inbox"] },
  /* ⚠️ Off at the WORKSPACE, which the row has to say — "you turned this off" and
     "your workspace did" are different sentences. */
  { type: "thing.happened", category: "activity", icon: "bell", title: "Somebody did a thing", reaching: [], allowed: [] },
];

const POLICIES: readonly NoticePolicy[] = [
  { type: "plan.chosen", category: "billing", icon: "card", title: "You chose {planId}", roles: ["owner"], needs: "billing:manage", required: false, off: false, channels: null },
  { type: "package.granted", category: "billing", icon: "gift", title: "{days} days added", roles: ["owner", "client"], needs: "commerce:read", required: false, off: false, channels: ["inbox"] },
  { type: "thing.happened", category: "activity", icon: "bell", title: "Somebody did a thing", roles: ["owner"], needs: "note:read", required: false, off: true, channels: null },
  /* ⚠️ The one nobody may switch off, and the screen says why rather than
     drawing a control that refuses. */
  { type: "document.owed", category: "action", icon: "shield", title: "Something is waiting for you", roles: ["owner"], needs: "guide:read", required: true, off: false, channels: null },
];

const CONSOLE_TENANTS: readonly Tenant[] = [
  { tenantId: "t1", appId: "kova", slug: "haddad", region: "eu", standing: "active", reason: "", plan: "Pro", status: "active", reachable: true },
  { tenantId: "t2", appId: "scena", slug: "haddad", region: "eu", standing: "active", reason: "", plan: "Free", status: "active", reachable: true },
  { tenantId: "t3", appId: "kova", slug: "northline", region: "us", standing: "read_only", reason: "past_due", plan: "Solo", status: "past_due", reachable: true },
  { tenantId: "t4", appId: "tessa", slug: "brightwater", region: "ap", standing: "active", reason: "", plan: null, status: null, reachable: false },
];

/* ⚠️ An app id is a routing token; a person reads a name. One helper rather than
   a lookup table, so a fourth product needs no edit here. */
const titledId = (id: string): string => id.replace(/^./, (c) => c.toUpperCase());

/** Long enough to see the spinner and know it is a wait, not a stutter. */
const ROUND_TRIP_MS = 900;

/*
  ⚠️ WHAT AN EXPORT ACTUALLY COMES BACK AS — table names and counts, exactly the
  shape `exit.account.export` answers with. The names are the platform's own
  tables rather than friendly words, because that is what the FILE calls them and
  a screen using a second vocabulary is one nobody can check the file against.

  ⚠️ ONE DROPPED TABLE, because the row that says what is MISSING is the one this
  screen exists for and the one a happy fixture never draws.
*/
const EXPORTED: Taken = {
  at: "2026-08-12T09:14:00.000Z" as Taken["at"],
  tables: {
    accounts: [{}],
    sessions: [{}, {}],
    passkeys: [{}, {}],
    consents: [{}, {}, {}],
    vault_facts: [{}, {}, {}, {}],
    vault_grants: [{}, {}],
    vault_reads: Array.from({ length: 17 }, () => ({})),
    notifications: Array.from({ length: 42 }, () => ({})),
  },
  dropped: ["milestones"],
  account: {},
  workspaces: [{ name: "Haddad Strength" }, { name: "Corniche Screens" }],
};

/* ⚠️ THE WORKSPACE SOMEBODY IS THE LAST MANAGER OF — the state that makes closing
   an account a refusal that teaches rather than one that just says no. */
const STRANDED = [
  { tenantId: "t1", name: "Haddad Strength", product: "kova", face: face("t1") },
];

const asked = new URLSearchParams(location.hash.slice(1));

function Preview() {
  const [open, setOpen] = useState(true);
  /* ⚠️ IN THE HASH LIKE THE OTHER TWO, because the header above promises a state
     is a link and this was the one dial the promise did not cover — so every
     review of an inner screen began with three taps somebody had to be told. */
  /*
    ⚠️ A PATH, NOT A SCREEN NAME, AND IT IS THE REAL ONE. Every screen in the
    hub has an address now — `routes.ts` parses and prints them — so a
    review of an inner surface is a link rather than three taps somebody has to
    be told about, and the preview exercises the same parser the app will.

    ⚠️ AND IT IS ROUND-TRIPPED THROUGH THE HASH. Written to the location on every
    move, read from it on load: which is what makes a screenshot of a document
    reproducible and what proves the printer and the parser agree, on every
    navigation, rather than in a test alone.
  */
  const [where, setWhere] = useState<Where>(() => parseWhere(asked.get("screen") ?? ""));
  const at = where.at;
  const go = (to: Where) => {
    setWhere(to);
    const next = new URLSearchParams(location.hash.slice(1));
    const path = pathOf(to);
    if (path) next.set("screen", path); else next.delete("screen");
    location.hash = next.toString();
  };
  const up = () => go(upFrom(where));
  /* ⚠️ THE DIAL STILL LISTS SCREENS, and it lists them as paths for the same
     reason: what it sets is what a link carries. */
  const [taken, setTaken] = useState<Taken | null>(null);
  const [asking, setAsking] = useState(false);
  const [which, setWhich] = useState((asked.get("state") ?? "four") as keyof typeof CASES);
  const [outcome, setOutcome] = useState((asked.get("save") ?? "ok") as keyof typeof OUTCOMES);
  /* ⚠️ IN THE HASH LIKE THE SCREEN, because a review of a light-theme surface is
     otherwise a screenshot somebody has to remember to take by hand — and the one
     that never gets taken is the one where a colour was declared in a single
     scoping. */
  const [theme, setTheme] = useState<"dark" | "light">(() =>
    asked.get("theme") === "light" ? "light" : "dark");
  const [prefs, setPrefs] = useState<Preferences>({
    /* ⚠️ THE SHIPPED DEFAULTS, not a convenient pair. Sound on in the fixture
       makes every screenshot a picture of a setting nobody chose. */
    theme: "dark", units: "metric", language: "en", ...FEEDBACK_DEFAULT,
  });
  const [dial, setDial] = useState(false);
  /*
    ⚠️ THE DOOR IS NOT PRESENTED OVER ANYTHING, so it is a mode rather than a
    screen in the dial. Everything else in this preview is laid over an app the
    person was already in; a sign-in screen is what there is instead of that.
    `#door=1` — and `#door=passkey` for a browser that has one.
  */
  const doorAs = asked.get("door");
  /*
    ⚠️ THE SCREEN AT THE OTHER END OF THE ACCOUNT CENTRE'S HAND-OVER. It is on a
    product's own `setup.` host in the product, which means it is the one surface
    in this preview that cannot be reached from any other — so it gets its own
    mode. `#setup=1`, and `#setup=places` for a deployment with a region to
    choose between.
  */
  const setupAs = asked.get("setup");

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  /* ⚠️ THE DIAL AND THE SCREEN SET THE SAME THING, which is the point: the
     preference screen is now the real surface, and the dial only survives so a
     note can be played without saving anything. */
  useEffect(() => {
    configureFeedback({ haptics: prefs.haptics, sound: prefs.sound });
  }, [prefs.haptics, prefs.sound]);

  const save = async (): Promise<Problem | null> => {
    await new Promise((r) => setTimeout(r, ROUND_TRIP_MS));
    return OUTCOMES[outcome] ?? null;
  };

  /* ⚠️ ONE ACCOUNT WITH TWO PASSKEYS AND TWO LIVE SESSIONS, one of each being the
     one in your hand — which is the row that behaves differently and therefore
     the row worth having in the fixture. */
  const KEYS = [
    { id: "k1", label: "MacBook Pro", added: "4 March", lastUsed: "2 days ago", current: true },
    { id: "k2", label: "iPhone 15", added: "12 May" },
  ];
  const DEVICES = [
    { id: "d1", app: "Kova · Haddad Strength", since: "4 March", current: true,
      workspaceFace: face("t1"), workspaceName: "Haddad Strength", product: "kova" },
    { id: "d2", app: "Scena · Corniche Screens", since: "28 July",
      workspaceFace: face("t3"), workspaceName: "Corniche Screens", product: "scena" },
  ];

  /* ⚠️ ONE LOOKUP FOR EVERY LEGAL SCREEN, so a path that names a product nobody
     is in cannot render a blank surface — it falls back to the hub, which is the
     same total-parse rule `routes.ts` states for the path itself. */
  const legalAt = "product" in where
    ? LEGAL_PRODUCTS.find((p) => p.appId === where.product) ?? null
    : null;

  const screen = ({ Heading }: { readonly Heading: ElementType }) =>
    at === "vault" ? (
      <VaultScreen
        wheres={which === "waiting" ? null : VAULT_WHERES}
        kept={which === "waiting" ? null : VAULT_KEPT}
        looks={which === "waiting" ? null : VAULT_LOOKS}
        Heading={Heading}
        onSet={save}
        onBack={up}
      />
    ) :
    at === "preferences" ? (
      <PreferencesScreen
        prefs={prefs}
        Heading={Heading}
        onSet={async (key, value) => {
          /* The preview applies what the real write would, so the screen shows
             the value it will actually have rather than the one it was asked for. */
          setPrefs((p) => ({ ...p, [key]: value }));
          if (key === "theme") setTheme(value as "dark" | "light");
          return save();
        }}
        onBack={up}
      />
    ) : at === "security" ? (
      <SignInMethods
        email={(CASES[which] ?? CASES.four).person.email}
        /* ⚠️ `#keys=one` IS ITS OWN KNOB because the LAST passkey is a different
           screen: removing it is the only action here that asks for a tick. A
           state that only exists at a list length of exactly one is a state
           nobody reaches by accident while reviewing. */
        passkeys={which === "waiting" ? null : which === "new" ? [] : asked.get("keys") === "one" ? KEYS.slice(0, 1) : KEYS}
        devices={which === "waiting" ? null : DEVICES}
        Heading={Heading}
        onAddPasskey={() => undefined}
        onRemovePasskey={save}
        onSignOut={save}
        onSignOutHere={save}
        onSignOutEverywhere={save}
        onBack={up}
      />
    ) : at === "legal" ? (
      <LegalScreen
        products={which === "waiting" ? null : LEGAL_PRODUCTS}
        onGo={go}
        onBack={up}
        Heading={Heading}
      />
    ) : at === "product" && legalAt ? (
      <ProductScreen of={legalAt} onGo={go} onBack={up} Heading={Heading} />
    ) : at === "receiving" && legalAt ? (
      <ReceivingScreen of={legalAt} onBack={up} Heading={Heading}
        onOpen={(recipient) => go({ at: "recipient", product: legalAt.appId, recipient })} />
    ) : at === "recipient" && legalAt ? (
      <RecipientScreen of={legalAt} sub={"recipient" in where ? where.recipient : ""}
        onBack={up} Heading={Heading} />
    ) : at === "document" && legalAt ? (
      /* ⚠️ THE DOCUMENT IS FOUND IN THE PRODUCT THE PATH NAMES, not across all of
         them. Two products may both publish `terms`, and a search that ignored
         the product would open whichever came first. */
      (() => {
        const doc = legalAt.docs.find((d) => d.doc.id === ("document" in where ? where.document : ""));
        return doc
          ? <DocScreen item={doc} onAccept={save} onBack={up} Heading={Heading} />
          : <LegalScreen products={LEGAL_PRODUCTS} onGo={go} onBack={up} Heading={Heading} />;
      })()
    ) : at === "export" ? (
      <ExportScreen
        taken={taken}
        onTake={async () => {
          const why = await save();
          /* ⚠️ THE ANSWER IS ONLY KEPT WHERE THE WRITE SUCCEEDED. A screen that
             shows a table list beside a failure is telling somebody their export
             is ready when the request came back refused. */
          if (!why) setTaken(EXPORTED);
          return why;
        }}
        onSave={taken ? () => undefined : undefined}
        onBack={up}
        Heading={Heading}
      />
    ) : at === "market" ? (
      <MarketScreen
        products={SELLABLE}
        holdings={which === "waiting" ? null : which === "new" ? [] : HOLDINGS}
        balance={which === "waiting" ? null : BALANCE}
        onGo={go} onBack={up} Heading={Heading}
      />
    ) : at === "plan" ? (
      <PlanScreen
        /* ⚠️ FALLS BACK RATHER THAN BLANKS. An address naming a subscription this
           account does not hold is a link somebody was sent, and the total-parse
           rule the paths follow has to hold for what they resolve TO as well. */
        holding={HOLDINGS.find((h) => h.id === where.subscription) ?? HOLDINGS[0]!}
        chargeable={asked.get("pay") !== "no"}
        onGo={go}
        onCancel={save}
        onBack={up}
        Heading={Heading}
      />
    ) : at === "shelf" ? (
      <ShelfScreen
        product={SELLABLE.find((p) => p.id === where.product) ?? SELLABLE[0]!}
        /* ⚠️ `#state=waiting` is the shelf mid-fetch, which is the state a
           confident empty list would be indistinguishable from. */
        plans={which === "waiting" ? null : PLANS}
        trialAvailable={asked.get("trial") !== "used"}
        /* ⚠️ `#pay=no` is a deployment with no provider — the case where every
           button on a price list would refuse, and has to say so first. */
        chargeable={asked.get("pay") !== "no"}
        onStart={async () => { await new Promise((r) => setTimeout(r, ROUND_TRIP_MS)); return null; }}
        onBack={up}
        Heading={Heading}
      />
    ) : at === "credits" ? (
      <CreditsScreen
        balance={which === "waiting" ? null : BALANCE}
        history={MOVEMENTS}
        packs={PACKS}
        chargeable={asked.get("pay") !== "no"}
        onBuy={async () => { await new Promise((r) => setTimeout(r, ROUND_TRIP_MS)); return null; }}
        onBack={up}
        Heading={Heading}
      />
    ) : at === "close" ? (
      <CloseAccountScreen
        /* ⚠️ `#state=waiting` IS THE UNANSWERED BLOCKING LIST, which on this
           screen is the state that matters most: an enabled Close button in front
           of somebody whose workspaces would be stranded. */
        blocking={which === "waiting" ? null : asked.get("stranded") === "yes" ? STRANDED : []}
        closesOn={asked.get("closing") === "yes" ? "19 August" : null}
        onClose={save}
        onCancel={save}
        onBack={up}
        Heading={Heading}
      />
    /*
      ⚠️ THE THREE AREAS ARE SCREENS IN THE PREVIEW LIKE ANY OTHER, and that is
      the point of splitting them out of the home: each is reachable at its own
      address, so a review of "what you belong to" is not a review of the hub
      with everything else on it.
    */
    ) : at === "workspace" ? (
      <WorkspaceScreen
        workspace={{
          tenantId: where.tenant, name: "Haddad Strength", product: "kova", productName: "Kova",
          role: "Owner", at: "https://haddad.kova.4dl.app", face: face("t1"),
        }}
        included={which === "waiting" ? null : INCLUDED}
        plan={{ name: "Pro", said: "$29 a month" }}
        declared={DECLARED}
        values={which === "waiting" ? null : CHOSEN}
        onSet={save}
        /* ⚠️ `#write=no` is somebody in a workspace who is not its owner — the
           ordinary case, and the one where every control stands down. */
        {...(asked.get("write") === "no" ? { mayWrite: () => false } : {})}
        /* ⚠️ `#managed=no` is a workspace of ANOTHER product — the state where
           this hub genuinely cannot answer, and the one a screen would otherwise
           render as a workspace with nothing in it. */
        managedHere={asked.get("managed") !== "no"}
        onGo={go} onBack={up} Heading={Heading}
      />
    ) : at === "console" ? (
      <ConsoleScreen
        products={which === "waiting" ? null : which === "new" ? [] : CONSOLE_PRODUCTS}
        onGo={go} onBack={up} Heading={Heading}
      />
    ) : at === "product-config" ? (
      <KeysScreen
        product={{ id: where.product, name: titledId(where.product) }}
        keys={which === "waiting" ? null : CONFIG_KEYS}
        hasShared={asked.get("shared") !== "no"}
        onEdit={() => undefined} onBack={up} Heading={Heading}
      />
    ) : at === "shared-config" ? (
      <KeysScreen
        product={null}
        keys={which === "waiting" ? null : CONFIG_KEYS.filter((k) => k.shared)}
        hasShared={asked.get("shared") !== "no"}
        onEdit={() => undefined} onBack={up} Heading={Heading}
      />
    ) : at === "catalogue" ? (
      <CatalogueScreen
        product={{ id: where.product, name: titledId(where.product) }}
        plans={which === "waiting" ? null : PLANS.map((p, i) => ({ ...p, ...(i === 1 ? { edited: true } : {}) }))}
        onEdit={() => undefined} onBack={up} Heading={Heading}
      />
    ) : at === "models" ? (
      <ModelsScreen
        models={which === "waiting" ? null : which === "new" ? [] : MODELS}
        lanes={LANES}
        hasShared={asked.get("shared") !== "no"}
        onEdit={() => undefined}
        onEnabled={async () => null}
        onSync={async () => null}
        onBack={up} Heading={Heading}
      />
    ) : at === "ai" ? (
      <AiScreen
        actions={which === "waiting" ? null : which === "new" ? [] : ACTIONS}
        onChoose={async () => null}
        onPrompt={async () => null}
        /* ⚠️ `#write=no` is somebody who is not the workspace's owner — the
           ordinary case, where every control stands down and nothing is hidden. */
        mayWrite={asked.get("write") !== "no"}
        onBack={up} Heading={Heading}
      />
    ) : at === "people" ? (
      <PeopleScreen
        workspace={{ name: "Haddad Studio", tenantId: where.tenant }}
        members={which === "waiting" ? null : which === "new" ? [] : MEMBERS}
        roles={which === "waiting" ? null : ROLES}
        permissions={PERMISSIONS}
        seats={which === "waiting" ? null : { used: 3, allowed: 10 }}
        onInvite={async () => null}
        onRole={async () => null}
        onRemove={async () => null}
        onSaveRole={async () => null}
        onRemoveRole={async () => null}
        /* ⚠️ `#write=no` is somebody who is not an administrator — the ordinary
           case, where the roster is shown whole and every control stands down. */
        mayManage={asked.get("write") !== "no"}
        onBack={up} Heading={Heading}
      />
    ) : at === "notices" ? (
      <NoticePolicyScreen
        rows={which === "waiting" ? null : POLICIES}
        channels={["inbox", "email", "push"]}
        onSet={async () => null}
        onClear={async () => null}
        mayWrite={asked.get("write") !== "no"}
        onBack={up} Heading={Heading}
      />
    ) : at === "inbox" ? (
      <InboxScreen
        rows={which === "waiting" ? null : which === "new" ? [] : NOTICES}
        unread={which === "new" || which === "waiting" ? 0 : 2}
        onRead={async () => null}
        onOpen={() => undefined}
        onGo={() => go({ at: "interruptions" })}
        onBack={up} Heading={Heading}
      />
    ) : at === "interruptions" ? (
      <NoticeChoices
        prefs={which === "waiting" ? null : { muted: ["activity"], email: true, push: false }}
        types={which === "waiting" ? null : which === "new" ? [] : REACHING}
        /* ⚠️ `#state=nopush` is a deployment with no keys — the device switch is
           ABSENT rather than present and inert, which is the whole reason the
           channel was deleted from this platform the first time. */
        channels={asked.get("state") === "nopush" ? ["inbox", "email"] : ["inbox", "email", "push"]}
        onSet={async () => null}
        onPush={async () => null}
        onBack={up} Heading={Heading}
      />
    ) : at === "tenants" ? (
      <TenantsScreen
        tenants={which === "waiting" ? null : which === "new" ? [] : CONSOLE_TENANTS}
        onOpen={(tenantId) => go({ at: "workspace", tenant: tenantId })}
        onSearch={() => undefined}
        onBack={up} Heading={Heading}
      />
    ) : at === "maintenance" ? (
      <MaintenanceScreen
        /* ⚠️ `#state=` picks the rung, because the screen the whole control is
           for is the CLOSED one and it is the one nobody sees by accident. */
        mode={MODES.find((m) => m.value === asked.get("state"))?.value ?? "off"}
        message="We are back within the hour."
        onSet={async () => null}
        onBack={up} Heading={Heading}
      />
    ) : at === "account" ? (
      <AccountScreen
        person={(CASES[which] ?? CASES.four).person}
        sharedCount={
          which === "waiting" ? null
          : which === "new" ? 0
          : VAULT_WHERES.flatMap((w) => w.items).filter((i) => i.granted).length
        }
        Heading={Heading}
        onGo={go}
        onBack={up}
      />
    ) : at === "workspaces" ? (
      <WorkspacesScreen
        workspaces={(CASES[which] ?? CASES.four).workspaces}
        email={(CASES[which] ?? CASES.four).person.email}
        /* ⚠️ A ROW OPENS THE WORKSPACE'S OWN SCREEN, which is a route in this
           surface now. Leaving for the product is one press from there. */
        onOpen={(tenantId) => go({ at: "workspace", tenant: tenantId })}
        onStart={asked.get("open") === "none" ? undefined : () => go({ at: "market" })}
        Heading={Heading}
        onBack={up}
      />
    ) : at === "details" ? (
      <AccountDetails
        person={(CASES[which] ?? CASES.four).person}
        since="4 March 2024"
        emailVerified
        Heading={Heading}
        onSave={save}
        onPickPhoto={() => undefined}
        onBack={up}
      />
    ) : (
      <HubHome
        {...CASES[which] ?? CASES.four}
        /* ⚠️ COUNTED FROM THE VAULT FIXTURE RATHER THAN TYPED BESIDE IT, so the
           card and the screen it opens cannot disagree about how many things are
           shared — which is the one thing a reviewer would take on trust. */
        sharedCount={
          which === "waiting" ? null
          : which === "new" ? 0
          : VAULT_WHERES.flatMap((w) => w.items).filter((i) => i.granted).length
        }
        Heading={Heading}
        onGo={go}
        /* ⚠️ A WORKSPACE ROW LEAVES THIS SURFACE, which is why it is not a route
           in it. In the product it is a full navigation to another origin. */
        /* ⚠️ WHAT THE WEBSITE ENABLES, AS THE ACCOUNT CENTRE SEES IT. `#open=one`
           for a single product (no picker at all) and `#open=` for somebody who
           may open nothing, which is what most people with an account are. */
        /* ⚠️ `#operator=1` DRAWS THE FOURTH CROWN. Almost nobody holds this, which
           is why it is worth being able to look at both versions of the screen. */
        operator={asked.get("operator") === "1"}
        openable={
          asked.get("open") === "one" ? PRODUCTS.slice(0, 1)
            : asked.get("open") === "none" ? []
              : PRODUCTS
        }
        /* ⚠️ The balance the hub shows. `undefined` is a deployment with no
           credits at all; `null` is one that has them and has not answered yet. */
        balance={which === "waiting" ? null : { total: 41_200, granted: 28_000, purchased: 13_200, expiring: { at: "2026-09-01T00:00:00.000Z", amount: 28_000 } }}
        onClose={() => setOpen(false)}
      />
    );

  /*
    ⚠️ THE SHEET A REFUSAL RAISES, WHICH NOTHING ELSE IN THIS PREVIEW COULD REACH.
    It is opened by `platform.proof_required` coming back from a write, and a
    preview with no server has no way to produce one — so it is a mode.
    `#prove=1`, and `#prove=passkey` for a device that has one.
  */
  const proveAs = asked.get("prove");

  if (setupAs) {
    return (
      <SetupScreen
        product="Kova"
        root="kova.4dl.app"
        places={setupAs === "places" ? PLACES : []}
        /* ⚠️ A WIRE THAT REFUSES THE OBVIOUS ADDRESS, because the taken one is
           the interesting screen: an address somebody typed, refused, with the
           message under the field it is about. */
        wire={{
          create: async ({ slug }) => {
            await new Promise((r) => setTimeout(r, ROUND_TRIP_MS));
            return slug === "kova" || slug === "gym"
              ? ({ code: "platform.conflict", status: 409, retryable: false, ref: "req_7",
                   title: "That address is taken", detail: "Somebody already has it. Try another.",
                   meta: { field: "slug" } } as never)
              : { slug };
          },
        }}
        onMade={() => undefined}
      />
    );
  }

  if (doorAs || proveAs) {
    /*
      ⚠️ A WIRE THAT REFUSES AS OFTEN AS IT AGREES. A door reviewed against a
      wire that always says yes is a door whose cooldown, whose wrong code and
      whose dismissed ceremony have never been looked at — and those are three of
      its five screens. `000000` is accepted and everything else is not.
    */
    const wire: DoorWire = {
      sendCode: async () => { await new Promise((r) => setTimeout(r, ROUND_TRIP_MS)); return null; },
      verifyCode: async (_email, code) => {
        await new Promise((r) => setTimeout(r, ROUND_TRIP_MS));
        return code === "000000"
          ? { offerPasskey: doorAs !== "plain" }
          : OUTCOMES.field!;
      },
      beginPasskey: async () => ({ challenge: "AQID", relyingParty: "4dl.app", allow: [] }),
      finishPasskey: async () => null,
      beginRegister: async () => ({ challenge: "AQID", relyingParty: "4dl.app", accountId: "acc_1", exclude: [] }),
      finishRegister: async () => { await new Promise((r) => setTimeout(r, ROUND_TRIP_MS)); return null; },
    };
    /* ⚠️ A BROWSER THAT CANNOT, BY DEFAULT. Most people arriving at a door have
       no passkey, and a preview that assumes one is a preview of the rarer half. */
    const browser: Ceremony = {
      available: async () => doorAs === "passkey" || proveAs === "passkey",
      autofill: async () => false,
      create: async () => null,
      get: async () => null,
    };
    return proveAs ? (
      <ProveIt
        open
        email="nadia@haddadstrength.com"
        toDo="closing your account"
        wire={wire}
        ceremony={browser}
        onProven={() => undefined}
        onClose={() => undefined}
      />
    ) : (
      <Door name="Kova" wire={wire} ceremony={browser} onIn={() => undefined} />
    );
  }

  return (
    <>
      {/* ⚠️ SOMETHING TO BE PRESENTED OVER. Judging a modal route against a blank
          page hides the whole question the presentation answers — whether it reads
          as laid over an app or as having navigated away from one. */}
      <div className="host">
        <p>the app the person was in</p>
        {/* ⚠️ THE SIGN GOES SOMEWHERE, and this is the whole reason it is a
            button: an app field bound to the vault is the one place a person
            meets the vault without having gone looking for it. */}
        <AppFields onSave={save} onOpenVault={() => { go({ at: "vault" }); setOpen(true); }}
          onAsk={() => setAsking(true)} />
        <button type="button" onClick={() => setOpen(true)}>Open the hub</button>
      </div>

      {/* ⚠️ THE LEVEL IS THE CALLER'S, WHICH IS WHY THE STACK IS HERE AND NOT
          INSIDE THE PRESENTATION. Navigation is the router's state in the real
          app and this preview's state here; a presentation that owned it would
          be a presentation that had to be told about every screen. */}
      <Hub open={open} onClose={() => { setOpen(false); go({ at: "home" }); }}>
        {({ Heading }) => (
          <Stack at={keyOf(where)}>{screen({ Heading })}</Stack>
        )}
      </Hub>

      <ConsentSheet
        open={asking}
        app="Kova"
        where="Haddad Strength"
        asks={VAULT_ASKS}
        onShare={save}
        onClose={() => setAsking(false)}
      />
      <div className="dial" data-open={dial ? "" : undefined} onPointerDown={(e) => e.stopPropagation()}>
        <div className="dial-panel">
          <Group
            label="screen"
            value={pathOf(where)}
            /* ⚠️ THE THREE AREAS COME FIRST AND THE HUB IS "", because that is
               the order somebody walks them. A dial that listed only the leaves
               would make the split invisible in the one place it is reviewed. */
            options={["", "account", "workspaces", "workspace/t1", "market", "market/kova", "plan/sub_2", "credits",
              "console", "console/kova", "console/kova/plans", "console/shared",
              "details", "security", "preferences", "vault", "legal", "export", "close"] as const}
            onPick={(path) => go(parseWhere(path))}
          />
          <Group label="workspaces" value={which} options={Object.keys(CASES) as (keyof typeof CASES)[]} onPick={setWhich} />
          <Group label="save" value={outcome} options={Object.keys(OUTCOMES) as (keyof typeof OUTCOMES)[]} onPick={setOutcome} />
          <Group label="theme" value={theme} options={["dark", "light"] as const} onPick={setTheme} />
          {/* ⚠️ A NOTE YOU CANNOT HEAR WITHOUT SAVING SOMETHING IS A NOTE NOBODY
              REVIEWS. Both, side by side, because the whole question is whether
              they are distinguishable. */}
          <div className="dial-group">
            <span>play</span>
            <button type="button" onClick={() => feel("done")}>done</button>
            <button type="button" onClick={() => feel("wrong")}>wrong</button>
          </div>
        </div>
        <button className="dial-toggle" type="button" aria-label="Preview controls"
          aria-expanded={dial} onClick={() => setDial((d) => !d)}>⚙</button>
      </div>
    </>
  );
}

/**
 * AN APP'S OWN FORM, WITH ONE FIELD THAT IS A VAULT FACT.
 *
 * ⚠️ THE POINT IS THAT THEY LOOK THE SAME. A vault fact is not a special control
 * an app opts into — it is an ordinary row that happens to save somewhere else,
 * and the only difference visible anywhere is a sign over the group and a line in
 * the sheet. A preview that gave it its own styling would be arguing for the
 * design the binding exists to avoid.
 *
 * ⚠️ AND THE SENTENCE COMES FROM `meaning`, not from here — the same function the
 * vault screen renders, given the same item. Typing the words beside the fixture
 * would make this picture prove that two copies agree, which is the one thing it
 * must not be able to show.
 */
function AppFields({ onSave, onOpenVault, onAsk }: {
  readonly onSave: (name: string, value: string) => Promise<Problem | null>;
  readonly onOpenVault: () => void;
  /* ⚠️ THE ONE SURFACE THIS PREVIEW COULD NOT REACH, WHICH IS THE ONE AN APP
     SPAWNS. The consent sheet was mounted here from the day it was written and
     nothing ever opened it — so every review of it was a review of the code. */
  readonly onAsk: () => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const height = VAULT_WHERES[0]!.items.find((i) => i.fact === "body.height")!;

  const fields: readonly EditableField[] = [
    {
      name: "gym", kind: "text", title: "Where you train", label: "Gym",
      value: "Haddad Strength, Achrafieh",
    },
    {
      name: "height", kind: "text", title: "Your height", label: "Height",
      value: "178 cm", fact: height.fact, kept: meaning(height, height.reach),
    },
  ];

  return (
    <div className="app-form">
      <Card className="entries">
        {fields.map((f) => (
          <Entry key={f.name} label={f.label} affordance={<Edit className="pencil" />} onEdit={() => setEditing(f.name)}>
            {f.value}
          </Entry>
        ))}
      </Card>
      {/* ⚠️ ONCE, UNDER THE GROUP. Said per row it is five repetitions of one fact
          about the account; said here it is a sign on a drawer. */}
      <KeptHere onOpen={onOpenVault} />
      {/* ⚠️ WHAT AN APP SHOWS WHERE A VAULT FACT IS NOT SHARED WITH IT: the empty
          state IS the ask, because a field that is simply missing teaches nobody
          that it could be filled. */}
      <AskForIt
        what="Your weight"
        then="Kova can chart it and set targets from it once you choose what it may see."
        onAsk={onAsk}
      />
      <ValueEditor
        field={fields.find((f) => f.name === editing) ?? null}
        onSave={onSave}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}

function Group<T extends string>({ label, value, options, onPick }: {
  readonly label: string;
  readonly value: string;
  readonly options: readonly T[];
  readonly onPick: (v: T) => void;
}) {
  return (
    <div className="dial-group">
      <span>{label}</span>
      {options.map((o) => (
        <button key={o} type="button" aria-pressed={o === value} onClick={() => onPick(o)}>{o}</button>
      ))}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Preview />);

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
import { AccountCenter } from "../src/account/center.js";
import { AccountDetails } from "../src/account/details.js";
import { AccountHome, type AccountHomeProps } from "../src/account/home.js";
import { PreferencesScreen, type Preferences } from "../src/account/preferences.js";
import { KeptHere, meaning, VaultScreen, type Kept, type Looked, type Where } from "../src/account/vault.js";
import { LegalScreen } from "../src/account/legal.js";
import type { Doc, Product } from "../src/account/wire.js";
import { transfersOf, type Held, type Receiving, type Subprocessor } from "@one/kernel";
import { ValueEditor, type EditableField } from "../src/editor.js";
import { Card, Entry } from "../src/list.js";
import { Edit } from "../src/icon.js";
import { ConsentSheet, type Asked } from "../src/consent.js";
import { SignInMethods } from "../src/account/signin.js";
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
} satisfies Pick<AccountHomeProps, "person" | "workspaces">;

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
} satisfies Record<string, Pick<AccountHomeProps, "person" | "workspaces">>;

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

const VAULT_WHERES: readonly Where[] = [
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
  ⚠️ ONE RECIPIENT INSIDE EUROPE, ONE UNDER AN ADEQUACY DECISION AND ONE UNDER
  CLAUSES CARRYING ARTICLE 9 DATA — because "does anything leave, and is any of
  it sensitive" is the question the summary answers, and a fixture where
  everything stays in the EEA is a picture of the one state that needs no answer.
*/
/*
  ⚠️ EVERY NAME HERE IS DELIBERATELY UNREAL, AND ON THIS SCREEN THAT IS NOT A
  STYLE CHOICE. A disclosure surface renders a claim about who controls somebody's
  data, where it is processed and what covers a transfer — so a fixture carrying a
  real company's name states, in a picture anybody may be shown, facts about a real
  business that nobody declared. The first version of this named a legal entity, a
  jurisdiction, a contact address on a live domain and an infrastructure footprint,
  all invented.

  ⚠️ IT FOLLOWS THE CONVENTION THE MANIFESTS ALREADY USE — `example.test`, and a
  controller that says it is an example. `hello`'s own governance declaration is
  written that way for the same reason, and this preview had simply not been held
  to it.
*/
const LEGAL_SUBPROCESSORS: readonly Subprocessor[] = [
  { id: "host", name: "The example host", role: "Runs it and stores what is in it", receives: ["identity", "usage", "content"], where: "Wherever the example runs", safeguard: "eea", terms: "https://example.test/host-dpa" },
  /* ⚠️ `eea` rather than `adequacy`, which is what covers a country OUTSIDE the
     union — declaring one for somewhere inside it is a contradiction the summary
     then reports as a transfer that never happens. */
  { id: "billing", name: "The example biller", role: "Takes payment", receives: ["identity", "contact", "financial"], where: "Inside the union", safeguard: "eea", terms: "https://example.test/billing-dpa" },
  { id: "model", name: "The example model", role: "Generates text and images", receives: ["content", "health"], where: "Outside the union", safeguard: "sccs", terms: "https://example.test/model-dpa", trust: "https://example.test/model-trust" },
];

/* What this example declares it holds — the other half `transfersOf` crosses. */
const LEGAL_HELD: readonly Held[] = [
  { id: "people", fields: {}, retention: { days: null, onTenantClose: "export-then-purge" },
    holding: { kind: "personal", categories: ["identity", "contact", "usage"], subjects: ["member"], purpose: "Running the example", basis: "contract" } },
  { id: "entries", fields: {}, retention: { days: null, onTenantClose: "export-then-purge" },
    holding: { kind: "personal", categories: ["content", "health"], subjects: ["member", "customer"], purpose: "What somebody records about themselves", basis: "consent", condition: "explicit_consent" } },
];

const LEGAL_RECEIVING: Receiving = {
  controller: "The example controls it.",
  contact: "privacy@example.test",
  regions: ["auto", "eu"],
  subprocessors: LEGAL_SUBPROCESSORS,
  inference: { ai: { auto: ["model"], eu: [] } },
  /*
    ⚠️ DERIVED BY THE KERNEL, NOT TYPED HERE. `transfersOf` crosses what this
    product HOLDS with what each recipient claims to receive, so a hand-written
    list can show a company receiving a category the app does not have — or, as
    the first attempt did, two transfers against three recipients, which made the
    summary read "2 of 2" and mean nothing.
  */
  transfers: transfersOf({ collections: LEGAL_HELD, subprocessors: LEGAL_SUBPROCESSORS }),
};

/* ⚠️ TWO PRODUCTS, because one is a picture of the state where the grouping does
   not matter. The second asks nothing outstanding, which is what most products a
   person belongs to look like. */
const LEGAL_PRODUCTS: readonly Product[] = [
  /* ⚠️ THE ACCOUNT FIRST, WITH AN EMPTY `appId` — how the runtime says "this is
     the deployment rather than a product". It has a controller and a contact and
     no recipients: every recipient in this platform receives a PRODUCT's data. */
  {
    appId: "", appName: "4°", roles: ["account"],
    docs: [
      { doc: { id: "account-terms", version: "2026-01-01", title: "Account terms", mustAccept: ["account"], body: "This covers your account itself, not any product you use it with.\n\nThe account is yours. You can take everything it holds, close it, and be forgotten." }, acceptedOn: "2 March", outstanding: false },
      { doc: { id: "account-privacy", version: "2026-01-01", title: "Privacy notice", mustAccept: ["account"], body: "We hold what your account is made of, and your vault — the sensitive things you record about yourself.\n\nThese are yours rather than any product's, which is why they survive leaving a workspace. No product sees one unless you grant it." }, acceptedOn: null, outstanding: true },
    ],
    receiving: {
      controller: "The example controls your account and your vault.",
      contact: "privacy@example.test",
      subprocessors: [], regions: [], inference: {}, transfers: [],
    },
  },
  { appId: "kova", appName: "Kova", roles: ["client", "owner"], docs: HELLO_DOCS, receiving: LEGAL_RECEIVING },
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

/** Long enough to see the spinner and know it is a wait, not a stutter. */
const ROUND_TRIP_MS = 900;

const asked = new URLSearchParams(location.hash.slice(1));

function Preview() {
  const [open, setOpen] = useState(true);
  /* ⚠️ IN THE HASH LIKE THE OTHER TWO, because the header above promises a state
     is a link and this was the one dial the promise did not cover — so every
     review of an inner screen began with three taps somebody had to be told. */
  const [at, setAt] = useState((asked.get("screen") ?? "home") as
    "home" | "details" | "signin" | "prefs" | "vault" | "legal");
  const [asking, setAsking] = useState(false);
  const [which, setWhich] = useState((asked.get("state") ?? "four") as keyof typeof CASES);
  const [outcome, setOutcome] = useState((asked.get("save") ?? "ok") as keyof typeof OUTCOMES);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [prefs, setPrefs] = useState<Preferences>({
    /* ⚠️ THE SHIPPED DEFAULTS, not a convenient pair. Sound on in the fixture
       makes every screenshot a picture of a setting nobody chose. */
    theme: "dark", units: "metric", language: "en", ...FEEDBACK_DEFAULT,
  });
  const [dial, setDial] = useState(false);

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

  const screen = ({ Heading }: { readonly Heading: ElementType }) =>
    at === "vault" ? (
      <VaultScreen
        wheres={which === "waiting" ? null : VAULT_WHERES}
        kept={which === "waiting" ? null : VAULT_KEPT}
        looks={which === "waiting" ? null : VAULT_LOOKS}
        Heading={Heading}
        onSet={save}
        onBack={() => setAt("home")}
      />
    ) :
    at === "prefs" ? (
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
        onBack={() => setAt("home")}
      />
    ) : at === "signin" ? (
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
        onBack={() => setAt("home")}
      />
    ) : at === "legal" ? (
      <LegalScreen
        products={which === "waiting" ? null : LEGAL_PRODUCTS}
        onAccept={save}
        onBack={() => setAt("home")}
        Heading={Heading}
      />
    ) : at === "home" ? (
      <AccountHome
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
        onGo={(to) => {
          if (to === "account.profile") setAt("details");
          if (to === "account.security") setAt("signin");
          if (to === "account.preferences") setAt("prefs");
          if (to === "account.vault") setAt("vault");
          if (to === "account.privacy") setAt("legal");
        }}
        onClose={() => setOpen(false)}
      />
    ) : (
      <AccountDetails
        person={(CASES[which] ?? CASES.four).person}
        since="4 March 2024"
        emailVerified
        Heading={Heading}
        onSave={save}
        onPickPhoto={() => undefined}
        onBack={() => setAt("home")}
      />
    );

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
        <AppFields onSave={save} onOpenVault={() => { setAt("vault"); setOpen(true); }} />
        <button type="button" onClick={() => setOpen(true)}>Open the account centre</button>
      </div>

      {/* ⚠️ THE LEVEL IS THE CALLER'S, WHICH IS WHY THE STACK IS HERE AND NOT
          INSIDE THE PRESENTATION. Navigation is the router's state in the real
          app and this preview's state here; a presentation that owned it would
          be a presentation that had to be told about every screen. */}
      <AccountCenter open={open} onClose={() => { setOpen(false); setAt("home"); }}>
        {({ Heading }) => (
          <Stack at={at === "home" ? null : at}>{screen({ Heading })}</Stack>
        )}
      </AccountCenter>

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
          <Group label="screen" value={at} options={["home", "details", "signin", "prefs", "vault", "legal"] as const} onPick={setAt} />
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
function AppFields({ onSave, onOpenVault }: {
  readonly onSave: (name: string, value: string) => Promise<Problem | null>;
  readonly onOpenVault: () => void;
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

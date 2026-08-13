/**
 * THE OPERATOR CONSOLE — the deployment's, not one product's.
 *
 * ⚠️ IT WAS ONE CONSOLE PER PRODUCT, and the cost was not tidiness. There is ONE
 * Stripe account, ONE Google account and ONE Turnstile widget behind every
 * product here, so three consoles meant three sign-ins and three places to paste
 * one key — and the copy nobody re-pasted failed in a way nobody attributed to
 * the rotation. The store is shared and its rows are keyed by app, so one door
 * writes them all.
 *
 * ⚠️ IT IS A PICKER FIRST AND A PANEL SECOND, because every question here starts
 * with "which product". A console that answered for whichever product happened
 * to be serving it is a console per product with extra steps.
 *
 * ⚠️ AND THE SHARED HALF IS ITS OWN PLACE RATHER THAN A COLUMN ON EVERY PRODUCT.
 * A key that belongs to the deployment shown inside each product's panel is a
 * key somebody edits from Kova's screen and is surprised to find changed in
 * Scena's — which is correct behaviour and reads as a bug, every time.
 */

import { useState, type ElementType, type ReactNode } from "react";
import type { Problem } from "@one/kernel";
import { Pill } from "../capsule.js";
import { Blank, Card, Entry, Item, Unset, Waiting } from "../list.js";
import { Choose } from "../choose.js";
import { Field } from "../field.js";
import { Mark } from "../mark.js";
import { Screen, Section, Title } from "../screen.js";
import { SwitchRow } from "../switch.js";
import { Tiles } from "../tiles.js";
import { money, type Included } from "./offer.js";
import type { Where } from "./routes.js";

/** One product, as `admin.apps` answers. */
export interface Product {
  readonly appId: string;
  readonly appName: string;
  readonly manifestVersion: string;
  /** How many plans carry an operator edit. `0` is a catalogue as shipped. */
  readonly changed: number;
}

export interface ConsoleProps {
  /** ⚠️ Null until known. `[]` is a deployment whose apps have not booted yet. */
  readonly products: readonly Product[] | null;
  readonly onGo: (to: Where) => void;
  readonly onBack: () => void;
  readonly Heading?: ElementType;
}

export function ConsoleScreen({ products, onGo, onBack, Heading = "h1" }: ConsoleProps): ReactNode {
  return (
    <Screen leave="up" onLeave={onBack} name="Console" sky="silk"
      title={<Title as={Heading}>Console</Title>}
      lede="Every product on this deployment, and what they all share."
    >
      <Section name="Products">
        {products === null ? <Waiting rows={2} /> : products.length === 0 ? (
          /*
            ⚠️ AN EMPTY LIST IS A DEPLOYMENT WHOSE PRODUCTS HAVE NOT BOOTED, not a
            deployment with none — a declaration is published on a worker's first
            request, so a product nobody has visited since it deployed is absent.
            Saying that is the difference between a screen somebody waits on and
            one they open a ticket about.
          */
          <Blank title="Nothing has reported in yet">
            A product publishes what it declares the first time it serves a request.
          </Blank>
        ) : (
          <Tiles
            tiles={products.map((p) => ({
              id: p.appId,
              name: p.appName,
              mark: <Mark kind="product" name={p.appName} />,
              /* ⚠️ THE ONE FACT WORTH A SECOND LINE: whether somebody has edited
                 what this product sells. A version number is texture. */
              ...(p.changed > 0 ? { said: `${p.changed} edited` } : {}),
              onGo: () => onGo({ at: "product-config", product: p.appId }),
            }))}
          />
        )}
      </Section>

      <Section name="Shared by all of them">
        <Card>
          {/*
            ⚠️ ONE PLACE FOR THE KEYS EVERY PRODUCT READS. This is the row that
            replaces pasting a Stripe key three times — and the reason a rotated
            key is now one edit rather than three, one of which is forgotten.
          */}
          <Item
            title="Shared configuration"
            detail="The one Stripe account, the one mail lane, the one Turnstile widget"
            onGo={() => onGo({ at: "shared-config" })}
          />
          {/*
            ⚠️ AND THE MODEL CATALOGUE, WHICH IS SHARED FOR THE SAME REASON THE
            KEYS ARE. A product declares what it ASKS a model for; which models
            exist, what they cost and what they are sold for is one list behind
            every one of them. It used to be per app, so a model added here
            reached nobody until each product was edited and redeployed.
          */}
          <Item title="Models" detail="Every model this deployment can run, what it costs and what it is sold for" onGo={() => onGo({ at: "models" })} />
          <Item title="Workspaces" detail="Every workspace on the deployment, whoever serves it" onGo={() => onGo({ at: "tenants" })} />
          <Item title="Maintenance" detail="Close every door, and say why" onGo={() => onGo({ at: "maintenance" })} />
        </Card>
      </Section>
    </Screen>
  );
}

/* ------------------------------------------------------------ one product --- */

/** One configuration key, as `admin.config` answers. */
export interface Key {
  readonly key: string;
  /** ⚠️ `true`/`false` for a SECRET: whether it is set, never what it is. */
  readonly value: string | boolean;
  readonly secret: boolean;
  readonly shared: boolean;
  readonly source: "app" | "shared" | "unset";
}

export interface KeysProps {
  /** The product these belong to, or `null` for the deployment's own shared store. */
  readonly product: { readonly id: string; readonly name: string } | null;
  readonly keys: readonly Key[] | null;
  readonly onEdit: (key: string) => void;
  readonly onBack: () => void;
  readonly Heading?: ElementType;
  /** ⚠️ False on a deployment that binds no shared store — said, never hidden. */
  readonly hasShared?: boolean;
}

/**
 * ⚠️ WHERE A VALUE CAME FROM IS THE COLUMN THAT MATTERS, and it is the one a
 * console usually omits. "It is set" and "it is set HERE" are different answers
 * with different fixes: an operator looking at a key that resolves from the
 * shared store and typing a local value has just pinned this product to a copy
 * that will not follow the next rotation, and nothing would tell them.
 */
export const saidAs = (key: Key): ReactNode => {
  if (key.source === "unset") return <Unset>Not set</Unset>;
  if (key.source === "shared") return <Pill tone="quiet">Shared</Pill>;
  return key.secret ? <Pill tone="ok">Set</Pill> : <span className="value">{String(key.value)}</span>;
};

export function KeysScreen({ product, keys, onEdit, onBack, Heading = "h1", hasShared = true }: KeysProps): ReactNode {
  return (
    <Screen leave="up" onLeave={onBack} name={product ? product.name : "Shared"} sky="silk"
      title={<Title as={Heading}>{product ? product.name : "Shared configuration"}</Title>}
      lede={product
        ? "What this product reads, and where each value comes from. A secret can be set and never read back."
        : "Set once here, read by every product. A secret can be set and never read back."}
    >
      {/*
        ⚠️ A DEPLOYMENT WITH NO SHARED STORE SAYS SO AT THE TOP, once. Every key
        below would otherwise resolve from this product alone and look correct —
        which it is, and which is not what somebody reading this screen assumes.
      */}
      {!hasShared ? (
        <Section>
          <p className="note">This deployment binds no shared configuration store, so nothing here is shared.</p>
        </Section>
      ) : null}

      <Section>
        {keys === null ? <Waiting rows={4} /> : keys.length === 0 ? (
          <Blank title="Nothing to configure">This product reads no configuration.</Blank>
        ) : (
          <Card>
            {keys.map((k) => (
              /*
                ⚠️ THE KEY IS THE TITLE, verbatim. It is what an operator finds it
                by, what a deploy guide names, and what a support conversation
                quotes — a friendly label here would be a second name for one
                thing, and the one people say out loud is whichever they saw.
              */
              <Item
                key={k.key}
                title={k.key}
                /*
                  ⚠️ THE STATE IS IN THE DETAIL, NOT THE ACTION SLOT. A row goes
                  somewhere or carries something on the right, never both — and
                  putting it right makes the row unpressable AND silently drops
                  what was in it. That is three times in this hub: a trial pill, a
                  credit pack's price, and this. The rule is `Item`'s own and it
                  bites every screen that has a value and a destination.
                */
                /*
                  ⚠️ THE STATE IS IN THE DETAIL, NOT THE ACTION SLOT. A row goes
                  somewhere or carries something on the right, never both — and
                  putting it right makes the row unpressable AND silently drops
                  what was in it. That is `Item`'s own rule and it has bitten four
                  screens in this hub.

                  ⚠️ AND "write-only" IS SAID ONCE FOR THE SCREEN rather than on
                  every secret row. Repeated per row it wrapped to two lines and
                  made the secrets the tallest, loudest things on a list whose
                  subject is which keys are SET — a rule stated four times is
                  texture, and the sheet that edits one says it again where it
                  actually matters.
                */
                detail={saidAs(k)}
                onGo={() => onEdit(k.key)}
              />
            ))}
          </Card>
        )}
      </Section>
    </Screen>
  );
}

/* --------------------------------------------------------------- catalogue --- */

/*
  ⚠️ THE SHELF'S OWN SHAPE, not a third copy. A plan's lines are `Included` in
  `offer.ts`; a console declaring its own would be the same list under two names,
  and the console is exactly where a mismatch would be read as a price change.
*/
export interface Plan {
  readonly id: string;
  readonly name: string;
  readonly price: { readonly minor: number; readonly currency: string };
  readonly period: "month" | "year";
  readonly trialDays: number;
  readonly includes: readonly Included[];
  /** ⚠️ Whether an operator has moved this plan away from what shipped. */
  readonly edited?: boolean;
}

export interface CatalogueProps {
  readonly product: { readonly id: string; readonly name: string };
  readonly plans: readonly Plan[] | null;
  readonly onEdit: (planId: string) => void;
  readonly onBack: () => void;
  readonly Heading?: ElementType;
}

/**
 * ⚠️ AN EDITED PLAN IS MARKED, AND THAT IS THE WHOLE REASON THE DECLARATION IS
 * PUBLISHED. Without the shipped catalogue beside the overrides, every price on
 * this screen looks like the one the product was built with — so an operator
 * cannot tell their own change from the app's default, and the question they
 * open this screen with has no answer on it.
 */
export function CatalogueScreen({ product, plans, onEdit, onBack, Heading = "h1" }: CatalogueProps): ReactNode {
  return (
    <Screen leave="up" onLeave={onBack} name={product.name} sky="silk"
      title={<Title as={Heading}>What {product.name} sells</Title>}
      lede="Declared by the product, and edited here."
    >
      <Section>
        {plans === null ? <Waiting rows={3} /> : plans.length === 0 ? (
          <Blank title="Not on sale">This product declares no plans.</Blank>
        ) : (
          <Card>
            {plans.map((p) => (
              <Item
                key={p.id}
                title={p.name}
                detail={
                  <>
                    {/* ⚠️ THE STOREFRONT'S OWN FORMATTER. A console with its own
                        is a console that can disagree with the price somebody was
                        actually charged, which is the one number here that has to
                        be right. */}
                    {money(p.price)} a {p.period}
                    {p.trialDays > 0 ? ` · ${p.trialDays} days free` : ""}
                    {p.edited ? <Pill tone="quiet">Edited</Pill> : null}
                  </>
                }
                onGo={() => onEdit(p.id)}
              />
            ))}
          </Card>
        )}
      </Section>
    </Screen>
  );
}

/* ------------------------------------------------------------- workspaces --- */

/** One workspace on the deployment, as `admin.tenants` answers. */
export interface Tenant {
  readonly tenantId: string;
  readonly appId: string;
  readonly slug: string;
  readonly region: string;
  readonly standing: string;
  readonly reason: string;
  readonly plan: string | null;
  readonly status: string | null;
  /** ⚠️ Whether the region would open. Reported, so a broken one is not blank. */
  readonly reachable: boolean;
}

export interface TenantsProps {
  readonly tenants: readonly Tenant[] | null;
  readonly onOpen: (tenantId: string) => void;
  readonly onSearch: (text: string) => void;
  readonly onBack: () => void;
  readonly Heading?: ElementType;
}

/**
 * EVERY WORKSPACE ON THE DEPLOYMENT, WHOEVER SERVES IT.
 *
 * ⚠️ IT SAYS WHICH PRODUCT ON EVERY ROW, and that is not decoration. A slug is
 * unique per PRODUCT rather than per deployment, so two businesses may both be
 * `haddad` — and a list that did not say so would show what reads as a duplicate
 * and let an operator act on the wrong one.
 *
 * ⚠️ AND A REGION THAT WILL NOT OPEN IS SAID, not left blank. The plan and the
 * standing are read from the workspace's own region one at a time; a region that
 * is down produces a row with no plan on it, which is indistinguishable from a
 * workspace on no plan — and those two want opposite responses.
 */
export function TenantsScreen({ tenants, onOpen, onSearch, onBack, Heading = "h1" }: TenantsProps): ReactNode {
  return (
    <Screen leave="up" onLeave={onBack} name="Workspaces" sky="silk"
      title={<Title as={Heading}>Workspaces</Title>}
      lede="Every workspace on this deployment, whichever product serves it."
    >
      <Section>
        <Field label="Find one" value="" onValue={onSearch} clearable />
      </Section>
      <Section>
        {tenants === null ? <Waiting rows={5} /> : tenants.length === 0 ? (
          <Blank title="No workspace matches">Nothing on this deployment goes by that.</Blank>
        ) : (
          <Card>
            {tenants.map((t) => (
              <Item
                key={t.tenantId}
                mark={<Mark kind="workspace" name={t.slug} product={t.appId} />}
                title={t.slug}
                /*
                  ⚠️ THE PRODUCT, THE PLAN AND WHAT IS WRONG, in that order — which
                  is the order an operator scanning this list needs them. The
                  region is absent on purpose: it matters when something is broken,
                  and then it is on the row that says so.
                */
                detail={
                  <>
                    {t.appId} · {t.plan ?? "no plan"}
                    {t.standing !== "active" ? <Pill tone="warn">{t.reason}</Pill> : null}
                    {!t.reachable ? <Pill tone="alarm">{t.region} unreachable</Pill> : null}
                  </>
                }
                onGo={() => onOpen(t.tenantId)}
              />
            ))}
          </Card>
        )}
      </Section>
    </Screen>
  );
}

/* ------------------------------------------------------------ maintenance --- */

export type Mode = "off" | "readonly" | "full";

export interface MaintenanceProps {
  readonly mode: Mode;
  readonly message: string;
  readonly onSet: (mode: Mode, message: string) => Promise<Problem | null>;
  readonly onBack: () => void;
  readonly Heading?: ElementType;
}

/*
  ⚠️ WHAT EACH RUNG ACTUALLY DOES, in the words of somebody who would meet it.
  "readonly" is a mode name; "writes are refused and nobody is signed out" is
  what an operator is deciding between, and the difference is whether people lose
  what they were in the middle of.
*/
export const MODES: readonly { readonly value: Mode; readonly label: string; readonly detail: string }[] = [
  { value: "off", label: "Open", detail: "Everything works" },
  { value: "readonly", label: "Read-only", detail: "Writes are refused, reads are served, nobody is signed out" },
  { value: "full", label: "Closed", detail: "The product is withheld, sign-in is disabled, every session but an operator's ends" },
];

/**
 * THE ONE SWITCH THAT CLOSES EVERY DOOR.
 *
 * ⚠️ IT IS DEPLOYMENT-WIDE AND SAYS SO, because it is the one control here that
 * is not about a product. `platform_state` holds one row for the whole
 * deployment — deliberately, so the switch cannot half-apply — which also means
 * there is no way to take one product down and leave the others up.
 *
 * ⚠️ AND CLOSING REQUIRES A MESSAGE. A deployment that has vanished with nothing
 * on the screen is one whose customers conclude it is gone; the server refuses a
 * close with no message, and so does this.
 */
export function MaintenanceScreen({ mode, message, onSet, onBack, Heading = "h1" }: MaintenanceProps): ReactNode {
  const [choosing, setChoosing] = useState(false);
  const [said, setSaid] = useState(message);
  /* ⚠️ A RUNG THIS SCREEN DOES NOT KNOW IS SHOWN AS ITSELF, never as the first
     one. The mode arrives off the wire, so a deployment ahead of this bundle can
     send a word that is not in the list — and defaulting to "Open" would report a
     closed deployment as open, which is the one wrong answer that matters here. */
  const now = MODES.find((m) => m.value === mode) ?? { value: mode, label: mode, detail: "" };

  return (
    <Screen leave="up" onLeave={onBack} name="Maintenance" sky="silk"
      title={<Title as={Heading}>Maintenance</Title>}
      lede="One switch, every product on this deployment."
    >
      <Section>
        <Card>
          <Item title="Right now" detail={now.detail} action={<Pill tone={mode === "off" ? "ok" : "warn"}>{now.label}</Pill>} />
        </Card>
      </Section>

      <Section name="What people are told">
        <Card>
          <Entry label="Message" affordance={null}>
            <Field
              label="Message"
              value={said}
              onValue={setSaid}
              under="Shown on every door while it is closed. Required to close."
            />
          </Entry>
        </Card>
      </Section>

      <Section>
        <Card>
          <Item title="Change it" detail={`Currently ${now.label.toLowerCase()}`} onGo={() => setChoosing(true)} />
        </Card>
      </Section>

      <Choose
        open={choosing}
        title="Maintenance"
        options={MODES.map((m) => ({ value: m.value, label: m.label, detail: m.detail }))}
        value={mode}
        onPick={(next) => onSet(next, said)}
        onClose={() => setChoosing(false)}
      />
    </Screen>
  );
}

/* ---------------------------------------------------------------- models --- */

/** One model in the deployment's catalogue, as `admin.models` answers. */
export interface Model {
  readonly id: string;
  readonly provider: string;
  readonly lanes: readonly string[];
  readonly enabled: boolean;
  /** ⚠️ When the provider switches it off, where the provider has said so. */
  readonly retiresAt?: string;
  /** ⚠️ And what it names to move to. Read from the page, not decided here. */
  readonly replacedBy?: string;
  readonly markup: number;
  readonly thinking: boolean;
  readonly cost: { readonly input: number; readonly output: number; readonly perOutput: number | null };
  readonly price: { readonly input: number; readonly output: number; readonly perOutput: number | null };
  /** ⚠️ Why this row cannot be metered, if it cannot. Said, never hidden. */
  readonly problems: readonly string[];
}

export interface ModelsProps {
  readonly models: readonly Model[] | null;
  /** ⚠️ Handed over rather than written here — see `laneNames`. */
  readonly lanes: readonly string[];
  readonly onEdit: (id: string | null) => void;
  readonly onEnabled: (id: string, enabled: boolean) => Promise<Problem | null>;
  /** ⚠️ Read both price lists now. Absent where a deployment cannot reach them. */
  readonly onSync?: () => Promise<Problem | null>;
  readonly onBack: () => void;
  readonly Heading?: ElementType;
  /** ⚠️ False on a deployment that binds no shared store — said, never hidden. */
  readonly hasShared?: boolean;
}

/**
 * ⚠️ WHAT A LANE IS, IN THE WORDS OF WHOEVER PICKS ONE. `transcribe` is a column
 * name; "a recording in, words out" is the thing an operator is deciding about.
 *
 * ⚠️ AND AN UNKNOWN LANE PRINTS ITSELF rather than falling back to a friendly
 * word. The list travels from the platform, so a lane this bundle has not
 * learned yet is a deployment that is ahead of it — and showing it as "Text"
 * would be a confident wrong answer about what a model does.
 */
export const laneNames: Readonly<Record<string, string>> = {
  text: "Words in, words out",
  vision: "A picture in, words out",
  image: "Words in, pictures out",
  speech: "Words in, a voice out",
  transcribe: "A recording in, words out",
  video: "Words in, video out",
};

/**
 * ⚠️ THE MARGIN, AS A PERCENTAGE, because that is how anybody thinks about it. A
 * multiplier is what the arithmetic wants and `1.4` is not what somebody means
 * when they say "forty per cent".
 */
export const marginOf = (markup: number): string => `${Math.round((markup - 1) * 100)}%`;

/**
 * EVERY MODEL THIS DEPLOYMENT CAN RUN.
 *
 * ⚠️ COST AND PRICE ON THE SAME ROW. Either one alone answers neither question an
 * operator has — "are we losing money on this" needs both, and a markup shown
 * without the number it multiplies is a percentage of something invisible.
 *
 * ⚠️ AND A ROW THAT CANNOT BE METERED SAYS SO RATHER THAN BEING HIDDEN. Hidden,
 * an operator sees a model they added simply not appear, with nothing anywhere
 * saying why — and the row it is missing from is the one that decides whether
 * every call to it is free.
 */
export function ModelsScreen({
  models, lanes, onEdit, onEnabled, onSync, onBack, Heading = "h1", hasShared = true,
}: ModelsProps): ReactNode {
  /* ⚠️ A MODEL APPEARS UNDER EVERY LANE IT SERVES, because it does. A Gemini
     text model is priced for pictures on the same row, and showing it under one
     heading would put a vision model in a catalogue where the vision section
     looks empty. */
  const byLane = lanes
    .map((lane) => [lane, (models ?? []).filter((m) => m.lanes.includes(lane))] as const)
    .filter(([, rows]) => rows.length > 0);

  return (
    <Screen leave="up" onLeave={onBack} name="Models" sky="silk"
      title={<Title as={Heading}>Models</Title>}
      lede="Every model this deployment can run. Products ask for a lane; what is in one is this list."
    >
      {hasShared ? (
        <Section>
          <Card>
            <Item title="Add a model" detail="A provider path, what it costs, and what it is sold for" onGo={() => onEdit(null)} />
            {/*
              ⚠️ READING THE PRICE LISTS IS A BUTTON AS WELL AS A DAILY JOB. A
              sync that only ran on a schedule is one an operator cannot use at
              the moment they need it — the morning a provider announces a
              shutdown, or straight after adding the key that makes a lane usable.
            */}
            {onSync ? (
              <Item title="Read the price lists" detail="Cloudflare and Google, as they publish them" onGo={() => void onSync()} />
            ) : null}
          </Card>
        </Section>
      ) : null}

      {!hasShared ? (
        <Section>
          <p className="note">This deployment binds no shared configuration store, so there is nowhere to keep a catalogue.</p>
        </Section>
      ) : null}

      {models === null ? <Section><Waiting rows={4} /></Section> : models.length === 0 ? (
        <Section>
          {/*
            ⚠️ AN EMPTY CATALOGUE IS THE STARTING STATE, NOT A FAULT — and it is
            also the state in which every AI action in every product refuses. A
            blank that did not say so would be a deployment quietly unable to
            generate anything, on a screen that looked finished.
          */}
          <Blank title="No models yet">
            Until one is added, every product's AI actions refuse — there is nothing for them to run on.
          </Blank>
        </Section>
      ) : byLane.map(([lane, rows]) => (
        <Section key={lane} name={laneNames[lane] ?? lane}>
          <Card>
            {rows.map((m) => (
              <Item
                key={m.id}
                title={m.id}
                detail={
                  <>
                    {m.provider}
                    {m.thinking ? <Pill tone="quiet">Reasons</Pill> : null}
                    {!m.enabled ? <Pill tone="quiet">Off</Pill> : null}
                    {/*
                      ⚠️ THE MARGIN IS THE NUMBER THIS SCREEN EXISTS FOR, so it is
                      on the row rather than one press away. An operator scanning
                      a catalogue is checking exactly this.
                    */}
                    {m.enabled && !m.problems.length ? ` · ${marginOf(m.markup)} margin` : ""}
                    {/*
                      ⚠️ A RETIREMENT IS SAID BEFORE IT HAPPENS, not after. One an
                      operator learns about from a failing generation is one they
                      had a month of warning about on a screen that never showed
                      it — and the replacement is named, because the provider
                      names it.
                    */}
                    {m.retiresAt ? (
                      <Pill tone="warn">
                        {m.replacedBy ? `Retires ${m.retiresAt} → ${m.replacedBy}` : `Retires ${m.retiresAt}`}
                      </Pill>
                    ) : null}
                    {m.problems.length ? <Pill tone="alarm">{m.problems[0]}</Pill> : null}
                  </>
                }
                onGo={() => onEdit(m.id)}
              />
            ))}
          </Card>
        </Section>
      ))}

      {/*
        ⚠️ TAKING ONE OUT OF SERVICE IS ITS OWN CONTROL, and it is not a delete.
        The row carries the rate every past generation was settled against, so
        deleting it makes a bill unreadable to answer a question a switch answers.
      */}
      {models && models.length > 0 ? (
        <Section name="In service">
          <Card>
            {models.map((m) => (
              <SwitchRow
                key={m.id}
                title={m.id}
                detail={m.enabled ? "Offered to every product" : "Offered to nobody; workspaces on it fall back"}
                on={m.enabled}
                onChange={(next) => onEnabled(m.id, next)}
              />
            ))}
          </Card>
        </Section>
      ) : null}
    </Screen>
  );
}

/**
 * THE CONFIGURATION SURFACE — the one screen a deployment cannot be run without.
 *
 * ⚠️ THE BOOTSTRAP IS THE THING TO UNDERSTAND BEFORE CHANGING ANY OF THIS. A
 * fresh deployment cannot send email until a mail provider is configured;
 * reaching this screen needs an operator session, which needs a code, which
 * needs email. No screen can break that circle — provisioning has to seed the
 * first rows, because a workflow with database access can do what a login
 * cannot. What this surface is for is the second day and every day after.
 */

import type { AnyOperation, AppSpec, BindingSpec, ConfigRegistry, Instant, ModelSpec, SqlHandle } from "@one/kernel";
import { LANES, modelProblems, operation, priced, s } from "@one/kernel";
import { DEPLOYMENT_SCOPE, lines, readAll, readCatalogue, refuseModel, refuseWrite, setModelEnabled, writeModel, writeOne } from "./config.js";
import { chooseProvider, send, type Deliver } from "./mail.js";
import { OPERATE } from "./operator-ops.js";

/** ⚠️ A symbol, so an app cannot reach the secret store by writing a property name. */
export const CONFIG = Symbol.for("one.runtime.config");

export interface ConfigDeps {
  /**
   * This app's own store. Always present.
   *
   * ⚠️ IT IS THE SAME PHYSICAL DATABASE AS EVERY OTHER APP'S, and `appId` below
   * is what makes "own" true. Bound with the same id into every worker, this
   * store held one `app_config` row per key for the whole deployment.
   */
  readonly own: SqlHandle;
  /** ⚠️ Whose rows in it. Never a default — see `readAll`. */
  readonly appId: string;
  /**
   * EVERY PRODUCT ON THIS DEPLOYMENT, so the console can be the deployment's
   * rather than one product's.
   *
   * ⚠️ THIS IS WHAT REPLACES A CONSOLE PER APP. Running three products used to
   * mean three operator doors, three sign-ins and three places to paste one
   * Stripe key — and the key is one key, because there is one Stripe account
   * behind every product. The store is shared and the rows are keyed by app, so
   * one door can write them all; this list is what says which apps exist.
   *
   * ⚠️ AND IT IS NOT A PUSH. `kernel/config.ts` rejects a central service that
   * pushes configuration into each product — a privileged write endpoint in
   * every app, authenticated by a machine token, accepting secret keys. Nothing
   * here pushes anything: it is one database, one human session, and each worker
   * still reads only its own rows.
   */
  readonly products: readonly string[];
  /** ⚠️ Injected, so the one file that reaches the network is the one that sends. */
  readonly deliver: Deliver | null;
  /** ⚠️ Null where a deployment binds no shared store, which is most of them. */
  readonly shared: SqlHandle | null;
  readonly registry: ConfigRegistry;
}

export interface ConfigCarrier { readonly [CONFIG]: ConfigDeps }

const deps = (ctx: unknown): ConfigDeps => (ctx as ConfigCarrier)[CONFIG];

/**
 * WHICH PRODUCT AN OPERATOR IS ACTING ON, CHECKED IN ONE PLACE.
 *
 * ⚠️ AN UNDECLARED APP IS REFUSED RATHER THAN WRITTEN. The store is keyed by
 * app, so a typo does not fail — it files a real Stripe key under a product that
 * does not exist, where nothing will ever read it and nothing will ever say so.
 * That is the same failure an undeclared KEY has, one level up, and it is
 * refused for the same reason.
 *
 * ⚠️ AND ABSENT IS THE APP SERVING THE REQUEST, so an app that has not been told
 * about the console still configures itself. A default of "the first product"
 * would make the answer depend on a list's order.
 */
const appOf = (d: ConfigDeps, ctx: { fail(code: string, meta?: Record<string, string | number | boolean>): never }, asked: string | undefined): string => {
  if (asked === undefined || asked === d.appId) return d.appId;
  if (!d.products.includes(asked)) {
    ctx.fail("platform.invalid", { field: "app", reason: "not a product on this deployment" });
  }
  return asked;
};

export function configOperations<B extends BindingSpec>(app: AppSpec<B>): readonly AnyOperation[] {
  const read = operation({
    id: "admin.config",
    kind: "read",
    summary: "Every key this deployment reads, where its value comes from, and whether it is set.",
    input: s.object({ app: s.optional(s.text({ max: 60 })) }),
    output: s.object({ app: s.text(), products: s.json(), keys: s.json(), shared: s.bool() }),
    permission: OPERATE,
    idempotency: { mode: "none" },
    /*
      ⚠️ NOT A TOOL, even redacted. The shape of a deployment's configuration —
      which providers are on, which lane, what is missing — is reconnaissance,
      and a model that can request it can be asked to put it somewhere.
    */
    tool: false,
    async handler(ctx, input: { app?: string }) {
      const d = deps(ctx);
      const app = appOf(d, ctx, input.app);
      return {
        app,
        /* ⚠️ WHICH PRODUCTS THERE ARE TO CHOOSE BETWEEN, in the same answer. A
           console that had to be told separately is one whose picker can list an
           app the read then refuses. */
        products: d.products,
        keys: lines(await readAll(d.own, app), await readAll(d.shared, DEPLOYMENT_SCOPE), d.registry),
        /* ⚠️ Whether there IS a shared store, so "shared" is not a lie on a self-host. */
        shared: d.shared !== null,
      };
    },
  });

  const write = operation({
    id: "admin.config.set",
    kind: "write",
    summary: "Set one key, for this app or for every app behind it.",
    input: s.object({
      key: s.text({ min: 1, max: 120 }),
      /* ⚠️ Empty is a legitimate value: it is how a key is turned off. */
      value: s.text({ max: 4_000 }),
      scope: s.enum(["app", "shared"]),
      /* ⚠️ Which product's row. Absent is the one serving the request. */
      app: s.optional(s.text({ max: 60 })),
    }),
    output: s.object({ key: s.text(), scope: s.text(), app: s.text() }),
    permission: OPERATE,
    idempotency: { mode: "none" },
    /*
      ⚠️ THE KEY IS AUDITED AND THE VALUE IS NOT. An audit trail holding secret
      keys is a second copy of every secret, in a table built to be kept forever
      and read by people investigating something else.
    */
    audit: (i: { key: string }) => ({ subject: i.key, verb: "configure" }),
    outcome: { message: "Saved", tone: "success", invalidates: ["admin.config"] },
    fails: ["platform.invalid", "platform.unavailable"],
    tool: false,
    async handler(ctx, input: { key: string; value: string; scope: "app" | "shared"; app?: string }) {
      const d = deps(ctx);
      const app = appOf(d, ctx, input.app);
      const refused = refuseWrite(input.key, input.scope, d.registry);
      /*
        ⚠️ AN UNDECLARED KEY IS REFUSED RATHER THAN STORED. Stored, it is a row
        an operator can see on a screen and no consumer will ever read — which
        looks exactly like a setting that does not work, and a typo in a key name
        is the ordinary way to produce one.
      */
      if (refused === "unknown_key") ctx.fail("platform.invalid", { field: "key", reason: "not a key this deployment reads" });
      if (refused === "not_shareable") {
        ctx.fail("platform.invalid", { field: "scope", reason: "this key is deliberately per-app — see its declaration" });
      }
      if (input.scope === "shared" && !d.shared) {
        ctx.fail("platform.unavailable", { reason: "this deployment binds no shared configuration store" });
      }

      await writeOne(
        input.scope === "shared" ? d.shared! : d.own,
        input.scope === "shared" ? DEPLOYMENT_SCOPE : app,
        input.key, input.value, ctx.now() as Instant,
      );
      return { key: input.key, scope: input.scope, app };
    },
  });

  /* ------------------------------------------------------------- models --- */

  /*
    ⚠️ ONLY WHERE AN APP GENERATES. A catalogue screen in a product that asks no
    model anything is a surface that can only ever be wrong — and mounting it
    would make "which models are on" a question about a deployment rather than
    about a product.
  */
  /*
    ⚠️ THE CATALOGUE IS THE DEPLOYMENT'S AND SO IS THIS SCREEN — mounted on every
    operator door, whether or not the app behind it generates anything. It used
    to be mounted only where an app declared models, which was correct while the
    models WERE the app's; now a deployment that has not yet added one is exactly
    the deployment that most needs the screen.
  */
  const catalogue = [
    operation({
      id: "admin.models",
      kind: "read",
      summary: "Every model this deployment can run, what it costs, and what it is sold for.",
      input: s.object({}),
      output: s.object({ models: s.json(), lanes: s.json(), shared: s.bool() }),
      permission: OPERATE,
      idempotency: { mode: "none" },
      async handler(ctx) {
        const d = deps(ctx);
        const rows = await readCatalogue(d.shared);
        return {
          /*
            ⚠️ COST AND PRICE ON THE SAME ROW. A console that showed only one of
            them cannot answer either question an operator has — "are we losing
            money on this" needs both, and a markup shown without the number it
            multiplies is a percentage of something invisible.
          */
          models: rows.map((m) => {
            const sold = priced(m);
            return {
              id: m.id, provider: m.provider, lane: m.lane, enabled: m.enabled,
              markup: m.markup, thinking: m.thinking ?? false,
              cost: { input: m.rate.input, output: m.rate.output, perOutput: m.perOutput ?? null, attachmentUnits: m.attachmentUnits ?? null },
              price: { input: sold.rate.input, output: sold.rate.output, perOutput: sold.perOutput ?? null },
              /* ⚠️ A row that cannot be metered says so rather than being hidden:
                 hidden, an operator sees a model they added simply not appear. */
              problems: modelProblems(m),
            };
          }),
          lanes: LANES,
          shared: Boolean(d.shared),
        };
      },
    }),
    operation({
      id: "admin.models.set",
      kind: "write",
      summary: "Add a model, or change what it costs and what it is sold for.",
      input: s.object({
        id: s.text({ min: 1, max: 200 }),
        provider: s.text({ min: 1, max: 60 }),
        lane: s.text({ min: 1, max: 20 }),
        input: s.number({ min: 0 }),
        output: s.number({ min: 0 }),
        perOutput: s.optional(s.number({ min: 0 })),
        attachmentUnits: s.optional(s.number({ min: 0 })),
        markup: s.number({ min: 0 }),
        thinking: s.optional(s.bool()),
      }),
      output: s.object({ id: s.text() }),
      permission: OPERATE,
      idempotency: { mode: "natural", key: "id" },
      audit: (i: { id: string }) => ({ subject: i.id, verb: "price" }),
      outcome: { message: "Published", tone: "success", invalidates: ["admin.models"] },
      fails: ["platform.invalid", "platform.unavailable"],
      tool: false,
      async handler(ctx, input: {
        id: string; provider: string; lane: string; input: number; output: number;
        perOutput?: number; attachmentUnits?: number; markup: number; thinking?: boolean;
      }) {
        const d = deps(ctx);
        if (!d.shared) ctx.fail("platform.unavailable", { reason: "this deployment binds no shared configuration store" });

        const model: ModelSpec = {
          id: input.id, provider: input.provider, lane: input.lane as ModelSpec["lane"],
          rate: { input: input.input, output: input.output },
          ...(input.perOutput === undefined ? {} : { perOutput: input.perOutput }),
          ...(input.attachmentUnits === undefined ? {} : { attachmentUnits: input.attachmentUnits }),
          markup: input.markup,
          ...(input.thinking === undefined ? {} : { thinking: input.thinking }),
          enabled: true,
        };
        /*
          ⚠️ REFUSED ON THE WAY IN, and every one of these is a row that would
          have worked. A rate of zero makes the model unmetered for EVERY app
          behind this store — reserve zero, settle zero, balance never moves,
          provider invoices as usual. A markup of zero sells every call at cost.
          An attaching lane with no attachment price is the expensive one,
          because it SUCCEEDS and scales with use.
        */
        const wrong = refuseModel(model);
        if (wrong.length) ctx.fail("platform.invalid", { field: "rate", reason: wrong[0]! });

        await writeModel(d.shared!, model, ctx.now() as Instant);
        return { id: input.id };
      },
    }),
    operation({
      id: "admin.models.enabled",
      kind: "write",
      summary: "Take a model in or out of service, everywhere.",
      input: s.object({ id: s.text({ min: 1, max: 200 }), enabled: s.bool() }),
      output: s.object({ id: s.text(), enabled: s.bool() }),
      permission: OPERATE,
      idempotency: { mode: "natural", key: "id" },
      audit: (i: { id: string; enabled: boolean }) => ({ subject: i.id, verb: i.enabled ? "enable" : "disable" }),
      outcome: { message: "Saved", tone: "success", invalidates: ["admin.models"] },
      fails: ["platform.invalid", "platform.unavailable"],
      tool: false,
      async handler(ctx, input: { id: string; enabled: boolean }) {
        const d = deps(ctx);
        if (!d.shared) ctx.fail("platform.unavailable", { reason: "this deployment binds no shared configuration store" });
        /*
          ⚠️ TURNING ONE OFF IS NOT DELETING IT. The row carries the rate every
          past generation settled against; deleting it makes a bill unreadable to
          answer a question a flag answers. Workspaces pinned to it fall back to
          the cheapest eligible model and their screen says the pick is no longer
          offered — see `chooseModel`.
        */
        const found = await setModelEnabled(d.shared!, input.id, input.enabled, ctx.now() as Instant);
        if (!found) ctx.fail("platform.invalid", { field: "id", reason: "no model in the catalogue goes by that" });
        return { id: input.id, enabled: input.enabled };
      },
    }),
  ];

  /* --------------------------------------------------------------- mail --- */

  /*
    ⚠️ "AND PROVE IT WORKS" IS THE HALF THAT IS USUALLY MISSING. A configuration
    screen that accepts a key and says "Saved" has told an operator nothing: the
    first real message is a sign-in code, and the person who does not receive it
    cannot report what they did not get. One button that actually sends is the
    difference between a deployment somebody has configured and one somebody
    believes they have configured.
  */
  const prove = operation({
    id: "admin.email.test",
    kind: "write",
    summary: "Send a message to an address you can check, and report what happened.",
    input: s.object({ to: s.text({ min: 3, max: 200 }) }),
    output: s.object({ sent: s.bool(), provider: s.optional(s.text()), why: s.optional(s.text()) }),
    permission: OPERATE,
    idempotency: { mode: "none" },
    audit: (i: { to: string }) => ({ subject: i.to, verb: "test-email" }),
    /*
      ⚠️ NOT A TOOL. It sends mail to an address in its input, which is a spam
      cannon with a permission check in front of it.
    */
    tool: false,
    async handler(ctx, input: { to: string }) {
      const d = deps(ctx);
      const values = { ...(await readAll(d.shared, DEPLOYMENT_SCOPE)), ...nonEmpty(await readAll(d.own, d.appId)) };
      const out = await send(values, {
        to: input.to,
        subject: "Test message",
        body: "This is a test from your deployment's configuration screen. If you are reading it, mail is working.",
      }, d.deliver, ctx.now() as Instant);

      /*
        ⚠️ A FAILURE IS AN ANSWER, NOT A PROBLEM. Refusing the request with a 503
        would tell an operator that the CONSOLE is broken; what they asked was
        whether the mail lane is, and "no, because no sender is configured" is
        the useful version of that.
      */
      return out.ok
        ? { sent: true, provider: out.provider }
        : { sent: false, why: out.why };
    },
  });

  const lane = operation({
    id: "admin.email",
    kind: "read",
    summary: "Which provider this deployment sends with, or what is missing.",
    input: s.object({}),
    output: s.object({ ready: s.bool(), provider: s.optional(s.text()), from: s.optional(s.text()), why: s.optional(s.text()) }),
    permission: OPERATE,
    idempotency: { mode: "none" },
    async handler(ctx) {
      const d = deps(ctx);
      const values = { ...(await readAll(d.shared, DEPLOYMENT_SCOPE)), ...nonEmpty(await readAll(d.own, d.appId)) };
      const chosen = chooseProvider(values);
      return chosen.ok
        ? { ready: true, provider: chosen.provider, from: chosen.from }
        : { ready: false, why: chosen.why };
    },
  });

  return [read, write, lane, prove, ...catalogue] as unknown as readonly AnyOperation[];
}

/**
 * ⚠️ NON-EMPTY WINS, NOT PRESENT WINS — the same rule the resolver follows, and
 * for the same reason: every consumer reads `""` as unconfigured, so a blank
 * local row must fall THROUGH to the shared value rather than mask it.
 */
const nonEmpty = (values: Readonly<Record<string, string>>): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) if (value !== "") out[key] = value;
  return out;
};

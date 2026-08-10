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

import type { AnyOperation, AppSpec, BindingSpec, ConfigRegistry, Instant, SqlHandle } from "@one/kernel";
import { modelFor, operation, s } from "@one/kernel";
import { lines, readAll, readRates, refuseRate, refuseWrite, writeOne, writeRate } from "./config.js";
import { chooseProvider, send, type Post } from "./mail.js";
import { OPERATE } from "./operator-ops.js";

/** ⚠️ A symbol, so an app cannot reach the secret store by writing a property name. */
export const CONFIG = Symbol.for("one.runtime.config");

export interface ConfigDeps {
  /** This app's own store. Always present. */
  readonly own: SqlHandle;
  /** ⚠️ Injected, so the one file that reaches the network is the one that sends. */
  readonly post: Post;
  /** ⚠️ Null where a deployment binds no shared store, which is most of them. */
  readonly shared: SqlHandle | null;
  readonly registry: ConfigRegistry;
}

export interface ConfigCarrier { readonly [CONFIG]: ConfigDeps }

const deps = (ctx: unknown): ConfigDeps => (ctx as ConfigCarrier)[CONFIG];

export function configOperations<B extends BindingSpec>(app: AppSpec<B>): readonly AnyOperation[] {
  const read = operation({
    id: "admin.config",
    kind: "read",
    summary: "Every key this deployment reads, where its value comes from, and whether it is set.",
    input: s.object({}),
    output: s.object({ keys: s.json(), shared: s.bool() }),
    permission: OPERATE,
    idempotency: { mode: "none" },
    /*
      ⚠️ NOT A TOOL, even redacted. The shape of a deployment's configuration —
      which providers are on, which lane, what is missing — is reconnaissance,
      and a model that can request it can be asked to put it somewhere.
    */
    tool: false,
    async handler(ctx) {
      const d = deps(ctx);
      return {
        keys: lines(await readAll(d.own), await readAll(d.shared), d.registry),
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
    }),
    output: s.object({ key: s.text(), scope: s.text() }),
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
    async handler(ctx, input: { key: string; value: string; scope: "app" | "shared" }) {
      const d = deps(ctx);
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

      await writeOne(input.scope === "shared" ? d.shared! : d.own, input.key, input.value, ctx.now() as Instant);
      return { key: input.key, scope: input.scope };
    },
  });

  /* ------------------------------------------------------------- models --- */

  /*
    ⚠️ ONLY WHERE AN APP GENERATES. A catalogue screen in a product that asks no
    model anything is a surface that can only ever be wrong — and mounting it
    would make "which models are on" a question about a deployment rather than
    about a product.
  */
  const catalogue = app.ai
    ? [
        operation({
          id: "admin.models",
          kind: "read",
          summary: "What each model this app uses costs, and where that number came from.",
          input: s.object({}),
          output: s.object({ models: s.json() }),
          permission: OPERATE,
          idempotency: { mode: "none" },
          async handler(ctx) {
            const d = deps(ctx);
            const rates = await readRates(d.shared);
            /*
              ⚠️ THE APP'S OWN LIST IS WHAT IS SHOWN, priced by the shared
              catalogue where it has an answer. Listing every row in the shared
              store instead would show an operator models this product cannot
              ask anything — which reads as a feature that is switched off.
            */
            return {
              models: app.ai!.models.map((declared) => {
                const live = modelFor(app.ai!, declared.id, rates)!;
                return {
                  id: live.id, provider: live.provider,
                  rate: live.rate, thinking: live.thinking ?? false,
                  /* ⚠️ Which number is in force, so a stale shared rate is visible. */
                  source: rates[declared.id] ? "shared" : "app",
                  declared: declared.rate,
                };
              }),
            };
          },
        }),
        operation({
          id: "admin.models.rate",
          kind: "write",
          summary: "Publish what a model costs, for every app behind this deployment.",
          input: s.object({
            id: s.text({ min: 1, max: 200 }),
            input: s.number({ min: 0 }),
            output: s.number({ min: 0 }),
            thinking: s.optional(s.bool()),
          }),
          output: s.object({ id: s.text() }),
          permission: OPERATE,
          idempotency: { mode: "natural", key: "id" },
          audit: (i: { id: string }) => ({ subject: i.id, verb: "price" }),
          outcome: { message: "Published", tone: "success", invalidates: ["admin.models"] },
          fails: ["platform.invalid", "platform.unavailable"],
          tool: false,
          async handler(ctx, input: { id: string; input: number; output: number; thinking?: boolean }) {
            const d = deps(ctx);
            /*
              ⚠️ A RATE FOR A MODEL THIS APP DOES NOT DECLARE IS REFUSED. Nothing
              here can supply the system text, the output ceiling or the daily
              bound, so a catalogue row cannot become a feature — and one saved
              for a model nobody asks is a number an operator can see and no
              reserve will ever read.
            */
            const declared = app.ai!.models.find((m) => m.id === input.id);
            if (!declared) ctx.fail("platform.invalid", { field: "id", reason: "not a model this app declares" });
            /*
              ⚠️ ZERO IS REFUSED ON THE WAY IN. Saved, it makes the model
              unmetered for EVERY app behind this store: the reserve is zero, the
              settle is zero, the balance never moves, and the provider invoices
              as usual.
            */
            if (refuseRate({ input: input.input, output: input.output })) {
              ctx.fail("platform.invalid", { field: "rate", reason: "a rate of zero is not free, it is unmetered" });
            }
            if (!d.shared) ctx.fail("platform.unavailable", { reason: "this deployment binds no shared configuration store" });

            await writeRate(d.shared!, {
              id: input.id, provider: declared!.provider,
              rate: { input: input.input, output: input.output },
              ...(input.thinking === undefined ? {} : { thinking: input.thinking }),
            }, ctx.now() as Instant);
            return { id: input.id };
          },
        }),
      ]
    : [];

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
      const values = { ...(await readAll(d.shared)), ...nonEmpty(await readAll(d.own)) };
      const out = await send(values, {
        to: input.to,
        subject: "Test message",
        body: "This is a test from your deployment's configuration screen. If you are reading it, mail is working.",
      }, d.post, ctx.now() as Instant);

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
      const values = { ...(await readAll(d.shared)), ...nonEmpty(await readAll(d.own)) };
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

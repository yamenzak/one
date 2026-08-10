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
import { operation, s } from "@one/kernel";
import { lines, readAll, refuseWrite, writeOne } from "./config.js";
import { OPERATE } from "./operator-ops.js";

/** ⚠️ A symbol, so an app cannot reach the secret store by writing a property name. */
export const CONFIG = Symbol.for("one.runtime.config");

export interface ConfigDeps {
  /** This app's own store. Always present. */
  readonly own: SqlHandle;
  /** ⚠️ Null where a deployment binds no shared store, which is most of them. */
  readonly shared: SqlHandle | null;
  readonly registry: ConfigRegistry;
}

export interface ConfigCarrier { readonly [CONFIG]: ConfigDeps }

const deps = (ctx: unknown): ConfigDeps => (ctx as ConfigCarrier)[CONFIG];

export function configOperations<B extends BindingSpec>(_app: AppSpec<B>): readonly AnyOperation[] {
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

  return [read, write] as unknown as readonly AnyOperation[];
}

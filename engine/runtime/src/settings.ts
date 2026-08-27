/**
 * THE SETTINGS STORE, AND THE TWO OPERATIONS OVER IT.
 *
 * ⚠️ AN APP DECLARES A SETTING AND NEVER STORES ONE. The rows live here, the
 * screens are the platform's (`@engine/design` renders the book), and these two
 * operations are the only path between them — so "who may change it" is asked
 * in exactly one place, with the level deciding the authority: a `person` row
 * is the caller's own, a `tenant` row needs the declaration's `needs`, and an
 * `operator` row does not answer on a workspace's door at all.
 *
 * ⚠️ A SECRET LEAVES THE SERVER AS `{ set }` AND NEVER AS ITSELF. The read path
 * goes through the kernel's `disclose`, which is what makes "write-only" a
 * property of the platform rather than a habit of screens.
 *
 * ⚠️ AND WHAT THE CALLER MAY NOT CHANGE IS ABSENT FROM THE READ. Sending every
 * tenant value to every member and trusting the screen to hide some is the
 * shape where a payload carries what a page withholds.
 */

import type { AppSpec, TenantId } from "@engine/kernel";
import {
  PUBLIC, brandable, checkSome, disclose, mayIsolate, refusePrompt, resolve, valueOf,
} from "@engine/kernel";
import { actionsOf, word, wordingOf } from "./ai-actions.js";
import { lettersOf, mayWordMail, setLetter } from "./inbox.js";
import { brandingOf } from "./branding.js";
import {
  deploymentFlags, flagCounts, flagPeople, setPersonFlag, setTenantFlag, tenantFlags,
} from "./flags.js";
import { askAlone, tenantById } from "./directory.js";
import { memberFor, membersOf } from "./membership.js";
import type { PlatformCtx } from "./member-ops.js";
import type { Resolved } from "./compose.js";
import type { SchemaModule } from "./schema.js";
import type { Db } from "./sql.js";

/* ----------------------------------------------------------------- schema --- */

export const SETTING_SCHEMA: SchemaModule = {
  id: "setting",
  statements: [
    /* ⚠️ `account_id` is '' for a tenant-level row, never NULL — NULL breaks
       the unique index, and two tenant rows for one id is two answers. */
    `CREATE TABLE IF NOT EXISTS setting (tenant_id TEXT NOT NULL, app TEXT NOT NULL, account_id TEXT NOT NULL DEFAULT '', id TEXT NOT NULL, value_json TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY (tenant_id, app, id, account_id));`,
  ],
};

/* ------------------------------------------------------------------ store --- */

export async function storedSettings(
  db: Db, tenantId: TenantId, app: string, accountId: string,
): Promise<Readonly<Record<string, unknown>>> {
  const rows = await db.prepare(
    `SELECT id, value_json FROM setting WHERE tenant_id = ? AND app = ? AND account_id = ?`)
    .bind(tenantId, app, accountId).all<{ id: string; value_json: string }>();
  return Object.fromEntries(rows.results.map((r) => [r.id, JSON.parse(r.value_json) as unknown]));
}

export async function writeSetting(
  db: Db, tenantId: TenantId, app: string, accountId: string, id: string, value: unknown,
  now: Date,
): Promise<void> {
  await db.prepare(
    `INSERT INTO setting (tenant_id, app, account_id, id, value_json, at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(tenant_id, app, id, account_id) DO UPDATE SET value_json = excluded.value_json, at = excluded.at`)
    .bind(tenantId, app, accountId, id, JSON.stringify(value ?? null), now.toISOString()).run();
}

/* ------------------------------------------------------------- operations --- */

export function settingOps(app: AppSpec): Readonly<Record<string, Resolved>> {
  /* ⚠️ The target app is an INPUT — same reason as the package rail: every
     composition carries these ids, and the route resolves whichever app is
     first, so binding the composing app could never answer for the second
     product. Authority is asked IN THE TARGET's context, not the caller's
     entry point. */
  const targetOf = (ctx: PlatformCtx, input: Record<string, unknown>): AppSpec | null => {
    const named = input.app === undefined ? app.id : String(input.app);
    if (!ctx.enabledApps.includes(named)) return null;
    return named === app.id ? app : ctx.appOf(named);
  };

  const op = (
    id: string, kind: "read" | "write", summary: string,
    run: (ctx: PlatformCtx, input: Record<string, unknown>) => Promise<unknown>,
  ): Resolved => ({
    id, kind,
    method: kind === "read" ? "GET" : "POST",
    path: `/api/${id}`,
    permission: PUBLIC,
    spec: {
      id, kind, summary,
      input: {}, output: {},
      permission: PUBLIC,
      idempotency: { mode: "none" },
      ...(kind === "write" ? { emits: ["setting.changed"] } : {}),
      async handler() { return {} as never; },
    } as Resolved["spec"],
    run: (ctx, input) => run(ctx as PlatformCtx, input),
  });

  return {
    /*
      ⚠️ `PUBLIC` BECAUSE THE ANSWER IS SHAPED PER CALLER, NOT BECAUSE IT IS
      OPEN. A signed-out caller gets nothing; a member gets their own person
      rows and only the tenant rows they could change (the autodiscovery rule:
      permission lacking = absent, entitlement lacking = shown and locked —
      the LOCK is the screen's job, the ABSENCE is this one's).
    */
    "setting.read": op("setting.read", "read", "Your settings here, and the workspace's.",
      async (ctx, input) => {
        if (!ctx.accountId) return ctx.fail("platform.unauthorized");
        const target = targetOf(ctx, input);
        if (!target) return ctx.fail("platform.not_found");
        const book = target.settings ?? {};
        const mine = await ctx.permissionsIn(target.id);
        const tenantRows = await storedSettings(ctx.db, ctx.tenantId as TenantId, target.id, "");
        const personRows = await storedSettings(ctx.db, ctx.tenantId as TenantId, target.id, ctx.accountId);

        const tenant: Record<string, unknown> = {};
        const person: Record<string, unknown> = {};
        for (const def of Object.values(book)) {
          if (def.level === "tenant") {
            if (def.needs && !mine.has(def.needs)) continue;
            /* ⚠️ Through `disclose`, so a secret is `{ set }` — never itself. */
            tenant[def.id] = disclose(def, tenantRows);
          }
          if (def.level === "person") person[def.id] = { value: personRows[def.id] };
        }
        return { tenant, person };
      }),

    /*
      ⚠️ THE WORKSPACE'S OWN WORDING FOR WHAT IT MAY REWORD (D19). Only actions
      the app declared `brandable` — asked by the kernel at the write, so the
      rule is true of the API and the import as well as of the screen.
    */
    "ai.wording": op("ai.wording", "read", "What the AI features say, and in whose words.",
      async (ctx, input) => {
        if (!ctx.accountId) return ctx.fail("platform.unauthorized");
        const target = targetOf(ctx, input);
        if (!target) return ctx.fail("platform.not_found");
        const theirs = await wordingOf(ctx.db, ctx.tenantId as TenantId, target.id);
        return {
          items: actionsOf(target)
            .filter((a) => a.ai.brandable)
            .map((a) => ({
              id: a.id, summary: a.summary,
              variables: a.ai.variables,
              declared: a.ai.prompt,
              prompt: theirs[a.id] ?? null,
            })),
        };
      }),

    "ai.word": op("ai.word", "write", "Put an AI feature in your own words.",
      async (ctx, input) => {
        if (!ctx.accountId) return ctx.fail("platform.unauthorized");
        const target = targetOf(ctx, input);
        if (!target) return ctx.fail("platform.not_found");
        /* ⚠️ Workspace authority — this is the workspace's voice, not a
           person's preference. */
        const mine = await ctx.permissionsIn(target.id);
        if (!mine.has("tenant:manage")) return ctx.fail("platform.forbidden");

        const action = actionsOf(target).find((a) => a.id === String(input.action ?? ""));
        if (!action) return ctx.fail("platform.not_found");
        const text = input.prompt === null ? null : String(input.prompt ?? "");
        if (text !== null) {
          const refused = refusePrompt(action.ai, text, "tenant");
          if (refused.length) return ctx.fail("platform.invalid", { detail: refused.join(", ") });
        }
        await word(ctx.db, ctx.tenantId as TenantId, target.id, action.id, text, new Date(ctx.now));
        return { action: action.id };
      }),

    /*
      ⚠️ AND THE SAME QUESTION FOR A NOTIFICATION, WHICH IS WHERE IT MATTERS
      MOST. An AI prompt in a workspace's own words reaches its own staff; a
      notification in its own words reaches its CUSTOMERS, and it goes out by
      mail with the workspace's name on it. `brandable` is what decides whether
      the workspace may rewrite one at all — a message from US to the business
      ("your payment failed") wearing the business's own voice tells its staff
      their own company is chasing them for a bill they have never heard of.
    */
    "notify.wording": op("notify.wording", "read", "What each message says, and in whose words.",
      async (ctx, input) => {
        if (!ctx.accountId) return ctx.fail("platform.unauthorized");
        const target = targetOf(ctx, input);
        if (!target) return ctx.fail("platform.not_found");
        const theirs = await lettersOf(ctx.db, ctx.tenantId as TenantId);
        /*
          ⚠️ WHETHER A LETTER WRITTEN HERE WOULD ACTUALLY GO OUT, ASKED BY THE
          SAME FUNCTION THE SEND ASKS (`mayWordMail`). The app has to offer the
          email surface, the workspace has to have switched it on, and it has to
          be the kind that may brand anything — and a workspace whose email is
          still ours can write a letter nothing will ever use. That is the
          editor-over-nothing shape this repository keeps finding, so the answer
          carries the fact and the screen says it.
        */
        const tenant = await tenantById(ctx.directory, ctx.tenantId as TenantId);
        const used = mayWordMail(
          target, await brandingOf(ctx.directory, ctx.tenantId as TenantId),
          tenant?.kind ?? "personal");
        return {
          used,
          items: Object.values(target.notifications ?? {})
            .filter((def) => brandable(def))
            .map((def) => ({
              id: def.id,
              label: def.label,
              /* ⚠️ THE `label`, NOT THE `summary`. A catalogue of TYPES has
                 nothing to fill a template with, so listing the summary here
                 would show `{name} invited you` to somebody choosing what to
                 rewrite. */
              declared: def.summary,
              variables: def.variables,
              letter: theirs[def.id] ?? null,
            })),
        };
      }),

    "notify.word": op("notify.word", "write", "Put a message in your own words.",
      async (ctx, input) => {
        if (!ctx.accountId) return ctx.fail("platform.unauthorized");
        const target = targetOf(ctx, input);
        if (!target) return ctx.fail("platform.not_found");
        /* ⚠️ Workspace authority — this is what its customers read, not one
           person's preference. */
        const mine = await ctx.permissionsIn(target.id);
        if (!mine.has("tenant:manage")) return ctx.fail("platform.forbidden");

        const type = String(input.type ?? "");
        if (!(target.notifications ?? {})[type]) return ctx.fail("platform.not_found");
        const letter = input.letter === null || input.letter === undefined
          ? null
          : {
            subject: String((input.letter as Record<string, unknown>).subject ?? ""),
            body: String((input.letter as Record<string, unknown>).body ?? ""),
            ...((input.letter as Record<string, unknown>).signature
              ? { signature: String((input.letter as Record<string, unknown>).signature) }
              : {}),
          };
        /* ⚠️ THE REFUSAL IS THE POINT. A template naming a variable the
           notification never declares is an email with `{coach}` in it, sent to
           a customer — and here is the last moment it is still somebody's
           mistake rather than somebody's mail. */
        const refused = await setLetter(
          ctx.db, target.notifications ?? {}, ctx.tenantId as TenantId, type, letter,
          new Date(ctx.now));
        if (refused.length) return ctx.fail("platform.invalid", { detail: refused.join(", ") });
        return { type };
      }),

    /*
      ⚠️ THE WORKSPACE'S SIDE OF THE FLAG, AND WITHOUT IT `setBy` IS A WORD. A
      flag declaring `setBy: "tenant"` says a workspace may decide for itself —
      the kernel resolves it, the store holds it, the operator can see it — and
      there was nowhere for a workspace to say so. `settableBy` and the whole
      narrowing algebra existed with one caller, in a browser, drawing a switch
      on the operator's screen.

      ⚠️ AND IT LISTS EVERYTHING THIS WORKSPACE CAN DO ANYTHING ABOUT, which is
      wider than what it can TOGGLE. It filtered on `setBy !== "operator"` and
      that was the wrong question: a flag only we may switch, released to this
      workspace, is one the workspace can still hand to some of its own people —
      and that is the ordinary way a feature ships. `mayChoose` carries the
      narrower answer to the row that needs it.

      ⚠️ A FLAG THE DEPLOYMENT HAS SWITCHED OFF IS NOT OFFERED. `off` above is
      absorbing, so every control for it would change nothing, which is worse
      than an absent one.
    */
    "flag.list": op("flag.list", "read", "What this workspace can try early.",
      async (ctx, input) => {
        if (!ctx.accountId) return ctx.fail("platform.unauthorized");
        const target = targetOf(ctx, input);
        if (!target) return ctx.fail("platform.not_found");
        const book = target.flags ?? {};
        const mine = await tenantFlags(ctx.directory, ctx.tenantId);
        const above = await deploymentFlags(ctx.directory);
        const people = await flagCounts(ctx.directory, ctx.tenantId);
        return {
          items: Object.values(book)
            .filter((def) => above[def.id] !== false)
            .map((def) => ({
              id: def.id,
              label: def.label,
              why: def.why,
              /* ⚠️ WHETHER THE WORKSPACE MAY MOVE THE WORKSPACE SWITCH, which is
                 not whether it may do anything at all — see above. */
              mayChoose: def.setBy !== "operator",
              /* ⚠️ HOW MANY OF ITS OWN PEOPLE IT HAS DECIDED FOR, so a row can
                 say "on, and two people differ" rather than just "on". */
              people: people[def.id] ?? 0,
              /* ⚠️ WHAT IS TRUE NOW, from the same walk the gate makes. A screen
                 computing its own would answer differently for a flag nobody has
                 touched, which is most of them. */
              on: resolve(def, {
                ...(above[def.id] !== undefined ? { deployment: above[def.id] } : {}),
                ...(mine[def.id] !== undefined ? { tenant: mine[def.id] } : {}),
              }),
              /* ⚠️ WHETHER THIS WORKSPACE HAS DECIDED, which is not the same as
                 what is on. `null` is following the deployment, and the row says
                 so rather than showing a switch that looks set by somebody. */
              chosen: mine[def.id] ?? null,
            })),
        };
      }),

    /*
      ⚠️ THE ROSTER, WITH WHAT EACH PERSON HAS — the half that makes this the way
      a feature is normally released. We give the feature to a WORKSPACE; the
      workspace decides which of its own people get it. Without this the second
      half of that sentence had nowhere to happen.
    */
    "flag.people": op("flag.people", "read", "Who in this workspace has this.",
      async (ctx, input) => {
        if (!ctx.accountId) return ctx.fail("platform.unauthorized");
        const target = targetOf(ctx, input);
        if (!target) return ctx.fail("platform.not_found");
        const def = (target.flags ?? {})[String(input.id ?? "")];
        if (!def) return ctx.fail("platform.not_found");

        const [above, mine, theirs, roster] = await Promise.all([
          deploymentFlags(ctx.directory),
          tenantFlags(ctx.directory, ctx.tenantId),
          flagPeople(ctx.directory, ctx.tenantId, def.id),
          membersOf(ctx.db, ctx.tenantId as TenantId),
        ]);
        /* ⚠️ WHAT THE WORKSPACE ITSELF HAS, so a row can say whether a person is
           being given something early or held back from something everybody
           else has. Both are real and they read differently. */
        const forAll = resolve(def, {
          ...(above[def.id] !== undefined ? { deployment: above[def.id] } : {}),
          ...(mine[def.id] !== undefined ? { tenant: mine[def.id] } : {}),
        });
        return {
          /* ⚠️ THE FEATURE NAMES ITSELF, because the page holds no manifest. The
             centre is one bundle for every product, so the alternative is
             sending every flag book to every workspace on the one read every
             screen stands on — for a label and a sentence this screen needs and
             no other does. */
          label: def.label,
          why: def.why,
          workspace: forAll,
          items: roster
            /* ⚠️ AN UNCLAIMED INVITATION HAS NO ACCOUNT, and a row keyed by one
               would be a decision about nobody. */
            .filter((m) => m.accountId)
            .map((m) => ({
              accountId: m.accountId,
              email: m.email,
              chosen: theirs[m.accountId] ?? null,
              on: resolve(def, {
                ...(above[def.id] !== undefined ? { deployment: above[def.id] } : {}),
                ...(mine[def.id] !== undefined ? { tenant: mine[def.id] } : {}),
                ...(theirs[m.accountId] !== undefined ? { person: theirs[m.accountId] } : {}),
              }),
            })),
        };
      }),

    "flag.person": op("flag.person", "write", "Give one person this, or hold them back.",
      async (ctx, input) => {
        if (!ctx.accountId) return ctx.fail("platform.unauthorized");
        const target = targetOf(ctx, input);
        if (!target) return ctx.fail("platform.not_found");
        const def = (target.flags ?? {})[String(input.id ?? "")];
        if (!def) return ctx.fail("platform.not_found");
        const at = String(input.person ?? "").trim();
        if (!at) return ctx.fail("platform.invalid");

        /*
          ⚠️ DECIDING FOR SOMEBODY ELSE IS WORKSPACE AUTHORITY; deciding for
          YOURSELF is allowed only where the flag says a person may. That is the
          whole of `setBy` on this door — one is an admin distributing what the
          workspace was given, the other is somebody opting themselves in.
        */
        const own = at === ctx.accountId;
        if (!own || def.setBy !== "person") {
          const held = await ctx.permissionsIn(target.id);
          if (!held.has("member:manage")) return ctx.fail("platform.forbidden");
        }
        /* ⚠️ ON THIS WORKSPACE'S OWN ROSTER, or a workspace could hand a feature
           to an account it has nothing to do with. */
        const member = await memberFor(ctx.db, ctx.tenantId as TenantId, at as never);
        if (!member) return ctx.fail("platform.not_found");
        /* ⚠️ REFUSED UNDER A KILL SWITCH rather than stored and ignored. */
        if ((await deploymentFlags(ctx.directory))[def.id] === false) {
          return ctx.fail("platform.not_found");
        }
        const on = input.on === null ? null : input.on === true;
        await setPersonFlag(ctx.directory, ctx.tenantId, at, def.id, on, new Date(ctx.now));
        return { id: def.id, person: at, on };
      }),

    "flag.set": op("flag.set", "write", "Decide a switch for this workspace.",
      async (ctx, input) => {
        if (!ctx.accountId) return ctx.fail("platform.unauthorized");
        const target = targetOf(ctx, input);
        if (!target) return ctx.fail("platform.not_found");
        const def = (target.flags ?? {})[String(input.id ?? "")];
        /* ⚠️ An operator's switch does not exist on this door, and saying
           otherwise would confirm the name. */
        if (!def || def.setBy === "operator") return ctx.fail("platform.not_found");
        /* ⚠️ WORKSPACE AUTHORITY, because this decides for everybody in it. */
        const held = await ctx.permissionsIn(target.id);
        if (!held.has("tenant:manage")) return ctx.fail("platform.forbidden");
        /* ⚠️ REFUSED WHILE THE DEPLOYMENT SAYS NO, rather than stored and
           ignored. `off` above is absorbing, so a row written here would be a
           decision the product never honours — and the workspace would have been
           told it worked. */
        if ((await deploymentFlags(ctx.directory))[def.id] === false) {
          return ctx.fail("platform.not_found");
        }
        const on = input.on === null ? null : input.on === true;
        await setTenantFlag(ctx.directory, ctx.tenantId, def.id, on, new Date(ctx.now));
        return { id: def.id, on };
      }),

    /*
      ⚠️ ASKING FOR A DATABASE OF YOUR OWN, WHICH NOTHING COULD DO. `mayIsolate`
      has always said a business MAY ask and `Placing.alone` has always been
      "asked, never inferred from the kind" — and there was no asker, so the
      parameter was never set by anything and isolation meant an operator
      reserving an empty shard by hand.

      ⚠️ IT RECORDS AN INTENT AND PROMISES NOTHING IMMEDIATE. A database has to be
      created, bound, rolled out and copied onto; the nightly pass does each in
      turn. Answering as though it were done would be a screen that says a
      workspace is isolated while its records are still beside everybody else's.
    */
    "tenant.alone": op("tenant.alone", "write", "Ask for a database of your own.",
      async (ctx, input) => {
        if (!ctx.accountId) return ctx.fail("platform.unauthorized");
        const tenant = await tenantById(ctx.directory, ctx.tenantId as TenantId);
        if (!tenant) return ctx.fail("platform.not_found");
        /* ⚠️ THE KIND IS THE GATE AND THE PRICE, which is the decision already
           written in `entitlement.ts`: pricing isolation on `kind` means the gate
           and the price agree by construction, where an entitlement for it would
           be a second answer that can disagree. */
        if (!mayIsolate(tenant.kind)) {
          return ctx.fail("platform.commercial_required", { workspace: tenant.name });
        }
        const held = await ctx.permissionsIn(null);
        if (!held.has("tenant:manage")) return ctx.fail("platform.forbidden");

        const yes = input.on !== false;
        await askAlone(ctx.directory, tenant.id, yes);
        return { asked: yes };
      }),

    "setting.write": op("setting.write", "write", "Change a setting.",
      async (ctx, input) => {
        if (!ctx.accountId) return ctx.fail("platform.unauthorized");
        const target = targetOf(ctx, input);
        if (!target) return ctx.fail("platform.not_found");
        const book = target.settings ?? {};
        const id = String(input.id ?? "");
        const def = book[id];
        /* ⚠️ An operator setting is the deployment's — on this door it does
           not exist, and saying so would confirm the name. */
        if (!def || def.level === "operator") return ctx.fail("platform.not_found");

        const checked = checkSome({ [id]: def.field }, { [id]: input.value });
        if (!checked.ok) return ctx.fail("platform.invalid", { detail: checked.why });

        if (def.level === "tenant") {
          /* ⚠️ The declaration's `needs` is the authority, asked in the TARGET
             app's context — the manifest refuses a tenant setting without one,
             so this branch cannot be reached ungated by construction. */
          const mine = await ctx.permissionsIn(target.id);
          if (!def.needs || !mine.has(def.needs)) return ctx.fail("platform.forbidden");
          await writeSetting(ctx.db, ctx.tenantId as TenantId, target.id, "", id,
            checked.values[id], new Date(ctx.now));
        } else {
          await writeSetting(ctx.db, ctx.tenantId as TenantId, target.id, ctx.accountId, id,
            checked.values[id], new Date(ctx.now));
        }
        return { id };
      }),
  };
}

/* ----------------------------------------------------------------- reading --- */

/**
 * WHAT A HANDLER SEES WHEN IT ASKS FOR A SETTING.
 *
 * ⚠️ A SETTING NO CODE CAN READ IS A SWITCH THAT CHANGES NOTHING, and that is
 * worse than an absent feature: somebody presses it, it saves, it is drawn back
 * to them, and they stop looking for the thing it promised. For as long as this
 * seam did not exist, the whole settings rail was that — the surface half of the
 * platform's own bidirectional rule with no enforced half under it.
 *
 * ⚠️ THE LEVEL DECIDES WHOSE ROW IS READ, and getting it wrong is invisible. A
 * `tenant` setting is the workspace's, stored under the empty account; a
 * `person` setting is the caller's own. Reading the workspace's row for a
 * personal switch gives every member whatever the last one set.
 *
 * ⚠️ AND A MISSING ROW IS THE DECLARED FALLBACK, NEVER `undefined` — through
 * `valueOf`, the one resolution the screen already uses. Two resolutions is how
 * a screen and a handler come to disagree about what a workspace switched on.
 */
export async function settingsFor(
  db: Db, tenantId: TenantId, app: AppSpec, accountId: string | null,
): Promise<Readonly<Record<string, unknown>>> {
  const book = app.settings ?? {};
  if (!Object.keys(book).length) return {};

  /* ⚠️ TOGETHER, BECAUSE NEITHER IS AN INPUT TO THE OTHER. Awaited one after the
     other this is two waves of latency for two independent reads — and it is on
     the path of the boot every screen in a workspace waits for. */
  const [tenantRows, personRows] = await Promise.all([
    storedSettings(db, tenantId, app.id, ""),
    /* ⚠️ A caller with no account has no personal rows, and asking for them with
       an empty id would read the WORKSPACE's — the one confusion this whole
       function exists to make impossible. */
    accountId ? storedSettings(db, tenantId, app.id, accountId) : Promise.resolve({}),
  ]);

  const out: Record<string, unknown> = {};
  for (const def of Object.values(book)) {
    out[def.id] = valueOf(def, def.level === "tenant" ? tenantRows : personRows);
  }
  return out;
}

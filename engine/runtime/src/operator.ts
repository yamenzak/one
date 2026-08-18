/**
 * THE OPERATOR'S OWN SURFACE — the deployment looking at itself.
 *
 * ⚠️ OPERATOR OPERATIONS ARE PERSONAL OPERATIONS ON THE OPERATOR DOOR. They
 * resolve no workspace — the deployment is the subject — so they ride the
 * personal lane, restricted to `doors: ["operator"]`, with one further check
 * this file owns: the session's address must be an operator's. Who counts is
 * the DEPLOYMENT'S configuration, injected — a role could not express it,
 * because roles live inside workspaces and the operator stands outside all
 * of them.
 *
 * ⚠️ MAINTENANCE IS THE HOST GATE ONE LEVEL UP. `readonly` refuses writes and
 * serves reads; `full` withholds everything but the operator door, `/health`
 * and the personal lane — leaving must never be something maintenance can
 * prevent. Enforced in `performOperation`, the one path both doors end in
 * (D12), so the agent door cannot forget it.
 *
 * ⚠️ AND THE SWITCH FAILS OPEN. A deployment whose directory lacks the table
 * has never provisioned the switch; refusing every request over OUR missing
 * row would be an outage the feature caused.
 */

import type {
  AccountId, AppId, Allowance, AppSpec, FlagBook, ModelRow, PlanSpec, TenantId,
} from "@engine/kernel";
import {
  ALLOWANCE_KEY, KEEPS_RESIDENCY, allowanceFor, entitlementKeys, inLane, mayIsolate,
  refuseCatalogue,
  refusePrompt,
  stalled,
} from "@engine/kernel";
import type { Residency } from "@engine/kernel";
import type { Account } from "./cloudflare.js";
import { verify } from "./cloudflare.js";
import { apply, plan, resources, wanted } from "./resources.js";
import { beginMove } from "./move.js";
import { actionsOf, bind, bindingsOf, running } from "./ai-actions.js";
import { MEMBERSHIP, adjust, compPlan, subscriptionFor } from "./billing.js";
import {
  catalogueProblems, editPlan, effectivePlans, onEachPlan, planEdits, resetPlan,
  type PlanEdit,
} from "./catalogue.js";
import { autoTopUpOf, movements, renewAllowance, spentByApp, topUp, walletOf } from "./wallet.js";
import {
  addShard, appsOfTenant, commercialAllowance, commercialLeft, disableApp, enableApp,
  liveAppsOfTenant, setCommercialGrant, shards, tenantById, tenantBySlug,
} from "./directory.js";
import { CREDENTIALS, configState, setConfig } from "./config.js";
import { parkedEvents } from "./stripe.js";
import { runsOf } from "./jobs.js";
import { makePushKeys, vapidOf } from "./push.js";
import type { PersonalBook, PersonalCtx } from "./personal.js";
import { applySchema, schemaFor, type SchemaModule } from "./schema.js";
import type { Db } from "./sql.js";

/* ----------------------------------------------------------------- schema --- */

export const OPERATOR_SCHEMA: SchemaModule = {
  id: "operator",
  statements: [
    `CREATE TABLE IF NOT EXISTS deployment_flag (id TEXT PRIMARY KEY, on_flag INTEGER NOT NULL, at TEXT NOT NULL);`,
    /* ⚠️ One row, and the primary key says so — two maintenance modes at once
       is two answers to "may this request run". */
    `CREATE TABLE IF NOT EXISTS maintenance (id TEXT PRIMARY KEY CHECK (id = 'the'), mode TEXT NOT NULL, at TEXT NOT NULL);`,
  ],
};

/* ------------------------------------------------------------------ store --- */

export async function deploymentFlags(db: Db): Promise<Readonly<Record<string, boolean>>> {
  const rows = await db.prepare(`SELECT id, on_flag FROM deployment_flag`)
    .all<{ id: string; on_flag: number }>();
  return Object.fromEntries(rows.results.map((r) => [r.id, !!r.on_flag]));
}

export async function setDeploymentFlag(
  db: Db, id: string, on: boolean, now = new Date(),
): Promise<void> {
  await db.prepare(
    `INSERT INTO deployment_flag (id, on_flag, at) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET on_flag = excluded.on_flag, at = excluded.at`)
    .bind(id, on ? 1 : 0, now.toISOString()).run();
}

export type MaintenanceMode = "off" | "readonly" | "full";

export async function maintenanceMode(db: Db): Promise<MaintenanceMode> {
  try {
    const row = await db.prepare(`SELECT mode FROM maintenance WHERE id = 'the'`)
      .first<{ mode: string }>();
    const mode = row?.mode;
    return mode === "readonly" || mode === "full" ? mode : "off";
  } catch {
    /* ⚠️ Fails OPEN — see the header. */
    return "off";
  }
}

export async function setMaintenance(
  db: Db, mode: MaintenanceMode, now = new Date(),
): Promise<void> {
  await db.prepare(
    `INSERT INTO maintenance (id, mode, at) VALUES ('the', ?, ?)
     ON CONFLICT(id) DO UPDATE SET mode = excluded.mode, at = excluded.at`)
    .bind(mode, now.toISOString()).run();
}

/* ------------------------------------------------------------- operations --- */

export interface OperatorDeps {
  readonly apps: Readonly<Record<string, () => AppSpec>>;
  /**
   * ⚠️ INJECTED, BECAUSE ONLY THE DEPLOYMENT KNOWS. An operator is outside
   * every workspace; no roster and no role can answer this.
   */
  readonly isOperator: (email: string | null) => boolean;
  /** ⚠️ The model catalogue — the platform's, and the same rows metering reads. */
  readonly models?: () => Promise<readonly ModelRow[]>;
  /**
   * ⚠️ THE ACCOUNT, AND ITS ABSENCE IS AN ANSWER RATHER THAN A FAILURE. A
   * deployment with no token cannot provision, which is the state of a
   * self-host, of every test run, and of this one before the secret is set. The
   * console says so in a sentence instead of offering a button that 500s.
   */
  readonly account?: () => Account | null;
  /** Which residencies the deployment promises — see `refuseNeeds`. */
  readonly serves?: readonly Residency[];
  /** Its own name, which is what the resource names are built from. */
  readonly deployment?: string;
  /**
   * ⚠️ THE HOSTNAME EVERY DOOR HANGS OFF, which is a different thing from
   * `deployment` — one is an internal name and the other is an address that
   * resolves. The push keypair's VAPID subject is built from it, and a push
   * service is entitled to expect somebody at the other end.
   */
  readonly root?: string;
  /**
   * ⚠️ WHAT A STORED CREDENTIAL IS ENCRYPTED UNDER, and its absence is a
   * refusal rather than a fallback — see `config.ts`. A deployment that has
   * bound none can still set an address; it cannot store a key.
   */
  readonly configSecret?: string;
  /** ⚠️ The deployment's catalogue — one membership, one list. */
  readonly plans?: readonly PlanSpec[];
}

/** ⚠️ The same window the jobs screen reads a silence against — see `Jobs`. */
const A_DAY = 86_400_000;

export function operatorOps(input: OperatorDeps): PersonalBook {
  /* ⚠️ A deployment with no catalogue wired has NO models, which every reader
     already handles as "the lane has nothing enabled" — never a throw. */
  const deps = { models: async (): Promise<readonly ModelRow[]> => [], ...input };
  const every = () => Object.values(deps.apps).map((make) => make());

  /* ⚠️ Every operation here asks, first. The door filter keeps these off other
     hostnames; this keeps them off other PEOPLE. */
  const operator = (ctx: PersonalCtx): void => {
    if (!deps.isOperator(ctx.email)) ctx.fail("platform.forbidden");
  };

  /**
   * ⚠️ WHAT IS ACTUALLY SOLD, WHICH IS NOT WHAT THE CODE DECLARES ANY MORE.
   * `deps.plans` is the declaration — the authority for which plans exist and
   * which keys each prices, checked at boot. The console edits the numbers over
   * it, so every operation that reports or grants a plan has to ask.
   */
  const sold = (ctx: PersonalCtx): Promise<readonly PlanSpec[]> =>
    effectivePlans(ctx.directory, deps.plans ?? [], entitlementKeys(every()));

  return {
    /*
      ⚠️ ONE ROW PER WORKSPACE, WITH ITS STANDING PER PRODUCT. The adjustments
      column travels with it because the console's one write is the absolute,
      either-direction, per-tenant adjustment — the operator's deliberate
      decision, distinct from grandfathering by design.
    */
    "op.tenants": {
      kind: "read", needs: "session", doors: ["operator"],
      async run(ctx): Promise<unknown> {
        operator(ctx);
        const rows = await ctx.directory.prepare(
          `SELECT * FROM tenant ORDER BY at DESC LIMIT 200`).all();
        const items = await Promise.all(rows.results.map(async (r) => {
          const id = r.id as TenantId;
          /* ⚠️ EVERY PRODUCT IT HAS EVER HAD, AND WHICH OF THEM ARE ON. A
             switched-off product keeps its records and its tables, so listing
             only the live ones would make the console's switch a one-way door —
             the row would vanish the moment it was turned off, with nothing left
             to turn back on. */
          const live = new Set(await liveAppsOfTenant(ctx.directory, id));
          const held = (await appsOfTenant(ctx.directory, id)).map((appId) => ({
            id: appId, on: live.has(appId),
          }));
          /* ⚠️ ONE MEMBERSHIP, REPORTED AT THE WORKSPACE RATHER THAN PER PRODUCT.
             The plan, the standing and the operator's adjustments are the
             workspace's — reading them per app was N copies of one answer, and
             the console drew whichever came first. */
          const sub = await subscriptionFor(ctx.directory, id, MEMBERSHIP);
          return {
            id, slug: r.slug, name: r.name, country: r.country,
            planId: sub?.planId ?? null,
            status: sub?.status ?? null,
            /* ⚠️ GIVEN OR BOUGHT, because they look identical on this row and
               only one of them has an invoice behind it. An operator about to
               ask why a workspace has not paid needs to know we told it not to. */
            compedAt: sub?.compedAt ?? null,
            adjustments: sub?.adjustments ?? {},
            /* ⚠️ WHAT IT IS, BESIDE WHAT IT BOUGHT. The console's whole job is
               telling one workspace from another, and personal and commercial
               are the two that differ in what they may do rather than in what
               they are paying. */
            kind: (r.kind as string | null) ?? "personal",
            legalName: r.legal_name ?? null,
            shardId: r.shard_id, closedAt: r.closed_at ?? null, apps: held,
          };
        }));
        /* ⚠️ WHAT EACH PRODUCT DECLARES, not what it sells — the membership is
           the deployment's and its plans travel separately. */
        const apps = every().map((a) => ({
          id: a.id, name: a.name, mark: a.mark,
          entitlements: a.entitlements,
        }));
        return { items, apps, plans: await sold(ctx) };
      },
    },

    /*
      ⚠️ ABSOLUTE, EITHER DIRECTION, CLEARED PER KEY — the operator column of
      D-billing. `null` clears ONE key; nothing here can touch the
      grandfathering, which only ever ratchets up.
    */
    "op.tenant.adjust": {
      kind: "write", needs: "session", doors: ["operator"],
      async run(ctx, input): Promise<unknown> {
        operator(ctx);
        const tenantId = String(input.tenant ?? "") as TenantId;
        const key = String(input.key ?? "");
        const given = input.value;
        const value: Allowance | null =
          given === null ? null
            : typeof given === "number" || typeof given === "boolean" ? given
              : undefined as never;
        if (!tenantId || !key || value === undefined) return ctx.fail("platform.invalid");

        /*
          ⚠️ THE UNION, BECAUSE ONE MEMBERSHIP HOLDS BOTH KINDS OF KEY. `seats`
          and `storage` are the platform's and no app declares them; `notes` is
          a product's. An operator adjusting a workspace is adjusting its
          membership, so a lookup in one app's book would refuse half of what is
          on the screen in front of them.
        */
        const holdable = entitlementKeys(every());
        /*
          ⚠️ AND THE MONTH'S ALLOWANCE, WHICH IS NOT AN ENTITLEMENT — see
          `ALLOWANCE_KEY`. It rides the same write because the semantics are
          identical: absolute, either direction, cleared per key. What it must
          never do is join `holdable`, because that is the list `walk` iterates
          and the walk ends in a clamp that would confiscate a balance.
        */
        if (key !== ALLOWANCE_KEY && !(key in holdable)) return ctx.fail("platform.invalid");
        /* ⚠️ Against the MEMBERSHIP row, which is the workspace's and belongs to
           no product — see `MEMBERSHIP`. */
        await adjust(ctx.directory, tenantId, MEMBERSHIP, key, value, ctx.now);
        return { tenant: tenantId, key };
      },
    },

    /**
     * A PLAN AN OPERATOR GIVES, THAT NOBODY IS PAYING FOR.
     *
     * ⚠️ THE ONLY OTHER WRITER OF `plan_id`, AND THE RULE IT LOOKS LIKE IT
     * BREAKS IS NOT THE RULE. "Only a signed event may stamp a plan" exists so a
     * WORKSPACE cannot grant itself one — every path a customer can reach opens
     * a page Stripe owns and waits for the money. An operator stands outside
     * every workspace (D18), reaches this only through the console door, and
     * leaves a dated row saying the plan was given rather than bought.
     *
     * ⚠️ AND IT GRANTS THE ALLOWANCE IMMEDIATELY, because the sweep that renews
     * a comped workspace runs tomorrow. A comp that took a day to become usable
     * is one an operator makes twice.
     *
     * ⚠️ THE LOBBY IS THE WAY BACK. Comping `none` puts a workspace back where
     * it started, which is how a comp ends — there is no separate un-comp, and a
     * second verb for the same write is how the two come to disagree.
     */
    "op.tenant.plan": {
      kind: "write", needs: "session", doors: ["operator"],
      async run(ctx, input): Promise<unknown> {
        operator(ctx);
        const tenantId = String(input.tenant ?? "") as TenantId;
        const planId = String(input.plan ?? "");
        const plans = await sold(ctx);
        const plan = plans.find((p) => p.id === planId);
        if (!tenantId || !plan) return ctx.fail("platform.invalid");

        await compPlan(ctx.directory, tenantId, MEMBERSHIP, plan.id, ctx.now);
        await renewAllowance(ctx.directory, tenantId, plans, ctx.now);
        return { tenant: tenantId, plan: plan.id, credits: plan.credits };
      },
    },

    /**
     * WHAT ONE WORKSPACE HOLDS AND HOW IT SPENT IT.
     *
     * ⚠️ THE OPERATOR COULD ADJUST WHAT A WORKSPACE MAY DO AND COULD NOT SEE
     * WHAT IT HAD. Every support conversation about credits starts with "how
     * many do they have and where did they go", and answering it meant reading
     * the database by hand — so the console's one billing power was to change a
     * number nobody on this side could look at.
     *
     * ⚠️ AND IT IS A READ. Moving the balance is `op.tenant.comp`, deliberately
     * separate: looking at somebody's account and putting money into it are
     * different acts, and the second one leaves a row.
     */
    "op.tenant.money": {
      kind: "read", needs: "session", doors: ["operator"],
      async run(ctx, input): Promise<unknown> {
        operator(ctx);
        const tenantId = String(input.tenant ?? "") as TenantId;
        if (!tenantId) return ctx.fail("platform.invalid");

        /* ⚠️ THE RESOLVED ALLOWANCE, not the plan's own — an override honoured
           in the product and invisible here is one nobody can explain. */
        const sub = await subscriptionFor(ctx.directory, tenantId, MEMBERSHIP);
        const plan = (await sold(ctx)).find((p) => p.id === sub?.planId) ?? null;

        return {
          wallet: await walletOf(ctx.directory, tenantId),
          auto: await autoTopUpOf(ctx.directory, tenantId),
          allowance: {
            monthly: allowanceFor(plan, sub?.adjustments ?? {}, sub?.overrides ?? {}),
            plan: plan?.credits ?? 0,
            comped: sub?.compedAt ?? null,
          },
          /* ⚠️ THE STATEMENT, because "where did my credits go" is the question
             this screen exists to answer and a balance alone cannot. */
          statement: await movements(ctx.directory, tenantId),
          spent: await spentByApp(
            ctx.directory, tenantId,
            new Date(ctx.now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()),
        };
      },
    },

    /**
     * CREDITS PUT INTO A WORKSPACE'S WALLET BY US.
     *
     * ⚠️ IT LANDS IN `bought`, NEVER IN THE ALLOWANCE. A comp that landed in the
     * month's grant would be swept away by the next renewal — so an apology for
     * something we broke would expire on the first of the month, silently, which
     * is worse than not having made it.
     *
     * ⚠️ AND THE REASON IS REQUIRED AND GOES ON THE STATEMENT. A balance that
     * moved with nothing explaining it is the one thing nobody can reconstruct,
     * and this is the only write in the system that adds money without a payment
     * behind it.
     *
     * ⚠️ IT ONLY EVER ADDS. Taking credits back is a refund decision with a
     * payment behind it, not an operator's edit — and a route that could do both
     * is one where a mistyped sign empties somebody's wallet.
     */
    "op.tenant.comp": {
      kind: "write", needs: "session", doors: ["operator"],
      async run(ctx, input): Promise<unknown> {
        operator(ctx);
        const tenantId = String(input.tenant ?? "") as TenantId;
        const credits = Math.trunc(Number(input.credits ?? 0));
        const why = String(input.why ?? "").trim();
        if (!tenantId || !(credits > 0) || !why) return ctx.fail("platform.invalid");

        await topUp(ctx.directory, tenantId, credits, why, {}, ctx.now);
        return { tenant: tenantId, credits };
      },
    },

    /**
     * THE CATALOGUE, AS DECLARED AND AS SOLD.
     *
     * ⚠️ BOTH, BECAUSE AN EDITOR SHOWING ONLY THE CURRENT NUMBERS CANNOT SAY
     * WHICH OF THEM SOMEBODY TYPED. "Reset to what the code says" is the one
     * action every editable-configuration screen needs and the one it cannot
     * offer without knowing what the code says.
     *
     * ⚠️ AND HOW MANY WORKSPACES ARE ON EACH TIER, BEFORE THE EDIT RATHER THAN
     * AFTER. Cutting a limit is a different decision at three customers and at
     * three hundred, and the number is one query away from the person deciding.
     */
    "op.plans": {
      kind: "read", needs: "session", doors: ["operator"],
      async run(ctx): Promise<unknown> {
        operator(ctx);
        const declared = deps.plans ?? [];
        return {
          declared,
          sold: await sold(ctx),
          edits: await planEdits(ctx.directory),
          on: await onEachPlan(ctx.directory),
          keys: entitlementKeys(every()),
          /* ⚠️ WHY THE EDITS ARE NOT BEING SERVED, WHEN THEY ARE NOT. The
             fallback is correct and silent, which is the problem it creates —
             see `catalogueProblems`. */
          problems: await catalogueProblems(ctx.directory, declared, entitlementKeys(every())),
        };
      },
    },

    /**
     * A PLAN'S NUMBERS CHANGE.
     *
     * ⚠️ IT GRANDFATHERS FIRST, ALWAYS — `editPlan` owns that order, because
     * afterwards the old numbers are gone and there is nothing left to snapshot.
     * The count comes back so the operator is told how many workspaces were held
     * rather than left to assume it happened.
     *
     * ⚠️ AND A REFUSAL IS THE BUILD'S REFUSAL, REPORTED RATHER THAN CORRECTED.
     * `refuseCatalog` over the merged result: the same function, the same
     * reasons, so a catalogue that would fail CI cannot be typed into the
     * console instead.
     */
    "op.plan.edit": {
      kind: "write", needs: "session", doors: ["operator"],
      async run(ctx, input): Promise<unknown> {
        operator(ctx);
        const planId = String(input.plan ?? "");
        const edit = (input.edit ?? {}) as PlanEdit;
        if (!planId || typeof edit !== "object") return ctx.fail("platform.invalid");

        const out = await editPlan(
          ctx.directory, deps.plans ?? [], entitlementKeys(every()),
          planId, edit, ctx.now, ctx.email);
        if ("unknown" in out) return ctx.fail("platform.invalid");
        /* ⚠️ THE REFUSAL NAMES THE RULE. "That is not a valid catalogue" with
           nothing else is a screen telling somebody to guess, and the rules are
           the build's own — one line each, keyed by which one was broken. */
        if (!out.ok) {
          return ctx.fail("platform.invalid", {},
            { fields: Object.fromEntries(out.problems.map((p) => [p.why, p.detail])) });
        }
        /* ⚠️ The status carries the yes; the body carries what happened. */
        return { plan: out.plan, held: out.held };
      },
    },

    /** A plan goes back to what the code says — see `resetPlan`. */
    "op.plan.reset": {
      kind: "write", needs: "session", doors: ["operator"],
      async run(ctx, input): Promise<unknown> {
        operator(ctx);
        const planId = String(input.plan ?? "");
        if (!planId) return ctx.fail("platform.invalid");
        return { plan: planId, held: await resetPlan(ctx.directory, deps.plans ?? [], planId) };
      },
    },

    /**
     * A PRODUCT IS SWITCHED ON, OR OFF, FOR ONE WORKSPACE.
     *
     * ⚠️ THIS IS THE WHOLE OF "PROVISIONING BECOMES A FEATURE FLAG" (D1), and
     * until it had a route the sentence was aspirational: every workspace got
     * every product this deployment serves, because the enablement row was only
     * ever written when the workspace was made. Switching one on provisions NO
     * worker, NO database, NO bucket, NO domain and NO secret — it applies that
     * product's tables to the shard the workspace is already on, and writes the
     * row.
     *
     * ⚠️ TURNED OFF IS NOT REMOVED. What ends is reachability. The records stay,
     * the tables stay applied, and the shard still counts the product when
     * deciding whether it could hold this workspace — because a business that
     * stops using one of our products has not asked to be forgotten, and erasing
     * on a downgrade is a decision nobody made.
     */
    "op.tenant.app": {
      kind: "write", needs: "session", doors: ["operator"],
      async run(ctx, input): Promise<unknown> {
        operator(ctx);
        const tenantId = String(input.tenant ?? "") as TenantId;
        const appId = String(input.app ?? "") as AppId;
        const on = input.on;
        if (!tenantId || !appId || typeof on !== "boolean") return ctx.fail("platform.invalid");

        const app = deps.apps[appId]?.();
        if (!app) return ctx.fail("platform.not_found");

        if (!on) {
          await disableApp(ctx.directory, tenantId, appId, ctx.now);
          return { tenant: tenantId, app: appId, on: false };
        }

        const tenant = await tenantById(ctx.directory, tenantId);
        if (!tenant) return ctx.fail("platform.not_found");
        /* ⚠️ THE SCHEMA FIRST, AND THE ROW ONLY IF IT LANDED — see `enableApp`.
           The other order opens a window in which the product is on and every
           one of its reads answers "no such table", and that window is the
           customer's first minute with it. */
        const why = await enableApp(
          ctx.directory, ctx.shardOf(tenant), tenantId, appId,
          schemaFor(app), applySchema, ctx.now);
        if (why) return ctx.fail("platform.invalid");
        return { tenant: tenantId, app: appId, on: true };
      },
    },

    /**
     * ⚠️ HOW MANY BUSINESSES THIS PERSON MAY OPEN WITHOUT PAYING — a partner, a
     * pilot, somebody we owe a favour. A COUNT rather than a switch, because
     * "may make commercial workspaces" cannot be taken back without taking back
     * the ones already made; a number simply runs out.
     *
     * ⚠️ AND IT IS SET, NEVER INCREMENTED. An operator pressing a button twice
     * on a slow connection would otherwise hand out two, and the record of what
     * was agreed is a number rather than a history of presses.
     */
    "op.account.commercial": {
      kind: "write", needs: "session", doors: ["operator"],
      async run(ctx, input): Promise<unknown> {
        operator(ctx);
        const email = String(input.email ?? "").trim().toLowerCase();
        const granted = Number(input.granted);
        if (!email || !Number.isFinite(granted) || granted < 0) return ctx.fail("platform.invalid");

        const found = await ctx.directory.prepare(`SELECT id FROM account WHERE email = ?`)
          .bind(email).first<{ id: string }>();
        if (!found) return ctx.fail("platform.not_found");

        const accountId = found.id as AccountId;
        await setCommercialGrant(ctx.directory, accountId, granted);
        /* ⚠️ Answered with what they have LEFT, not with what was set. The two
           differ the moment somebody has already spent one, and the number an
           operator needs to see is the one the person will meet. */
        const allowance = await commercialAllowance(ctx.directory, accountId);
        /* ⚠️ AND `left` IS ASKED, NOT SUBTRACTED. An unlimited grant is not a
           number, and `granted - used` on one produces a figure a screen would
           print — which is how "unlimited, 3 used" becomes a countdown. */
        return {
          email, granted: allowance.granted, used: allowance.used,
          left: commercialLeft(allowance),
        };
      },
    },

    /*
      ⚠️ WHAT THE DEPLOYMENT WAS TOLD, AND WHAT IT IS STILL MISSING. The
      definitions travel with the values for the reason `op.flags` does: a
      console that had only keys and values would head each row with an id, and
      nothing on the screen could say what stops working without it.

      ⚠️ AND NO SECRET IS EVER ANSWERED. `set` and `readable` are the whole of
      what a screen is told — there is no path here that returns a live key,
      which is what stops the console being a way to take one out.
    */
    "op.config": {
      kind: "read", needs: "session", doors: ["operator"],
      async run(ctx): Promise<unknown> {
        operator(ctx);
        return {
          items: await configState(ctx.directory, deps.configSecret),
          /* ⚠️ Said once, here, rather than inferred per row by a screen: with
             no secret bound, every secret row is unwritable and the reason is
             the deployment's rather than the operator's. */
          canKeepSecrets: !!deps.configSecret,
          /*
            ⚠️ THE DEAD LETTER TRAVELS WITH THE KEYS, because this is the screen
            somebody is on when a payment did not land. A parked event is money
            captured against a workspace nothing could place — and a dead letter
            nobody can read is the same silent success with an extra table.

            ⚠️ AND IT FAILS OPEN. A deployment that has never taken a payment has
            no table yet, and refusing to draw the credentials screen over a
            missing row would make configuring Stripe impossible on exactly the
            deployment that has not configured Stripe.
          */
          parked: await parkedEvents(ctx.directory).catch(() => []),
        };
      },
    },

    "op.config.set": {
      kind: "write", needs: "session", doors: ["operator"],
      async run(ctx, input): Promise<unknown> {
        operator(ctx);
        const key = String(input.key ?? "");
        if (!CREDENTIALS[key]) return ctx.fail("platform.invalid");
        /* ⚠️ An empty value CLEARS. Turning a lane off has to be as reachable as
           turning it on, or the only way back is a database. */
        const why = await setConfig(
          ctx.directory, deps.configSecret, key, String(input.value ?? ""), ctx.now);
        if (why === "no_secret_bound") return ctx.fail("platform.unavailable");
        if (why) return ctx.fail("platform.invalid");
        return { key, set: !!String(input.value ?? "").trim() };
      },
    },

    "op.flags": {
      kind: "read", needs: "session", doors: ["operator"],
      async run(ctx): Promise<unknown> {
        operator(ctx);
        /* ⚠️ THE APP'S IDENTITY TRAVELS WITH ITS BOOK, and it did not: this
           answered a map keyed by app id, so the console had nothing to head a
           section with but the id — rendered through `sentence()`, which
           capitalises a key and calls it a name. A product's name and its mark
           are declared; manufacturing one of them at the screen is how "hello"
           came to be a heading. */
        const apps = every()
          .filter((a) => a.flags && Object.keys(a.flags).length)
          .map((a) => ({ id: a.id, name: a.name, mark: a.mark, book: a.flags as FlagBook }));
        return { apps, deployment: await deploymentFlags(ctx.directory) };
      },
    },

    "op.flag.set": {
      kind: "write", needs: "session", doors: ["operator"],
      async run(ctx, input): Promise<unknown> {
        operator(ctx);
        const id = String(input.id ?? "");
        /* ⚠️ A switch nothing declares is a switch that does nothing — refused
           rather than stored, or the console fills with rows that lie. */
        if (!every().some((a) => a.flags && id in a.flags)) return ctx.fail("platform.not_found");
        await setDeploymentFlag(ctx.directory, id, input.on === true, ctx.now);
        return { id, on: input.on === true };
      },
    },

    /*
      ⚠️ EVERY GENERATING ACTION EVERY PRODUCT DECLARES, WITH WHAT IT RUNS ON
      (D19). The catalogue rows travel with it because the binding is a choice
      among them, and a screen that had to fetch them separately would be a
      screen that can offer a model the lane cannot use.
    */
    "op.ai": {
      kind: "read", needs: "session", doors: ["operator"],
      async run(ctx): Promise<unknown> {
        operator(ctx);
        const models = await deps.models();
        const apps = await Promise.all(every().map(async (a) => {
          const bound = await bindingsOf(ctx.directory, a.id);
          return {
            id: a.id, name: a.name, mark: a.mark,
            actions: actionsOf(a).map((action) => {
              const binding = bound.find((b) => b.action === action.id);
              const now = running(action.ai, models, binding, undefined);
              return {
                id: action.id, summary: action.summary,
                lane: action.ai.lane,
                variables: action.ai.variables,
                brandable: action.ai.brandable === true,
                declared: action.ai.prompt,
                prompt: now.prompt,
                wordedBy: now.wordedBy,
                model: now.model?.id ?? null,
                bound: binding?.model ?? null,
                /* ⚠️ Only the rows this lane can actually use — see `lanesFor`. */
                choices: inLane(models, action.ai.lane).filter((m) => m.enabled)
                  .map((m) => ({ id: m.id, label: m.label, provider: m.provider })),
              };
            }),
          };
        }));
        /*
          ⚠️ WHAT IS WRONG WITH THE CATALOGUE ITSELF, ON THE ONE SCREEN THAT CAN
          FIX IT. `refuseCatalogue` states three faults that no other check can
          see — a row whose task maps to no lane (nothing will ever select it),
          two rows claiming the default in one lane (which one runs depends on
          row order), and, worst, a row that is ENABLED and priced at zero, which
          settles free on every call so usage looks healthy and the provider's
          invoice is the first anybody hears of it. The rule was written, argued
          for and called by nothing.

          ⚠️ REPORTED, NEVER CORRECTED. Which rows are enabled and what they cost
          is an operator's decision; a console that silently disabled a row to
          make its own check pass would be changing the catalogue to hide a
          finding.
        */
        const needed = [...new Set(every().flatMap((a) => actionsOf(a).map((x) => x.ai.lane)))];
        const faults = refuseCatalogue(models, needed)
          .map((f) => ({ of: f.of, why: f.why, detail: f.detail }));
        return { apps, faults };
      },
    },

    "op.ai.bind": {
      kind: "write", needs: "session", doors: ["operator"],
      async run(ctx, input): Promise<unknown> {
        operator(ctx);
        const appId = String(input.app ?? "");
        const actionId = String(input.action ?? "");
        const app = deps.apps[appId]?.();
        const action = app ? actionsOf(app).find((a) => a.id === actionId) : undefined;
        if (!action) return ctx.fail("platform.not_found");

        const change: { model?: string | null; prompt?: string | null } = {};
        if (input.model !== undefined) {
          const wants = input.model === null ? null : String(input.model);
          /* ⚠️ Only a row this lane can use, and only an enabled one — a
             binding to anything else is a binding that silently falls back. */
          if (wants !== null) {
            const models = await deps.models();
            const usable = inLane(models, action.ai.lane).some((m) => m.id === wants && m.enabled);
            if (!usable) return ctx.fail("platform.invalid");
          }
          change.model = wants;
        }
        if (input.prompt !== undefined) {
          const text = input.prompt === null ? null : String(input.prompt);
          if (text !== null) {
            const refused = refusePrompt(action.ai, text, "operator");
            if (refused.length) return ctx.fail("platform.invalid", { detail: refused.join(", ") });
          }
          change.prompt = text;
        }
        await bind(ctx.directory, appId, actionId, change, ctx.now);
        return { app: appId, action: actionId };
      },
    },

    "op.jobs": {
      kind: "read", needs: "session", doors: ["operator"],
      async run(ctx): Promise<unknown> {
        operator(ctx);
        const book = Object.fromEntries(every().flatMap((a) => Object.entries(a.jobs ?? {})));
        return { book, runs: await runsOf(ctx.directory, book, 50) };
      },
    },

    /**
     * WHAT NEEDS SOMEBODY, COUNTED, SO THE CONSOLE'S FRONT DOOR IS NOT A MENU.
     *
     * ⚠️ EVERY ONE OF THESE WAS ALREADY KNOWABLE AND NONE OF IT WAS ANYWHERE AN
     * OPERATOR LOOKS FIRST. A nightly pass that failed, a payment that arrived
     * and could not be placed, a workspace whose card was declined, a database
     * counting down to deletion: four facts on four different screens, each
     * behind a row whose label gives no hint that anything is wrong. Somebody
     * finds out by opening all nine, or by a customer telling them.
     *
     * ⚠️ COUNTS, NOT ROWS. This is the line under a destination — "1 failed
     * last night" — and the screen behind it is where the detail already lives.
     * Answering with the rows would be a second copy of four screens, drifting.
     *
     * ⚠️ AND IT IS ONE READ. Four reads on a menu is four round trips before
     * anything is drawn, on the one screen that has to be instant.
     */
    "op.attention": {
      kind: "read", needs: "session", doors: ["operator"],
      async run(ctx): Promise<unknown> {
        operator(ctx);
        const book = Object.fromEntries(every().flatMap((a) => Object.entries(a.jobs ?? {})));
        const runs = await runsOf(ctx.directory, book, 50);
        /* ⚠️ FAILED AND STALLED ARE ONE COUNT, because they are one question:
           did the work happen. A job that errored says so; a job that simply
           stopped being scheduled says nothing at all, which is the worse of
           the two and the reason `stalled` exists. */
        const failed = new Set(runs.filter((r) => r.ok === false).map((r) => r.jobId));
        for (const id of stalled(book, runs, ctx.now.getTime(), A_DAY)) failed.add(id);

        const due = await ctx.directory.prepare(
          `SELECT COUNT(*) AS n FROM subscription WHERE status = 'past_due'`)
          .first<{ n: number }>();

        const have = await resources(ctx.directory);

        return {
          jobs: failed.size,
          parked: (await parkedEvents(ctx.directory, 50)).length,
          pastDue: due?.n ?? 0,
          /* ⚠️ A STORE COUNTING DOWN TO ITS OWN DELETION is the one item here
             with a deadline rather than a state. */
          draining: have.filter((r) => r.state === "draining").length,
          /* ⚠️ AND THE SWITCH THAT CLOSES EVERY DOOR, because leaving it on is
             the mistake nobody makes deliberately and everybody makes once. */
          maintenance: await maintenanceMode(ctx.directory),
        };
      },
    },

    "op.shards": {
      kind: "read", needs: "session", doors: ["operator"],
      async run(ctx): Promise<unknown> {
        operator(ctx);
        return { items: await shards(ctx.directory) };
      },
    },

    /**
     * ⚠️ RESERVE A SHARD FOR ONE WORKSPACE, WHICH IS NOT THE SAME AS MOVING IT
     * THERE. This writes the placement RULE: from here on the shard takes that
     * workspace and nobody else, and that workspace is refused a shared one.
     * Reserving is cheap and reversible; the move is a data migration between
     * two databases and belongs where a migration belongs.
     *
     * ⚠️ AND ONLY A BUSINESS MAY HAVE ONE (`mayIsolate`). A personal workspace
     * shares because sharing is right for it — a database per person is a cost
     * with no promise behind it.
     *
     * ⚠️ THE SHARD MUST BE EMPTY. Dedicating one that already holds strangers
     * would sell isolation over a database full of other people's records, and
     * nothing downstream would notice: every workspace on it keeps working.
     */
    "op.shard.dedicate": {
      kind: "write", needs: "session", doors: ["operator"],
      async run(ctx, input): Promise<unknown> {
        operator(ctx);
        const shardId = String(input.shard ?? "");
        const slug = String(input.slug ?? "");
        if (!shardId || !slug) return ctx.fail("platform.invalid");

        const tenant = await tenantBySlug(ctx.directory, slug);
        if (!tenant) return ctx.fail("platform.not_found");
        if (!mayIsolate(tenant.kind)) {
          return ctx.fail("platform.commercial_required", { workspace: tenant.name });
        }

        const found = (await shards(ctx.directory)).find((s) => s.id === shardId);
        if (!found) return ctx.fail("platform.not_found");
        /* ⚠️ Its own tenant does not count against emptiness — re-running this
           for a workspace already moved there must not refuse. */
        const strangers = await ctx.directory.prepare(
          `SELECT COUNT(*) AS n FROM tenant WHERE shard_id = ? AND id <> ? AND closed_at IS NULL`)
          .bind(shardId, tenant.id).first<{ n: number }>();
        if ((strangers?.n ?? 0) > 0) return ctx.fail("platform.conflict");

        await addShard(ctx.directory, found.id, found.where, found.ceiling, tenant.id, ctx.now);
        return { shard: found.id, slug: tenant.slug };
      },
    },

    /* ------------------------------------------------------- infrastructure --- */

    /*
      ⚠️ WHAT EXISTS, WHAT IS OWED, AND WHAT IS ABOUT TO BE DESTROYED — one
      read, and the third column is the reason it is a screen rather than a log
      line. Every destructive step in this system is at the far end of a
      thirty-day drain, so this is where a mistake is still free: a database
      listed as draining is a sentence somebody can act on a month before it
      becomes a deletion.
    */
    "op.infra": {
      kind: "read", needs: "session", doors: ["operator"],
      async run(ctx): Promise<unknown> {
        operator(ctx);
        const at = deps.account?.() ?? null;
        const have = await resources(ctx.directory);
        const want = wanted(deps.deployment ?? "one", every(), deps.serves ?? []);
        return {
          /* ⚠️ Never the token itself, and never a prefix of it. */
          configured: !!at,
          serves: deps.serves ?? [],
          items: have,
          /* ⚠️ THE PLAN, WHICH CHANGES NOTHING. Reading what an apply would do
             has to be free, or nobody looks before pressing. */
          steps: plan(want, have, ctx.now).map((s) => s.do === "create" || s.do === "bind"
            ? { do: s.do, name: s.want.name, kind: s.want.kind, residency: s.want.residency }
            : { do: s.do, name: s.row.name, kind: s.row.kind, after: s.row.drainAfter }),
          /*
            ⚠️ AND WHAT THIS DEPLOYMENT CANNOT PROMISE, NAMED. A need dropped for
            a residency is a feature that does not exist there — silently, and
            correctly. Reporting it is the difference between a considered
            refusal and a product that mysteriously does less in Europe.
          */
          withheld: every().flatMap((app) => Object.values(app.needs ?? {})
            .filter((n) => n.holds !== "none" && !KEEPS_RESIDENCY[n.kind])
            .flatMap((n) => (deps.serves ?? []).filter((r) => r !== "global")
              .map((r) => ({ app: app.id, need: n.id, kind: n.kind, residency: r,
                why: `a ${n.kind} carries ${n.holds} data and the vendor offers no residency control for it` })))),
        };
      },
    },

    /*
      ⚠️ THE APPLY, AND IT IS DELIBERATELY ALSO ON THE CLOCK. The nightly sweep
      runs the same function, so this button is "do it now" rather than the only
      way it ever happens — an operator who never presses it still gets a
      deployment that converges.
    */
    "op.infra.apply": {
      kind: "write", needs: "session", doors: ["operator"],
      async run(ctx): Promise<unknown> {
        operator(ctx);
        const at = deps.account?.() ?? null;
        if (!at) return ctx.fail("platform.unavailable");
        return apply({
          directory: ctx.directory, at,
          deployment: deps.deployment ?? "one",
          apps: every(), serves: deps.serves ?? [], now: () => ctx.now,
        });
      },
    },

    /*
      ⚠️ WHAT THE TOKEN CAN ACTUALLY DO, ASKED RATHER THAN ASSUMED. A token with
      D1 but not Queues produces a reconciler that half works and reports the
      other half as an outage; one call names the missing permission.
    */
    "op.infra.verify": {
      kind: "read", needs: "session", doors: ["operator"],
      async run(ctx): Promise<unknown> {
        operator(ctx);
        const at = deps.account?.() ?? null;
        if (!at) return { configured: false, can: [] };
        const out = await verify(at);
        return out.ok ? { configured: true, can: out.value.can } : { configured: true, can: [], why: out.why };
      },
    },

    /* --------------------------------------------------------------- move --- */

    /*
      ⚠️ MOVING A WORKSPACE IS THE ONLY WAY ITS JURISDICTION EVER CHANGES —
      Cloudflare fixes a database's and a bucket's at creation and offers no
      edit. So this is not "a setting with a slow implementation", it is the
      implementation, permanently.

      ⚠️ AND IT ONLY STARTS THE MOVE. The workspace goes read-only here and the
      nightly pass carries the rows, verifies both sides and flips — because a
      copy is minutes of work and a request is not, and a move that timed out
      half way through a request would leave a workspace read-only with nobody
      advancing it.
    */
    "op.tenant.move": {
      kind: "write", needs: "session", doors: ["operator"],
      async run(ctx, input): Promise<unknown> {
        operator(ctx);
        const tenant = await tenantBySlug(ctx.directory, String(input.slug ?? ""));
        if (!tenant) return ctx.fail("platform.not_found");

        const refused = await beginMove(
          ctx.directory, tenant.id, String(input.shard ?? ""), ctx.now);
        if (refused) {
          /* ⚠️ THE REASON REACHES THE OPERATOR. "Cannot move" over a shard whose
             schema is missing the app is a sentence somebody can act on; a bare
             409 is one they open a ticket about. */
          return ctx.fail("platform.conflict", { why: refused });
        }
        return { slug: tenant.slug, to: String(input.shard), state: "copying" };
      },
    },

    /* ⚠️ WHAT IS IN FLIGHT, so a workspace stuck read-only is visible rather
       than reported by its owner. */
    "op.moves": {
      kind: "read", needs: "session", doors: ["operator"],
      async run(ctx): Promise<unknown> {
        operator(ctx);
        const rows = await ctx.directory.prepare(
          `SELECT * FROM move ORDER BY at DESC LIMIT 100`).all();
        return { items: rows.results };
      },
    },

    "op.maintenance": {
      kind: "read", needs: "session", doors: ["operator"],
      async run(ctx): Promise<unknown> {
        operator(ctx);
        return { mode: await maintenanceMode(ctx.directory) };
      },
    },

    "op.maintenance.set": {
      kind: "write", needs: "session", doors: ["operator"],
      async run(ctx, input): Promise<unknown> {
        operator(ctx);
        const mode = String(input.mode ?? "");
        if (mode !== "off" && mode !== "readonly" && mode !== "full") return ctx.fail("platform.invalid");
        await setMaintenance(ctx.directory, mode, ctx.now);
        return { mode };
      },
    },

    /* ---------------------------------------------------------------- push --- */

    /**
     * ⚠️ THE PUBLIC HALF AND A COUNT, AND NEVER THE PRIVATE KEY. There is no
     * screen anywhere that has a reason to show it, and a value a screen can
     * show is one that ends up in a screenshot in a support thread.
     */
    "op.push": {
      kind: "read", needs: "session", doors: ["operator"],
      async run(ctx): Promise<unknown> {
        operator(ctx);
        const vapid = await vapidOf(ctx.directory);
        /* ⚠️ HOW MANY DEVICES ARE ACTUALLY SUBSCRIBED, because "push is
           configured" and "push reaches anybody" are different facts and only
           the second one is the feature. */
        let devices = 0;
        try {
          const row = await ctx.directory.prepare(
            `SELECT COUNT(*) AS n FROM push_subscription`).first<{ n: number }>();
          devices = row?.n ?? 0;
        } catch { devices = 0; }
        return { live: !!vapid, publicKey: vapid?.publicKey ?? null, devices };
      },
    },

    /**
     * ⚠️ GENERATED HERE, NEVER PASTED IN — see `makePushKeys`. The question the
     * console asks is "does this deployment have a keypair", not "what is
     * yours": there is nothing an operator could obtain elsewhere that would
     * work here, and a form that accepted one would be a field a private key
     * travels through a clipboard and a request log to reach.
     *
     * ⚠️ AND REPLACING IS A SEPARATE ANSWER, not a re-press. It unsubscribes
     * every device on the deployment, permanently — so the refusal is what the
     * screen turns into a second, differently-worded button.
     */
    "op.push.generate": {
      kind: "write", needs: "session", doors: ["operator"],
      async run(ctx, input): Promise<unknown> {
        operator(ctx);
        /* ⚠️ RFC 8292 WANTS A `mailto:` OR AN `https:` — it is who a push service
           contacts about a misbehaving sender, so it has to be an address that
           reaches somebody. The deployment's own root is the one this code can
           answer for; `deployment` is an internal name and would be a URL that
           resolves nowhere. */
        const subject = `https://${deps.root ?? deps.deployment ?? "example.invalid"}`;
        const made = await makePushKeys(
          ctx.directory, subject, input.replace === true, ctx.now);
        if (made === "already_have_one") return ctx.fail("platform.conflict");
        return made;
      },
    },
  };
}

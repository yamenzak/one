/**
 * `one new` — a whole app, from one word.
 *
 * ⚠️ PLAIN JAVASCRIPT, DELIBERATELY. The CLI has to run in a fresh checkout
 * before anything is installed or built — the moment scaffolding an app requires
 * the workspace to be working, the first thing anybody does with this repository
 * is the one thing it cannot do.
 *
 * ⚠️ THE POINT IS NOT SAVING TYPING. It is that everything the platform learned
 * arrives switched on. A hand-started app is one where somebody chose which
 * pieces to wire, and the pieces they did not choose are invisible: an inbox
 * with no surface, a maintenance switch nothing reads, an erasure that covers
 * whichever tables were fashionable that week. Every audit this repository has
 * run found that shape, in every app, and it is the reason this directory exists.
 *
 * ⚠️ AND THE TEMPLATE IS CHECKED AGAINST THE MANIFEST TYPE ITSELF. A template
 * rots the moment a day-zero field is added and nobody thinks to update it — so
 * the scaffold test reads `AppSpec` and fails when the generated manifest is
 * missing a field the type requires. The template cannot fall behind the
 * platform without a red run.
 */

const DNS_LABEL = /^[a-z][a-z0-9-]{1,30}[a-z0-9]$/;

/**
 * ⚠️ THE APP ID IS A DNS LABEL AND A PACKAGE NAME AND A HOST, all at once, and
 * it is not renameable later: it is the passkey relying party's subdomain, the
 * value stamped into every payment object, and the directory every module ids
 * itself from. Refusing a bad one here costs a sentence; refusing it later costs
 * a migration.
 */
export function idProblem(id) {
  if (!DNS_LABEL.test(id)) return "must be a DNS label: lowercase, 3-32 characters, no leading or trailing dash";
  if (RESERVED.includes(id)) return `"${id}" is a door or a platform package, not an app`;
  return null;
}

/** @type {readonly string[]} */
const RESERVED = ["kernel", "runtime", "ui", "cli", "docs", "scripts", "admin", "setup", "root", "www", "api", "play"];

const title = (id) => id.charAt(0).toUpperCase() + id.slice(1).replace(/-(\w)/g, (_, c) => c.toUpperCase());

export function filesFor(id) {
  const Name = title(id);
  return {
    "package.json": packageJson(id),
    /*
      ⚠️ WITHOUT THIS THE GENERATED APP DOES NOT TYPECHECK. Its own boot test
      imports `cloudflare:test`, whose types come from the pool's reference — so
      the scaffold shipped an app that passed `test` and failed `typecheck` on
      the first run, which is the worst possible first impression of a framework.
    */
    "env.d.ts": `/// <reference types="@cloudflare/vitest-pool-workers" />\n`,
    "tsconfig.json": tsconfig(),
    "vitest.config.ts": vitestConfig(id),
    "vitest.node.config.ts": vitestNodeConfig(),
    "src/manifest.ts": manifest(id, Name),
    "src/worker.ts": worker(id),
    "test/boot.test.ts": bootTest(id),
    "test/manifest.node.test.ts": lockTest(id),
    "manifest.lock.json": "{}\n",
  };
}

/* ------------------------------------------------------------------ files --- */

const packageJson = (id) => `${JSON.stringify({
  name: `@one/${id}`,
  version: "0.0.0",
  private: true,
  type: "module",
  description: `A ONE app. Everything it does beyond one collection is the platform's.`,
  scripts: {
    test: "vitest run && vitest run --config vitest.node.config.ts",
    typecheck: "tsc --noEmit",
    build: "tsc --noEmit",
    clean: "rm -rf .turbo *.tsbuildinfo",
  },
  dependencies: { "@one/kernel": "workspace:*", "@one/runtime": "workspace:*" },
  devDependencies: {
    "@cloudflare/vitest-pool-workers": "0.8.55",
    typescript: "^5.9.3",
    vitest: "^3.2.4",
  },
}, null, 2)}\n`;

const tsconfig = () => `${JSON.stringify({
  extends: "../../tsconfig.base.json",
  compilerOptions: {
    rootDir: ".",
    types: ["vitest/globals"],
    lib: ["ES2023", "DOM"],
    noEmit: true,
    declaration: false,
    declarationMap: false,
    jsx: "react-jsx",
  },
  include: ["src/**/*", "test/**/*", "env.d.ts", "vitest.config.ts"],
}, null, 2)}\n`;

const vitestConfig = (id) => `import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

/**
 * ⚠️ THE TOPOLOGY IS REAL. Miniflare preserves the Host exactly as the edge does
 * and browsers resolve \`.localhost\` to loopback, so \`setup.${id}.localhost\` IS
 * the setup door and \`<slug>.${id}.localhost\` IS a workspace. A suite that drove
 * one origin and asserted door behaviour from a flag would be testing the flag.
 */
export default defineWorkersConfig({
  test: {
    /* ⚠️ The lock check needs a filesystem, so it lives in the node project. */
    exclude: ["**/*.node.test.ts", "**/*.solo.test.ts", "**/node_modules/**"],
    /*
      A serial root run absorbs Miniflare storage contention; one retry absorbs
      the rest. A genuine assertion failure still fails twice.
    */
    retry: 1,
    poolOptions: {
      workers: {
        /*
          ⚠️ SHARED STORAGE ACROSS THE FILE, ON PURPOSE. These tests describe a
          deployment's life — it boots, a workspace is created, the workspace is
          then served — and rolling storage back between them would make every
          test after the first run against a database with no schema.
        */
        isolatedStorage: false,
        miniflare: {
          compatibilityDate: "2026-01-01",
          compatibilityFlags: ["nodejs_compat"],
          d1Databases: {
            /* Global. Routing data only — see DIRECTORY_COLUMNS. */
            DIRECTORY: "one-${id}-directory",
            /* The default region keeps the bare name; a second is ADDITIVE beside it. */
            DB: "one-${id}-auto",
          },
          r2Buckets: { MEDIA: "one-${id}-media" },
          kvNamespaces: ["CACHE"],
        },
      },
    },
  },
});
`;

const vitestNodeConfig = () => `import { defineConfig } from "vitest/config";

/**
 * ⚠️ A SECOND PROJECT, AND THE REASON IS THE FILESYSTEM. A worker has none, and
 * the manifest lock is a file this app commits.
 *
 * The split is on "does this need a worker" rather than on "is this a unit
 * test" — splitting the other way puts behavioural tests in front of a mock.
 */
export default defineConfig({
  test: { include: ["test/**/*.node.test.ts"] },
});
`;

/**
 * ⚠️ EVERY DAY-ZERO FIELD IS SET, and the scaffold test reads `AppSpec` to make
 * sure it stays that way. Each of them implies a column, a table or a legal
 * record that cannot be applied retroactively — so an app that starts without
 * one needs a migration rather than an edit, and the whole reason to generate a
 * manifest is that nobody has to know which those are.
 */
const manifest = (id, Name) => `/**
 * ${Name} — the manifest, and very nearly the whole app.
 *
 * ⚠️ EVERYTHING BELOW IS A DECLARATION. The routes, the AI tools, the webhook
 * catalogue, the API document, the inbox, the ceilings, the erasure plan and the
 * export are all derived from it — so what you write here is what this product
 * IS, and there is no second place where any of it can disagree.
 */

import {
  cache, collection, defineApp, defineBindings, field, objects, sql,
  type Currency, type Locale, type RegionId, type TimeZone,
} from "@one/kernel";

export const bindings = defineBindings({
  db: sql(),
  media: objects({ jurisdictional: true }),
  cache: cache(),
});

export type Bindings = typeof bindings;

/**
 * One collection, and everything it implies: the table, the indexes, list, read,
 * create, update, archive, the activity log and the erasure cascade.
 */
export const records = collection({
  id: "record",
  label: { one: "Record", many: "Records" },
  scope: { of: "tenant" },
  entitlement: "records",
  version: true,
  retention: { days: null, onTenantClose: "export-then-purge" },
  onDelete: { on: "archive" },
  activity: true,
  search: ["title"],
  fields: {
    title: field.text({ required: true, min: 1, max: 200 }),
    note: field.text({ multiline: true }),
  },
});

export const ${id.replace(/-/g, "")} = defineApp({
  id: "${id}",
  name: "${Name}",
  /* ⚠️ Live data once anything is sold: it tags every object we create at the
     payment provider, and changing it later orphans what is already tagged. */
  stripeMetadataPrefix: "${id.replace(/-/g, "")}",
  manifestVersion: "0.1.0",
  bindings,

  identity: {
    /* The ROOT, not this app's host: a credential registered here is offered by
       the next product, and first sign-in there is a tap rather than a sign-up. */
    rootRelyingParty: "4dl.app",
    sessionScope: "origin",
    /* ⚠️ ONE REGION, SO THE DIRECTORY IS IN IT. A directory region this app does
       not list resolves every tenantless door to a binding that does not exist,
       and the symptom is a 503 from the sign-in screen. Adding a second region
       later is ADDITIVE — the default keeps the bare binding name. */
    directoryRegion: "auto" as RegionId,
  },
  tenancy: {
    appRoot: "${id}.4dl.app",
    doors: ["root", "setup", "admin", "slug"],
    regions: ["auto"] as RegionId[],
    defaultRegion: "auto" as RegionId,
    reservedSlugs: ["${id}", "www", "help"],
  },
  format: {
    currency: "EUR" as Currency,
    timeZone: "Europe/Berlin" as TimeZone,
    locale: "en" as Locale,
    units: "metric",
    weekStart: 1,
  },

  access: {
    permissions: ["record:read", "record:write", "workspace:create", "workspace:close", "billing:manage", "billing:operate", "inbox:read", "file:read", "file:write", "guide:read", "member:read", "member:manage"],
    roles: {
      /* ⚠️ \`member:manage\` is what makes this the FOUNDING role — the platform
         picks it by what it can do, so a role without it founds a workspace
         nobody can be invited into. */
      owner: ["record:read", "record:write", "workspace:create", "workspace:close", "billing:manage", "billing:operate", "inbox:read", "file:read", "file:write", "guide:read", "member:read", "member:manage"],
      reader: ["record:read", "inbox:read", "file:read", "guide:read", "member:read"],
    },
    /* ⚠️ Every entry names HOW it is withheld, and composition refuses one whose
       mechanism does not exist. \`parked\` is what a workspace that never chose a
       plan gets — and what a deployment with no payment rail at all serves. */
    entitlements: {
      records: { label: "Records", parked: true, enforcement: "gate" },
      /* ⚠️ BYTES, NOT FILES. A ceiling counted in rows is one a single large
         upload walks straight past. The platform enforces this key itself. */
      storedBytes: { label: "Storage", unit: "bytes", parked: 20_000_000, enforcement: "quota" },
    },
    plans: [
      {
        id: "free",
        name: "Free",
        price: { minor: 0, currency: "EUR" as Currency },
        period: "month",
        trialDays: 0,
        entitlements: { records: true, storedBytes: 20_000_000 },
      },
    ],
    /* ⚠️ "member" when the signed-in person IS the customer, "record" when the
       membership names the record they are. false sells nothing. */
    customerRail: false,
    customerFlags: {},
    seats: { counts: ["owner"] },
    personal: ["workspace:create"],
  },

  governance: {
    legal: [{ id: "terms", version: "2026-01-01", mustAccept: ["owner"] }],
    impersonation: { maxMinutes: 30, announce: true },
    auditRetentionDays: 365,
  },

  collections: [records],

  /* ⚠️ Every event the platform's own operations raise is declared here, and an
     app that omits one does not boot. */
  notifications: {
    "workspace.created": {
      category: "service", tone: "success", icon: "sparkle",
      title: "{slug} is ready", link: { to: "inbox" }, roles: ["owner"],
    },
    "plan.chosen": {
      category: "billing", tone: "info", icon: "card",
      title: "You chose {planId}", link: { to: "inbox" }, roles: ["owner"],
    },
    "package.granted": {
      category: "billing", tone: "success", icon: "gift",
      title: "{days} days added", link: { to: "inbox" }, roles: ["owner"],
    },
  },

  /* ⚠️ A closed set: what may be uploaded, which types, how large. A purpose is
     a POLICY, and a free-form string makes every question about it unanswerable
     at the moment somebody is uploading. */
  filePurposes: {
    attachment: { label: "Attachment", accept: ["image/jpeg", "image/png"], maxBytes: 8_000_000 },
  },

  help: {
    records: {
      title: "Keeping records",
      body: "A record is a short piece of text you want to find again. Everyone in this workspace can see them.",
      steps: ["Open Records", "Write it", "Save"],
      surfaces: ["record"],
    },
  },

  /* ⚠️ Scheduled work is DECLARED, not cron'd — a cron entry in a deployment
     config has no test, no audit and no record that it ran, and the
     characteristic failure of scheduled work is silence rather than an error.
     Empty is a decision; the field is not optional. */
  jobs: [],

  /*
    ⚠️ A CHECKLIST, NOT A TOUR — and the wizard is the \`required\` half of it.
    Every step is answered by COUNTING what is actually there, so it cannot drift
    from the product, survives a change of device, and un-checks itself if the
    thing is deleted. A tour step could only ever record "seen".
  */
  guide: {
    steps: [
      /* ⚠️ \`setup\` is WHOSE it is: the deployment's, this workspace's, or this
         person's. A person shown the workspace's checklist — already finished,
         none of it theirs — is what the third scope exists to prevent. */
      { id: "choose-plan", title: "Choose a plan", roles: ["owner"], setup: "workspace", required: true, answer: { kind: "platform", fact: "plan_chosen" } },
      { id: "first-record", title: "Add your first record", roles: ["owner"], setup: "workspace", required: false, answer: { kind: "collection", collection: "record", atLeast: 1 }, does: "record.create", help: "records" },
      { id: "a-passkey", title: "Add a passkey so you can sign in with a tap", roles: ["owner", "reader"], setup: "person", required: false, answer: { kind: "platform", fact: "passkey_registered" } },
    ],
    /* ⚠️ Capped by the platform, because a hint is the one tracked thing here. */
    hints: [],
  },

  /*
    ⚠️ RECOGNITION, NOT SCORE, AND EVERY RULE IS OVER AN EVENT SOMETHING ALREADY
    RAISES — an operation's \`emits\` or one of the platform's own. There is no
    total and no ranking here by design: a points total invites a leaderboard,
    and a leaderboard invites comparison between customers.

    Empty is a product that recognises nothing, which is most of them. Declaring
    one means declaring \`milestone.earned\` above and \`milestone:read\` in the
    permissions, or it does not boot.
  */
  milestones: {},

  releases: [{ version: "0.1.0", at: "2026-01-01", notes: ["First release."] }],

  /* Nothing has been withdrawn — and when it is, it is named here with a reason. */
  retired: {},

  /* ⚠️ EMPTY, AND THAT IS THE POINT. What belongs here is what a collection
     could not imply, and a new app has none of that yet. */
  operations: [],
  problems: {},
});
`;

/**
 * ⚠️ THE MODULE LIST IS THE ONE THING A TEMPLATE GETS WRONG AND NOBODY NOTICES.
 *
 * A missing module is a table that is never created, so the feature above it
 * fails at the first request that reaches it — which for an inbox, a dead letter
 * or a maintenance switch is a request nobody makes for weeks. The scaffold test
 * compares this list against the one the reference app composes.
 */
const worker = (id) => `/**
 * THE WORKER — and how little of it there is, is the point.
 *
 * ⚠️ NOTHING HERE ROUTES, GATES, RESOLVES A TENANT, PICKS A REGION, CREATES A
 * WORKSPACE OR APPLIES A SCHEMA. All of it is derived from the manifest. What
 * remains is the one thing a framework genuinely cannot decide: who a caller is.
 */

import { deriveSchema } from "@one/kernel";
import {
  applySchema, createRuntime, PLATFORM_GLOBAL, PLATFORM_REGIONAL, type RawEnv,
} from "@one/runtime";
import { ${id.replace(/-/g, "")}, records } from "./manifest.js";

const derived = deriveSchema("${id}", [records]);
if (derived.problems.length) throw new Error(\`${id}: \${derived.problems.map((p) => p.detail).join("; ")}\`);

/* ⚠️ ORDER IS DEPENDENCY ORDER, DECLARED — the runner validates it rather than
   trusting the array, because a wrong order produces an ALTER against a table
   that does not exist yet, swallowed, leaving a column that never appeared. */
/* ⚠️ SPREAD, NEVER HAND-LISTED — the same reason the regional half is. This was
   seven names typed out while the platform shipped thirteen, so a new app never
   created the consent ledger, the impersonation record, the config store, the
   domain claim or the catalogue: five tables absent, the routes over them
   mounted, and every suite green because nothing drove a surface nobody could
   reach. */
const GLOBAL_MODULES = [...PLATFORM_GLOBAL];
export const REGIONAL_MODULES = [...PLATFORM_REGIONAL, derived.module];


/** ⚠️ A code that is only ever logged is a code that never arrives. */
export const delivered = new Map<string, string>();

const runtime = createRuntime(${id.replace(/-/g, "")}, {
  directoryBinding: "DIRECTORY",
  identityBinding: "DIRECTORY",
  sessionsBinding: "db",
  objectsBinding: "media",
  /* ⚠️ Export and erasure are derived from these, so a module added later is
     covered by both paths on the same commit. */
  regionalModules: REGIONAL_MODULES,
  /* ⚠️ No secret, so the payment endpoint refuses and \`chargeable\` stays false —
     which is the honest state of a deployment with no provider. */
  webhookSecretVar: "PROVIDER_WEBHOOK_SECRET",
  deliverCode: async (email, code) => { delivered.set(email, code); },
  /* ⚠️ Who is in this workspace is the app's answer, and the ONE thing a
     framework cannot supply. */
  audienceFor: async (_tenantId, db) => {
    const rows = await db.all<{ account_id: string }>(\`SELECT DISTINCT account_id FROM sessions\`);
    return rows.map((r) => ({ userId: r.account_id, role: "owner" }));
  },
  onBoot: {
    global: (directory) => applySchema(directory, GLOBAL_MODULES).then(() => undefined),
    region: (bind) => applySchema(bind.db, REGIONAL_MODULES).then(() => undefined),
  },
});

export default {
  fetch: (request: Request, env: RawEnv): Promise<Response> => runtime.fetch(request, env),
  /* ⚠️ The scheduled handler is the RUNTIME's. A worker that writes its own is
     one where the run record, the isolation between jobs and the bound on a
     sweep are each optional — and all three are invisible when missing. */
  scheduled: (_controller: unknown, env: RawEnv): Promise<unknown> => runtime.scheduled(env),
};
`;

const bootTest = (id) => `/**
 * ⚠️ IT BOOTS, OR NOTHING ELSE MATTERS. This is the smallest assertion that the
 * manifest composes, the schema applies and the doors resolve — and it is the
 * one that fails first when a platform change breaks an app.
 */

import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../src/worker.js";

const at = (origin: string, path: string) =>
  worker.fetch(new Request(\`\${origin}\${path}\`), env as never);

describe("${id} answers", () => {
  /*
    ⚠️ THE PROBE ANSWERS EVERYWHERE, INCLUDING ON A HOST THAT IS NOT A DOOR. It
    is how a deployment is known to be up at all, so it runs before the host is
    classified — which means it is the wrong endpoint to prove door behaviour
    with, and this test exists partly to say so.
  */
  it("is healthy", async () => {
    expect((await at("https://${id}.4dl.app", "/health")).status).toBe(200);
  });

  /*
    ⚠️ THE SETUP DOOR, because it is the one place that serves before any
    workspace exists. A slug that nobody has taken is not a door, so asking it
    for a price list is a 404 rather than an empty catalogue.
  */
  it("serves its plans to somebody with no session", async () => {
    expect((await at("https://setup.${id}.4dl.app", "/api/billing.plans")).status).toBe(200);
  });

  it("refuses a workspace address nobody has taken", async () => {
    expect((await at("https://nobody.${id}.4dl.app", "/api/billing.plans")).status).toBe(404);
  });

  /* ⚠️ Anything outside this app's root is not ours to answer at all. */
  it("refuses a hostname that is not a door", async () => {
    expect((await at("https://nothing.example.test", "/api/billing.plans")).status).not.toBe(200);
  });
});
`;

const lockTest = (id) => `/**
 * ⚠️ THE LOCK IS THE LAST SURFACE THAT SHIPPED. Additions are free — nobody
 * holds what did not exist. A REMOVAL fails until it is named as retired, with a
 * reason, because a deletion, a rename and a typo look identical in a diff and
 * need opposite fixes.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EMPTY_SURFACE, removals, surfaceOf, type Surface } from "@one/kernel";
import { collectionOperations } from "@one/runtime";
import { ${id.replace(/-/g, "")} } from "../src/manifest.js";

const LOCK = join(import.meta.dirname, "..", "manifest.lock.json");

const current: Surface = surfaceOf({
  ...${id.replace(/-/g, "")},
  operations: [...${id.replace(/-/g, "")}.operations, ...${id.replace(/-/g, "")}.collections.flatMap((c) => collectionOperations(c))],
});

const stored = (): Surface => {
  try {
    return { ...EMPTY_SURFACE, ...(JSON.parse(readFileSync(LOCK, "utf8")) as Surface) };
  } catch {
    return EMPTY_SURFACE;
  }
};

describe("the surface this app has already shipped", () => {
  it("has not removed anything without saying so", () => {
    expect(
      removals(stored(), current, ${id.replace(/-/g, "")}.retired).map((r) => \`\${r.kind}: \${r.name}\`),
      "these disappeared from the manifest. Add each to \`retired\` with a reason, or restore it.",
    ).toEqual([]);
  });

  it("records what shipped, so the next diff has something to compare against", () => {
    if (removals(stored(), current, ${id.replace(/-/g, "")}.retired).length === 0) {
      writeFileSync(LOCK, \`\${JSON.stringify(current, null, 2)}\\n\`);
    }
    expect(stored()).toEqual(current);
  });
});
`;

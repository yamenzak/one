/**
 * WHAT THE ENGINE GIVES YOU, ASKED OF THE ENGINE — and written down where a
 * document can read it.
 *
 * ⚠️ NO DOCUMENT CAN ASK THIS QUESTION FOR ITSELF. "Which operations does an app
 * get without declaring them" is answered by running the real composer over a
 * real manifest; a script that grepped for it would be a second, worse composer,
 * and the copy is the one that goes stale. So the answer is computed HERE, by
 * the code that actually decides it, and left in `docs/surface.json` for the
 * generators to read.
 *
 * ⚠️ AND THE PROBE MANIFESTS ARE THE METHOD. An app that declares NOTHING is
 * composed, and everything that appears is what the platform hands over for
 * free. Then one thing is declared at a time — a collection, a vault field, a
 * file field — and the difference is exactly what declaring it buys. That is a
 * sentence no reader could otherwise get without reading `compose.ts` and every
 * `*-ops.ts` beside it.
 *
 * ⚠️ IT FAILS RATHER THAN WRITING, unless asked. A generated artefact that
 * silently rewrites itself is one whose diff nobody reviews — and the whole
 * point is that a change to what the engine offers shows up as a change to the
 * document. `EMIT=1` writes; anything else compares.
 */

import { writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DIRECTORY_MODULES, HOLDINGS, SHARD_MODULES, compose, operatorOps, personalOps, tablesIn,
  type Resolved,
} from "@engine/runtime";
import {
  DOOR_LABELS, GATE_ORDER, PLATFORM_PROBLEMS, collection, field, vaultField, vaultKeyFor,
  type AppSpec,
} from "@engine/kernel";

const DOCS = join(dirname(fileURLToPath(import.meta.url)), "../../../docs");
const AT = join(DOCS, "surface.json");
const EMIT = process.env.EMIT === "1";

/* ------------------------------------------------------------------ probes --- */

/**
 * ⚠️ THE FLOOR: A MANIFEST WITH NOTHING IN IT. `compose` refuses a broken one,
 * so this is the smallest thing that composes at all — an id, a name, a mark and
 * one role for a founder to hold.
 */
/**
 * ⚠️ EVERY PROBE NEEDS ITS OWN ID, because `compose` is MEMOISED BY APP ID and
 * says so. Four probes sharing one id are one probe: the first answer is cached
 * and returned to the other three, so declaring a collection appears to buy
 * nothing at all — a documented lie rather than a failure.
 */
let probes = 0;
const bare = (over: Partial<AppSpec> = {}): AppSpec => ({
  id: `probe${++probes}`, name: "Probe", mark: "·",
  access: { roles: { reader: [] }, founding: "reader" },
  entitlements: {}, plans: [], collections: [], operations: [], screens: [],
  ...over,
} as unknown as AppSpec);

const idsOf = (app: AppSpec) => [...compose(app).byId.values()];

/** What declaring one thing ADDS, which is the only interesting half. */
const extra = (app: AppSpec, floor: ReadonlySet<string>) =>
  idsOf(app).filter((o) => !floor.has(o.id));

/* ------------------------------------------------------------------ shapes --- */

const asOp = (o: Resolved) => ({
  id: o.id, kind: o.kind, method: o.method, path: o.path,
  /* ⚠️ `null` IS A PERMISSION, and it is the interesting one: a question about
     the caller rather than about the workspace. Printed as a word, so nobody
     reads a blank cell as a missing value. */
  permission: o.permission ?? null,
});

function build() {
  const floorOps = idsOf(bare());
  const floor = new Set(floorOps.map((o) => o.id));

  /*
    ⚠️ THE REAL BUILDERS, NOT A HAND-SHAPED OBJECT. A literal that merely
    typechecks can be missing whatever `collection()` fills in, and the composer
    would then quietly produce nothing — the probe would report that declaring a
    collection buys you no operations, which is a documented lie rather than a
    failure.
  */
  const thing = (fields: Parameters<typeof collection>[0]["fields"]) => collection({
    id: "thing", label: { one: "Thing", many: "Things" },
    scope: { of: "tenant" }, permission: "thing", fields,
  } as Parameters<typeof collection>[0]);

  /* One collection, so the five generated verbs are visible as five. */
  const withCollection = extra(
    bare({ collections: [thing({ title: field.text({ label: "Title", holds: "none" }) })] }),
    floor);

  const withMedia = extra(
    bare({ collections: [thing({ cover: field.media({ label: "Cover", holds: "none" }) })] }),
    floor)
    .filter((o) => !withCollection.some((c) => c.id === o.id));

  const withVault = extra(bare({
    vault: {
      [vaultKeyFor("thing", "pulse")]: vaultField({
        id: vaultKeyFor("thing", "pulse"), label: "Pulse",
        holding: "sensitive", purposes: ["care"],
      }),
    },
  }), floor);

  /* ------------------------------------------------------------- the stores --- */

  /**
   * ⚠️ EVERY TABLE, AND WHAT BECOMES OF IT WHEN SOMEBODY LEAVES. Both halves come
   * from one ledger (`HOLDINGS`), which is what makes "we deleted everything"
   * checkable rather than a sentence somebody wrote.
   */
  const held = new Map(HOLDINGS.map((h) => [h.table, h]));
  const tableRows = (modules: readonly { statements: readonly string[] }[]) =>
    tablesIn(modules as never).map((table) => {
      const h = held.get(table);
      return {
        table,
        /* What a person's own copy calls it, or why nobody is in it. */
        export: h?.label ?? null,
        why: h?.why ?? null,
        onForget: h?.person.map((p) => `${p.column}: ${p.on}`) ?? [],
        onClose: h?.workspace ? `${h.workspace.column}: ${h.workspace.on}` : null,
      };
    });

  return {
    /* ⚠️ Written so a reader knows what produced this and how to redo it. */
    from: "apps/hello/test/surface.screens.test.tsx",
    /* ⚠️ THE MAP THE CLASSIFIER READS — see `DOOR_LABELS`. Two answers to "which
       doors exist" is a new door that is reachable and undocumented. `tenant` and
       `signpost` are not labels: one is any OTHER label under the root, the other
       is the root itself, so they are named here as what they are. */
    doors: [
      { label: "(the root)", kind: "signpost" },
      ...Object.entries(DOOR_LABELS).map(([label, kind]) => ({ label, kind })),
      { label: "<slug>", kind: "tenant" },
      { label: "(a custom domain)", kind: "tenant" },
    ],
    gates: [...GATE_ORDER],
    problems: Object.entries(PLATFORM_PROBLEMS).map(([code, p]) => ({
      code, status: p.status, title: p.title, tone: p.tone, retryable: !!p.retryable,
    })),
    operations: {
      always: floorOps.map(asOp),
      perCollection: withCollection.map(asOp),
      withMediaField: withMedia.map(asOp),
      withVaultField: withVault.map(asOp),
    },
    personal: Object.entries(personalOps({
      secret: "probe", appId: "probe", deliver: async () => {},
    })).map(([id, op]) => ({
      id, kind: op.kind, needs: op.needs,
      doors: op.doors ? [...op.doors] : null,
      proof: op.proof ?? null,
    })),
    operator: Object.entries(operatorOps({ apps: {}, isOperator: () => true }))
      .map(([id, op]) => ({ id, kind: op.kind })),
    stores: {
      directory: tableRows(DIRECTORY_MODULES),
      shard: tableRows(SHARD_MODULES),
    },
  };
}

/* ------------------------------------------------------------------- check --- */

describe("what the engine hands an app", () => {
  it("is written down where a document can read it", () => {
    const fresh = `${JSON.stringify(build(), null, 2)}\n`;
    if (EMIT) { writeFileSync(AT, fresh); return; }

    let held: string;
    try {
      held = readFileSync(AT, "utf8");
    } catch {
      throw new Error(`docs/surface.json is missing — run \`EMIT=1 pnpm --filter @engine/hello test\``);
    }
    expect(held, "docs/surface.json no longer describes what the engine composes — "
      + "run `EMIT=1 pnpm --filter @engine/hello test` and review the diff").toBe(fresh);
  });

  /*
    ⚠️ THE FLOOR IS ASSERTED AS A FLOOR, not just recorded. An operation quietly
    LEAVING the set every app gets for free is a capability a product would have
    to write for itself, and the emitted file changing is a diff somebody has to
    read rather than a check that fails.
  */
  it("gives an app that declares nothing a roster, an inbox, a brand and a bill", () => {
    const floor = new Set(idsOf(bare()).map((o) => o.id));
    for (const id of ["member.list", "member.invite", "member.role", "member.remove",
      "inbox.list", "inbox.settings", "brand.read", "brand.write",
      "package.list", "package.grant", "setting.read", "setting.write",
      "money.view", "centre.view"]) {
      expect(floor, `${id} is no longer free`).toContain(id);
    }
  });
});

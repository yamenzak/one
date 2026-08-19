/**
 * WHAT EXISTS, DERIVED.
 *
 * ⚠️ EVERY NUMBER IN THE DOCUMENTS COMES FROM HERE, because a count typed by
 * hand is a count that is wrong within a week — and a document wrong in a
 * checkable way stops being read for the parts that are right.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { resolveRules } from "./lib/rules.mjs";

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const guards = JSON.parse(readFileSync(join(ENGINE, "docs/guards.json"), "utf8")).guards;
const what = process.argv[2];

if (what === "guards") {
  const live = guards.filter((g) => g.status === "live");
  const owed = guards.filter((g) => g.status === "owed");
  console.log("| Guard | Protects | What breaks without it |");
  console.log("|---|---|---|");
  for (const g of [...live, ...owed]) {
    const mark = g.status === "live" ? "" : " *(owed)*";
    console.log(`| \`${g.id}\`${mark} | ${g.protects} | ${g.fails} |`);
  }
} else if (what === "decisions") {
  const src = readFileSync(join(ENGINE, "docs/DECISIONS.md"), "utf8");
  const rows = [...src.matchAll(/^## (D\d+) — (.+)$/gm)];
  const counts = {};
  for (const g of guards) counts[g.protects] = (counts[g.protects] ?? 0) + 1;
  console.log("| # | Decision | Guarded by |");
  console.log("|---|---|---|");
  for (const [, id, title] of rows) console.log(`| ${id} | ${title} | ${counts[id] ?? 0} |`);
} else if (what === "enforcement") {
  /**
   * ⚠️ THE SAME WALK THE GUARD RUNS, IMPORTED RATHER THAN REPEATED. This printed
   * four rules with no lane while `rules.test.mjs` reported every one in force,
   * because each had written its own resolution and one followed a rule's
   * kernel-side caller while the other did not. A document and the guard it
   * describes disagreeing is the failure the guard exists to refuse.
   */
  const rows = resolveRules()
    .sort((a, b) => a.where.localeCompare(b.where) || a.name.localeCompare(b.name));
  console.log("| Rule | Declared in | In force through |");
  console.log("|---|---|---|");
  for (const r of rows) {
    const force = r.deferredTo ? `deferred to stage ${r.deferredTo}` : r.lane ?? "**nothing**";
    console.log(`| \`${r.name}\` | \`${r.where}\` | ${force} |`);
  }
} else if (what === "vocabulary") {
  /**
   * ⚠️ WHAT THE PACKAGE SHIPS, DERIVED FROM WHAT IT EXPORTS. A person about to
   * build a screen needs one question answered before anything else — does this
   * already exist — and the answer was "read six directories". A hand-typed list
   * would answer it wrongly within a week, which is worse, because a list that
   * is mostly right is one somebody trusts about the part that is not.
   *
   * ⚠️ THE FILE IS THE POINT, NOT A DESCRIPTION. Every component here carries
   * its reasoning in a header comment; a one-line gloss regenerated beside it
   * would be a second, worse copy of that. This says what exists and where to
   * read it, and the file says why.
   */
  const HOMES = [
    ["tokens", "colour, type, spacing, motion, the chrome and hem rules"],
    ["scene", "the ambience engine — families, marks, the world behind a screen"],
    ["frame", "page, shape, crown, nav, dock, overlays — what wraps a screen"],
    ["parts", "rows, cards, lists, controls, the four outcomes"],
    ["rendered", "whole surfaces drawn from a kernel declaration"],
    ["chart", "the data vocabulary — a number as a shape"],
  ];
  const DECL = /^export\s+(?:declare\s+)?(?:async\s+)?(function|const|let|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm;
  const walk = (dir, out = []) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const at = join(dir, e.name);
      if (e.isDirectory()) walk(at, out);
      else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) out.push(at);
    }
    return out;
  };
  /**
   * ⚠️ WHAT THE ENTRY POINT ACTUALLY RE-EXPORTS, NOT EVERY DECLARATION. Counting
   * `export` keywords published `chart/scale.ts`'s nineteen drawing helpers as
   * design-system vocabulary — `linePath`, `polar`, `band`, `place` — none used
   * by any caller outside the package, and every one a promise the moment it is
   * listed as one.
   */
  const surfaced = (() => {
    const seen = new Set();
    const walkBarrel = (file, dir) => {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}\s+from\s+"\.\/([\w./-]+)\.js"/g)) {
        for (const n of m[1].split(",")) {
          const name = n.trim().replace(/^type\s+/, "").split(" as ").pop().trim();
          if (name) seen.add(name);
        }
      }
      for (const m of src.matchAll(/export\s+\*\s+from\s+"\.\/([\w./-]+)\.js"/g)) {
        const base = join(dir, m[1].replace(/\.js$/, ""));
        const at = [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")].find((f) => existsSync(f));
        if (!at) continue;
        if (at.endsWith("index.ts")) { walkBarrel(at, dirname(at)); continue; }
        for (const d of readFileSync(at, "utf8").matchAll(DECL)) seen.add(d[2]);
      }
    };
    walkBarrel(join(ENGINE, "design/src/index.ts"), join(ENGINE, "design/src"));
    return seen;
  })();

  console.log("| Home | What it is for | Ships |");
  console.log("|---|---|---|");
  let all = 0;
  const detail = [];
  for (const [home, what_] of HOMES) {
    const found = [];
    for (const file of walk(join(ENGINE, "design/src", home))) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(DECL)) if (surfaced.has(m[2])) found.push([m[2], file]);
    }
    found.sort((a, b) => a[0].localeCompare(b[0]));
    all += found.length;
    /* ⚠️ A HOME THAT SURFACES NOTHING IS A FACT, NOT A GAP. `scene/` is reached
       only through `Page`'s `sky` NAME — an app declares a world, it never
       assembles one — so zero here is the design working. The old count implied
       otherwise by counting declarations nobody could import. */
    console.log(`| \`${home}/\` | ${what_} | ${found.length || "internal"} |`);
    if (found.length) detail.push([home, found]);
  }
  console.log("");
  console.log(`**${all} exports.** Every one is reachable as \`import { … } from "@engine/design"\`;`);
  console.log("there is no deep import, and a guard says so.");
  for (const [home, found] of detail) {
    console.log("");
    console.log(`### \`${home}/\``);
    console.log("");
    const byFile = {};
    for (const [name, file] of found) {
      const rel = file.slice(join(ENGINE, "design/src").length + 1);
      (byFile[rel] ??= []).push(name);
    }
    for (const rel of Object.keys(byFile).sort()) {
      console.log(`- \`${rel}\` — ${byFile[rel].map((n) => `\`${n}\``).join(", ")}`);
    }
  }
} else if (what === "declares" || what === "does") {
  /**
   * ⚠️ WHAT AN APP DECLARES AND WHAT THE PLATFORM DOES, DERIVED — the two halves
   * of the question everybody asks first and nobody could answer without reading
   * six directories: does this already exist. `design/README.md` answers it for
   * the drawing half and has done since it was generated; these answer it for
   * the other two, from the same source the guards read.
   *
   * ⚠️ THE GLOSS IS THE FIRST LINE OF THE DECLARATION'S OWN COMMENT, never a
   * second description written here. A gloss maintained beside the code is a
   * second copy of the reasoning, and the copy is the one that goes stale — so
   * this says WHAT exists and WHERE to read why, and the file says why.
   */
  const KERNEL = [
    ["primitives", "ids, days, instants, slugs — the words everything else is spelled in"],
    ["present", "how a date, a number, a price and a measurement are written for one reader"],
    ["infra", "what a product needs underneath it, and what each kind can promise"],
    ["field", "what a value is: its kind, its bounds, what it holds, whether it is the app's to keep"],
    ["collection", "what a thing an app keeps is — and the six operations it gets for free"],
    ["operation", "one declaration carrying every cross-cutting concern (D12)"],
    ["access", "permissions, roles, and what an app may never claim"],
    ["gate", "the eight gates, in the order that decides which sentence somebody reads first"],
    ["manifest", "the whole app, and the composition that refuses a broken one"],
    ["entitlement", "what a plan includes, and the allowance algebra over it"],
    ["credit", "metered work: the reserve, the rate, the ceiling"],
    ["dunning", "the ladder from past due to erased"],
    ["package", "a priced bundle of timed grants"],
    ["tenancy", "workspaces, kinds, shards, placement, standing"],
    ["door", "the five doors, and which host is which"],
    ["setting", "a switch a workspace owns, and the page it lives on"],
    ["flag", "a switch WE own, with a date it stops being one"],
    ["notify", "what somebody is told, through which channel, and who may narrow it"],
    ["problem", "the one refusal shape, and the platform's own catalogue"],
    ["tone", "the voice — the rules a written string has to pass"],
    ["vault", "the facts that are not an app's to keep (D11)"],
    ["legal", "documents, purposes, sub-processors, the record of processing"],
    ["guide", "help, onboarding, the milestones a workspace passes"],
    ["job", "scheduled work, and the record that it ran"],
    ["brand", "which surfaces a workspace may put its own mark on"],
    ["mark", "the logo as geometry, so the browser and the Worker draw one shape"],
    ["ai", "a generating action: its lane, its prompt, its ceiling"],
    ["mcp", "an operation projected as a tool an agent may call"],
    ["signin", "the shape of a sign-in code — the four facts the server and the page must agree on"],
  ];
  const RUNTIME = [
    ["schema", "the composed schema runner — declarations become tables"],
    ["sql", "the one typed seam onto D1"],
    ["directory", "accounts, workspaces, placement, enablement, allowances"],
    ["handles", "which binding holds which shard"],
    ["locate", "who is asking, where they are, and what they hold"],
    ["identity", "sign-in codes, sessions, tokens, proof"],
    ["membership", "the roster and what each member may do"],
    ["compose", "a manifest becomes a live surface of operations"],
    ["serve", "the one path every request ends in — both doors"],
    ["records", "the generated reads and writes behind a collection"],
    ["settings", "reading and writing a workspace's own switches"],
    ["billing", "plans, subscriptions, the bill, the ladder"],
    ["wallet", "OneWallet: the allowance, what was bought, and reserve → settle → release"],
    ["catalogue", "the price list an operator edits over the declaration, and what it holds for the people already on a tier"],
    ["packages", "granting, revoking and expiring a bought bundle"],
    ["inbox", "notifications: the policy, the audience, the read"],
    ["services", "the lane out to a provider — AI and mail"],
    ["stripe", "the card lane: a page Stripe owns, a signature that proves an event is theirs, and the ladder one moves"],
    ["config", "what the deployment was told — the credentials it holds, encrypted under a key its database has never seen"],
    ["mail", "a letter that leaves the process: the message written out, and the refusal to pretend one was sent"],
    ["webpush", "the two specifications a notification travels on — VAPID, and the sealed body"],
    ["push", "who has turned notifications on, on which device, at which door"],
    ["vault", "encrypted facts, consent, grants, and who looked"],
    ["audit", "what happened, and the replay that stops it happening twice"],
    ["jobs", "the scheduler and the record that it ran"],
    ["branding", "a workspace's own theme and marks"],
    ["icon", "the picture a business uploads, and where a public route can read it"],
    ["raster", "a PNG drawn in a Worker, for the tabs and home screens an SVG cannot reach"],
    ["ai-actions", "which model an action runs on, and in whose words"],
    ["models", "the model catalogue — what exists, what it costs us, what a workspace pays"],
    ["gateway", "the one door out to a model, and where a run's real cost is read"],
    ["spend", "one row per run: where a workspace's credits went, and never what was said"],
    ["reconcile", "the check on the money that is not our own arithmetic"],
    ["ai-ops", "which model a workspace picked, and what it will cost them"],
    ["ai-run", "the seam an operation generates through — values in, a metered answer out"],
    ["search", "what is findable: the ledger a write leaves, and the pass that carries it"],
    ["search-ops", "the find operation a searchable collection gets, with its boundary already in it"],
    ["operator", "the deployment looking at itself"],
    ["deployment", "what is wrong with this deployment, asked at boot"],
    ["mcp", "the agent door"],
    ["member-ops", "the roster's own operations"],
    ["money-ops", "the bill and the balance, as a read"],
    ["centre-ops", "the one bootstrap read the tenant door stands on"],
    ["personal", "the operations about yourself, on every door"],
    ["installable", "the manifest and the icon a workspace is installed as"],
    ["platform-schema", "the platform's own tables, in dependency order, listed once"],
    ["dispatch", "an event an operation raises becomes a note in somebody's inbox"],
    ["sweep", "the daily clock: erase what is past the ladder's last rung"],
    ["vault-ops", "consent, grants, who looked, the processing record, export and erasure"],
    ["dossier", "everything we hold about one person, and everything of theirs we delete"],
    ["legal", "who agreed to what version, and the wall until they have"],
    ["cloudflare", "the one door out to the account — create, destroy, and add a binding"],
    ["storage", "files: the object, the row that knows its key, and the erasure of both"],
    ["move", "a workspace's records change shard — the only way its jurisdiction can"],
    ["media-ops", "upload, list, fetch and delete — generated for any app with a media field"],
    ["resources", "wanted → created → bound → live → draining → gone, and the reaper"],
  ];

  const pkg = what === "declares" ? "kernel" : "runtime";
  const HOMES = what === "declares" ? KERNEL : RUNTIME;
  const { resolveCapabilities } = await import("./lib/capabilities.mjs");
  const found = resolveCapabilities(pkg);

  /*
    ⚠️ A MODULE WITH NO GLOSS STOPS THE WHOLE PAGE, and that is the point. The
    first draft simply skipped one, so a new kernel module would have been
    absent from the index whose entire job is answering "does this already
    exist" — the reader would have been told, in a generated table, that it does
    not. An index that is silently incomplete is worse than no index.
  */
  const glossed = new Set(HOMES.map(([m]) => m));
  const unglossed = [...new Set(found.map((c) => c.module))].filter((m) => !glossed.has(m));
  if (unglossed.length) {
    console.error(`${pkg}: no line for ${unglossed.join(", ")} — add one to inventory.mjs, `
      + `because a module missing from this table reads as a module that does not exist`);
    process.exit(2);
  }

  console.log("| Module | What it is for | Ships | Waiting |");
  console.log("|---|---|---|---|");
  let all = 0;
  let held = 0;
  for (const [mod, why] of HOMES) {
    const rows = found.filter((c) => c.module === mod);
    if (!rows.length) continue;
    const waiting = rows.filter((c) => c.stage);
    all += rows.length;
    held += waiting.length;
    console.log(`| \`${mod}\` | ${why} | ${rows.length} | ${waiting.length || "—"} |`);
  }
  console.log("");
  console.log(`**${all} of them**, ${all - held} reached by something today.`);
  console.log(`Read the file for why each exists; every one is \`import { … } from "@engine/${pkg}"\`.`);
} else if (what === "stages") {
  /**
   * ⚠️ THE STAGE TABLE IS A REGISTRY NOW, NOT PROSE. It was a markdown table
   * three checks parsed with a regex — the deferral guard, the guard registry's
   * own stage check, and any reader — so a row somebody reformatted became a
   * stage that had never shipped, silently, in a document nobody re-reads.
   */
  const stages = JSON.parse(readFileSync(join(ENGINE, "docs/stages.json"), "utf8")).stages;
  const owed = {};
  for (const g of guards) if (g.status === "owed") owed[g.stage] = (owed[g.stage] ?? 0) + 1;

  console.log("| # | Stage | |");
  console.log("|---|---|---|");
  for (const s of stages) {
    const mark = s.status === "shipped" ? "shipped" : "**planned**";
    const debt = owed[String(s.n)] ? ` · ${owed[String(s.n)]} guard(s) owed` : "";
    console.log(`| ${s.n} | ${s.title} | ${mark}${debt} |`);
  }
  const done = stages.filter((s) => s.status === "shipped").length;
  console.log("");
  console.log(`**${done} shipped, ${stages.length - done} planned.** A stage cannot be `
    + "shipped while a `DEFER(engine-N)` marker names it — `scripts/docs.test.mjs` "
    + "fails the build if one does, which is the only reason this table can be read "
    + "instead of the code.");

} else if (what === "surface" || what === "personal" || what === "operator"
  || what === "doors" || what === "problems" || what === "stores") {
  /**
   * WHAT AN APP GETS WITHOUT ASKING — read from what the composer actually did.
   *
   * ⚠️ `docs/surface.json` IS EMITTED BY THE REAL COMPOSER, never parsed out of
   * the source (see `apps/hello/test/surface.screens.test.tsx`). A script that
   * grepped `*-ops.ts` for operation ids would be a second, worse composer, and
   * the copy is the one that goes stale — it would miss the two lanes that mount
   * conditionally and would not know a route's method or permission at all.
   */
  const at = join(ENGINE, "docs/surface.json");
  if (!existsSync(at)) {
    console.error("docs/surface.json is missing — run `EMIT=1 pnpm --filter @engine/hello test`, "
      + "because an index of what the engine offers cannot be written by hand");
    process.exit(2);
  }
  const of_ = JSON.parse(readFileSync(at, "utf8"));

  /* ⚠️ `null` printed as a word. A blank cell reads as a value nobody filled in;
     "anybody signed in" is a decision somebody made. */
  const perm = (p) => (p ? `\`${p}\`` : "*the session*");
  const table = (rows) => {
    console.log("| Operation | | Permission |");
    console.log("|---|---|---|");
    for (const o of rows) console.log(`| \`${o.id}\` | ${o.kind} | ${perm(o.permission)} |`);
  };

  if (what === "surface") {
    const { always, perCollection, withMediaField, withVaultField } = of_.operations;
    console.log(`**${always.length} operations for declaring nothing.** A roster, an inbox and its`);
    console.log("two-level policy, the workspace's brand, the package rail it sells with, its");
    console.log("settings, its bill, and the one bootstrap read every screen stands on.");
    console.log("");
    table(always);
    console.log("");
    console.log(`**+${perCollection.length} per collection**, generated from the declaration —`);
    console.log("the scope column is written by the platform, so a subject-scoped collection is");
    console.log("the caller's own records by construction rather than by a `WHERE` somebody");
    console.log("remembered.");
    console.log("");
    table(perCollection);
    console.log("");
    console.log(`**+${withMediaField.length} the moment one field is a file.** Not before: three`);
    console.log("routes about files on a product that holds none answer \"no bucket\" for ever,");
    console.log("which reads as broken rather than absent.");
    console.log("");
    table(withMediaField);
    console.log("");
    console.log(`**+${withVaultField.length} the moment one fact is not the app's to keep** (D11) —`);
    console.log("consent, grants, who looked, the processing record, export and erasure.");
    console.log("");
    table(withVaultField);

  } else if (what === "personal") {
    console.log("| Operation | | Needs | Doors |");
    console.log("|---|---|---|---|");
    for (const o of of_.personal) {
      const doors = o.doors ? o.doors.map((d) => `\`${d}\``).join(" ") : "*every door*";
      const needs = o.needs === "nobody" ? "**nobody**" : o.proof ? `session + ${o.proof} proof` : "session";
      console.log(`| \`${o.id}\` | ${o.kind} | ${needs} | ${doors} |`);
    }
  } else if (what === "operator") {
    console.log("| Operation | |");
    console.log("|---|---|");
    for (const o of of_.operator) console.log(`| \`${o.id}\` | ${o.kind} |`);
  } else if (what === "doors") {
    console.log("| Host | Door | What answers there |");
    console.log("|---|---|---|");
    const SAYS = {
      signpost: "the root itself — a signpost, and no product",
      account: "who you are: your details, your inbox, your data, your tokens",
      operator: "the deployment looking at itself — and `op.*` answers nowhere else",
      setup: "the one place a workspace is created",
      device: "a screen with no session — opt-in per deployment, because `play` is a slug",
      tenant: "the product, and OneSpace over it",
    };
    for (const d of of_.doors) {
      const host = d.label.startsWith("(") ? `*${d.label.slice(1, -1)}*` : `\`${d.label}.\``;
      console.log(`| ${host} | \`${d.kind}\` | ${SAYS[d.kind]} |`);
    }
  } else if (what === "problems") {
    console.log("| Code | HTTP | What somebody reads | Retry |");
    console.log("|---|---|---|---|");
    for (const p of of_.problems) {
      console.log(`| \`${p.code}\` | ${p.status} | ${p.title} | ${p.retryable ? "yes" : "—"} |`);
    }
  } else {
    /**
     * ⚠️ TWO STORES, AND WHICH ONE A TABLE IS IN IS A JURISDICTION DECISION. The
     * directory is global; a shard is where one workspace's records live and is
     * the thing a residency promise is about.
     */
    for (const [store, says] of [
      ["directory", "One global database: who exists, where they belong, what the deployment has made for itself."],
      ["shard", "One per region. A workspace's own records, and everything scoped to it."],
    ]) {
      console.log(`**\`${store}\`** — ${says}`);
      console.log("");
      console.log("| Table | In a person's export | When they are forgotten | When the workspace closes |");
      console.log("|---|---|---|---|");
      for (const t of of_.stores[store]) {
        const label = t.export ? t.export : `— *${t.why ?? "nobody is in it"}*`;
        const forget = t.onForget.length ? t.onForget.map((f) => `\`${f}\``).join("<br>") : "—";
        console.log(`| \`${t.table}\` | ${label} | ${forget} | ${t.onClose ? `\`${t.onClose}\`` : "kept"} |`);
      }
      console.log("");
    }
    console.log("Both walks read one ledger (`HOLDINGS` in `runtime/src/dossier.ts`), and a table");
    console.log("declared by a schema module with no row in it fails `pnpm engine:gate` — which is");
    console.log("the only version of \"provably complete\" that stays true after the person who");
    console.log("wrote it has moved on.");
  }

} else if (what === "waiting") {
  /**
   * ⚠️ WHAT IS BUILT AND REACHED BY NOTHING — the failure this whole framework is
   * a catalogue of, printed rather than remembered. A capability with tables,
   * tests and no address is invisible: no error, no failing test, and every
   * suite green.
   */
  const { resolveCapabilities } = await import("./lib/capabilities.mjs");
  const stages = JSON.parse(readFileSync(join(ENGINE, "docs/stages.json"), "utf8")).stages;
  const titleOf = Object.fromEntries(stages.map((s) => [String(s.n), s.title]));

  const rows = [];
  for (const pkg of ["kernel", "runtime"]) {
    const byStage = new Map();
    for (const c of resolveCapabilities(pkg).filter((c) => c.stage)) {
      const key = `${c.stage}|${c.module}`;
      byStage.set(key, (byStage.get(key) ?? 0) + 1);
    }
    for (const [key, n] of byStage) {
      const [stage, module] = key.split("|");
      rows.push({ pkg, module, stage: Number(stage), n });
    }
  }
  rows.sort((a, b) => a.stage - b.stage || a.pkg.localeCompare(b.pkg) || a.module.localeCompare(b.module));

  if (!rows.length) {
    console.log("Nothing. Every capability either package ships is reached by something.");
  } else {
    console.log("| Waiting on | Where | How many |");
    console.log("|---|---|---|");
    for (const r of rows) {
      console.log(`| **${r.stage}** — ${titleOf[String(r.stage)] ?? "*no such stage*"} `
        + `| \`${r.pkg}/src/${r.module}.ts\` | ${r.n} |`);
    }
    const total = rows.reduce((n, r) => n + r.n, 0);
    console.log("");
    console.log(`**${total} declarations** are built and reached by nothing, each waiting on a`);
    console.log("stage it names in a `DEFER` marker. `scripts/capability.test.mjs` fails on one");
    console.log("that names no stage, so this list cannot grow by forgetting.");
  }

} else if (what === "gates") {
  /**
   * ⚠️ THE ORDER IS THE WHOLE SUBJECT, AND IT IS DERIVED. Which gate refuses
   * first decides which sentence somebody reads — "sign in" before "your plan
   * does not include this" before "you are out of credits" — and a list retyped
   * in a document is a second answer to a question `GATE_ORDER` already settles.
   *
   * ⚠️ THE GLOSS IS WRITTEN AND A MISSING ONE STOPS THE PAGE. A gate added to
   * the kernel and absent from this table would read as a gate that does not
   * exist, which is worse than no table: somebody would write the check again.
   */
  const of_ = JSON.parse(readFileSync(join(ENGINE, "docs/surface.json"), "utf8"));
  const SAYS = {
    accepted: ["Has this person agreed to the terms and the privacy notice",
      "First, and above the bill: until somebody has agreed there is no basis to process anything about them. `beforeAccepting` is the way out — read, agree, export, delete, sign out."],
    standing: ["Is this workspace paid up",
      "Reads pass every rung. Withholding a workspace's own records is leverage over an invoice, and leaving is never something an unpaid bill can prevent."],
    permission: ["May this caller do this here",
      "Resolved against the roster for the app the operation belongs to — never a flat set, or a role in the second product grants nothing."],
    kind: ["Is this workspace a business",
      "Above entitlement, because no plan a personal workspace can buy unlocks a commercial-only capability. Below permission, because a refusal about the workspace tells a stranger it exists."],
    proof: ["Was it proved recently that this is really them",
      "Fifteen minutes, for what cannot be undone. A machine token never satisfies it, by design."],
    entitlement: ["Does the plan include this at all",
      "A yes/no capability, before any counting."],
    flag: ["Is this switched on for this deployment",
      "Ours to turn off, with a date it stops being a switch."],
    quota: ["Is there room left under the plan's number",
      "Counted against what is in use, so the sentence says the limit and the count."],
    credits: ["Is there a balance to reserve against",
      "The reserve is a ceiling on revenue rather than an estimate — every token an estimate misses is one the platform pays for."],
  };
  const missing = of_.gates.filter((g) => !SAYS[g]);
  if (missing.length) {
    console.error(`no line for gate(s) ${missing.join(", ")} — add one to inventory.mjs, `
      + "because a gate missing from this table reads as a gate that does not exist");
    process.exit(2);
  }
  console.log("| | Gate | Asks | |");
  console.log("|---|---|---|---|");
  of_.gates.forEach((g, i) => {
    console.log(`| ${i + 1} | \`${g}\` | ${SAYS[g][0]}? | ${SAYS[g][1]} |`);
  });

} else if (what === "commands") {
  /** ⚠️ From the root `package.json`, so a renamed script is a changed table. */
  const root = JSON.parse(readFileSync(join(ENGINE, "../package.json"), "utf8")).scripts;
  const SAYS = {
    "engine:dev": "the worker on :8080 and OneSpace on :5173, every door on `*.localhost`",
    "engine:typecheck": "every package",
    "engine:test": "every suite — kernel, runtime, design, OneSpace, the reference app",
    "engine:gate": "every guard in `docs/guards.json`",
  };
  console.log("| Command | What it runs |");
  console.log("|---|---|");
  for (const [name, says] of Object.entries(SAYS)) {
    if (!root[name]) {
      console.error(`\`${name}\` is not a script in the root package.json — a command in a `
        + "document that does not run is an instruction that sends a reader nowhere");
      process.exit(2);
    }
    console.log(`| \`pnpm ${name}\` | ${says} |`);
  }

} else if (what === "deployment") {
  /**
   * ⚠️ "IS IT DEPLOYED" IS THE FIRST QUESTION AND IT IS CHECKABLE, so it is not a
   * sentence somebody keeps up to date. A resource id left as a placeholder is a
   * worker bound to a database that does not exist — and the state a document
   * asserts about a deployment is exactly the kind that is true for a week.
   */
  /* ⚠️ PARSED, NOT MATCHED. A window around a key is a window a comment can
     push a value out of — which it did, so the first draft reported one binding
     of two and called the deployment half-provisioned. */
  const config = JSON.parse(readFileSync(join(ENGINE, "one/wrangler.jsonc"), "utf8")
    .replace(/^\s*\/\/.*$/gm, ""));
  const rows = [
    ...(config.d1_databases ?? []).map((d) => [d.binding, d.database_id]),
    ...(config.r2_buckets ?? []).map((b) => [b.binding, b.bucket_name]),
    ...(config.kv_namespaces ?? []).map((k) => [k.binding, k.id]),
  ];
  if (!rows.length) {
    console.error("no resource bindings found in one/wrangler.jsonc — a check over nothing "
      + "reports green about a deployment it never looked at");
    process.exit(2);
  }
  console.log("| Binding | Resource | |");
  console.log("|---|---|---|");
  let waiting = 0;
  for (const [binding, value] of rows) {
    const real = !/^PLACEHOLDER/i.test(String(value));
    if (!real) waiting++;
    console.log(`| \`${binding}\` | ${real ? `\`${value}\`` : "*not made yet*"} `
      + `| ${real ? "live" : "**placeholder**"} |`);
  }
  console.log("");
  console.log(waiting
    ? `**${waiting} of ${rows.length} are placeholders, so nothing is deployed.** A deploy `
      + "with them in place binds a worker to databases that do not exist, which is why the "
      + "workflow SKIPS rather than shipping: Actions → **OneEngine** → Run workflow with "
      + "`provision` ticked creates them, writes their ids back and mints the signing secret."
    : "**Every binding names a resource that exists.**");
  console.log("");
  console.log("Two steps a workflow cannot take: the DNS records for the root and its");
  console.log("wildcard, and the Worker routes. `wrangler.jsonc` declares no `routes`");
  console.log("deliberately — declaring them makes `wrangler dev` rewrite the incoming Host,");
  console.log("which collapses every door onto one.");

} else {
  console.error("usage: inventory.mjs guards|decisions|enforcement|vocabulary|declares|does|"
    + "stages|surface|personal|operator|doors|problems|stores|waiting|gates|commands|deployment");
  process.exit(2);
}

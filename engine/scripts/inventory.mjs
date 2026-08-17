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
    ["credits", "the balance, and reserve → settle → release"],
    ["packages", "granting, revoking and expiring a bought bundle"],
    ["inbox", "notifications: the policy, the audience, the read"],
    ["services", "the lane out to a provider — AI and mail"],
    ["vault", "encrypted facts, consent, grants, and who looked"],
    ["audit", "what happened, and the replay that stops it happening twice"],
    ["jobs", "the scheduler and the record that it ran"],
    ["branding", "a workspace's own theme and marks"],
    ["ai-actions", "which model an action runs on, and in whose words"],
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
} else {
  console.error("usage: inventory.mjs guards|decisions|enforcement|vocabulary|declares|does");
  process.exit(2);
}

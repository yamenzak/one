#!/usr/bin/env node
/**
 * THE DOCUMENTATION GUARD for `platform/**`.
 *
 * `platform/docs/STANDARDS.md` is the argument; this file is what makes it true.
 * A standard enforced by convention decays exactly like the documents it
 * governs, which is the failure it exists to prevent.
 *
 * ⚠️ IT GOVERNS `platform/` AND NOTHING ELSE, WITH NO EXEMPTIONS.
 *
 * The first draft scanned the whole repository and grew a GRANDFATHERED list of
 * eleven legacy documents plus a carve-out for the help corpus. That was the
 * wrong shape: an exemption list is a promise to fix something, and the legacy
 * tree is not going to be fixed — it is deleted at stage 9. Maintaining a
 * shrinking allowance for doomed files is work that buys nothing, and it lets
 * the new tree inherit the old tree's compromises on day one.
 *
 * So the legacy tree is UNGOVERNED, deliberately, and this tree has no
 * exemptions at all.
 *
 * Four checks, each aimed at a failure that produces no error today:
 *
 *   1. KIND        every document declares what it is, so "is this obsolete?"
 *                  has an answer that is not archaeology.
 *   2. DEFER       ⚠️ a deferral is a MARKER, not a sentence. A marker survives
 *                  context compression because it is found by this script
 *                  rather than remembered by anybody. A stage cannot be flipped
 *                  to `shipped` while something still defers to it.
 *   3. GENERATED   a `<!-- generated: cmd -->` block is re-run and compared, so
 *                  a hand-edited inventory is a build failure rather than a
 *                  quiet lie.
 *   4. ORPHANS     a document nothing links to is a document nobody maintains.
 *                  Five root-level plans reached that state and were deleted by
 *                  hand, which worked only because a person happened to notice.
 *
 * Dependency-free Node, like every other guard in `pnpm gate`, because these run
 * before `pnpm install` in CI.
 */

import { execSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
/** The governed tree. Everything outside it is legacy and out of scope. */
const ROOT = join(REPO, "platform");
const WRITE = process.argv.includes("--write");

let bad = 0;
const warnings = [];
const fail = (m) => (console.error(`BAD  ${m}`), bad++);
const ok = (m) => console.log(`ok   ${m}`);
const warn = (m) => warnings.push(m);

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".wrangler", ".turbo", "shots-out"]);

function walk(dir, test, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, test, out);
    else if (test(e.name)) out.push(p);
  }
  return out;
}

const mdFiles = walk(ROOT, (n) => n.endsWith(".md"));
const codeFiles = walk(ROOT, (n) => /\.(ts|tsx|mjs|js)$/.test(n));

/* ------------------------------------------------------------------ 1. KIND */

/**
 * `guide` is user-facing product documentation — it rots when the PRODUCT
 * changes rather than when the code does, and its reader is a customer rather
 * than whoever maintains the repo. Forcing it into `contract` would put a
 * `verified:` date on a page whose truth is settled by a screenshot suite.
 */
const KINDS = new Set(["contract", "plan", "record", "index", "guide"]);
const STALE_DAYS = 90;

/** Front matter as a flat map. Returns null when the file has none. */
function frontMatter(src) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(src);
  if (!m) return null;
  const out = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([a-z_]+):\s*(.*)$/i.exec(line.trim());
    if (kv) out[kv[1]] = kv[2].trim();
  }
  return out;
}

const kinds = new Map();
for (const file of mdFiles) {
  const rel = relative(ROOT, file);
  // A package's own README is API documentation beside its code — level 3 of the
  // ranking, and governed by the package boundary rules instead.
  if (/^[^/]+\/README\.md$/.test(rel)) continue;
  const fm = frontMatter(readFileSync(file, "utf8"));
  if (!fm?.kind) {
    fail(`platform/${rel} has no \`kind\` in front matter.\n` +
         `       Add one of: ${[...KINDS].join(", ")} — see platform/docs/STANDARDS.md §2.`);
    continue;
  }
  if (!KINDS.has(fm.kind)) {
    fail(`${rel} declares kind "${fm.kind}", which is not one of ${[...KINDS].join(", ")}.`);
    continue;
  }
  kinds.set(rel, fm);
  if (fm.kind === "contract") {
    if (!fm.verified) fail(`${rel} is a contract and carries no \`verified:\` date.`);
    else {
      const age = (Date.parse("2026-08-09") - Date.parse(fm.verified)) / 86_400_000;
      if (Number.isFinite(age) && age > STALE_DAYS) warn(`${rel} last verified ${fm.verified} (${Math.round(age)}d ago)`);
    }
  }
}
ok(`kind: ${kinds.size} document(s) declared, 0 exemptions`);

/* ----------------------------------------------------------------- 2. DEFER */

const stagesPath = join(ROOT, "docs/stages.json");
const stages = new Map(
  (JSON.parse(readFileSync(stagesPath, "utf8")).stages ?? []).map((s) => [s.id, s]),
);

/**
 * `DEFER(id) stage:N — text`, in a markdown comment or a code comment.
 *
 * ⚠️ Code is where most of them belong. A gap in `collection()` is a fact about
 * `collection.ts`, and a marker there is deleted by whoever fills the gap.
 */
const DEFER_RE = /DEFER\(([a-z0-9-]*)\)\s*stage:([a-z0-9-]*)\s*(?:—|--|-)?\s*([^\n>*]*)/gi;

/**
 * ⚠️ A MARKER IS AN ANNOTATION, NOT PROSE — so only comment regions are scanned.
 *
 * This check found its own first false positive: CLAUDE.md describes the format
 * as `` `DEFER(id) stage:N` `` in a sentence, and a naive scan read that
 * sentence as a deferral naming a stage called "N". Documentation ABOUT the
 * mechanism must not trip the mechanism, and the honest way to say that is to
 * require the thing to be written where annotations live.
 *
 * Returns `[start, end)` offsets so a match can keep its real line number.
 */
function commentRegions(src, isMarkdown) {
  const out = [];
  const push = (re) => {
    for (const m of src.matchAll(re)) out.push([m.index, m.index + m[0].length]);
  };
  if (isMarkdown) push(/<!--[\s\S]*?-->/g);
  else {
    push(/\/\*[\s\S]*?\*\//g);
    push(/(^|[^:\w])\/\/[^\n]*/g);
  }
  return out;
}

const seen = new Map();
const open = [];

for (const file of [...mdFiles, ...codeFiles]) {
  const rel = relative(ROOT, file);
  if (rel === "scripts/docs.test.mjs" || rel === "docs/STANDARDS.md") continue;
  const src = readFileSync(file, "utf8");
  const regions = commentRegions(src, file.endsWith(".md"));
  const inComment = (i) => regions.some(([a, b]) => i >= a && i < b);
  for (const m of src.matchAll(DEFER_RE)) {
    if (!inComment(m.index)) continue;
    const [, id, stage, textRaw] = m;
    const line = src.slice(0, m.index).split("\n").length;
    const where = `${rel}:${line}`;
    // `[^\n>*]*` stops before the `>` of `-->`, so a markdown marker leaves a
    // trailing ` --` behind. Strip any trailing comment punctuation.
    const text = (textRaw ?? "").replace(/[\s\-*/]+$/, "").trim();

    if (!id) { fail(`${where}: DEFER has no id. Use DEFER(one-142).`); continue; }
    if (seen.has(id)) { fail(`${where}: DEFER id "${id}" is already used at ${seen.get(id)}.`); continue; }
    seen.set(id, where);
    if (!text) { fail(`${where}: DEFER(${id}) has no description — a marker nobody can act on is a marker nobody will.`); continue; }

    const s = stages.get(stage);
    if (!s) {
      fail(`${where}: DEFER(${id}) names stage "${stage}", which is not in docs/stages.json.`);
      continue;
    }
    if (s.status === "shipped") {
      fail(`${where}: DEFER(${id}) names stage ${stage} ("${s.title}"), which is SHIPPED.\n` +
           `       ⚠️ This is the check the whole standard is built around. Do the work,\n` +
           `       re-target the marker at a later stage with a reason, or delete it on\n` +
           `       purpose — but a shipped stage may not still owe anything.`);
      continue;
    }
    open.push({ id, stage, text, where });
  }
}

/* The generated inventory — the one place "what is still outstanding" lives. */
open.sort((a, b) => (a.stage === b.stage ? a.id.localeCompare(b.id) : a.stage.localeCompare(b.stage)));
const inventory =
  `---\nkind: index\n---\n\n` +
  `# Open deferrals\n\n` +
  `> ⚠️ GENERATED by \`node scripts/docs.test.mjs --write\`. Do not edit.\n` +
  `> Every entry is a \`DEFER\` marker somewhere in the repository. Nothing here\n` +
  `> was remembered — it was found, which is the point (docs/DOCS-STANDARD.md §2).\n\n` +
  (open.length
    ? [...stages.values()]
        .filter((s) => open.some((d) => d.stage === s.id))
        .map((s) =>
          `## Stage ${s.id} — ${s.title}\n\n` +
          open.filter((d) => d.stage === s.id).map((d) => `- \`${d.id}\` — ${d.text}  \n  <sub>${d.where}</sub>`).join("\n"),
        )
        .join("\n\n")
    : `Nothing is deferred. Every stage owes nothing to a later one.`) + "\n";

const invPath = join(ROOT, "docs/DEFERRED.md");
const current = existsSync(invPath) ? readFileSync(invPath, "utf8") : "";
if (current !== inventory) {
  if (WRITE) { writeFileSync(invPath, inventory); ok("defer: docs/DEFERRED.md rewritten"); }
  else fail(`docs/DEFERRED.md is out of date. Run \`node scripts/docs.test.mjs --write\`.`);
}
ok(`defer: ${seen.size} marker(s), ${open.length} open, ${[...stages.values()].filter((s) => s.status === "shipped").length} stage(s) shipped`);

/* ------------------------------------------------------------- 3. GENERATED */

const GEN_RE = /<!--\s*generated:\s*(.+?)\s*-->\n([\s\S]*?)<!--\s*\/generated\s*-->/g;
let genCount = 0;
for (const file of mdFiles) {
  const rel = relative(ROOT, file);
  if (rel === "docs/STANDARDS.md") continue;
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(GEN_RE)) {
    const [, cmd, body] = m;
    genCount++;
    let out;
    try {
      out = execSync(cmd, { cwd: ROOT, encoding: "utf8", timeout: 30_000, stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) {
      fail(`${rel}: generated block command failed — \`${cmd}\`\n       ${String(e.message).split("\n")[0]}`);
      continue;
    }
    if (body.trim() !== out.trim()) {
      fail(`${rel}: generated block is stale — \`${cmd}\` produces different output.\n` +
           `       A hand-edited inventory is the failure this check exists for.`);
    }
  }
}
ok(`generated: ${genCount} verified block(s)`);

/* ---------------------------------------------------------------- 4. ORPHANS */

const linked = new Set();
for (const file of mdFiles) {
  const rel0 = relative(ROOT, file);
  /*
    ⚠️ The GENERATED index does not count as a link, or this check becomes
    vacuous: an index that lists everything makes nothing an orphan. The question
    is whether a HUMAN thought a document was worth pointing at.
  */
  if (rel0 === "docs/README.md" || rel0 === "docs/DEFERRED.md") continue;
  const src = readFileSync(file, "utf8");
  const from = dirname(rel0);
  for (const m of src.matchAll(/\]\(([^)#]+\.md)(?:#[^)]*)?\)/g)) {
    const target = m[1].startsWith("/") ? m[1].slice(1) : join(from, m[1]);
    linked.add(relative(ROOT, join(ROOT, target)));
  }
}
/** Entry points: nothing links to these and nothing should have to. */
const ROOTS = new Set(["docs/PLAN.md", "docs/DEFERRED.md", "docs/README.md"]);
let orphans = 0;
for (const [rel, fm] of kinds) {
  if (ROOTS.has(rel) || linked.has(rel)) continue;
  /*
    A `guide` and anything under `docs/legal/` is consumed by the PRODUCT — the
    Help Centre, the sign-up flow, the footer — not by another markdown file.
    Demanding a prose link would be demanding a fake one.
  */
  if (fm.kind === "guide" || rel.startsWith("docs/legal/")) continue;
  orphans++;
  fail(`${rel} is not linked from any other document.\n` +
       `       A document nobody links is a document nobody maintains — link it or delete it.`);
}
ok(`orphans: ${kinds.size - orphans}/${kinds.size} document(s) reachable`);

/* ------------------------------------------------------------------- 5. INDEX */

/**
 * The map of every governed document, by kind — the direct answer to "there are
 * 44 of these and I cannot tell which are obsolete".
 *
 * ⚠️ Generated, and deliberately NOT counted as a link by the orphan check
 * above. An index that lists everything would make nothing an orphan, and the
 * question worth asking is whether a person thought a document was worth
 * pointing at.
 */
const byKind = new Map();
for (const [rel, fm] of [...kinds].sort((a, b) => a[0].localeCompare(b[0]))) {
  if (!byKind.has(fm.kind)) byKind.set(fm.kind, []);
  byKind.get(fm.kind).push([rel, fm]);
}
const KIND_BLURB = {
  contract: "Invariants and rationale. Do not rot; carry a `verified:` date.",
  plan: "Open intentions. Every open item is a `DEFER` marker — see docs/DEFERRED.md.",
  record: "What happened and why. History, not current state.",
  index: "Generated. Never hand-written.",
  guide: "User-facing. Read by a customer, not by whoever maintains the repo.",
};
const indexDoc =
  `---\nkind: index\n---\n\n# Documents\n\n` +
  `> ⚠️ GENERATED by \`node scripts/docs.test.mjs --write\`. Do not edit.\n` +
  `> The standard is [STANDARDS.md](STANDARDS.md), and it has no exemptions.\n\n` +
  [...byKind]
    .map(([kind, rows]) =>
      `## ${kind}\n\n${KIND_BLURB[kind] ?? ""}\n\n` +
      rows.map(([rel, fm]) => {
        const notes = [fm.verified && `verified ${fm.verified}`, fm.superseded_by && `superseded by \`${fm.superseded_by}\``].filter(Boolean);
        return `- [${rel}](../${rel})${notes.length ? ` — ${notes.join(", ")}` : ""}`;
      }).join("\n"),
    )
    .join("\n\n") + "\n";

const idxPath = join(ROOT, "docs/README.md");
const idxCurrent = existsSync(idxPath) ? readFileSync(idxPath, "utf8") : "";
if (idxCurrent !== indexDoc) {
  if (WRITE) { writeFileSync(idxPath, indexDoc); ok("index: docs/README.md rewritten"); }
  else fail(`docs/README.md is out of date. Run \`node scripts/docs.test.mjs --write\`.`);
} else ok(`index: docs/README.md current (${kinds.size} document(s))`);

/* -------------------------------------------------------------------------- */

if (warnings.length) {
  console.log(`\nstale (warning only — see docs/DOCS-STANDARD.md §4):`);
  for (const w of warnings) console.log(`  · ${w}`);
}

if (bad) {
  console.error(`\n${bad} documentation failure(s).`);
  process.exit(1);
}
console.log("\ndocumentation: kinds declared, deferrals findable, inventories derived.");

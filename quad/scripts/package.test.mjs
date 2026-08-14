/**
 * A PACKAGE IS A ROLE WITH A CLOCK, AND THE CLOCK IS NOT OPTIONAL (D16).
 *
 * ⚠️ EVERY CHECK HERE GUARDS AN ABSENCE THAT SERVES GREEN. A grant written
 * without its clock is access sold for ever; a grant path that appends instead
 * of replacing is two overlapping windows nobody can reason about; a composer
 * that stops asking deliverability moves the refusal from the package editor
 * to a customer's first 403, weeks later. The kernel suite proves the
 * arithmetic; what no runtime test can prove is that the rail KEEPS CALLING
 * it for every package every app will ever compose — so these are structural.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const QUAD = join(HERE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const rail = strip(readFileSync(join(QUAD, "runtime/src/packages.ts"), "utf8"));
const membership = strip(readFileSync(join(QUAD, "runtime/src/membership.ts"), "utf8"));

/* ------------------------------------------------------------- sellable --- */

/**
 * ⚠️ COMPOSING IS WHERE SELLING NOTHING IS REFUSED. `package.create` must ask
 * `refusePackage` against `sellableKeys` — drop either and a workspace can
 * price a key nothing reads, or one only reachable behind an entitlement no
 * plan sells, and the first person to find out is the person who paid.
 */
if (!/refusePackage\(/.test(rail) || !/sellableKeys\(/.test(rail)) {
  fail(`runtime/src/packages.ts: the composer no longer asks the kernel whether the\n` +
       `       package can be delivered — money is taken for a 403 discovered by the\n` +
       `       customer, weeks after the editor said "saved".`);
} else {
  ok(`sellable: a package is refused at composition when it cannot be delivered`);
}

/* ---------------------------------------------------------------- clock --- */

/**
 * ⚠️ EVERY GRANT THE RAIL WRITES CARRIES `until`. A bare key is a person's
 * standing exception; a package writing one sells access that never expires,
 * and the resolver would be CORRECT to honour it. And the resolver's clock
 * must default on — an undated resolution keeps every expired grant alive.
 */
const writes = rail.match(/pkg\.grants\.map\(\(key\) => \(\{[^}]*\}\)\)/);
if (!writes || !/until/.test(writes[0])) {
  fail(`runtime/src/packages.ts: the rail writes grants without their clock — a\n` +
       `       purchase now sells access that never expires, silently, and the\n` +
       `       resolver honours it for ever.`);
} else if (!/grantUntil\(/.test(rail)) {
  fail(`runtime/src/packages.ts: the grant clock is no longer expiry-plus-grace from\n` +
       `       the kernel — whatever is written, the ladder and the resolver now\n` +
       `       disagree about when access stops.`);
} else if (!/now: Date = new Date\(\)/.test(membership)) {
  fail(`runtime/src/membership.ts: \`permissionsResolver\` lost its default clock — a\n` +
       `       caller that forgets \`now\` resolves every timed grant as live, which\n` +
       `       is a package that never lapses.`);
} else {
  ok(`clock: every package grant is written with its expiry, and resolution is dated`);
}

/* ---------------------------------------------------------------- queue --- */

/**
 * ⚠️ A RENEWAL REPLACES ITS PACKAGE'S GRANTS AND EXTENDS THE WINDOW. Appending
 * leaves two clocks for one purchase; summing bills dead months backwards.
 * The replace is the `filter` on `source`; the extend is the kernel's
 * `extendedUntil`; and once-per is answered by the LEDGER, which an extended
 * row cannot answer.
 */
if (!/filter\(\(g\) => g\.source !== source\)/.test(rail)) {
  fail(`runtime/src/packages.ts: a renewal APPENDS grants instead of replacing its\n` +
       `       package's — two overlapping windows for one purchase, and which one\n` +
       `       the resolver reads decides what somebody paid for.`);
} else if (!/extendedUntil\(/.test(rail)) {
  fail(`runtime/src/packages.ts: the window is no longer extended through the\n` +
       `       kernel's queue rule — a repeat purchase sums or resets instead of\n` +
       `       extending from where the clock stands.`);
} else if (!/hasPurchased\(/.test(rail)) {
  fail(`runtime/src/packages.ts: once-per no longer asks the ledger — the live row\n` +
       `       folds every repeat purchase into itself, so it answers "no" for ever\n` +
       `       and the once-only package stacks without limit.`);
} else {
  ok(`queue: a renewal replaces and extends; once-per is the ledger's answer`);
}

/* --------------------------------------------------------------- opt-out --- */

/**
 * ⚠️ THE RAIL'S GRANTING OPERATIONS ARE NOT TOOLS — the same rule the roster's
 * carry (D13): granting access and defining what a payment buys are not things
 * a model does from a sentence in a document.
 */
const RAW = readFileSync(join(QUAD, "runtime/src/packages.ts"), "utf8");
const blockOf = (id) => {
  const start = RAW.indexOf(`"${id}"`);
  if (start < 0) return null;
  const next = RAW.indexOf(`\n    "`, start + id.length + 2);
  return RAW.slice(start, next < 0 ? RAW.length : next);
};
const optedOut = ["package.create", "package.grant", "package.revoke"]
  .filter((id) => !/why:/.test(blockOf(id) ?? ""));
if (optedOut.length) {
  fail(`runtime/src/packages.ts: ${optedOut.join(", ")} lost the agent-door opt-out —\n` +
       `       a model can now compose or apply what a payment buys from a sentence\n` +
       `       in a document.`);
} else {
  ok(`optout: the rail's composing and granting operations are not tools`);
}

/* ------------------------------------------------------------------ end --- */

console.log(`\npackages: a priced bundle of timed grants, one path, one clock.`);
if (bad) process.exit(1);

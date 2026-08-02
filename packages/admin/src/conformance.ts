/**
 * DON'T REBUILD A PANEL THE PACKAGE ALREADY SHIPS.
 *
 * This exists because of a specific, repeated failure. `/api/admin/stripe/*`,
 * `/api/admin/domains/*`, `/api/admin/turnstile/*` and `/api/admin/email` all
 * belong to shared packages and answer identically in every app. Kova built good
 * surfaces over three of them. Tessa, facing the same endpoints, built a
 * `JSON.stringify` dump over one and nothing at all over the other two — so the
 * same routes were configured well once and badly once, and the second app is
 * what made that visible.
 *
 * Nothing stopped it, because nothing could: "there is a panel for this in
 * `@4dl/admin`" was knowledge, not a rule. This turns it into a rule.
 *
 * ── What it actually checks ─────────────────────────────────────────────────
 *
 * An app's own source must not call a shared admin endpoint directly. If you
 * need one, you need the section that wraps it — and if the section is missing
 * something you need, the fix is to add it THERE, where every app gets it.
 *
 * Node-only (`node:fs`), and imported from `@4dl/admin/conformance` rather than
 * the root, so the browser bundle never sees it.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** The endpoints a shared package owns, and the section that covers each. */
export const SHARED_ADMIN_ENDPOINTS: { path: string; section: string }[] = [
  { path: "/api/admin/stripe/", section: "PlatformStripeSection" },
  { path: "/api/admin/domains/", section: "PlatformDomainsSection" },
  { path: "/api/admin/turnstile/", section: "PlatformTurnstileSection" },
  { path: "/api/admin/email", section: "PlatformEmailSection" },
  { path: "/api/admin/maintenance", section: "PlatformMaintenanceSection" },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * Every place an app's own code reaches a shared admin endpoint directly.
 *
 * Returns human-readable lines; empty means conformant. A test asserts it is
 * empty, so the message has to be the whole explanation.
 */
export function sharedPanelViolations(srcDir: string): string[] {
  // A caller passing `new URL(".", import.meta.url).pathname` hands us a
  // trailing slash; one passing `__dirname` does not. Normalising here beats a
  // report that says `creens/Admin.tsx`.
  const root = srcDir.replace(/\/+$/, "");
  const problems: string[] = [];
  for (const file of walk(root)) {
    const text = readFileSync(file, "utf8");
    for (const { path, section } of SHARED_ADMIN_ENDPOINTS) {
      if (!text.includes(path)) continue;
      problems.push(
        `${file.slice(root.length + 1)} calls ${path} directly. ` +
          `That endpoint belongs to a shared package — render <${section}> from @4dl/admin instead. ` +
          `If the section is missing something, add it there so every app gets it.`,
      );
    }
  }
  return problems;
}

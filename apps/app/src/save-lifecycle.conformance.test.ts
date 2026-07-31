/**
 * A WRITE THAT FAILS MUST SAY SO.
 *
 * `@4dl/ui`'s `patterns.tsx` ships the shape — `useAction` for a control with a
 * button, `useConfirmedState` for one without — and its own header says why it
 * lives in the design system rather than in the console it grew in: "the STUDIO
 * settings owe a studio owner exactly the same treatment, and a copy of a
 * pattern is a pattern that drifts."
 *
 * It drifted. The console adopted both; the studio settings screens hand-rolled
 * the lifecycle instead, and accumulated two failure modes that a reader skims
 * straight past because both are *shorter* than the correct code:
 *
 * ── 1. `try { await api.patch(…) } finally { setSaving(false) }` ─────────────
 *
 * No catch. The rejection escapes `onClick={() => void save()}` as an unhandled
 * promise rejection, where `UnhandledErrorToast` renders it as "Something didn't
 * load. Check your connection, then try again." — on a SAVE, in the wrong words,
 * in the wrong place, and indistinguishable from a failed read. The spinner
 * stops, the form still holds the edit, and nothing says the studio does not.
 * Nine of these, including "Keep my studio" — the way back from a scheduled
 * deletion.
 *
 * ── 2. `setConfig(next); await api.patch(…).catch(() => undefined)` ──────────
 *
 * Worse, because it lies. The control shows the new value, the server refused
 * it, and the state survives every re-render until a reload silently reverts it.
 * The owner set the AI house tone, watched it take, and it was never saved. Five
 * of these.
 *
 * ── What this test allows ───────────────────────────────────────────────────
 *
 * Both spellings are FINE when the failure is genuinely handled: a `catch` that
 * sets an error the screen renders is what `useAction` does internally, and a
 * swallowed failure on a READ that has its own error state is not this bug. So
 * the rule is narrow: on the screens listed below, a MUTATING call
 * (patch/post/put/del) may not be written in either banned shape.
 *
 * ── Escaping it ─────────────────────────────────────────────────────────────
 * `save-lifecycle-exempt: <why>` on the line, or up to 3 lines above.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = new URL("../../..", import.meta.url).pathname.replace(/\/$/, "");

/**
 * The configuration surfaces — every screen where a person changes a setting and
 * then leaves, trusting it took. Deliberately NOT the whole app: a logger's
 * optimistic write is replayed by the service worker's background-sync queue,
 * which is a different (and correct) contract, and sweeping it in here would
 * force an exemption comment onto code that is already right.
 */
const SCREENS = [
  "apps/app/src/screens/Settings.tsx",
  "apps/app/src/screens/AiSettings.tsx",
  "apps/app/src/screens/PreferencesEditor.tsx",
  "apps/app/src/screens/admin/AdminConsole.tsx",
];

const EXEMPT_WINDOW = 3;
const MUTATION = String.raw`api\.(patch|post|put|del)\b`;

const BANNED: { re: RegExp; why: string }[] = [
  {
    re: new RegExp(String.raw`${MUTATION}[^;]*\.catch\(\s*\(\s*\)\s*=>\s*(undefined|\{\s*\}|void 0)\s*\)`),
    why: "a swallowed write leaves the control showing a value the server refused — use `useConfirmedState`, which rolls back and reports",
  },
  {
    // `try {` … `} finally {` with no `} catch` between them, on one line.
    re: new RegExp(String.raw`\btry\s*\{(?:(?!\}\s*catch).)*${MUTATION}(?:(?!\}\s*catch).)*\}\s*finally\b`),
    why: "a save with no catch rejects into the generic runtime toast — use `useAction`, whose `run` cannot leave a rejection unhandled",
  },
];

function exempt(lines: string[], i: number): boolean {
  return lines
    .slice(Math.max(0, i - EXEMPT_WINDOW), i + 1)
    .some((l) => l.includes("save-lifecycle-exempt:"));
}

describe("every settings write reports its own failure", () => {
  for (const rel of SCREENS) {
    it(`${rel} hand-rolls no save lifecycle`, () => {
      const lines = readFileSync(join(ROOT, rel), "utf8").split("\n");
      const found: string[] = [];
      lines.forEach((line, i) => {
        for (const { re, why } of BANNED) {
          if (re.test(line) && !exempt(lines, i)) found.push(`${rel}:${i + 1} — ${why}\n    ${line.trim().slice(0, 140)}`);
        }
      });
      expect(found, `\n${found.join("\n")}\n`).toEqual([]);
    });
  }
});

describe("the shared lifecycle is the one in the design system", () => {
  it("`useAction` and `useConfirmedState` are exported from @4dl/ui, not redefined per app", () => {
    // A screen that declares its own is how the drift started. The app may BIND
    // the ui hook to its error formatter (`const useAction = () => useActionBase(errorText)`)
    // — that is a one-line adapter, not a second implementation.
    const src = readFileSync(join(ROOT, "packages/ui/src/patterns.tsx"), "utf8");
    expect(src).toMatch(/export function useAction\b/);
    expect(src).toMatch(/export function useConfirmedState\b/);

    for (const rel of SCREENS) {
      const s = readFileSync(join(ROOT, rel), "utf8");
      expect(s, `${rel} defines its own useAction`).not.toMatch(/function useAction\s*\(\s*[a-z]/i);
    }
  });
});

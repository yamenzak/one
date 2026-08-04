/**
 * ONE FACE PER PERSON, AND NO SURFACE ASSEMBLES IT BY HAND.
 *
 * `Avatar` takes three props — `name`, `src`, `seed` — and the face it draws is
 * decided by all three together. A caller that passes two of them still
 * compiles, still renders, and still looks completely correct on the screen the
 * author had open. It is only wrong when you put two screens side by side and
 * notice the same person is a different robot on each.
 *
 * That is not hypothetical. `registry/avatars.ts` records the four found in one
 * sweep: the coach's Today ignored `avatarSeed`, Sessions passed neither the
 * photo nor the seed, the client's own profile had no id fallback, and Account
 * settings seeded from the EMAIL. Four surfaces, four different faces, nothing
 * broken anywhere.
 *
 * So the props are never written at a call site. `clientAvatar` / `staffAvatar`
 * / `meAvatar` return the whole triple and every `<Avatar>` spreads one of them.
 * There are no exemptions: the branding editor is the exemption in the
 * brand-mark rule because it OWNS the raw fields, and nothing here owns a face —
 * the avatar editor in Settings uploads a photo and then renders the same
 * resolved face as everyone else.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = new URL(".", import.meta.url).pathname;

/** The resolvers. A tag that spreads one of these has the whole triple. */
const RESOLVED = /\{\.\.\.(clientAvatar|staffAvatar|meAvatar)\(/;

/** The props that make up a face. Seeing one written literally on the tag is
 *  the hand-assembly this rule bans. */
const HAND_ROLLED = /\b(name|src|seed)=/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx$/.test(entry) && !/\.test\.tsx$/.test(entry)) out.push(full);
  }
  return out;
}

/** Comment lines, blanked but not removed — a comment that quotes the banned
 *  shape to explain it is documentation, not a call site, and the line numbers
 *  in the failure message have to keep pointing at the real file. */
function decommented(source: string): string {
  return source
    .split("\n")
    .map((l) => (/^\s*(\/\/|\/?\*)/.test(l) ? "" : l))
    .join("\n");
}

/** Every `<Avatar …>` tag in a file, as `{ tag, line }`. Attributes span lines,
 *  so this reads from the tag name to its closing `>` rather than per line. */
function avatarTags(raw: string): { tag: string; line: number }[] {
  const source = decommented(raw);
  const out: { tag: string; line: number }[] = [];
  const open = /<Avatar\b/g;
  let m: RegExpExecArray | null;
  while ((m = open.exec(source))) {
    const end = source.indexOf(">", m.index);
    out.push({
      tag: source.slice(m.index, end === -1 ? source.length : end + 1),
      line: source.slice(0, m.index).split("\n").length,
    });
  }
  return out;
}

describe("avatar identity", () => {
  it("is resolved through the registry at every call site", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      for (const { tag, line } of avatarTags(readFileSync(file, "utf8"))) {
        if (RESOLVED.test(tag)) continue;
        if (!HAND_ROLLED.test(tag)) continue;
        offenders.push(`${relative(SRC, file)}:${line}  ${tag.replace(/\s+/g, " ").slice(0, 100)}`);
      }
    }
    expect(
      offenders,
      `Spread a resolver — <Avatar {...clientAvatar(row)} />. Passing name/src/seed by hand is how the same person ends up with a different face on each screen:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  /** A rule that stopped matching passes everything, and a vacuous pass reads
   *  exactly like a clean codebase. */
  it("still recognises the shape it bans", () => {
    const hand = avatarTags('<Avatar name={c.displayName} seed={c.id} className="size-9" />')[0]!;
    expect(RESOLVED.test(hand.tag)).toBe(false);
    expect(HAND_ROLLED.test(hand.tag)).toBe(true);

    const ok = avatarTags("<Avatar {...clientAvatar(c)} className=\"size-9\" />")[0]!;
    expect(RESOLVED.test(ok.tag)).toBe(true);

    // …and it reads a tag whose attributes are wrapped across lines, which is
    // how every one of the four real offenders was written.
    const wrapped = avatarTags("<Avatar\n  name={x}\n  seed={y}\n/>")[0]!;
    expect(HAND_ROLLED.test(wrapped.tag)).toBe(true);

    // A comment quoting the banned shape is not a call site. Sessions.tsx does
    // exactly this to explain what it used to render.
    expect(avatarTags("// was <Avatar name={n} seed={id} />")).toEqual([]);
    expect(avatarTags(" * It rendered `<Avatar name={n} />` — the name only.")).toEqual([]);
  });

  /** The guard only means anything if there are tags to guard. */
  it("found the app's avatars at all", () => {
    const total = walk(SRC).reduce((n, f) => n + avatarTags(readFileSync(f, "utf8")).length, 0);
    expect(total).toBeGreaterThan(8);
  });
});

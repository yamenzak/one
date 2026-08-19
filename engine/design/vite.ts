/**
 * WHAT THIS PACKAGE ASKS OF A BUILD.
 *
 * ⚠️ IT IS HERE RATHER THAN IN AN APP'S `vite.config.ts` BECAUSE IT IS ABOUT A
 * DEPENDENCY THIS PACKAGE CHOSE. An app that draws with `@engine/design` inherits
 * everything the design system imports, including its mistakes; a build fix
 * written in one app's config is a fix the second app does not get and nobody
 * finds out until somebody measures the second bundle.
 *
 *     import { design } from "@engine/design/vite";
 *     export default defineConfig({ plugins: [react(), tailwindcss(), design()] });
 */

import { gzipSync } from "node:zlib";
import type { Plugin } from "vite";

/* ------------------------------------------------------- the megabyte one --- */

/**
 * ⚠️ 1.19 MB OF COMPILED JSON-SCHEMA VALIDATOR WAS BEING SENT TO EVERY BROWSER,
 * TO CHECK A CONSTANT. `@dicebear/core` draws our faces, and its `Style`
 * constructor validates the style definition against the DiceBear schema —
 * `StyleValidator.js` alone is 983 kB of generated AJV, `OptionsValidator.js`
 * another 208 kB. Together they were a fifth of the entry chunk: measured, not
 * estimated.
 *
 * ⚠️ AND THE THING THEY VALIDATE CANNOT VARY AT RUNTIME. The two inputs are
 * `moods.json` and `planets.json`, vendored at a pinned version and identical in
 * every build, and an options object this repository writes by hand. There is no
 * request, no upload and no configuration anywhere near either. A check whose
 * answer is fixed at build time is work every visitor pays for and nobody can
 * ever fail.
 *
 * ⚠️ SO IT IS ANSWERED ONCE, WHERE THE ANSWER IS FIXED. `test/faces.test.tsx`
 * builds both styles and bakes a face with the REAL validators — this plugin
 * touches nothing outside a browser bundle — so an upgrade that genuinely
 * invalidates a style file fails a test rather than a person's avatar. Deleting
 * the check would have been the cheap version of this and is not what happened.
 *
 * ⚠️ IT REFUSES RATHER THAN SKIPS. If DiceBear moves or renames these modules the
 * stub matches nothing, the bundle silently regains a megabyte, and the only
 * symptom is a slower first paint months later. `expected` is asserted at the end
 * of the build.
 */
const VALIDATORS = /[/\\]@dicebear[/\\]core[/\\]lib[/\\]Validator[/\\](Style|Options)Validator\.js$/;

/** Both exports are a single static method that throws or returns nothing. */
const STUB = (name: string) =>
  `/* ${name} stubbed by @engine/design/vite — validated in test, not in a browser. */\n`
  + `export class ${name} { static validate() {} }\n`;

/* ------------------------------------------------------- what it weighs --- */

/**
 * WHAT THE FIRST SCREEN COSTS TO DOWNLOAD, AS A NUMBER SOMEBODY HAS TO RAISE.
 *
 * ⚠️ THE ENTRY CHUNK IS THE ONE EVERY VISITOR PAYS FOR, ON EVERY DOOR, BEFORE
 * ANYTHING IS DRAWN. Everything else is a chunk somebody asks for by going
 * somewhere; this is the floor. It grew to a megabyte and a half without any one
 * commit being at fault, which is how weight always arrives — a screen here, a
 * dependency there, and nothing in the review of any of them saying what it cost.
 *
 * ⚠️ GZIPPED, BECAUSE THAT IS WHAT TRAVELS. The raw figure is the one build tools
 * print and the one nobody experiences; compressed is what comes down the wire
 * and what a person waits for.
 *
 * ⚠️ AND IT IS THIS PLUGIN'S OWN GZIP, which runs a few kilobytes under the
 * figure Vite prints beside each chunk. Compare the ceiling against the number in
 * the failure message, never against the build log — two measurements of the same
 * thing, and only one of them is what this refuses on.
 *
 * ⚠️ AND IT IS A CEILING, NOT A TARGET. A change that makes the bundle smaller
 * lowers this in the same commit; one that makes it bigger has to raise a number
 * somebody will read in review — which is the whole mechanism, since the
 * alternative is a size nobody measures until it is a complaint.
 */
export interface DesignBuild {
  /**
   * ⚠️ OFF ONLY WITH A REASON. Set `validators: true` to ship DiceBear's own
   * checks — the one case being a bisect of a face that draws wrongly, where
   * the real validator's message is what says why.
   */
  readonly validators?: boolean;
  /** Gzipped kilobytes the entry chunk may not exceed. Omitted, nothing is checked. */
  readonly entryUnder?: number;
}

export function design(options: DesignBuild = {}): Plugin {
  let stubbed = 0;
  return {
    name: "engine-design",
    apply: "build",
    load(id) {
      if (options.validators) return null;
      const hit = VALIDATORS.exec(id);
      if (!hit) return null;
      stubbed += 1;
      return STUB(`${hit[1]}Validator`);
    },
    generateBundle(_options, bundle) {
      const under = options.entryUnder;
      if (!under) return;
      for (const part of Object.values(bundle)) {
        if (part.type !== "chunk" || !part.isEntry) continue;
        const kb = gzipSync(part.code).byteLength / 1024;
        if (kb > under) {
          this.error(
            `@engine/design: the entry chunk is ${kb.toFixed(1)} kB gzipped, over the `
            + `${under} kB this build allows.\n`
            + `  It is what every visitor downloads on every door before anything is drawn. `
            + `Put the new weight behind a dynamic import (see engine/one-space/src/console/`
            + `parts.tsx), or raise \`entryUnder\` in vite.config.ts with a reason in the commit.`,
          );
        }
      }
    },
    buildEnd() {
      if (options.validators) return;
      /* ⚠️ TWO, AND THE NUMBER IS THE CHECK. One means a rename landed and half
         the weight came back; zero means the path moved entirely. Either is a
         build failure here rather than a bundle nobody remeasures. */
      if (stubbed !== 2) {
        this.error(
          `@engine/design: expected to stub 2 DiceBear validators, stubbed ${stubbed}. `
          + `The module paths have moved — update VALIDATORS in engine/design/vite.ts, `
          + `and check engine/design/test/faces.test.tsx still exercises the real ones.`,
        );
      }
    },
  };
}

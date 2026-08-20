/**
 * MOUNTING THE CURTAIN FOR REAL, BECAUSE ITS NEW BEHAVIOUR IS ONLY IN A BROWSER.
 *
 * ⚠️ EVERY OTHER TEST IN THIS PACKAGE RENDERS TO A STRING AND READS IT, and that
 * is the right shape for a screen whose whole content is decided at render. The
 * curtain is not: it holds a line, fades it out, swaps the words while nothing
 * is on the screen, and fades the next one in — three beats from two timers, in
 * effects, none of which exist in `renderToStaticMarkup`. Asserting on the first
 * frame would pass every version of this that never advances.
 *
 * ⚠️ SO IT IS BUILT AND MOUNTED. Vite is already here (it is what vitest runs
 * on), the bundle is a few hundred milliseconds, and what comes out is the
 * component the product ships rather than a paraphrase of it in a page.
 */

import { build } from "vite";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENTRY = join(HERE, "opening.mount.tsx");

let made: string | null = null;

/** ⚠️ Built once for the file — the bundle does not change between tests. */
export async function harness(): Promise<string> {
  if (made) return made;
  const out = await build({
    logLevel: "silent",
    /* ⚠️ THE SAME JSX SETTING `vitest.config.ts` USES. Vite's esbuild handles
       `.tsx` on its own; the React plugin exists for fast refresh, which a
       build that runs once and is thrown away has no use for. */
    esbuild: { jsx: "automatic" },
    /*
      ⚠️ REACT READS `process.env.NODE_ENV`, AND A BARE PAGE HAS NO `process`.
      Vite's app build defines this for you; a library build does not, so the
      bundle threw `process is not defined` before it drew anything — an empty
      page and a test that timed out waiting for an element, with nothing saying
      why. Development, because a failure in the harness should say what it was.
    */
    define: { "process.env.NODE_ENV": JSON.stringify("development") },
    build: {
      write: false,
      lib: { entry: ENTRY, formats: ["iife"], name: "Harness", fileName: () => "h.js" },
    },
  });
  const chunks = Array.isArray(out) ? out[0]! : out;
  made = (chunks as { output: { code?: string }[] }).output
    .map((o) => o.code ?? "").join("\n");
  return made;
}

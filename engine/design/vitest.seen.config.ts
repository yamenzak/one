import { defineConfig } from "vitest/config";

/**
 * WHAT A BROWSER HAS TO BE OPENED TO ANSWER.
 *
 * ⚠️ A `.seen.` SUITE LAUNCHES CHROMIUM AND ASKS ABOUT PIXELS — does the world
 * actually move, is a heading louder than the one under it, does a skeleton
 * occupy the room its screen will. Nothing static can ask any of it, which is
 * why these exist; and none of it can tell you whether the deployment boots or
 * answers, which is why they do not gate one.
 *
 * ⚠️ THEY ARE THE WHOLE COST. Measured on this repo: the design package's suite
 * is 97 seconds and 96 of them are `sky.seen`, which takes screenshots of every
 * ambience family and compares them. Split out, what a deploy waits for goes
 * from minutes to seconds — and the cost is paid where it belongs, by whoever is
 * changing a screen.
 *
 * ⚠️ AND `scripts/seen.test.mjs` KEEPS THE SUFFIX HONEST. A browser test written
 * without it lands back in the fast lane, and CI gets slow again by a route
 * nobody chose — which is exactly how it got slow the first time.
 */
export default defineConfig({
  test: { include: ["test/**/*.seen.test.tsx"], environment: "node" },
  esbuild: { jsx: "automatic" },
});

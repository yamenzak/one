/**
 * A TAB THAT IS RUNNING AN OLD BUILD FINDS OUT.
 *
 * @design a deploy reaches a browser that is already open.
 *
 * ⚠️ NOTHING ABOUT A DEPLOY REACHES A RUNNING PAGE. The bundle a tab fetched is
 * the bundle it keeps, for as long as the tab lives — weeks, on a phone — so
 * every fix ships to somebody who will not see it until they happen to reload,
 * and the people who never do are the ones reporting faults that were closed a
 * fortnight ago. There is no service worker doing this for us: this deployment's
 * worker is a push receiver with no `fetch` handler and no cache, on purpose.
 *
 * ⚠️ THE CHAIN IS FOUR LINKS AND THREE OF THEM FAIL SILENTLY. The runtime has to
 * know what it serves; the answer has to carry it; the door has to read it; and
 * something has to say so. Break the middle two and everything still compiles,
 * every test passes, and the only symptom is a product that never updates —
 * which is indistinguishable from nobody having deployed.
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

const read = (where) => {
  const at = join(ENGINE, where);
  return existsSync(at) ? readFileSync(at, "utf8") : null;
};

/* ------------------------------------- the runtime knows what it serves --- */

{
  const src = read("runtime/src/renewal.ts");
  if (!src) {
    fail("runtime/src/renewal.ts is gone. Nothing can tell a browser it is old.");
  } else if (!/assets\.fetch\(/.test(src) || !/index\.html/.test(src)) {
    /*
      ⚠️ IT READS THE ASSET IT WOULD SERVE, WHICH IS WHY IT CANNOT BE WRONG. A
      build stamp handed to the worker and to the page separately is two facts
      that have to agree, and they stop agreeing the first time one half is
      deployed without the other — which announces a new version, for ever, over
      nothing.
    */
    fail("runtime/src/renewal.ts no longer reads the version off the page it serves.\n" +
         "       A number from anywhere else is a second fact that has to agree with the\n" +
         "       bundle, and the day it does not, every tab is told to reload over nothing.");
  } else {
    ok("served: the version is the entry bundle's own name, read back through the assets");
  }
}

/* ------------------------------------------- and every answer carries it --- */

{
  const src = read("one/src/index.ts");
  if (!src) {
    fail("one/src/index.ts is gone.");
  } else if (!/stamped\(/.test(src) || !/servedVersion\(/.test(src)) {
    fail("one/src/index.ts answers an operation without stamping the version.\n" +
         "       The header rides the answer somebody is already waiting for; without it\n" +
         "       the browser would have to poll for it, which is a request per tab per\n" +
         "       interval to learn something only a person USING the product needs.");
  } else {
    ok("stamped: every platform answer carries the version that produced it");
  }
}

/* ----------------------------------------------- the door notices a change --- */

{
  const src = read("one-space/src/api.ts");
  const notices = src && /x-one-version/.test(src) && /onRenewed\?\.\(\)/.test(src);
  /*
    ⚠️ THE FIRST ONE SEEN IS WHAT THIS TAB IS RUNNING. Comparing against a
    constant compiled into the bundle is the two-facts problem again; comparing
    against what this tab was told FIRST needs no coordination at all and is
    exactly the condition being asked about.
  */
  const remembers = src && /running \?\?= said/.test(src);
  if (!notices) {
    fail("one-space/src/api.ts does not read the version off an answer.\n" +
         "       The runtime stamps every one; a door that ignores it means the page never\n" +
         "       learns, and the header is bytes on the wire doing nothing.");
  } else if (!remembers) {
    fail("one-space/src/api.ts does not hold the version this tab is RUNNING.\n" +
         "       Without it there is nothing to compare a later answer against.");
  } else {
    ok("noticed: the door holds what this tab is running and reports a change once");
  }
}

/* --------------------------------------------- and something says so, once --- */

{
  const bar = read("design/src/frame/renewal.tsx");
  const app = read("one-space/src/App.tsx");
  const mounted = app && /<Renewed \/>/.test(app) && /whenRenewed\(/.test(app);
  /*
    ⚠️ BESIDE `NoticeHost`, WHICH IS THE SEAM THAT ALREADY REACHES EVERY FRAME.
    Mounted inside one product it would be a capability the next app has to
    remember — the shape this repository is a catalogue of.
  */
  const everywhere = app
    && app.split("<NoticeHost />").length === app.split("<NoticeHost /><Renewed />").length;

  if (!bar) {
    fail("design/src/frame/renewal.tsx is gone — the door notices and nothing draws it.");
  } else if (/Toast\.|notice\./.test(bar)) {
    fail("design/src/frame/renewal.tsx announces through a toast.\n" +
         "       A notice is the outcome of something the person just did; this is ambient,\n" +
         "       they did nothing to cause it, and a message that leaves after four seconds\n" +
         "       is the wrong shape for the one that asks somebody to act.");
  } else if (!/onReload/.test(bar) || /location\.reload/.test(bar)) {
    fail("design/src/frame/renewal.tsx reloads by itself, or offers no way to.\n" +
         "       A page that refreshes under somebody loses what they were typing; the one\n" +
         "       safe moment is the one they choose, so the act belongs to the caller.");
  } else if (!mounted) {
    fail("one-space/src/App.tsx does not mount it. The whole chain ends in nothing drawn.");
  } else if (!everywhere) {
    fail("one-space/src/App.tsx mounts it beside SOME frames and not others.\n" +
         "       A door, the space and a product are all places a tab can sit for a week.");
  } else {
    ok("offered: one bar, mounted wherever notices are, reloading only when asked");
  }
}

console.log(bad
  ? `\nrenewal: ${bad} finding(s) — a deploy nobody running the app finds out about.`
  : `\nrenewal: a tab running an old build is told, and reloads when its reader says so.`);
process.exit(bad ? 1 : 0);

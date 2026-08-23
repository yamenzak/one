/**
 * WHAT THIS DEPLOYMENT IS SERVING, SO A TAB CAN TELL THAT IT IS OLD.
 *
 * ⚠️ A SINGLE-PAGE APP LEFT OPEN NEVER LEARNS THAT IT WAS REPLACED (D56). Nothing
 * about a deploy reaches a browser that is already running: the bundle it
 * fetched is the bundle it keeps, for as long as the tab lives, which on a
 * phone is weeks. Every fix, every new screen and every corrected number ships
 * to somebody who will not see it until they happen to reload — and the ones
 * who do not are the people reporting bugs that were fixed a fortnight ago.
 *
 * ⚠️ THE VERSION IS THE ENTRY BUNDLE'S OWN NAME, WHICH IS WHY IT CANNOT BE
 * WRONG. A build stamp handed to both halves is two facts that have to agree,
 * and they disagree the first time somebody deploys one without the other. This
 * reads `index.html` back through the SAME assets binding the browser would be
 * served from, so what it reports is the file that would arrive — the question
 * and the answer are one thing.
 *
 * ⚠️ AND IT IS ASKED ONCE PER ISOLATE. Assets are immutable per deploy, so the
 * answer cannot change while this code is running; a new deploy is a new
 * isolate. Re-reading it per request would put a subrequest in front of every
 * operation to learn something that has not moved.
 */

/** ⚠️ The header a browser reads on every answer. Lower-case, as HTTP sends it. */
export const VERSION_HEADER = "x-one-version";

/**
 * ⚠️ THE ENTRY MODULE, NOT THE WHOLE DOCUMENT. Hashing the HTML would change
 * with anything Vite writes into it; the entry chunk's name changes when, and
 * only when, the application did.
 */
const ENTRY = /<script[^>]+src="(\/assets\/[^"]+\.js)"/;

let asked: Promise<string | null> | null = null;

/**
 * ⚠️ IT RETURNS `null` RATHER THAN THROWING, AND NOTHING DOWNSTREAM MAY DEPEND
 * ON IT. A deployment serving no SPA — a test harness, a worker whose assets are
 * not bound — is an ordinary state, and a missing header means a browser simply
 * never learns it is old. That is where this started; it is not a reason to
 * refuse a request that was otherwise going to work.
 */
export function servedVersion(
  assets: { fetch(request: Request): Promise<Response> } | undefined,
  at: string,
): Promise<string | null> {
  if (!assets) return Promise.resolve(null);
  asked ??= (async () => {
    try {
      const page = await assets.fetch(new Request(new URL("/index.html", at).href));
      if (!page.ok) return null;
      return ENTRY.exec(await page.text())?.[1] ?? null;
    } catch {
      return null;
    }
  })();
  return asked;
}

/**
 * ⚠️ ON THE ANSWER THE BROWSER IS ALREADY WAITING FOR, never as a call of its
 * own. A poll would be one more request per tab per interval to learn something
 * that only matters to somebody who is USING the product — and somebody who is
 * using it is making requests already.
 *
 * ⚠️ AND THE RESPONSE IS REBUILT RATHER THAN MUTATED. `Response.headers` is
 * immutable once the response has been constructed by `fetch`, so setting one
 * throws in some runtimes and is silently dropped in others — which is a header
 * that works in the test suite and is absent in production.
 */
export function stamped(response: Response, version: string | null): Response {
  if (!version) return response;
  const headers = new Headers(response.headers);
  headers.set(VERSION_HEADER, version);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

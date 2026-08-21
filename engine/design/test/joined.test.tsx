/**
 * TWO ANSWERS READ AS ONE — and the order the four cases resolve in.
 *
 * ⚠️ A SCREEN THAT ASKS TWO QUESTIONS STILL HAS ONE EMPTY STATE. Awaited
 * separately, two loads draw two headings over two skeletons and then two
 * "nothing here" sentences stacked — a page that looks half-broken rather than a
 * page with nothing on it. In your words asks two (what the AI is told, what the
 * messages say) and is the reason this exists.
 *
 * ⚠️ TROUBLE WINS OVER WAITING, WHICH IS THE CASE A NAIVE JOIN GETS WRONG.
 * Checking "either is waiting" first turns a failure into a skeleton that never
 * resolves — a page that says it is still coming when half of it never will,
 * with no retry anywhere on it.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Await, both, ready, trouble, waiting } from "../src/index.js";
import type { Problem } from "@engine/kernel";

const BROKE: Problem = {
  code: "platform.unavailable", status: 503, title: "That did not answer",
  retryable: true, tone: "danger",
};

describe("two answers read as one", () => {
  it("is ready only when both are, and carries both", () => {
    const done = both(ready(1), ready("two"));
    expect(done.status).toBe("ready");
    expect(done.status === "ready" ? done.data : null).toEqual([1, "two"]);
  });

  it("waits while either is waiting", () => {
    expect(both(ready(1), waiting<string>()).status).toBe("waiting");
    expect(both(waiting<number>(), ready("two")).status).toBe("waiting");
  });

  /* ⚠️ THE ONE THAT MATTERS. A failure beside a skeleton is a page that will
     never finish and never says so. */
  it("reports trouble even while the other half is still coming", () => {
    for (const joined of [
      both(trouble<number>(BROKE), waiting<string>()),
      both(waiting<number>(), trouble<string>(BROKE)),
    ]) {
      expect(joined.status).toBe("trouble");
    }
  });

  /* ⚠️ AND ONE NOTHING RATHER THAN TWO. The empty state is the caller's
     question about the PAIR — "neither half has anything" — which cannot be
     asked of either half alone. */
  it("gives the screen one empty state over both", () => {
    const drawn = renderToStaticMarkup(
      <Await
        of={both(ready<readonly number[]>([]), ready<readonly string[]>([]))}
        waiting={<p>coming</p>}
        isNothing={([a, b]) => a.length === 0 && b.length === 0}
        nothing={<p>Nothing here is yours</p>}
        then={() => <p>content</p>}
      />,
    );
    expect(drawn).toContain("Nothing here is yours");
    expect((drawn.match(/Nothing here is yours/g) ?? [])).toHaveLength(1);
  });
});

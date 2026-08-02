/**
 * Kova must not rebuild a console panel `@4dl/admin` already ships.
 *
 * Kova is where three of those panels came FROM, which is precisely why it needs
 * the check as much as the app that lacked them: the easy regression here is not
 * "forgot to use the shared one", it is "needed one more field, so added it back
 * locally" — and a second local copy is how the two consoles diverged in the
 * first place. If a section is missing something, it gets added in the package,
 * where the other apps get it too.
 */

import { describe, expect, it } from "vitest";
import { sharedPanelViolations } from "@4dl/admin/conformance";

describe("the operator console", () => {
  it("uses the shared panels rather than reaching for the endpoints itself", () => {
    const problems = sharedPanelViolations(new URL(".", import.meta.url).pathname);
    expect(problems, problems.join("\n")).toEqual([]);
  });
});

import { describe, it, expect } from "vitest";
import { Widget } from "@scena/manifest";
import { SAMPLE_WIDGETS } from "../src/provision.js";

// The sample display ships a self-contained widget layer to the player, so a bad
// config would silently break the one-click demo. Lock it to the manifest schema.
describe("sample display widget layer", () => {
  it("every sample widget passes the manifest Widget schema", () => {
    for (const w of SAMPLE_WIDGETS) {
      const parsed = Widget.safeParse(w);
      expect(parsed.success, `${w.id}: ${parsed.success ? "" : JSON.stringify(parsed.error.issues)}`).toBe(true);
    }
  });

  it("widgets are self-contained (no data-source binding required to render)", () => {
    // clock + text render standalone; a ticker/weather/queue widget would need a
    // bound source and show nothing on a fresh screen — keep those out of the sample.
    const standalone = new Set(["clock", "text", "date", "shape"]);
    for (const w of SAMPLE_WIDGETS) expect(standalone.has(w.type)).toBe(true);
  });
});

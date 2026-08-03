/**
 * A DOMAIN THAT MOVED TO HTTP VALIDATION MUST STOP ASKING FOR A TXT RECORD.
 *
 * `txt` DCV was replaced by `http` because four hand-typed records with opaque
 * values is a setup step most people cannot complete. Existing hostnames are
 * migrated in place on the next read, so nobody has to delete a domain and
 * start over.
 *
 * The migration worked at Cloudflare and was invisible in the product, because
 * the row that feeds the screen kept its old `_acme-challenge` values: the
 * write folded an empty Cloudflare answer into "keep what we had". That rule is
 * correct for `txt` — Cloudflare omits validation records from some polls, and
 * blanking the row mid-setup would erase the instructions from under whoever is
 * typing them — and it is a permanent lie for `http`, where there are no
 * records at all, ever, by design.
 *
 * So the owner of a domain added before the switch was still being told to
 * publish a TXT that meant nothing, on a certificate that was issuing without
 * it. From the outside that is indistinguishable from the migration not
 * happening.
 */

import { describe, expect, it } from "vitest";
import { verifyToStore } from "../src/domain-routes.js";
import type { CustomHostname } from "../src/cloudflare.js";

const STALE = {
  verify_name: "_acme-challenge.coaching.byshujaa.com",
  verify_value: "gXhQOHfayFFLdR42UyT7mI1xVxKhLTOxPH",
  verify_json: '[{"name":"_acme-challenge.coaching.byshujaa.com","value":"gXhQOHfayFFLdR42UyT7mI1xVxKhLTOxPH"}]',
};

const hostname = (over: Partial<CustomHostname> = {}): CustomHostname => ({
  id: "cf1",
  status: "pending",
  sslStatus: "pending_validation",
  sslMethod: "txt",
  verify: { name: null, value: null },
  verifyAll: [],
  errors: [],
  ...over,
});

describe("verifyToStore", () => {
  it("drops the TXT once the hostname is on http validation", () => {
    const v = verifyToStore(STALE, hostname({ sslMethod: "http" }));
    expect(v).toEqual({ name: null, value: null, json: null });
  });

  /**
   * The reason the "keep what we had" rule exists, and it still has to hold —
   * blanking the instructions on a poll that merely omitted them would strand
   * an owner halfway through typing them in.
   */
  it("keeps the TXT on a txt-DCV poll that returned nothing", () => {
    const v = verifyToStore(STALE, hostname({ sslMethod: "txt" }));
    expect(v.name).toBe(STALE.verify_name);
    expect(v.value).toBe(STALE.verify_value);
    expect(v.json).toBe(STALE.verify_json);
  });

  it("takes fresh txt records when Cloudflare sends them", () => {
    const v = verifyToStore(STALE, hostname({
      sslMethod: "txt",
      verify: { name: "_acme-challenge.x.com", value: "new" },
      verifyAll: [{ name: "_acme-challenge.x.com", value: "new" }],
    }));
    expect(v.name).toBe("_acme-challenge.x.com");
    expect(v.value).toBe("new");
    expect(JSON.parse(v.json!)).toHaveLength(1);
  });

  /**
   * An http hostname is cleared even when Cloudflare happens to echo an
   * ownership record back. On http DCV nothing has to be published, so showing
   * a record would send someone to their registrar for no reason.
   */
  it("clears an http hostname even if Cloudflare still reports a record", () => {
    const v = verifyToStore(STALE, hostname({
      sslMethod: "http",
      verify: { name: "_cf-custom-hostname.x.com", value: "abc" },
      verifyAll: [{ name: "_cf-custom-hostname.x.com", value: "abc" }],
    }));
    expect(v).toEqual({ name: null, value: null, json: null });
  });

  /** An unknown method is not a licence to erase a working setup. */
  it("keeps what it had when the method is not reported", () => {
    const v = verifyToStore(STALE, hostname({ sslMethod: null }));
    expect(v.name).toBe(STALE.verify_name);
  });
});

/**
 * THE ACCOUNT CENTRE'S OWN DOOR, AND OUR OTHER DOMAINS.
 *
 * ⚠️ EVERY FAILURE THIS FILE CATCHES IS A HOSTNAME WE OWN BEING ANSWERED BY
 * SOMEBODY ELSE'S CLAIM. `classifyHost` falls through to the custom-domain
 * lookup for anything it does not recognise, and that lookup asks which TENANT
 * registered a hostname — so a domain of ours that the classifier does not know
 * about is a domain a tenant can be served at, wearing our name, at the address
 * every credential on the platform is scoped to.
 */

import { describe, expect, it } from "vitest";
import type { DoorConfig } from "../src/index.js";
import {
  aliasFor, classifyHost, cookieDomainFor, IDENTITY_LABEL, relyingPartyFor,
  TENANTLESS_DOORS, UNIVERSAL_RESERVED,
} from "../src/index.js";

const EVERY: DoorConfig["doors"] = ["root", "setup", "admin", "identity", "tenant", "custom", "device", "unclaimed", "invalid"];

const cfg: DoorConfig = {
  appRoot: "kova.4dl.app",
  platformRoot: "4dl.app",
  reserved: ["kova"],
  deviceDoor: "play",
  doors: EVERY,
  aliases: [
    { root: "fourdegreelabs.com", mode: "redirect" },
  ],
};

/* -------------------------------------------------------------- identity --- */

describe("the account centre's door", () => {
  it("answers at id under the PLATFORM root, not under an app's", () => {
    expect(classifyHost("id.4dl.app", cfg).door).toBe("identity");
    /* ⚠️ `id.kova.4dl.app` is Kova's account screen wearing a platform name.
       It is a reserved label, so it belongs to nobody. */
    expect(classifyHost("id.kova.4dl.app", cfg).door).toBe("unclaimed");
  });

  it("is served with no tenant, because a person is not inside a workspace", () => {
    expect(TENANTLESS_DOORS).toContain("identity");
  });

  /*
    ⚠️ THE PROPERTY THE WHOLE DOOR RESTS ON. A credential is offered at an origin
    whose relying party is a registrable-domain suffix of it — so one registered
    under the platform root reaches the account centre with no second passkey and
    no redirect anywhere. Get this wrong and the door needs its own sign-in.
  */
  it("asserts the platform as its relying party, so one passkey reaches it", () => {
    expect(relyingPartyFor(classifyHost("id.4dl.app", cfg))).toBe("4dl.app");
  });

  /*
    ⚠️ AND IT DOES NOT SHARE A SESSION WITH ANY PRODUCT. The credential is
    platform-wide and the session is not: widening this cookie would make an
    injection in one product a session on every account centre.
  */
  it("does not widen its cookie to a root it sits beside", () => {
    expect(cookieDomainFor(classifyHost("id.4dl.app", cfg))).toBeNull();
  });

  it("is unclaimed on an app that did not declare it", () => {
    const without: DoorConfig = { ...cfg, doors: EVERY.filter((d) => d !== "identity") };
    expect(classifyHost("id.4dl.app", without).door).toBe("unclaimed");
  });

  /*
    ⚠️ THE LABEL IS ALREADY RESERVED EVERYWHERE, and it has to stay that way. A
    tenant holding `id` on any product would own a hostname a person is being
    taught to trust with their whole account.
  */
  it("uses a label no tenant may take on any product", () => {
    expect(UNIVERSAL_RESERVED).toContain(IDENTITY_LABEL);
  });
});

/* ------------------------------------ every other product's root is nobody's */

describe("a sibling product's root", () => {
  /*
    ⚠️ THIS IS THE BRANCH THAT DID NOT EXIST. `tessa.4dl.app` is not under
    `kova.4dl.app`, so it matched no label and fell to `custom` — a lookup asking
    which tenant had claimed it.
  */
  it("is nobody's, and is never resolved by a tenant's claim", () => {
    const shape = classifyHost("tessa.4dl.app", cfg);
    expect(shape.door).toBe("unclaimed");
    expect(shape.underRoot).toBe(true);
  });

  it("still treats a genuine outside domain as somebody's own", () => {
    expect(classifyHost("coaching.byshujaa.com", cfg).door).toBe("custom");
  });
});

/* ---------------------------------------------------------------- aliases --- */

describe("another domain of ours", () => {
  it("is never resolved by a tenant's claim", () => {
    const shape = classifyHost("id.fourdegreelabs.com", cfg);
    expect(shape.door).not.toBe("custom");
    expect(shape.alias?.alias.root).toBe("fourdegreelabs.com");
  });

  it("resolves to the door its canonical hostname would be", () => {
    expect(classifyHost("id.fourdegreelabs.com", cfg).door).toBe("identity");
    expect(classifyHost("fourdegreelabs.com", cfg).door).toBe("unclaimed");
  });

  /* ⚠️ The path has to survive, so a link into the account centre lands on the
     account centre rather than on a home page. */
  it("carries the label across, so a redirect lands where it was going", () => {
    expect(classifyHost("id.fourdegreelabs.com", cfg).alias?.canonical).toBe("id.4dl.app");
    expect(classifyHost("fourdegreelabs.com", cfg).alias?.canonical).toBe("4dl.app");
  });

  it("takes the longest matching root, so a nested alias wins", () => {
    const nested: DoorConfig = {
      ...cfg,
      aliases: [{ root: "labs.com", mode: "redirect" }, { root: "four.labs.com", mode: "redirect" }],
    };
    expect(aliasFor("id.four.labs.com", nested)?.alias.root).toBe("four.labs.com");
  });

  it("leaves every ordinary hostname untouched", () => {
    for (const host of ["kova.4dl.app", "gym.kova.4dl.app", "admin.kova.4dl.app", "coaching.byshujaa.com"]) {
      expect(classifyHost(host, cfg).alias, host).toBeUndefined();
    }
  });

  /*
    ⚠️ AN ALIAS THAT SERVES FOR REAL IS ITS OWN RELYING PARTY, AND NO
    CONFIGURATION CHANGES THAT. `4dl.app` is not a registrable-domain suffix of
    `fourdegreelabs.com`, so a passkey created under one is never offered at the
    other. The classifier must say so rather than implying a shared credential —
    a sign-in screen offering a passkey the browser cannot find is worse than one
    that does not offer it.
  */
  it("gets its own relying party when it serves rather than redirects", () => {
    const serving: DoorConfig = {
      ...cfg,
      aliases: [{ root: "fourdegreelabs.com", mode: "origin", why: "the long name is the company's own" }],
    };
    const shape = classifyHost("id.fourdegreelabs.com", serving);
    expect(shape.alias?.alias.mode).toBe("origin");
    expect(relyingPartyFor(shape)).toBe("id.fourdegreelabs.com");
  });

  it("keeps a redirecting alias pointed at the platform, because nothing signs in there", () => {
    expect(relyingPartyFor(classifyHost("id.fourdegreelabs.com", cfg))).toBe("4dl.app");
  });
});

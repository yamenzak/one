/**
 * ONE ACCOUNT, ONE CREDENTIAL, SEPARATE SESSIONS — asserted.
 *
 * The passkey migration is the part worth testing hardest, because it is the
 * part that touches people who are already customers. Everything below runs on
 * pure functions: no browser, no ceremony, no database.
 */

import { describe, expect, it } from "vitest";
import {
  ACCOUNT_FIELDS, credentialsFor, offerableAt, shouldOfferRootCredential,
  type Account, type Credential,
} from "../src/identity.js";
import { snapshotOf, validateSession, type Session } from "../src/session.js";
import { canAssignRole, canGrant, holds, permissionsFor, type Membership, type RoleRegistry } from "../src/membership.js";
import type { Instant, Locale, TenantId, UserId } from "../src/primitives.js";

const iso = (s: string) => s as Instant;

const account: Account = {
  id: "u_1" as UserId,
  email: "coach@example.com",
  emailVerified: true,
  name: "Sam",
  avatarUrl: null,
  locale: "en" as Locale,
  createdAt: iso("2026-01-01T00:00:00.000Z"),
  profileVersion: 3,
};

const cred = (relyingParty: string, id = relyingParty): Credential => ({
  id, accountId: account.id, relyingParty,
  publicKey: "…", counter: 0, createdAt: iso("2026-01-01T00:00:00.000Z"), label: null,
});

/* --------------------------------------------------------------- account --- */

describe("the shared account holds identity, never authorization", () => {
  it("has exactly the declared fields", () => {
    expect([...ACCOUNT_FIELDS].sort()).toEqual(Object.keys(account).sort());
  });

  /*
    ⚠️ A role on the account would mean a GLOBAL store answering a REGIONAL
    question, one product's authorization visible to another, and a permission
    change becoming a cross-region write on the hot path. The account answers
    "who is this"; a membership answers "what may they do here".
  */
  it("names nothing about a tenant, a role or a plan", () => {
    for (const f of ACCOUNT_FIELDS) {
      expect(f.toLowerCase(), `${f} is authorization, not identity`).not.toMatch(/tenant|role|permission|plan|grant|seat/);
    }
  });
});

/* ------------------------------------------------------------ credential --- */

describe("one credential across every product", () => {
  it("offers a root credential on every product beneath it", () => {
    const root = cred("4dl.app");
    for (const rp of ["4dl.app", "kova.4dl.app", "tessa.4dl.app", "scena.4dl.app"]) {
      expect(offerableAt(root, rp), rp).toBe(true);
    }
  });

  /*
    ⚠️ NOT THE REVERSE, and this is WebAuthn's rule rather than a policy choice.
    A credential created under one product never agreed to be a platform
    credential, and widening it after the fact would be asserting a scope its
    owner never approved.
  */
  it("does not widen an app credential to the root or to a sibling", () => {
    const kova = cred("kova.4dl.app");
    expect(offerableAt(kova, "kova.4dl.app")).toBe(true);
    expect(offerableAt(kova, "gym.kova.4dl.app")).toBe(true);
    expect(offerableAt(kova, "4dl.app")).toBe(false);
    expect(offerableAt(kova, "tessa.4dl.app")).toBe(false);
  });

  it("keeps a custom domain's credential to that domain", () => {
    const own = cred("train.mygym.com");
    expect(offerableAt(own, "train.mygym.com")).toBe(true);
    expect(offerableAt(own, "4dl.app")).toBe(false);
    expect(offerableAt(own, "mygym.com")).toBe(false);
  });

  it("is not fooled by a suffix that is not a domain boundary", () => {
    // `evil4dl.app` ends with `4dl.app` as a STRING but is a different
    // registrable domain, and offering a credential there would be a takeover.
    expect(offerableAt(cred("4dl.app"), "evil4dl.app")).toBe(false);
  });
});

describe("the migration is additive — nobody is locked out", () => {
  /*
    ⚠️ THE ASSERTION THAT MATTERS TO EXISTING CUSTOMERS.

    On the day the relying party is raised to the root, every passkey in
    existence is bound to a product. None of them stops working: each still
    resolves on the product it was made for. What changes is that NEW ones are
    made at the root and work everywhere.
  */
  it("leaves an existing app credential working exactly where it always did", () => {
    const before = [cred("kova.4dl.app")];
    expect(credentialsFor(before, "kova.4dl.app")).toHaveLength(1);
    expect(credentialsFor(before, "gym.kova.4dl.app")).toHaveLength(1);
  });

  it("nudges once, on the platform door, and only while it would help", () => {
    const onlyApp = [cred("kova.4dl.app")];
    const withRoot = [cred("kova.4dl.app"), cred("4dl.app")];

    // Somebody holding only an app credential, standing at the root: offer.
    expect(shouldOfferRootCredential(onlyApp, "4dl.app", "4dl.app")).toBe(true);
    // Once they have one, stop asking.
    expect(shouldOfferRootCredential(withRoot, "4dl.app", "4dl.app")).toBe(false);
    // Never nag somebody mid-task on a product door.
    expect(shouldOfferRootCredential(onlyApp, "kova.4dl.app", "4dl.app")).toBe(false);
    // And never nag a person with no passkeys at all — that is a sign-up, not a nudge.
    expect(shouldOfferRootCredential([], "4dl.app", "4dl.app")).toBe(false);
  });

  it("offers a mixed set correctly at each door", () => {
    const all = [cred("kova.4dl.app"), cred("4dl.app"), cred("train.mygym.com")];
    expect(credentialsFor(all, "kova.4dl.app").map((c) => c.id).sort()).toEqual(["4dl.app", "kova.4dl.app"]);
    expect(credentialsFor(all, "tessa.4dl.app").map((c) => c.id)).toEqual(["4dl.app"]);
    expect(credentialsFor(all, "train.mygym.com").map((c) => c.id)).toEqual(["train.mygym.com"]);
  });
});

/* --------------------------------------------------------------- session --- */

const session: Session = {
  id: "s_1",
  accountId: account.id,
  origin: "https://gym.kova.4dl.app",
  appId: "kova",
  createdAt: iso("2026-08-01T00:00:00.000Z"),
  expiresAt: iso("2026-09-01T00:00:00.000Z"),
  snapshot: snapshotOf(account),
};
const now = iso("2026-08-09T12:00:00.000Z");
const here = { origin: "https://gym.kova.4dl.app", appId: "kova" };

describe("a session belongs to one origin", () => {
  it("validates on the origin it was issued for", () => {
    expect(validateSession(session, here, now).ok).toBe(true);
  });

  /*
    ⚠️ THE PRICE OF SHARING AN ACCOUNT, REFUSED. A cookie can reach somewhere it
    was not meant for — a misconfigured domain attribute, a proxy, a future edit.
    This check is what makes that inert rather than a cross-product compromise.
  */
  it("refuses the same cookie presented at another product", () => {
    const r = validateSession(session, { origin: "https://clinic.tessa.4dl.app", appId: "tessa" }, now);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.why).toBe("wrong_origin");
  });

  it("refuses a session whose app does not match, even on a matching origin", () => {
    const r = validateSession(session, { ...here, appId: "tessa" }, now);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.why).toBe("wrong_app");
  });

  it("expires by comparing ISO text, which is why instants are that format", () => {
    const r = validateSession(session, here, iso("2026-09-02T00:00:00.000Z"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.why).toBe("expired");
  });

  it("carries everything the hot path needs, so it never reads the account", () => {
    // The snapshot is why one global identity store is affordable: without it,
    // every request would cross a region to validate.
    expect(session.snapshot.email).toBe(account.email);
    expect(session.snapshot.profileVersion).toBe(account.profileVersion);
  });

  it("treats a stale snapshot as VALID but flagged", () => {
    // Signing somebody out because they changed their avatar would be absurd.
    const r = validateSession(session, here, now, account.profileVersion + 1);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.stale).toBe(true);
  });
});

/* ------------------------------------------------------------ membership --- */

const roles: RoleRegistry = {
  owner: ["client:read", "client:write", "staff:invite", "billing:manage"],
  coach: ["client:read", "client:write"],
  assistant: ["client:read"],
};

describe("membership resolves to permissions, per tenant, per app", () => {
  const m = (over: Partial<Membership> = {}): Membership => ({
    accountId: account.id, tenantId: "t_1" as TenantId, roles: ["coach"], ...over,
  });

  it("unions the roles", () => {
    expect([...permissionsFor(m({ roles: ["coach", "assistant"] }), roles)].sort())
      .toEqual(["client:read", "client:write"]);
  });

  it("applies revocation LAST, so 'everything except one thing' is expressible", () => {
    const p = permissionsFor(m({ grants: ["billing:manage"], revoked: ["client:write"] }), roles);
    expect(holds(p, "client:read")).toBe(true);
    expect(holds(p, "billing:manage")).toBe(true);
    expect(holds(p, "client:write")).toBe(false);
  });

  it("lets a revocation beat a grant of the same permission", () => {
    const p = permissionsFor(m({ grants: ["client:write"], revoked: ["client:write"] }), roles);
    expect(holds(p, "client:write")).toBe(false);
  });
});

describe("nobody may grant what they do not hold", () => {
  const coach = permissionsFor({ accountId: account.id, tenantId: "t_1" as TenantId, roles: ["coach"] }, roles);
  const owner = permissionsFor({ accountId: account.id, tenantId: "t_1" as TenantId, roles: ["owner"] }, roles);

  it("refuses a permission the granter lacks", () => {
    expect(canGrant(coach, ["client:read"])).toBe(true);
    expect(canGrant(coach, ["billing:manage"])).toBe(false);
    expect(canGrant(owner, ["billing:manage"])).toBe(true);
  });

  /*
    ⚠️ AND A ROLE IS NOT A BACK DOOR. Without this, anybody able to assign roles
    escalates in one step: assign yourself owner, which carries the permission
    you were refused a moment ago. Invisible until somebody notices they have
    been an owner for a month.
  */
  it("refuses a ROLE carrying anything the granter lacks", () => {
    expect(canAssignRole(coach, "assistant", roles)).toBe(true);
    expect(canAssignRole(coach, "owner", roles)).toBe(false);
    expect(canAssignRole(owner, "owner", roles)).toBe(true);
  });
});

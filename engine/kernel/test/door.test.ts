/**
 * WHICH DOOR A REQUEST ARRIVED AT.
 *
 * ⚠️ EVERY ONE OF THESE IS A TAKEOVER OR A LEAK, NOT A ROUTING MISTAKE. A
 * workspace answering on the operator's hostname, a certificate-validation label
 * held by a customer, a wildcard subdomain treated as a workspace name, an
 * unknown host quietly served as somebody's — each is a way for a hostname to
 * become authority it was never given.
 */

import { describe, expect, it } from "vitest";
import { doorFor } from "../src/door.js";

const ROOTS = { root: "one.4dl.app" };

describe("the doors under our own root", () => {
  it("knows each one by its label", () => {
    expect(doorFor("one.4dl.app", ROOTS).kind).toBe("signpost");
    expect(doorFor("id.one.4dl.app", ROOTS).kind).toBe("account");
    expect(doorFor("admin.one.4dl.app", ROOTS).kind).toBe("operator");
    expect(doorFor("setup.one.4dl.app", ROOTS).kind).toBe("setup");
  });

  it("reads a workspace's slug off its address", () => {
    const door = doorFor("Northwind.one.4dl.app", ROOTS);
    expect(door).toEqual({ kind: "tenant", slug: "northwind", host: "northwind.one.4dl.app" });
  });

  /*
    ⚠️ A RESERVED LABEL IS NOT A WORKSPACE, and this is the check that surprises
    people: `acme` — the obvious example company name — is the certificate
    issuance protocol's own label, so a workspace holding it would answer on the
    path a certificate authority validates against. That is why the list is
    checked rather than remembered.
  */
  it("refuses the labels that are infrastructure", () => {
    for (const label of ["acme", "acme-challenge", "autodiscover", "_domainkey", "mail", "www"]) {
      expect(doorFor(`${label}.one.4dl.app`, ROOTS).kind).toBe("none");
    }
  });

  /* ⚠️ And the operator's own door is not something a workspace can be called. */
  it("never lets a workspace be called admin or setup", () => {
    expect(doorFor("admin.one.4dl.app", ROOTS).kind).toBe("operator");
    expect(doorFor("setup.one.4dl.app", ROOTS).kind).toBe("setup");
  });

  /*
    ⚠️ ONE LABEL ONLY. Treating `a.b.one.4dl.app` as a workspace called "a.b"
    makes a wildcard certificate a way to invent addresses under our own name.
  */
  it("does not serve a second level", () => {
    expect(doorFor("a.b.one.4dl.app", ROOTS).kind).toBe("none");
  });

  it("refuses a label that could not be a DNS name", () => {
    expect(doorFor("Not_A_Label.one.4dl.app", ROOTS).kind).toBe("none");
    expect(doorFor("-leading.one.4dl.app", ROOTS).kind).toBe("none");
  });
});

describe("everything else", () => {
  /*
    ⚠️ AN UNRECOGNISED HOST IS NOTHING, NEVER A DEFAULT. Falling back to "the
    first workspace" or "the marketing site" is how a hostname somebody points at
    us becomes an address for a workspace they do not own.
  */
  it("answers nothing at a host it was never told about", () => {
    expect(doorFor("something-else.example", ROOTS).kind).toBe("none");
    expect(doorFor("", ROOTS).kind).toBe("none");
  });

  /* ⚠️ A custom domain is the same workspace and carries no slug — its tenancy
     comes from the domain itself, so the door reports the host instead. */
  it("serves a workspace at a domain of its own", () => {
    const roots = { ...ROOTS, custom: (h: string) => h === "notes.northwind.com" };
    expect(doorFor("notes.northwind.com", roots))
      .toEqual({ kind: "tenant", slug: null, host: "notes.northwind.com" });
    expect(doorFor("notes.someone-else.com", roots).kind).toBe("none");
  });

  /* ⚠️ The device door is opt-in per deployment, because `play` is a slug a
     workspace could otherwise be holding on a deployment that has no devices. */
  it("only opens the device door where a deployment asked for one", () => {
    expect(doorFor("play.one.4dl.app", ROOTS).kind).toBe("none");
    expect(doorFor("play.one.4dl.app", { ...ROOTS, device: true }).kind).toBe("device");
  });

  it("ignores a port", () => {
    expect(doorFor("northwind.one.4dl.app:8787", ROOTS).kind).toBe("tenant");
  });
});

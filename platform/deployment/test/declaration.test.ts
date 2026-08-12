/**
 * THE DEPLOYMENT'S OWN DECLARATION, HELD TO THE RULE ITS APPS ARE HELD TO.
 *
 * ⚠️ IT IS NOT COMPOSED BY `defineApp`, so nothing runs `legalProblems` over it at
 * boot the way every app's is checked. A document here with no version, or one
 * required of nobody, would be exactly the defect that function exists to refuse —
 * shipped, on the one set of documents everybody with an account is asked for.
 */

import { describe, expect, it } from "vitest";
import { ACCOUNT_HOLDER, accountReceiving, legalProblems } from "@one/kernel";
import { DEPLOYMENT } from "../src/index.js";

describe("who runs this deployment", () => {
  it("declares documents that would survive composition", () => {
    /* ⚠️ THE SAME CHECK, not a copy of its rules: a version, a title, text or an
       address, and somebody it is required of. */
    expect(legalProblems(DEPLOYMENT.legal)).toEqual([]);
  });

  it("asks them of anybody with an account, not of a role inside a product", () => {
    /*
      ⚠️ THIS IS THE WHOLE REASON THE DECLARATION EXISTS. Every other document in
      this repository is owed for being something inside a product — an owner, a
      client. These are owed for having an account, which is the one obligation
      that reaches somebody who belongs to nothing and whose address, passkeys and
      vault we hold anyway.
    */
    for (const doc of DEPLOYMENT.legal) expect(doc.mustAccept).toEqual([ACCOUNT_HOLDER]);
  });

  it("names a controller and an address a question can be sent to", () => {
    /* ⚠️ AN ADDRESS, NOT A FORM, and a controller that is not an app's. */
    expect(DEPLOYMENT.contact).toMatch(/@/);
    expect(DEPLOYMENT.controller.length).toBeGreaterThan(20);
  });

  it("says the vault is the account's rather than a product's", () => {
    /*
      ⚠️ THE ONE CLAIM THIS DOCUMENT MUST MAKE. A vault fact outlives every
      workspace somebody leaves — that is what the vault IS — so if the account's
      own privacy notice does not cover it, nothing does: each product's notice
      can only speak for what that product reads.
    */
    const notice = DEPLOYMENT.legal.find((d) => d.id === "account-privacy");
    expect(notice?.body ?? "").toMatch(/vault/i);
  });

  /*
    ⚠️ THE ACCOUNT'S DISCLOSURE SAID "NOBODY ELSE", WHICH WAS FALSE. It was a
    controller and an address over an empty list, while the platform's host stored
    the sessions table, the passkeys and the vault itself, and the mail lane
    carried every sign-in code. Those are processors of the ACCOUNT — reached
    before any product is opened, and still reached by somebody who belongs to
    none — so an app's declaration structurally cannot cover them.
  */
  it("names who processes an account, not only who controls it", () => {
    expect(DEPLOYMENT.subprocessors.length).toBeGreaterThan(0);
    const receiving = accountReceiving(DEPLOYMENT);
    expect(receiving.transfers.length).toBe(DEPLOYMENT.subprocessors.length);
    /* ⚠️ AND EVERY ONE CARRIES ITS OWN PROCESSING TERMS. A processor with none is
       not one we may use, and a link rather than a copy is what keeps a claim we
       made about somebody else from going stale on their schedule. */
    for (const sub of DEPLOYMENT.subprocessors) {
      expect(sub.terms, sub.id).toMatch(/^https:\/\//);
    }
  });

  /*
    ⚠️ NO REGIONS AND NO INFERENCE, WHICH IS A DIFFERENT KIND OF EMPTY. An account
    is global by construction — it is what routes somebody TO a region rather than
    a thing placed in one — and nothing generates from it. Both are absent because
    they do not apply, and an interface omits a row rather than printing a blank.
  */
  it("claims no region for the account itself", () => {
    const receiving = accountReceiving(DEPLOYMENT);
    expect(receiving.regions).toEqual([]);
    expect(receiving.inference).toEqual({});
  });
});

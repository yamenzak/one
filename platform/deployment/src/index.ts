/**
 * WHO RUNS THIS DEPLOYMENT.
 *
 * ⚠️ THIS IS THE ONE MODULE IN `platform/` THAT IS NOT PRODUCT-AGNOSTIC, and it is
 * a package of its own so that fact is structural rather than remembered. Every
 * worker imports it; no shared package may, and none does — `@one/kernel` holds
 * the SHAPE and nothing else, for the same reason a shared component library holds
 * no product's nouns.
 *
 * ⚠️ ONE OBJECT, IMPORTED, NEVER RETYPED. The alternative is each manifest
 * declaring its own copy of the same company, contact and terms — identical on the
 * day it is written and drifted by the second edit, with the drift invisible
 * because each app's screen shows its own copy and agrees with itself.
 *
 * ⚠️ AND IT IS WHY THE ACCOUNT HAS TERMS AT ALL. Every other document in this
 * repository belongs to a product and is asked of a role inside one. An account
 * exists before any product and outlives all of them: the vault holds facts that
 * survive leaving every workspace, and somebody can hold an account belonging to
 * nothing at all. No app's declaration can cover either, because the thing being
 * described outlives the thing describing it.
 */

import { ACCOUNT_HOLDER, type DeploymentSpec } from "@one/kernel";

export const DEPLOYMENT: DeploymentSpec = {
  name: "4°",
  /*
    ⚠️ ONE CONTROLLER HERE, AND IT IS NOT THE SAME SENTENCE A PRODUCT WRITES. A
    product's controller field answers "who is responsible for what this workspace
    records"; this answers "who is responsible for the account itself and for the
    vault" — and the vault is the half nobody else can claim, because it is the
    only store in the platform that outlives every workspace.
  */
  controller: "Four Degree Labs, Abu Dhabi, United Arab Emirates, controls your account — how you sign in, what you have agreed to, and the facts you keep in your vault. Each product you use controls what it records about you inside itself, and says so on its own terms.",
  contact: "legal@fourdegreelabs.com",
  legal: [
    {
      id: "account-terms",
      version: "2026-01-01",
      title: "Account terms",
      mustAccept: [ACCOUNT_HOLDER],
      body: [
        "This covers your 4° account itself, not any product you use it with. Each of those has its own terms and you accept them separately.",
        "The account is yours. You can take everything it holds, close it, and be forgotten — from the account centre, without asking anybody.",
        "Closing your account does not close a workspace you own. Those belong to the people in them as well as to you, so we refuse rather than take them down on your behalf.",
      ].join("\n\n"),
    },
    {
      id: "account-privacy",
      version: "2026-01-01",
      title: "Privacy notice",
      mustAccept: [ACCOUNT_HOLDER],
      /*
        ⚠️ THE VAULT IS IN THIS DOCUMENT RATHER THAN ITS OWN, and that is a
        decision. A separate one would imply the vault is something you could
        decline and still have an account — it is not: it is where a sensitive
        fact lives, and declining it means recording nothing.
      */
      body: [
        "We hold what your account is made of: the address you sign in with, the passkeys you registered, where you are signed in, and how you have asked to be read to.",
        "We also hold your vault — the sensitive things you record about yourself. These are yours rather than any product's, which is why they survive leaving a workspace and closing a product. No product sees a vault fact unless you grant it, every grant is one you can withdraw, and every read is recorded where you can see who did it.",
        "We do not sell any of it and we do not train anything on it. Where a product sends something to a model, that product names what it sends, on its own page in this account centre.",
        "Ask us anything about this at legal@fourdegreelabs.com.",
      ].join("\n\n"),
    },
  ],
};

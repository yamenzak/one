/**
 * THE HUB'S OWN REFUSALS — the two the browser can raise that no server can.
 *
 * ⚠️ A REFUSAL IS A CATALOGUE ENTRY OR IT DOES NOT EXIST. Written inline where
 * it is raised, a refusal's wording, tone, status and retryability are each
 * decided by whoever was there — and this file exists because five screens had
 * done exactly that, three of them stamping `platform.invalid` on three
 * different sentences. A client switching on the code then sees one code
 * meaning three things, and the wording of "we could not reach One" lives
 * wherever it was last edited.
 *
 * ⚠️ THESE TWO ARE THE HUB'S BECAUSE NO SERVER CAN SEND THEM. A request that
 * never arrived has no status and no body; a response that is not JSON has a
 * status and nothing else. Everything a server CAN answer is the platform's or
 * an app's, and belongs in their catalogues rather than here.
 *
 * ⚠️ AND FIELD-LEVEL VALIDATION IS NOT A CODE. "That does not look like an
 * email address" is `platform.invalid` carrying a `fields` entry, which is what
 * `Problem.fields` is for and what puts the sentence beside the input rather
 * than in a banner over the form.
 */

import { PLATFORM_PROBLEMS, type ProblemCatalog } from "@engine/kernel";

const OWN: ProblemCatalog = {
  /*
    ⚠️ STATUS 0, BECAUSE THERE WAS NO STATUS. Dressing a dropped connection as a
    500 puts words in the platform's mouth — it says our side failed, when what
    happened is that the request never arrived.
  */
  "hub.unreachable": {
    status: 0, retryable: true, tone: "warning",
    title: "We could not reach One",
    detail: "Check your connection and try again.",
  },
  /*
    ⚠️ FOR A RESPONSE THAT IS NOT ONE OF OURS. Every route answers a `problem`
    body; something that does not is a proxy, a gateway or a crash, and the only
    honest thing to say is that it was unexpected.
  */
  "hub.unexpected": {
    status: 500, retryable: true, tone: "danger",
    title: "Something went wrong",
    detail: "It is not you. Try again, and quote {ref} if it keeps happening.",
  },
};

/** ⚠️ Merged, so one call resolves a platform code and a hub code alike. */
export const PROBLEMS: ProblemCatalog = { ...PLATFORM_PROBLEMS, ...OWN };

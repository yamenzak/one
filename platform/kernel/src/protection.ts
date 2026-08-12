/**
 * DATA PROTECTION, DECLARED ONCE AND DERIVED EVERYWHERE AFTER THAT.
 *
 * Layer 1. Imports nothing.
 *
 * ⚠️ IT TAKES A SHAPE RATHER THAN A `CollectionSpec`, and that is not a
 * generalisation for its own sake: a collection declares its `holding`, so a
 * module that both defines `Holding` and imports `CollectionSpec` is a cycle.
 * Naming the three fields these functions actually read breaks it and costs
 * nothing — they are the three an Article 30 record is written from.
 *
 * ⚠️ THE GOAL IS THAT NOBODY VISITS THIS FILE PER FEATURE. A compliance posture
 * that needs a person to remember something on every commit is one that is
 * correct on the day it is written and wrong by the end of the quarter — and the
 * gap is invisible, because a missing entry in a record of processing looks
 * exactly like a processing activity that does not exist.
 *
 * So the split is deliberate and it is the whole design:
 *
 *   DECLARED   what a collection HOLDS. No schema implies "this is health
 *              information"; a person has to say so, once, on the collection.
 *   DERIVED    everything else. Retention comes from the collection, transfers
 *              from the region, recipients from what handlers actually CALL,
 *              and the Article 30 record from all of it together.
 *
 * ⚠️ AND `holding` IS REQUIRED WITH AN EXPLICIT "NOTHING", NOT OPTIONAL. An
 * optional field is one that is absent on the collection somebody added in a
 * hurry, and absent is indistinguishable from "nothing personal here" — which is
 * the exact claim that needs a person behind it. Saying `{ kind: "none" }` costs
 * one line and means somebody looked.
 */

/** The part of a collection a record of processing is written from. */
export interface Held {
  readonly id: string;
  readonly fields: Readonly<Record<string, unknown>>;
  readonly retention: { readonly days: number | null; readonly onTenantClose: "purge" | "export-then-purge" };
  readonly holding: Holding;
}

/* ------------------------------------------------------- what is held --- */

/**
 * ⚠️ A CLOSED SET, AND THE LAST SEVEN ARE ARTICLE 9. Special categories are not
 * a stricter flavour of ordinary data — they are prohibited from processing
 * unless a specific condition applies, which is a different question from the
 * lawful basis and has to be answered separately.
 */
export type DataCategory =
  | "identity"      // a name, an identifier, a date of birth
  | "contact"       // an address, an email, a telephone number
  | "credential"    // a passkey, a session, anything that authenticates
  | "financial"     // what was charged, what is owed. Never a card number.
  | "usage"         // what somebody did in the product, and when
  | "content"       // what they wrote or uploaded
  | "location"
  | "device"
  /* Article 9. */
  | "health"
  | "biometric"
  | "genetic"
  | "racial"
  | "political"
  | "religious"
  | "union"
  | "sexlife"
  /* Article 10 — its own regime again, and named so it cannot be missed. */
  | "criminal";

export const SPECIAL_CATEGORIES: readonly DataCategory[] = [
  "health", "biometric", "genetic", "racial", "political", "religious", "union", "sexlife",
];

/** Article 6. Why processing is lawful at all. */
export type LawfulBasis =
  | "consent" | "contract" | "legal_obligation" | "vital_interests" | "public_task" | "legitimate_interests";

/** Article 9(2). Required in addition wherever a special category is held. */
export type SpecialCondition =
  | "explicit_consent" | "employment" | "vital_interests" | "not_for_profit"
  | "made_public" | "legal_claims" | "substantial_public_interest"
  | "health_care" | "public_health" | "archiving";

/**
 * Whose data it is. ⚠️ Not who may READ it — that is the scope and the
 * permissions. This is whose rights attach to the row.
 */
export type SubjectKind = "member" | "customer" | "visitor" | "operator";

export type Holding =
  /**
   * ⚠️ AN EXPLICIT NOTHING, WITH A REASON. A shared catalogue, a counter, a
   * cache: each is genuinely impersonal, and each has to say why — because the
   * sentence somebody writes here is the one a reviewer checks against the
   * fields, and there is no sentence to check if the field was simply left out.
   */
  | { readonly kind: "none"; readonly why: string }
  | {
      readonly kind: "personal";
      readonly categories: readonly DataCategory[];
      readonly subjects: readonly SubjectKind[];
      /** What it is FOR, in one line. This is the Article 30 purpose. */
      readonly purpose: string;
      readonly basis: LawfulBasis;
      /** ⚠️ Required wherever a category is special. Refused where none is. */
      readonly condition?: SpecialCondition;
      /**
       * ⚠️ REQUIRED FOR `legitimate_interests`, because that basis is the only
       * one that is an argument rather than a fact. It obliges a balancing test,
       * and a balancing test nobody wrote down is one that was not done.
       */
      readonly balancing?: string;
    };

/* -------------------------------------------------- who else touches it --- */

/**
 * SOMEBODY ELSE WHO PROCESSES THIS DATA ON OUR INSTRUCTIONS.
 *
 * ⚠️ THE LIST IS DERIVED-CHECKED RATHER THAN TRUSTED. A guard reads what
 * handlers actually call — a model, a lookup, the mail lane, the payment lane —
 * and refuses a manifest that reaches somebody it did not declare, or declares
 * somebody nothing reaches. That is what makes the list stay right without
 * anybody revisiting it when a feature is added.
 */
export interface Subprocessor {
  /** The name a handler reaches it by. Matched against what the source calls. */
  readonly id: string;
  readonly name: string;
  /** One line: what they do for us. */
  readonly role: string;
  /** What of somebody's data reaches them. */
  readonly receives: readonly DataCategory[];
  /** Where they process it, in the words a questionnaire asks for. */
  readonly where: string;
  /**
   * ⚠️ HOW A TRANSFER OUT OF THE EEA IS COVERED, and "none needed" is a real
   * answer that has to be given rather than assumed.
   */
  readonly safeguard: "eea" | "adequacy" | "sccs" | "dpf";
  /** Their processing terms. A sub-processor with none is not one we may use. */
  readonly terms: string;
  /**
   * Where THEY publish what they hold — certifications, audit reports,
   * sub-processors of their own.
   *
   * ⚠️ A LINK RATHER THAN A COPY, AND THAT IS NOT LAZINESS. Their certification
   * list changes on their schedule; a copy in this repository is wrong the first
   * time one lapses or is added, and it is wrong in the most damaging possible
   * place — a compliance claim we made about somebody else.
   */
  readonly trust?: string;
}

export interface ProtectionSpec {
  /**
   * ⚠️ WHO THE CONTROLLER IS, AND FOR WHAT. In a multi-tenant product this is
   * two answers, and conflating them is the most consequential mistake
   * available: the platform controls the account and the billing relationship;
   * the TENANT controls what it records about the people it serves, and we are
   * its processor for that. Every right a customer exercises runs against the
   * tenant, and every obligation we have about it is theirs to direct.
   */
  readonly controller: string;
  /** Where a data-protection question goes. An address, not a form. */
  readonly contact: string;
  readonly subprocessors: readonly Subprocessor[];
  /**
   * ⚠️ WHETHER AN ASSESSMENT IS OWED, ANSWERED RATHER THAN OMITTED. Article 35
   * requires one where processing is likely to be high risk — large-scale
   * special-category data qualifies on its face — and "we did not think about
   * it" is the finding, not the absence of a document.
   */
  readonly assessment: { readonly required: boolean; readonly note: string };
}

/**
 * WHO ELSE RECEIVES WHAT IS HELD, ASSEMBLED — the declaration crossed with what
 * this deployment actually is.
 *
 * ⚠️ IT IS NOT `ProtectionSpec`. That is what a manifest WRITES; this is what a
 * person is shown, and three of its fields are computed rather than declared: the
 * regions come from the tenancy, the inference map from the bindings, and the
 * transfers from what the collections hold crossed with what each recipient
 * claims. A declaration alone cannot answer "does anything leave".
 *
 * ⚠️ AND IT IS A KERNEL TYPE BECAUSE FOUR PLACES AGREE ON IT: the operation that
 * answers it, the boot that publishes it for every other product, the module that
 * hands it to a screen, and the screen. A shape described in four places is one
 * checked in none.
 */
export interface Receiving {
  readonly controller: string;
  readonly contact: string;
  readonly subprocessors: readonly Subprocessor[];
  readonly regions: readonly string[];
  /** Per binding, per region, as subprocessor ids — never a list of sentences. */
  readonly inference: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>>;
  readonly transfers: readonly Transfer[];
}

/* ------------------------------------------------------------ refusals --- */

export interface ProtectionProblem { readonly at: string; readonly why: string }

/**
 * ⚠️ FIELD NAMES THAT MAKE "NOTHING PERSONAL HERE" UNBELIEVABLE.
 *
 * This is the anti-trick half, and it is the reason the declaration is worth
 * anything. `{ kind: "none" }` is one line, and one line is exactly what
 * somebody writes to make a check go away — so a collection carrying a field
 * called `email`, `name` or `photo` may not claim to hold nothing, whatever its
 * declaration says.
 *
 * It is deliberately a short list of unambiguous words. A long one becomes a
 * thesaurus argument in review; these are the ones that are never anything else.
 */
const PERSONAL_WORDS = [
  "email", "phone", "mobile", "address", "postcode", "avatar",
  "birthday", "dateofbirth", "dob", "passport", "nationalid", "ssn",
];

/*
  ⚠️ AND THESE ARE DELIBERATELY NOT ON IT: `name`, `photo`, `image`, `note`,
  `comment`. Every one of them is a person's on most collections and nobody's on
  a library — a food has a name, a movement has a demonstration image, a note can
  be about an exercise. Including them made this check fail on two collections
  that were declared honestly, and a check that refuses an honest declaration
  teaches people to weaken it, which costs more than the cases it would catch.

  What is left is the set that is never anything but a person. The health half is
  caught separately and by the same reasoning: `weight` on a collection is not
  the weight of a barbell.
*/

/** And these make a claim of "no special category" unbelievable. */
const SPECIAL_WORDS: Readonly<Record<string, DataCategory>> = {
  weight: "health", height: "health", bodyfat: "health", sleep: "health",
  mood: "health", symptom: "health", diagnosis: "health", medication: "health",
  dose: "health", lab: "health", allerg: "health", injur: "health", condition: "health",
  scan: "biometric", fingerprint: "biometric", face: "biometric",
};

const wordsIn = (spec: Held): string =>
  [spec.id, ...Object.keys(spec.fields)].join(" ").toLowerCase();

/**
 * Everything decidable about what a collection says it holds.
 *
 * ⚠️ EVERY ONE OF THESE IS A RECORD OF PROCESSING THAT WOULD BE WRONG, and a
 * record of processing that is wrong is worse than one that is missing: it is a
 * document produced on request, in writing, describing something else.
 */
export function holdingProblems(collections: readonly Held[]): readonly ProtectionProblem[] {
  const out: ProtectionProblem[] = [];
  for (const c of collections) {
    const h = c.holding;
    const words = wordsIn(c);

    /*
      ⚠️ A MISSING DECLARATION IS A REFUSAL WITH A SENTENCE, NOT A CRASH. The
      type requires it, so this only happens where something bypassed the
      constructor — and a check that throws a TypeError on a malformed manifest
      turns a problem somebody could fix into a stack trace they cannot read.
    */
    if (!h) {
      out.push({ at: c.id, why: "declares nothing about what it holds, and absent reads as nothing personal — which is the one claim that needs somebody behind it" });
      continue;
    }

    if (h.kind === "none") {
      if (!h.why.trim()) out.push({ at: c.id, why: "says it holds nothing personal and does not say why" });
      const looks = PERSONAL_WORDS.filter((w) => words.includes(w));
      if (looks.length) {
        out.push({
          at: c.id,
          why: `says it holds nothing personal while carrying ${looks.join(", ")} — one line is exactly what somebody writes to make a check go away`,
        });
      }
      continue;
    }

    if (!h.categories.length) out.push({ at: c.id, why: "holds personal data of no category, which is not a thing it can hold" });
    if (!h.subjects.length) out.push({ at: c.id, why: "holds personal data about nobody, so no right attaches to it and nobody can claim one" });
    if (!h.purpose.trim()) out.push({ at: c.id, why: "has no purpose, which is the one field an Article 30 record cannot be written without" });

    const special = h.categories.filter((k) => SPECIAL_CATEGORIES.includes(k));
    if (special.length && !h.condition) {
      out.push({ at: c.id, why: `holds ${special.join(", ")} with no Article 9 condition — a lawful basis is not one, and without it the processing is prohibited rather than merely undocumented` });
    }
    if (!special.length && h.condition) {
      out.push({ at: c.id, why: "names an Article 9 condition and holds no special category, which reads as a stricter claim than it is" });
    }
    if (h.basis === "legitimate_interests" && !h.balancing?.trim()) {
      out.push({ at: c.id, why: "rests on legitimate interests and records no balancing — that basis is an argument rather than a fact, and one nobody wrote down was not made" });
    }

    /* ⚠️ The anti-trick check again, one level up: a collection whose own
       vocabulary is health may not declare only `usage`. */
    const implied = [...new Set(Object.entries(SPECIAL_WORDS).filter(([w]) => words.includes(w)).map(([, k]) => k))];
    for (const k of implied) {
      if (!h.categories.includes(k)) {
        out.push({ at: c.id, why: `carries ${k} information by its own field names and does not declare the ${k} category` });
      }
    }
  }
  return out;
}

/** Everything decidable about the deployment's own declaration. */
export function protectionProblems(spec: ProtectionSpec): readonly ProtectionProblem[] {
  const out: ProtectionProblem[] = [];
  if (!spec.controller.trim()) out.push({ at: "controller", why: "is unnamed, so nobody knows who a right is claimed against" });
  if (!spec.contact.trim()) out.push({ at: "contact", why: "is empty, so a data-protection question has nowhere to go" });
  if (!spec.assessment.note.trim()) out.push({ at: "assessment", why: "records no reasoning either way — 'we did not think about it' is the finding, not the absence of a document" });

  const seen = new Set<string>();
  for (const p of spec.subprocessors) {
    if (seen.has(p.id)) out.push({ at: p.id, why: "is declared twice" });
    seen.add(p.id);
    if (!p.name.trim()) out.push({ at: p.id, why: "has no name" });
    if (!p.role.trim()) out.push({ at: p.id, why: "has no stated role, so nobody can tell what it would mean to remove it" });
    if (!p.receives.length) out.push({ at: p.id, why: "receives nothing, which makes it not a sub-processor" });
    if (!p.where.trim()) out.push({ at: p.id, why: "processes somewhere unnamed, which is the first question a questionnaire asks" });
    if (!p.terms.trim()) out.push({ at: p.id, why: "has no processing terms — a sub-processor with none is one we may not use" });
  }
  return out;
}

/* ---------------------------------------------------- forced agreements --- */

/** The part of a legal document this file needs. Same reason as `Held`. */
export interface Agreed {
  readonly id: string;
  readonly mustAccept: readonly string[];
}

/**
 * ⚠️ THE DOCUMENTS THAT ARE NOT A PRODUCT DECISION, and the sentence beside each
 * is why it cannot be one.
 *
 * Every one of these is owed by operation of law rather than by taste, and each
 * is owed at a moment nobody notices: the first person signs in, the first
 * workspace records something about somebody who is not its own member. A
 * product ships without them because there was no point at which anything asked.
 */
export const REQUIRED_AGREEMENTS: Readonly<Record<string, string>> = {
  terms: "is the contract for the service itself, and without one nobody has agreed to anything",
  privacy: "is Articles 13 and 14 — somebody whose data is held has to be told what is held and why, and told BEFORE it is",
  dpa: "is Article 28 — a workspace records personal data about people who are not its members, so we process on its instruction, and those terms have to be a contract it entered rather than a page describing what we do",
};

/**
 * WHAT THE MANIFEST OWES GIVEN WHAT IT SAYS IT HOLDS.
 *
 * ⚠️ THE POINT IS THAT NONE OF THIS IS ASKED FOR SEPARATELY. `holding` is
 * declared per collection because a person has to say what a table is about;
 * everything here is READ OFF those declarations, so the commit that starts
 * holding health information is the commit that will not boot until an
 * assessment is owned and a processing agreement exists.
 */
export function agreementProblems(input: {
  readonly docs: readonly Agreed[];
  readonly collections: readonly Held[];
  readonly assessment: ProtectionSpec["assessment"];
}): readonly ProtectionProblem[] {
  const out: ProtectionProblem[] = [];
  const personal = input.collections.filter((c) => c.holding?.kind === "personal");
  const have = new Set(input.docs.map((d) => d.id));

  const owed = personal.length ? Object.keys(REQUIRED_AGREEMENTS) : ["terms"];
  for (const id of owed) {
    if (!have.has(id)) out.push({ at: id, why: `${REQUIRED_AGREEMENTS[id]}, and this manifest declares no such document` });
  }

  /*
    ⚠️ AND THE ASSESSMENT IS FORCED BY THE SAME DECLARATION. Article 35 turns on
    likelihood of high risk, and special-category data about identifiable people
    is its own trigger — so an app holding it and answering `required: false` is
    not making a judgement, it is making the one claim the collections in front
    of it contradict. The note stays free text because the reasoning is the whole
    value; what is refused is the answer, not the argument.
  */
  const special = personal.filter((c) =>
    c.holding.kind === "personal" && c.holding.categories.some((k) => SPECIAL_CATEGORIES.includes(k)));
  if (special.length && !input.assessment.required) {
    out.push({
      at: "assessment",
      why: `says none is required while ${special.map((c) => c.id).join(", ")} hold a special category — that is the Article 35 trigger, and the collections in front of it say so`,
    });
  }
  return out;
}

/* --------------------------------------------------- reached vs declared --- */

/**
 * ⚠️ THE THREE THIS PLATFORM REACHES WHATEVER AN APP DECLARES, named here so an
 * app cannot choose different words for them and end up with two entries for one
 * company on one list.
 *
 * They are constants rather than a declaration because they are not a decision
 * an app gets to make: every worker, database, object store and cache is one
 * vendor's, every message leaves through one mail lane, and every plan with a
 * price is settled on one rail. An app that could name its own would be an app
 * that could omit them.
 */
export const PLATFORM_INFRASTRUCTURE = "cloudflare";
export const PLATFORM_PAYMENTS = "stripe";

/**
 * ⚠️ EVERY COMPANY A DEPLOYMENT'S MAIL COULD BE HANDED TO — not the one it is
 * configured with today.
 *
 * The provider is chosen by CONFIGURATION rather than declared in a manifest, so
 * the compile-time answer to "who receives an address" is the whole set a
 * deployment may pick from. Disclosing only the one currently configured would
 * make the list a fact about one deployment's settings, changing silently when an
 * operator changes a dropdown.
 *
 * ⚠️ AND IT IS PINNED TO THE PROVIDER REGISTRY. `MAIL_HANDED_TO` in the runtime's
 * `mail.ts` is the same fact from the sending side, and `runtime/test/mail.test.ts`
 * asserts the two agree — because a provider is added in a file about HTTP and a
 * sub-processor is declared in a file about the law, which is exactly the pair
 * that drifts.
 */
export const MAIL_LANES: readonly string[] = ["cloudflare-email"];

/**
 * What a manifest structurally REACHES — read off its own declarations rather
 * than off anybody's memory.
 */
export interface Reaches {
  /** One per model in the catalogue, by the lane the model names. */
  readonly models: readonly string[];
  /** One per outbound service, by the key it is declared under. */
  readonly services: readonly string[];
  /** Whether anything this app sells has a price on it. */
  readonly charges: boolean;
}

/**
 * THE CHECK THAT MAKES THE LIST STAY RIGHT WITHOUT ANYBODY REVISITING IT.
 *
 * ⚠️ THIS IS THE HALF THAT SURVIVES THE QUARTER. Everything above refuses a
 * declaration that is internally wrong; this refuses one that is merely OUT OF
 * DATE — which is the state every sub-processor list in the world is in, because
 * nothing anywhere connects "we added a feature" to "we send data somewhere new".
 *
 * Here they are the same act. The only ways an app can reach a new recipient are
 * to add a model, declare a service host, or put a price on something, and all
 * three are declarations in the manifest — so the composition that adds one is
 * the composition that refuses to boot until the list says so.
 *
 * ⚠️ AND IT REFUSES THE OTHER DIRECTION TOO, which is the one people leave out.
 * A sub-processor nothing reaches is not harmless: it is a company we have told
 * customers receives their data, which is a disclosure that is false in the
 * direction that looks careful, and it is the entry nobody ever removes because
 * removing it feels like claiming less.
 */
export function disclosureProblems(
  reaches: Reaches,
  declared: readonly Subprocessor[],
): readonly ProtectionProblem[] {
  const need = new Map<string, string>();
  need.set(PLATFORM_INFRASTRUCTURE, "runs every worker, database, object store and cache this product is made of");
  for (const lane of MAIL_LANES) {
    need.set(lane, "is a mail lane this deployment may be configured with, so it may be handed the address a sign-in code goes to");
  }
  if (reaches.charges) need.set(PLATFORM_PAYMENTS, "settles the plans this manifest puts a price on");
  for (const m of reaches.models) need.set(m, "runs a model named in this manifest's catalogue");
  for (const s of reaches.services) need.set(s, "answers a lookup this manifest declares a host for");

  const out: ProtectionProblem[] = [];
  const have = new Set(declared.map((p) => p.id));
  for (const [id, why] of need) {
    if (!have.has(id)) out.push({ at: id, why: `${why}, and is declared nowhere — so somebody's data reaches a company no disclosure names` });
  }
  for (const p of declared) {
    if (!need.has(p.id)) {
      out.push({
        at: p.id,
        why: "is disclosed as receiving data and nothing in this manifest reaches it — a name on that list that is not true is a false disclosure in the direction that looks careful",
      });
    }
  }
  return out;
}

/* ------------------------------------------------------- the record --- */

export interface Activity {
  readonly collection: string;
  readonly purpose: string;
  readonly categories: readonly DataCategory[];
  readonly subjects: readonly SubjectKind[];
  readonly basis: LawfulBasis;
  readonly condition?: SpecialCondition;
  readonly special: boolean;
  /** From the collection's own retention. Null is "until the workspace leaves". */
  readonly keptForDays: number | null;
  readonly onClose: "purge" | "export-then-purge";
}

export interface Record30 {
  readonly controller: string;
  readonly contact: string;
  readonly activities: readonly Activity[];
  readonly subprocessors: readonly Subprocessor[];
  /** Where the data lives. From the manifest's regions, not from a document. */
  readonly regions: readonly string[];
  readonly assessment: ProtectionSpec["assessment"];
  /** ⚠️ True where any activity holds a special category — Article 35's trigger. */
  readonly special: boolean;
}

/**
 * The Article 30 record of processing activities, DERIVED.
 *
 * ⚠️ NOT A DOCUMENT SOMEBODY MAINTAINS. A record kept beside the code is one
 * that describes the product as it was when somebody last had time — and the
 * drift is invisible, because a processing activity missing from a record looks
 * exactly like one that does not happen. Every field here comes from a
 * declaration the product cannot run without.
 */
export function ropaOf(input: {
  readonly collections: readonly Held[];
  readonly protection: ProtectionSpec;
  readonly regions: readonly string[];
  /**
   * ⚠️ WHAT THE APP READS THROUGH THE VAULT, WHICH IS INVISIBLE TO THE
   * COLLECTIONS. A fact the app never stores appears in no collection — so an
   * app reading somebody's health data through a grant would produce a record
   * of processing saying it holds no health data. True, and completely
   * misleading, which is the worst kind of compliance document there is.
   *
   * Handed in rather than imported, for the same reason `Held` is a shape: this
   * module defines the vocabulary the vault's declarations are written in, and
   * importing back the other way would be a cycle.
   */
  readonly disclosed?: readonly {
    readonly fact: string;
    readonly purpose: string;
    readonly categories: readonly DataCategory[];
    readonly basis: LawfulBasis;
    readonly condition?: SpecialCondition;
    readonly subjects?: readonly SubjectKind[];
  }[];
}): Record30 {
  const fromVault = (input.disclosed ?? []).map((d): Activity => ({
    /* ⚠️ Named as a vault read rather than as a table, because it is not one —
       and a reader who cannot tell the two apart will go looking for a column. */
    collection: `vault:${d.fact}`,
    purpose: d.purpose,
    categories: d.categories,
    /* A fact belongs to the person whose account holds it, and that person is
       the workspace's customer wherever a workspace is reading it. */
    subjects: d.subjects ?? ["customer"],
    basis: d.basis,
    ...(d.condition ? { condition: d.condition } : {}),
    special: d.categories.some((k) => SPECIAL_CATEGORIES.includes(k)),
    /* ⚠️ NOT KEPT AT ALL — this app stores none of it. `0` rather than `null`,
       because null here means "until the workspace leaves" and that is the
       opposite claim. */
    keptForDays: 0,
    onClose: "purge",
  }));

  const activities = input.collections.flatMap((c): Activity[] => {
    const h = c.holding;
    if (h.kind === "none") return [];
    return [{
      collection: c.id,
      purpose: h.purpose,
      categories: h.categories,
      subjects: h.subjects,
      basis: h.basis,
      ...(h.condition ? { condition: h.condition } : {}),
      special: h.categories.some((k) => SPECIAL_CATEGORIES.includes(k)),
      keptForDays: c.retention.days,
      onClose: c.retention.onTenantClose,
    }];
  });
  const all = [...activities, ...fromVault];
  return {
    controller: input.protection.controller,
    contact: input.protection.contact,
    activities: all,
    subprocessors: input.protection.subprocessors,
    regions: input.regions,
    assessment: input.protection.assessment,
    special: all.some((a) => a.special),
  };
}

/* ----------------------------------------------------------- transfers --- */

/**
 * WHICH CATEGORIES CROSS WHICH BORDER, UNDER WHAT.
 *
 * ⚠️ THIS IS THE ONE ARTEFACT EVERY QUESTIONNAIRE ASKS FOR AND ALMOST NOBODY CAN
 * PRODUCE. "Do you transfer personal data outside the EEA, and on what basis" is
 * answerable only by joining what is HELD to who RECEIVES it, and the two live in
 * different documents in every company that has both — so the answer is written
 * from memory, once, and is wrong by the next feature.
 *
 * Here it is a join over two declarations the product cannot boot without.
 */
export interface Transfer {
  readonly to: string;
  readonly name: string;
  readonly where: string;
  readonly safeguard: Subprocessor["safeguard"];
  /**
   * ⚠️ WHAT THEY RECEIVE THAT THIS PRODUCT ACTUALLY HOLDS — the INTERSECTION,
   * not what the sub-processor's own entry claims. A recipient declaring it
   * receives `financial` in an app that holds none is over-disclosure, and it
   * makes the transfer look larger than it is in the direction nobody checks.
   */
  readonly categories: readonly DataCategory[];
  /** ⚠️ True where any of it is Article 9. It is the row a reviewer reads first. */
  readonly special: boolean;
  /** Whose data it is — a member's, a customer's, a visitor's. */
  readonly subjects: readonly SubjectKind[];
}

export function transfersOf(input: {
  readonly collections: readonly Held[];
  readonly subprocessors: readonly Subprocessor[];
}): readonly Transfer[] {
  const held = new Set<DataCategory>();
  const whose = new Map<DataCategory, Set<SubjectKind>>();
  for (const c of input.collections) {
    if (c.holding?.kind !== "personal") continue;
    for (const k of c.holding.categories) {
      held.add(k);
      const set = whose.get(k) ?? new Set<SubjectKind>();
      for (const s of c.holding.subjects) set.add(s);
      whose.set(k, set);
    }
  }

  return input.subprocessors.map((p) => {
    const categories = p.receives.filter((k) => held.has(k));
    const subjects = [...new Set(categories.flatMap((k) => [...(whose.get(k) ?? [])]))];
    return {
      to: p.id,
      name: p.name,
      where: p.where,
      safeguard: p.safeguard,
      categories,
      special: categories.some((k) => SPECIAL_CATEGORIES.includes(k)),
      subjects,
    };
  });
}

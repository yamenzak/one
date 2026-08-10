/**
 * GETTING STARTED — a checklist, and deliberately not a tour.
 *
 * Layer 3. Imports collection and primitives.
 *
 * ⚠️ AN ITEM IS DERIVED, A TOUR STEP IS TRACKED, AND THAT IS THE WHOLE ARGUMENT.
 *
 * "Add your first client" is answered by counting clients. It needs no
 * completion ledger, cannot drift from what is actually true, survives somebody
 * moving to another device, and un-checks itself if the thing is deleted. A tour
 * step can only ever record "seen", which is a fact about our interface rather
 * than about their progress — and somebody who dismissed it once dismissed it
 * forever, at the exact moment they had the least context to judge.
 *
 * A tour is also an interruption on a schedule the product chose. A checklist is
 * a surface: it waits, it shows progress, and it is still there when somebody
 * comes back.
 *
 * ⚠️ AND THE WIZARD IS THE SAME DECLARATION. `required: true` items are the ones
 * nothing works without; everything else is the checklist. One list split by a
 * field, because two systems is how the setup flow and the guidance come to
 * disagree about what a new workspace still needs.
 */

import type { CollectionSpec } from "./collection.js";

/* ------------------------------------------------------------ the answer --- */

/**
 * ⚠️ A CLOSED SET, AND EVERY MEMBER IS SOMETHING THE PLATFORM CAN COUNT.
 *
 * An escape hatch here — a predicate the app supplies — would be a step whose
 * answer nobody can check, cache or explain, and the first one written would be
 * a boolean somebody sets by hand. That is a tracked step with extra steps.
 */
export type Answer =
  /** Rows in a declared collection, optionally matching one field. */
  | {
      readonly kind: "collection";
      readonly collection: string;
      readonly atLeast: number;
      readonly where?: { readonly field: string; readonly equals: string | number | boolean };
    }
  /** Something the platform owns and the app cannot count for itself. */
  | { readonly kind: "platform"; readonly fact: PlatformFact };

/**
 * ⚠️ THE FACTS AN APP CANNOT SEE. A plan lives on the subscription, a passkey in
 * the identity store, a file in the media ledger, a colleague in the roster —
 * none of them is a collection, and every one of them is something a first-run
 * checklist has to be able to ask about.
 */
export type PlatformFact =
  | "plan_chosen"
  | "passkey_registered"
  | "file_stored"
  | "colleague_invited"
  /** ⚠️ The DEPLOYMENT's, not a workspace's — see `Setup`. */
  | "payments_configured";

/* ------------------------------------------------------------- the whose --- */

/**
 * ⚠️ WHOSE SETUP THIS IS, AND IT IS THREE THINGS PEOPLE KEEP CALLING ONE.
 *
 * A deployment is set up once by whoever runs it. A workspace is set up once by
 * whoever opened it. A person is set up once by themselves, every time a new one
 * arrives — and that third one is the one that gets built as the second: a
 * product ships a workspace wizard, then a customer signs up under a tenant and
 * is shown the workspace's checklist, which is already finished and none of
 * which was theirs.
 *
 * Naming the scope is also what makes a step ANSWERABLE. A deployment step has
 * no tenant to count rows in, and a person step counting the workspace's rows is
 * "done" the moment anybody else did it — which tells a new arrival their setup
 * is complete when they have done nothing at all.
 */
export type Setup = "deployment" | "workspace" | "person";

/* -------------------------------------------------------------- the step --- */

export interface GuideStep {
  readonly id: string;
  /** Imperative and short. "Add your first client", not "Client management". */
  readonly title: string;
  readonly body?: string;
  /** Who this is for. A step for everybody is one that is wrong for somebody. */
  readonly roles: readonly string[];
  /**
   * ⚠️ THE WIZARD IS `required: true`. Nothing works until these are true, so
   * they are shown as a blocking flow rather than a list. Everything else makes
   * the product good rather than possible.
   */
  readonly required: boolean;
  /**
   * ⚠️ WHOSE SETUP THIS IS. Defaults to the workspace — the common case, and the
   * one that is right when nobody thought about it.
   */
  readonly setup?: Setup;
  readonly answer: Answer;
  /**
   * The operation that satisfies it, so the item can offer the action rather
   * than describing where to find it.
   */
  readonly does?: string;
  readonly help?: string;
}

/**
 * ⚠️ THE ONE THING THAT IS TRACKED, AND WHY THERE ARE AT MOST FIVE.
 *
 * A hint is anchored to a surface and says something that is not derivable —
 * "swipe left to compare", "this updates every night". There is no state to
 * count, so dismissal is genuinely a fact about having seen it, which is exactly
 * the property that makes a tour bad. The cap is what stops that property being
 * used to rebuild a tour one hint at a time.
 */
export interface Hint {
  readonly id: string;
  /** A declared collection. A hint about a screen the app does not have is refused. */
  readonly surface: string;
  readonly body: string;
  readonly roles: readonly string[];
}

export const MAX_HINTS = 5;

export interface GuideSpec {
  readonly steps: readonly GuideStep[];
  readonly hints: readonly Hint[];
}

/* ------------------------------------------------------------- the check --- */

export interface GuideProblem {
  readonly id: string;
  readonly why: string;
}

/**
 * Everything wrong with an app's guidance, in one pass.
 *
 * ⚠️ A STEP THAT COUNTS A COLLECTION THE APP DOES NOT HAVE IS ANSWERED "NO"
 * FOREVER — so a new workspace is told to do something that cannot be done, and
 * a `required` one of those is a wizard nobody can finish.
 */
export function guideProblems(
  guide: GuideSpec,
  collections: readonly CollectionSpec[],
  operations: readonly string[],
  help: readonly string[],
  /**
   * ⚠️ WHAT THE REST OF THE MANIFEST MAKES POSSIBLE. A step asking somebody to
   * upload a file in an app that declares no file purposes has no upload surface
   * to use — the operations are not mounted at all — and a step asking somebody
   * to choose a plan in an app selling none is a question with no answers. Both
   * are unanswerable forever, and both look like a step nobody has got to yet.
   */
  offers: { readonly plans: number; readonly filePurposes: number } = { plans: 1, filePurposes: 1 },
): readonly GuideProblem[] {
  const known = new Set(collections.map((c) => c.id));
  const byId = new Map(collections.map((c) => [c.id, c]));
  const fields = new Map(collections.map((c) => [c.id, new Set(Object.keys(c.fields))]));
  const ops = new Set(operations);
  const articles = new Set(help);
  const out: GuideProblem[] = [];
  const seen = new Set<string>();

  for (const step of guide.steps) {
    const say = (why: string) => out.push({ id: step.id, why });
    if (seen.has(step.id)) say("is declared twice");
    seen.add(step.id);
    if (!step.title.trim()) say("has no title");
    if (step.roles.length === 0) say("is for nobody — a step with no audience is one nothing shows");

    const setup = step.setup ?? "workspace";

    if (step.answer.kind === "collection") {
      /*
        ⚠️ A DEPLOYMENT STEP HAS NO TENANT TO COUNT IN. The operator is not
        inside a workspace, so a row count there is a question about somebody
        else's data — answered by whichever workspace happened to be resolved,
        which is none of them.
      */
      if (setup === "deployment") say("is the deployment's, and counts rows in a workspace the operator is not in");
      if (!known.has(step.answer.collection)) say(`counts "${step.answer.collection}", which this app does not declare`);
      else if (step.answer.where && !fields.get(step.answer.collection)!.has(step.answer.where.field)) {
        say(`filters on "${step.answer.where.field}", which "${step.answer.collection}" does not have`);
      }
      /*
        ⚠️ AND A PERSON STEP COUNTING THE WORKSPACE'S ROWS IS DONE THE MOMENT
        ANYBODY ELSE DID IT. A new arrival is told their setup is complete when
        they have done nothing — which is the failure this scope exists to name,
        so it is refused rather than warned about.
      */
      if (setup === "person" && byId.get(step.answer.collection)?.scope.of !== "subject") {
        say(`is one person's, and counts a collection scoped to the whole workspace — done the moment anybody else did it`);
      }
      if (step.answer.atLeast < 1) say("is satisfied by nothing at all, so it is always done");
    }

    if (step.answer.kind === "platform") {
      if (step.answer.fact === "plan_chosen" && offers.plans === 0) {
        say("asks for a plan in an app that sells none, which is a question with no answers");
      }
      if (step.answer.fact === "file_stored" && offers.filePurposes === 0) {
        say("asks for a file in an app that declares no file purposes, so there is no upload surface to use");
      }
      /*
        ⚠️ THE DEPLOYMENT'S FACT IS THE DEPLOYMENT'S STEP. Asking a workspace
        whether the operator configured payments is showing somebody a task they
        cannot do and would not understand.
      */
      if (step.answer.fact === "payments_configured" && setup !== "deployment") {
        say("asks a workspace about the deployment's own configuration, which nobody in it can change");
      }
    }

    /*
      ⚠️ AN ACTION THAT DOES NOT EXIST IS A BUTTON THAT GOES NOWHERE, offered at
      the moment somebody is least able to work out what to do instead.
    */
    if (step.does && !ops.has(step.does)) say(`offers "${step.does}", which is not an operation`);
    if (step.help && !articles.has(step.help)) say(`links to help that does not exist`);
  }

  /*
    ⚠️ THE CAP IS THE FEATURE. A hint is the one tracked thing here, and tracked
    is exactly the property that makes a tour bad — so the number is bounded to
    stop a tour being rebuilt one hint at a time.
  */
  if (guide.hints.length > MAX_HINTS) {
    out.push({ id: "hints", why: `${guide.hints.length} declared, over the ${MAX_HINTS} cap — past that it is a tour` });
  }
  for (const hint of guide.hints) {
    if (!known.has(hint.surface)) out.push({ id: hint.id, why: `points at "${hint.surface}", which this app does not declare` });
    if (hint.roles.length === 0) out.push({ id: hint.id, why: "is for nobody" });
  }
  return out;
}

/* ------------------------------------------------------------ the answer --- */

export interface Progress {
  readonly id: string;
  readonly title: string;
  readonly body?: string;
  readonly done: boolean;
  readonly required: boolean;
  readonly setup: Setup;
  readonly does?: string;
  readonly help?: string;
}

/**
 * What one person still has to do.
 *
 * ⚠️ PURE. The counting happens elsewhere and arrives as a map, so the ordering,
 * the role filter and the blocking rule are testable without a database — and
 * the same function answers the wizard and the checklist, which is what stops
 * them disagreeing.
 *
 * ⚠️ REQUIRED FIRST, THEN DECLARED ORDER. A blocking step buried under optional
 * ones is a workspace that cannot proceed and cannot see why.
 */
export function progressFor(
  guide: GuideSpec,
  role: string,
  answered: Readonly<Record<string, boolean>>,
  /**
   * ⚠️ THE SCOPES THAT APPLY WHERE THIS IS BEING ASKED, not one of them. Inside
   * a workspace a person has their own setup AND the workspace's, and splitting
   * that into two requests is how a client ends up rendering one of them.
   */
  scopes: readonly Setup[] = ["workspace"],
): { readonly steps: readonly Progress[]; readonly blocking: readonly Progress[] } {
  const mine = guide.steps.filter((step) => step.roles.includes(role) && scopes.includes(step.setup ?? "workspace"));
  const steps = [...mine]
    .sort((a, b) => Number(b.required) - Number(a.required))
    .map((step) => ({
      id: step.id,
      title: step.title,
      ...(step.body ? { body: step.body } : {}),
      done: answered[step.id] ?? false,
      required: step.required,
      setup: step.setup ?? "workspace",
      ...(step.does ? { does: step.does } : {}),
      ...(step.help ? { help: step.help } : {}),
    }));
  return { steps, blocking: steps.filter((step) => step.required && !step.done) };
}

/* ------------------------------------------------------------ the wizard --- */

/**
 * ⚠️ THE WIZARD IS A PROJECTION OF THE CHECKLIST, NOT A SECOND LIST.
 *
 * Everything here is derived from `progressFor` — the same steps, the same
 * answers, the same role filter — narrowed to the `required` ones and given a
 * position. Two systems is how the setup flow and the guidance come to disagree
 * about what a new workspace still needs, and the disagreement is always
 * discovered by somebody stuck in the flow.
 */
export interface Wizard {
  readonly setup: Setup;
  readonly steps: readonly Progress[];
  /**
   * Where they are: the index of the first unfinished step, or `of` when there
   * is nothing left.
   *
   * ⚠️ THE FIRST UNFINISHED, NOT THE COUNT OF FINISHED ONES. Somebody who
   * satisfied step three out of order — a plan chosen from a pricing page, a
   * passkey added from a prompt — is at step one with step three already ticked,
   * and a position derived from a count would put them past work they have not
   * done.
   */
  readonly at: number;
  readonly of: number;
  readonly done: boolean;
}

export function wizardFor(
  guide: GuideSpec,
  role: string,
  answered: Readonly<Record<string, boolean>>,
  setup: Setup = "workspace",
): Wizard {
  const steps = progressFor(guide, role, answered, [setup]).steps.filter((step) => step.required);
  const at = steps.findIndex((step) => !step.done);
  return { setup, steps, at: at === -1 ? steps.length : at, of: steps.length, done: at === -1 };
}

/**
 * Which setup somebody is actually being walked through, of the ones that apply.
 *
 * ⚠️ THE OUTER ONE FIRST, AND THE ARGUMENT IS NOT ORDERING. A workspace that is
 * not set up blocks everybody in it, so finishing a person's own steps first
 * would walk somebody carefully through their profile inside a workspace that
 * cannot do anything yet. When every scope is finished the LAST is returned, so
 * a completed flow reports the innermost — the one whose "done" is theirs.
 */
export function wizardOf(
  guide: GuideSpec,
  role: string,
  answered: Readonly<Record<string, boolean>>,
  scopes: readonly Setup[],
): Wizard {
  const walks = scopes.map((setup) => wizardFor(guide, role, answered, setup));
  return walks.find((walk) => !walk.done) ?? walks[walks.length - 1] ?? wizardFor(guide, role, answered);
}

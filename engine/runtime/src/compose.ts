/**
 * A MANIFEST BECOMES A SURFACE.
 *
 * ⚠️ NOTHING IS REGISTERED. The routes, the CRUD operations, the permissions
 * they need and the quotas they count against are all derived from the
 * declarations — because a surface assembled by hand is one where an operation
 * exists and no route reaches it, and every suite stays green while it does.
 *
 * ⚠️ COMPOSITION IS LAZY, PER APP (D4). A request composes the app it is for and
 * no other. The alternative — building every app's table at module scope — puts
 * the whole catalogue in the startup CPU budget of every request to every
 * product, so the catalogue that was meant to grow is the thing that cannot.
 * The memo below is what makes the second request free.
 *
 * ⚠️ AND THE CRUD OPERATIONS ARE REAL OPERATIONS. They go through the same gate,
 * the same audit and the same problem catalogue as a hand-written one; a second
 * path for "the generated ones" is a second place every cross-cutting concern
 * has to be remembered (D12).
 */

import type {
  AnyOperation, AppSpec, CollectionSpec, CrudVerb, DocumentMove, Gate, Permission,
  ProblemCatalog,
} from "@engine/kernel";
import {
  PLATFORM_PROBLEMS, eraseBy, eventFor, field, moveEventFor, movesFor, offlineFor,
  operationsFor, permissionFor, routeFor,
} from "@engine/kernel";
import { tableFor } from "@engine/kernel";
import type { Db } from "./sql.js";
import {
  MOST_ROWS, list, patch, put, readOne, setAside, type VaultSeam, type WriteRefusal,
} from "./records.js";
import { move, seriesFor } from "./documents.js";
import { reachingBy } from "./reach.js";
import { memberOps } from "./member-ops.js";
import { packageOps } from "./packages.js";
import { settingOps } from "./settings.js";
import { vaultOps } from "./vault-ops.js";
import { mediaOps } from "./media-ops.js";
import { moneyOps } from "./money-ops.js";
import { aiOps } from "./ai-ops.js";
import { searchOps } from "./search-ops.js";
import { totalsOps } from "./totals-ops.js";
import { noteGone, noteWritten } from "./search.js";
import { centreOps } from "./centre-ops.js";
import { binOps } from "./bin-ops.js";
import { seriesOps } from "./series-ops.js";
import { progressOps } from "./progress.js";

/* ------------------------------------------------------------------ shape --- */

/**
 * What a handler is given.
 *
 * ⚠️ NO BINDING, NO ENV, NO REQUEST, AND NOT THE DIRECTORY. Its own tenant's
 * database, who is asking, the time, and a way to refuse. Anything more would
 * let an app reach around the platform, and the platform's guarantees would
 * become things apps opt into. `PlatformCtx` is the widened one, and only the
 * platform's own operations are handed it.
 */
export interface Ctx {
  readonly db: Db;
  readonly tenantId: string;
  readonly accountId: string | null;
  /**
   * ⚠️ A STRING, THE SAME AS `JobCtx.now`, AND THE UNIFICATION IS THE POINT. It
   * was a `Date` here and a string there — one word, two types, in one
   * framework — and the one a handler can write into a row is the string. D1
   * refuses an object outright, at runtime, with a message naming the VALUE
   * rather than the declaration: `D1_TYPE_ERROR: Type 'object' not supported`,
   * thrown from whichever statement happened to bind it. Every write in a
   * product 503s and nothing anywhere says why.
   *
   * ⚠️ ARITHMETIC IS `new Date(ctx.now)`, which is what the job side has always
   * done. That is one conversion at the two places that need one, against a trap
   * at every place that does not.
   */
  readonly now: string;
  /**
   * WHAT THIS WORKSPACE'S MONEY IS IN.
   *
   * ⚠️ `field.money` IS MINOR UNITS OF SOMETHING (D117), AND THIS IS THE
   * SOMETHING. A product holding two amounts in different currencies cannot add
   * them without knowing which one the books are kept in, and until this the
   * only place that knew was the surface — so an app doing the arithmetic would
   * have had to read the platform's own `tenant` table, which is the seam this
   * exists to keep closed.
   *
   * ⚠️ AND `""` IS A DEPLOYMENT THAT NEVER SET ONE, which every consumer already
   * reads as unconfigured. A handler that needs it refuses rather than guessing:
   * a guessed currency is a figure that is wrong by a factor nobody can see.
   */
  readonly currency: string;
  /** ⚠️ Refuse from inside a handler with a catalogue code, never a bare throw. */
  /**
   * ⚠️ `values` FILLS THE SENTENCE'S TOKENS; `fields` SAYS WHICH INPUT IS WRONG.
   * They are different things and conflating them loses the second: a refusal
   * about one field arrived as the catalogue's generic "check the highlighted
   * fields", with nothing highlighted, because the only channel for saying WHICH
   * was a token the copy did not contain. `Problem.fields` is what the edit
   * sheet reads (`refusedOn`), so a refusal that names a field lands on it.
   */
  /**
   * ⚠️ WHERE A SPECIAL CATEGORY GOES (D11). Absent means this deployment has not
   * bound a vault, and a write carrying one is REFUSED rather than written to
   * the column that exists — which is the whole failure the declaration exists
   * to prevent.
   */
  readonly vault?: VaultSeam;
  /**
   * HOW FAR THIS CALLER REACHES INSIDE THE WORKSPACE (`reach.ts`).
   *
   * ⚠️ `null` IS THE WHOLE WORKSPACE, WHICH IS EVERY PRODUCT THAT DECLARES NO
   * REACH AND EVERY MEMBER NOBODY HAS NARROWED. An array is the places this
   * person works in, with everything nested under a granted place already
   * spread into it — so a handler compares, and never walks.
   *
   * ⚠️ THE GENERATED CRUD APPLIES IT BY ITSELF; A HANDWRITTEN HANDLER MUST ASK.
   * That asymmetry is the whole risk of this feature and it is why
   * `scripts/reach.test.mjs` exists: a bespoke handler querying a table whose
   * collection declares `reachBy`, without this in the statement, is a screen
   * that narrows and a route that does not.
   */
  readonly reach: readonly string[] | null;
  /**
   * ⚠️ WHAT THIS WORKSPACE HAS SWITCHED ON, RESOLVED THROUGH THE ONE RESOLVER.
   * A setting no handler can read is a switch that changes nothing — somebody
   * presses it, it saves, it is drawn back to them, and they stop looking for
   * the thing it promised. That is the enforced half of the platform's own
   * bidirectional rule, and for as long as this was absent the whole settings
   * rail was the surfaced half with nothing under it.
   *
   * ⚠️ ASYNC AND MEMOISED PER REQUEST, not preloaded. Most operations read no
   * setting at all, and a query in front of every one of them to answer a
   * question almost nobody asks is a cost paid on the hot path for nothing.
   *
   * ⚠️ AND A MISSING ROW IS THE DECLARED FALLBACK, never `undefined` — the level
   * decides whose row is read, and the kernel's `valueOf` decides the value. A
   * handler inventing its own default is how a screen and a handler come to
   * disagree about what a workspace switched on.
   */
  readonly setting: (id: string) => Promise<unknown>;
  /**
   * ASK THE MODEL THIS OPERATION DECLARED (D19).
   *
   * ⚠️ THE HANDLER SUPPLIES VALUES AND NOTHING ELSE. Which model, whose words
   * and what it costs are all resolved from the declaration, the operator's
   * binding and the workspace's own choice — so a handler cannot name a model,
   * cannot skip the reserve, and cannot send instructions nobody agreed to. The
   * variables it fills are the ones the action declared; anything else was
   * refused at the edit.
   *
   * ⚠️ AND IT IS ONLY HERE FOR AN OPERATION THAT DECLARED `ai`. Calling it from
   * one that did not is a refusal rather than a run: an operation generating
   * text it never said it would generate is one whose cost appears on a bill
   * against an action nobody can find.
   *
   * ⚠️ IT REFUSES RATHER THAN THROWING, because every reason is one somebody can
   * act on — no model in the lane, an empty wallet, a provider that would not
   * answer — and a thrown error makes all three "something went wrong". A string
   * IS the refusal; the kernel's own catalogue turns it into a sentence.
   */
  readonly generate?: (
    values: Readonly<Record<string, string>>,
  ) => Promise<{ readonly text: string; readonly credits: number } | string>;
  /**
   * THE SAME RUN, HANDED OVER AS IT ARRIVES.
   *
   * ⚠️ IT ANSWERS WITH A `Response`, WHICH IS ALREADY A THING AN OPERATION MAY
   * RETURN — so streaming needed no second lane through the platform, and the
   * gates, the replay and the audit apply to it exactly as they do to a file
   * read. What the audit records is that the run was STARTED: whether it
   * finished is not known when the response is handed back, and claiming
   * otherwise would be the record saying something nobody checked.
   *
   * ⚠️ AND THE MONEY IS STILL `generate`'s. The hold, the release, the charge
   * and the row all live in one function with the non-streamed path, because a
   * streaming lane that kept its own copy of them is a lane that generates
   * perfectly good output and bills nobody — see `scripts/metering.test.mjs`.
   */
  readonly stream?: (
    values: Readonly<Record<string, string>>,
  ) => Promise<Response | string>;
  readonly fail: (
    code: string,
    values?: Record<string, string | number>,
    extra?: { readonly fields?: Readonly<Record<string, string>>; readonly ref?: string },
  ) => never;
}

export interface Resolved {
  readonly id: string;
  readonly kind: "read" | "write";
  readonly method: string;
  readonly path: string;
  readonly permission: Permission;
  readonly spec: AnyOperation;
  readonly run: (ctx: Ctx, input: Record<string, unknown>) => Promise<unknown>;
  /**
   * ⚠️ THE GENERATED VERBS CHECK THEIR OWN INPUT, AND THEY HAVE TO. A create
   * demands every required field and an update must not — an edit that had to
   * resend a body to rename a note is not an edit — and `records.ts` is where
   * that difference already lives, together with the vault rules a door cannot
   * see. Everything else is checked ONCE, at the door, against what it
   * declared.
   */
  readonly generated?: true;
}

export interface Composed {
  readonly app: AppSpec;
  readonly byId: ReadonlyMap<string, Resolved>;
  readonly catalog: ProblemCatalog;
  readonly gates: readonly Gate[];
}

/* ------------------------------------------------------------------- crud --- */

/**
 * ⚠️ A GENERATED OPERATION DECLARES ITSELF EXACTLY LIKE A WRITTEN ONE, so
 * everything downstream — the gate, the audit, the tool catalogue, the OpenAPI
 * entry — reads one shape. The moment generated operations carried less, every
 * one of those would need a branch, and a branch is where a concern goes missing.
 */
/**
 * ⚠️ A SUBJECT-SCOPED COLLECTION IS THE CALLER'S OWN RECORDS, AND THAT IS THE
 * WHOLE ANSWER. The generated verbs filter by whoever is asking, so a person's
 * own logbook is theirs by construction rather than by a handler remembering to
 * add a `WHERE`. Seeing SOMEBODY ELSE'S is a different question with a different
 * permission, and it is an operation the app declares — which is right: the
 * platform can say "yours", but only a product knows who else may look.
 */
const scopeOf = (spec: CollectionSpec, ctx: Ctx): string =>
  eraseBy(spec)?.of === "subject" ? (ctx.accountId ?? "") : ctx.tenantId;

function crudFor(
  spec: CollectionSpec, verb: CrudVerb, appId: string, places = "places",
): Resolved {
  const id = `${spec.id}.${verb}`;
  const kind = verb === "list" || verb === "read" ? "read" as const : "write" as const;

  const operation: AnyOperation = {
    id,
    kind,
    summary: verbSummary(spec, verb),
    /*
      ⚠️ A LIST TAKES THREE, AND THEY ARE THE ONLY GENERATED INPUTS THAT ARE NOT
      THE COLLECTION'S OWN FIELDS. `where` is equality over declared fields —
      narrowed and sanitised by `records.ts`, so what arrives here is a blob and
      what reaches SQL is a column name the declaration carries. `after` is the
      previous page's `next`, opaque. `limit` is bounded on the way in.
    */
    /* ⚠️ AN UPDATE DOES NOT ADVERTISE A FIELD IT WILL REFUSE — see
       `FieldSpec.settled`. `patch` is what ENFORCES it (the door's own input
       check skips generated operations), but the tool catalogue, the OpenAPI and
       the MCP surface are all built from this, and an agent offered a key that is
       always refused will keep sending it. */
    input: verb === "create"
      ? spec.fields
      : verb === "update"
        ? Object.fromEntries(
          Object.entries(spec.fields).filter(([, one]) => !one.settled))
      : verb === "list"
        ? {
          limit: field.number({ label: "How many", holds: "none", min: 1, max: MOST_ROWS }),
          after: field.text({ label: "After", holds: "none", max: 120 }),
          where: field.json({ label: "Narrowed to", holds: "none" }),
        }
        : {},
    output: {},
    permission: permissionFor(spec, verb),
    /*
      ⚠️ A WRITE A PHONE MAY HOLD IS A WRITE THAT CAN ARRIVE TWICE, and the
      declaration that permits the first is what makes the second safe. A queued
      call cannot know whether its first attempt landed — the ANSWER went
      missing, not the request — so it asks again, and with `none` a shelf
      counted once in a basement is counted twice when the signal comes back.
      Derived from `offline` rather than declared beside it, because two fields
      that have to agree are two fields that will not.

      ⚠️ AND IT CHANGES NOTHING ONLINE. `mode: "key"` with no `idempotency-key`
      header resolves no replay key at all, so an ordinary call behaves exactly
      as it did — the header is the browser's, attached only to what it held.
    */
    idempotency: offlineFor(spec, verb) === "queue" ? { mode: "key" } : { mode: "none" },
    /* ⚠️ Only a create counts against a ceiling. An update of an existing record
       does not consume another one, and charging for it would make editing a
       note cost the same as making one. */
    ...(verb === "create" && spec.quota ? { quota: spec.quota } : {}),
    ...(kind === "write" ? { emits: [eventFor(spec, verb)] } : {}),
    async handler() { return {} as never; },
  } as AnyOperation;

/**
 * ⚠️ ONE PLACE TURNS A WRITE REFUSAL INTO A PROBLEM. `create` and `update` each
 * had their own mapping, and they had already drifted: `update` answered
 * `not_found` where `create` could not, and both passed a `detail` into the
 * VALUES slot — which fills tokens in the catalogue's sentence and is not a
 * detail at all, so every one of them was discarded. Somebody was told to
 * "check the highlighted fields" with nothing highlighted.
 *
 * ⚠️ AND A REFUSAL ABOUT A FIELD LANDS ON THE FIELD. `Problem.fields` is what
 * the edit sheet reads, so the sentence appears under the input that caused it
 * rather than over the whole form.
 */
function refuse(
  ctx: Pick<Ctx, "fail">, done: WriteRefusal, spec: CollectionSpec, places = "places",
): never {
  if (done.why === "not_found") ctx.fail("platform.not_found");
  /* ⚠️ NOT `not_found`, AND NOT `invalid`. The record's workspace is the
     caller's and the PLACE is not theirs — so the honest sentence names the
     thing they work in, and the field it names is the one they picked. */
  if (done.why === "out_of_reach") {
    ctx.fail("platform.out_of_reach", { places },
      { fields: { [spec.reachBy ?? "id"]: "You do not work there." } });
  }
  /* ⚠️ A SETTLED FIELD NAMES ITSELF, so the sentence lands under the control the
     caller touched rather than over the form. It is the one refusal here whose
     cause is a specific field the caller chose, and burying it in a general
     "that does not look right" would leave them re-reading a form that is
     correct. */
  if (done.why === "settled") {
    ctx.fail("platform.invalid", {},
      { fields: Object.fromEntries(done.names.map((f) => [f, done.detail])) });
  }
  /* ⚠️ NOT `invalid`, AND THE SENTENCE IS THE POINT. Nothing the caller typed is
     wrong — the record has been committed to — so "check the highlighted fields"
     would send them back over a form that is correct. */
  if (done.why === "not_a_draft") {
    ctx.fail("platform.not_a_draft", { standing: done.standing, detail: done.detail });
  }
  /* ⚠️ AND A RING NAMES THE FIELD THAT WOULD CLOSE IT, because the caller picked
     a real record and the fault is the relationship rather than the value. */
  if (done.why === "cycles") {
    ctx.fail("platform.cycles", { detail: done.detail },
      { fields: { [done.field]: done.detail } });
  }
  const named = done.why === "vault_only"
    ? Object.keys(spec.fields).filter((f) => spec.fields[f]?.vault)
    : [];
  return ctx.fail("platform.invalid", {}, named.length
    ? { fields: Object.fromEntries(named.map((f) => [f, done.detail ?? ""])) }
    : {});
}


  const run = async (ctx: Ctx, input: Record<string, unknown>): Promise<unknown> => {
    const scope = scopeOf(spec, ctx);
    /* ⚠️ APPLIED BY THE GENERATED PATH ITSELF, so a collection that says where
       its records are is narrowed on every one of its five operations with
       nothing for an app to remember. What is NOT automatic is a handwritten
       handler over the same table — see `Ctx.reach`. */
    const reaching = reachingBy(spec.reachBy, ctx.reach);
    switch (verb) {
      case "list": {
        /*
          ⚠️ THE THREE THINGS A LIST CAN BE ASKED, AND EVERY ONE IS OPTIONAL. The
          default is what this always did — fifty rows, newest first, the whole
          collection — so a screen that asks nothing gets exactly what it got
          before. What is new is that it can ask, and that it is TOLD the total:
          a page of fifty out of two hundred was indistinguishable from a
          collection of fifty, and the screen drawing it said "fifty products"
          with complete confidence.
        */
        return list(ctx.db, spec, scope, {
          ...(input.limit === undefined ? {} : { limit: Number(input.limit) }),
          ...(typeof input.after === "string" ? { after: input.after } : {}),
          ...(input.where && typeof input.where === "object"
            ? { where: input.where as Record<string, unknown> }
            : {}),
        }, reaching);
      }
      case "read": {
        const row = await readOne(ctx.db, spec, scope, String(input.id ?? ""), reaching);
        if (!row) ctx.fail("platform.not_found");
        return row;
      }
      case "create": {
        const done = await put(ctx.db, spec, scope, input, ctx.accountId, new Date(ctx.now),
          ctx.vault, reaching);
        if ("why" in done) refuse(ctx, done, spec, places);
        /* ⚠️ MARKED HERE RATHER THAN IN THE JOB, because only the write knows a
           write happened. A job that scanned for un-indexed rows would have to
           read every record of every searchable collection every night to find
           the handful that changed. `noteWritten` returns immediately for a
           collection that is not searchable. */
        await noteWritten(ctx.db, spec, appId, scope, done.id, new Date(ctx.now));
        return done;
      }
      case "update": {
        /* ⚠️ ONE STATEMENT, SCOPED IN ITS OWN `WHERE` — see `patch`. A read to
           check ownership followed by a write leaves a window between them, and
           this operation used to be the read WITHOUT the write: it answered 200
           with the id and changed nothing. */
        const done = await patch(ctx.db, spec, scope, String(input.id ?? ""),
          input, ctx.accountId, new Date(ctx.now), ctx.vault, reaching);
        if ("why" in done) refuse(ctx, done, spec, places);
        /* ⚠️ RE-INDEXED ON EVERY EDIT, INCLUDING ONE THAT CHANGED NOTHING — see
           `noteWritten`. An index that only tracked edits it could prove were
           relevant is one that silently drifts. */
        await noteWritten(ctx.db, spec, appId, scope, done.id, new Date(ctx.now));
        return done;
      }
      case "delete": {
        /*
          ⚠️ IT GOES IN THE BIN, IT IS NOT DESTROYED — see `Aside`. Somebody
          presses this on the wrong row of a list at eleven at night; a hard
          `DELETE` makes that unrecoverable from anywhere except a backup nobody
          has ever restored. The record leaves every list in the product and
          there are thirty days in which it can be brought back.

          ⚠️ AND THE VERB KEEPS ITS NAME. Renaming it `bin` would make every
          screen, every agent and every offline queue that calls `x.delete`
          wrong at once — to rename a thing whose PURPOSE is unchanged. A person
          pressing delete means "get this out of my way", and where the row
          physically sits between now and the sweep is not their business.

          ⚠️ ONE STATEMENT, SCOPED AND REACHED IN ITS OWN `WHERE` — see
          `setAside`. A read to check ownership followed by a write leaves a
          window between them, and this was the one verb whose statement carried
          the scope and not the reach.
        */
        if (!await setAside(
          ctx.db, spec, scope, String(input.id ?? ""), "binned", new Date(ctx.now), reaching,
        )) {
          ctx.fail("platform.not_found");
        }
        /* ⚠️ MARKED GONE, NOT FORGOTTEN. The ledger row is the only handle on the
           item in the index — dropping it here would leave a deleted record
           findable by meaning with nothing anywhere pointing at it. */
        await noteGone(ctx.db, spec, appId, String(input.id), new Date(ctx.now));
        return { id: String(input.id) };
      }
    }
  };

  return {
    id, kind, ...routeFor(operation), permission: operation.permission,
    spec: operation, run, generated: true,
  };
}

const verbSummary = (spec: CollectionSpec, verb: CrudVerb): string => {
  const one = spec.label.one.toLowerCase();
  const many = spec.label.many.toLowerCase();
  switch (verb) {
    case "list": return `Every ${one} here.`;
    case "read": return `One ${one}.`;
    case "create": return `Add a ${one}.`;
    case "update": return `Change a ${one}.`;
    case "delete": return `Remove a ${one} from ${many}.`;
  }
};

/* --------------------------------------------------------------- composing --- */

/**
 * ⚠️ KEYED BY THE MANIFEST ITSELF, NOT BY ITS ID. Both are memos of the same
 * work; only one of them can be wrong. An id key answers "some declaration that
 * called itself `notes`", which is the right answer for as long as there is
 * exactly one — and a silently wrong surface the moment there are two. A key
 * that IS the declaration cannot mistake one for another, so nothing has to
 * invalidate it and no suite has to remember to.
 *
 * ⚠️ WHICH MEANS THE DEPLOYMENT HOLDS ITS MANIFESTS. A thunk that rebuilds the
 * declaration per call would miss this memo every time — see `once` in the
 * worker, where a product's manifest is built at most once per isolate.
 */
/**
 * THE THREE A DOCUMENT GETS: commit to it, withdraw it, correct it.
 *
 * ⚠️ GENERATED FROM THE DECLARATION LIKE THE CRUD IS, AND THAT IS THE WHOLE
 * ARGUMENT FOR THE RAIL. An app writing its own submit is an app deciding for
 * itself whether a cancelled document can be submitted again, whether an
 * amendment needs a cancellation first, and whether a number is taken before or
 * after the row moves. Three apps writing it are three answers, and the one that
 * is wrong is wrong quietly.
 *
 * ⚠️ AND IT IS `write`, NEVER ITS OWN PERMISSION. Somebody who may edit a draft
 * is somebody the workspace trusts with the record; a fourth permission would be
 * one more thing to grant and one more way to end up with a person who can fill
 * an invoice in and not issue it. Where a business wants that split it is a role
 * question, and roles are the app's.
 */
function moveOp(
  spec: CollectionSpec, what: DocumentMove, places: string,
): Resolved {
  const one = spec.label.one.toLowerCase();
  const operation: AnyOperation = {
    id: `${spec.id}.${what}`,
    kind: "write",
    summary: what === "submit"
      ? `Commit to a ${one}. It takes its number and stops being editable.`
      : what === "cancel"
        ? `Withdraw a ${one} that was committed to.`
        : `Copy a cancelled ${one} into a new draft.`,
    input: {},
    output: {},
    permission: permissionFor(spec, "update"),
    /*
      ⚠️ NEVER QUEUED, WHATEVER THE COLLECTION SAYS ABOUT BEING OFFLINE. A queued
      submit is a number taken when the signal comes back rather than when the
      person pressed the button — so two people working offline in one warehouse
      would issue documents in an order neither of them chose, and the one whose
      phone reconnected first would take the earlier number. Committing to
      something is the moment the network has to be there for.
    */
    idempotency: { mode: "none" },
    emits: [moveEventFor(spec, what)],
    async handler() { return {} as never; },
  } as AnyOperation;

  const run = async (ctx: Ctx, input: Record<string, unknown>): Promise<unknown> => {
    /*
      ⚠️ READ ON THE SUBMIT PATH RATHER THAN CACHED, and it costs one row. A
      workspace's numbering is edited from a settings screen by one person and
      read by everybody, so a cache would hold the old format for whoever had
      the app open — and the document they raise next carries a number the
      workspace stopped using, permanently, in a run an auditor reads.

      ⚠️ AND ONLY FOR A SUBMIT. A cancel and an amendment take no number, so
      asking would be a query to answer a question nothing is about to use.
    */
    const chosen = what === "submit"
      ? await seriesFor(ctx.db, ctx.tenantId, spec.id)
      : null;
    const done = await move(
      ctx.db, spec, scopeOf(spec, ctx), String(input.id ?? ""), what,
      {
        now: ctx.now, by: ctx.accountId ?? null, tenantId: ctx.tenantId,
        ...(chosen ? { series: chosen } : {}),
      });

    if ("why" in done) {
      if (done.why === "not_found") ctx.fail("platform.not_found");
      /*
        ⚠️ THE LADDER'S REFUSAL REACHES THE PERSON AS A SENTENCE ABOUT WHERE THE
        DOCUMENT IS, not as a code. Somebody pressing Submit on something a
        colleague submitted a moment ago needs to be told it is already done —
        "that did not work" would send them looking for a fault that is not
        there.
      */
      if (done.why === "unnumbered") {
        ctx.fail("platform.invalid", {},
          { fields: { series: "This workspace's numbering cannot be read. Check it in settings." } });
      }
      ctx.fail("platform.conflict", { was: SAYS[done.because] ?? done.standing });
    }
    return done;
  };
  void places;
  /* ⚠️ `generated: true` LIKE THE CRUD, WHICH IS WHAT KEEPS THE DOOR'S OWN INPUT
     CHECK OFF IT. A move takes an id and nothing else; the operation that
     validates a body against declared fields would find none and refuse. */
  return {
    id: operation.id, kind: "write", ...routeFor(operation),
    permission: operation.permission, spec: operation, run, generated: true,
  };
}

/**
 * ⚠️ THE REFUSAL IN THE WORDS OF WHAT HAPPENED. `mayMoveDocument` answers with a
 * reason a programmer reads; this is the half a person does, and it lives beside
 * the operation rather than on a screen so that every surface — the app, an
 * agent, the API — is told the same thing.
 */
const SAYS: Readonly<Record<string, string>> = {
  already_submitted: "already submitted",
  not_submitted: "still a draft",
  already_cancelled: "already cancelled",
  amend_before_cancel: "still standing — cancel it first",
  not_amendable: "not something that can be amended",
  never_cancellable: "not something that can be withdrawn",
};

const MEMO = new WeakMap<AppSpec, Composed>();

export function compose(app: AppSpec): Composed {
  const seen = MEMO.get(app);
  if (seen) return seen;

  const byId = new Map<string, Resolved>();
  for (const spec of app.collections) {
    for (const opId of operationsFor(spec)) {
      const verb = opId.slice(spec.id.length + 1) as CrudVerb;
      /* ⚠️ THE PRODUCT'S OWN WORD FOR A PLACE, so the refusal reads "that is not
         one of your sites" rather than naming a concept nobody outside this
         codebase has heard of. */
      byId.set(opId, crudFor(spec, verb, app.id, app.reach?.label.many.toLowerCase() ?? "places"));
    }
    /* ⚠️ AND THE THREE A DOCUMENT GETS ON TOP — see `moveOp`. Empty for every
       collection that is not one, which is most of them. */
    for (const opId of movesFor(spec)) {
      const what = opId.slice(spec.id.length + 1) as DocumentMove;
      byId.set(opId, moveOp(spec, what, app.reach?.label.many.toLowerCase() ?? "places"));
    }
  }
  /*
    ⚠️ THE ROSTER IS THE PLATFORM'S AND EVERY APP HAS IT (see `member-ops.ts`).
    Merged OVER the app's own, so an app cannot shadow "invite a colleague" with
    something that skips the two doors bounding it. The package rail (D16) rides
    the same rule: what a purchase grants is not an app's to redeclare.

    ⚠️ WHICH IS ALSO A WAY TO DELETE A PRODUCT'S OWN OPERATION WITHOUT NOTICING.
    The merge is silent: a platform id equal to a generated one replaces it, the
    route still answers, and what it answers is the wrong thing. It happened —
    a platform `product.list` took over the list of things on a workspace's
    shelves — so the collision is refused here rather than resolved.

    ⚠️ THE APP'S IDS ARE READ BEFORE THE MERGE, because after it there is nothing
    left to compare against; that is the whole shape of the fault.
  */
  const declared = new Set(byId.keys());
  const shadowed: string[] = [];
  const put = (from: Readonly<Record<string, Resolved>>) => {
    for (const [id, resolved] of Object.entries(from)) {
      if (declared.has(id)) shadowed.push(id);
      byId.set(id, resolved);
    }
  };
  put(memberOps(app));
  put(packageOps(app));
  put(settingOps(app));
  put(moneyOps(app));
  /* ⚠️ THROUGH THE MERGE RATHER THAN BESIDE IT, BECAUSE `read` IS A CRUD VERB. A
     collection called `tally` generates `tally.read` of its own, and the two
     would silently be one — the count of everything answering at the address of
     one record. `put` is what refuses that instead of resolving it. */
  put(totalsOps(app));
  if (shadowed.length) {
    throw new Error(
      `${app.id}: the platform's ${shadowed.join(", ")} would replace an operation this app `
      + "declares. Rename the collection, or the platform operation — a merge that wins "
      + "silently answers the wrong thing at the right address.",
    );
  }
  /* ⚠️ ONLY WHERE THE APP DECLARES A GENERATING ACTION — `aiOps` returns nothing
     otherwise. A product with nothing to generate should not answer two routes
     about which model does it. */
  for (const [id, resolved] of Object.entries(aiOps(app))) byId.set(id, resolved);
  /* ⚠️ ONLY WHERE A COLLECTION SAID `searchable` — see `searchOps`. A find
     endpoint over a product that indexes nothing answers "no results" for every
     query, which reads as a broken search rather than an absent one. */
  for (const [id, resolved] of Object.entries(searchOps(app))) byId.set(id, resolved);
  for (const [id, resolved] of Object.entries(centreOps(app))) byId.set(id, resolved);
  /* ⚠️ ONLY WHERE THERE IS A COLLECTION TO BIN ANYTHING FROM — see `binOps`. An
     app whose whole surface is hand-written operations has no generated delete,
     so a trash over it would be a screen that is empty for ever. */
  if (app.collections.length) {
    for (const [id, resolved] of Object.entries(binOps(app))) byId.set(id, resolved);
  }
  /* ⚠️ ONLY WHERE SOMETHING IS NUMBERED — see `seriesOps`. An app with no
     documents would answer two routes about a numbering it does not do, and a
     settings screen listing nothing reads as one that failed to load. */
  if (app.collections.some((c) => c.document)) {
    for (const [id, resolved] of Object.entries(seriesOps(app))) byId.set(id, resolved);
  }
  /* ⚠️ ONLY WHERE THERE IS A CHECKLIST OR SOMETHING TO CONGRATULATE. An app
     declaring neither would answer two routes about a guide it does not have —
     an empty checklist reads as one that is broken rather than absent. */
  if (Object.keys(app.guide ?? {}).length || Object.keys(app.milestones ?? {}).length) {
    for (const [id, resolved] of Object.entries(progressOps(app))) byId.set(id, resolved);
  }
  /* ⚠️ ONLY WHERE THERE IS SOMETHING TO CONSENT TO. An app that declares no
     purposes and no vault fields would otherwise answer eight routes about
     facts it does not hold, and a consent sheet with nothing on it reads as a
     product that asked and was told yes. */
  if (Object.keys(app.purposes ?? {}).length || Object.keys(app.vault ?? {}).length) {
    for (const [id, resolved] of Object.entries(vaultOps(app))) byId.set(id, resolved);
  }
  /* ⚠️ AND ONLY WHERE THERE IS SOMEWHERE TO PUT A FILE. Three routes about files
     on a product that holds none answer "no bucket" for ever, which reads as a
     broken feature rather than an absent one. */
  if (app.collections.some((c) => Object.values(c.fields).some((f) => f.kind === "media"))) {
    for (const [id, resolved] of Object.entries(mediaOps(app))) byId.set(id, resolved);
  }

  for (const spec of app.operations) {
    byId.set(spec.id, {
      id: spec.id,
      kind: spec.kind,
      ...routeFor(spec),
      permission: spec.permission,
      spec,
      run: (ctx, input) => spec.handler(ctx, input as never) as Promise<unknown>,
    });
  }

  const composed: Composed = {
    app,
    byId,
    catalog: { ...PLATFORM_PROBLEMS, ...(app.problems ?? {}) },
    gates: [],
  };
  MEMO.set(app, composed);
  return composed;
}

/**
 * ⚠️ EVERY ROUTE THE DEPLOYMENT ANSWERS, derived. This is what the OpenAPI
 * document, the typed client and the tool catalogue are all written from — one
 * source, so a route that exists and is undocumented is not a state that can be
 * reached.
 */
export const surfaceOfComposed = (composed: Composed): readonly Resolved[] =>
  [...composed.byId.values()].sort((a, b) => (a.id < b.id ? -1 : 1));

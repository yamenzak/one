/**
 * THE ROSTER, WHICH EVERY APP HAS AND NO APP DECLARES.
 *
 * ⚠️ MEMBERSHIP IS THE PLATFORM'S, NOT A PRODUCT'S. An app that had to declare
 * "invite a colleague" would be an app that could declare it differently — and
 * the two doors that bound an invitation (you may not grant what you do not
 * hold; an invitation takes a seat before it is answered) would then be two
 * doors per product, each of which somebody could leave open. A previous
 * platform shipped exactly that: the function that bounds a role assignment
 * existed and had no caller at all, so the way to become an owner was to invite
 * a second address of your own as one.
 *
 * ⚠️ THESE RUN WITH MORE THAN A HANDLER GETS. They write the directory's
 * invitation index as well as the workspace's own roster, which is a reach an
 * app handler deliberately does not have — so they are marked, and the extra
 * context is passed only to them.
 */

import type { Allowance, AppSpec, Channel, PlanSpec, RoleRegistry, TenantId, Theme } from "@engine/kernel";
import { PUBLIC, SURFACES, refusePolicy, seatsUsed, withinQuota } from "@engine/kernel";
import { brandingOf, setBranding } from "./branding.js";
import { LEAST_SIDE, MOST_BYTES, MOST_SIDE, forgetIcon, hasIcon, setIcon } from "./icon.js";
import { noteInvitation, tenantById } from "./directory.js";
import { inboxOf, markSeen, policyOf, preferenceOf, setPolicy, setPreference, unseenCount } from "./inbox.js";
import { invite, membersOf, remove, rolesFor, setAppRole, setPlatformRole } from "./membership.js";
import type { Ctx, Resolved } from "./compose.js";
import type { Db } from "./sql.js";
import type { Bucket } from "./storage.js";

/**
 * ⚠️ WHAT A PLATFORM OPERATION SEES THAT AN APP'S DOES NOT. Widening `Ctx`
 * itself would hand every app handler the directory, and then "the handler never
 * reaches around the platform" would be a convention rather than a shape.
 */
export interface PlatformCtx extends Ctx {
  readonly directory: Db;
  readonly permissions: ReadonlySet<string>;
  /**
   * ⚠️ THE CALLER'S KEYS IN ANOTHER CONTEXT (D15). `permissions` is this
   * operation's own app; assigning a role in app B from app A's roster screen
   * has to be bounded by what the assigner holds IN B, and only the deployment
   * can resolve that.
   */
  readonly permissionsIn: (appId: string | null) => Promise<ReadonlySet<string>>;
  /**
   * ⚠️ ANOTHER APP'S MANIFEST, RESOLVED BY THE DEPLOYMENT. One invitation may
   * assign roles in several products (that is the point of one roster), and the
   * Money area answers for every enabled product at once — both need what only
   * the deployment holds. `null` for an app it does not serve.
   */
  readonly appOf: (appId: string) => AppSpec | null;
  /** Which products this workspace has switched on. */
  readonly enabledApps: readonly string[];
  readonly email: string | null;
  readonly allowance: (key: string) => Allowance;
  /**
   * ⚠️ THE BUCKET FOR THIS WORKSPACE'S JURISDICTION, AND THE RESIDENCY IS IN THE
   * ADDRESSING. An EU workspace resolves the EU bucket because the binding's
   * name carries its residency — so there is no check anybody can forget, and a
   * lookup that lands in the wrong regime misses entirely rather than serving
   * quietly from the wrong one.
   *
   * ⚠️ NULL IS AN ANSWER. A deployment whose bucket the reconciler has not made
   * live yet stores no files, which every caller refuses on rather than throws.
   */
  readonly bucket?: Bucket | null;
  /**
   * ⚠️ WHAT THIS DEPLOYMENT CAN ACTUALLY DELIVER A NOTIFICATION ON. Only the
   * deployment knows — a mailer and a push keypair are bindings, not
   * declarations — and both notification settings screens draw their switches
   * from it. The two of them had `["inbox", "email", "push"]` written out in the
   * page, so a workspace could switch on a channel nothing could send, and the
   * only symptom is somebody waiting for an email that was never attempted.
   */
  readonly channels: readonly Channel[];
  /**
   * ⚠️ THE ORIGIN THIS REQUEST ARRIVED AT, AND ITS SLUG, so a page somebody is
   * sent AWAY to knows how to send them back. A constant here would return an EU
   * workspace on its own domain to somebody else's hostname — and the doors ARE
   * the tenancy, so the address is a fact about the request rather than about
   * the deployment.
   */
  readonly origin: string;
  readonly slug: string | null;
  /**
   * ⚠️ THE DEPLOYMENT'S CATALOGUE. One membership covers every product, so the
   * plans are the deployment's — an app reading its own would be reading a list
   * that no longer exists.
   */
  readonly plans: readonly PlanSpec[];
  /**
   * ⚠️ WHAT A STORED CREDENTIAL IS ENCRYPTED UNDER — see `config.ts`. Absent is a
   * deployment that holds no keys, and every lane behind one refuses rather than
   * running on a value it could not read.
   */
  readonly configSecret?: string;
}

const asPlatform = (ctx: Ctx): PlatformCtx => ctx as PlatformCtx;

/**
 * The roster operations, derived from the app's own access declaration.
 *
 * ⚠️ THE SEAT CEILING COMES FROM THE ENTITLEMENT THE APP NAMED, so a product
 * that sells seats differently sells them by declaring it rather than by writing
 * this again.
 */
export function memberOps(app: AppSpec): Readonly<Record<string, Resolved>> {
  const seats = app.access.seats;

  /*
    ⚠️ THE TWO HALVES OF EVERY BOUNDED ASSIGNMENT (D15). The granter's keys are
    resolved PER AUTHORITY — their platform keys for the platform role, their
    keys IN EACH APP for that app's role — and each app's role is validated
    against that app's own registry, custom roles included. This app's registry
    comes from its manifest; any other's comes from the deployment.
  */
  /* ⚠️ The platform keys are resolved in NO app's context — `ctx.permissions`
     is this operation's own app and carries that app's role keys too. */
  const granter = async (ctx: PlatformCtx) => ({
    platform: await ctx.permissionsIn(null),
    inApp: (appId: string) => ctx.permissionsIn(appId),
  });
  const registryFor = (ctx: PlatformCtx) => async (appId: string): Promise<RoleRegistry> =>
    rolesFor(ctx.db, ctx.tenantId as TenantId, appId,
      (appId === app.id ? app.access.roles : ctx.appOf(appId)?.access.roles) ?? {});

  const asAppRoles = (given: unknown): Readonly<Record<string, string>> =>
    given !== null && typeof given === "object" && !Array.isArray(given)
      ? Object.fromEntries(Object.entries(given as Record<string, unknown>)
        .filter((pair): pair is [string, string] => typeof pair[1] === "string"))
      : {};

  const op = (
    id: string, kind: "read" | "write", permission: string, summary: string,
    run: (ctx: PlatformCtx, input: Record<string, unknown>) => Promise<unknown>,
    /* ⚠️ The agent-door policy, spec-shaped: absent means "a tool", `{ why }`
       is the stated opt-out — see `tool` on `OperationSpec`. */
    tool?: { readonly why: string },
  ): Resolved => ({
    id, kind,
    method: kind === "read" ? "GET" : "POST",
    path: `/api/${id}`,
    permission,
    spec: {
      id, kind, summary,
      input: {}, output: {},
      permission,
      idempotency: { mode: "none" },
      ...(tool ? { tool } : {}),
      ...(kind === "write" ? { emits: [`${id}d`] } : {}),
      async handler() { return {} as never; },
    } as Resolved["spec"],
    run: (ctx, input) => run(asPlatform(ctx), input),
  });

  return {
    "member.list": op("member.list", "read", "member:read", "Everybody in this workspace.",
      async (ctx) => ({
        items: (await membersOf(ctx.db, ctx.tenantId as TenantId)).map((m) => ({
          id: m.id,
          /* ⚠️ THE ACCOUNT, BESIDE THE MEMBERSHIP, AND THEY ARE NOT THE SAME
             THING. `id` identifies this row in THIS workspace; `accountId`
             identifies the person across all of them. A face drawn from the
             row id would give one person a different face per workspace,
             which is the whole thing accounts living under the deployment
             exists to prevent. Empty until an invitation is claimed — there
             is no account yet, and saying so beats inventing one. */
          accountId: m.accountId,
          email: m.email, platformRole: m.platformRole, appRoles: m.appRoles,
          accepted: m.acceptedAt !== null,
        })),
      })),

    "member.invite": op("member.invite", "write", "member:manage", "Invite somebody by email.",
      async (ctx, input) => {
        const email = String(input.email ?? "").trim().toLowerCase();
        const platformRole = String(input.platformRole ?? "");
        const appRoles = asAppRoles(input.appRoles);
        const allowed = ctx.allowance(seats.entitlement);
        /* ⚠️ Reported as a ceiling with its numbers, because "you have used all
           of yours" without them renders "your plan includes undefined". */
        const used = seatsUsed(await membersOf(ctx.db, ctx.tenantId as TenantId), seats.counts);
        /* ⚠️ Only for a PLATFORM role that costs a seat — see `invite`. A
           workspace's customers are members too, and refusing one because the
           staff seats are full would gate the product on the payroll. */
        if (seats.counts.includes(platformRole) && !withinQuota(allowed, used)) {
          return ctx.fail("platform.quota_reached", { limit: String(allowed), used });
        }

        const made = await invite(ctx.db, ctx.tenantId as TenantId,
          { email, platformRole, appRoles }, await granter(ctx), registryFor(ctx),
          { counts: seats.counts, allowed: typeof allowed === "number" ? allowed : -1 }, ctx.now);

        if (made === "beyond_you") return ctx.fail("platform.forbidden");
        if (made === "already_here") return ctx.fail("platform.conflict");
        if (made === "no_such_role") return ctx.fail("platform.invalid");
        if (made === "no_seats") return ctx.fail("platform.quota_reached", { limit: String(allowed), used });

        /* ⚠️ THE INDEX IS WHAT MAKES IT CLAIMABLE. Without this row the person
           signs in, belongs to nothing, and the only way to find their
           invitation is to search every shard for it (D5). */
        await noteInvitation(ctx.directory, email, ctx.tenantId as TenantId, ctx.now);
        return { id: made.id, email: made.email, platformRole: made.platformRole, appRoles: made.appRoles };
      },
      /* ⚠️ The kernel's own canonical opt-out, made real: a model that can
         invite somebody from a sentence in a document is a model that can be
         asked to. */
      { why: "It grants access, so a model must not be able to call it from a sentence." }),

    /*
      ⚠️ ONE OPERATION, TWO AUTHORITIES, AND THE INPUT SAYS WHICH. `platformRole`
      changes what somebody may do to the WORKSPACE; `app` + `role` changes what
      they may do in ONE product (`role: null` takes them out of it). Each is
      bounded against ITS OWN authority — the caller's platform keys for one,
      their keys in that app for the other — because bounding one with the
      other's keys is the escalation D15 exists to close.
    */
    "member.role": op("member.role", "write", "member:manage", "Change somebody's role.",
      async (ctx, input) => {
        const memberId = String(input.id ?? "");

        if (typeof input.platformRole === "string") {
          const out = await setPlatformRole(ctx.db, ctx.tenantId as TenantId, memberId,
            input.platformRole, await ctx.permissionsIn(null));
          if (out === "beyond_you") return ctx.fail("platform.forbidden");
          if (out === "no_such_member") return ctx.fail("platform.not_found");
          if (out === "no_such_role") return ctx.fail("platform.invalid");
          if (out === "would_strand") return ctx.fail("platform.conflict");
          return { id: memberId };
        }

        const appId = String(input.app ?? "");
        if (!appId) return ctx.fail("platform.invalid");
        const role = input.role === null ? null : String(input.role ?? "");
        if (role === "") return ctx.fail("platform.invalid");
        const out = await setAppRole(ctx.db, ctx.tenantId as TenantId, memberId, appId, role,
          await ctx.permissionsIn(appId), await registryFor(ctx)(appId));
        if (out === "beyond_you") return ctx.fail("platform.forbidden");
        if (out === "no_such_member") return ctx.fail("platform.not_found");
        if (out === "no_such_role") return ctx.fail("platform.invalid");
        if (out === "would_strand") return ctx.fail("platform.conflict");
        return { id: memberId };
      },
      { why: "It changes what somebody may do, which only a person weighs." }),

    /* ------------------------------------------------------------ inbox --- */

    /*
      ⚠️ THE INBOX IS THE PLATFORM'S AND EVERY APP HAS IT. An app that had to
      declare "list my notifications" would be an app that could ship without
      one — which is precisely what a previous platform did, for three stages,
      with the schema, the routes and sixteen dispatch sites already in place.

      ⚠️ AND `PUBLIC` IS RIGHT HERE: this is a question about the caller, and a
      workspace permission on "what was I told" would be a role check on
      somebody's own record.
    */
    "inbox.list": op("inbox.list", "read", PUBLIC as unknown as string, "What you were told.",
      async (ctx) => ({
        items: ctx.accountId ? await inboxOf(ctx.db, ctx.tenantId as TenantId, ctx.accountId) : [],
        unseen: ctx.accountId ? await unseenCount(ctx.db, ctx.tenantId as TenantId, ctx.accountId) : 0,
      })),

    "inbox.seen": op("inbox.seen", "write", PUBLIC as unknown as string, "Mark as read.",
      async (ctx, input) => {
        if (!ctx.accountId) return ctx.fail("platform.unauthorized");
        await markSeen(ctx.db, ctx.tenantId as TenantId, ctx.accountId,
          input.id ? String(input.id) : null, ctx.now);
        return { seen: true };
      }),

    /* ⚠️ Two levels, two operations, two authorities. A person narrowing their
       own notifications and a workspace setting the ceiling are not the same
       write, and sharing one would let either overwrite the other. */
    "inbox.preference": op("inbox.preference", "write", PUBLIC as unknown as string,
      "Choose how you are told.",
      async (ctx, input) => {
        if (!ctx.accountId) return ctx.fail("platform.unauthorized");
        const type = String(input.type ?? "");
        const channels = asChannels(input.channels);
        /* ⚠️ CHECKED HERE, NOT IN THE SCREEN — see `refusePolicy`, whose own
           comment states this and which nothing called. The policy screen
           disables the switch on an `action` type; a screen that merely does not
           render a control is a rule that lasts until the second screen, the
           API, or a bulk import. */
        if (refusePolicy(app.notifications ?? {}, { [type]: channels }).length) {
          return ctx.fail("platform.invalid");
        }
        await setPreference(ctx.db, ctx.tenantId as TenantId, ctx.accountId, type, channels);
        return { saved: true };
      }),

    "inbox.policy": op("inbox.policy", "write", "tenant:manage",
      "Choose what this workspace may be told about.",
      async (ctx, input) => {
        const type = String(input.type ?? "");
        const channels = asChannels(input.channels);
        if (refusePolicy(app.notifications ?? {}, { [type]: channels }).length) {
          return ctx.fail("platform.invalid");
        }
        await setPolicy(ctx.db, ctx.tenantId as TenantId, type, channels);
        return { saved: true };
      }),

    "inbox.settings": op("inbox.settings", "read", PUBLIC as unknown as string,
      "The two levels of the notification policy.",
      async (ctx) => ({
        policy: await policyOf(ctx.db, ctx.tenantId as TenantId),
        preference: ctx.accountId
          ? await preferenceOf(ctx.db, ctx.tenantId as TenantId, ctx.accountId)
          : {},
        /* ⚠️ THE CHANNELS COME WITH THE POLICY, because a switch is only worth
           drawing for a channel something can send on — see `PlatformCtx`. */
        available: ctx.channels,
      })),

    "member.remove": op("member.remove", "write", "member:manage", "Remove somebody.",
      async (ctx, input) => {
        const out = await remove(ctx.db, ctx.tenantId as TenantId, String(input.id ?? ""),
          await granter(ctx), registryFor(ctx), ctx.now);
        if (out === "beyond_you") return ctx.fail("platform.forbidden");
        if (out === "no_such_member") return ctx.fail("platform.not_found");
        /* ⚠️ Removing the last person who can run the place does not close it —
           it makes it unreachable, with the bill still running. */
        if (out === "would_strand") return ctx.fail("platform.conflict");
        return { id: String(input.id) };
      },
      { why: "It takes access away, which only a person weighs." }),

    /*
      ⚠️ THE WORKSPACE'S BRAND, NOT THIS APP'S — see `branding.ts`. The operation
      is mounted in every product because a business editing its identity does it
      from wherever it happens to be standing, and it writes ONE row: the next
      product it opens is already wearing it.
    */
    "brand.read": op("brand.read", "read", "tenant:manage", "This workspace's own identity.",
      async (ctx) => {
        const tenant = await tenantById(ctx.directory, ctx.tenantId as TenantId);
        /*
          ⚠️ WHAT THE APPS HERE ACTUALLY HAVE, never the platform's closed set. A
          surface a workspace can switch on that no app offers is a toggle that
          changes nothing and says nothing — it stays on, everything reports
          success, and somebody is waiting for an email that was never branded
          because this workspace has no product that sends one.
        */
        const offered = new Set<string>();
        for (const id of ctx.enabledApps) {
          for (const s of ctx.appOf(id)?.whitelabel?.surfaces ?? []) offered.add(s);
        }
        return {
          /* ⚠️ The kind travels with it, because "you have no brand" and "a
             personal workspace does not have one" are different screens: an
             empty editor, and an offer to become a business. */
          kind: tenant?.kind ?? "personal",
          branding: await brandingOf(ctx.directory, ctx.tenantId as TenantId),
          /* ⚠️ WHETHER THERE IS ONE AND HOW BIG, NEVER THE BYTES. The editor
             shows the icon by fetching `/icon.png`, which the browser is caching
             anyway; putting a hundred kilobytes of base64 in this answer would
             put it on the wire again every time somebody opens the screen. */
          icon: await hasIcon(ctx.directory, ctx.tenantId as TenantId),
          /* ⚠️ In the platform's own order, so the list does not reshuffle when a
             product is switched on. */
          surfaces: SURFACES.filter((s) => offered.has(s)),
        };
      }),

    "brand.write": op("brand.write", "write", "tenant:manage", "Change this workspace's identity.",
      async (ctx, input) => {
        const tenant = await tenantById(ctx.directory, ctx.tenantId as TenantId);
        if (!tenant) return ctx.fail("platform.not_found");
        const done = await setBranding(ctx.directory, tenant.id, tenant.kind, {
          theme: (input.theme ?? {}) as Theme,
          surfaces: Array.isArray(input.surfaces) ? input.surfaces.map(String) : [],
          ...(typeof input.ourMark === "boolean" ? { ourMark: input.ourMark } : {}),
        }, ctx.now);
        /* ⚠️ Three refusals and three different things to do next: become a
           business, pick a readable pair, or ask for a surface that exists. */
        if (done === "not_commercial") {
          return ctx.fail("platform.commercial_required", { workspace: tenant.name });
        }
        if (done === "unreadable" || done === "not_a_surface") return ctx.fail("platform.invalid");
        return done;
      },
      { why: "It changes what a business's own customers see, which is theirs to weigh." }),

    /*
      ⚠️ THE ICON IS ITS OWN OPERATION, NOT A FIELD ON `brand.write`. It is bytes
      rather than JSON, so it arrives through the raw-body lane; folding it into
      the theme write would mean every colour change re-uploading the picture, and
      a failed picture losing the colours.

      ⚠️ AND IT IS COMMERCIAL-ONLY IN `setIcon`, not merely absent from the
      screen. A hidden control is not a refused write, and this row is read by the
      PUBLIC manifest route — so a write that got past a hidden button would put
      somebody's logo on a workspace that is not trading under it.
    */
    "brand.icon": op("brand.icon", "write", "tenant:manage",
      "Set the icon this workspace installs and shows in a browser tab.",
      async (ctx, input) => {
        const tenant = await tenantById(ctx.directory, ctx.tenantId as TenantId);
        if (!tenant) return ctx.fail("platform.not_found");

        /* ⚠️ CLEARING IS THE SAME OPERATION, because "remove my logo" is the
           other half of "set my logo" and a second operation would be a second
           permission to keep in step with this one. */
        if (input.clear === true) {
          await forgetIcon(ctx.directory, tenant.id);
          return { icon: null };
        }

        const body = input.body;
        if (!(body instanceof ArrayBuffer)) return ctx.fail("platform.invalid");
        const done = await setIcon(
          ctx.directory, tenant.id, tenant.kind, new Uint8Array(body),
          ctx.accountId ?? null, ctx.now);

        /* ⚠️ SIX REFUSALS AND SIX DIFFERENT THINGS TO DO NEXT — become a
           business, export a smaller file, export a PNG, crop it square, export
           it larger. One "invalid" is a screen somebody has to guess at, with
           their own logo in front of them and no idea what is wrong with it. */
        if (done === "not_commercial") {
          return ctx.fail("platform.commercial_required", { workspace: tenant.name });
        }
        if (done === "too_big") {
          return ctx.fail("platform.too_big", { most: Math.floor(MOST_BYTES / 1024) });
        }
        if (typeof done === "string") {
          /* ⚠️ A refusal with no sentence is a field error somebody sees as an
             empty red line, so an unmapped one says what it is rather than
             nothing. It cannot happen; it is one edit away from happening. */
          return ctx.fail("platform.invalid", {}, { fields: { icon: SAYS[done] ?? done } });
        }
        return { icon: { width: done.width, bytes: done.bytes } };
      },
      { why: "It changes the mark on a business's own staff's home screens." }),
  };
}

/** ⚠️ What is wrong with the file, in the words somebody can act on. */
const SAYS: Readonly<Record<string, string>> = {
  empty: "that file is empty",
  not_a_png: "it has to be a PNG — an SVG can carry script, and this is served from your own address",
  not_square: "it has to be square, so it is not cropped on a home screen",
  wrong_size: `between ${LEAST_SIDE} and ${MOST_SIDE} pixels a side`,
};

/** ⚠️ A channel list from a request is untrusted; the kernel's policy rules
    refuse anything the type does not offer, and this only keeps the shape. */
const asChannels = (given: unknown): readonly ("inbox" | "email" | "push")[] =>
  (Array.isArray(given) ? given : [])
    .filter((c): c is "inbox" | "email" | "push" => c === "inbox" || c === "email" || c === "push");

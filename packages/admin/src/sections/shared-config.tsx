/**
 * SHARED PLATFORM CONFIG — set a credential once, every 4DL app reads it.
 *
 * The problem this answers, in the operator's own words: "I have to configure
 * keys and API stuff and AI models across each and every app." There is one
 * Google account, one Stripe account, one Cloudflare account and one Turnstile
 * widget behind all of them, and each product used to hold its own copy — so a
 * rotated key had to be re-pasted N times, or one app quietly kept the old one.
 *
 * `@4dl/core` owns the store and its allow-list. This is the screen.
 *
 * ── An index, and a page per group ──────────────────────────────────────────
 *
 * The first version was one page: a paragraph, three callouts, then nineteen
 * fields in five stacked groups. It was accurate and unreadable — "walls of
 * text", which is UI-LANGUAGE §7's settings rule being broken in every clause
 * at once: four layers of introduction before the first control, no way to
 * check a value without scrolling past four groups you did not come for, and
 * nothing on screen answering "what is this set to".
 *
 * So it is the shape every other settings surface here uses: an INDEX whose
 * rows carry the CURRENT VALUE, and a page per group. "Cloudflare ·
 * noreply@4dl.app" on a row means the commonest question — what is it set to —
 * is answered by reading, without opening anything and therefore without any
 * risk of changing it.
 *
 * Each group saves on its own. They share no state (a Stripe key and a mail
 * sender have nothing to half-apply between them), so a shared footer would be
 * a promise the form does not make.
 *
 * ── The two things this panel must still communicate ────────────────────────
 *
 * **A save here lands everywhere**, which is the feature and the risk: one
 * wrong value takes out every product at once, true of no other panel in this
 * console. Hence the confirmation — the only one on a settings save here.
 *
 * **This app's own console still wins.** The per-app panels write this app's
 * `app_config`, and a non-empty row there overrides the shared value. That is
 * invisible from either side, so `overriddenHere` is a badge on the row and a
 * count on the index, with a button that hands the key back.
 */

import { useCallback, useMemo, useState } from "react";
import {
  ActionResult, AlertTriangle, Badge, Button, Callout, Card, CircleCheck, ConfirmDialog, CreditCard, Field, Globe,
  Info, KeyRound, LoadError, Mail, Reveal, ShieldCheck, Skeleton, SkeletonLine, Spinner,
  Stagger, Wand2, useAction, useLoad, type Tone,
} from "@4dl/ui";
import { AdminDepsProvider, useAdminDeps, type AdminDeps } from "../deps.js";
import { ConsoleSplit, type ConsoleSubSection } from "../split.js";
import { useUrlKey } from "../use-section.js";

/** One shared key, as `@4dl/core`'s `sharedConfigRoutes` reports it. */
interface Entry {
  key: string;
  shared: boolean;
  value: string | null;
  last4: string | null;
  secret: boolean;
  overriddenHere: boolean;
}

interface SharedConfigStatus {
  /** False when this deployment has no `PLATFORM_CONFIG` binding at all. */
  wired: boolean;
  entries: Entry[];
}

/**
 * The groups, their copy and their colour.
 *
 * Core ships the key list, because which keys are safe to share is a fact about
 * the platform's architecture. What to CALL them, and what an operator should
 * type into them, is copy — and copy lives with the screen.
 *
 * `state` is the whole reason this is an index. It answers "what is this set to"
 * in the row, so checking a setting costs no taps and risks no edits.
 *
 * ── Why the colour is a STATE and not an accent ──────────────────────────────
 *
 * UI-LANGUAGE §7 says colour is navigation, and in an app that means a fixed
 * accent per section. This package cannot do that: the accent palette is the
 * APP's (`Tone` is five status tones plus whatever the app registers), so an
 * `activity`/`sleep`/`supplement` here would be Kova's vocabulary in a shared
 * package — and in a product that has not registered those tokens, a `text-sleep`
 * Tailwind never generated, i.e. an uncoloured icon.
 *
 * A status tone is the one thing this package can honestly claim, so the row
 * wears the state of what it holds. It reads better than an accent would: a
 * Turnstile secret with no site key is `danger` because that configuration locks
 * everyone out of sign-in, and finding it should not require opening the group.
 */
interface Group {
  key: string;
  label: string;
  icon: typeof Globe;
  /** ONE sentence. If a group needs more, its fields are named wrong. */
  hint: string;
  /**
   * What this group's subject keeps PER-APP, if anything.
   *
   * Rendered under the fields rather than above them. It answers "why is the
   * webhook secret not here", which is a question you have after looking — so
   * putting it first delays every control to pre-empt a question most visits
   * never ask.
   */
  perApp?: string;
  keys: string[];
  state: (get: (k: string) => Entry | undefined) => { value: string; tone: Tone };
}

/** "set" / "—" for a secret; the value itself for anything readable. */
const shown = (e?: Entry): string => (!e || !e.shared ? "" : e.secret ? `set ••••${e.last4 ?? ""}` : e.value || "");

const GROUPS: Group[] = [
  {
    key: "ai",
    label: "AI",
    icon: Wand2,
    hint: "One Google account behind every app's vision and text lanes.",
    perApp: "Which models each product turns ON is its own, on its own AI panel — and so is the price of a model already in its catalog.",
    keys: ["google.gemini_key", "ai.mock", "ai.markup"],
    state: (get) => {
      const mock = shown(get("ai.mock"));
      const markup = shown(get("ai.markup"));
      const rest = [mock && `mock ${mock}`, markup && `×${markup}`].filter(Boolean);
      // No key is not an error — an app with no AI features runs fine. It is
      // still the answer to "why is the vision suite dead", so it is `warning`
      // rather than silence.
      return get("google.gemini_key")?.shared
        ? { value: ["Gemini key set", ...rest].join(" · "), tone: "success" }
        : { value: ["No Gemini key", ...rest].join(" · "), tone: "warning" };
    },
  },
  {
    key: "email",
    label: "Email delivery",
    icon: Mail,
    hint: "The lane every app sends on, and the address the platform itself sends from.",
    perApp: "Each app's own FROM line keeps its display name and stays on that app's Email delivery panel.",
    keys: ["email.provider", "email.platform_from", "email.credits_per_email"],
    state: (get) => {
      const provider = shown(get("email.provider"));
      const from = shown(get("email.platform_from"));
      // On a passwordless platform, not sending mail is not sending sign-in
      // codes. Nothing else in this panel is worth a `danger`; this is.
      if (!provider) return { value: "No provider — nobody can sign in", tone: "danger" };
      if (provider !== "cloudflare") return { value: `${provider} — nothing is delivered`, tone: "danger" };
      return { value: [provider, from].filter(Boolean).join(" · "), tone: "success" };
    },
  },
  {
    key: "bot",
    label: "Bot check",
    icon: ShieldCheck,
    hint: "One Turnstile widget, and the hostnames it is registered for.",
    perApp:
      "A widget only works on hostnames it lists — listing one covers its subdomains too. Anywhere else it refuses to render, so the check stands down there rather than demanding a token nobody can produce. Leave this blank and the platform's own root is assumed. Cloudflare's \u201cAny Hostname\u201d option removes the limit and is Enterprise-only.",
    keys: ["turnstile.site_key", "turnstile.secret", "turnstile.hostnames"],
    state: (get) => {
      const site = get("turnstile.site_key")?.shared;
      const secret = get("turnstile.secret")?.shared;
      const hosts = shown(get("turnstile.hostnames"));
      if (secret && !site) return { value: "Secret with no site key — nobody can sign in", tone: "danger" };
      if (secret) return { value: hosts ? `Enforcing on ${hosts}` : "Enforcing on the platform's own doors", tone: "success" };
      if (site) return { value: "Widget only — nothing verified", tone: "warning" };
      return { value: "Off", tone: "neutral" };
    },
  },
  {
    key: "payments",
    label: "Payments",
    icon: CreditCard,
    hint: "One Stripe account for the whole platform.",
    perApp: "A webhook secret is per-ENDPOINT, so it stays on each app's own Stripe panel.",
    keys: [
      "stripe.mode",
      "stripe.test.secret_key",
      "stripe.test.publishable_key",
      "stripe.live.secret_key",
      "stripe.live.publishable_key",
      "stripe.platform_fee_bps",
      "stripe.secret_key",
      "stripe.publishable_key",
    ],
    state: (get) => {
      const mode = shown(get("stripe.mode"));
      if (!mode) return { value: "Not configured", tone: "neutral" };
      const lane = mode === "live" ? "stripe.live.secret_key" : "stripe.test.secret_key";
      // A mode chosen with no keys behind it is the one broken shape here: the
      // deployment believes it can charge and cannot.
      return get(lane)?.shared
        ? { value: `${mode} · keys set`, tone: "success" }
        : { value: `${mode} · no keys for this lane`, tone: "warning" };
    },
  },
  {
    key: "domains",
    label: "Custom domains",
    icon: Globe,
    hint: "One Cloudflare account, one zone, one fallback origin.",
    perApp: "Only the WORKER NAME is per-app, and it stays on each app's own Custom domains panel.",
    keys: ["cf.saas.api_token", "cf.saas.zone_id", "cf.saas.cname_target"],
    state: (get) => {
      if (!get("cf.saas.api_token")?.shared) return { value: "Not configured", tone: "neutral" };
      const target = shown(get("cf.saas.cname_target"));
      return target
        ? { value: `token set · ${target}`, tone: "success" }
        : { value: "token set · no CNAME target", tone: "warning" };
    },
  },
];

const LABELS: Record<string, string> = {
  "google.gemini_key": "Gemini API key",
  "ai.mock": "Mock lane",
  "ai.markup": "Credit markup (new models)",
  "email.provider": "Provider",
  "email.platform_from": "Platform sender",
  "email.credits_per_email": "Credits per email",
  "turnstile.site_key": "Site key (public)",
  "turnstile.secret": "Secret key (server)",
  "turnstile.hostnames": "Hostnames the widget covers",
  "stripe.mode": "Mode",
  "stripe.test.secret_key": "Test secret key",
  "stripe.test.publishable_key": "Test publishable key",
  "stripe.live.secret_key": "Live secret key",
  "stripe.live.publishable_key": "Live publishable key",
  "stripe.platform_fee_bps": "Platform fee (bps)",
  "stripe.secret_key": "Secret key (legacy)",
  "stripe.publishable_key": "Publishable key (legacy)",
  "cf.saas.api_token": "Cloudflare API token",
  "cf.saas.zone_id": "SaaS zone id",
  "cf.saas.cname_target": "CNAME target",
};

/** What to type. Only where it is not obvious from the label. */
const PLACEHOLDERS: Record<string, string> = {
  "google.gemini_key": "AIza…",
  "ai.mock": "auto",
  "ai.markup": "3",
  "email.provider": "cloudflare",
  "email.platform_from": "noreply@4dl.app",
  "email.credits_per_email": "1",
  "stripe.mode": "test",
  "stripe.platform_fee_bps": "0",
  "turnstile.site_key": "0x4AAAAAAA…",
  "turnstile.hostnames": "4dl.app, byshujaa.com",
  "cf.saas.cname_target": "saas.4dl.app",
};

export function PlatformSharedConfigSection({ api, errorText }: AdminDeps) {
  return (
    <AdminDepsProvider value={{ api, errorText }}>
      <SharedConfig />
    </AdminDepsProvider>
  );
}

function SharedConfig() {
  const { api, errorText } = useAdminDeps();
  const load = useCallback(() => api.get<SharedConfigStatus>("/api/admin/shared-config"), [api]);
  const { data: status, error, loading, reload } = useLoad(load, "the shared platform config", errorText);

  const byKey = useMemo(() => new Map((status?.entries ?? []).map((e) => [e.key, e])), [status]);
  const get = useCallback((k: string) => byKey.get(k), [byKey]);
  const overrides = (status?.entries ?? []).filter((e) => e.overriddenHere);

  /**
   * Which group is open — read here so the panel's OWN chrome can stand down.
   *
   * `ConsoleSplit` owns the param and hides which page it is showing, which is
   * right for it and not enough here: the intro, the two callouts and the
   * closing note are all about the INDEX, and rendering them above an open group
   * rebuilt the exact stack this panel was rewritten to remove — a page title, a
   * section blurb, a card header repeating the title, a panel intro, and only
   * then the group's own heading. §7 allows one line, and only on the section
   * page.
   */
  const [openGroup] = useUrlKey("pc");
  const onIndex = openGroup === null;

  const subs: ConsoleSubSection[] = GROUPS.map((g) => {
    const overridden = g.keys.filter((k) => get(k)?.overriddenHere).length;
    const st = status ? g.state(get) : { value: "", tone: "neutral" as Tone };
    return {
      key: g.key,
      label: g.label,
      icon: g.icon,
      tone: st.tone,
      value: st.value,
      trailing: overridden ? <Badge tone="warning">{overridden} local</Badge> : undefined,
      render: () => <GroupPage group={g} get={get} wired={!!status?.wired} reload={reload} />,
    };
  });

  return (
    <Stagger className="space-y-3">
      {error && !status ? (
        <LoadError what="the shared platform config" error={error} onRetry={reload} />
      ) : (
        <Reveal
          loading={loading}
          skeleton={
            <Card className="space-y-3">
              <div className="flex items-center gap-2.5">
                <Skeleton className="size-9 rounded-2xl" />
                <SkeletonLine w="12rem" h="title" />
              </div>
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-3 py-1">
                  <Skeleton className="size-9 rounded-xl" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <SkeletonLine w="7rem" />
                    <SkeletonLine w="11rem" h="xs" />
                  </div>
                </div>
              ))}
            </Card>
          }
        >
          {status && (
            <Card className="space-y-4">
              {onIndex && (
                <>
                  {/* ONE line, and the state beside it. The section's own title
                      and blurb are already on screen above this card, so a
                      SectionHeader here would be the third time the words
                      "shared platform config" appeared before a control. */}
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-body text-muted-foreground">
                      One value, read by every 4DL app. This app&apos;s own settings still win.
                    </p>
                    <Badge tone={status.wired ? "success" : "warning"}>{status.wired ? "live" : "not wired"}</Badge>
                  </div>

                  {!status.wired && (
                    <Callout tone="warning" icon={AlertTriangle} live="alert">
                      No shared store is bound here yet, so nothing below can be saved. The next deploy wires it
                      automatically — every app keeps reading its own settings until then.
                    </Callout>
                  )}

                  {overrides.length > 0 && (
                    <Callout tone="warning" icon={Info}>
                      {overrides.length === 1 ? "One setting is" : `${overrides.length} settings are`} overridden on this
                      app and ignore what is stored here. Open the group to hand one back.
                    </Callout>
                  )}
                </>
              )}

              <ConsoleSplit param="pc" subs={subs} />

              {/* The one thing that surprises people, in one muted line at the
                  bottom rather than a callout above the controls. */}
              {onIndex && (
                <p className="text-caption text-muted-foreground">
                  The per-app panels in this console show only what <span className="font-medium">this</span> app holds
                  of its own — a key set here and not overridden reads as unset there.
                </p>
              )}

              {error && (
                <Callout tone="warning" icon={AlertTriangle} live="alert">
                  {error} Showing the last values that loaded.
                </Callout>
              )}
            </Card>
          )}
        </Reveal>
      )}
    </Stagger>
  );
}

/**
 * One group's fields, and its own save.
 *
 * Scoped per group because the groups share no state — a Stripe key and a mail
 * sender have nothing to half-apply between them — so a single footer over all
 * five would imply a transaction that does not exist.
 */
function GroupPage({
  group,
  get,
  wired,
  reload,
}: {
  group: Group;
  get: (k: string) => Entry | undefined;
  wired: boolean;
  reload: () => void;
}) {
  const { api, errorText } = useAdminDeps();
  /**
   * Only what was TOUCHED is sent. Not "every field on the page": a secret's
   * box is always blank (the server will not read one back), so a full-form
   * save would clear every credential the first time anybody nudged a markup.
   */
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const act = useAction(errorText);

  const changed = Object.keys(draft).filter((k) => draft[k] !== (get(k)?.value ?? ""));

  const save = () =>
    act.run("save", async () => {
      const patch: Record<string, string> = {};
      for (const k of changed) patch[k] = draft[k] ?? "";
      await api.post("/api/admin/shared-config", { patch });
      setDraft({});
      reload();
      return `Saved — ${changed.length === 1 ? "1 setting" : `${changed.length} settings`} now apply to every app.`;
    }, "Couldn't save to the shared store.");

  /**
   * Hand one key back to the shared store.
   *
   * The action the model needed and could not express: a local row wins, and
   * most per-app panels cannot clear their own field (the AI panel only writes
   * a non-empty key; the email panel validates its sender against a regex a
   * blank fails). This screen knows a key is overridden, so it is the one that
   * can un-override it.
   */
  const useShared = (k: string) =>
    act.run(`drop:${k}`, async () => {
      await api.del(`/api/admin/shared-config/local/${encodeURIComponent(k)}`);
      reload();
      return `${LABELS[k] ?? k}: this app now uses the shared value.`;
    }, "Couldn't hand that setting back.");

  return (
    <div className="space-y-3">
      <p className="text-body text-muted-foreground">{group.hint}</p>

      <div className="space-y-3">
        {group.keys.map((k) => {
          const e = get(k);
          if (!e) return null;
          const value = draft[k] ?? (e.secret ? "" : (e.value ?? ""));
          return (
            <div key={k} className="space-y-1.5">
              <Field
                label={e.secret && e.shared ? `${LABELS[k] ?? k} — stored ••••${e.last4 ?? ""}` : (LABELS[k] ?? k)}
                icon={e.secret ? KeyRound : undefined}
                type={e.secret ? "password" : "text"}
                value={value}
                placeholder={PLACEHOLDERS[k]}
                onChange={(ev) => setDraft((d) => ({ ...d, [k]: ev.target.value }))}
                disabled={!wired}
                hint={e.secret && e.shared ? "Blank keeps the stored one." : undefined}
              />
              {e.overriddenHere && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl bg-warning/10 px-3 py-2 text-caption">
                  <Badge tone="warning">overridden here</Badge>
                  <span className="min-w-0 flex-1 text-muted-foreground">This app has its own value.</span>
                  <Button size="sm" variant="outline" disabled={act.busy !== null} onClick={() => void useShared(k)}>
                    {act.busy === `drop:${k}` ? <><Spinner className="size-3" /> …</> : "Use shared"}
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Button
        className="min-h-12 w-full"
        disabled={!wired || act.busy !== null || changed.length === 0}
        onClick={() => setConfirming(true)}
      >
        {act.busy === "save" ? (
          <><Spinner className="size-4" /> Saving…</>
        ) : changed.length ? (
          `Save ${changed.length} to every app`
        ) : (
          "Save"
        )}
      </Button>

      {changed.length === 0 && wired && (
        <p className="flex items-center gap-1.5 text-caption text-muted-foreground">
          <CircleCheck className="size-3 shrink-0" /> Nothing changed.
        </p>
      )}

      {/* Below the fields on purpose — see `Group.perApp`. */}
      {group.perApp && <p className="text-caption text-muted-foreground">{group.perApp}</p>}

      <ActionResult msg={act.msg} err={act.err} />

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Save to every app?"
        description={
          `${changed.map((k) => LABELS[k] ?? k).join(", ")} — ${changed.length === 1 ? "this applies" : "these apply"} to every 4DL product, ` +
          "not just this one, and can take up to a minute to reach them. Apps with their own value keep it."
        }
        confirmLabel="Save to every app"
        onConfirm={() => void save()}
      />
    </div>
  );
}

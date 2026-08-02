/**
 * SHARED PLATFORM CONFIG — set a credential once, every 4DL app reads it.
 *
 * The problem this answers, in the operator's own words: "I have to configure
 * keys and API stuff and AI models across each and every app." There is one
 * Google account, one Stripe account, one Cloudflare account and one Turnstile
 * widget behind all of them, and until now each product held its own copy —
 * so a rotated key had to be re-pasted N times, or one app quietly kept using
 * the old one.
 *
 * `@4dl/core` owns the store (a KV namespace bound with the same id into every
 * worker) and its allow-list. This is the screen.
 *
 * ── The two things this panel must communicate ──────────────────────────────
 *
 * **A save here lands everywhere.** That is the feature and it is also the
 * risk: one wrong value takes out every product at once, which is not true of
 * any other panel in this console. Hence the confirmation step — the only one
 * on a settings save in the whole console — and hence naming the blast radius
 * in the dialog rather than in a tooltip.
 *
 * **This app's own console still wins.** The per-app panels — AI, Email,
 * Stripe, Turnstile, Domains — write this app's `app_config`, and a non-empty
 * row there overrides the shared value. That precedence is invisible from
 * either side, so `overriddenHere` is rendered as a badge on the row: without
 * it, "I set it centrally and this app still uses the old one" has no visible
 * cause anywhere in the UI.
 *
 * The reverse also needs saying, and the callout says it: a key set here and
 * NOT overridden shows as unset on the per-app panel, because that panel
 * reports only what the app holds of its own. Making those panels show the
 * merged value would be worse, not better — they save every field they
 * display, so a merged read plus a save would silently copy the shared value
 * into this app as a permanent local override.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActionResult, AlertTriangle, Badge, Button, Callout, Card, ConfirmDialog, Field, FieldGroup, Globe, Info,
  KeyRound, LoadError, Reveal, SectionHeader, Skeleton, SkeletonLine, Spinner, Stagger, useAction, useLoad,
} from "@4dl/ui";
import { AdminDepsProvider, useAdminDeps, type AdminDeps } from "../deps.js";

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
 * Labels and grouping — the console's, not core's.
 *
 * Core ships the key list because which keys are safe to share is a fact about
 * the platform's architecture. What to CALL them is copy, and copy lives with
 * the screen. A key that reaches the API and is missing here still renders,
 * under "Other", spelled as its raw key rather than dropped: an unlabelled
 * setting is a nuisance, an invisible one is a setting nobody knows is set.
 */
const GROUPS: { title: string; hint: string; keys: string[] }[] = [
  {
    title: "AI",
    hint: "One Google account behind every app's vision and text lanes. The credit MARKUP is not here — it is a column on each app's model rows, set from that app's AI panel.",
    keys: ["google.gemini_key", "ai.mock"],
  },
  {
    title: "Email delivery",
    hint: "The lane and the platform's own sender. Each app's FROM line keeps its own display name and stays out of here.",
    keys: ["email.provider", "email.platform_from", "email.credits_per_email"],
  },
  {
    title: "Bot check",
    hint: "One Turnstile widget, with every door listed under its Hostnames.",
    keys: ["turnstile.site_key", "turnstile.secret"],
  },
  {
    title: "Payments",
    hint: "One Stripe account for the whole platform. Each app's WEBHOOK SECRET is per-endpoint and is set on that app's own Stripe panel.",
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
  },
  {
    title: "Custom domains",
    hint: "One Cloudflare account, one zone, one fallback origin — every app's tenants CNAME to the same target. Only the WORKER NAME is per-app, and it stays on each app's own Custom domains panel.",
    keys: ["cf.saas.api_token", "cf.saas.zone_id", "cf.saas.cname_target"],
  },
];

const LABELS: Record<string, string> = {
  "google.gemini_key": "Gemini API key",
  "ai.mock": "Mock lane",
  "email.provider": "Provider",
  "email.platform_from": "Platform sender",
  "email.credits_per_email": "Credits per email",
  "turnstile.site_key": "Site key (public)",
  "turnstile.secret": "Secret key (server)",
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
  /**
   * Only what the operator TOUCHED is sent.
   *
   * Not "every field on the form": a secret's box is always blank (the server
   * will not read one back), so a full-form save would clear every credential
   * on the platform the first time anybody adjusted a markup.
   */
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [seeded, setSeeded] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const act = useAction(errorText);

  useEffect(() => {
    if (status && !seeded) setSeeded(true);
  }, [status, seeded]);

  const entries = useMemo(() => new Map((status?.entries ?? []).map((e) => [e.key, e])), [status]);
  const known = useMemo(() => new Set(GROUPS.flatMap((g) => g.keys)), []);
  const other = (status?.entries ?? []).filter((e) => !known.has(e.key)).map((e) => e.key);
  const groups = other.length
    ? [...GROUPS, { title: "Other", hint: "Shared keys this console has no label for yet.", keys: other }]
    : GROUPS;

  const changed = Object.keys(draft).filter((k) => draft[k] !== (entries.get(k)?.value ?? ""));
  const overrides = (status?.entries ?? []).filter((e) => e.overriddenHere);

  const save = () =>
    act.run("save", async () => {
      const patch: Record<string, string> = {};
      for (const k of changed) patch[k] = draft[k] ?? "";
      await api.post("/api/admin/shared-config", { patch });
      setDraft({});
      reload();
      return `Saved to the shared store — ${changed.length === 1 ? "1 setting" : `${changed.length} settings`} now apply to every app.`;
    }, "Couldn't save the shared platform config.");

  /**
   * Hand one key back to the shared store.
   *
   * The action the model needed and could not express: a local row wins, so an
   * app that already has its own value ignores whatever is set here — and most
   * of the per-app panels cannot clear their own field (the AI panel only
   * writes a non-empty key; the email panel validates its sender against a
   * regex a blank fails). This screen is the one that knows a key is overridden,
   * so it is the one that can un-override it.
   */
  const useShared = (k: string) =>
    act.run(`drop:${k}`, async () => {
      await api.del(`/api/admin/shared-config/local/${encodeURIComponent(k)}`);
      reload();
      return `${LABELS[k] ?? k}: this app now uses the shared value.`;
    }, "Couldn't hand that setting back to the shared store.");

  const set = (k: string, v: string) => setDraft((d) => ({ ...d, [k]: v }));
  const shown = (e: Entry) => draft[e.key] ?? (e.secret ? "" : (e.value ?? ""));

  return (
    <>
      <Stagger className="space-y-3">
        {error && !status ? (
          <LoadError what="the shared platform config" error={error} onRetry={reload} />
        ) : (
          <Reveal
            loading={loading}
            skeleton={
              <Card className="space-y-3">
                <div className="flex items-center gap-2.5"><Skeleton className="size-9 rounded-2xl" /><SkeletonLine w="12rem" h="title" /></div>
                <Skeleton className="h-20 w-full rounded-2xl" />
                {[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
              </Card>
            }
          >
            {status && (
              <Card className="space-y-4">
                <SectionHeader
                  icon={Globe}
                  title="Shared platform config"
                  action={<Badge tone={status.wired ? "success" : "warning"}>{status.wired ? "live" : "not wired"}</Badge>}
                />
                <p className="text-sm text-muted-foreground">
                  One value, read by <span className="font-medium text-foreground">every 4DL app</span>. Set the Gemini
                  key, the Stripe account, the Cloudflare token or the Turnstile widget here and no other product needs
                  configuring. This app&apos;s own settings still take precedence over anything below.
                </p>

                {!status.wired && (
                  <Callout tone="warning" icon={AlertTriangle} live="alert">
                    This deployment has no shared store bound, so nothing here can be saved yet. Run{" "}
                    <span className="font-medium text-foreground">Actions → &ldquo;Provision an app on Cloudflare&rdquo;</span>{" "}
                    for this app; it creates the namespace and binds it. Every app already reads its own settings as
                    before — nothing is broken in the meantime.
                  </Callout>
                )}

                <Callout tone="neutral" icon={Info}>
                  The per-app panels in this console show only what <span className="font-medium text-foreground">this</span>{" "}
                  app holds of its own. A key set here and not overridden reads as unset there — that is the panel being
                  literal, not the value being missing.
                </Callout>

                {overrides.length > 0 && (
                  <Callout tone="warning" icon={Info}>
                    {overrides.length === 1 ? "One setting is" : `${overrides.length} settings are`} overridden on this app
                    and will ignore whatever is stored here: {overrides.map((e) => LABELS[e.key] ?? e.key).join(", ")}.
                    Clear them on their own panel to fall back to the shared value.
                  </Callout>
                )}

                {groups.map((g) => (
                  <FieldGroup key={g.title} title={g.title} hint={g.hint}>
                    {g.keys.map((k) => {
                      const e = entries.get(k);
                      if (!e) return null;
                      return (
                        <div key={k} className="space-y-1">
                          <Field
                            label={
                              e.secret
                                ? `${LABELS[k] ?? k}${e.shared ? ` — stored ••••${e.last4 ?? ""} (blank keeps it)` : ""}`
                                : (LABELS[k] ?? k)
                            }
                            icon={e.secret ? KeyRound : undefined}
                            type={e.secret ? "password" : "text"}
                            value={shown(e)}
                            onChange={(ev) => set(k, ev.target.value)}
                            disabled={!status.wired}
                            hint={e.secret ? undefined : `Stored as ${k}`}
                          />
                          {e.overriddenHere && (
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <Badge tone="warning">overridden here</Badge>
                              <span className="min-w-0 flex-1">This app has its own value and ignores the shared one.</span>
                              <Button size="sm" variant="outline" disabled={act.busy !== null} onClick={() => void useShared(k)}>
                                {act.busy === `drop:${k}` ? <><Spinner className="size-3" /> …</> : "Use shared"}
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </FieldGroup>
                ))}

                <Button
                  className="min-h-12 w-full"
                  disabled={!status.wired || act.busy !== null || changed.length === 0}
                  onClick={() => setConfirming(true)}
                >
                  {act.busy === "save" ? <><Spinner className="size-4" /> Saving…</> : changed.length ? `Save ${changed.length} to every app` : "Save"}
                </Button>

                {error && <Callout tone="warning" icon={AlertTriangle} live="alert">{error} Showing the last values that loaded.</Callout>}
                <ActionResult msg={act.msg} err={act.err} />
              </Card>
            )}
          </Reveal>
        )}
      </Stagger>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Save to every app?"
        description={
          `${changed.length === 1 ? "This setting" : `These ${changed.length} settings`} apply to every 4DL product on this ` +
          "platform, not just this one. A wrong value here is wrong everywhere at once, and it can take up to a minute to " +
          "propagate. Apps with their own value for a setting keep it."
        }
        confirmLabel="Save to every app"
        onConfirm={() => void save()}
      />
    </>
  );
}

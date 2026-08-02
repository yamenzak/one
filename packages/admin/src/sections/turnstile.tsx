/**
 * THE BOT CHECK ON SIGN-IN — Cloudflare Turnstile.
 *
 * `@4dl/auth` owns `turnstileAdminRoutes` and the verification itself. What did
 * not exist was a screen, so the feature was configurable only by writing to
 * `app_config` by hand — the same shape of gap as email delivery before its
 * panel, and on a surface that is a security control.
 *
 * ── Two keys, and only one combination is dangerous ─────────────────────────
 *
 * The SECRET is what switches enforcement on server-side. The SITE KEY is what
 * makes the widget render. Store a secret with no site key and the server starts
 * demanding a token that the login screen has no widget to produce — which means
 * **nobody can request a sign-in code**, on a platform whose only way in is a
 * sign-in code. That is a lockout, it is one field away at all times, and it is
 * why this panel names it in red rather than showing a neutral "partial" badge.
 *
 * The reverse (site key, no secret) is merely theatre: the widget renders,
 * nothing is verified. Worth saying, not worth shouting.
 */

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  ActionResult, AlertTriangle, Badge, Button, Callout, Card, CircleCheck, ConfigRow, ConfirmDialog, Field,
  FieldGroup, Info, KeyRound, LoadError, Reveal, SectionHeader, ShieldCheck, Skeleton, SkeletonLine, Spinner,
  Stagger, useAction, useLoad, type Tone,
} from "@4dl/ui";
import { AdminDepsProvider, useAdminDeps, type AdminDeps } from "../deps.js";

interface TurnstileStatus { siteKey: string | null; secretSet: boolean }

export interface TurnstileSectionProps extends AdminDeps {
  /**
   * Anything the app wants below the bot check in the same section — Kova puts
   * its platform reset here. Deliberately a slot rather than a feature: wiping a
   * deployment is not something a shared package should know how to do.
   */
  extra?: ReactNode;
}

export function PlatformTurnstileSection({ api, errorText, extra }: TurnstileSectionProps) {
  return (
    <AdminDepsProvider value={{ api, errorText }}>
      <TurnstileConfig extra={extra} />
    </AdminDepsProvider>
  );
}

function TurnstileConfig({ extra }: { extra?: ReactNode }) {
  const { api, errorText } = useAdminDeps();
  const load = useCallback(() => api.get<TurnstileStatus>("/api/admin/turnstile/config"), [api]);
  const { data: status, error, loading, reload } = useLoad(load, "the Turnstile configuration", errorText);
  const [siteKey, setSiteKey] = useState("");
  const [secret, setSecret] = useState("");
  const [seeded, setSeeded] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const act = useAction(errorText);

  useEffect(() => {
    if (status && !seeded) { setSiteKey(status.siteKey ?? ""); setSeeded(true); }
  }, [status, seeded]);

  const save = () =>
    act.run("save", async () => {
      // Both are sent so an emptied site-key box clears it; the secret is only
      // sent when typed, so a blank box keeps the stored one.
      await api.post("/api/admin/turnstile/config", { siteKey, ...(secret ? { secret } : {}) });
      setSecret("");
      reload();
      return "Saved. New sign-ins run the check as soon as a secret is stored.";
    }, "Couldn't save the Turnstile configuration.");

  const disable = () =>
    act.run("disable", async () => {
      await api.post("/api/admin/turnstile/config", { siteKey: "", secret: "" });
      setSiteKey("");
      setSecret("");
      reload();
      return "Turnstile is off. Sign-in codes send without a challenge.";
    }, "Couldn't turn Turnstile off.");

  const lockout = !!status && status.secretSet && !status.siteKey;
  const badge: { tone: Tone; label: string } = !status
    ? { tone: "neutral", label: "…" }
    : lockout
      ? { tone: "danger", label: "misconfigured" }
      : status.secretSet
        ? { tone: "success", label: "enforcing" }
        : status.siteKey
          ? { tone: "warning", label: "not enforcing" }
          : { tone: "neutral", label: "off" };

  return (
    <>
      <Stagger className="space-y-3">
        {error && !status ? (
          <LoadError what="the Turnstile configuration" error={error} onRetry={reload} />
        ) : (
          <Reveal
            loading={loading}
            skeleton={
              <Card className="space-y-3">
                <div className="flex items-center gap-2.5"><Skeleton className="size-9 rounded-2xl" /><SkeletonLine w="10rem" h="title" /></div>
                <Skeleton className="h-20 w-full rounded-2xl" />
                {[0, 1].map((i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
              </Card>
            }
          >
            {status && (
              <Card className="space-y-4">
                <SectionHeader icon={ShieldCheck} title="Turnstile bot check" action={<Badge tone={badge.tone}>{badge.label}</Badge>} />
                <p className="text-sm text-muted-foreground">
                  A Cloudflare Turnstile widget guards the email-code request on every login, on every door. The{" "}
                  <span className="font-medium text-foreground">secret</span> is what switches enforcement on; the{" "}
                  <span className="font-medium text-foreground">site key</span> is what makes the widget appear. You need both.
                </p>

                <div className="space-y-2.5 rounded-2xl bg-surface-2 p-3.5">
                  <ConfigRow label="Site key (public)" ok={!!status.siteKey} detail={status.siteKey ?? "Handed to the login screen so the widget can render."} />
                  <ConfigRow label="Secret key (server)" ok={status.secretSet} detail="Write-only. Enforcement is on whenever this is stored." okLabel="Stored" />
                </div>

                {lockout ? (
                  <Callout tone="danger" icon={AlertTriangle} live="alert">
                    A secret is stored with no site key, so the server demands a token the login screen can&apos;t produce —{" "}
                    <span className="font-semibold">nobody can request a sign-in code.</span> Add the site key, or turn Turnstile off.
                  </Callout>
                ) : status.secretSet ? (
                  <Callout tone="success" icon={CircleCheck}>Enforcing on every sign-in code request.</Callout>
                ) : status.siteKey ? (
                  <Callout tone="warning" icon={Info}>
                    The widget will render but nothing is verified server-side — codes still send freely. Store the secret to enforce it.
                  </Callout>
                ) : (
                  <Callout tone="neutral" icon={Info}>Off — sign-in codes send with no challenge.</Callout>
                )}

                <FieldGroup title="Cloudflare setup" hint="List every door this deployment serves — and any tenant custom domains — under the widget's Hostnames, or use a domain-flexible widget, so the check works on white-label domains too.">
                  <Field label="Site key" icon={ShieldCheck} value={siteKey} onChange={(e) => setSiteKey(e.target.value)} placeholder="0x4AAAAAAA…" hint="Public — it is handed to the login screen so the widget can render." />
                  <Field
                    label={status.secretSet ? "Secret key — stored (blank keeps it)" : "Secret key"}
                    icon={KeyRound}
                    type="password"
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    placeholder="0x4AAAAAAA…"
                  />
                  <div className="flex gap-2">
                    <Button className="min-h-12 flex-1" disabled={act.busy !== null || (!siteKey && !secret)} onClick={() => void save()}>
                      {act.busy === "save" ? <><Spinner className="size-4" /> Saving…</> : "Save"}
                    </Button>
                    {status.secretSet && (
                      <Button variant="outline" className="min-h-12" disabled={act.busy !== null} onClick={() => setConfirmOff(true)}>
                        {act.busy === "disable" ? <><Spinner className="size-4" /> …</> : "Turn off"}
                      </Button>
                    )}
                  </div>
                </FieldGroup>

                {error && <Callout tone="warning" icon={AlertTriangle} live="alert">{error} Showing the last values that loaded.</Callout>}
                <ActionResult msg={act.msg} err={act.err} />
              </Card>
            )}
          </Reveal>
        )}

        {extra}
      </Stagger>

      <ConfirmDialog
        open={confirmOff}
        onOpenChange={setConfirmOff}
        title="Turn Turnstile off?"
        description="This clears both keys, so every login goes back to sending an email code with no bot check. The per-email cooldown and per-IP hourly cap still apply."
        confirmLabel="Turn off"
        destructive
        onConfirm={() => void disable()}
      />
    </>
  );
}

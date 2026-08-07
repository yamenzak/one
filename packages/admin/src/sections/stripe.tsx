/**
 * STRIPE — the platform rail every 4DL app bills its tenants on.
 *
 * ── Why this is a package panel and not each app's ──────────────────────────
 *
 * `/admin/stripe/status`, `/admin/stripe/config` and `/admin/stripe/sync` are
 * `@4dl/billing`'s endpoints, identical in every app that has them. Kova grew a
 * 400-line panel over them; Tessa, facing the same three endpoints, shipped
 *
 *     <pre>{JSON.stringify(data, null, 2)}</pre>
 *
 * plus three text boxes — which is what an operator console looks like when the
 * shared package ships the routes and leaves the surface to be reinvented. The
 * two lanes, the mismatch detection, the write-only key handling and the rebuild
 * repair are not Kova insights; they are facts about Stripe. They belong here.
 *
 * ── Two lanes, one switch ───────────────────────────────────────────────────
 *
 * Test and live keys are stored SEPARATELY and both at once, so going live is a
 * mode change rather than a re-paste under pressure. `laneMismatch` is the state
 * worth shouting about: an `sk_live_` key active while the mode says `test`
 * means real money is moving under a label that says it is not.
 *
 * Test and live products/prices are separate objects in Stripe, so the catalog
 * has to be synced per lane — hence the reminder after every flip.
 *
 * ── `Rebuild prices` is a repair, not a refresh ─────────────────────────────
 *
 * Ordinary sync SKIPS a row that already holds a price id, so a row pointing at
 * a product deleted by hand reports "0 synced" while every checkout fails with
 * "No such price" — the catalog looks synced and is not. Rebuild nulls the ids
 * and recreates them, which mints NEW prices: anyone already subscribed keeps
 * their old price until they re-subscribe. That is why it sits below the
 * ordinary sync, behind a confirmation.
 */

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle, Badge, Button, Callout, Card, CircleCheck, ConfirmDialog, CreditCard, Field, FieldGroup,
  KeyRound, LoadError, Percent, Reveal, SectionHeader, SegmentedControl, Skeleton, SkeletonLine, Spinner,
  Stagger, Wallet, cn,
} from "@4dl/ui";
import { AdminDepsProvider, useAdminDeps, type AdminDeps } from "../deps.js";

type StripeLane = "test" | "live";
type StripeMode = StripeLane | "disabled";
type LaneCreds = { secretKey: string; publishableKey: string; webhookSecret: string };
interface LaneStatus {
  secretKey: boolean;
  publishableKey: boolean;
  webhookSecret: boolean;
  complete: boolean;
  secretKeyLast4: string | null;
  publishableKeyLast4: string | null;
  secretKeyLane: StripeLane | null;
  publishableKeyLane: StripeLane | null;
}
interface StripeStatusView {
  mode: StripeMode;
  enabled: boolean;
  activeLane: StripeLane;
  keyLane: StripeLane | null;
  laneMismatch: boolean;
  activeLaneComplete: boolean;
  lanes: Record<StripeLane, LaneStatus>;
  legacy: LaneStatus;
  active: LaneStatus & { lane: StripeLane; sources: Record<keyof LaneCreds, "lane" | "legacy" | "none"> };
  platformFeeBps: number;
}

const EMPTY_CREDS: LaneCreds = { secretKey: "", publishableKey: "", webhookSecret: "" };
const CRED_LABEL: Record<keyof LaneCreds, string> = {
  secretKey: "secret key",
  publishableKey: "publishable key",
  webhookSecret: "platform webhook secret",
};
const CRED_KEYS = Object.keys(CRED_LABEL) as (keyof LaneCreds)[];
const nonEmpty = (c: LaneCreds): Partial<LaneCreds> => Object.fromEntries(Object.entries(c).filter(([, v]) => v.trim() !== ""));
const hasAny = (c: LaneCreds) => Object.keys(nonEmpty(c)).length > 0;
/** "stored ••3f9a — blank keeps it" / "not set", per field. */
const storedHint = (present: boolean, last4: string | null, viaLegacy: boolean): string =>
  present ? `stored${last4 ? ` ••${last4}` : ""}${viaLegacy ? " (from the pre-lane key)" : ""} — leave blank to keep it` : "not set";

export interface StripeSectionProps extends AdminDeps {
  /**
   * What this deployment is called, for the one sentence that has to name it:
   * "tenants paying <platform>". Defaults to something true of any app.
   */
  platformName?: string;
}

export function PlatformStripeSection({ api, errorText, platformName = "the platform" }: StripeSectionProps) {
  return (
    <AdminDepsProvider value={{ api, errorText }}>
      <StripeConfig platformName={platformName} />
    </AdminDepsProvider>
  );
}

function StripeConfig({ platformName }: { platformName: string }) {
  const { api, errorText } = useAdminDeps();
  const [status, setStatus] = useState<StripeStatusView | null>(null);
  const [mode, setMode] = useState<StripeMode>("test");
  const [editLane, setEditLane] = useState<StripeLane>("test");
  const [creds, setCreds] = useState<Record<StripeLane, LaneCreds>>({ test: { ...EMPTY_CREDS }, live: { ...EMPTY_CREDS } });
  const [feeBps, setFeeBps] = useState("");
  const [busy, setBusy] = useState<"save" | "sync" | "resync" | "flip" | null>(null);
  const [flipping, setFlipping] = useState<StripeMode | null>(null);
  const [flipTo, setFlipTo] = useState<StripeMode | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const apply = useCallback((s: StripeStatusView) => {
    setStatus(s);
    setMode(s.mode);
    setEditLane(s.mode === "disabled" ? "test" : s.mode);
    if (typeof s.platformFeeBps === "number") setFeeBps(String(s.platformFeeBps));
  }, []);
  const loadStatus = useCallback(async () => apply(await api.get<StripeStatusView>("/api/admin/stripe/status")), [apply, api]);
  // A load failure needs a retry, not just a line of red text: without the status
  // this whole panel is guesswork about which lane is live.
  useEffect(() => {
    let alive = true;
    setLoadErr(null);
    api.get<StripeStatusView>("/api/admin/stripe/status")
      .then((s) => { if (alive) apply(s); })
      .catch((e) => { if (alive) setLoadErr(errorText(e, "Could not read the Stripe status")); });
    return () => { alive = false; };
  }, [apply, nonce, api, errorText]);

  const setCred = (lane: StripeLane, k: keyof LaneCreds, v: string) => setCreds((c) => ({ ...c, [lane]: { ...c[lane], [k]: v } }));

  // Keys are write-only (never read back), so only send what was actually typed —
  // otherwise saving the fee would blank a key that is already stored. Both lanes
  // go in one request, so test and live can be filled in before any flip.
  const save = async () => {
    setBusy("save");
    setErr(null);
    setMsg(null);
    try {
      const fee = feeBps.trim() === "" ? undefined : Number(feeBps);
      if (fee !== undefined && (!Number.isInteger(fee) || fee < 0 || fee > 10000)) {
        setErr("Platform fee must be a whole number of basis points between 0 and 10000.");
        return;
      }
      const r = await api.post<{ status: StripeStatusView }>("/api/admin/stripe/config", {
        mode,
        lanes: {
          ...(hasAny(creds.test) ? { test: nonEmpty(creds.test) } : {}),
          ...(hasAny(creds.live) ? { live: nonEmpty(creds.live) } : {}),
        },
        ...(fee !== undefined ? { platformFeeBps: fee } : {}),
      });
      setCreds({ test: { ...EMPTY_CREDS }, live: { ...EMPTY_CREDS } });
      if (r?.status) apply(r.status); else await loadStatus();
      setMsg("Saved. Run Sync catalog to push plans + credit packs to Stripe for the active lane.");
    } catch (e) {
      setErr(errorText(e, "Could not save the Stripe configuration"));
    } finally {
      setBusy(null);
    }
  };

  /** The flip: one request that changes nothing but the active lane. */
  const flip = async (target: StripeMode) => {
    setBusy("flip");
    setFlipping(target);
    setErr(null);
    setMsg(null);
    try {
      const r = await api.post<{ status: StripeStatusView; catalogSwapped?: boolean }>("/api/admin/stripe/config", { mode: target });
      if (r?.status) apply(r.status); else await loadStatus();
      setMsg(
        target === "disabled"
          ? "Payments are now disabled. No checkout will start."
          : `Now on the ${target} lane, using the ${target} keys already stored.${r?.catalogSwapped ? " Catalog ids were swapped to that lane — run Sync catalog if a plan or pack has none yet." : ""}`,
      );
    } catch (e) {
      setErr(errorText(e, "Could not switch lane"));
    } finally {
      setBusy(null);
      setFlipping(null);
    }
  };

  const [confirmRebuild, setConfirmRebuild] = useState(false);

  const sync = async (resyncPrices = false) => {
    setBusy(resyncPrices ? "resync" : "sync");
    setErr(null);
    setMsg(null);
    try {
      const r = await api.post<{ plans: number; packs: number; renamed?: number; renameFailed?: number; cleared?: number; clearedPacks?: number }>("/api/admin/stripe/sync", resyncPrices ? { resyncPrices: true } : {});
      // `renamed` is reported separately because "0 created" is the NORMAL
      // outcome of a rename-only sync, and without this line it reads as "the
      // button did nothing".
      const created = `Synced ${r.plans} plans + ${r.packs} credit packs into the ${status?.activeLane ?? "active"} lane.`;
      const renamedLine = r.renamed ? ` Renamed ${r.renamed} existing product${r.renamed === 1 ? "" : "s"} in Stripe to match the catalog.` : "";
      // A rename that could not be applied is almost always a row carrying ids
      // from the OTHER lane, or a product deleted in the Stripe dashboard. Say
      // so: it is the single most useful diagnostic here, and it used to abort
      // the whole sync with an unexplained 500 instead of being reported.
      const failedLine = r.renameFailed
        ? ` ${r.renameFailed} product${r.renameFailed === 1 ? " could" : "s could"} not be renamed — those rows point at Stripe products that don't exist in the ${status?.activeLane ?? "active"} lane. Use “Rebuild prices” below to recreate them.`
        : "";
      const rebuiltLine = (r.cleared ?? 0) + (r.clearedPacks ?? 0) > 0
        ? ` Rebuilt ${r.cleared} plan${r.cleared === 1 ? "" : "s"} and ${r.clearedPacks} credit pack${r.clearedPacks === 1 ? "" : "s"} from scratch.`
        : "";
      setMsg(`${created}${renamedLine}${failedLine}${rebuiltLine}`);
    } catch (e) {
      setErr(errorText(e, "Catalog sync failed"));
    } finally {
      setBusy(null);
    }
  };

  // Mirrors the server's write-path refusal: a key whose prefix names the other
  // lane is rejected, so warn before the round-trip.
  const typedLaneClash = (["test", "live"] as const).filter((lane) => {
    const other = lane === "test" ? "live" : "test";
    return creds[lane].secretKey.startsWith(`sk_${other}_`) || creds[lane].publishableKey.startsWith(`pk_${other}_`);
  });
  const laneOf = (l: StripeLane) => status?.lanes[l];
  const missingActive = status && status.mode !== "disabled" ? CRED_KEYS.filter((k) => !status.active[k]) : [];
  const targets: StripeMode[] = status ? (["test", "live", "disabled"] as StripeMode[]).filter((m) => m !== status.mode) : [];

  if (loadErr && !status) {
    return <Stagger><LoadError what="the Stripe status" error={loadErr} onRetry={() => setNonce((n) => n + 1)} /></Stagger>;
  }

  return (
    <>
      <Stagger className="space-y-3">
        <Reveal
          loading={!status}
          className="space-y-3"
          skeleton={
            <>
              {[0, 1].map((i) => (
                <Card key={i} className="space-y-3">
                  <div className="flex items-center justify-between"><SkeletonLine w="6rem" h="title" /><Skeleton className="h-6 w-24 rounded-full" /></div>
                  <SkeletonLine w="95%" h="xs" /><SkeletonLine w="70%" h="xs" />
                  <Skeleton className="h-12 w-full rounded-xl" />
                </Card>
              ))}
            </>
          }
        >
          {status && (
            <div className="space-y-3">
              {/* ── What is actually in force right now ─────────────────── */}
              <Card className="space-y-3">
                <SectionHeader
                  icon={CreditCard}
                  title="Stripe"
                  action={
                    <Badge tone={status.mode === "disabled" ? "neutral" : status.laneMismatch || !status.activeLaneComplete ? "warning" : "success"}>
                      {status.mode === "disabled" ? "Payments disabled" : `${status.mode === "live" ? "Live" : "Test"} · active`}
                    </Badge>
                  }
                />
                <p className="text-caption text-muted-foreground" role="status" aria-live="polite">
                  {status.mode === "disabled"
                    ? "No checkout can start. Store a lane's keys below, then switch to it."
                    : status.activeLaneComplete
                      ? `All ${status.mode} credentials are in place${status.keyLane ? `, and the active secret key really is a ${status.keyLane}-mode key` : ""}. Real money ${status.mode === "live" ? "does" : "does not"} move in this lane.`
                      : `The ${status.mode} lane is incomplete: no ${missingActive.map((k) => CRED_LABEL[k]).join(", ")}.`}
                </p>
                {loadErr && <Callout tone="warning" icon={AlertTriangle} live="alert">{loadErr}. Showing the last status that loaded.</Callout>}
                {status.laneMismatch && (
                  <Callout tone="danger" icon={AlertTriangle} live="alert">
                    The key that is active is a <b>{status.keyLane}</b>-mode key while the mode says <b>{status.mode}</b>.{" "}
                    {status.keyLane === "live" ? "Real charges are being taken under a test label." : "Nothing you charge is real."}{" "}
                    Store matching keys in the {status.mode} lane, or switch to {status.keyLane} mode.
                  </Callout>
                )}
                <div className="flex flex-wrap gap-1.5" aria-label="Credentials stored per lane">
                  {(["test", "live"] as const).map((lane) => (
                    <Badge key={lane} tone={laneOf(lane)?.complete ? "success" : laneOf(lane)?.secretKey ? "warning" : "neutral"}>
                      {lane}: {laneOf(lane)?.complete ? "all 3 stored" : `${CRED_KEYS.filter((k) => laneOf(lane)?.[k]).length}/3 stored`}
                    </Badge>
                  ))}
                  {status.legacy.secretKey && <Badge tone="neutral">pre-lane keys present (used as a fallback)</Badge>}
                </div>
              </Card>

              {/* ── The flip: one action, and what it does ──────────────── */}
              <Card className="space-y-3">
                <SectionHeader icon={Wallet} title="Active lane" />
                <p className="text-caption text-muted-foreground">
                  Switching lane changes which stored credentials every payment path uses — nothing is re-pasted. Test and
                  live products and prices are <b>separate objects</b> in Stripe, so run <b>Sync catalog</b> after a switch
                  (ids are kept per lane, so a lane you have already synced comes back with its own).
                </p>
                <div className="flex flex-wrap gap-2">
                  {targets.map((t) => (
                    <Button
                      key={t}
                      variant={t === "disabled" ? "outline" : "default"}
                      className="min-h-12 flex-1"
                      disabled={busy !== null}
                      onClick={() => setFlipTo(t)}
                    >
                      {flipping === t ? <><Spinner className="size-4" /> Switching…</> : t === "disabled" ? "Disable payments" : `Switch to ${t}`}
                    </Button>
                  ))}
                </div>
                {status.mode !== "disabled" && !status.activeLaneComplete && (
                  <Callout tone="warning" icon={AlertTriangle} live="alert">
                    Finish the {status.mode} lane before taking a real payment — {missingActive.map((k) => CRED_LABEL[k]).join(", ")} missing.
                  </Callout>
                )}
              </Card>

              {/* ── Per-lane credential editor ──────────────────────────── */}
              <Card className="space-y-4">
                <SectionHeader icon={KeyRound} title="Credentials" />
                <p className="text-caption text-muted-foreground">
                  Each lane has its own keys and its own webhook secret. Fill in both lanes once and switching is a
                  one-click mode change. Keys are stored write-only — a blank field keeps what is saved.
                </p>
                <SegmentedControl
                  fill
                  options={[{ value: "test", label: "Test lane" }, { value: "live", label: "Live lane" }]}
                  value={editLane}
                  onChange={(v) => setEditLane(v as StripeLane)}
                />
                {(["test", "live"] as const).map((lane) =>
                  lane !== editLane ? null : (
                    <div key={lane} className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-caption font-medium">Editing the <b>{lane}</b> lane{status.mode === lane ? " (currently active)" : ""}</span>
                        {hasAny(creds[lane]) && <Badge tone="primary">unsaved</Badge>}
                      </div>
                      <Field
                        label={`${lane} secret key (sk_${lane}_…)`}
                        icon={KeyRound}
                        value={creds[lane].secretKey}
                        onChange={(e) => setCred(lane, "secretKey", e.target.value)}
                        hint={storedHint(!!laneOf(lane)?.secretKey, laneOf(lane)?.secretKeyLast4 ?? null, false)}
                        placeholder={`sk_${lane}_…`}
                      />
                      <Field
                        label={`${lane} publishable key (pk_${lane}_…)`}
                        icon={KeyRound}
                        value={creds[lane].publishableKey}
                        onChange={(e) => setCred(lane, "publishableKey", e.target.value)}
                        hint={storedHint(!!laneOf(lane)?.publishableKey, laneOf(lane)?.publishableKeyLast4 ?? null, false)}
                        placeholder="required for in-app payments"
                      />
                      <div className="space-y-2 rounded-2xl bg-surface-2 p-3">
                        <div className="text-caption font-medium">Webhook signing secret ({lane})</div>
                        {/*
                          ONE endpoint, and a separate secret per lane.

                          This paragraph used to describe two endpoints and a
                          "Connect secret" whose absence meant "a payment
                          succeeds and no access is granted" — copy that outlived
                          the rail it described. Stripe Connect was removed in
                          full; a tenant is paid on its own provider and registers
                          its own webhook there, which this console never sees.
                        */}
                        <p className="text-caption text-muted-foreground">
                          <code>/api/stripe/webhook</code> is where Stripe reports what tenants paid {platformName}. The
                          secret is per lane, so a test secret cannot verify a live event.
                        </p>
                        <Field
                          label={`Platform webhook secret (${lane})`}
                          icon={KeyRound}
                          value={creds[lane].webhookSecret}
                          onChange={(e) => setCred(lane, "webhookSecret", e.target.value)}
                          hint={storedHint(!!laneOf(lane)?.webhookSecret, null, false)}
                          placeholder="whsec_…"
                        />
                      </div>
                    </div>
                  ),
                )}
                {typedLaneClash.length > 0 && (
                  <Callout tone="warning" icon={AlertTriangle} live="alert">
                    The {typedLaneClash.join(" and ")} lane holds a key from the other mode — a <code>sk_live_</code>/<code>pk_live_</code> key
                    can only be stored in the live lane, and the reverse. This will be refused on save.
                  </Callout>
                )}

                <FieldGroup title="Mode to save with" hint="Saving applies this mode along with anything typed above. To change lane without touching credentials, use Active lane.">
                  <div className="flex gap-2" role="radiogroup" aria-label="Stripe mode">
                    {(["test", "live", "disabled"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        role="radio"
                        aria-checked={mode === m}
                        onClick={() => setMode(m)}
                        className={cn(
                          "min-h-12 flex-1 rounded-xl px-3 text-caption font-medium capitalize transition-colors",
                          mode === m ? "bg-primary text-primary-foreground" : "bg-secondary",
                        )}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </FieldGroup>

                <FieldGroup title="Platform fee" hint="Basis points (100 = 1%) taken from a payment the platform itself settles. 0 means none.">
                  <Field
                    label="Platform fee (basis points)"
                    icon={Percent}
                    inputMode="numeric"
                    value={feeBps}
                    onChange={(e) => setFeeBps(e.target.value.replace(/[^\d]/g, ""))}
                    placeholder="0"
                    hint={feeBps.trim() === "" ? "Blank leaves the stored fee unchanged." : `${(Number(feeBps) / 100).toFixed(2)}%`}
                  />
                </FieldGroup>

                <div className="flex gap-3">
                  <Button className="min-h-12 flex-1" disabled={busy !== null} onClick={() => void save()}>
                    {busy === "save" ? <><Spinner className="size-4" /> Saving…</> : "Save"}
                  </Button>
                  <Button variant="outline" className="min-h-12 flex-1" disabled={busy !== null || !status.enabled} onClick={() => void sync()}>
                    {busy === "sync" ? <><Spinner className="size-4" /> Syncing…</> : "Sync catalog"}
                  </Button>
                </div>

                {/* The repair, deliberately below the ordinary sync and behind a
                    confirmation: it is the right answer to "0 synced but nothing
                    works", and the wrong answer to almost everything else. */}
                <Button
                  variant="ghost"
                  className="min-h-12 w-full"
                  disabled={busy !== null || !status.enabled}
                  onClick={() => setConfirmRebuild(true)}
                >
                  {busy === "resync" ? <><Spinner className="size-4" /> Rebuilding…</> : "Rebuild prices from scratch"}
                </Button>
                <p className="-mt-1 text-caption text-muted-foreground">
                  Use this when Sync reports products it can&rsquo;t find — after deleting them in Stripe, or
                  switching lanes. It recreates every plan and pack, and mints new prices.
                </p>
                <ConfirmDialog
                  open={confirmRebuild}
                  onOpenChange={setConfirmRebuild}
                  title="Rebuild every price?"
                  description={`This clears the stored Stripe ids for all active plans and credit packs and recreates them in the ${status?.activeLane ?? "active"} lane. Anyone already subscribed keeps the price they signed up on until they re-subscribe — new sign-ups use the new prices.`}
                  confirmLabel="Rebuild prices"
                  cancelLabel="Cancel"
                  destructive
                  onConfirm={() => { setConfirmRebuild(false); void sync(true); }}
                />
                {err && <Callout tone="danger" icon={AlertTriangle} live="alert">{err}</Callout>}
                {msg && !err && <Callout tone="success" icon={CircleCheck} live="status">{msg}</Callout>}
              </Card>
            </div>
          )}
        </Reveal>
      </Stagger>

      <ConfirmDialog
        open={flipTo !== null}
        onOpenChange={(o) => !o && setFlipTo(null)}
        title={flipTo === "disabled" ? "Disable payments?" : `Switch payments to ${flipTo}?`}
        description={
          flipTo === "disabled"
            ? "Checkout stops: no plan or credit-pack purchase can start. Stored keys are kept."
            : `Every payment path switches to the ${flipTo} keys and the ${flipTo} webhook secret already stored — nothing is re-pasted.${flipTo && status?.lanes[flipTo as StripeLane] && !status.lanes[flipTo as StripeLane].complete ? ` That lane is incomplete (${CRED_KEYS.filter((k) => !status.lanes[flipTo as StripeLane][k]).map((k) => CRED_LABEL[k]).join(", ")} missing), and any gap fails silently at payment time.` : ""} Test and live products/prices are separate objects in Stripe, so run Sync catalog afterwards.`
        }
        confirmLabel={flipTo === "disabled" ? "Disable" : `Switch to ${flipTo}`}
        destructive={flipTo === "live" || flipTo === "disabled"}
        onConfirm={() => { if (flipTo) void flip(flipTo); }}
      />
    </>
  );
}

/**
 * First-run tenant onboarding — the screen a signed-in user with no studio gets,
 * and the one they resume on at `/studio/setup`.
 *
 * This replaced a single thin card that was half-addressed to end users ("Ask
 * your coach to invite you — your space appears here the moment they do"). That
 * card is gone for two reasons: this screen is now exclusively for someone setting
 * up a *business*, and an invited client or staffer never reaches it any more —
 * `/api/context` auto-links the client record, auto-accepts the staff invitation,
 * and adopts a sole membership, so they land straight in the app.
 *
 * ── Three steps, and why the studio is created between 2 and 3 ────────────────
 *
 *   1. Your studio      — name it. Nothing is created yet.
 *   2. Choose a plan    — mandatory (there is no free tier to fall into).
 *   3. Start the trial  — PaymentSheet (setup mode for a trial, payment otherwise).
 *
 * Nothing is written until the owner leaves step 2, so Back out of either step is
 * lossless — the name and the chosen plan are held here, not on the server. The
 * studio is then created on the way into step 3, because a Stripe subscription
 * needs a tenant to attach to (`/billing/plan-intent` runs `requireTenant`).
 *
 * ── If step 3 is abandoned ───────────────────────────────────────────────────
 *
 * The studio EXISTS (created, owner assigned) and sits on the implicit free
 * baseline with the chosen plan recorded as `pending_plan_id`. Nothing is charged
 * and no paid entitlement is granted. That is deliberately not a dead end:
 *  • reloading `/studio/setup` resumes at step 2 with the plan preselected;
 *  • closing the tab still leaves a working studio, and Business → Overview
 *    offers the same plan checkout.
 * The alternative — no studio until payment clears — strands the owner with an
 * account that has nothing in it and no way back in.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  Callout,
  Field,
  Group,
  GroupNote,
  Row,
  Screen,
  Section,
  StepActions,
  StepHeader,
  StepPanel,
  TierAnchor,
  Anchor,
  TierContent,
  Spinner,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CreditCard,
  Gift,
  Info,
  Mail,
  Store,
} from "@kova/ui";
import { api, errorText, isOffline } from "../../api.js";
import { fmtPrice } from "../../money.js";
import { studioUrl, useSession } from "../../session.js";
import { PaymentSheet, type CheckoutIntent } from "../../PaymentSheet.js";
import { PlanStep, type PlansFeed } from "./PlanStep.js";
import { ONBOARDING_PATH } from "./paths.js";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

const usdToCents = (usd: number) => Math.round((usd ?? 0) * 100);

const STEPS = ["Your studio", "Choose a plan", "Start your plan"] as const;

/** Step 3's state machine. `pending` is the degrade lane — see `prepare()`. */
type Pay =
  | { k: "idle" }
  | { k: "preparing" }
  | { k: "error"; msg: string }
  | { k: "checkout"; intent: CheckoutIntent; title: string; label: string }
  | { k: "pending"; unconfigured: boolean; detail: string | null };

export function StudioOnboarding() {
  const { ctx, host, refresh, signOut } = useSession();
  const nav = useNavigate();

  // A signed-in visitor who is not a member of THIS branded domain's studio must
  // not be offered "start your business" under someone else's brand — on a
  // host-pinned domain `/api/context` deliberately never adopts a tenancy
  // (SPEC §14.1), so this is the state a client of studio A gets on studio B's
  // domain. Send them somewhere that makes sense instead.
  const strandedOnTenantDomain = Boolean(host?.tenant) && !ctx?.active;

  // A resumed onboarding (the studio exists, the plan step never completed) skips
  // straight to the plan step — step 1 has nothing left to ask. Lazy initial state
  // rather than an effect, so there's no frame of the wrong step.
  const [step, setStep] = useState(() => (ctx?.active ? 1 : 0));
  const [name, setName] = useState(ctx?.active?.tenantName ?? "");
  const [planId, setPlanId] = useState<string | null>(null);
  const [feed, setFeed] = useState<PlansFeed | null>(null);
  const [tenantReady, setTenantReady] = useState(Boolean(ctx?.active));
  const [pay, setPay] = useState<Pay>({ k: "idle" });
  // The Payment Element is mounted only once the owner asks for it, so the card
  // form isn't thrown at them the instant the step opens (and so dismissing it
  // returns to a summary they can re-launch, rather than a dead screen).
  const [sheetOpen, setSheetOpen] = useState(false);
  const [finishing, setFinishing] = useState(false);
  // The slug the SERVER stored — the studio's address, which `done()` sends the
  // owner to. Not the one we proposed: the retry path can land on a different one.
  const [studioSlug, setStudioSlug] = useState<string | null>(ctx?.active?.tenantSlug ?? null);

  // Resuming: the server tells us where this studio left off, so a reloaded
  // onboarding comes back with the plan already chosen rather than blank.
  const onFeed = useCallback((f: PlansFeed) => {
    setFeed(f);
    setPlanId((prev) => prev ?? f.current?.pendingPlanId ?? null);
    if (f.hasTenant) setTenantReady(true);
  }, []);

  const plan = feed?.plans.find((p) => p.id === planId) ?? null;

  /**
   * Create the studio if it doesn't exist yet. Idempotent within this flow.
   *
   * The slug is now the studio's ADDRESS (`<slug>.<root>`), so two things changed:
   * the server validates it against DNS-label rules and a reserved-label list
   * (`org-guard.ts`), and we keep the slug the server actually stored rather than
   * the one we proposed — the retry path below can end up with a different one, and
   * `done()` navigates to it.
   */
  const ensureStudio = useCallback(async (): Promise<void> => {
    if (tenantReady) return;
    const base = slugify(name) || `studio-${Date.now().toString(36)}`;
    const create = (slug: string) =>
      api.post<{ id?: string; slug?: string }>("/api/auth/organization/create", { name: name.trim(), slug });
    // A random suffix also rescues a REJECTED slug, not just a colliding one: a
    // studio literally named "API" or "Admin" slugifies onto a reserved label, and
    // `<base>-a1b2` clears it without interrogating the owner about DNS.
    let stored: string | null = null;
    try {
      stored = (await create(base))?.slug ?? base;
    } catch (e) {
      // The slug is unique platform-wide, so a common studio name collides. Before
      // retrying, check whether the studio actually landed — re-posting a create
      // that succeeded would give this owner two studios.
      const probe = await api.get<{ active: { tenantId: string; tenantSlug: string } | null }>("/api/context").catch(() => null);
      if (probe?.active) {
        stored = probe.active.tenantSlug;
      } else {
        if (isOffline(e)) throw e;
        const retry = `${base}-${Math.random().toString(36).slice(2, 6)}`;
        stored = (await create(retry))?.slug ?? retry;
      }
    }
    setStudioSlug(stored);
    setTenantReady(true);
    // From here on the studio EXISTS, so a reload must resume the wizard rather
    // than dropping into a studio with no plan. main.tsx keeps rendering this
    // screen for `/studio/setup` even once `ctx.active` is set — the URL is what
    // makes the half-finished state resumable, so claim it now.
    nav(ONBOARDING_PATH, { replace: true });
  }, [name, tenantReady, nav]);

  /**
   * Step 3 preparation: create the studio, record the plan, then get a client
   * secret. Runs once per (step, plan) pair.
   *
   * **The degrade rule.** On a fresh deploy Stripe has no keys, so no client
   * secret can exist. A mandatory paid step that hard-blocks there means *nobody
   * can ever create a studio* — the same bootstrap deadlock as the OTP one. So:
   * when the server says Stripe is off (`stripeEnabled: false`), or answers the
   * intent request with an error of its own (no synced price, Stripe unreachable),
   * we go to `pending`: the studio exists, the plan is recorded as pending, the
   * tenant stays on the FREE baseline, nothing is charged, and the screen says so
   * plainly. Only a request that never left the device (offline) is a hard error
   * with a retry — retrying is the right advice there, and degrading would hide a
   * problem that will fix itself.
   */
  const preparedFor = useRef<string | null>(null);
  const prepare = useCallback(async () => {
    if (!planId) return;
    setSheetOpen(false);
    setPay({ k: "preparing" });
    try {
      await ensureStudio();
    } catch (e) {
      setPay({ k: "error", msg: errorText(e, "Couldn't create your studio. Please try again.") });
      return;
    }
    let recorded: { stripeEnabled?: boolean; trialDays?: number; planName?: string };
    try {
      recorded = await api.post("/api/me/onboarding/plan", { planId });
    } catch (e) {
      setPay({ k: "error", msg: errorText(e, "Couldn't save your plan choice. Please try again.") });
      return;
    }
    if (!recorded.stripeEnabled) {
      setPay({ k: "pending", unconfigured: true, detail: null });
      return;
    }
    try {
      const r = await api.post<{
        clientSecret?: string;
        publishableKey?: string;
        mode?: "payment" | "setup";
        trialDays?: number | null;
      }>("/api/billing/plan-intent", { planId });
      if (!r.clientSecret || !r.publishableKey) {
        setPay({ k: "pending", unconfigured: false, detail: null });
        return;
      }
      const setup = r.mode === "setup";
      const days = typeof r.trialDays === "number" ? r.trialDays : 0;
      const price = plan ? fmtPrice(usdToCents(plan.priceUsdMonth)) : "";
      setPay({
        k: "checkout",
        intent: { clientSecret: r.clientSecret, publishableKey: r.publishableKey, mode: r.mode ?? "payment" },
        title: setup && days ? `Start your ${days}-day free trial` : `Subscribe to ${recorded.planName ?? plan?.name ?? "your plan"}`,
        label: setup ? (days ? `Start ${days}-day free trial` : "Save card") : `Subscribe · ${price}/mo`,
      });
    } catch (e) {
      if (isOffline(e)) {
        setPay({ k: "error", msg: errorText(e) });
        return;
      }
      setPay({ k: "pending", unconfigured: false, detail: errorText(e, "") || null });
    }
  }, [planId, plan, ensureStudio]);

  useEffect(() => {
    if (step !== 2 || !planId) return;
    const key = `${step}:${planId}`;
    if (preparedFor.current === key) return;
    preparedFor.current = key;
    void prepare();
  }, [step, planId, prepare]);

  /** Into the app. `refresh()` is what flips `ctx.active` on, and the navigate
   *  drops the `/studio/setup` path so main.tsx renders the Shell. */
  /**
   * Finish: hand the owner their studio's own ADDRESS, not `/` on the setup door.
   *
   * The wizard runs on `setup.<root>`, which is a platform door with no tenancy of
   * its own — so an in-app `nav("/")` would leave the owner on the one host where
   * their studio is not pinned, reading a signpost instead of their app. The studio
   * lives at `<slug>.<root>`, the session cookie is issued for the root so the hop
   * carries it, and the address is what they should bookmark and hand to clients.
   *
   * Falls back to an in-app navigation when the slug or root is somehow unknown
   * (offline `refresh`, a host probe that failed), because being left on a working
   * screen beats being sent to a URL we had to guess.
   */
  const done = useCallback(async () => {
    setFinishing(true);
    try {
      await refresh();
    } finally {
      const slug = studioSlug;
      const root = host?.rootDomain;
      if (slug && root) {
        location.assign(studioUrl(slug, root));
        return; // navigating away; leave `finishing` set so the button stays busy
      }
      setFinishing(false);
      nav("/", { replace: true });
    }
  }, [refresh, nav, studioSlug, host]);

  if (strandedOnTenantDomain) {
    return (
      <Screen center width="narrow" atmosphere="quiet">
        <TierAnchor className="pb-6 text-center">
          <p className="text-caption text-muted-foreground">Signed in as {ctx?.user.email}</p>
          <h1 className="mt-2 text-title-1">You&rsquo;re not on {host?.tenant?.name}&rsquo;s roster</h1>
        </TierAnchor>
        <Section>
          <Group>
            <Row icon={Mail} sub="Then sign in again with this address">
              Ask them to invite this email
            </Row>
            <Row icon={Store} sub="It opens the right studio for you">
              Or use the link they sent you
            </Row>
          </Group>
          <GroupNote>Nothing is wrong with your account — this address just isn&rsquo;t on this studio.</GroupNote>
        </Section>
        <TierContent className="space-y-1 pt-2">
          <Button size="lg" variant="secondary" className="w-full" onClick={() => void refresh()}>
            Check again
          </Button>
          <button className="min-h-12 w-full text-caption text-muted-foreground transition-colors hover:text-foreground" onClick={() => void signOut()}>
            Sign out
          </button>
        </TierContent>
      </Screen>
    );
  }

  const canContinue = step === 0 ? name.trim().length >= 2 : step === 1 ? Boolean(planId) : false;

  // The address the studio will answer at, forming as they type. This is the
  // single most important fact about the product's tenancy model and it used to
  // be invisible until after the studio existed — so someone chose a name with
  // no idea it was also choosing a URL, and met the slug for the first time in a
  // confirmation screen. Showing it live makes the anchor (§1) genuinely the
  // thing this step produces, and quietly teaches the model at the same time.
  const previewSlug = slugify(name);
  const root = host?.rootDomain ?? "kova.app";

  return (
    <Screen width="narrow">
      <StepHeader steps={STEPS} current={step} eyebrow="Set up your business" />

      <StepPanel step={step}>
          {step === 0 && (
            <>
              {/* T1 — the address taking shape. */}
              <TierAnchor className="flex flex-col items-center gap-1.5 pb-7 pt-2 text-center">
                <p className="text-caption text-muted-foreground">Your studio&rsquo;s address will be</p>
                <p className="break-all text-title-1">
                  <span className={previewSlug ? "text-foreground" : "text-muted-foreground/50"}>
                    {previewSlug || "yourstudio"}
                  </span>
                  <span className="text-muted-foreground">.{root}</span>
                </p>
              </TierAnchor>

              <Section>
                <Field
                  label="Business name"
                  icon={Store}
                  value={name}
                  placeholder="FitLab Studio"
                  autoComplete="organization"
                  disabled={tenantReady}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && name.trim().length >= 2 && setStep(1)}
                  hint={
                    tenantReady
                      ? "Your studio already exists — rename it any time in Settings."
                      : "This is what your clients see. Everything else is editable later."
                  }
                />
              </Section>

              <TierContent>
                <p className="text-center text-caption text-muted-foreground">
                  Signed in as <span className="text-foreground">{ctx?.user.email}</span>
                </p>
              </TierContent>
            </>
          )}

          {step === 1 && <PlanStep selected={planId} onSelect={setPlanId} onFeed={onFeed} />}

          {step === 2 && (
            <>
              {/* T1 — what this costs and when. The number is the story (§0). */}
              {plan && plan.trialDays > 0 ? (
                <Anchor
                  className="gap-1.5 pb-6"
                  eyebrow={plan.name}
                  sub={`days free, then ${fmtPrice(usdToCents(plan.priceUsdMonth))} a month`}
                >
                  {plan.trialDays}
                </Anchor>
              ) : (
                <Anchor
                  className="gap-1.5 pb-6"
                  eyebrow={plan?.name ?? "Your plan"}
                  word={plan ? undefined : "Pick a plan"}
                  sub={plan ? "per month" : "to see what it costs"}
                >
                  {plan && fmtPrice(usdToCents(plan.priceUsdMonth))}
                </Anchor>
              )}

              {pay.k === "checkout" && (
                <Section>
                  <Group>
                    <Row icon={Gift} sub={plan && plan.trialDays > 0 ? "Nothing is charged today" : "Billed monthly from today"}>
                      {plan && plan.trialDays > 0 ? "We save your card now" : "Your first month"}
                    </Row>
                    <Row icon={CreditCard} sub="Card details go straight to Stripe — Kova never sees them">
                      Paid securely
                    </Row>
                  </Group>
                  <GroupNote>
                    {plan && plan.trialDays > 0
                      ? "Cancel any time before the trial ends and you're not billed."
                      : "Plan credits refresh each period; unused plan credits don't roll over."}
                  </GroupNote>
                </Section>
              )}

              {pay.k === "preparing" && (
                <TierContent className="flex items-center justify-center gap-3 py-6" role="status" aria-live="polite">
                  <Spinner />
                  <span className="text-body text-muted-foreground">Setting up your studio…</span>
                </TierContent>
              )}

              {pay.k === "error" && (
                <TierContent className="space-y-3">
                  <Callout tone="danger" icon={AlertTriangle} live="alert">{pay.msg}</Callout>
                  <Button size="lg" variant="secondary" className="w-full" onClick={() => void prepare()}>
                    Try again
                  </Button>
                </TierContent>
              )}

              {pay.k === "pending" && (
                <Section>
                  <Callout tone="warning" icon={Info} live="status">
                    <span className="font-semibold">Billing isn&rsquo;t ready yet — your studio is.</span>{" "}
                    {pay.unconfigured
                      ? "Card payments aren't switched on for this Kova installation, so we can't start your subscription right now."
                      : "We couldn't start the subscription just now."}
                  </Callout>
                  <Group className="mt-3">
                    <Row icon={Store} sub="3 clients, no AI suite, no selling — everything else works">
                      Running on starter limits
                    </Row>
                    <Row icon={CreditCard} sub={`We've recorded that you chose ${plan?.name ?? "a plan"}`}>
                      Nothing has been charged
                    </Row>
                  </Group>
                  <GroupNote>
                    Finish it any time from Business → Overview; your plan switches on the moment payment goes through.
                    {pay.detail ? ` (${pay.detail})` : ""}
                  </GroupNote>
                </Section>
              )}
            </>
          )}
      </StepPanel>

      <StepActions
        back={
          step > 0 ? (
            <Button variant="ghost" size="lg" aria-label="Back to the previous step" onClick={() => setStep((s) => Math.max(0, s - 1))}>
              <ArrowLeft aria-hidden /> Back
            </Button>
          ) : undefined
        }
      >
        {step < 2 ? (
          <Button size="lg" className="w-full" disabled={!canContinue} onClick={() => setStep((s) => s + 1)}>
            Continue <ArrowRight aria-hidden />
          </Button>
        ) : pay.k === "checkout" ? (
          <Button size="lg" className="w-full" onClick={() => setSheetOpen(true)}>
            {pay.label} <ArrowRight aria-hidden />
          </Button>
        ) : pay.k === "pending" ? (
          <Button size="lg" className="w-full" disabled={finishing} onClick={() => void done()}>
            {finishing ? "Opening your studio…" : "Go to my studio"} {!finishing && <ArrowRight aria-hidden />}
          </Button>
        ) : (
          <span />
        )}
      </StepActions>

      <TierContent>
        <button className="min-h-12 w-full text-caption text-muted-foreground transition-colors hover:text-foreground" onClick={() => void signOut()}>
          Sign out
        </button>
      </TierContent>

      <PaymentSheet
        open={sheetOpen && pay.k === "checkout"}
        onClose={() => setSheetOpen(false)}
        title={pay.k === "checkout" ? pay.title : "Checkout"}
        intent={pay.k === "checkout" ? pay.intent : null}
        submitLabel={pay.k === "checkout" ? pay.label : "Pay"}
        onSuccess={() => void done()}
      />
    </Screen>
  );
}

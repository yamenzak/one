/**
 * FIRST-RUN WORKSPACE ONBOARDING — the screen a signed-in person with no
 * workspace gets, and the setup door's whole reason to exist.
 *
 * ── What this replaced ───────────────────────────────────────────────────────
 *
 * A single card asking for a name, which created the organization and dropped
 * the owner into the app. That was correct while Scena sold a `free` tier: there
 * was nothing to choose and nothing to pay. There is no free tier now — `free`
 * is the PARKING STATE `statusOf` gates read-only — so an owner who arrived that
 * way landed in a product where every write was refused, with no idea why.
 *
 * It is now Kova's wizard, step for step, because both are the same act (a
 * business signing up) and the grammar is the shared design system's:
 * `StepHeader` / `StepPanel` / `StepActions` from `@4dl/ui`.
 *
 *   1. Your workspace   — name it, and watch its ADDRESS form as you type.
 *   2. Choose a plan    — mandatory, two of them open with 30 days free.
 *   3. Start your plan  — Stripe Checkout, or the degrade path below.
 *
 * ── Why the workspace is created between 2 and 3 ─────────────────────────────
 *
 * Nothing is written until the owner leaves step 2, so Back out of either step
 * is lossless — the name and the choice are held here, not on the server. The
 * workspace is then created on the way into step 3, because a Stripe
 * subscription needs a tenant to attach to (`/me/onboarding/plan` answers 409
 * without one).
 *
 * ── If step 3 is abandoned ───────────────────────────────────────────────────
 *
 * The workspace EXISTS and sits on the `free` parking row with the choice
 * recorded as `pending_plan_id`. Nothing is charged and no paid entitlement is
 * granted — only the Stripe webhook can do that. Reloading the setup door
 * resumes at step 2 with the plan preselected, and Billing offers the same
 * checkout. The alternative — no workspace until payment clears — strands the
 * owner with an account that has nothing in it and no way back in.
 *
 * ── Where Scena genuinely differs from Kova, and why ─────────────────────────
 *
 * Kova mounts a Stripe Payment Element inline; Scena's rail is HOSTED Checkout,
 * a redirect. So step 3 is a summary and a button that leaves the origin, and
 * the success URL is the workspace rather than this door — see
 * `onboarding-routes.ts`. Same three steps, same chrome, one fewer surface to
 * keep in sync with Stripe's SDK.
 */

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Anchor,
  ArrowLeft,
  ArrowRight,
  Badge,
  Button,
  Callout,
  Choice,
  ChoiceGroup,
  CreditCard,
  Field,
  Gift,
  Group,
  GroupNote,
  Info,
  Monitor,
  Reveal,
  Row,
  Screen,
  Section,
  SkeletonList,
  Spinner,
  StepActions,
  StepHeader,
  StepPanel,
  Store,
  TierAnchor,
  TierContent,
} from "@4dl/ui";
import { authClient } from "../auth-client.js";
import {
  chooseOnboardingPlan,
  errText,
  getOnboardingPlans,
  type OnboardingPlan,
  type OnboardingPlansFeed,
} from "../api.js";
import { dollars, planHighlights } from "../plan-highlights.js";
import type { HostInfo } from "../host.js";

const STEPS = ["Your workspace", "Choose a plan", "Start your plan"] as const;

/** DNS-label-safe, and the same shape the server validates against
 *  (`org-guard.ts`). Shown live in step 1 so the address is never a surprise. */
const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

/** Step 3's state machine. `pending` is the degrade lane — see `prepare()`. */
type Pay =
  | { k: "idle" }
  | { k: "preparing" }
  | { k: "error"; msg: string }
  | { k: "checkout"; url: string; label: string }
  | { k: "pending"; unconfigured: boolean; detail: string | null };

export function WorkspaceOnboarding({
  host,
  email,
  hasWorkspace,
  workspaceName,
  onDone,
  onSignOut,
}: {
  host: HostInfo;
  email: string | null;
  /** True when the workspace already exists — a resumed onboarding, which has
   *  nothing left to ask in step 1. */
  hasWorkspace: boolean;
  workspaceName: string | null;
  /** Re-read the session so the app can leave this screen. */
  onDone: () => void;
  onSignOut: () => void;
}) {
  // Lazy initial state rather than an effect, so there is no frame of the wrong
  // step on a resumed wizard.
  const [step, setStep] = useState(() => (hasWorkspace ? 1 : 0));
  const [name, setName] = useState(workspaceName ?? "");
  const [planId, setPlanId] = useState<string | null>(null);
  const [feed, setFeed] = useState<OnboardingPlansFeed | null>(null);
  const [tenantReady, setTenantReady] = useState(hasWorkspace);
  const [pay, setPay] = useState<Pay>({ k: "idle" });
  const [leaving, setLeaving] = useState(false);

  const onFeed = useCallback((f: OnboardingPlansFeed) => {
    setFeed(f);
    setPlanId((prev) => prev ?? f.current?.pendingPlanId ?? null);
    if (f.hasTenant) setTenantReady(true);
  }, []);

  const plan = feed?.plans.find((p) => p.id === planId) ?? null;

  /**
   * Create the workspace if it does not exist yet. Idempotent within this flow.
   *
   * The slug is the workspace's ADDRESS, so the server validates it against
   * DNS-label rules and a reserved-label list (`org-guard.ts`, plus Scena's own
   * `APP_RESERVED_LABELS`). A random suffix rescues a REJECTED slug as well as a
   * colliding one: a workspace literally named "Screens" or "TV" slugifies onto
   * a reserved label, and `<base>-a1b2` clears it without interrogating somebody
   * about DNS.
   */
  const ensureWorkspace = useCallback(async (): Promise<void> => {
    if (tenantReady) return;
    const ws = name.trim() || "My workspace";
    const base = slugify(ws) || "workspace";
    const create = async (slug: string) => {
      const res = await authClient.organization.create({ name: ws, slug });
      if (res.error) throw new Error(res.error.message || "Could not create workspace");
      if (res.data?.id) await authClient.organization.setActive({ organizationId: res.data.id });
    };
    try {
      await create(base);
    } catch {
      // The slug is unique platform-wide, so a common name collides. Retrying
      // with a suffix is safe here in a way it would not be for a blind re-POST:
      // `organization.create` is what failed, so nothing was created.
      await create(`${base}-${Math.random().toString(36).slice(2, 6)}`);
    }
    setTenantReady(true);
  }, [name, tenantReady]);

  /**
   * Step 3: create the workspace, record the plan, get a Checkout URL.
   *
   * **The degrade rule.** On a deployment with no Stripe keys there is no
   * session to be had, and a mandatory paid step that hard-blocks there means
   * *nobody can ever create a workspace*. So when the server reports
   * `billing: "pending"` — either because Stripe is off or because it could not
   * mint a session — this goes to `pending`: the workspace exists, the choice is
   * recorded, nothing is charged, and the screen says so plainly. Only a request
   * that failed before the server answered is a hard error with a retry.
   */
  const prepare = useCallback(async () => {
    if (!planId) return;
    setPay({ k: "preparing" });
    try {
      await ensureWorkspace();
    } catch (e) {
      setPay({ k: "error", msg: errText(e, "Couldn't create your workspace. Please try again.") });
      return;
    }
    try {
      const r = await chooseOnboardingPlan(planId);
      if (r.billing === "checkout" && r.checkoutUrl) {
        setPay({
          k: "checkout",
          url: r.checkoutUrl,
          label: r.trialDays > 0 ? `Start ${r.trialDays}-day free trial` : `Subscribe · ${plan ? dollars(plan.priceCents) : ""}/mo`,
        });
        return;
      }
      setPay({ k: "pending", unconfigured: !r.stripeEnabled, detail: r.detail ?? null });
    } catch (e) {
      setPay({ k: "error", msg: errText(e, "Couldn't save your plan choice. Please try again.") });
    }
  }, [planId, plan, ensureWorkspace]);

  // Runs once per (step, plan) pair — re-choosing a plan on step 2 and coming
  // back re-prepares, but returning to step 3 unchanged does not.
  const [preparedFor, setPreparedFor] = useState<string | null>(null);
  useEffect(() => {
    if (step !== 2 || !planId) return;
    const key = `${step}:${planId}`;
    if (preparedFor === key) return;
    setPreparedFor(key);
    void prepare();
  }, [step, planId, prepare, preparedFor]);

  /**
   * Into the workspace — its OWN address, not `/` on the setup door.
   *
   * The wizard runs on `setup.<root>`, a platform door with no tenancy of its
   * own, so an in-app navigation would leave the owner on the one host where
   * their workspace is not pinned, reading a signpost. The session cookie is
   * issued for the root, so the hop carries it, and the address is what they
   * should bookmark and hand to their team.
   */
  const done = useCallback(() => {
    const slug = slugify(name);
    if (host.role === "setup" && slug && host.rootDomain) {
      setLeaving(true);
      const port = location.port ? `:${location.port}` : "";
      location.assign(`${location.protocol}//${slug}.${host.rootDomain}${port}/`);
      return; // navigating away; leave `leaving` set so the button stays busy
    }
    onDone();
  }, [name, host, onDone]);

  const canContinue = step === 0 ? name.trim().length >= 2 : step === 1 ? Boolean(planId) : false;

  /*
    The address forming as they type. This is the single most important fact
    about the tenancy model and it used to be invisible until after the workspace
    existed — so somebody chose a name with no idea it was also choosing a URL,
    and met the slug for the first time in a support thread.
  */
  const previewSlug = slugify(name);

  return (
    <Screen width="narrow">
      <StepHeader steps={STEPS} current={step} eyebrow="Set up your workspace" />

      <StepPanel step={step}>
        {step === 0 && (
          <>
            <TierAnchor className="flex flex-col items-center gap-1.5 pb-7 pt-2 text-center">
              <p className="text-caption text-muted-foreground">Your workspace&rsquo;s address will be</p>
              <p className="break-all text-title-1">
                <span className={previewSlug ? "text-foreground" : "text-muted-foreground/50"}>
                  {previewSlug || "yourteam"}
                </span>
                <span className="text-muted-foreground">.{host.rootDomain}</span>
              </p>
            </TierAnchor>

            <Section>
              <Field
                label="Workspace name"
                icon={Store}
                value={name}
                placeholder="Acme Clinic"
                autoComplete="organization"
                disabled={tenantReady}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && name.trim().length >= 2 && setStep(1)}
                hint={
                  tenantReady
                    ? "Your workspace already exists — rename it any time in Settings."
                    : "Screens, channels, boards, team and billing all live under it."
                }
              />
            </Section>

            {email && (
              <TierContent>
                <p className="text-center text-caption text-muted-foreground">
                  Signed in as <span className="text-foreground">{email}</span>
                </p>
              </TierContent>
            )}
          </>
        )}

        {step === 1 && <PlanStep selected={planId} onSelect={setPlanId} onFeed={onFeed} />}

        {step === 2 && (
          <>
            {plan && plan.trialDays > 0 ? (
              <Anchor className="gap-1.5 pb-6" eyebrow={plan.name} sub={`days free, then ${dollars(plan.priceCents)} a month`}>
                {plan.trialDays}
              </Anchor>
            ) : (
              <Anchor
                className="gap-1.5 pb-6"
                eyebrow={plan?.name ?? "Your plan"}
                word={plan ? undefined : "Pick a plan"}
                sub={plan ? "per month" : "to see what it costs"}
              >
                {plan && dollars(plan.priceCents)}
              </Anchor>
            )}

            {pay.k === "checkout" && (
              <Section>
                <Group>
                  <Row icon={Gift} sub={plan && plan.trialDays > 0 ? "Nothing is charged today" : "Billed monthly from today"}>
                    {plan && plan.trialDays > 0 ? "We save your card now" : "Your first month"}
                  </Row>
                  <Row icon={CreditCard} sub="Card details go straight to Stripe — Scena never sees them">
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
                <span className="text-body text-muted-foreground">Setting up your workspace…</span>
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
                  <span className="font-semibold">Billing isn&rsquo;t ready yet — your workspace is.</span>{" "}
                  {pay.unconfigured
                    ? "Card payments aren't switched on for this Scena installation, so we can't start your subscription right now."
                    : "We couldn't start the subscription just now."}
                </Callout>
                <Group className="mt-3">
                  <Row icon={Monitor} sub="One screen, one channel — everything else works">
                    Running on starter limits
                  </Row>
                  <Row icon={CreditCard} sub={`We've recorded that you chose ${plan?.name ?? "a plan"}`}>
                    Nothing has been charged
                  </Row>
                </Group>
                <GroupNote>
                  Finish it any time from Billing; your plan switches on the moment payment goes through.
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
          <Button size="lg" className="w-full" onClick={() => location.assign(pay.url)}>
            {pay.label} <ArrowRight aria-hidden />
          </Button>
        ) : pay.k === "pending" ? (
          <Button size="lg" className="w-full" disabled={leaving} onClick={done}>
            {leaving ? "Opening your workspace…" : "Go to my workspace"} {!leaving && <ArrowRight aria-hidden />}
          </Button>
        ) : (
          <span />
        )}
      </StepActions>

      <TierContent>
        <button
          className="min-h-12 w-full text-caption text-muted-foreground transition-colors hover:text-foreground"
          onClick={onSignOut}
        >
          Sign out
        </button>
      </TierContent>
    </Screen>
  );
}

/**
 * Step 2 — choose a plan. Mandatory: there is no free tier, so every new
 * workspace picks one of the three live plans and two open with 30 days free.
 *
 * Loader discipline: an `alive` guard so a stale response cannot commit, a
 * `.catch` that sets an error state (leaving `feed` null so `Reveal` stops
 * shimmering rather than shimmering forever), and a retry — this is a screen
 * nobody can get past.
 */
function PlanStep({
  selected,
  onSelect,
  onFeed,
}: {
  selected: string | null;
  onSelect: (planId: string) => void;
  onFeed: (feed: OnboardingPlansFeed) => void;
}) {
  const [feed, setFeed] = useState<OnboardingPlansFeed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setError(null);
    getOnboardingPlans()
      .then((r) => {
        if (!alive) return;
        setFeed(r);
        onFeed(r);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError(errText(e, "Couldn't load the plans. Check your connection and try again."));
      });
    return () => {
      alive = false;
    };
  }, [reloadKey, onFeed]);

  if (error && !feed) {
    return (
      <div className="space-y-3">
        <Callout tone="danger" icon={AlertTriangle} live="alert">{error}</Callout>
        <Button size="lg" variant="secondary" className="w-full" onClick={() => setReloadKey((k) => k + 1)}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <Reveal loading={!feed} className="space-y-3" skeleton={<SkeletonList card rows={3} thumb={0} />}>
      {feed && (
        <>
          {/* A real radiogroup — arrow-key navigable, one tab stop. Rows rather
              than cards: this is a decision, and a decision wants one scannable
              left edge, not three browsable tiles. */}
          <ChoiceGroup label="Choose your plan" value={selected} onChange={onSelect}>
            {feed.plans.map((p) => (
              <Choice
                key={p.id}
                value={p.id}
                label={`${p.name}, ${dollars(p.priceCents)} per month${p.trialDays > 0 ? `, ${p.trialDays} days free` : ""}`}
                title={p.name}
                badge={p.trialDays > 0 ? <Badge tone="success"><Gift aria-hidden /> {p.trialDays} days free</Badge> : undefined}
                meta={dollars(p.priceCents)}
                metaSub={p.trialDays > 0 ? "/mo after" : "/month"}
                tags={highlightsFor(p)}
              />
            ))}
          </ChoiceGroup>

          <GroupNote>
            Changing or cancelling later is self-serve under Billing, and we tell you up front if anything needs sorting out first.
          </GroupNote>
        </>
      )}
    </Reveal>
  );
}

/** The five lines that actually decide the choice. The full list is the Billing
 *  screen's job; a picker that prints twenty chips per option is not comparable. */
const highlightsFor = (p: OnboardingPlan): string[] => planHighlights(p.entitlementsJson).slice(0, 5);

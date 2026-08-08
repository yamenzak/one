/**
 * TESSA'S DOORS — the platform's screens, wearing Tessa's words, in two languages.
 *
 * `@4dl/tenancy` classifies every hostname into five doors and three of them do
 * not render a centre. Each gets a screen rather than a redirect, because each is
 * a different sentence.
 *
 * ── What these gained by moving to `@4dl/app-kit` ───────────────────────────
 *
 * They were three centred `<div>`s, and each was missing something Kova's
 * equivalents had had for months:
 *
 *   • THE ADDRESS. None of them said which hostname the visitor had reached,
 *     which is the one fact every one of these screens is actually about.
 *   • THE WAY IN. A signed-in person on the root got a tagline and no route to
 *     the centre they belong to — and the installed PWA's `start_url` is `/`, so
 *     that is where the app opens.
 *   • THE WAY OUT. No `RefreshNote`, so a stale service worker talking to an
 *     unreachable origin left the visitor on a dead page with nothing to press.
 *
 * The strings stay here. `@4dl/ui`'s own copy is deliberately untranslated, so a
 * shared component reaching for a dictionary would be wrong twice over — Tessa
 * renders in German, and what a product says about itself is the product's.
 */

import { useEffect, useRef, useState } from "react";
import { api, ApiError, NoTenant, RootSignpost as KitRootSignpost, WrongDoor as KitWrongDoor, type DoorDestination } from "@4dl/app-kit";
import {
  Anchor,
  ArrowLeft,
  ArrowRight,
  Building2,
  Button,
  Callout,
  CreditCard,
  Field,
  Gift,
  Group,
  GroupNote,
  MapPin,
  Row,
  Screen,
  Section,
  Spinner,
  StepActions,
  StepHeader,
  StepPanel,
  Store,
  TierAnchor,
  TierContent,
} from "@4dl/ui";
import { useT } from "../i18n.js";
import { useSession } from "../session.js";

export function RootSignpost() {
  const t = useT();
  const { host } = useSession();
  /*
    Tessa has no multi-centre switcher and no memberships endpoint on the root
    door, so the list is empty and the signpost renders its signed-OUT face —
    the tagline, the way in, and the address. When a `/api/me/workspaces` lands
    here (Scena has one), this is the single line that turns it on.
  */
  const destinations: DoorDestination[] = [];
  return (
    <KitRootSignpost
      rootDomain={host?.rootDomain}
      setupUrl={host?.setupUrl}
      destinations={destinations}
      destinationUrl={(slug, root) => `${location.protocol}//${slug}.${root}`}
      copy={{
        signedInAt: t("door.root.signedInAt"),
        arrivedAt: t("door.root.arrivedAt"),
        pickOne: t("door.root.pickOne"),
        everyOneHasAnAddress: t("door.root.hint"),
        yourWorkspaces: (n) => (n === 1 ? t("door.root.yourCentre") : t("door.root.yourCentres")),
        signInWorksEverywhere: t("door.root.signInWorks"),
        audiences: (
          <Row icon={MapPin} sub={t("door.root.joiningSub")}>
            {t("door.root.joining")}
          </Row>
        ),
        audienceNote: t("app.tagline"),
        createWorkspace: t("door.root.create"),
        startAnother: t("door.root.startAnother"),
      }}
    />
  );
}

export function NoStudio() {
  const t = useT();
  const { host } = useSession();
  return (
    <NoTenant copy={{ noWorkspaceAt: t("door.none.at"), checkTheLink: t("door.none.check") }} note={t("door.none.body")}>
      <Row icon={MapPin}>{t("door.none.title")}</Row>
      <Row icon={Store} sub={t("door.none.movedSub")} href={host?.setupUrl ?? "/"}>
        {t("door.none.moved")}
      </Row>
    </NoTenant>
  );
}

export function WrongDoor() {
  const t = useT();
  return <KitWrongDoor copy={{ eyebrow: t("door.wrong.title"), title: t("door.wrong.body") }} />;
}

/**
 * SET UP A CENTRE — the setup door's whole purpose, and now Kova's wizard.
 *
 * ── What this replaced, and the bug it shipped ───────────────────────────────
 *
 * A single two-field form that created the organization and dropped the owner
 * into the app. Its own comment argued the case: "Kova's wizard has five steps
 * because a studio has to pick a plan… a medical centre needs a name and an
 * address."
 *
 * That was true, and then it stopped being true. Tessa's catalog has one PAID
 * plan and `free` is an `active: 0` PARKING ROW — so `statusOf` reports
 * `incomplete` for a centre that never paid, and `resolveHostGate` turns that
 * into READ-ONLY. A centre created by that form therefore landed in a product
 * where every write was refused, on the very first screen, with nothing on it
 * explaining why. The form was not wrong about the fields; it was wrong that
 * there was nothing after them.
 *
 * ── Two steps, not Kova's three, and that is not a shortcut ──────────────────
 *
 * Tessa sells ONE plan. "Choose a plan" is a question with one answer, and a
 * radiogroup of one is furniture. The two real acts are naming the centre and
 * starting the trial, so those are the two steps — on the same
 * `StepHeader` / `StepPanel` / `StepActions` chrome Kova and Scena use, so the
 * experience is theirs even though the step count is not.
 *
 * ── Where the centre is created ──────────────────────────────────────────────
 *
 * Between the steps. Nothing is written while the owner is still typing, so Back
 * is lossless; the centre exists by the time step 2 needs a tenant to attach a
 * Stripe subscription to. If step 2 is abandoned the centre EXISTS, sits on the
 * free parking row with the choice recorded as `pending_plan_id`, and nothing is
 * charged — reloading resumes here, and Billing offers the same checkout.
 */
export function Start() {
  const { ctx, refresh, signOut } = useSession();
  const t = useT();

  const hasCentre = Boolean(ctx?.active);
  const [step, setStep] = useState(hasCentre ? 1 : 0);
  const [name, setName] = useState(ctx?.active?.name ?? "");
  const [slug, setSlug] = useState(ctx?.active?.slug ?? "");
  const [created, setCreated] = useState(hasCentre);
  const [pay, setPay] = useState<Pay>({ k: "idle" });
  const [feed, setFeed] = useState<PlansFeed | null>(null);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  const suggest = (v: string) =>
    v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

  const plan = feed?.plans[0] ?? null;
  const money = (usd: number) => `$${usd % 1 ? usd.toFixed(2) : usd}`;

  /** The centre's own origin — where a completed checkout returns to, and where
   *  Go-to-my-centre goes. The setup door is nobody's centre. */
  const centreUrl = () =>
    `${window.location.protocol}//${slug.trim()}.${window.location.host.split(".").slice(1).join(".")}`;

  // The plan feed. Loaded once the wizard opens rather than on entering step 2,
  // so the price is already known when the step renders.
  useEffect(() => {
    let alive = true;
    api
      .get<PlansFeed>("/api/me/onboarding/plans")
      .then((r) => alive && setFeed(r))
      .catch(() => alive && setFeedError(t("onboard.loadFailed")));
    return () => {
      alive = false;
    };
  }, [t]);

  const ensureCentre = async (): Promise<void> => {
    if (created) return;
    await api.post<{ id: string }>("/api/auth/organization/create", { name: name.trim(), slug: slug.trim() });
    await refresh();
    setCreated(true);
  };

  /**
   * Step 2: create the centre, record the plan, get a Checkout URL.
   *
   * **The degrade rule.** With no Stripe keys there is no session to be had, and
   * hard-blocking would mean nobody can ever create a centre on a self-host. The
   * server answers `pending`; the centre exists, nothing is charged, and the
   * screen says so.
   */
  const prepare = async () => {
    if (!plan) return;
    setPay({ k: "preparing" });
    try {
      await ensureCentre();
    } catch (e) {
      setPay({ k: "error", msg: e instanceof ApiError ? e.message || t("onboard.createFailed") : t("onboard.createFailed") });
      return;
    }
    try {
      const r = await api.post<PlanChoice>("/api/me/onboarding/plan", { planId: plan.id, returnUrl: centreUrl() });
      if (r.billing === "checkout" && r.checkoutUrl) {
        setPay({ k: "checkout", url: r.checkoutUrl });
        return;
      }
      setPay({ k: "pending", unconfigured: !r.stripeEnabled, detail: r.detail ?? null });
    } catch (e) {
      setPay({ k: "error", msg: e instanceof ApiError ? e.message || t("onboard.planFailed") : t("onboard.planFailed") });
    }
  };

  const preparedRef = useRef(false);
  useEffect(() => {
    if (step !== 1 || !plan || preparedRef.current) return;
    preparedRef.current = true;
    void prepare();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once, when step 2 first has a plan to prepare
  }, [step, plan]);

  const canContinue = step === 0 ? Boolean(name.trim() && slug.trim()) : false;
  const trial = plan?.trialDays ?? 0;

  return (
    <Screen width="narrow">
      <StepHeader steps={[t("onboard.step.centre"), t("onboard.step.plan")]} current={step} eyebrow={t("onboard.eyebrow")} />

      <StepPanel step={step}>
        {step === 0 ? (
          <>
            {/* T1 — the address taking shape. It is the one thing on this step a
                person cannot change later without breaking every bookmark, and
                it used to be a hint under a text field. */}
            <TierAnchor className="flex flex-col items-center gap-1.5 pb-7 pt-2 text-center">
              <p className="text-caption text-muted-foreground">{t("onboard.addressWillBe")}</p>
              <p className="break-all text-title-1">
                <span className={slug ? "text-foreground" : "text-muted-foreground/50"}>{slug || "praxis"}</span>
                <span className="text-muted-foreground">.{host()}</span>
              </p>
            </TierAnchor>

            <div className="space-y-4">
              <Field
                label={t("setup.name")}
                icon={Building2}
                value={name}
                placeholder="Praxis Nord"
                autoFocus
                disabled={created}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!slug || slug === suggest(name)) setSlug(suggest(e.target.value));
                }}
              />
              <Field
                label={t("setup.address")}
                icon={MapPin}
                value={slug}
                disabled={created}
                onChange={(e) => setSlug(suggest(e.target.value))}
                hint={t("setup.addressHint")}
              />
            </div>
          </>
        ) : (
          <>
            {trial > 0 ? (
              <Anchor className="gap-1.5 pb-6" eyebrow={plan?.name} sub={t("onboard.trialSub", { price: money(plan?.priceUsdMonth ?? 0) })}>
                {trial}
              </Anchor>
            ) : (
              <Anchor className="gap-1.5 pb-6" eyebrow={plan?.name ?? "—"} sub={t("onboard.perMonth")}>
                {money(plan?.priceUsdMonth ?? 0)}
              </Anchor>
            )}

            {pay.k === "checkout" && (
              <Section>
                <Group>
                  <Row icon={Gift} sub={trial > 0 ? t("onboard.cardNowSub") : t("onboard.firstMonthSub")}>
                    {trial > 0 ? t("onboard.cardNow") : t("onboard.firstMonth")}
                  </Row>
                  <Row icon={CreditCard} sub={t("onboard.secureSub")}>{t("onboard.secure")}</Row>
                </Group>
                {trial > 0 && <GroupNote>{t("onboard.cancelNote")}</GroupNote>}
              </Section>
            )}

            {pay.k === "preparing" && (
              <TierContent className="flex items-center justify-center gap-3 py-6" role="status" aria-live="polite">
                <Spinner />
                <span className="text-body text-muted-foreground">{t("onboard.preparing")}</span>
              </TierContent>
            )}

            {(pay.k === "error" || (feedError && !plan)) && (
              <TierContent className="space-y-3">
                <Callout tone="danger" live="alert">{pay.k === "error" ? pay.msg : feedError}</Callout>
                <Button size="lg" variant="secondary" className="w-full" onClick={() => void prepare()}>
                  {t("onboard.tryAgain")}
                </Button>
              </TierContent>
            )}

            {pay.k === "pending" && (
              <Section>
                <Callout tone="warning" live="status">
                  <span className="font-semibold">{t("onboard.pending.title")}</span>{" "}
                  {pay.unconfigured ? t("onboard.pending.unconfigured") : t("onboard.pending.failed")}
                </Callout>
                <Group className="mt-3">
                  <Row icon={Building2} sub={t("onboard.pending.limitsSub")}>{t("onboard.pending.limits")}</Row>
                  <Row icon={CreditCard} sub={t("onboard.pending.recorded", { plan: plan?.name ?? "" })}>
                    {t("onboard.pending.nothingCharged")}
                  </Row>
                </Group>
                <GroupNote>
                  {t("onboard.pending.note")}
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
            <Button variant="ghost" size="lg" onClick={() => setStep(0)}>
              <ArrowLeft aria-hidden /> {t("onboard.back")}
            </Button>
          ) : undefined
        }
      >
        {step === 0 ? (
          <Button size="lg" className="w-full" disabled={!canContinue} onClick={() => setStep(1)}>
            {t("onboard.continue")} <ArrowRight aria-hidden />
          </Button>
        ) : pay.k === "checkout" ? (
          <Button size="lg" className="w-full" onClick={() => window.location.assign(pay.url)}>
            {trial > 0 ? t("onboard.startTrial", { days: trial }) : t("onboard.subscribe", { price: money(plan?.priceUsdMonth ?? 0) })}
            <ArrowRight aria-hidden />
          </Button>
        ) : pay.k === "pending" ? (
          <Button
            size="lg"
            className="w-full"
            disabled={leaving}
            onClick={() => {
              setLeaving(true);
              window.location.assign(centreUrl());
            }}
          >
            {leaving ? t("onboard.opening") : t("onboard.goToCentre")} {!leaving && <ArrowRight aria-hidden />}
          </Button>
        ) : (
          <span />
        )}
      </StepActions>

      <TierContent>
        <button
          className="min-h-12 w-full text-caption text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => void signOut()}
        >
          {t("shell.signOut")}
        </button>
      </TierContent>
    </Screen>
  );
}

/** The apex centres live under — everything after the first label of this host. */
const host = () => window.location.host.split(".").slice(1).join(".");

/** Step 2's state machine. `pending` is the degrade lane — see `prepare()`. */
type Pay =
  | { k: "idle" }
  | { k: "preparing" }
  | { k: "error"; msg: string }
  | { k: "checkout"; url: string }
  | { k: "pending"; unconfigured: boolean; detail: string | null };

interface PlansFeed {
  plans: { id: string; name: string; priceUsdMonth: number; trialDays: number }[];
  stripeEnabled: boolean;
  hasTenant: boolean;
  current: { planId: string; pendingPlanId: string | null; status: string } | null;
}

interface PlanChoice {
  planId: string;
  planName: string;
  trialDays: number;
  stripeEnabled: boolean;
  billing: "checkout" | "pending";
  checkoutUrl?: string;
  detail?: string;
}

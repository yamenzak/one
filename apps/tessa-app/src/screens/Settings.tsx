/**
 * PRACTICE SETTINGS.
 *
 * Reached from the account menu, which until now pointed at a route that
 * rendered the app bar and tab bar over an empty body — a dead link that
 * typechecked and shipped.
 *
 * ── Every control here confirms ─────────────────────────────────────────────
 *
 * The instant ones (a switch, a theme picker) go through `useConfirmedState`,
 * which rolls back to the pre-apply snapshot when the write is refused; the ones
 * with a Save button go through `useAction`. Neither is optional:
 * `save-lifecycle.conformance.test.ts` in Kova makes the two shorter shapes a
 * test failure, and both fail SILENTLY — a `.catch(() => undefined)` leaves a
 * control showing a value the server rejected, which on a settings screen is the
 * worst possible outcome, because the person watched it take.
 */

import { useCallback, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Field,
  Group,
  LoadError,
  Row,
  SaveBar,
  Screen,
  SettingsIndex,
  SettingsPage,
  Spinner,
  Switch,
  useAction,
  useConfirmedState,
  useLoad,
  Building2,
  CreditCard,
  Globe,
  KeyRound,
  Palette,
  Wallet,
  Wand2,
  Users,
  type SettingsGroup,
} from "@4dl/ui";
import { PasskeysCard } from "@4dl/app-kit";
import { billing as billingApi, fmt, settings as settingsApi, type AiSettings, type PublicBranding } from "../data.js";
import { useI18n, useT } from "../i18n.js";
import { StaffSection } from "./Staff.js";

type View = null | "brand" | "ai" | "plan" | "staff" | "security";

export function Settings({ onBack }: { onBack: () => void }) {
  const t = useT();
  const [view, setView] = useState<View>(null);
  const load = useCallback(() => settingsApi.read(), []);
  const { data, error, loading, reload } = useLoad(load, t("settings.title"), fmt);

  if (loading) {
    return (
      <Screen center>
        <div className="py-24">
          <Spinner />
        </div>
      </Screen>
    );
  }
  if (error || !data) {
    return (
      <Screen>
        <LoadError what={t("settings.title")} error={error ?? "—"} onRetry={reload} />
      </Screen>
    );
  }

  if (view === "brand") return <Screen><BrandSection initial={data.branding} onBack={() => setView(null)} /></Screen>;
  if (view === "ai") return <Screen><AiSection initial={data.ai} allowed={data.canUseAi} onBack={() => setView(null)} /></Screen>;
  if (view === "plan") return <Screen><PlanSection onBack={() => setView(null)} /></Screen>;
  if (view === "staff") return <Screen><StaffSection onBack={() => setView(null)} /></Screen>;
  if (view === "security") {
    return (
      <Screen>
        <SettingsPage title={t("settings.security")} description={t("settings.security.intro")} onBack={() => setView(null)}>
          <PasskeysCard />
        </SettingsPage>
      </Screen>
    );
  }

  const groups: SettingsGroup[] = [
    {
      header: t("settings.practice"),
      rows: [
        {
          key: "brand",
          label: t("settings.brand"),
          icon: Palette,
          tone: "primary",
          // Every row states its CURRENT value, so a glance answers "what is
          // this set to" without opening — and therefore without risking a change.
          sub: data.branding.primary ?? t("settings.brand.none"),
          onClick: () => setView("brand"),
        },
        {
          key: "ai",
          label: t("settings.ai"),
          icon: Wand2,
          tone: "cycle",
          sub: data.canUseAi ? t("settings.ai.on") : t("settings.ai.locked"),
          trailing: data.canUseAi ? undefined : <Badge tone="neutral">{t("settings.plan.needed")}</Badge>,
          onClick: () => setView("ai"),
        },
        { key: "staff", label: t("staff.title"), icon: Users, tone: "case", sub: t("staff.intro"), onClick: () => setView("staff") },
        { key: "plan", label: t("settings.plan"), icon: CreditCard, tone: "soiled", onClick: () => setView("plan") },
      ],
    },
    {
      header: t("settings.account"),
      rows: [
        /* Tessa had NO passkey surface at all — not here, not on the login
           screen — while `@4dl/app-kit` shipped the whole ceremony. Its users
           were on email codes only, on a platform whose own docs say
           "email OTP + passkeys". The card is the package's now. */
        { key: "security", label: t("settings.security"), icon: KeyRound, tone: "primary", sub: t("settings.security.sub"), onClick: () => setView("security") },
      ],
    },
    { header: t("settings.device"), rows: [{ key: "lang", label: t("settings.language"), icon: Globe, tone: "neutral", sub: t("settings.language.sub") }] },
  ];

  return (
    <Screen>
      <SettingsPage title={t("settings.title")} onBack={onBack}>
        <SettingsIndex groups={groups} />
        <LanguageRow />
      </SettingsPage>
    </Screen>
  );
}

/** The locale switch is per-DEVICE, not per-practice — so it saves nothing. */
function LanguageRow() {
  const { locale, locales, setLocale } = useI18n();
  return (
    <Group>
      {locales.map((l) => (
        <Row key={l.code} onClick={() => setLocale(l.code)} trailing={l.code === locale ? <Badge tone="success">✓</Badge> : undefined}>
          {l.label}
        </Row>
      ))}
    </Group>
  );
}

/**
 * PublicBranding: the accent, the logo, and the two lines on the sign-in screen.
 *
 * A Save button rather than instant controls, because these are typed rather
 * than toggled — an instant write per keystroke would be a request per character.
 */
function BrandSection({ initial, onBack }: { initial: PublicBranding; onBack: () => void }) {
  const t = useT();
  const [form, setForm] = useState<PublicBranding>(initial);
  const { busy, msg, err, run } = useAction(fmt);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  const set = <K extends keyof PublicBranding>(k: K, v: PublicBranding[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <SettingsPage title={t("settings.brand")} description={t("settings.brand.intro")} onBack={onBack}>
      <Card className="space-y-4 p-4">
        <div className="flex items-end gap-3">
          {/* A native colour input, because a hand-rolled picker used on a phone
              through a glove is worse than the platform's own. The hex field
              beside it is what a practice pastes a brand colour into. */}
          <input
            type="color"
            aria-label={t("settings.brand.accent")}
            value={form.primary ?? "#25c891"}
            onChange={(e) => set("primary", e.target.value)}
            className="size-11 shrink-0 cursor-pointer rounded-lg border border-border bg-transparent"
          />
          <Field
            className="flex-1"
            label={t("settings.brand.accent")}
            hint={t("settings.brand.accent.hint")}
            value={form.primary ?? ""}
            placeholder="#25c891"
            onChange={(e) => set("primary", e.target.value || null)}
          />
        </div>
        <Field
          label={t("settings.brand.logo")}
          value={form.logoUrl ?? ""}
          placeholder="https://…"
          onChange={(e) => set("logoUrl", e.target.value || null)}
        />
        <Field
          label={t("settings.brand.headline")}
          hint={t("settings.brand.headline.hint")}
          value={form.headline ?? ""}
          onChange={(e) => set("headline", e.target.value || null)}
        />
        <Field label={t("settings.brand.subtext")} value={form.subtext ?? ""} onChange={(e) => set("subtext", e.target.value || null)} />
        <SaveBar
          label={t("action.save")}
          saving={busy === "brand"}
          dirty={dirty}
          msg={msg}
          err={err}
          onSave={() =>
            void run(
              "brand",
              async () => {
                await settingsApi.save({ branding: form });
                return t("settings.saved");
              },
              t("settings.brand.failed"),
            )
          }
        />
      </Card>
    </SettingsPage>
  );
}

/**
 * The AI switches.
 *
 * Instant, and therefore `useConfirmedState`: a switch that flips and then
 * silently does not save is exactly the failure the hook exists to prevent, and
 * on this screen it would mean a centre believing it had turned off a feature
 * that keeps billing them.
 */
function AiSection({ initial, allowed, onBack }: { initial: AiSettings; allowed: boolean; onBack: () => void }) {
  const t = useT();
  const cfg = useConfirmedState<AiSettings>(initial, fmt);

  return (
    <SettingsPage title={t("settings.ai")} description={t("settings.ai.intro")} onBack={onBack}>
      {!allowed && (
        <Card className="space-y-2 p-4">
          <p className="text-body text-muted-foreground">{t("settings.ai.lockedBody")}</p>
        </Card>
      )}
      {cfg.err && <p className="px-1 text-body text-danger">{cfg.err}</p>}
      <Group>
        {/* The catalog comes from the SERVER, so a feature added later appears
            here without this file changing — and cannot silently go missing. */}
        {cfg.value.catalog.map((f) => (
          <Row
            key={f.key}
            sub={f.description}
            trailing={
              <Switch
                checked={cfg.value.features[f.key] !== false}
                disabled={!allowed || cfg.busy === f.key}
                onCheckedChange={(on: boolean) =>
                  void cfg.commit(
                    f.key,
                    (c) => ({ ...c, features: { ...c.features, [f.key]: on } }),
                    () => settingsApi.save({ ai: { features: { [f.key]: on } } }),
                    t("settings.ai.failed"),
                  )
                }
              />
            }
          >
            {f.label}
          </Row>
        ))}
      </Group>
    </SettingsPage>
  );
}

/** The plan, the balance, and the two things a centre can buy. */
function PlanSection({ onBack }: { onBack: () => void }) {
  const t = useT();
  const load = useCallback(() => billingApi.read(), []);
  const { data, error, loading, reload } = useLoad(load, t("settings.plan"), fmt);
  const { busy, err, run } = useAction(fmt);

  if (loading) return <SettingsPage title={t("settings.plan")} onBack={onBack}><Spinner /></SettingsPage>;
  if (error || !data) {
    return (
      <SettingsPage title={t("settings.plan")} onBack={onBack}>
        <LoadError what={t("settings.plan")} error={error ?? "—"} onRetry={reload} />
      </SettingsPage>
    );
  }

  /** Stripe redirects are a full navigation, so the URL replaces the page. */
  const go = (key: string, fn: () => Promise<{ url: string }>) =>
    void run(key, async () => {
      const { url } = await fn();
      location.href = url;
    }, t("settings.plan.failed"));

  return (
    <SettingsPage title={t("settings.plan")} onBack={onBack}>
      {err && <p className="px-1 text-body text-danger">{err}</p>}

      <Card className="space-y-1 p-4">
        <div className="flex items-center justify-between">
          <span className="text-body-lg font-medium">{data.subscription?.plan_id ?? "—"}</span>
          <Badge tone={data.subscription?.status === "active" ? "success" : "warning"}>{data.subscription?.status ?? "—"}</Badge>
        </div>
        {data.balance && (
          <p className="text-body text-muted-foreground">
            {t("settings.plan.credits", { n: data.balance.available })}
          </p>
        )}
      </Card>

      {/* A deployment with no payment rail is legitimate — a self-host, the
          integration suite — and showing a dead buy button there is worse than
          showing none. */}
      {!data.payable ? (
        <Card className="p-4"><p className="text-body text-muted-foreground">{t("settings.plan.noRail")}</p></Card>
      ) : (
        <>
          <Group>
            {data.plans.map((p) => (
              <Row
                key={p.id}
                leading={<Building2 className="size-4" />}
                sub={t("settings.plan.perMonth", { price: p.priceUsdMonth, credits: p.entitlements.aiCredits.monthlyGrant })}
                trailing={
                  <Button size="sm" disabled={busy === p.id || !p.synced} onClick={() => go(p.id, () => billingApi.checkoutPlan(p.id))}>
                    {p.id === data.subscription?.plan_id ? t("settings.plan.current") : t("settings.plan.choose")}
                  </Button>
                }
              >
                {p.name}
              </Row>
            ))}
          </Group>

          <h2 className="px-1 text-micro uppercase text-muted-foreground">{t("settings.credits")}</h2>
          <Group>
            {data.packs.map((p) => (
              <Row
                key={p.id}
                leading={<Wallet className="size-4" />}
                sub={`$${p.priceUsd}`}
                trailing={
                  <Button size="sm" variant="secondary" disabled={busy === p.id} onClick={() => go(p.id, () => billingApi.checkoutPack(p.id))}>
                    {t("action.buy")}
                  </Button>
                }
              >
                {p.name}
              </Row>
            ))}
          </Group>

          {data.subscription?.plan_id && data.subscription.plan_id !== "free" && (
            <Button variant="secondary" className="w-full" disabled={busy === "portal"} onClick={() => go("portal", () => billingApi.portal())}>
              {t("settings.plan.manage")}
            </Button>
          )}
        </>
      )}
    </SettingsPage>
  );
}

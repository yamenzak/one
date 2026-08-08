/**
 * PRACTICE SETTINGS — an index, and a page per section.
 *
 * The grammar is Kova's, because there is one settings grammar on this platform
 * and Kova is where it was worked out (UI-LANGUAGE §7): a table of contents
 * whose rows say WHAT IS INSIDE, a page per section whose rows say the CURRENT
 * VALUE, and a section key that lives in the URL.
 *
 * ── What changed, and why each one is a defect rather than a preference ─────
 *
 * THE SECTION WAS `useState`. It compiles, it looks right, and it means the
 * whole surface has one address: the browser Back button leaves Settings from
 * three levels deep instead of stepping out of the open section, nothing is
 * linkable, and a reload always lands on the index. Kova and Scena both put it
 * in `?s=`; this was the last one that did not.
 *
 * THE LOAD WAS A FULL-SCREEN SPINNER. §7: a skeleton in the shape of what is
 * coming, not a spinner in the shape of nothing. The index is a known shape
 * before the data arrives — it is a fixed list of rows — so the only thing that
 * has to wait is each row's current value.
 *
 * "LANGUAGE" WAS A ROW THAT DID NOTHING. It sat in the index with an icon and a
 * sub-line and no `onClick`, while the actual locale switch rendered as a bare
 * unlabelled `Group` below the index. So the surface had a door that was a wall
 * and a control with no door. It is a section now, like everything else.
 *
 * THERE WAS NO WAY OUT. `/api/tenant/close*` and `/api/me/delete*` have been
 * mounted since the exit-routes commit and nothing rendered either — a route
 * with no door, which passes every test. Both surfaces are `@4dl/app-kit`'s
 * (`CloseTenantCard`, `AccountExitRows`), so this file names the centre and the
 * package does the rest.
 */

import { useCallback, useState } from "react";
import { useSearchParams } from "react-router-dom";
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
  SkeletonLine,
  Spinner,
  Switch,
  useAction,
  useConfirmedState,
  useLoad,
  Avatar,
  Building2,
  CreditCard,
  Globe,
  KeyRound,
  Palette,
  Trash2,
  Wallet,
  Wand2,
  Users,
  type SettingsGroup,
} from "@4dl/ui";
import { AccountExitRows, CloseTenantCard, PasskeysCard } from "@4dl/app-kit";
import { billing as billingApi, fmt, settings as settingsApi, type AiSettings, type PublicBranding } from "../data.js";
import { useI18n, useT } from "../i18n.js";
import { useSession } from "../session.js";
import { StaffSection } from "./Staff.js";

type View = "brand" | "ai" | "plan" | "staff" | "security" | "language" | "danger";

/**
 * Closing a section POPS the entry that opening it pushed.
 *
 * `setParams` alone would `push` again, so every open/close cycle leaves the
 * history one deeper than it started and leaving Settings takes one Back press
 * per section explored. `idx > 0` is the guard for a DEEP LINK: someone who
 * landed straight on `?s=plan` has nothing of ours to pop back to, and
 * `history.back()` would take them out of the app.
 *
 * Lifted verbatim from Kova's `useCloseSection`, where the bug it fixes was
 * reported by a user almost word for word.
 */
function useCloseSection(): () => void {
  const [, setParams] = useSearchParams();
  return () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) window.history.back();
    else setParams((q: URLSearchParams) => { q.delete("s"); return q; }, { replace: true });
  };
}

export function Settings({ onBack }: { onBack: () => void }) {
  const t = useT();
  const { ctx, signOut } = useSession();
  const [params, setParams] = useSearchParams();
  const view = params.get("s") as View | null;
  const closeSection = useCloseSection();
  const go = (v: View) => setParams((q: URLSearchParams) => { q.set("s", v); return q; });

  const load = useCallback(() => settingsApi.read(), []);
  const { data, error, reload } = useLoad(load, t("settings.title"), fmt);

  const isOwner = ctx?.active?.role === "owner";

  /* ── the section pages ─────────────────────────────────────────────────── */

  if (view === "staff") return <Screen><StaffSection onBack={closeSection} /></Screen>;
  if (view === "plan") return <Screen><PlanSection onBack={closeSection} /></Screen>;
  if (view === "language") return <Screen><LanguageSection onBack={closeSection} /></Screen>;
  if (view === "security") {
    return (
      <Screen>
        <SettingsPage title={t("settings.security")} description={t("settings.security.intro")} onBack={closeSection}>
          <PasskeysCard />
        </SettingsPage>
      </Screen>
    );
  }
  if (view === "danger") {
    return (
      <Screen>
        <SettingsPage title={t("settings.danger")} description={t("settings.danger.intro")} onBack={closeSection}>
          {/* The centre, not "the tenant". `graceDays` is what `purge.ts`
              actually schedules — wrong here would be a promise about a
              deadline, which is worse than saying nothing. */}
          <CloseTenantCard noun={t("settings.danger.noun")} erases={t("settings.danger.erases")} graceDays={7} />
        </SettingsPage>
      </Screen>
    );
  }
  // These two need the loaded settings, so they wait for it rather than
  // rendering a form over `undefined`.
  if (view === "brand" || view === "ai") {
    if (error && !data) {
      return <Screen><SettingsPage title={t("settings.title")} onBack={closeSection}><LoadError what={t("settings.title")} error={error} onRetry={reload} /></SettingsPage></Screen>;
    }
    if (!data) {
      return (
        <Screen>
          <SettingsPage title={view === "brand" ? t("settings.brand") : t("settings.ai")} onBack={closeSection}>
            <Card className="space-y-3 p-4">{[0, 1, 2, 3].map((i) => <SkeletonLine key={i} h="text" w={i === 3 ? "60%" : "100%"} />)}</Card>
          </SettingsPage>
        </Screen>
      );
    }
    return (
      <Screen>
        {view === "brand"
          ? <BrandSection initial={data.branding} onBack={closeSection} />
          : <AiSection initial={data.ai} allowed={data.canUseAi} onBack={closeSection} />}
      </Screen>
    );
  }

  /* ── the index ─────────────────────────────────────────────────────────── */

  /**
   * The sub-line while the read is in flight.
   *
   * Not a value, and not an empty string. A row that reads "Not set" for the
   * length of a round trip has told somebody their accent colour is missing
   * when it is not — and stating the current value is the entire reason the
   * sub-line exists, so getting it wrong here costs more than elsewhere.
   */
  const pending = <SkeletonLine w="7rem" h="xs" />;

  const groups: SettingsGroup[] = [
    {
      header: t("settings.practice"),
      rows: [
        {
          key: "brand",
          label: t("settings.brand"),
          icon: Palette,
          tone: "primary",
          sub: data ? (data.branding.primary ?? t("settings.brand.none")) : pending,
          onClick: () => go("brand"),
        },
        {
          key: "ai",
          label: t("settings.ai"),
          icon: Wand2,
          tone: "cycle",
          sub: data ? (data.canUseAi ? t("settings.ai.on") : t("settings.ai.locked")) : pending,
          trailing: data && !data.canUseAi ? <Badge tone="neutral">{t("settings.plan.needed")}</Badge> : undefined,
          onClick: () => go("ai"),
        },
        { key: "staff", label: t("staff.title"), icon: Users, tone: "case", sub: t("staff.intro"), onClick: () => go("staff") },
        { key: "plan", label: t("settings.plan"), icon: CreditCard, tone: "soiled", sub: t("settings.plan.sub"), onClick: () => go("plan") },
      ],
    },
    {
      header: t("settings.account"),
      rows: [
        { key: "security", label: t("settings.security"), icon: KeyRound, tone: "primary", sub: t("settings.security.sub"), onClick: () => go("security") },
        { key: "language", label: t("settings.language"), icon: Globe, tone: "neutral", sub: t("settings.language.sub"), onClick: () => go("language") },
      ],
    },
    // Owner-only, and its own named group. Kova learned this the hard way: an
    // unnamed break above the destructive row reads as a rendering accident,
    // and this is the one group where knowing what you are about to open
    // matters most.
    ...(isOwner
      ? [{ header: t("settings.danger"), rows: [{ key: "danger", label: t("settings.danger.close"), icon: Trash2, sub: t("settings.danger.sub"), destructive: true, onClick: () => go("danger") }] }]
      : []),
  ];

  return (
    <Screen>
      <SettingsPage title={t("settings.title")} onBack={onBack}>
        {/* WHO, first — the fact a phone settings screen opens with. It is the
            one thing here that does not navigate, so it does not pretend to. */}
        <Card className="flex items-center gap-3.5">
          <Avatar name={ctx?.user?.name || ctx?.user?.email || "?"} src={ctx?.user?.image ?? undefined} className="size-12" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{ctx?.user?.name || ctx?.user?.email}</div>
            {ctx?.user?.name && <div className="truncate text-body text-muted-foreground">{ctx.user.email}</div>}
          </div>
          {ctx?.active?.role && <Badge tone={isOwner ? "primary" : "neutral"}>{ctx.active.role}</Badge>}
        </Card>

        {/* A failed read costs the two rows that state a value, not the screen:
            passkeys, staff, the plan and the exits are all still reachable. */}
        {error && !data && <LoadError what={t("settings.title")} error={error} onRetry={reload} />}

        <SettingsIndex groups={groups} />

        <AccountExitRows
          email={ctx?.user?.email ?? null}
          ownsTenant={isOwner}
          closeFirstHint={t("settings.danger")}
          onSignOut={() => void signOut()}
          onDeleted={() => void signOut()}
        />
      </SettingsPage>
    </Screen>
  );
}

/** The locale switch is per-DEVICE, not per-practice — so it saves nothing, and
 *  says so rather than leaving somebody wondering where the Save button is. */
function LanguageSection({ onBack }: { onBack: () => void }) {
  const t = useT();
  const { locale, locales, setLocale } = useI18n();
  return (
    <SettingsPage title={t("settings.language")} description={t("settings.language.sub")} onBack={onBack}>
      <Group>
        {locales.map((l) => (
          <Row key={l.code} onClick={() => setLocale(l.code)} trailing={l.code === locale ? <Badge tone="success">✓</Badge> : undefined}>
            {l.label}
          </Row>
        ))}
      </Group>
    </SettingsPage>
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

  if (loading) {
    return (
      <SettingsPage title={t("settings.plan")} onBack={onBack}>
        {/* The shape that is coming — a summary card, then a list of plans —
            rather than a spinner, which is the shape of nothing. */}
        <Card className="space-y-2 p-4"><SkeletonLine w="9rem" h="title" /><SkeletonLine w="12rem" h="text" /></Card>
        <Card className="space-y-3 p-4">{[0, 1, 2].map((i) => <SkeletonLine key={i} h="text" />)}</Card>
      </SettingsPage>
    );
  }
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
                    {busy === p.id ? <Spinner /> : p.id === data.subscription?.plan_id ? t("settings.plan.current") : t("settings.plan.choose")}
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
                    {busy === p.id ? <Spinner /> : t("action.buy")}
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

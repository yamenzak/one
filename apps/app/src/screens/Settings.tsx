/**
 * Settings — account, security (passkeys), appearance, and (owners) the tenant
 * branding editor: pick a brand preset + radius that themes the app for clients.
 */

import { Fragment, useCallback, useEffect, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button, Card, Badge, Chip, Switch, Textarea, Skeleton, Reveal, SkeletonLine, SkeletonCircle, SegmentedControl, SettingsList, SettingsIndex, SettingsPage, Settings as SettingsIcon, Page, Stagger, Field, Avatar, stagger, ConfirmDialog, BRAND_PRESETS, THEME_TOKEN_GROUPS, DEFAULT_TOKENS, SHADOW_PRESETS, BORDER_WIDTHS, Input, Slider, ColorSwatch, PreviewPicker, colorToHex, deriveTokens, extractPalette, monogramFor, renderMarkPng, markRuns, MARK_WEIGHT, MARK_SOFT_ALPHA, MARK_TINT_ALPHA, RefreshCw, hexToOklchString, oklchStringToHex, parseThemeCss, dicebearUrl, KeyRound, Moon, Sun, LogOut, Palette, Target, Scale, CircleUser, Sliders, UserPlus, Lock, PencilLine, Waves, Store, Plug, ImageIcon, Upload, Wand2, ChevronDown, Trash2, Check, ArrowLeft, Globe, Copy, Plus, Building2, Bell, BellOff, Mail, LogIn, ExternalLink, ArrowRight, Sheet, Spinner, AlertTriangle, ActionResult, SaveBar, useAction as useActionBase, ConfigRow, TabIntro, cn, toneText, type Tone, type Branding, type BrandTokens, type WordmarkStyle, type MarkPlate, type MarkRun, type NeutralTint, type ShadowPreset, type LucideIcon, Clock, SkeletonList } from "@4dl/ui";
import { personaLabel, personaTone } from "../registry/index.js";
import { KOVA_TOKEN_GROUPS, DEFAULT_ACCENT_TOKENS, MACRO_SPEC } from "../registry/tones.js";

/**
 * The advanced token editor lists the design system's own groups first, then
 * Kova's accents. `@4dl/ui` cannot ship the second half: "Macros" and "Domain
 * accents" name what this product measures, and another 4DL app measures
 * something else.
 */
const TOKEN_GROUPS = [...THEME_TOKEN_GROUPS, ...KOVA_TOKEN_GROUPS];
const ALL_DEFAULT_TOKENS = {
  light: { ...DEFAULT_TOKENS.light, ...DEFAULT_ACCENT_TOKENS.light },
  dark: { ...DEFAULT_TOKENS.dark, ...DEFAULT_ACCENT_TOKENS.dark },
};
import type { LoginBranding, TenantBranding } from "@kova/protocol";
import { resolveUnits, cmToFeetInches, feetInchesToCm, STUDIO_SETTINGS_SECTIONS, settingsSectionVisible, LAPSE_ACTIONS, LAPSE_META, DEFAULT_LAPSE_POLICY, MIN_DESTRUCTIVE_GRACE_DAYS, checkLapsePolicy, isDestructive, type LapsePolicy } from "@kova/domain";
import { useUnits } from "../units.js";
import { useSession } from "../session.js";
import { PreferencesEditorCard } from "./PreferencesEditor.js";
import { INSIGHT_LABELS, mutedInsights, unmuteInsight } from "./client/InsightFeedback.js";
import { useTheme } from "../theme.js";
import { api, errorText, uploadMedia } from "../api.js";
import { PasskeysCard } from "@4dl/app-kit";
import { usePasskey } from "../PasskeyPrompt.js";
import { AiConfigSection } from "./AiSettings.js";
import { SectionSplit } from "./SectionSplit.js";

/**
 * Section header inside a settings PAGE.
 *
 * Only for a page that genuinely holds more than one section — Email has four
 * (delivery, policy, templates), Sign-in has two. Where the page has one, the
 * header restated the page's own title a few pixels below it and is gone.
 *
 * It used to carry a "Studio" badge as well, from when studio and personal
 * settings shared a screen and "is this MY setting or the STUDIO's?" was a real
 * question. It isn't any more: you reach these through Studio settings, whose
 * title is still on screen behind you.
 */
function SectionHead({ title, icon: Icon, tone = "primary" }: { title: string; icon?: LucideIcon; tone?: Tone }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2 px-1">
      <h3 className="flex items-center gap-1.5 text-micro uppercase text-muted-foreground">
        {Icon && <Icon className={cn("size-3.5", toneText[tone])} aria-hidden />}
        {title}
      </h3>
    </div>
  );
}

/**
 * The design system's action hook, bound to this app's HTTP error formatter —
 * the same one-line binding the platform console makes.
 *
 * Every mutating control on this screen goes through it, and that is not a
 * tidiness rule. The hand-rolled shape it replaced was `try { await api…() }
 * finally { setBusy(false) }` with NO catch: on a refused save the rejection
 * escaped `void save()` and surfaced as the runtime's generic "Something didn't
 * load. Check your connection, then try again." — wrong words, wrong place, and
 * indistinguishable from a failed read. `run` cannot leave a rejection unhandled
 * or a button stuck busy.
 */
const useAction = () => useActionBase(errorText);

/**
 * Closing a section POPS the entry that opening it pushed.
 *
 * It used to `replace` instead. That looks equivalent — the URL ends up the
 * same — but it is not: `replace` swaps the current entry rather than removing
 * it, so every open/close cycle left the history one deeper than it started.
 * Explore five sections and leaving settings took five Back presses, which is
 * the bug a client reported almost word for word.
 *
 * `idx > 0` is the guard for a DEEP LINK: someone who landed directly on
 * `?s=email` has nothing of ours to pop back to, and `navigate(-1)` would take
 * them out of the app entirely. There, replacing is right.
 */
function useCloseSection() {
  const navigate = useNavigate();
  const [, setParams] = useSearchParams();
  return (param: string) => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else setParams((q: URLSearchParams) => { q.delete(param); return q; }, { replace: true });
  };
}

/**
 * A section whose read failed. Every settings section loads independently, and a
 * loader with no catch left its skeleton shimmering forever — a silent dead end
 * with nothing to retry (or, for EmailSection, no section at all). This is the
 * one shared "it broke, here's the way out" card, so one dead endpoint costs the
 * owner one section instead of the whole screen.
 */
function LoadError({ label, error, onRetry }: { label: string; error?: string | null; onRetry: () => void }) {
  return (
    <Card className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2.5">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
        <div className="min-w-0">
          <p className="text-sm">Couldn't load {label}.</p>
          {/* The server's reason, when there is one. "Check your connection" is a
              guess, and it is the wrong guess for a 403 or a 500 — an owner who
              cannot see the real reason cannot tell you what broke. */}
          <p className="text-xs leading-snug text-muted-foreground">{error || "Check your connection and try again."}</p>
        </div>
      </div>
      <Button size="sm" variant="secondary" className="shrink-0" onClick={onRetry}>Try again</Button>
    </Card>
  );
}

/** Personal + studio surfaces are now reached as SEPARATE destinations from the
 *  avatar dropdown — `view` selects which one this route renders. `studio` is the
 *  owner-only studio-config surface; the rest are personal-to-the-user. */
export type SettingsView = "profile" | "preferences" | "notifications" | "passkeys" | "studio";

const VIEW_TITLE: Record<SettingsView, string> = {
  profile: "Settings",
  preferences: "Preferences",
  notifications: "Notifications",
  passkeys: "Passkeys & security",
  studio: "Studio settings",
};

export function Settings({ onBack, view = "studio" }: { onBack: () => void; view?: SettingsView }) {
  const { ctx, refresh } = useSession();
  const [pageParams] = useSearchParams();
  const inSection = pageParams.get("s") != null;
  const isOwner = ctx?.active?.role === "owner";
  const canBrand = isOwner && ctx?.entitlements.features.branding;
  const role = ctx?.active?.role ?? "member";
  const clientId = ctx?.active?.clientId ?? null;

  /*
    FOUR ROUTES, ONE SURFACE.

    `/profile`, `/preferences`, `/notification-settings` and `/passkeys` were
    four destinations in the avatar menu, each a half-empty screen about the
    same subject: me. They now all render the merged personal surface, opened
    at their own section — so every old link and deep-link still lands exactly
    where it did, and there is one place to look.
  */
  const AS_SECTION: Partial<Record<SettingsView, string>> = {
    // `/profile` is the ROOT of the merged surface — the menu's one door. The
    // other three are the old destinations, kept as deep links into their
    // section so no existing link or bookmark breaks.
    profile: "", preferences: "preferences", notifications: "notifications", passkeys: "security",
  };
  const body = (() => {
    if (view === "studio") {
      return isOwner
        ? <StudioSettings canBrand={!!canBrand} />
        : <Stagger><Card className="text-sm text-muted-foreground">Studio settings are available to studio owners.</Card></Stagger>;
    }
    const initial = AS_SECTION[view];
    return <PersonalSettings clientId={clientId} initialTab={(initial || undefined) as never} onBack={onBack} onSaved={() => void refresh()} />;
  })();

  return (
    <Page className="column space-y-5 p-4 pb-28">
      {/* One header, not two. The inner surface renders its own back + title
          once a section is open (`?s=`), so showing the page-level one too gave
          every settings detail page a pair of stacked back buttons. */}
      {view === "studio" && !inSection && (
        <div className="flex items-center gap-3">
          <Button size="icon" variant="secondary" onClick={onBack}><ArrowLeft /></Button>
          <h1 className="text-title-2">{VIEW_TITLE[view]}</h1>
        </div>
      )}
      <motion.div key={view} variants={stagger} initial="hidden" animate="show" className="space-y-6">
        {body}
      </motion.div>
    </Page>
  );
}

/**
 * The owner's studio settings — split into focused sub-tabs so the (many)
 * sections don't pile into one endless page. Each sub-tab groups a cohesive
 * concern; a tab only appears when it has content the tenant is entitled to.
 */
/**
 * Everything that is "how this app behaves for ME", in one destination.
 *
 * These were four menu entries a tap apart — preferences, notifications,
 * appearance, units — each one a half-empty screen, and a client with no
 * coaching profile landed on a Preferences page that was nothing but an apology.
 * They are one page with tabs now, the same shape the studio settings use, so
 * the surfaces are comparable and none of them is a dead end.
 *
 * The old routes still resolve (deep links, and anything already bookmarked) —
 * they just open this page on the matching tab.
 */

/**
 * Personal settings — the same index/detail shape as the studio surface.
 *
 * It was three tabs, and the page carried FOUR levels of intro before the first
 * control: a page description, a tab intro, a card intro inside the section,
 * and a sub-section intro above each field group. Four paragraphs explaining a
 * screen you could not see yet. The index row now carries the one line that
 * mattered and the rest is gone.
 */
/**
 * ── ONE PERSONAL SETTINGS SURFACE ─────────────────────────────────────────
 *
 * Profile, Preferences and "Passkeys & security" were three separate menu
 * destinations, each a half-empty screen: Profile was an email card plus a name
 * and a photo; security was three stacked sections; preferences was three tabs.
 * Nothing about them was different in KIND — all three are "settings about me",
 * and splitting them across the avatar menu meant a user hunting for their own
 * units had to remember which of three doors it was behind.
 *
 * They are one index now, in the order a phone OS uses: WHO you are at the top
 * (the account row), then what the app does for you, then the account's own
 * plumbing, then the two ways out. The old routes still work — each opens the
 * merged surface at its section.
 */
type PersonalTab = "profile" | "preferences" | "notifications" | "units" | "security";

function PersonalSettings({ clientId, initialTab, onBack, onSaved }: {
  clientId: string | null;
  initialTab?: PersonalTab;
  onBack: () => void;
  onSaved: () => void;
}) {
  const { ctx } = useSession();
  const [params, setParams] = useSearchParams();
  const closeSection = useCloseSection();
  const openKey = (params.get("s") ?? initialTab ?? null) as PersonalTab | null;
  const role = ctx?.active?.role ?? "member";

  const sections = [
    {
      value: "profile", label: "Profile", icon: CircleUser, tone: "cardio", show: !!clientId,
      blurb: "Your name, photo and the basics", intro: "Your coach sees these, and your targets are calculated from them.",
      body: () => <ClientProfileSection clientId={clientId!} email={ctx?.user.email ?? ""} onSaved={onSaved} />,
    },
    {
      value: "preferences", label: "Training & nutrition", icon: Target, tone: "primary", show: true,
      blurb: "Your goal, how you train, what to avoid", intro: "What your coach builds your plans and targets around. Keep it current.",
      body: () => (clientId
        ? <><PreferencesSection clientId={clientId} onSaved={onSaved} /><MutedInsightsSection /></>
        : <Stagger><Card className="text-sm text-muted-foreground">These appear here once you&apos;re set up as a client.</Card></Stagger>),
    },
    { value: "notifications", label: "Notifications", icon: Bell, tone: "activity", show: true, blurb: "What you hear about, and where", intro: "Pick a channel per kind of update. Nothing here emails anyone else.", body: () => <NotificationsSection /> },
    { value: "units", label: "Units", icon: Scale, tone: "sleep", show: true, blurb: "Metric or imperial", intro: "Mix and match freely — these apply everywhere you see a number, for you only.", body: () => <UnitsSection /> },
    { value: "security", label: "Passkeys & security", icon: KeyRound, tone: "supplement", show: true, blurb: "How you sign in on this device", intro: "A passkey signs you in with your face, fingerprint or screen lock — no code to wait for.", body: () => <SecuritySection /> },
  ] as const satisfies readonly { value: PersonalTab; label: string; blurb: string; intro: string; icon: LucideIcon; tone: Tone; show: boolean; body: () => ReactNode }[];
  const shown = sections.filter((x) => x.show);

  const open = shown.find((x) => x.value === openKey) ?? null;
  const go = (k: PersonalTab) => setParams((q: URLSearchParams) => { q.set("s", k); return q; });

  if (open) {
    return (
      <SettingsPage title={open.label} description={open.intro} onBack={() => closeSection("s")}>
        <motion.div key={open.value} variants={stagger} initial="hidden" animate="show" className="space-y-6">
          {open.body()}
        </motion.div>
      </SettingsPage>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button size="icon" variant="secondary" onClick={onBack} aria-label="Back"><ArrowLeft /></Button>
        <h1 className="text-title-2">Settings</h1>
      </div>

      {/* WHO, first — the account row phone settings open with. It is the one
          thing here that is a fact rather than a door, so it says the fact and
          does not pretend to navigate. */}
      <Stagger>
        <Card className="flex items-center gap-3.5">
          <Avatar name={ctx?.user.name || ctx?.user.email || "?"} seed={ctx?.user.email ?? "me"} className="size-12" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{ctx?.user.name || ctx?.user.email}</div>
            {ctx?.user.name && <div className="truncate text-sm text-muted-foreground">{ctx.user.email}</div>}
          </div>
          <Badge tone={personaTone(role)}>{personaLabel(role)}</Badge>
        </Card>
      </Stagger>

      <SettingsIndex
        groups={[
          { rows: shown.filter((x) => x.value !== "security").map((x) => ({
              key: x.value, icon: x.icon, tone: x.tone, label: x.label, sub: x.blurb, onClick: () => go(x.value),
            })) },
          { rows: shown.filter((x) => x.value === "security").map((x) => ({
              key: x.value, icon: x.icon, tone: x.tone, label: x.label, sub: x.blurb, onClick: () => go(x.value),
            })) },
        ]}
      />

      <DeleteAccountSection />
    </div>
  );
}

/**
 * ── STUDIO SETTINGS: AN INDEX AND A PAGE PER SECTION ───────────────────────
 *
 * This was seven horizontally-scrolling tabs (two off the right edge at phone
 * width) over one page each. The Brand tab alone measured 5,599px — a single
 * card holding theme, logo, app icon, the AI coach's identity, nine brand
 * swatches, surface tint, corner radius, elevation, borders, border colour, two
 * section toggles and a fine-tune drawer, under one Save. Nothing in it could
 * be found, and the two tabs you could not see may as well not have shipped.
 *
 * Now: a table of contents, and a route per section. `?s=<key>` rather than a
 * nested route so the whole surface stays one component and the browser Back
 * button steps out of a section before it leaves settings.
 */
function StudioSettings({ canBrand }: { canBrand: boolean }) {
  const { ctx, refresh } = useSession();
  const { preview } = useTheme();
  const [params, setParams] = useSearchParams();
  const closeSection = useCloseSection();
  const render: Record<string, () => ReactNode> = {
    identity: () => <StudioIdentitySection />,
    brand: () => <BrandingEditor initial={(ctx?.branding ?? null) as Branding | null} onPreview={preview} onSaved={() => void refresh()} />,
    signin: () => <SignInSettings canBrand={canBrand} branding={ctx?.branding ?? null} slug={ctx?.active?.tenantSlug ?? null} onSaved={() => void refresh()} />,
    ai: () => <AiConfigSection />,
    messaging: () => <MessagingSettings />,
    marketplace: () => <MarketplaceSection />,
    lapse: () => <LapseSection />,
    integrations: () => <IntegrationsSection />,
    danger: () => <CloseStudioSection />,
  };
  const features = ctx?.entitlements.features;
  const sections = STUDIO_SETTINGS_SECTIONS.filter(
    (x) => (!features || settingsSectionVisible(x, features)) && render[x.key],
  );

  /** One line per section page — what it governs. The index rows say what is
   *  INSIDE; this says what the section is FOR. Never both on one screen. */
  const INTRO: Record<string, string> = {
    identity: "The name on every screen, every email and every browser tab. Your web address doesn't change.",
    brand: "Every screen your clients see is themed from these — not from per-screen styling.",
    signin: "The front door: your login link, the copy on it, and whether passkeys are offered.",
    ai: "Which model answers each AI action, what it costs your balance, and the voice it writes in.",
    messaging: "How email leaves your studio — who sends it, which categories are allowed, what it says.",
    marketplace: "Whether your storefront is open, and whether clients can sign themselves up.",
    lapse: "Your rule for a client whose package ran out. It applies automatically, and only while your own studio is in good standing.",
    integrations: "Outside food and exercise databases, and the keys they use.",
    danger: "Billing stops immediately, your data is held for seven days, then everything is erased — for you and for every member.",
  };

  const openKey = params.get("s");
  const open = sections.find((x) => x.key === openKey) ?? null;

  if (open) {
    return (
      <SettingsPage
        title={open.label}
        description={INTRO[open.key]}
        onBack={() => closeSection("s")}
      >
        <motion.div key={open.key} variants={stagger} initial="hidden" animate="show" className="space-y-6">
          {render[open.key]!()}
        </motion.div>
      </SettingsPage>
    );
  }

  return (
    <SettingsIndex
      groups={[
        {
          rows: sections.filter((x) => x.key !== "danger").map((x) => ({
            key: x.key,
            icon: STUDIO_SECTION_ICON[x.key] ?? SettingsIcon,
            tone: STUDIO_SECTION_TONE[x.key],
            label: x.label,
            sub: x.blurb,
            onClick: () => setParams((q: URLSearchParams) => { q.set("s", x.key); return q; }),
          })),
        },
        {
          rows: sections.filter((x) => x.key === "danger").map((x) => ({
            key: x.key,
            icon: Trash2,
            label: x.label,
            sub: x.blurb,
            destructive: true,
            onClick: () => setParams((q: URLSearchParams) => { q.set("s", x.key); return q; }),
          })),
        },
      ]}
    />
  );
}

/** Icon + tone per studio section. Colour here is navigation, not decoration:
 *  a section keeps its tone wherever it appears, so the index becomes a map you
 *  can aim at from memory rather than a list you re-read. */
const STUDIO_SECTION_ICON: Record<string, LucideIcon> = {
  brand: Palette, signin: KeyRound, ai: Wand2, messaging: Mail,
  marketplace: Store, lapse: Clock, integrations: Plug,
};
const STUDIO_SECTION_TONE: Record<string, Tone> = {
  brand: "primary", signin: "activity", ai: "nutrition", messaging: "cardio",
  // A grey badge in a row of toned ones reads as disabled, not as neutral.
  marketplace: "supplement", lapse: "warning", integrations: "sleep",
};

/**
 * "When access runs out" — the studio's own rule for a lapsed client.
 *
 * The second of two independent ladders, and the copy has to keep them apart:
 * this one is the STUDIO deciding about its client. The other is Kova deciding
 * about the studio, which the owner does not configure and is told about in
 * Billing instead.
 *
 * Two things this screen exists to make unmissable:
 *
 *  1. **The seat consequence.** Archiving KEEPS a client seat, deleting FREES
 *     one. A studio at its plan limit that archives everyone will hit the ceiling
 *     and have no idea why, so the seat line sits on the option itself rather
 *     than in help text nobody opens.
 *  2. **Destructive means destructive.** archive/delete cannot be undone by the
 *     client, so they carry a minimum grace window enforced by
 *     `checkLapsePolicy` — the same function the route validates with, so the
 *     screen can never promise something the server will refuse.
 */
function LapseSection() {
  const [policy, setPolicy] = useState<LapsePolicy | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void api.get<{ lapse: LapsePolicy }>("/api/settings").then((r) => setPolicy(r.lapse)).catch(() => setPolicy(DEFAULT_LAPSE_POLICY));
  }, []);

  if (!policy) return <SkeletonList rows={4} card />;

  const verdict = checkLapsePolicy(policy);
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await api.patch("/api/settings", { lapse: policy });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {LAPSE_ACTIONS.map((a) => {
          const meta = LAPSE_META[a];
          const on = policy.action === a;
          return (
            <button
              key={a}
              onClick={() => setPolicy((p) => ({
                action: a,
                // Lift the grace to the floor when switching to a destructive
                // option, rather than showing an error the user has to fix.
                graceDays: isDestructive(a) ? Math.max(p!.graceDays, MIN_DESTRUCTIVE_GRACE_DAYS) : p!.graceDays,
              }))}
              className={cn(
                "flex w-full items-start gap-3 rounded-2xl p-3 text-left transition-colors",
                on ? "bg-primary/12 ring-1 ring-primary" : "bg-surface-2 hover:bg-surface-3",
              )}
            >
              <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2", on ? "border-primary bg-primary" : "border-border")}>
                {on && <Check className="size-3 text-primary-foreground" />}
              </span>
              <span className="min-w-0 flex-1 space-y-0.5">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{meta.label}</span>
                  {meta.destructive && <Badge tone="danger">Can't be undone</Badge>}
                </span>
                <span className="block text-caption text-muted-foreground">{meta.effect}</span>
                {meta.seat && <span className="block text-caption font-medium text-warning">{meta.seat}</span>}
              </span>
            </button>
          );
        })}
      </div>

      <Field
        label="Wait this many days after their access ends"
        inputMode="numeric"
        value={String(policy.graceDays)}
        onChange={(e) => setPolicy((p) => ({ ...p!, graceDays: Number(e.target.value.replace(/\D/g, "") || 0) }))}
        hint={
          isDestructive(policy.action)
            ? `At least ${MIN_DESTRUCTIVE_GRACE_DAYS} days — this one can't be undone by the client.`
            : "0 applies it the moment their access ends."
        }
      />
      {!verdict.ok && <p className="text-caption text-danger">{verdict.error}</p>}
      {err && <p className="text-caption text-danger">{err}</p>}

      <Button size="lg" className="w-full" disabled={busy || !verdict.ok} onClick={() => void save()}>
        {saved ? <><Check /> Saved</> : busy ? "Saving…" : "Save rule"}
      </Button>
    </div>
  );
}

/**
 * THE STUDIO'S NAME — the one thing about a studio that had no way to change.
 *
 * The server has always allowed it (Better Auth's `organization/update`, owner
 * only), the onboarding wizard has always PROMISED it — "rename it any time in
 * Settings" — and there was no screen. So a studio that signed up as "byShujaa"
 * and meant "byShujaa." was stuck with the typo on every screen, every email
 * and every browser tab it will ever have.
 *
 * ── The name is not the address ─────────────────────────────────────────────
 *
 * Renaming touches `organization.name` and nothing else. The SLUG — the label
 * in `<slug>.kova.4dl.app` — is a separate field on the same endpoint, and this
 * screen deliberately does not send it: moving it deletes the old hostname
 * rather than aliasing it, so every bookmark, every emailed link and every
 * passkey on a custom domain breaks at once (see `@4dl/tenancy` org-guard.ts).
 * That is a different, much heavier decision, and pairing it with fixing a
 * missing full stop is how somebody makes it by accident.
 */
function StudioIdentitySection() {
  const { ctx, refresh } = useSession();
  const current = (ctx?.active?.tenantName ?? "").trim();
  const slug = ctx?.active?.tenantSlug ?? null;
  const [name, setName] = useState(current);
  const act = useAction();

  // Adopt whatever the server ended up with, rather than keeping the typed
  // string: after a save the context re-resolves, and the field must show what
  // the studio is actually called — including if it came back normalised.
  useEffect(() => { setName(current); }, [current]);

  const next = name.trim();
  const dirty = next.length > 0 && next !== current;
  const save = () =>
    act.run("save", async () => {
      await api.post("/api/auth/organization/update", { data: { name: next } });
      await refresh();
      return `Renamed to ${next}.`;
    }, `Couldn't rename your studio — it is still called ${current || "what it was"}.`);

  return (
    <section className="space-y-4">
      <Card>
        {/* The section's one line of context is the page intro (§7). Nothing
            here repeats it — the address is named in that line, and a paragraph
            explaining a control this screen does not offer is furniture. */}
        <Field
          label="Studio name"
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && dirty && void save()}
          hint={slug ? `Your address stays ${slug}` : undefined}
        />
      </Card>
      <SaveBar label="Save name" saving={act.busy === "save"} msg={act.msg} err={act.err} onSave={() => void save()} disabled={!dirty} />
    </section>
  );
}

/** Owner danger zone — close the studio: cancels billing now, holds data 7 days,
 *  then wipes everything (R2 + D1) for the studio and its members. OTP-confirmed. */
function CloseStudioSection() {
  const [status, setStatus] = useState<{ closing: boolean; deleteAt: string | null } | null>(null);
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<"intro" | "code">("intro");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => { setStatus(await api.get<{ closing: boolean; deleteAt: string | null }>("/api/tenant/close/status").catch(() => ({ closing: false, deleteAt: null }))); }, []);
  useEffect(() => { void load(); }, [load]);

  const sendCode = async () => {
    setBusy(true); setErr(null);
    try { await api.post("/api/tenant/close/request-otp"); setStage("code"); }
    catch { setErr("Couldn't send the code. Try again."); }
    finally { setBusy(false); }
  };
  const confirmClose = async () => {
    setBusy(true); setErr(null);
    try { await api.post("/api/tenant/close", { code: code.trim() }); setOpen(false); await load(); }
    catch (e) { setErr((e as { status?: number })?.status === 403 ? "That code is wrong or has expired." : "Couldn't close the studio. Try again."); }
    finally { setBusy(false); }
  };
  /**
   * The way BACK from a scheduled deletion, so a silent failure here is the
   * worst one on this screen: the owner taps "Keep my studio", the spinner
   * stops, the card still says "scheduled for deletion", and nothing says
   * whether the cancel landed. It had no catch at all.
   */
  const keepStudio = async () => {
    setBusy(true); setErr(null);
    try { await api.post("/api/tenant/close/cancel"); await load(); }
    catch (e) { setErr(errorText(e, "Couldn't cancel the deletion — your studio is still scheduled. Try again.")); }
    finally { setBusy(false); }
  };

  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }) : "");

  return (
    <Stagger>
      {status?.closing ? (
        <Card className="space-y-2.5">
          <div className="flex items-center gap-2 font-medium text-danger"><AlertTriangle className="size-4" /> Studio scheduled for deletion</div>
          <p className="text-sm text-muted-foreground">Billing is canceled. Your studio and all its data will be permanently erased on <span className="font-medium text-foreground">{fmt(status.deleteAt)}</span>. You can still undo this before then.</p>
          <Button variant="secondary" className="w-full" disabled={busy} onClick={() => void keepStudio()}>{busy ? <><Spinner /> …</> : "Keep my studio"}</Button>
          {/* `err` was only ever rendered inside the confirmation sheet, so a
              failed cancel out here had nowhere to appear. */}
          <ActionResult msg={null} err={err} />
        </Card>
      ) : (
        <Card className="space-y-2.5">
          <div className="flex items-center gap-2 font-medium text-danger"><AlertTriangle className="size-4" /> Close this studio</div>
          <p className="text-sm text-muted-foreground">Cancels your Kova subscription, then permanently deletes the studio and everything in it — every client, plan, log and file — after a 7-day grace period. This can't be undone once the grace period passes.</p>
          <Button variant="outline" className="w-full border-danger/40 text-danger" onClick={() => { setStage("intro"); setCode(""); setErr(null); setOpen(true); }}><Trash2 /> Close my studio…</Button>
        </Card>
      )}

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Close your studio"
        /* Two steps, one frame — so the footer follows the step. Each stage has
           exactly one thing to press, and it is always in the same place. */
        footer={stage === "intro" ? (
          <Button size="lg" className="w-full" disabled={busy} onClick={() => void sendCode()}>{busy ? <><Spinner /> Sending…</> : "Email me a confirmation code"}</Button>
        ) : (
          <Button size="lg" className="w-full border-danger/40 text-danger" variant="outline" disabled={busy || code.length < 6} onClick={() => void confirmClose()}>{busy ? <><Spinner /> …</> : <><Trash2 /> Schedule studio deletion</>}</Button>
        )}
      >
        {stage === "intro" ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">This cancels billing immediately and schedules your studio for permanent deletion in 7 days. We'll email you a confirmation code first.</p>
            <ActionResult msg={null} err={err} />
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Enter the 6-digit code we emailed you to schedule the closure.</p>
            <Field label="Confirmation code" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))} placeholder="000000" autoFocus />
            <ActionResult msg={null} err={err} />
          </div>
        )}
      </Sheet>
    </Stagger>
  );
}

/**
 * Sign-in — the tenant's front door. Shows the shareable login link (their custom
 * domain if live, else their own subdomain), the login-screen customization (copy,
 * hero image, passkey), and the custom-domain setup.
 */
/**
 * Sign-in — the address, the screen, and the domain.
 *
 * Three unrelated jobs stacked: a link to copy, a full editor with a live
 * preview, and DNS. The preview alone made the page long enough that the link
 * — the thing an owner comes here to grab and paste into a message — was above
 * a screen of editor they did not want.
 *
 * Without `branding` the middle and last rows are not hidden: they are shown,
 * disabled, saying what would unlock them. A capability you cannot see is one
 * you cannot decide to buy.
 */
function SignInSettings({ canBrand, branding, slug, onSaved }: { canBrand: boolean; branding: TenantBranding | null; slug: string | null; onSaved: () => void }) {
  const login = branding?.login ?? null;
  const customised = [login?.headline, login?.subtext, login?.bgImageUrl].filter(Boolean).length;
  return (
    <SectionSplit
      param="g"
      subs={[
        {
          key: "link", label: "Your sign-in address", icon: LogIn, tone: "primary",
          value: slug ? `${slug}.${location.hostname.split(".").slice(1).join(".") || location.hostname}` : "…",
          render: () => <LoginLinkCard slug={slug} />,
        },
        {
          key: "screen", label: "The sign-in screen", icon: Palette, tone: "cardio",
          value: !canBrand ? "In the branding add-on" : customised ? `${customised} of 3 customised` : "Kova's default copy",
          render: () => canBrand
            ? <LoginCustomizeSection initial={login} logoUrl={branding?.logoUrl ?? null} onSaved={onSaved} />
            : <p className="px-1 text-sm text-muted-foreground">Your own copy, a hero image and a branded domain are part of the branding add-on.</p>,
        },
        {
          key: "domain", label: "Your own domain", icon: Globe, tone: "sleep",
          value: !canBrand ? "In the branding add-on" : "Point a domain you own at your studio",
          render: () => canBrand
            ? <DomainSection />
            : <p className="px-1 text-sm text-muted-foreground">Using your own domain is part of the branding add-on.</p>,
        },
      ]}
    />
  );
}

/**
 * The shareable login link.
 *
 * The server decides which hostname is canonical — an active custom domain,
 * otherwise the studio's own subdomain — and hands it back as `canonical`, so this
 * card and every emailed invite quote the SAME address. It used to build
 * `${location.origin}/t/${slug}`, which is now a dead end: the platform root
 * serves a signpost, so that link would have sent a studio's clients nowhere.
 */
function LoginLinkCard({ slug }: { slug: string | null }) {
  const [canonical, setCanonical] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    void api
      .get<{ canonical: string | null }>("/api/domains")
      .then((r) => setCanonical(r.canonical))
      .catch(() => setCanonical(null));
  }, []);
  const link = canonical ? `https://${canonical}` : slug ? `${location.protocol}//${location.host}` : location.origin;
  const pretty = link.replace(/^https?:\/\//, "");
  const copy = () => void navigator.clipboard?.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); });
  return (
    <section>
      <Card className="space-y-3">
        <div className="flex items-center gap-2.5"><div className="grid size-9 place-items-center rounded-xl bg-primary/15 text-primary [&_svg]:size-4"><LogIn /></div><div><div className="font-medium">Your sign-in link</div><div className="text-sm text-muted-foreground">Share this with clients — it opens a sign-in screen wearing your brand.</div></div></div>
        <div className="flex items-center gap-2 rounded-xl bg-surface-2 p-2 pl-3.5">
          <Globe className="size-4 shrink-0 text-muted-foreground" />
          <code className="min-w-0 flex-1 truncate font-mono text-sm">{pretty}</code>
          <Button size="sm" variant={copied ? "tonal" : "secondary"} onClick={copy}>{copied ? <><Check /> Copied</> : <><Copy /> Copy</>}</Button>
          <Button size="icon" variant="secondary" aria-label="Open login link" onClick={() => window.open(link, "_blank")}><ExternalLink /></Button>
        </div>
        {canonical && !canonical.startsWith(`${slug ?? ""}.`)
          ? <p className="text-xs text-muted-foreground">Served on your live domain <span className="font-medium text-foreground">{canonical}</span>.</p>
          : <p className="text-xs text-muted-foreground">Your studio&rsquo;s own address, live from the moment you created it. Connect a custom domain below for a link on a domain you own.</p>}
      </Card>
    </section>
  );
}

/**
 * Login-screen customization — the copy + affordances shown on the tenant's
 * branded sign-in (their subdomain or their custom domain). A live mini-preview mirrors
 * the current theme (so it wears the tenant's brand) as the owner edits.
 */
function LoginCustomizeSection({ initial, logoUrl, onSaved }: { initial: LoginBranding | null; logoUrl: string | null; onSaved: () => void }) {
  const { ctx } = useSession();
  const brandName = ctx?.active?.tenantName ?? "Your studio";
  const [tagline, setTagline] = useState(initial?.tagline ?? "");
  const [headline, setHeadline] = useState(initial?.headline ?? "");
  const [subtext, setSubtext] = useState(initial?.subtext ?? "");
  const [bgImageUrl, setBgImageUrl] = useState<string | null>(initial?.bgImageUrl ?? null);
  const [showPasskey, setShowPasskey] = useState(initial?.showPasskey !== false);
  const act = useAction();

  const upload = (file: File) =>
    act.run("upload", async () => {
      const key = await uploadMedia(file, "brand", file.name);
      setBgImageUrl(`/api/media/${key}`);
    }, "Couldn't upload that image — try again.");

  const save = () =>
    act.run("save", async () => {
      const login: LoginBranding = {
        tagline: tagline.trim() || null,
        headline: headline.trim() || null,
        subtext: subtext.trim() || null,
        bgImageUrl: bgImageUrl || null,
        showPasskey,
      };
      await api.patch("/api/settings", { branding: { login } });
      onSaved();
      return "Sign-in screen saved.";
    }, "Couldn't save the sign-in screen — it's unchanged.");

  return (
    <section>
      <Card className="space-y-5">
        <div className="flex items-center gap-2.5"><div className="grid size-9 place-items-center rounded-xl bg-primary/15 text-primary [&_svg]:size-4"><Palette /></div><div><div className="font-medium">Make it yours</div><div className="text-sm text-muted-foreground">Your words and your image on the screen clients land on.</div></div></div>

        {/* Live preview — mirrors the app's current theme (the tenant's brand). */}
        <LoginPreview brandName={brandName} logoUrl={logoUrl} tagline={tagline} headline={headline} subtext={subtext} bgImageUrl={bgImageUrl} showPasskey={showPasskey} />

        <Field label="Tagline" value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="No passwords, ever" maxLength={60} hint="The small accent line above the form." />
        <Field label="Welcome headline" value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Welcome back — sign in to continue." maxLength={120} />
        <Field label="Subtext" value={subtext} onChange={(e) => setSubtext(e.target.value)} placeholder="Optional — a quieter second line." maxLength={200} />

        {/* Hero background image */}
        <div className="space-y-2">
          <div className="text-sm font-medium">Background image <span className="font-normal text-muted-foreground">— optional</span></div>
          <div className="flex items-center gap-3">
            <div className="grid h-16 w-24 shrink-0 place-items-center overflow-hidden rounded-xl border border-border/60 bg-surface-2">
              {bgImageUrl ? <img src={bgImageUrl} alt="Background" className="size-full object-cover" /> : <ImageIcon className="size-5 text-muted-foreground" />}
            </div>
            <div className="flex flex-1 flex-wrap gap-2">
              <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-secondary px-3.5 text-sm font-medium transition-colors hover:bg-surface-3 [&_svg]:size-4"><Upload /> Upload
                <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
              </label>
              {bgImageUrl && <Button size="icon" variant="secondary" aria-label="Remove background" onClick={() => setBgImageUrl(null)}><Trash2 /></Button>}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Sits behind a soft scrim so your copy stays readable in light and dark.</p>
        </div>

        <ToggleRow icon={KeyRound} title="Passkey shortcut" desc="Show the one-tap “Sign in with a passkey” option." checked={showPasskey} onChange={setShowPasskey} />

        <SaveBar label="Save sign-in screen" saving={act.busy === "save"} msg={act.msg} err={act.err} onSave={() => void save()} />
      </Card>
    </section>
  );
}

/** A compact, faithful mock of the login screen using live theme tokens — so
 *  the owner sees their brand + copy exactly as clients will. */
/**
 * The optional light-surface override for a mark.
 *
 * Rendered on a LIGHT plate whatever mode the editor is in, because that is the
 * entire question being asked: a one-colour mark drawn for the dark app is pale
 * and disappears the moment a member switches to light, and the only way to
 * know whether yours does is to see it on white. Showing the dark mark here as
 * the fallback preview is the feature — if it looks fine, upload nothing.
 *
 * Deliberately quiet and secondary. Most studios use a full-colour mark that
 * needs no second file, and a slot that shouts implies a step everyone owes.
 */
function LightVariant({ label, url, fallback, wide, onUpload, onClear }: {
  label: string;
  url: string | null;
  /** The dark mark, previewed on white when no override is set. */
  fallback: string | null;
  wide?: boolean;
  onUpload: (f: File) => void;
  onClear: () => void;
}) {
  const shown = url || fallback;
  // design-tokens-exempt: sits on the literal-white plate below, where a themed
  // muted token would be invisible in light mode.
  const emptyMark = <ImageIcon className="size-4 text-black/30" />;
  return (
    <div className="flex items-center gap-3 rounded-xl bg-surface-2/60 p-2.5">
      {/* design-tokens-exempt: the plate is LITERAL white on purpose. This preview
          asks one question — does your mark survive a light background? — and a
          token surface would follow the theme and answer it only half the time,
          which is the failure the whole control exists to catch. */}
      <div className={cn("grid shrink-0 place-items-center overflow-hidden rounded-lg border border-black/10 bg-white", wide ? "h-12 w-20" : "size-12")}>
        {shown
          ? <img src={shown} alt="" className={wide ? "max-h-10 max-w-18 object-contain" : "size-full object-cover"} />
          : emptyMark}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">
          {url ? "Used on light backgrounds." : "Optional — the mark above is used otherwise."}
        </div>
      </div>
      <div className="flex shrink-0 gap-1.5">
        <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full bg-secondary px-3 text-xs font-medium transition-colors hover:bg-surface-3 [&_svg]:size-3.5">
          <Upload /> {url ? "Replace" : "Add"}
          <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} />
        </label>
        {url && <Button size="icon" variant="secondary" className="size-8" aria-label={`Remove ${label}`} onClick={onClear}><Trash2 /></Button>}
      </div>
    </div>
  );
}

function LoginPreview({ brandName, logoUrl, tagline, headline, subtext, bgImageUrl, showPasskey }: {
  brandName: string; logoUrl: string | null; tagline: string; headline: string; subtext: string; bgImageUrl: string | null; showPasskey: boolean;
}) {
  const tag = tagline.trim() || "No passwords, ever";
  const head = headline.trim() || "Welcome back — sign in to continue.";
  const sub = subtext.trim();
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-background p-6">
      {bgImageUrl && <><div className="pointer-events-none absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${bgImageUrl})` }} /><div className="pointer-events-none absolute inset-0 bg-background/80 backdrop-blur-sm" /></>}
      <div className="pointer-events-none absolute -top-16 left-1/2 size-40 -translate-x-1/2 rounded-full bg-primary/25 blur-[60px]" />
      <div className="relative mx-auto max-w-[15rem] space-y-4 text-center">
        {logoUrl ? <img src={logoUrl} alt={brandName} className="mx-auto h-9 w-auto max-w-[60%] object-contain" /> : <div className="mx-auto grid size-10 place-items-center rounded-2xl bg-primary text-lg font-black text-primary-foreground">{brandName.charAt(0).toUpperCase()}</div>}
        <div>
          <div className="text-lg font-bold tracking-tight">{brandName}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{head}</div>
          {sub && <div className="text-xs text-muted-foreground/80">{sub}</div>}
        </div>
        <div className="space-y-2.5 rounded-2xl border border-border/60 bg-card p-3.5 text-left shadow-sm">
          <div className="text-xs font-medium text-primary">{tag}</div>
          <div className="flex items-center gap-2 rounded-lg bg-surface-2 px-2.5 py-2 text-xs text-muted-foreground"><Mail className="size-3.5" /> you@example.com</div>
          <div className="flex items-center justify-center gap-1.5 rounded-full bg-primary py-2 text-xs font-semibold text-primary-foreground">Email me a code <ArrowRight className="size-3" /></div>
          {showPasskey && <div className="flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground"><KeyRound className="size-3" /> Sign in with a passkey</div>}
        </div>
      </div>
    </div>
  );
}

/**
 * Passkeys — `@4dl/app-kit`'s card.
 *
 * The ceremony was already that package's (`enrollPasskey`, `listPasskeys`,
 * `removePasskey`, the conditional-UI probe); the SCREEN was Kova's, which is
 * why the second app shipped with no passkey UI at all. `usePasskey().refresh`
 * stays here — the "add a passkey?" prompt is Kova's idea, not part of passkeys.
 */
function SecuritySection() {
  const pk = usePasskey();
  return <section><PasskeysCard onChanged={() => pk?.refresh()} /></section>;
}

/**
 * Insight types this device has muted, with a way back.
 *
 * "Mute these" under a coach note was a one-way door — it wrote a localStorage
 * flag and nothing could read the set back, so no screen could offer to undo
 * it. The only route to un-muting was signing out (which clears the app's
 * storage): undiscoverable, and it meant the choice silently didn't survive a
 * sign-out either. This renders nothing at all when nothing is muted, so it
 * costs a reader nothing until it has something to say.
 */
function MutedInsightsSection() {
  const [muted, setMuted] = useState<string[]>(() => mutedInsights());
  if (!muted.length) return null;
  const unmute = (t: string) => { unmuteInsight(t); setMuted((m) => m.filter((x) => x !== t)); };
  return (
    <Stagger>
      <section>
        <SectionHead title="Muted on this device" icon={BellOff} />
        <Card className="divide-y divide-border/50 p-0">
          {muted.map((t) => (
            <div key={t} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="text-sm font-medium">{INSIGHT_LABELS[t] ?? t}</div>
                <div className="text-xs text-muted-foreground">Hidden on this device only — your other devices still show them.</div>
              </div>
              <Button size="sm" variant="secondary" onClick={() => unmute(t)}>Turn back on</Button>
            </div>
          ))}
        </Card>
      </section>
    </Stagger>
  );
}

// The personal "Appearance" tab is gone. It held three toggles; two of them
// (tinted nav, ambient wash) turned out to be studio decisions rather than
// personal ones and moved into Studio → Branding, and the third — dark mode —
// is one tap away in the account menu in the app bar. What was left was a tab
// containing a control that already exists somewhere better.

function ToggleRow({ icon: Icon, title, desc, checked, onChange }: { icon: LucideIcon; title: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 p-4">
      <div className="flex min-w-0 items-center gap-3.5">
        <Icon className="size-[1.2rem] shrink-0 text-muted-foreground" />
        <div className="min-w-0"><div className="text-sm font-medium">{title}</div><div className="text-xs text-muted-foreground">{desc}</div></div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

/** Per-user notification channels — inbox + email, per category, role-scoped. */
function NotificationsSection() {
  const [data, setData] = useState<{ categories: { key: string; label: string; blurb: string }[]; prefs: Record<string, { inbox: boolean; email: boolean }> } | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    setError(false);
    try { setData(await api.get("/api/notification-prefs")); }
    catch { setError(true); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const toggle = async (cat: string, channel: "inbox" | "email", v: boolean) => {
    setData((d) => (d ? { ...d, prefs: { ...d.prefs, [cat]: { ...d.prefs[cat]!, [channel]: v } } } : d));
    await api.patch("/api/notification-prefs", { [cat]: { [channel]: v } }).catch(() => void load());
  };
  return (
    <section>
      {error && !data ? <LoadError label="your notification settings" error={typeof error === "string" ? error : null} onRetry={() => void load()} /> : (
      <Card className="divide-y divide-border/50 p-0">
        <div className="flex items-center justify-end gap-6 px-4 py-2.5 text-micro uppercase text-muted-foreground">
          <span className="inline-flex items-center gap-1"><Bell className="size-3.5" /> App</span>
          <span className="inline-flex items-center gap-1"><Mail className="size-3.5" /> Email</span>
        </div>
        {!data
          ? [0, 1, 2, 3].map((i) => <div key={i} className="p-4"><SkeletonLine w="8rem" h="text" /></div>)
          : data.categories.map((cat) => (
              <div key={cat.key} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0"><div className="text-sm font-medium">{cat.label}</div><div className="text-xs text-muted-foreground">{cat.blurb}</div></div>
                <div className="flex shrink-0 items-center gap-6">
                  {cat.key === "digest" ? <span className="w-9" /> : <Switch checked={data.prefs[cat.key]?.inbox ?? false} onCheckedChange={(v) => void toggle(cat.key, "inbox", v)} />}
                  <Switch checked={data.prefs[cat.key]?.email ?? false} onCheckedChange={(v) => void toggle(cat.key, "email", v)} />
                </div>
              </div>
            ))}
      </Card>
      )}
    </section>
  );
}

/** Owner: which notification categories members are allowed to receive by EMAIL.
 *  A studio-wide allow-list layered on top of each member's own preference — the
 *  inbox is never gated, only the email channel. */
interface EmailTemplate { type: string; label: string; category: string; vars: string[]; defaultSubject: string; defaultBody: string; subject: string; body: string; enabled: boolean; customized: boolean }

/** Owner email white-label — rewrite each notification email's subject/body with
 *  {{variables}}, mute a type's email, and set a global signature. */
function EmailTemplatesSection() {
  const [templates, setTemplates] = useState<EmailTemplate[] | null>(null);
  const [signature, setSignature] = useState("");
  const [sigSaved, setSigSaved] = useState(false);
  const [openType, setOpenType] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    setError(false);
    try {
      const r = await api.get<{ templates: EmailTemplate[]; signature: string }>("/api/email-templates");
      setTemplates(r.templates); setSignature(r.signature);
    } catch { setError(true); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const [sigErr, setSigErr] = useState<string | null>(null);
  const saveSig = async () => {
    setSigErr(null);
    // The signature save used to swallow its error and still flash "Saved" — the
    // owner walked away believing a footer was stored that never was.
    try { await api.put("/api/email-signature", { signature }); setSigSaved(true); setTimeout(() => setSigSaved(false), 1500); }
    catch (e) { setSigErr(errorText(e, "Couldn't save your signature — try again.")); }
  };

  return (
    <section className="space-y-3">
      <Card className="space-y-2">
        <div className="text-sm font-medium">Signature</div>
        <p className="text-xs text-muted-foreground">Appended to the footer of every email your studio sends.</p>
        <Textarea rows={2} value={signature} onChange={(e) => setSignature(e.target.value)} placeholder="Team YourStudio · reply to this email anytime" />
        {sigErr && <p className="text-sm text-warning">{sigErr}</p>}
        <div className="flex justify-end"><Button size="sm" onClick={() => void saveSig()}>{sigSaved ? "Saved" : "Save signature"}</Button></div>
      </Card>

      {error && !templates ? (
        <LoadError label="your email templates" error={typeof error === "string" ? error : null} onRetry={() => void load()} />
      ) : !templates ? (
        <SkeletonLine w="10rem" h="text" />
      ) : (
        <div className="space-y-2">
          {templates.map((t) => (
            <EmailTemplateRow key={t.type} tpl={t} open={openType === t.type} onToggle={() => setOpenType((o) => (o === t.type ? null : t.type))} onSaved={() => void load()} />
          ))}
        </div>
      )}
    </section>
  );
}

function EmailTemplateRow({ tpl, open, onToggle, onSaved }: { tpl: EmailTemplate; open: boolean; onToggle: () => void; onSaved: () => void }) {
  const [subject, setSubject] = useState(tpl.subject);
  const [body, setBody] = useState(tpl.body);
  const [enabled, setEnabled] = useState(tpl.enabled);
  const act = useAction();
  const busy = act.busy !== null;
  const dirty = subject !== tpl.subject || body !== tpl.body || enabled !== tpl.enabled;
  const save = () =>
    act.run("save", async () => {
      await api.put(`/api/email-templates/${tpl.type}`, { subject, body, enabled });
      onSaved();
    }, "Couldn't save this template — it's unchanged.");
  const reset = () =>
    act.run("reset", async () => {
      await api.del(`/api/email-templates/${tpl.type}`);
      // Only after the delete lands. Resetting the fields first would show the
      // default copy for a template the server still has customised.
      setSubject(tpl.defaultSubject); setBody(tpl.defaultBody); setEnabled(true);
      onSaved();
    }, "Couldn't restore the default — this template is unchanged.");
  return (
    <Card className="p-0">
      <button onClick={onToggle} className="flex w-full items-center justify-between gap-3 p-4 text-left">
        <div className="min-w-0"><div className="truncate text-sm font-medium capitalize">{tpl.label}</div><div className="truncate text-xs text-muted-foreground">{tpl.subject}</div></div>
        <div className="flex shrink-0 items-center gap-2">{tpl.customized && <Badge tone="primary">Custom</Badge>}{!tpl.enabled && <Badge tone="neutral">Email off</Badge>}</div>
      </button>
      {open && (
        <div className="space-y-3 border-t border-border/50 p-4">
          <Field label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Body (HTML)</span>
            <Textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} className="font-mono text-xs" />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Variables:</span>
            {tpl.vars.map((v) => <Chip key={v} onClick={() => setBody((b) => `${b}{{${v}}}`)}>{`{{${v}}}`}</Chip>)}
          </div>
          <ActionResult msg={act.msg} err={act.err} />
          <div className="flex items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm"><Switch checked={enabled} onCheckedChange={setEnabled} /> Send this email</label>
            <div className="flex gap-2">
              {tpl.customized && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void reset()}>{act.busy === "reset" ? "Resetting…" : "Reset"}</Button>}
              <Button size="sm" disabled={busy || !dirty} onClick={() => void save()}>{act.busy === "save" ? "Saving…" : "Save"}</Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

interface NotifCat { key: string; label: string; blurb: string; roles: string[] }
type AudiencePolicy = { client: Record<string, boolean>; staff: Record<string, boolean> };

function NotificationPolicySection() {
  const [data, setData] = useState<{ notifCategories: NotifCat[]; notifPolicy: AudiencePolicy } | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    setError(false);
    try {
      const r = await api.get<{ notifCategories: NotifCat[]; notifPolicy: AudiencePolicy }>("/api/settings");
      setData({ notifCategories: r.notifCategories, notifPolicy: r.notifPolicy });
    } catch { setError(true); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const toggle = async (audience: "client" | "staff", cat: string, v: boolean) => {
    setData((d) => (d ? { ...d, notifPolicy: { ...d.notifPolicy, [audience]: { ...d.notifPolicy[audience], [cat]: v } } } : d));
    await api.patch("/api/settings", { notifPolicy: { [audience]: { [cat]: v } } }).catch(() => void load());
  };
  const isStaff = (roles: string[]) => roles.some((r) => r !== "client");
  return (
    <section>
      {error && !data ? <LoadError label="your email policy" error={typeof error === "string" ? error : null} onRetry={() => void load()} /> : (
      <Card className="p-0">
        <p className="px-4 pt-4 text-sm text-muted-foreground">Choose which notifications may be emailed — separately for your clients and your staff. Turning one off keeps it in the in-app inbox but never emails it; people still tune their own preferences within what you allow here.</p>
        <div className="mt-2 flex items-center justify-end gap-6 px-4 pb-1 text-micro uppercase text-muted-foreground">
          <span className="w-10 text-center">Clients</span><span className="w-10 text-center">Staff</span>
        </div>
        <div className="divide-y divide-border/50">
          {!data
            ? [0, 1, 2].map((i) => <div key={i} className="p-4"><SkeletonLine w="8rem" h="text" /></div>)
            : data.notifCategories.map((cat) => (
                <div key={cat.key} className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0"><div className="text-sm font-medium">{cat.label}</div><div className="text-xs text-muted-foreground">{cat.blurb}</div></div>
                  <div className="flex shrink-0 items-center gap-6">
                    <div className="grid w-10 place-items-center">{cat.roles.includes("client") ? <Switch checked={data.notifPolicy.client[cat.key] ?? true} onCheckedChange={(v) => void toggle("client", cat.key, v)} /> : <span className="text-muted-foreground/40">—</span>}</div>
                    <div className="grid w-10 place-items-center">{isStaff(cat.roles) ? <Switch checked={data.notifPolicy.staff[cat.key] ?? true} onCheckedChange={(v) => void toggle("staff", cat.key, v)} /> : <span className="text-muted-foreground/40">—</span>}</div>
                  </div>
                </div>
              ))}
        </div>
      </Card>
      )}
    </section>
  );
}

/** Owner: how the studio sends email — the metered platform sender or your Brevo. */
/**
 * Email — three settings stacked on one page, now three pages.
 *
 * Delivery, notification policy and templates each loaded independently and
 * rendered one after another, so the page ran to nearly a megabyte of
 * screenshot and an owner checking "can my studio send email at all" had to
 * scroll past the whole thing to find out.
 *
 * The split does ONE read here and derives all three rows' values from it —
 * both `/api/settings` reads are the same request, so this costs a fetch and
 * saves two. Each sub-page still owns its own state and its own save; nothing
 * here is a shared form, so `SectionSplit` gets no footer.
 */
function MessagingSettings() {
  const [cfg, setCfg] = useState<{
    email: { provider: string; senderEmail: string; ready: boolean };
    notifCategories: NotifCat[]; notifPolicy: AudiencePolicy;
  } | null>(null);
  const [tpl, setTpl] = useState<{ templates: EmailTemplate[] } | null>(null);
  useEffect(() => {
    void api.get<typeof cfg & object>("/api/settings").then(setCfg).catch(() => undefined);
    void api.get<{ templates: EmailTemplate[] }>("/api/email-templates").then(setTpl).catch(() => undefined);
  }, []);

  const deliveryValue = !cfg ? "…"
    : !cfg.email.ready ? "Not set up — nothing can be sent"
    : `${cfg.email.provider === "platform" ? "Sent by Kova" : "Your own sender"}${cfg.email.senderEmail ? ` · ${cfg.email.senderEmail}` : ""}`;

  const policyValue = (() => {
    if (!cfg) return "…";
    const cats = cfg.notifCategories ?? [];
    const on = (a: "client" | "staff") => cats.filter((c) => cfg.notifPolicy?.[a]?.[c.key] !== false).length;
    return cats.length ? `${on("client")}/${cats.length} to clients · ${on("staff")}/${cats.length} to staff` : "Every kind allowed";
  })();

  /* `customized` is the server's own flag for "the owner rewrote this one".
     Counting templates that merely HAVE a subject counted the defaults too, so
     a studio that had changed nothing was told it had rewritten all thirty. */
  const tplValue = !tpl ? "…"
    : (() => {
        const edited = tpl.templates.filter((t) => t.customized).length;
        const off = tpl.templates.filter((t) => !t.enabled).length;
        if (!edited && !off) return "All using Kova's wording";
        return [edited ? `${edited} rewritten` : null, off ? `${off} muted` : null].filter(Boolean).join(" · ");
      })();

  return (
    <SectionSplit
      param="m"
      subs={[
        { key: "delivery", label: "Who it comes from", icon: Mail, tone: "cardio", value: deliveryValue, render: () => <EmailSection /> },
        { key: "policy", label: "What may be emailed", icon: Bell, tone: "activity", value: policyValue, render: () => <NotificationPolicySection /> },
        { key: "templates", label: "What it says", icon: PencilLine, tone: "nutrition", value: tplValue, render: () => <EmailTemplatesSection /> },
      ]}
    />
  );
}

function EmailSection() {
  const [cfg, setCfg] = useState<{ email: { provider: string; senderEmail: string; senderName: string; brevoKeySet: boolean; ready: boolean }; emailPlatformFrom: string; emailCreditsEach: number } | null>(null);
  const [brevoKey, setBrevoKey] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [senderName, setSenderName] = useState("");
  const act = useAction();
  const busy = act.busy !== null;
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    setError(false);
    try {
      const r = await api.get<{ email: { provider: string; senderEmail: string; senderName: string; brevoKeySet: boolean; ready: boolean }; emailPlatformFrom: string; emailCreditsEach: number }>("/api/settings");
      setCfg(r); setSenderEmail(r.email.senderEmail); setSenderName(r.email.senderName);
    } catch { setError(true); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  // A failed read used to render NOTHING (`if (!cfg) return null`) — the whole
  // "Email delivery" section just wasn't there, so the owner had no way to tell
  // a broken load from a section they'd never been given.
  if (error && !cfg) return (
    <section>
      <LoadError label="your email delivery settings" error={typeof error === "string" ? error : null} onRetry={() => void load()} />
    </section>
  );
  if (!cfg) return null;
  const provider = cfg.email.provider;
  /** The lane switch is instant, so a refusal has to both put the control back
   *  (that is what the reload does) and SAY so — the reload alone looked like the
   *  segmented control spontaneously changing its mind. */
  const setProvider = (p: string) =>
    act.run("provider", async () => {
      setCfg((c) => (c ? { ...c, email: { ...c.email, provider: p } } : c));
      try { await api.patch("/api/settings", { email: { provider: p } }); }
      catch (e) { await load(); throw e; }
    }, "Couldn't change who your email comes from.");
  /** Sender name only — the platform lane has nothing else to save. */
  const saveSender = () =>
    act.run("sender", async () => {
      await api.patch("/api/settings", { email: { senderName } });
      await load();
      return "Sender name saved.";
    }, "Couldn't save the sender name.");
  const saveBrevo = () =>
    act.run("brevo", async () => {
      await api.patch("/api/settings", { email: { senderEmail, senderName, ...(brevoKey ? { brevoApiKey: brevoKey } : {}) } });
      setBrevoKey("");
      await load();
      return "Brevo settings saved.";
    }, "Couldn't save your Brevo settings — nothing was changed.");
  return (
    <section>
      <Card className="space-y-3">
        <SegmentedControl
          options={[{ value: "platform", label: "Kova" }, { value: "brevo", label: "Brevo" }, { value: "off", label: "Off" }]}
          value={provider}
          onChange={(v) => void setProvider(v)}
        />
        {provider === "platform" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Sends from <span className="font-medium text-foreground">{cfg.emailPlatformFrom.replace(/.*<|>.*/g, "")}</span> — no setup, no account to
              verify. Metered against your studio credits.
            </p>
            {/* The price, where the choice is made. It was only ever discoverable
                afterwards, in the credit ledger. */}
            <ConfigRow
              label="Cost per email"
              ok
              okLabel={cfg.emailCreditsEach === 0 ? "Free" : `${cfg.emailCreditsEach} cr`}
              detail={cfg.emailCreditsEach === 0
                ? "Metering is switched off for this deployment."
                : `Charged when the email actually goes out, and refunded if it fails. Brevo sends on your own account instead, at no credit cost.`}
            />
            {/* Sender name applies HERE too. It used to be a Brevo-only field, so
                a studio on the default provider set it and nothing happened. The
                address must stay ours — it is the authenticated domain — but the
                name is theirs. */}
            <Field
              label="Sender name"
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
              placeholder={"Your studio's name"}
              hint={`Shown as the sender: “${(senderName.trim() || "Your Studio")} <${cfg.emailPlatformFrom.replace(/.*<|>.*/g, "")}>”.`}
            />
            <div className="flex justify-end">
              <Button size="sm" disabled={busy || senderName === cfg.email.senderName} onClick={() => void saveSender()}>{busy ? "Saving…" : "Save"}</Button>
            </div>
          </div>
        )}
        {provider === "off" && <p className="text-sm text-muted-foreground">Email is off — members still get in-app notifications. Login codes always send.</p>}
        {provider === "brevo" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Send through your own Brevo account — your sender, your bill, no credits.</p>
            <Field label="Sender email" value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)} placeholder="coach@yourstudio.com" />
            <Field label="Sender name" value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="Your Studio" />
            <Field label={cfg.email.brevoKeySet ? "Brevo API key (set — leave blank to keep)" : "Brevo API key"} value={brevoKey} onChange={(e) => setBrevoKey(e.target.value)} type="password" placeholder="xkeysib-…" />
            <div className="flex items-center justify-between">
              <Badge tone={cfg.email.ready ? "success" : "warning"}>{cfg.email.ready ? "Ready" : "Needs key + sender"}</Badge>
              <Button size="sm" disabled={busy} onClick={() => void saveBrevo()}>{busy ? "Saving…" : "Save"}</Button>
            </div>
          </div>
        )}
        {/* One outcome line for all three controls — the lane switch, the sender
            name and the Brevo credentials share a card, so they share a result. */}
        <ActionResult msg={act.msg} err={act.err} />
      </Card>
    </section>
  );
}

/*
  Sign out and Delete are the two ways OUT, so they are one group of two rows.
  Delete used to be a card with a heading, a paragraph and a button while Sign
  out beside it was a row — two spellings of the same idea, stacked. The
  paragraph moved to the confirmation sheet, which is where a consequence
  belongs: at the moment you are asked to accept it, not two taps earlier.
*/
function AccountExits({ onDelete, deleteBlocked }: { onDelete: () => void; deleteBlocked: boolean }) {
  const { signOut } = useSession();
  return (
    <SettingsIndex
      groups={[{
        header: "Account",
        rows: [
          { key: "signout", icon: LogOut, label: "Sign out", tone: "neutral", onClick: () => void signOut() },
          {
            key: "delete", icon: Trash2, label: "Delete my account", destructive: true,
            sub: deleteBlocked ? "Close your studio first" : "Erases everything, permanently",
            disabled: deleteBlocked,
            onClick: onDelete,
          },
        ],
      }]}
    />
  );
}

/** GDPR self-delete — an emailed code confirms erasing the account + all data.
 *  Owners are redirected to close their studio (which cancels billing first). */
function DeleteAccountSection() {
  const { ctx, signOut } = useSession();
  const isOwner = ctx?.active?.role === "owner";
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<"intro" | "code">("intro");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const status = (e: unknown): number | undefined => (e as { status?: number })?.status;

  const sendCode = async () => {
    setBusy(true); setErr(null);
    try { await api.post("/api/me/delete/request-otp"); setStage("code"); }
    catch (e) { setErr(status(e) === 409 ? "You own a studio — close it first in Studio settings → Danger zone." : "Couldn't send the code. Try again."); }
    finally { setBusy(false); }
  };
  const confirmDelete = async () => {
    setBusy(true); setErr(null);
    try { await api.post("/api/me/delete", { code: code.trim() }); await signOut(); }
    catch (e) {
      const s = status(e);
      setErr(s === 403 ? "That code is wrong or has expired." : s === 409 ? "You own a studio — close it first." : "Couldn't delete your account. Try again.");
      setBusy(false);
    }
  };

  return (
    <Stagger>
      <AccountExits deleteBlocked={isOwner} onDelete={() => { setStage("intro"); setCode(""); setErr(null); setOpen(true); }} />
      
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Delete your account"
        footer={stage === "intro" ? (
          <Button size="lg" className="w-full" disabled={busy} onClick={() => void sendCode()}>{busy ? <><Spinner /> Sending…</> : "Email me a confirmation code"}</Button>
        ) : (
          <Button size="lg" className="w-full border-danger/40 text-danger" variant="outline" disabled={busy || code.length < 6} onClick={() => void confirmDelete()}>{busy ? <><Spinner /> Deleting…</> : <><Trash2 /> Permanently delete my account</>}</Button>
        )}
      >
        {stage === "intro" ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">We'll email a confirmation code to <span className="font-medium text-foreground">{ctx?.user.email}</span>. Entering it permanently erases your account and all your data. There's no undo.</p>
            <ActionResult msg={null} err={err} />
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Enter the 6-digit code we emailed you, then confirm. This erases everything.</p>
            <Field label="Confirmation code" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))} placeholder="000000" autoFocus />
            <ActionResult msg={null} err={err} />
            {/* Stays in the body: it is an escape from the step, not the step's
                action, and the footer holds exactly one thing to press. */}
            <button className="w-full text-center text-xs text-muted-foreground hover:underline" onClick={() => void sendCode()} disabled={busy}>Resend code</button>
          </div>
        )}
      </Sheet>
    </Stagger>
  );
}

interface ClientProfile { displayName: string; email: string | null; gender: string | null; dateOfBirth: string | null; heightCm: number | null; bloodType: string | null; phone: string | null; avatarUrl: string | null; avatarSeed: string | null }
const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

/** A client's own profile — photo, name, DOB, gender (BMR), blood type, phone.
 *  Email is read-only (changes go through the studio). */
function ClientProfileSection({ clientId, email, onSaved }: { clientId: string; email: string; onSaved: () => void }) {
  const [p, setP] = useState<ClientProfile | null>(null);
  const act = useAction();
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const units = useUnits();
  // The old `.catch(() => undefined)` swallowed the failure and left the profile
  // skeleton shimmering forever. `alive` also drops a response for a clientId the
  // user has already switched away from (coach view), which would show the wrong
  // person's profile in the form.
  useEffect(() => {
    let alive = true;
    setError(false);
    api.get<{ client: ClientProfile }>(`/api/clients/${clientId}`)
      .then((r) => { if (alive) setP(r.client); })
      .catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [clientId, reloadKey]);
  const set = (patch: Partial<ClientProfile>) => setP((c) => (c ? { ...c, ...patch } : c));
  const hFt = p?.heightCm != null ? cmToFeetInches(p.heightCm) : null;
  const uploadAvatar = (file: File) =>
    act.run("avatar", async () => {
      const key = await uploadMedia(file, "avatar");
      const url = `/api/media/${key}`;
      await api.post(`/api/clients/${clientId}/avatar`, { avatarUrl: url });
      set({ avatarUrl: url, avatarSeed: null });
      onSaved();
    }, "Couldn't upload that image — try again.");
  const save = () => {
    if (!p) return;
    return act.run("save", async () => {
      await api.patch(`/api/clients/${clientId}`, { displayName: p.displayName, gender: p.gender ?? undefined, dateOfBirth: p.dateOfBirth ?? undefined, heightCm: p.heightCm ?? undefined, bloodType: p.bloodType ?? undefined, phone: p.phone ?? undefined });
      onSaved();
      return "Profile saved.";
    }, "Couldn't save your profile — it's unchanged.");
  };
  return (
    <section>
      <h3 className="mb-2 px-1 text-micro uppercase text-muted-foreground">Profile</h3>
      {error && !p ? <LoadError label="your profile" error={typeof error === "string" ? error : null} onRetry={() => setReloadKey((k) => k + 1)} /> : (
      <Reveal loading={!p} skeleton={
        <Card className="space-y-4">
          <div className="flex items-center gap-3"><SkeletonCircle size={64} /><Skeleton className="h-9 w-32 rounded-full" /></div>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1.5"><SkeletonLine w="30%" h="xs" /><Skeleton className="h-10 w-full rounded-xl" /></div>
          ))}
          <div className="flex flex-wrap gap-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-14 rounded-full" />)}</div>
          <Skeleton className="h-11 w-full rounded-full" />
        </Card>
      }>
        {p && (
      <Card className="space-y-4">
        <div className="flex items-center gap-3">
          <Avatar name={p.displayName} src={p.avatarUrl} seed={p.avatarSeed} className="size-16" />
          <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-secondary px-3.5 text-sm font-medium transition-colors hover:bg-surface-3 [&_svg]:size-4"><Upload /> Change photo
            <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && void uploadAvatar(e.target.files[0])} />
          </label>
        </div>
        <Field label="Name" value={p.displayName} onChange={(e) => set({ displayName: e.target.value })} />
        <div>
          <Field label="Email" value={p.email ?? email} disabled />
          <p className="mt-1 px-1 text-xs text-muted-foreground">Contact your coach to change your email.</p>
        </div>
        <Field label="Date of birth" type="date" value={p.dateOfBirth ?? ""} onChange={(e) => set({ dateOfBirth: e.target.value || null })} />
        {units.height === "ft_in" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Height (ft)" inputMode="numeric" value={hFt ? String(hFt.ft) : ""} onChange={(e) => set({ heightCm: feetInchesToCm(Number(e.target.value.replace(/\D/g, "") || 0), hFt?.in ?? 0) || null })} />
            <Field label="(in)" inputMode="numeric" value={hFt ? String(hFt.in) : ""} onChange={(e) => set({ heightCm: feetInchesToCm(hFt?.ft ?? 0, Number(e.target.value.replace(/\D/g, "") || 0)) || null })} />
          </div>
        ) : (
          <Field label="Height (cm)" inputMode="numeric" value={p.heightCm != null ? String(Math.round(p.heightCm)) : ""} onChange={(e) => set({ heightCm: Number(e.target.value.replace(/[^\d.]/g, "")) || null })} />
        )}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-muted-foreground">Gender</label>
          <div className="flex gap-2">{([["male", "Male"], ["female", "Female"]] as const).map(([v, l]) => <Chip key={v} selected={p.gender === v} onClick={() => set({ gender: v })}>{l}</Chip>)}</div>
          <p className="mt-1 px-1 text-xs text-muted-foreground">Used to calculate your calorie and macro targets.</p>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-muted-foreground">Blood type</label>
          <div className="flex flex-wrap gap-2">{BLOOD_TYPES.map((b) => <Chip key={b} selected={p.bloodType === b} onClick={() => set({ bloodType: p.bloodType === b ? null : b })}>{b}</Chip>)}</div>
        </div>
        <Field label="Contact number" type="tel" inputMode="tel" value={p.phone ?? ""} onChange={(e) => set({ phone: e.target.value || null })} placeholder="+1 555 000 0000" />
        <SaveBar
          label="Save profile"
          saving={act.busy === "save"}
          disabled={p.displayName.trim().length < 1}
          msg={act.msg}
          err={act.err}
          onSave={() => void save()}
        />
      </Card>
        )}
      </Reveal>
      )}
    </section>
  );
}

/** A client's training & nutrition preferences — delegates to the shared editor
 *  (the coach edits the same fields from the client's Manage tab). */
function PreferencesSection({ clientId, onSaved }: { clientId: string; onSaved: () => void }) {
  return (
    <section>
      <h3 className="mb-2 px-1 text-micro uppercase text-muted-foreground">Training &amp; nutrition</h3>
      <PreferencesEditorCard clientId={clientId} onSaved={onSaved} />
    </section>
  );
}

const UNIT_ROWS: { key: string; label: string; options: { value: string; label: string }[] }[] = [
  { key: "weight", label: "Weight", options: [{ value: "kg", label: "kg" }, { value: "lb", label: "lb" }] },
  { key: "height", label: "Height", options: [{ value: "cm", label: "cm" }, { value: "ft_in", label: "ft / in" }] },
  { key: "length", label: "Body measurements", options: [{ value: "cm", label: "cm" }, { value: "in", label: "in" }] },
  { key: "volume", label: "Fluids", options: [{ value: "ml", label: "ml" }, { value: "oz", label: "oz" }] },
  { key: "distance", label: "Distance", options: [{ value: "km", label: "km" }, { value: "mi", label: "mi" }] },
  { key: "energy", label: "Energy", options: [{ value: "kcal", label: "kcal" }, { value: "kJ", label: "kJ" }] },
];

function UnitsSection() {
  const { ctx, refresh } = useSession();
  const units = resolveUnits(ctx?.user.units) as unknown as Record<string, string>;
  const act = useAction();
  const busy = act.busy !== null;
  // The displayed value comes from the session, not from local state, so a
  // refused write cannot show the wrong unit — it just used to say nothing at
  // all, leaving the control silently ignoring the tap.
  const set = (patch: Record<string, string>) =>
    act.run("units", async () => { await api.patch("/api/me/units", patch); await refresh(); }, "Couldn't change your units.");
  return (
    <section>
      <Card className="space-y-3">
        {UNIT_ROWS.map((r) => (
          <div key={r.key} className="flex items-center justify-between gap-3">
            <span className="text-sm">{r.label}</span>
            <SegmentedControl options={r.options} value={units[r.key]!} onChange={(v) => void set({ [r.key]: v })} className={busy ? "pointer-events-none opacity-70" : ""} />
          </div>
        ))}
        <ActionResult msg={null} err={act.err} />
      </Card>
    </section>
  );
}

/**
 * Storefront settings. Only two of these do anything, so only two are offered:
 * `selfRegister` drives `allowSignup` on the studio's sign-in page
 * (`host-context.ts`) and `requireActiveAccess` drives `clientAccess.required`
 * (`context-routes.ts`), which pins an uncovered client to the Shop.
 *
 * There used to be an "Enable storefront" toggle for `marketplace.enabled`. It
 * had no reader anywhere: the only endpoint that ever returned it is
 * `GET /api/marketplace/:slug`, which no app or site calls, and `/t/<slug>` is a
 * branded sign-in page — it renders no packages and no articles. An owner could
 * switch it on, mark packages for the storefront, publish public posts, and
 * nothing existed to show any of it. The toggle is gone; the card below says
 * where packages actually sell today.
 */
interface MarketplaceCfg { selfRegister?: boolean; requireActiveAccess?: boolean }
function MarketplaceSection() {
  const [marketplace, setMarketplace] = useState<MarketplaceCfg>({});
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(false);
    try {
      const r = await api.get<{ marketplace: MarketplaceCfg }>("/api/settings");
      setMarketplace(r.marketplace ?? {}); setLoaded(true);
    } catch { setError(true); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  // Optimistic, but a failed PATCH rolls the switch back and says so — otherwise
  // the toggle sits in a position the server never accepted.
  const setMarket = async (patch: MarketplaceCfg) => {
    if (busy) return;
    const prev = marketplace;
    setBusy(true); setSaveErr(null); setMarketplace((m) => ({ ...m, ...patch }));
    try { await api.patch("/api/settings", { marketplace: patch }); }
    catch (e) { setMarketplace(prev); setSaveErr(errorText(e, "Couldn't save that setting.")); }
    finally { setBusy(false); }
  };

  /*
    ── TWO SWITCHES, NOT FIVE HEADINGS ──────────────────────────────────────

    This page carried, in order: the page title "Storefront", a page
    description, a "MARKETPLACE" eyebrow, a "Studio" badge, and a card headed
    "Your Shop" with its own two-line description — five layers of chrome and
    three different names for one thing, above two toggles. Then a card with an
    icon, a "Coming later" badge and four lines of prose about a feature that
    does not exist, taking a third of the page.

    `SettingsPage` already gives the title and one line of context. What is left
    is what you came to change: two switches. The unbuilt public page is a
    footnote — a settings screen configures what exists, and a roadmap item is
    not a setting.
  */
  return (
    <section>
      {error && !loaded ? <LoadError label="your storefront settings" error={typeof error === "string" ? error : null} onRetry={() => void load()} /> : (
      <Reveal loading={!loaded} className="space-y-3" skeleton={
        <Card className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between"><SkeletonLine w="40%" h="text" /><Skeleton className="h-6 w-11 rounded-full" /></div>
          ))}
        </Card>
      }>
        {loaded && (
        <div className="space-y-3">
          <Stagger>
            <div className="overflow-hidden rounded-2xl bg-card">
              <ToggleRow
                icon={UserPlus} title="Let clients sign themselves up"
                desc="A new email can create its own client account from your sign-in page."
                checked={!!marketplace.selfRegister} onChange={(v) => void setMarket({ selfRegister: v })}
              />
              <div className="border-t border-border/50" />
              <ToggleRow
                icon={Lock} title="Require an active package"
                desc="Without one, a client sees only the Shop until they buy."
                checked={!!marketplace.requireActiveAccess} onChange={(v) => void setMarket({ requireActiveAccess: v })}
              />
            </div>
          </Stagger>
          {saveErr && <p role="status" aria-live="polite" className="text-sm text-danger">{saveErr}</p>}
          <p className="px-1 text-xs text-muted-foreground">
            Packages you mark <span className="font-medium text-foreground">In client Shop</span> appear in every client&rsquo;s Shop tab. A shareable public page isn&rsquo;t built yet — your studio&rsquo;s address is a branded sign-in page for now.
          </p>
        </div>
        )}
      </Reveal>
      )}
    </section>
  );
}

// ── Custom domain (SPEC §14.1) — Cloudflare for SaaS white-label ─────────────
interface DomainInfo {
  hostname: string;
  status: string; // pending | active | error
  sslStatus: string | null;
  cname: { name: string; target: string | null };
  txt: { name: string; value: string } | null;
  /** EVERY DCV record Cloudflare asked for. It can require two `_acme-challenge`
   *  TXTs at one name and issues the certificate only once BOTH exist. Showing
   *  one left owners waiting on a cert that could never come. */
  txts?: { name: string; value: string }[];
  /** Cloudflare's own validation errors — it names the exact obstacle. */
  errors?: string[];
  /** When that obstacle is a CAA allow-list, the record that clears it. */
  caa?: { name: string; authority: string; value: string } | null;
}

/**
 * What DNS actually says, read live by the server on `Check now`.
 *
 * The shape is `@4dl/tenancy`'s `DnsFinding`, re-declared rather than imported:
 * the tenancy package is a Worker module and the browser bundle takes only
 * `@4dl/tenancy/model`. Three fields, and the whole value is in `hostShouldBe`
 * — the one keystroke that fixes the commonest failure there is.
 */
interface DnsFinding {
  code: "ok" | "double-suffix" | "wrong-target" | "not-a-cname" | "missing" | "unknown";
  message: string;
  hostShouldBe?: string;
}

/** A single copyable DNS field (label + monospace value + copy affordance). */
function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => void navigator.clipboard?.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); });
  return (
    <div className="min-w-0">
      <div className="text-micro uppercaser text-muted-foreground">{label}</div>
      <button onClick={copy} className="flex w-full items-center gap-1.5 text-left" title="Copy">
        <code className="min-w-0 flex-1 truncate font-mono text-xs">{value}</code>
        {copied ? <Check className="size-3 shrink-0 text-success" /> : <Copy className="size-3 shrink-0 text-muted-foreground" />}
      </button>
    </div>
  );
}

/**
 * A DNS record laid out the way providers ask for it: Type · Name · Value.
 *
 * The note under the Host field is not padding. Namecheap, GoDaddy, Hostinger
 * and Squarespace all treat **Host** as relative to the zone, so pasting the
 * full name publishes the record one level too deep —
 * `coaching.byshujaa.com.byshujaa.com` — and every checker on earth then
 * reports the hostname as simply absent. It has happened on a real domain here,
 * to all four records at once, and cost hours: the values were right, the
 * screen was right, and nothing said where they had gone.
 *
 * The wording stays generic ("the part before your domain") rather than naming
 * the label, because working out where the domain ends needs a public-suffix
 * list and a guess of "last two labels" gives actively wrong advice on
 * `something.co.uk`. After **Check now** the server reports the exact label,
 * derived from what actually resolved rather than guessed — see dns-check.ts.
 */
function DnsRecord({ type, name, value, hint }: { type: string; name: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl bg-surface-3 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded-md bg-primary/15 px-1.5 py-0.5 font-mono text-xs font-bold text-primary">{type}</span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <CopyField label="Name / Host" value={name} />
        <CopyField label={type === "CNAME" ? "Target" : "Value"} value={value} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Most providers add your domain to the Host field for you. If yours does, enter only the part{" "}
        <span className="font-medium text-foreground">before</span> your domain name — not the whole thing.
      </p>
    </div>
  );
}

function DomainSection() {
  const [domains, setDomains] = useState<DomainInfo[] | null>(null);
  const [configured, setConfigured] = useState(true);
  const [hostname, setHostname] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [domainToRemove, setDomainToRemove] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  /**
   * What DNS actually says, per hostname, as of the last `Check now`.
   *
   * Kept in state rather than on the domain row because it is a live read, not
   * stored state: it is true as of a moment, and showing a stale one after a
   * reload would be worse than showing none.
   */
  const [dns, setDns] = useState<Record<string, DnsFinding>>({});

  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      const r = await api.get<{ domains: DomainInfo[]; configured: boolean }>("/api/domains");
      setDomains(r.domains); setConfigured(r.configured);
    } catch { setLoadFailed(true); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const add = async () => {
    setBusy(true); setErr(null);
    try { await api.post("/api/domains", { hostname: hostname.trim().toLowerCase() }); setHostname(""); await load(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't add that domain."); }
    finally { setBusy(false); }
  };
  const refresh = async (h: string) => {
    const r = await api.post<{ dns?: DnsFinding | null }>(`/api/domains/${encodeURIComponent(h)}/refresh`);
    setDns((d) => (r?.dns ? { ...d, [h]: r.dns } : Object.fromEntries(Object.entries(d).filter(([k]) => k !== h))));
    await load();
  };
  const remove = async (h: string) => { await api.del(`/api/domains/${encodeURIComponent(h)}`); await load(); };

  // Platform hasn't turned on Cloudflare for SaaS — hide the section entirely.
  if (domains && !configured && domains.length === 0) return null;

  const tone = (s: string) => (s === "active" ? "success" : s === "error" ? "danger" : "warning");
  const label = (s: string) => (s === "active" ? "Live" : s === "error" ? "Needs attention" : "Pending DNS");

  return (
    <section>
      {loadFailed && !domains ? <LoadError label="your custom domains" error={typeof loadFailed === "string" ? loadFailed : null} onRetry={() => void load()} /> : (
      <Reveal loading={!domains} skeleton={
        <Card className="space-y-4">
          <div className="flex items-center gap-2.5"><Skeleton className="size-9 rounded-xl" /><div className="flex-1 space-y-1.5"><SkeletonLine w="45%" h="text" /><SkeletonLine w="70%" h="xs" /></div></div>
          <div className="flex gap-2"><Skeleton className="h-9 flex-1 rounded-lg" /><Skeleton className="h-9 w-16 rounded-full" /></div>
        </Card>
      }>
        {domains && (
      <Card className="space-y-4">
        <div className="flex items-center gap-2.5"><div className="grid size-9 place-items-center rounded-xl bg-primary/15 text-primary [&_svg]:size-4"><Globe /></div><div><div className="font-medium">Your own domain</div><div className="text-sm text-muted-foreground">Run the app on your domain — e.g. train.yourgym.com.</div></div></div>

        {domains.map((d) => {
          const isApex = d.hostname.split(".").length <= 2;
          return (
          <div key={d.hostname} className="space-y-3 rounded-xl bg-surface-2 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0"><div className="truncate font-medium">{d.hostname}</div><div className="text-xs text-muted-foreground">{d.status === "active" ? "Secured and serving." : d.status === "error" ? "We couldn't verify the records — double-check them below." : "Waiting for your DNS records."}</div></div>
              <Badge tone={tone(d.status)}>{label(d.status)}</Badge>
            </div>
            {d.status !== "active" && (
              <div className="space-y-3">
                {/* What is ACTUALLY blocking it, in Cloudflare's words.
                    These were fetched and discarded, so a domain refused over a
                    CAA allow-list showed a correct-looking list of records and no
                    hint that anything was wrong — the only way to the truth was a
                    Cloudflare dashboard the owner has no access to. The CAA case
                    also gets a ready-to-add record above; anything else at least
                    gets named. "does not CNAME to this zone" is filtered while the
                    CNAME is still propagating, because it is the normal state for
                    the first few minutes and reads as a failure. */}
                {/* What DNS actually says. FIRST, and above Cloudflare's own
                    message, because the two describe the same failure at
                    different distances: Cloudflare reports "does not CNAME to
                    this zone" — the symptom — while this names the cause and
                    the keystroke that fixes it. `ok` is not rendered: a
                    correct CNAME with a pending certificate is the ordinary
                    state for the first minute or two and reads as an alarm. */}
                {dns[d.hostname] && dns[d.hostname]!.code !== "ok" && (
                  <div className="flex gap-2.5 rounded-xl bg-warning/10 p-3" role="status">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                    <div className="min-w-0 space-y-1">
                      <div className="text-sm font-medium text-warning">
                        {dns[d.hostname]!.code === "double-suffix" ? "The record is in the wrong place" : "We couldn't find the record"}
                      </div>
                      <p className="text-xs text-muted-foreground">{dns[d.hostname]!.message}</p>
                      {dns[d.hostname]!.hostShouldBe && (
                        <div className="pt-1"><CopyField label="Host should be" value={dns[d.hostname]!.hostShouldBe!} /></div>
                      )}
                    </div>
                  </div>
                )}

                {(() => {
                  const shown = (d.errors ?? []).filter((e) => !/does not CNAME to this zone/i.test(e));
                  if (!shown.length) return null;
                  return (
                    <div className="flex gap-2.5 rounded-xl bg-warning/10 p-3" role="status">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                      <div className="min-w-0 space-y-1">
                        <div className="text-sm font-medium text-warning">Cloudflare is refusing the certificate</div>
                        {shown.map((e) => <p key={e} className="text-xs text-muted-foreground">{e}</p>)}
                      </div>
                    </div>
                  );
                })()}

                {/* Step 1 — add the records. */}
                <div className="flex gap-2.5">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-bold text-primary">1</span>
                  <div className="min-w-0 space-y-2">
                    <p className="text-sm">In your domain&rsquo;s DNS settings (GoDaddy, Namecheap, Cloudflare…), add {(d.txts?.length ?? (d.txt ? 1 : 0)) > 0 ? "these records" : "this record"}:</p>
                    {d.cname.target && <DnsRecord type="CNAME" name={d.cname.name} value={d.cname.target} hint="Routes your domain to the app" />}
                    {d.caa && (
                      <DnsRecord
                        type="CAA"
                        name={d.caa.name}
                        value={d.caa.value}
                        hint={`Your domain has CAA records that only let certain certificate authorities issue for it, and ${d.caa.authority} isn't on the list — so the certificate is being refused. Add this at your domain's ROOT (${d.caa.name}); it can't go on ${d.hostname}, because DNS won't allow a CAA record alongside a CNAME. This adds ${d.caa.authority} to the list rather than replacing anything.`}
                      />
                    )}
                    {(d.txts?.length ? d.txts : d.txt ? [d.txt] : []).map((t, i, arr) => (
                      <DnsRecord
                        key={`${t.name}:${t.value}`}
                        type="TXT"
                        name={t.name}
                        value={t.value}
                        hint={arr.length > 1
                          ? `Proves you own it — record ${i + 1} of ${arr.length}. Add ALL of them as separate TXT rows at the same name; the certificate won't issue until every one is in place.`
                          : "Proves you own it (for the SSL certificate)"}
                      />
                    ))}
                    {isApex && <p className="text-xs text-warning">Tip: use a subdomain like <span className="font-mono">app.{d.hostname}</span> — most providers can't point a root domain with a CNAME.</p>}
                  </div>
                </div>
                {/* Step 2 — verify. */}
                <div className="flex gap-2.5">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-bold text-primary">2</span>
                  <p className="text-sm">Save at your provider, then tap <span className="font-medium">Check now</span>. DNS can take a few minutes (up to an hour); the SSL certificate then issues automatically.</p>
                </div>
              </div>
            )}
            <div className="flex gap-2">
              {d.status === "active"
                ? <Button size="sm" variant="secondary" onClick={() => window.open(`https://${d.hostname}`, "_blank")}><Globe /> Visit</Button>
                : <Button size="sm" variant="secondary" onClick={() => void refresh(d.hostname)}>Check now</Button>}
              <Button size="icon" variant="ghost" aria-label="Remove domain" onClick={() => setDomainToRemove(d.hostname)}><Trash2 /></Button>
            </div>
          </div>
          );
        })}

        <div className="flex gap-2">
          <input
            value={hostname}
            onChange={(e) => setHostname(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && hostname.includes(".") && void add()}
            placeholder="train.yourgym.com"
            className="w-full rounded-lg bg-surface-2 px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
          />
          <Button size="sm" disabled={busy || !hostname.includes(".")} onClick={() => void add()}><Plus /> Add</Button>
        </div>
        <ActionResult msg={null} err={err} />
        <p className="text-xs text-muted-foreground">Use a subdomain you own, like <span className="font-mono">app.yourgym.com</span> — we'll show the exact DNS records to add. You'll sign in with a passkey again on the new domain (each keeps its own secure sign-in).</p>
      </Card>
        )}
      </Reveal>
      )}

      <ConfirmDialog
        open={!!domainToRemove}
        onOpenChange={(o) => !o && setDomainToRemove(null)}
        title={domainToRemove ? `Remove ${domainToRemove}?` : "Remove domain?"}
        description="The app will stop serving on this domain and its SSL certificate is released. You can add it again later."
        confirmLabel="Remove"
        destructive
        onConfirm={() => { if (domainToRemove) void remove(domainToRemove); }}
      />
    </section>
  );
}

const NEUTRALS: { id: NeutralTint; label: string }[] = [
  { id: "brand", label: "Brand" }, { id: "gray", label: "Neutral" }, { id: "cool", label: "Cool" }, { id: "warm", label: "Warm" },
];
const hasTokens = (t: BrandTokens) => !!(Object.keys(t.light ?? {}).length || Object.keys(t.dark ?? {}).length);

/**
 * Branding editor — the tenant's tokens ARE the brand (single source of truth).
 * Pick one color (preset, wheel, or extracted from the logo) and a full,
 * coherent light+dark palette is generated; paste a theme or fine-tune any
 * token afterwards. Everything writes into the same token maps.
 */
interface ProviderMeta { id: string; label: string; category: "food" | "exercise"; keyless: boolean; keys: { field: string; label: string }[]; blurb: string }
type MaskedProvider = { enabled: boolean; ready: boolean } & Record<string, boolean>;

function IntegrationsSection() {
  const [providers, setProviders] = useState<ProviderMeta[] | null>(null);
  const [state, setState] = useState<Record<string, MaskedProvider>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const r = await api.get<{ integrationProviders: ProviderMeta[]; integrations: Record<string, MaskedProvider> }>("/api/settings");
      setProviders(r.integrationProviders); setState(r.integrations);
    } catch { setError(true); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const patch = async (id: string, patchObj: Record<string, string | boolean>) => { await api.patch("/api/settings", { integrations: { [id]: patchObj } }); await load(); };
  const saveKeys = async (p: ProviderMeta) => {
    const obj: Record<string, string> = {};
    for (const k of p.keys) obj[k.field] = drafts[`${p.id}.${k.field}`] ?? "";
    await patch(p.id, { ...obj, enabled: true });
    setDrafts((d) => { const n = { ...d }; for (const k of p.keys) delete n[`${p.id}.${k.field}`]; return n; });
    setOpen(null); setMsg(`${p.label} connected.`);
  };

  const groups: { key: "food" | "exercise"; label: string }[] = [{ key: "food", label: "Nutrition" }, { key: "exercise", label: "Exercises" }];

  return (
    <section>
      {error && !providers ? <LoadError label="your data providers" error={typeof error === "string" ? error : null} onRetry={() => void load()} /> : (
      <Reveal loading={!providers} skeleton={
        <Card className="space-y-4">
          <div className="flex items-center gap-2.5"><Skeleton className="size-9 rounded-xl" /><div className="flex-1 space-y-1.5"><SkeletonLine w="40%" h="text" /><SkeletonLine w="70%" h="xs" /></div></div>
          {Array.from({ length: 2 }).map((_, g) => (
            <div key={g} className="space-y-2">
              <SkeletonLine w="25%" h="xs" />
              {Array.from({ length: 2 }).map((_, r) => (
                <div key={r} className="rounded-xl bg-surface-2 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1.5"><SkeletonLine w="45%" h="text" /><SkeletonLine w="75%" h="xs" /></div>
                    <Skeleton className="h-6 w-11 shrink-0 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </Card>
      }>
        {providers && (
      <Card className="space-y-4">
        <div className="flex items-center gap-2.5"><div className="grid size-9 place-items-center rounded-xl bg-primary/15 text-primary [&_svg]:size-4"><Plug /></div><div><div className="font-medium">Data providers</div><div className="text-sm text-muted-foreground">Turn on sources so builders pull ready-made foods & exercises.</div></div></div>
        {groups.map((g) => (
          <div key={g.key} className="space-y-2">
            <div className="text-micro uppercaser text-muted-foreground">{g.label}</div>
            {providers.filter((p) => p.category === g.key).map((p) => {
              const s = state[p.id];
              const needsKeys = !p.keyless && s?.enabled && !s?.ready;
              return (
                <div key={p.id} className="rounded-xl bg-surface-2 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-medium">{p.label}{!p.keyless && (s?.ready ? <Badge tone="success">connected</Badge> : <Badge tone="neutral">key needed</Badge>)}</div>
                      <div className="truncate text-xs text-muted-foreground">{p.blurb}</div>
                    </div>
                    <Switch checked={!!s?.enabled} onCheckedChange={(v) => { if (v && !p.keyless && !s?.ready) { setOpen(p.id); void patch(p.id, { enabled: true }); } else void patch(p.id, { enabled: v }); }} />
                  </div>
                  {!p.keyless && (open === p.id || needsKeys) && (
                    <div className="mt-3 space-y-2 border-t border-border/50 pt-3">
                      {p.keys.map((k) => (
                        <input
                          key={k.field}
                          type="password"
                          placeholder={s?.[`${k.field}Set`] ? `${k.label} — saved (leave blank to keep)` : k.label}
                          value={drafts[`${p.id}.${k.field}`] ?? ""}
                          onChange={(e) => setDrafts((d) => ({ ...d, [`${p.id}.${k.field}`]: e.target.value }))}
                          className="w-full rounded-lg bg-surface-3 px-3 py-2 font-mono text-xs outline-none ring-ring focus:ring-2"
                        />
                      ))}
                      <Button size="sm" onClick={() => void saveKeys(p)}>Save keys</Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        <ActionResult msg={msg} err={null} />
      </Card>
        )}
      </Reveal>
      )}
    </section>
  );
}

/**
 * The saved brand colour.
 *
 * `primary` and `preset` are deliberately nulled on save — the generated token
 * set is authoritative, so a second copy of the seed could only ever disagree
 * with it. That means the seed has to be READ BACK OUT of the tokens, or the
 * picker reverts to Kova green on every reload even though the app around it is
 * correctly themed. Dark is the canonical set; light is derived from it.
 */
const seedFrom = (b: Branding | null): string =>
  b?.primary
  || BRAND_PRESETS.find((p) => p.id === b?.preset)?.primary
  || b?.tokens?.dark?.["--primary"]
  || b?.tokens?.light?.["--primary"]
  || "oklch(0.74 0.15 164)";

/**
 * `key`s the editor to the arrival of saved branding.
 *
 * Every field below is seeded with `useState(initial?.…)`, which runs once, on
 * mount. Branding reaches the client with `/api/context` — normally AFTER this
 * component mounts — so a returning owner was shown the DEFAULTS while the app
 * around them was correctly themed from the values they had saved. Keying on
 * "has branding loaded" remounts the editor exactly once, when the real values
 * arrive; it deliberately does NOT key on the values themselves, which would
 * discard in-progress edits every time a save refreshed the context.
 */
function BrandingEditor(props: { initial: Branding | null; onPreview: (b: Branding | null) => void; onSaved: () => void }) {
  return <BrandingEditorForm key={props.initial ? "loaded" : "empty"} {...props} />;
}

function BrandingEditorForm({ initial, onPreview, onSaved }: { initial: Branding | null; onPreview: (b: Branding | null) => void; onSaved: () => void }) {
  const [params, setParams] = useSearchParams();
  const closeSection = useCloseSection();
  const { ctx } = useSession();
  const studioName = ctx?.active?.tenantName?.trim() || "Your studio";
  const marks = useAction();
  const [tokens, setTokens] = useState<BrandTokens>(() => (initial?.tokens && hasTokens(initial.tokens) ? initial.tokens : deriveTokens({ primary: seedFrom(initial), accents: MACRO_SPEC })));
  const [seed, setSeed] = useState<string>(seedFrom(initial));
  // Seeded from what was saved, not hardcoded. Two things broke when it was not:
  // the chip always read "Brand" on a reload however the app actually looked, and
  // — worse — `generate(color)` passes this value through, so nudging the brand
  // colour silently regenerated the palette with the stale default and threw the
  // studio's tint away with no indication.
  const [neutral, setNeutral] = useState<NeutralTint>(initial?.neutral ?? "brand");
  const [radius, setRadius] = useState(initial?.radius ?? 0.95);
  const [shadow, setShadow] = useState<ShadowPreset>(initial?.shadow ?? "soft");
  // Hairline colour. Empty = the shipped per-mode default, which is the right
  // answer for most studios (dark needs a light translucent edge, light a dark
  // one); a single custom colour applies to BOTH modes, so it is opt-in.
  const [borderColor, setBorderColor] = useState<string>(initial?.borderColor ?? "");
  const [borderWidth, setBorderWidth] = useState<number>(initial?.borderWidth ?? 1);
  // Both default ON, matching what the old per-device toggles defaulted to, so a
  // studio that never touches them looks exactly as it did before the move.
  const [tintedNav, setTintedNav] = useState<boolean>(initial?.tintedNav ?? true);
  const [ambient, setAmbient] = useState<boolean>(initial?.ambient ?? true);
  const [logoUrl, setLogoUrl] = useState<string | null>(initial?.logoUrl ?? null);
  const [iconUrl, setIconUrl] = useState<string | null>(initial?.iconUrl ?? null);
  // The light-surface overrides. Null is the normal state and means "the mark
  // above works on both", which is true of any full-colour logo.
  const [logoUrlLight, setLogoUrlLight] = useState<string | null>(initial?.logoUrlLight ?? null);
  const [iconUrlLight, setIconUrlLight] = useState<string | null>(initial?.iconUrlLight ?? null);
  /**
   * The letters for a generated icon — a RECOMMENDATION the owner can rewrite.
   *
   * Seeded from the studio name and never normalised: "byShujaa" is capitalised
   * that way on purpose, so "bS" is their brand where "BS" is subtly not.
   */
  const [monogram, setMonogram] = useState(() => initial?.mark?.monogram?.trim() || monogramFor(studioName));
  /**
   * Which characters of the name are not like the others — the accent run and
   * the quiet run, as counts from each end (see `@4dl/ui` mark.ts for why counts
   * rather than a list of characters).
   */
  const [markStyle, setMarkStyle] = useState<WordmarkStyle>(() => ({
    accentHead: initial?.mark?.accentHead ?? 0,
    accentTail: initial?.mark?.accentTail ?? 0,
    softHead: initial?.mark?.softHead ?? 0,
    softTail: initial?.mark?.softTail ?? 0,
  }));
  /** The icon's own two decisions: what sits behind the letters, and which of
   *  them are not like the others. Kept separate from the wordmark's — a
   *  two-letter mark and a nine-character name want different answers. */
  const [plate, setPlate] = useState<MarkPlate>(initial?.mark?.plate ?? "accent");
  const [iconStyle, setIconStyle] = useState<WordmarkStyle>(() => ({
    accentHead: initial?.mark?.icon?.accentHead ?? 0,
    accentTail: initial?.mark?.icon?.accentTail ?? 0,
    softHead: initial?.mark?.icon?.softHead ?? 0,
    softTail: initial?.mark?.icon?.softTail ?? 0,
  }));
  const [drawing, setDrawing] = useState<"icon" | "wordmark">("icon");
  const [aiAvatarUrl, setAiAvatarUrl] = useState<string | null>(initial?.aiAvatarUrl ?? null);
  const [aiName, setAiName] = useState<string>(initial?.aiName ?? "");
  const [advanced, setAdvanced] = useState(false);
  const [themeCss, setThemeCss] = useState("");
  const act = useAction();
  // `msg` stays, for this editor's NOTES — "Palette generated from your logo",
  // "Theme applied — save to keep it". Those are not the outcome of a write, and
  // folding them into the action's result would let a stale note sit where a save
  // confirmation goes.
  const [msg, setMsg] = useState<string | null>(null);

  // Live-preview whenever the tokens or radius change (logo isn't a token).
  useEffect(() => { onPreview({ tokens, radius, shadow, borderColor: borderColor || null, borderWidth, logoUrl, iconUrl }); }, [JSON.stringify(tokens), radius, shadow, borderColor, borderWidth]); // eslint-disable-line react-hooks/exhaustive-deps

  // Generate a full palette from one color (the smart path).
  const generate = (color: string, tint: NeutralTint = neutral) => { setSeed(color); setNeutral(tint); setTokens(deriveTokens({ primary: color, neutral: tint, accents: MACRO_SPEC })); };

  /**
   * Generate a mark from the studio's name and the accent it already picked.
   *
   * It goes through `uploadAsset`, so a generated mark is an ordinary uploaded
   * image from that point on — same media store, same quota, same public URL,
   * and no consumer anywhere needs to know it was drawn rather than designed.
   *
   * ── FOUR FILES, ALWAYS ──────────────────────────────────────────────────
   *
   * Both marks are drawn twice, once per side of the theme, and it is not
   * belt-and-braces. Every ingredient is a per-mode token: the brand primary is
   * a different lightness in light mode (0.52 vs 0.74 — a button fill has to
   * clear AA on a white surface), and the foreground inverts outright. A
   * wordmark drawn once is therefore correct on exactly one background and
   * either washed out or invisible on the other; so is a bare-letterform icon.
   *
   * Only a SOLID accent plate is genuinely mode-independent, because it brings
   * its own background — and it is one of three choices, so the generator
   * cannot rely on it. Drawing both costs two more uploads and removes the
   * whole class of "my logo disappears in light mode".
   */
  const generateMarks = () =>
    void marks.run("marks", async () => {
      const letters = monogram.trim() || monogramFor(studioName);
      const dark = markPaint(tokens, "dark", seedHex);
      const light = markPaint(tokens, "light", seedHex);

      // The icon. On a solid plate the accent has already been spent on the
      // plate itself, so accented runs stay in the knockout colour — which is
      // why the editor hides those steppers rather than offering a no-op.
      const iconOf = (p: ReturnType<typeof markPaint>) => ({
        text: letters,
        bg: p.primary,
        fg: plate === "accent" ? p.onPrimary : p.fg,
        accent: plate === "accent" ? p.onPrimary : p.primary,
        plate,
        style: iconStyle,
      });
      const iconDark = await renderMarkPng(iconOf(dark));
      if (iconDark) await uploadAsset(iconDark, setIconUrl);
      const iconLight = await renderMarkPng(iconOf(light));
      if (iconLight) await uploadAsset(iconLight, setIconUrlLight);

      // The wordmark — always bare letterforms, so always two.
      const wideOf = (p: ReturnType<typeof markPaint>) => ({
        text: studioName,
        bg: p.primary,
        fg: p.fg,
        accent: p.primary,
        wide: true as const,
        style: markStyle,
      });
      const wideDark = await renderMarkPng(wideOf(dark));
      if (wideDark) await uploadAsset(wideDark, setLogoUrl);
      const wideLight = await renderMarkPng(wideOf(light));
      if (wideLight) await uploadAsset(wideLight, setLogoUrlLight);
      return "Drawn for light and dark. Save to keep them.";
    }, "Couldn't draw the marks.");

  const uploadAsset = async (file: File, setter: (url: string) => void) => {
    setMsg(null);
    // Tenant asset (no clientId) — route through uploadMedia for 401 handling +
    // error surfacing instead of a bare fetch that silently no-ops.
    try {
      const key = await uploadMedia(file, "brand", file.name);
      setter(`/api/media/${key}`);
    } catch { setMsg("Couldn't upload that image — try again."); }
  };

  const extractFromLogo = () => {
    if (!logoUrl) return;
    setMsg("Reading your logo…");
    const img = new Image();
    img.onload = () => { const p = extractPalette(img); if (p) { generate(p.primary); setMsg("Palette generated from your logo."); } else setMsg("Couldn't find a strong color in that logo."); };
    img.onerror = () => setMsg("Couldn't load the logo image.");
    img.src = logoUrl;
  };

  const applyThemeCss = () => {
    const { tokens: t, radius: r } = parseThemeCss(themeCss);
    if (!hasTokens(t)) { setMsg("No theme tokens found in that CSS."); return; }
    setTokens((prev) => ({ light: { ...prev.light, ...t.light }, dark: { ...prev.dark, ...t.dark } }));
    if (r != null) setRadius(r);
    setThemeCss(""); setMsg("Theme applied — save to keep it.");
  };

  const setToken = (m: "light" | "dark", key: string, value: string) => setTokens((t) => {
    const side = { ...(t[m] ?? {}) };
    if (value.trim()) side[key] = value.trim(); else delete side[key];
    return { ...t, [m]: side };
  });

  const save = () =>
    act.run("save", async () => {
      // Tokens carry everything now — null out legacy preset/primary fields.
      await api.patch("/api/settings", { branding: { tokens, radius, shadow, borderColor: borderColor.trim() || null, borderWidth, neutral, tintedNav, ambient, logoUrl, iconUrl, logoUrlLight, iconUrlLight, aiAvatarUrl, aiName: aiName.trim() || null, mark: { monogram: monogram.trim() || null, plate, icon: iconStyle, ...markStyle }, preset: null, primary: null, primaryForeground: null } });
      onSaved();
      setMsg(null);
      return "Branding saved.";
    }, "Couldn't save your branding — the studio still looks the way it did.");

  const seedHex = oklchStringToHex(seed.startsWith("#") ? hexToOklchString(seed) : seed);

  const marksBlock = (<>
        {/* No design file? Draw one. Most studios here are one person with a
            business name, and the fallback initial-in-a-square works in the nav
            and nowhere that matters — the browser tab, the installed icon, the
            top of every email a client opens all want an image. */}
        {/*
          ── ONE STUDIO, TWO MARKS, EDITED ONE AT A TIME ────────────────────

          This was a single stack: letters, then four steppers, then a button
          that made both marks — so the steppers appeared to belong to the
          letters above them, and nothing said which mark you were shaping.

          A segmented control instead, because the two are genuinely different
          objects with different questions. The icon asks what sits behind two
          letters; the wordmark asks which characters of a name stand out.
          Neither preview belongs on the other's screen.

          The one thing that stays shared is the SUBMIT: both marks are drawn by
          one press, in both modes, because a studio whose icon and wordmark
          were generated from different settings is not a brand.
        */}
        <div className="space-y-3 rounded-xl border border-dashed border-border/70 p-3">
          <div className="text-sm font-medium">No logo yet? <span className="font-normal text-muted-foreground">Draw one from your name</span></div>

          <SegmentedControl
            value={drawing}
            onChange={(v) => setDrawing(v as "icon" | "wordmark")}
            options={[{ value: "icon", label: "App icon" }, { value: "wordmark", label: "Wordmark" }]}
          />

          {drawing === "icon" ? (
            <div className="space-y-2.5">
              <MarkStage
                runs={markRuns(monogram.trim() || monogramFor(studioName), iconStyle)}
                tokens={tokens}
                seedHex={seedHex}
                plate={plate}
              />
              <Field
                label="Letters"
                value={monogram}
                maxLength={3}
                onChange={(e) => setMonogram(e.target.value)}
                placeholder={monogramFor(studioName)}
                hint={`Suggested from “${studioName}”`}
              />
              <PreviewPicker
                label="Behind the letters"
                value={plate}
                onChange={(v) => setPlate(v as MarkPlate)}
                options={PLATES.map((p) => ({
                  value: p.value,
                  label: p.label,
                  preview: (
                    <span
                      aria-hidden
                      className="block size-6 rounded-lg border border-border/60"
                      style={{ background: p.value === "none" ? "transparent" : seedHex, opacity: p.value === "tint" ? MARK_TINT_ALPHA + 0.1 : 1 }}
                    />
                  ),
                }))}
              />
              <CharCounts
                name={monogram.trim() || monogramFor(studioName)}
                style={iconStyle}
                onChange={setIconStyle}
                /* A solid plate has already spent the brand colour, so an
                   accented letter would be identical to an unaccented one.
                   Hiding the control is honest; offering a no-op is not. */
                accentable={plate !== "accent"}
              />
            </div>
          ) : (
            <div className="space-y-2.5">
              <MarkStage runs={markRuns(studioName, markStyle)} tokens={tokens} seedHex={seedHex} wide />
              <CharCounts name={studioName} style={markStyle} onChange={setMarkStyle} accentable />
            </div>
          )}

          <Button size="sm" variant="secondary" disabled={marks.busy !== null} onClick={() => void generateMarks()}>
            {marks.busy ? <><Spinner className="size-4" /> Drawing…</> : <><Wand2 /> Draw both, light and dark</>}
          </Button>
          <ActionResult msg={marks.msg} err={marks.err} />
        </div>

        {/* Logo (wide wordmark, shown in the app bar) */}
        <div className="space-y-2">
          <div className="text-sm font-medium">Logo <span className="font-normal text-muted-foreground">— app bar</span></div>
          <div className="flex items-center gap-3">
            <div className="grid h-16 w-24 shrink-0 place-items-center overflow-hidden rounded-xl border border-border/60 bg-surface-2">
              {logoUrl ? <img src={logoUrl} alt="Logo" className="max-h-14 max-w-22 object-contain" /> : <ImageIcon className="size-5 text-muted-foreground" />}
            </div>
            <div className="flex flex-1 flex-wrap gap-2">
              <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-secondary px-3.5 text-sm font-medium transition-colors hover:bg-surface-3 [&_svg]:size-4"><Upload /> Upload
                <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && void uploadAsset(e.target.files[0], setLogoUrl)} />
              </label>
              <Button size="sm" variant="secondary" disabled={!logoUrl} onClick={extractFromLogo}><Wand2 /> Theme from logo</Button>
              {logoUrl && <Button size="icon" variant="secondary" aria-label="Remove logo" onClick={() => setLogoUrl(null)}><Trash2 /></Button>}
            </div>
          </div>
          <LightVariant
            label="Light-mode logo"
            url={logoUrlLight}
            fallback={logoUrl}
            wide
            onUpload={(f) => void uploadAsset(f, setLogoUrlLight)}
            onClear={() => setLogoUrlLight(null)}
          />
        </div>

        {/* App icon (square mark, shown in the nav rail + browser tab) */}
        <div className="space-y-2">
          <div className="text-sm font-medium">App icon <span className="font-normal text-muted-foreground">— square, nav + tab</span></div>
          <div className="flex items-center gap-3">
            <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-border/60 bg-surface-2">
              {iconUrl ? <img src={iconUrl} alt="App icon" className="size-full object-cover" /> : <ImageIcon className="size-5 text-muted-foreground" />}
            </div>
            <div className="flex flex-1 flex-wrap gap-2">
              <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-secondary px-3.5 text-sm font-medium transition-colors hover:bg-surface-3 [&_svg]:size-4"><Upload /> Upload
                <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && void uploadAsset(e.target.files[0], setIconUrl)} />
              </label>
              {iconUrl && <Button size="sm" variant="secondary" disabled={!iconUrl} onClick={() => { const img = new Image(); img.onload = () => { const p = extractPalette(img); if (p) { generate(p.primary); setMsg("Palette generated from your icon."); } }; img.src = iconUrl; }}><Wand2 /> Theme from icon</Button>}
              {iconUrl && <Button size="icon" variant="secondary" aria-label="Remove icon" onClick={() => setIconUrl(null)}><Trash2 /></Button>}
            </div>
          </div>
          <LightVariant
            label="Light-mode icon"
            url={iconUrlLight}
            fallback={iconUrl}
            onUpload={(f) => void uploadAsset(f, setIconUrlLight)}
            onClear={() => setIconUrlLight(null)}
          />
        </div>

        {/* AI identity — the avatar + name shown on every AI surface (bottts /
            "Coach" fallbacks). This is the face clients see instead of a sparkle. */}
        <div className="space-y-2">
          <div className="text-sm font-medium">AI coach <span className="font-normal text-muted-foreground">— its face + name across every AI surface</span></div>
          <div className="flex items-center gap-3">
            <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-full border border-border/60 bg-surface-2">
              <img src={aiAvatarUrl ?? dicebearUrl(`${ctx?.active?.tenantSlug ?? "kova"}-ai-coach`, "bottts")} alt="AI coach" className="size-full object-cover" />
            </div>
            <div className="flex flex-1 flex-col gap-2">
              <input value={aiName} onChange={(e) => setAiName(e.target.value)} maxLength={40} placeholder="AI name (e.g. Nova, Coach K) — defaults to “Coach”" className="h-9 w-full rounded-full border border-border/60 bg-surface-2 px-3.5 text-sm outline-none focus:border-primary" />
              <div className="flex flex-wrap gap-2">
                <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-secondary px-3.5 text-sm font-medium transition-colors hover:bg-surface-3 [&_svg]:size-4"><Upload /> Upload avatar
                  <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && void uploadAsset(e.target.files[0], setAiAvatarUrl)} />
                </label>
                {/* Keep pressing until one of them is right.
                    The robot is drawn deterministically from a SEED, so the
                    studio's default has always been one specific robot with no
                    way past it — you either liked the one your slug produced or
                    you drew an avatar. This just tries another seed, and stores
                    the resulting URL exactly where an uploaded avatar goes, so
                    nothing downstream learns a new case. */}
                <Button size="sm" variant="secondary" onClick={() => setAiAvatarUrl(dicebearUrl(Math.random().toString(36).slice(2, 10), "bottts"))}>
                  <RefreshCw /> Shuffle
                </Button>
                {aiAvatarUrl && <Button size="icon" variant="secondary" aria-label="Back to this studio's default robot" onClick={() => setAiAvatarUrl(null)}><Trash2 /></Button>}
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Shuffle draws a different robot each press — stop when one fits, then save.</p>
        </div>

  </>);

  const colourBlock = (<>
        {/* Brand color — presets + wheel, each generates the full palette */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Brand color</span>
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
              Custom
              <ColorSwatch size="sm" value={seedHex} onChange={(hex) => generate(hex)} label="Custom brand colour" />
            </label>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {BRAND_PRESETS.map((p) => {
              const on = parseInt(oklchStringToHex(p.primary).slice(1), 16) === parseInt(seedHex.slice(1), 16);
              return (
                <button key={p.id} onClick={() => generate(p.primary)} className={`relative flex flex-col items-center gap-2 rounded-xl border p-3 transition-all active:scale-95 ${on ? "border-primary" : "border-border/60"}`}>
                  <span className="size-7 rounded-full" style={{ background: p.primary }} />
                  <span className="text-xs">{p.label}</span>
                  {on && <Check className="absolute right-1.5 top-1.5 size-3.5 text-primary" strokeWidth={3} />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Neutral tint */}
        <div className="space-y-1.5">
          <span className="text-sm text-muted-foreground">Surface tint</span>
          <div className="flex gap-2">{NEUTRALS.map((n) => <Chip key={n.id} selected={neutral === n.id} onClick={() => generate(seed, n.id)}>{n.label}</Chip>)}</div>
        </div>
  </>);

  const shapeBlock = (<>

        {/* Radius — the slider belongs to the design system now, and a live
            preview sits beside it so the number is not the only feedback. */}
        <div className="flex items-end gap-3">
          <Slider className="min-w-0 flex-1" label="Corner radius" display={`${radius.toFixed(2)}rem`}
            min={0.4} max={1.4} step={0.05} value={radius} onChange={setRadius} />
          <span aria-hidden className="size-10 shrink-0 rounded-xl border border-border bg-primary/15" />
        </div>

        {/* Elevation. One preset drives --shadow-sm/md/lg, so every raised
            surface in the app moves together — enforced by the design-token
            lint, which refuses a hard-coded box-shadow anywhere. */}
        <div className="space-y-1.5">
          <span className="text-sm text-muted-foreground">Elevation</span>
          <div className="flex flex-wrap gap-2">
            {SHADOW_PRESETS.map((p) => <Chip key={p.id} selected={shadow === p.id} onClick={() => setShadow(p.id)}>{p.label}</Chip>)}
          </div>
          <p className="text-xs text-muted-foreground">{SHADOW_PRESETS.find((p) => p.id === shadow)?.hint}</p>
        </div>

        {/* Border WEIGHT. 0 genuinely removes every hairline in the app — the
            width utilities resolve to --border-width (see tokens.css). */}
        <PreviewPicker
          label="Borders"
          value={borderWidth}
          onChange={setBorderWidth}
          options={BORDER_WIDTHS.map((w) => ({
            value: w.value,
            label: w.label,
            preview: (
              <span
                aria-hidden
                className="block w-9 rounded-md bg-surface-2"
                /* design-tokens-exempt: this IS the border-width picker — each swatch has to draw its own candidate weight, so it cannot resolve to the live token it is choosing. */
                style={{ height: "1.25rem", border: `${w.value}px solid var(--border)` }}
              />
            ),
          }))}
          hint={borderWidth === 0
            ? "Every divider and card edge is off — surfaces separate by colour and elevation alone."
            : "The weight of every divider and card edge in the app."}
        />

        {/* Hairline colour — pointless while borders are off, so it hides. */}
        {borderWidth > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Border colour</span>
            {borderColor && <button onClick={() => setBorderColor("")} className="text-xs font-medium text-primary">Reset to default</button>}
          </div>
          <div className="flex items-center gap-2">
            <ColorSwatch value={borderColor} onChange={setBorderColor} label="Border colour" />
            <Input
              value={borderColor}
              onChange={(e) => setBorderColor(e.target.value)}
              placeholder="Default (tuned per light / dark)"
              className="min-w-0 flex-1 font-mono text-xs"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Leave blank unless you need a specific hairline — the default is tuned separately for light and dark, and one
            colour has to serve both. Fine-tune per mode below.
          </p>
        </div>
        )}

  </>);

  const sectionBlock = (<>
        {/* Section colour. These two used to be per-device toggles in a personal
            "Appearance" tab, which meant two clients of the same studio could see
            differently-coloured chrome — and a studio that had deliberately dialled
            its palette down to two greys got a rainbow tab bar back on whatever
            phone happened to have it stored. They describe how the STUDIO looks,
            so they belong to branding. */}
        <div className="space-y-1.5">
          <span className="text-sm text-muted-foreground">Section colour</span>
          <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
            <ToggleRow icon={Palette} title="Colorful tab bar" desc="Tint the active tab by section — Train green, Eat amber, and so on." checked={tintedNav} onChange={setTintedNav} />
            <div className="border-t border-border/50" />
            <ToggleRow icon={Waves} title="Ambient page colour" desc="Wash each page's hero in its section's colour, fading into the background." checked={ambient} onChange={setAmbient} />
          </div>
          <p className="text-xs text-muted-foreground">
            {tintedNav || ambient
              ? "Applies to everyone in the studio — clients and staff alike."
              : "Off: every section wears the brand colour instead of its own."}
          </p>
        </div>

  </>);

  const advancedBlock = (<>
        {/* Advanced */}
        <button onClick={() => setAdvanced((a) => !a)} className="flex w-full items-center justify-between text-sm font-medium text-muted-foreground">
          <span>Fine-tune tokens</span>
          <ChevronDown className={`size-4 transition-transform ${advanced ? "rotate-180" : ""}`} />
        </button>
        {advanced && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">Every token, light and dark, side by side. A blank field falls back to the shipped default (shown as the placeholder). Type any CSS color — hex, <code className="rounded bg-surface-2 px-1">oklch()</code>, or <code className="rounded bg-surface-2 px-1">hsl()</code> — or use the swatch.</p>
            <TokenGrid tokens={tokens} onSet={setToken} />
            <div className="space-y-2">
              <div className="text-sm font-medium">Paste a theme</div>
              <p className="text-xs text-muted-foreground">Drop in any CSS token set (<code className="rounded bg-surface-2 px-1">:root</code> for light, <code className="rounded bg-surface-2 px-1">.dark</code> for dark). Every token maps straight through — the whole app re-skins.</p>
              <Textarea rows={4} value={themeCss} onChange={(e) => setThemeCss(e.target.value)} placeholder={":root { --primary: oklch(0.6 0.2 250); --background: oklch(1 0 0); ... }\n.dark { --primary: ...; --background: ...; ... }"} className="font-mono text-xs" />
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" disabled={!themeCss.trim()} onClick={applyThemeCss}>Apply theme</Button>
                <Button size="sm" variant="ghost" onClick={() => generate(seed)}>Regenerate</Button>
              </div>
            </div>
          </div>
        )}
  </>);

  /*
    ── BRAND IS FIVE SETTINGS, NOT ONE CARD ────────────────────────────────

    This was 5,599px inside a single `<Card>` — theme blurb, logo, app icon, AI
    coach, nine brand swatches, surface tint, corner radius, elevation, borders,
    border colour, two section toggles and a token grid, all under one Save.
    Nothing in it could be found, and not one row said what it was set to.

    Now an index whose every row carries its CURRENT VALUE, and a page each.
    `?b=` so Back steps out of a sub-page rather than out of settings. The form
    state stays shared and there is still exactly ONE Save, reachable from every
    sub-page — splitting the save would let a half-applied theme exist, which is
    a worse thing than a long page.
  */
  const presetName = BRAND_PRESETS.find((x) => x.primary === seed)?.label ?? "Custom";
  const SUBS: { key: string; label: string; icon: LucideIcon; tone: Tone; value: string; block: ReactNode }[] = [
    { key: "marks", label: "Logos & AI coach", icon: ImageIcon, tone: "cardio", block: marksBlock,
      value: [logoUrl ? "Logo" : "No logo", iconUrl ? "icon" : "no icon", aiName.trim() || "coach unnamed"].join(" · ") },
    { key: "colour", label: "Colour", icon: Palette, tone: "primary", block: colourBlock,
      value: `${presetName} · ${NEUTRALS.find((n) => n.id === neutral)?.label ?? neutral} surfaces` },
    { key: "shape", label: "Shape & depth", icon: Sliders, tone: "activity", block: shapeBlock,
      value: `${radius.toFixed(2)}rem corners · ${SHADOW_PRESETS.find((x) => x.id === shadow)?.label ?? shadow} · ${BORDER_WIDTHS.find((x) => x.value === borderWidth)?.label ?? "hairline"}` },
    { key: "sections", label: "Section colour", icon: Waves, tone: "nutrition", block: sectionBlock,
      value: tintedNav && ambient ? "Tab bar and page wash" : tintedNav ? "Tab bar only" : ambient ? "Page wash only" : "Off — brand colour everywhere" },
    { key: "advanced", label: "Fine-tune tokens", icon: Wand2, tone: "sleep", block: advancedBlock,
      value: "Every token, light and dark" },
  ];
  const sub = params.get("b");
  const openSub = SUBS.find((x) => x.key === sub) ?? null;
  const goSub = (k: string | null) =>
    k ? setParams((q: URLSearchParams) => { q.set("b", k); return q; }) : closeSection("b");

  const saveBar = (
    <div className="space-y-3">
      {/* The editor's own notes sit above the bar; the bar carries the outcome
          of the save itself. Two lines, because they answer two questions. */}
      <ActionResult msg={msg} err={null} />
      <SaveBar label="Save branding" saving={act.busy === "save"} msg={act.msg} err={act.err} onSave={() => void save()} />
    </div>
  );

  if (openSub) {
    return (
      <section className="space-y-5">
        <div className="flex items-center gap-3">
          <Button size="icon" variant="secondary" onClick={() => goSub(null)} aria-label="Back to brand"><ArrowLeft /></Button>
          <h2 className="min-w-0 flex-1 truncate text-title-3">{openSub.label}</h2>
        </div>
        <Card className="space-y-5">{openSub.block}</Card>
        {saveBar}
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <SettingsIndex groups={[{ rows: SUBS.map((x) => ({
        key: x.key, icon: x.icon, tone: x.tone, label: x.label, sub: x.value, onClick: () => goSub(x.key),
      })) }]} />
      {saveBar}
    </section>
  );
}

/**
 * A TEXT LOGO IS NOT THE NAME IN ONE COLOUR.
 *
 * What makes a wordmark read as a logo rather than as a caption is almost
 * always the same two moves: part of it carries the brand colour, and part of
 * it is quieter than the rest. "by" small and grey against "Shujaa"; a full
 * stop in the accent. Without them the generator produces the studio's name set
 * in the app font, which is honest and completely forgettable.
 *
 * Four counts, from each end — never a list of characters. The reasoning is in
 * `@4dl/ui` mark.ts: a per-character selection silently lands on the wrong
 * letters the moment the owner fixes a typo in their name, and nothing tells
 * them. Counts survive a rename.
 *
 * The preview is drawn from the SAME `markRuns` the canvas uses, so it is the
 * output rather than an impression of it — a preview computed by different code
 * from the thing it previews is a preview that eventually lies.
 */
export const PLATES: { value: MarkPlate; label: string }[] = [
  { value: "accent", label: "Brand colour" },
  { value: "tint", label: "Soft tint" },
  { value: "none", label: "Nothing" },
];

/**
 * The colours a generated mark uses on ONE side of the theme.
 *
 * Every one of them is a per-mode token, which is the reason both marks are
 * drawn twice. `--primary` is a different lightness in light mode (0.52, not
 * 0.74 — a button fill has to clear AA on a white surface) and `--foreground`
 * inverts outright, so a mark drawn once is correct on one background and
 * either washed out or invisible on the other.
 */
function markPaint(tokens: BrandTokens, mode: "light" | "dark", seedHex: string) {
  const hex = (v: string | undefined, fallback: string) =>
    v ? (v.startsWith("#") ? v : oklchStringToHex(v) || fallback) : fallback;
  const dark = mode === "dark";
  return {
    primary: hex(tokens[mode]?.["--primary"], seedHex),
    onPrimary: hex(tokens[mode]?.["--primary-foreground"], dark ? "#0b1220" : "#ffffff"),
    fg: hex(tokens[mode]?.["--foreground"], dark ? "#e8eaed" : "#0b1220"),
    surface: hex(tokens[mode]?.["--background"], dark ? "#0b0c0e" : "#ffffff"),
  };
}

/** `#rrggbb` at an alpha, for the translucent plate. The canvas draws it with
 *  `globalAlpha`; CSS needs the colour to carry it. */
function withAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/**
 * THE MARK, ON BOTH BACKGROUNDS IT WILL LIVE ON.
 *
 * A preview against one surface is how a text logo ships invisible: the studio
 * is looking at a dark app, the mark is drawn in the light foreground colour,
 * and it disappears on the phone of every member whose OS is set to light —
 * which is most of them, and the browser tab always.
 *
 * Both plates are drawn from the studio's OWN `--background` tokens rather than
 * from white and black, so this is the real pairing and not an approximation of
 * one. The runs come from the same `markRuns` the canvas uses, so what is on
 * screen is the output rather than an impression of it.
 */
function MarkStage({ runs, tokens, seedHex, plate, wide }: {
  runs: MarkRun[];
  tokens: BrandTokens;
  seedHex: string;
  plate?: MarkPlate;
  wide?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {(["dark", "light"] as const).map((mode) => {
        const paint = markPaint(tokens, mode, seedHex);
        const solid = plate === "accent";
        const fg = solid ? paint.onPrimary : paint.fg;
        const accent = solid ? paint.onPrimary : paint.primary;
        const letters = (
          <span className={wide ? "truncate text-body-lg" : "text-body-lg"}>
            {runs.map((run, i) => (
              <span
                key={i}
                style={{
                  color: run.accent ? accent : fg,
                  fontWeight: run.soft ? MARK_WEIGHT.soft : MARK_WEIGHT.normal,
                  opacity: run.soft ? MARK_SOFT_ALPHA : 1,
                }}
              >
                {run.text}
              </span>
            ))}
          </span>
        );
        return (
          <div key={mode} className="space-y-1">
            <div
              className="grid min-h-18 place-items-center overflow-hidden rounded-xl border border-border/60 px-2"
              style={{ background: paint.surface }}
            >
              {wide ? letters : (
                <span
                  className="grid size-14 place-items-center rounded-2xl"
                  style={{
                    background: plate === "none" ? undefined : plate === "tint" ? withAlpha(paint.primary, MARK_TINT_ALPHA) : paint.primary,
                  }}
                >
                  {letters}
                </span>
              )}
            </div>
            <div className="text-center text-micro uppercase text-muted-foreground">{mode}</div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * WHICH CHARACTERS ARE NOT LIKE THE OTHERS — as counts from each end.
 *
 * Never a list of characters. A per-character selection silently slides onto
 * the wrong letters the moment the owner fixes a typo in their own name, and
 * nothing tells them; counts survive a rename. The full reasoning is in
 * `@4dl/ui` mark.ts.
 */
function CharCounts({ name, style, onChange, accentable }: {
  name: string;
  style: WordmarkStyle;
  onChange: (s: WordmarkStyle) => void;
  /** False on a solid accent plate, where the brand colour is already the
   *  background and an accented letter would look identical to a plain one. */
  accentable: boolean;
}) {
  const len = [...name].length;
  const set = (key: keyof WordmarkStyle, value: number) => onChange({ ...style, [key]: Math.max(0, Math.min(len, value)) });
  const count = (key: keyof WordmarkStyle) => Math.max(0, Math.min(len, style[key] ?? 0));
  return (
    <div className="grid grid-cols-2 gap-2">
      {accentable && <>
        <CharCount label="Accent · first" value={count("accentHead")} max={len} onChange={(n) => set("accentHead", n)} />
        <CharCount label="Accent · last" value={count("accentTail")} max={len} onChange={(n) => set("accentTail", n)} />
      </>}
      <CharCount label="Quieter · first" value={count("softHead")} max={len} onChange={(n) => set("softHead", n)} />
      <CharCount label="Quieter · last" value={count("softTail")} max={len} onChange={(n) => set("softTail", n)} />
    </div>
  );
}

/** How many characters, from one end. A stepper rather than a number field: the
 *  useful range is nought to about three and typing is the slower way to get there. */
function CharCount({ label, value, max, onChange }: { label: string; value: number; max: number; onChange: (n: number) => void }) {
  const step = "grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-sm transition-colors hover:bg-surface-3 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-ring/70";
  return (
    <div className="flex items-center justify-between gap-1.5 rounded-xl border border-border/60 py-1.5 pl-2.5 pr-1.5">
      <span className="min-w-0 truncate text-xs text-muted-foreground">{label}</span>
      <span className="flex shrink-0 items-center gap-1">
        <button type="button" className={step} aria-label={`${label}: one fewer`} disabled={value <= 0} onClick={() => onChange(value - 1)}>−</button>
        <span className="w-4 text-center text-sm tabular-nums">{value}</span>
        <button type="button" className={step} aria-label={`${label}: one more`} disabled={value >= max} onClick={() => onChange(value + 1)}>+</button>
      </span>
    </div>
  );
}

/** Full token grid — every token, light + dark side by side (scena-style). */
function TokenGrid({ tokens, onSet }: { tokens: BrandTokens; onSet: (mode: "light" | "dark", key: string, value: string) => void }) {
  return (
    <div className="space-y-4">
      {TOKEN_GROUPS.map((g) => (
        <div key={g.label}>
          <div className="mb-1.5 text-micro uppercaser text-muted-foreground">{g.label}</div>
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-2 gap-y-1">
            <span />
            <span className="w-[5.5rem] text-center text-xs uppercase tracking-wider text-muted-foreground">Light</span>
            <span className="w-[5.5rem] text-center text-xs uppercase tracking-wider text-muted-foreground">Dark</span>
            {g.tokens.map((name) => {
              const key = `--${name}`;
              return (
                <Fragment key={name}>
                  <code className="truncate text-xs text-muted-foreground">{name}</code>
                  <TokenCell mode="light" tokenKey={key} value={tokens.light?.[key] ?? ""} def={ALL_DEFAULT_TOKENS.light[key] ?? ""} onSet={onSet} />
                  <TokenCell mode="dark" tokenKey={key} value={tokens.dark?.[key] ?? ""} def={ALL_DEFAULT_TOKENS.dark[key] ?? ""} onSet={onSet} />
                </Fragment>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/** One token cell — a native color swatch + a free-text CSS-color field. */
function TokenCell({ mode, tokenKey, value, def, onSet }: { mode: "light" | "dark"; tokenKey: string; value: string; def: string; onSet: (mode: "light" | "dark", key: string, value: string) => void }) {
  return (
    <div className="flex w-[5.5rem] items-center gap-1 rounded-md border border-border/60 px-1.5 py-1">
      <ColorSwatch size="sm" className="size-5" value={colorToHex(value || def)}
        onChange={(hex) => onSet(mode, tokenKey, hexToOklchString(hex))} label={`${tokenKey} ${mode}`} />
      <input
        value={value}
        placeholder={def.replace(/oklch\(|\)/g, "")}
        onChange={(e) => onSet(mode, tokenKey, e.target.value)}
        className="w-full bg-transparent font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/70 placeholder:text-muted-foreground/40"
      />
    </div>
  );
}

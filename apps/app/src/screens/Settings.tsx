/**
 * Settings — account, security (passkeys), appearance, and (owners) the tenant
 * branding editor: pick a brand preset + radius that themes the app for clients.
 */

import { Fragment, useCallback, useEffect, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import {
  Button, Card, Badge, Chip, Switch, Textarea, Skeleton, Reveal, SkeletonLine, SkeletonCircle, SegmentedControl, SettingsList, Page, Stagger, Field, Avatar, stagger, ConfirmDialog,
  BRAND_PRESETS, THEME_TOKEN_GROUPS, DEFAULT_TOKENS, SHADOW_PRESETS, BORDER_WIDTHS, Input, Slider, ColorSwatch, PreviewPicker, colorToHex, deriveTokens, extractPalette, hexToOklchString, oklchStringToHex, parseThemeCss, dicebearUrl,
  KeyRound, Moon, Sun, LogOut, Palette, Waves, Store, Plug, ImageIcon, Upload, Wand2, ChevronDown, Trash2, Check, ArrowLeft, Globe, Copy, Plus, Building2, Bell, BellOff, Mail, LogIn, ExternalLink, ArrowRight, Sheet, Spinner, AlertTriangle,
  ActionResult, ConfigRow, TabIntro, cn, toneText, personaLabel, personaTone, type Tone, type Branding, type BrandTokens, type NeutralTint, type ShadowPreset, type LucideIcon,
} from "@kova/ui";
import type { LoginBranding, TenantBranding } from "@kova/protocol";
import { resolveUnits, cmToFeetInches, feetInchesToCm, STUDIO_SETTINGS_SECTIONS, settingsSectionVisible } from "@kova/domain";
import { useUnits } from "../units.js";
import { useSession } from "../session.js";
import { PreferencesEditorCard } from "./PreferencesEditor.js";
import { INSIGHT_LABELS, mutedInsights, unmuteInsight } from "./client/InsightFeedback.js";
import { useTheme } from "../theme.js";
import { api, errorText, uploadMedia } from "../api.js";
import { enrollPasskey, listPasskeys, removePasskey, passkeySupported, passkeyErrorMessage, deviceLabel } from "../passkey.js";
import { usePasskey } from "../PasskeyPrompt.js";
import { AiConfigSection } from "./AiSettings.js";

/** Studio-level settings the owner controls carry this badge, so the owner can
 *  tell them apart from their own personal (Account / Preferences) settings. */
type Scope = "tenant";
function ScopeTag() {
  return <Badge tone="primary"><Building2 /> Studio</Badge>;
}
/**
 * Section header with an optional studio-scope badge.
 *
 * Carries an icon like the platform console's `SectionHeader` does — a settings
 * page is a long vertical list of near-identical cards, and the icon is what lets
 * an owner find the one they came for by scanning rather than reading. The scope
 * badge stays, because "is this MY setting or the STUDIO's?" is a question the
 * admin console never has to answer.
 */
function SectionHead({ title, icon: Icon, tone = "primary", scope }: { title: string; icon?: LucideIcon; tone?: Tone; scope?: Scope }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2 px-1">
      <h3 className="flex items-center gap-1.5 text-micro uppercase text-muted-foreground">
        {Icon && <Icon className={cn("size-3.5", toneText[tone])} aria-hidden />}
        {title}
      </h3>
      {scope && <ScopeTag />}
    </div>
  );
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
  profile: "Profile",
  preferences: "Preferences",
  notifications: "Notifications",
  passkeys: "Passkeys & security",
  studio: "Studio settings",
};

export function Settings({ onBack, view = "studio" }: { onBack: () => void; view?: SettingsView }) {
  const { ctx, refresh } = useSession();
  const isOwner = ctx?.active?.role === "owner";
  const canBrand = isOwner && ctx?.entitlements.features.branding;
  const role = ctx?.active?.role ?? "member";
  const clientId = ctx?.active?.clientId ?? null;

  const body = (() => {
    switch (view) {
      case "profile":
        return (
          <>
            <Stagger>
              <Card className="flex items-center justify-between gap-3">
                <div className="min-w-0"><div className="text-sm text-muted-foreground">Signed in as</div><div className="truncate font-semibold">{ctx?.user.email}</div></div>
                <Badge tone={personaTone(role)}>{personaLabel(role)}</Badge>
              </Card>
            </Stagger>
            {clientId ? (
              <ClientProfileSection clientId={clientId} email={ctx!.user.email} onSaved={() => void refresh()} />
            ) : (
              <Stagger><Card className="text-sm text-muted-foreground">Your name and photo are managed with your studio account.</Card></Stagger>
            )}
          </>
        );
      case "preferences":
        return <PersonalSettings clientId={clientId} onSaved={() => void refresh()} />;
      // Kept as its own route for deep links and back-compat; the menu now goes
      // to Preferences, which carries this as a tab.
      case "notifications":
        return <PersonalSettings clientId={clientId} initialTab="notifications" onSaved={() => void refresh()} />;
      case "passkeys":
        return <><SecuritySection /><SignOutSection /><DeleteAccountSection /></>;
      case "studio":
        return isOwner ? <StudioSettings canBrand={!!canBrand} /> : <Stagger><Card className="text-sm text-muted-foreground">Studio settings are available to studio owners.</Card></Stagger>;
    }
  })();

  return (
    <Page className="mx-auto max-w-xl space-y-5 p-4 pb-28">
      <div className="flex items-center gap-3">
        <Button size="icon" variant="secondary" onClick={onBack}><ArrowLeft /></Button>
        <h1 className="text-title-2">{VIEW_TITLE[view]}</h1>
      </div>
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
type PersonalTab = "preferences" | "notifications" | "units";

function PersonalSettings({ clientId, initialTab = "preferences", onSaved }: {
  clientId: string | null;
  initialTab?: PersonalTab;
  onSaved: () => void;
}) {
  const tabs: { value: PersonalTab; label: string; intro: string }[] = [
    { value: "preferences", label: "Preferences", intro: "What your coach plans around — your goal, your training, what to avoid." },
    { value: "notifications", label: "Notifications", intro: "What you want to hear about, and where it reaches you." },
    { value: "units", label: "Units", intro: "Whether weights, heights and volumes read metric or imperial." },
  ];
  const [tab, setTab] = useState<PersonalTab>(initialTab);
  const active = tabs.find((t) => t.value === tab) ?? tabs[0]!;

  return (
    <div className="space-y-5">
      <div className="-mx-4 overflow-x-auto px-4 no-scrollbar">
        <SegmentedControl options={tabs.map((t) => ({ value: t.value, label: t.label }))} value={tab} onChange={(v) => setTab(v as PersonalTab)} />
      </div>
      <motion.div key={tab} variants={stagger} initial="hidden" animate="show" className="space-y-6">
        <Stagger><TabIntro>{active.intro}</TabIntro></Stagger>
        {tab === "preferences" && (clientId
          ? <><PreferencesSection clientId={clientId} onSaved={onSaved} /><MutedInsightsSection /></>
          : <Stagger><Card className="text-sm text-muted-foreground">Training &amp; nutrition preferences appear here once you're set up as a client.</Card></Stagger>)}
        {tab === "notifications" && <NotificationsSection />}
        {tab === "units" && <UnitsSection />}
      </motion.div>
    </div>
  );
}

function StudioSettings({ canBrand }: { canBrand: boolean }) {
  const { ctx, refresh } = useSession();
  const { preview } = useTheme();
  // Each section's editor, keyed by its registry id. Which tabs SHOW (and their
  // order + labels) comes from STUDIO_SETTINGS_SECTIONS, so the visible surface
  // can't drift from the tenant's entitlements.
  const render: Record<string, () => ReactNode> = {
    brand: () => <BrandingEditor initial={(ctx?.branding ?? null) as Branding | null} onPreview={preview} onSaved={() => void refresh()} />,
    signin: () => <SignInSettings canBrand={canBrand} branding={ctx?.branding ?? null} slug={ctx?.active?.tenantSlug ?? null} onSaved={() => void refresh()} />,
    ai: () => <AiConfigSection />,
    messaging: () => <><EmailSection /><NotificationPolicySection /><EmailTemplatesSection /></>,
    marketplace: () => <MarketplaceSection />,
    integrations: () => <IntegrationsSection />,
    danger: () => <CloseStudioSection />,
  };
  const features = ctx?.entitlements.features;
  const groups = STUDIO_SETTINGS_SECTIONS
    .filter((s) => (!features || settingsSectionVisible(s, features)) && render[s.key])
    .map((s) => ({ value: s.key, label: s.label, render: render[s.key]! }));

  // What each sub-tab is for, in one line. The platform console leads every tab
  // with this and the studio settings did not — an owner landing on "Messaging"
  // had to open three cards to find out what it governed.
  const INTRO: Record<string, string> = {
    brand: "Your colours, corners, elevation and marks. Every screen your clients see follows this — the whole app is themed from these tokens, not from per-screen styling.",
    signin: "The front door: your login link, the copy on it, and whether passkeys are offered.",
    ai: "Which model answers each AI action, what it costs your balance, and the house voice it writes in.",
    messaging: "How email leaves your studio — who sends it, which categories are allowed, and what the templates say.",
    marketplace: "Your public storefront: whether it's open, and whether clients can sign themselves up.",
    integrations: "Outside data sources you connect, and the keys they use.",
    danger: "Closing the studio. Billing stops immediately, your data is held for seven days, then everything is erased — for you and for every member.",
  };
  const [sub, setSub] = useState<string>(groups[0]?.value ?? "signin");
  const active = groups.find((g) => g.value === sub) ?? groups[0];

  return (
    <div className="space-y-5">
      <p className="px-1 text-sm text-muted-foreground">Studio-wide settings you control as the owner — your brand, your front door, your AI and your business. The <span className="font-medium text-primary">Studio</span> badge marks them apart from your personal settings.</p>
      <div className="-mx-4 overflow-x-auto px-4 no-scrollbar">
        <SegmentedControl options={groups.map((g) => ({ value: g.value, label: g.label }))} value={active?.value ?? ""} onChange={setSub} />
      </div>
      <motion.div key={active?.value} variants={stagger} initial="hidden" animate="show" className="space-y-6">
        {active && INTRO[active.value] && <TabIntro>{INTRO[active.value]}</TabIntro>}
        {active?.render()}
      </motion.div>
    </div>
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
  const keepStudio = async () => { setBusy(true); try { await api.post("/api/tenant/close/cancel"); await load(); } finally { setBusy(false); } };

  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }) : "");

  return (
    <Stagger>
      <SectionHead title="Danger zone" icon={AlertTriangle} tone="danger" scope="tenant" />
      {status?.closing ? (
        <Card className="space-y-2.5">
          <div className="flex items-center gap-2 font-medium text-danger"><AlertTriangle className="size-4" /> Studio scheduled for deletion</div>
          <p className="text-sm text-muted-foreground">Billing is canceled. Your studio and all its data will be permanently erased on <span className="font-medium text-foreground">{fmt(status.deleteAt)}</span>. You can still undo this before then.</p>
          <Button variant="secondary" className="w-full" disabled={busy} onClick={() => void keepStudio()}>{busy ? <><Spinner /> …</> : "Keep my studio"}</Button>
        </Card>
      ) : (
        <Card className="space-y-2.5">
          <div className="flex items-center gap-2 font-medium text-danger"><AlertTriangle className="size-4" /> Close this studio</div>
          <p className="text-sm text-muted-foreground">Cancels your Kova subscription, then permanently deletes the studio and everything in it — every client, plan, log and file — after a 7-day grace period. This can't be undone once the grace period passes.</p>
          <Button variant="outline" className="w-full border-danger/40 text-danger" onClick={() => { setStage("intro"); setCode(""); setErr(null); setOpen(true); }}><Trash2 /> Close my studio…</Button>
        </Card>
      )}

      <Sheet open={open} onClose={() => setOpen(false)} title="Close your studio">
        {stage === "intro" ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">This cancels billing immediately and schedules your studio for permanent deletion in 7 days. We'll email you a confirmation code first.</p>
            <ActionResult msg={null} err={err} />
            <Button className="w-full" disabled={busy} onClick={() => void sendCode()}>{busy ? <><Spinner /> Sending…</> : "Email me a confirmation code"}</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Enter the 6-digit code we emailed you to schedule the closure.</p>
            <Field label="Confirmation code" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))} placeholder="000000" autoFocus />
            <ActionResult msg={null} err={err} />
            <Button className="w-full border-danger/40 text-danger" variant="outline" disabled={busy || code.length < 6} onClick={() => void confirmClose()}>{busy ? <><Spinner /> …</> : <><Trash2 /> Schedule studio deletion</>}</Button>
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
function SignInSettings({ canBrand, branding, slug, onSaved }: { canBrand: boolean; branding: TenantBranding | null; slug: string | null; onSaved: () => void }) {
  return (
    <>
      <LoginLinkCard slug={slug} />
      {canBrand
        ? <LoginCustomizeSection initial={branding?.login ?? null} logoUrl={branding?.logoUrl ?? null} onSaved={onSaved} />
        : <p className="px-1 text-sm text-muted-foreground">Customizing the sign-in screen (your own copy, a hero image, a branded domain) is part of the branding add-on.</p>}
      {canBrand && <DomainSection />}
    </>
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
      <SectionHead title="Login link" icon={LogIn} scope="tenant" />
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
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const upload = async (file: File) => {
    setMsg(null);
    try { const key = await uploadMedia(file, "brand", file.name); setBgImageUrl(`/api/media/${key}`); }
    catch { setMsg("Couldn't upload that image — try again."); }
  };
  const save = async () => {
    setSaving(true); setMsg(null);
    const login: LoginBranding = {
      tagline: tagline.trim() || null,
      headline: headline.trim() || null,
      subtext: subtext.trim() || null,
      bgImageUrl: bgImageUrl || null,
      showPasskey,
    };
    try { await api.patch("/api/settings", { branding: { login } }); onSaved(); setMsg("Sign-in screen saved."); }
    finally { setSaving(false); }
  };

  return (
    <section>
      <SectionHead title="Sign-in screen" icon={Palette} scope="tenant" />
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

        <ActionResult msg={msg} err={null} />
        <Button className="w-full" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save sign-in screen"}</Button>
      </Card>
    </section>
  );
}

/** A compact, faithful mock of the login screen using live theme tokens — so
 *  the owner sees their brand + copy exactly as clients will. */
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

/** Passkey enrollment + removal — personal, per signed-in user. Each passkey is
 *  one device/credential; removing one unregisters that device (email codes stay
 *  as the fallback). */
function SecuritySection() {
  const [passkeys, setPasskeys] = useState<{ id: string; name: string | null; createdAt: string }[]>([]);
  const [enrolling, setEnrolling] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [toRemove, setToRemove] = useState<{ id: string; name: string } | null>(null);
  const pk = usePasskey();
  const load = useCallback(() => { if (passkeySupported()) void listPasskeys().then(setPasskeys).catch(() => undefined); }, []);
  useEffect(() => { load(); }, [load]);
  const addPasskey = async () => {
    setEnrolling(true); setMsg(null);
    try { await enrollPasskey(deviceLabel()); setPasskeys(await listPasskeys()); pk?.refresh(); setMsg("Passkey added — next time, sign in with a tap."); }
    catch (e) { setMsg(passkeyErrorMessage(e)); }
    finally { setEnrolling(false); }
  };
  const remove = async (id: string) => {
    setMsg(null);
    try { await removePasskey(id); setPasskeys(await listPasskeys()); pk?.refresh(); setMsg("Passkey removed from your account."); }
    catch { setMsg("Couldn't remove that passkey — try again."); }
    finally { setToRemove(null); }
  };
  const fmtAdded = (iso: string) => { const d = new Date(iso); return isNaN(+d) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); };
  return (
    <section>
      <SectionHead title="Security" icon={KeyRound} />
      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <div><div className="font-medium">Passkeys</div><div className="text-sm text-muted-foreground">One-tap sign-in with Face ID / fingerprint.</div></div>
          <Badge tone={passkeys.length ? "success" : "neutral"}>{passkeys.length}</Badge>
        </div>
        {passkeys.map((p) => (
          <div key={p.id} className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2.5">
            <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary [&_svg]:size-4"><KeyRound /></div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{p.name ?? "Passkey"}</div>
              {fmtAdded(p.createdAt) && <div className="text-xs text-muted-foreground">Added {fmtAdded(p.createdAt)}</div>}
            </div>
            <Button size="icon" variant="ghost" aria-label={`Remove ${p.name ?? "passkey"}`} onClick={() => setToRemove({ id: p.id, name: p.name ?? "this passkey" })}><Trash2 /></Button>
          </div>
        ))}
        {passkeySupported() ? <Button variant="tonal" className="w-full" disabled={enrolling} onClick={() => void addPasskey()}><KeyRound /> {enrolling ? "Waiting for your device…" : passkeys.length ? "Add another passkey" : "Add a passkey"}</Button> : <p className="text-sm text-muted-foreground">This device doesn't support passkeys — you'll keep using email codes.</p>}
        <ActionResult msg={msg} err={null} />
      </Card>

      <ConfirmDialog
        open={!!toRemove}
        onOpenChange={(o) => !o && setToRemove(null)}
        title={toRemove ? `Remove ${toRemove.name}?` : "Remove passkey?"}
        description="That device won't be able to sign in with a tap anymore — it'll need an email code. You can add a passkey again anytime."
        confirmLabel="Remove"
        destructive
        onConfirm={() => { if (toRemove) void remove(toRemove.id); }}
      />
    </section>
  );
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
      <SectionHead title="Notifications" icon={Bell} />
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
      <SectionHead title="Email templates" icon={Mail} scope="tenant" />
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
  const [busy, setBusy] = useState(false);
  const dirty = subject !== tpl.subject || body !== tpl.body || enabled !== tpl.enabled;
  const save = async () => { setBusy(true); try { await api.put(`/api/email-templates/${tpl.type}`, { subject, body, enabled }); onSaved(); } finally { setBusy(false); } };
  const reset = async () => { setBusy(true); try { await api.del(`/api/email-templates/${tpl.type}`); setSubject(tpl.defaultSubject); setBody(tpl.defaultBody); setEnabled(true); onSaved(); } finally { setBusy(false); } };
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
          <div className="flex items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm"><Switch checked={enabled} onCheckedChange={setEnabled} /> Send this email</label>
            <div className="flex gap-2">
              {tpl.customized && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void reset()}>Reset</Button>}
              <Button size="sm" disabled={busy || !dirty} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Button>
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
      <SectionHead title="Email notifications policy" icon={Bell} scope="tenant" />
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
function EmailSection() {
  const [cfg, setCfg] = useState<{ email: { provider: string; senderEmail: string; senderName: string; brevoKeySet: boolean; ready: boolean }; emailPlatformFrom: string; emailCreditsEach: number } | null>(null);
  const [brevoKey, setBrevoKey] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [senderName, setSenderName] = useState("");
  const [busy, setBusy] = useState(false);
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
      <SectionHead title="Email delivery" icon={Mail} scope="tenant" />
      <LoadError label="your email delivery settings" error={typeof error === "string" ? error : null} onRetry={() => void load()} />
    </section>
  );
  if (!cfg) return null;
  const provider = cfg.email.provider;
  const setProvider = async (p: string) => { setCfg((c) => (c ? { ...c, email: { ...c.email, provider: p } } : c)); await api.patch("/api/settings", { email: { provider: p } }).catch(() => void load()); };
  /** Sender name only — the platform lane has nothing else to save. */
  const saveSender = async () => {
    setBusy(true);
    try { await api.patch("/api/settings", { email: { senderName } }); await load(); }
    finally { setBusy(false); }
  };
  const saveBrevo = async () => {
    setBusy(true);
    try { await api.patch("/api/settings", { email: { senderEmail, senderName, ...(brevoKey ? { brevoApiKey: brevoKey } : {}) } }); setBrevoKey(""); await load(); }
    finally { setBusy(false); }
  };
  return (
    <section>
      <SectionHead title="Email delivery" icon={Mail} scope="tenant" />
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
      </Card>
    </section>
  );
}

function SignOutSection() {
  const { signOut } = useSession();
  return (
    <SettingsList
      sections={[{ header: "Account", rows: [{ icon: LogOut, label: "Sign out", destructive: true, onClick: () => void signOut() }] }]}
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
      <SectionHead title="Danger zone" icon={AlertTriangle} tone="danger" />
      <Card className="space-y-2.5">
        <div className="flex items-center gap-2 font-medium text-danger"><AlertTriangle className="size-4" /> Delete my account</div>
        <p className="text-sm text-muted-foreground">Permanently erase your account and everything in it — photos, logs, measurements, messages. This can't be undone.</p>
        {isOwner ? (
          <p className="text-xs text-muted-foreground">You own a studio. To delete your account, first close your studio in <span className="font-medium text-foreground">Studio settings → Danger zone</span> (that cancels billing and wipes the studio).</p>
        ) : (
          <Button variant="outline" className="w-full border-danger/40 text-danger" onClick={() => { setStage("intro"); setCode(""); setErr(null); setOpen(true); }}><Trash2 /> Delete my account…</Button>
        )}
      </Card>

      <Sheet open={open} onClose={() => setOpen(false)} title="Delete your account">
        {stage === "intro" ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">We'll email a confirmation code to <span className="font-medium text-foreground">{ctx?.user.email}</span>. Entering it permanently erases your account and all your data. There's no undo.</p>
            <ActionResult msg={null} err={err} />
            <Button className="w-full" disabled={busy} onClick={() => void sendCode()}>{busy ? <><Spinner /> Sending…</> : "Email me a confirmation code"}</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Enter the 6-digit code we emailed you, then confirm. This erases everything.</p>
            <Field label="Confirmation code" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))} placeholder="000000" autoFocus />
            <ActionResult msg={null} err={err} />
            <Button className="w-full border-danger/40 text-danger" variant="outline" disabled={busy || code.length < 6} onClick={() => void confirmDelete()}>{busy ? <><Spinner /> Deleting…</> : <><Trash2 /> Permanently delete my account</>}</Button>
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
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
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
  const uploadAvatar = async (file: File) => {
    setMsg(null);
    try {
      const key = await uploadMedia(file, "avatar");
      const url = `/api/media/${key}`;
      await api.post(`/api/clients/${clientId}/avatar`, { avatarUrl: url });
      set({ avatarUrl: url, avatarSeed: null });
      onSaved();
    } catch {
      setMsg("Couldn't upload that image — try again.");
    }
  };
  const save = async () => {
    if (!p) return; setSaving(true); setMsg(null);
    try { await api.patch(`/api/clients/${clientId}`, { displayName: p.displayName, gender: p.gender ?? undefined, dateOfBirth: p.dateOfBirth ?? undefined, heightCm: p.heightCm ?? undefined, bloodType: p.bloodType ?? undefined, phone: p.phone ?? undefined }); setMsg("Profile saved."); onSaved(); }
    finally { setSaving(false); }
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
        <Button size="lg" className="w-full" disabled={saving || p.displayName.trim().length < 1} onClick={() => void save()}>{saving ? "Saving…" : "Save profile"}</Button>
        <ActionResult msg={msg} err={null} />
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
  const [busy, setBusy] = useState(false);
  const set = async (patch: Record<string, string>) => { setBusy(true); try { await api.patch("/api/me/units", patch); await refresh(); } finally { setBusy(false); } };
  return (
    <section>
      <h3 className="mb-2 px-1 text-micro uppercase text-muted-foreground">Units</h3>
      <Card className="space-y-3">
        <p className="text-sm text-muted-foreground">Mix and match freely — these apply everywhere you see numbers, for you only.</p>
        {UNIT_ROWS.map((r) => (
          <div key={r.key} className="flex items-center justify-between gap-3">
            <span className="text-sm">{r.label}</span>
            <SegmentedControl options={r.options} value={units[r.key]!} onChange={(v) => void set({ [r.key]: v })} className={busy ? "pointer-events-none opacity-70" : ""} />
          </div>
        ))}
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

  return (
    <section>
      <SectionHead title="Marketplace" icon={Store} scope="tenant" />
      {error && !loaded ? <LoadError label="your storefront settings" error={typeof error === "string" ? error : null} onRetry={() => void load()} /> : (
      <Reveal loading={!loaded} className="space-y-3" skeleton={
        <Card className="space-y-3">
          <div className="flex items-center gap-2.5"><Skeleton className="size-9 rounded-xl" /><div className="flex-1 space-y-1.5"><SkeletonLine w="45%" h="text" /><SkeletonLine w="70%" h="xs" /></div></div>
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between"><SkeletonLine w="40%" h="text" /><Skeleton className="h-6 w-11 rounded-full" /></div>
          ))}
        </Card>
      }>
        {loaded && (
        <>
        <Card className="space-y-3">
          <div className="flex items-center gap-2.5"><div className="grid size-9 place-items-center rounded-xl bg-primary/15 text-primary [&_svg]:size-4"><Store /></div><div><div className="font-medium">Your Shop</div><div className="text-sm text-muted-foreground">Packages you mark for the Shop are listed in every client&rsquo;s Shop tab, where they can buy them.</div></div></div>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0"><div className="text-sm">Allow self sign-up</div><div className="text-xs text-muted-foreground">A new email can create their own client account from your studio&rsquo;s sign-in page.</div></div>
            <Switch checked={!!marketplace.selfRegister} disabled={busy} onCheckedChange={(v) => void setMarket({ selfRegister: v })} />
          </div>
          <div className="flex items-start justify-between gap-3 border-t border-border/50 pt-3">
            <div className="min-w-0"><div className="text-sm">Require an active plan</div><div className="text-xs text-muted-foreground">Clients with no live package are locked to the Shop screen until they have one.</div></div>
            <Switch checked={!!marketplace.requireActiveAccess} disabled={busy} onCheckedChange={(v) => void setMarket({ requireActiveAccess: v })} />
          </div>
          {saveErr && <p role="status" aria-live="polite" className="text-sm text-danger">{saveErr}</p>}
        </Card>
        <Card className="space-y-2">
          <div className="flex items-center gap-2.5">
            <div className="grid size-9 place-items-center rounded-xl bg-secondary text-muted-foreground [&_svg]:size-4"><Globe /></div>
            <div className="min-w-0 flex-1"><div className="font-medium">Public storefront</div></div>
            <Badge tone="neutral">Coming later</Badge>
          </div>
          <p className="text-sm text-muted-foreground">A shareable public page listing your packages and public articles. Not built yet — your studio&rsquo;s address is a branded sign-in page for now, and packages sell inside the app on each client&rsquo;s Shop tab.</p>
        </Card>
        </>
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

/** A DNS record laid out the way providers ask for it: Type · Name · Value. */
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
  const refresh = async (h: string) => { await api.post(`/api/domains/${encodeURIComponent(h)}/refresh`); await load(); };
  const remove = async (h: string) => { await api.del(`/api/domains/${encodeURIComponent(h)}`); await load(); };

  // Platform hasn't turned on Cloudflare for SaaS — hide the section entirely.
  if (domains && !configured && domains.length === 0) return null;

  const tone = (s: string) => (s === "active" ? "success" : s === "error" ? "danger" : "warning");
  const label = (s: string) => (s === "active" ? "Live" : s === "error" ? "Needs attention" : "Pending DNS");

  return (
    <section>
      <SectionHead title="Custom domain" icon={Globe} scope="tenant" />
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
      <SectionHead title="Integrations" icon={Plug} scope="tenant" />
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
  const { ctx } = useSession();
  const [tokens, setTokens] = useState<BrandTokens>(() => (initial?.tokens && hasTokens(initial.tokens) ? initial.tokens : deriveTokens({ primary: seedFrom(initial) })));
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
  const [aiAvatarUrl, setAiAvatarUrl] = useState<string | null>(initial?.aiAvatarUrl ?? null);
  const [aiName, setAiName] = useState<string>(initial?.aiName ?? "");
  const [advanced, setAdvanced] = useState(false);
  const [themeCss, setThemeCss] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Live-preview whenever the tokens or radius change (logo isn't a token).
  useEffect(() => { onPreview({ tokens, radius, shadow, borderColor: borderColor || null, borderWidth, logoUrl, iconUrl }); }, [JSON.stringify(tokens), radius, shadow, borderColor, borderWidth]); // eslint-disable-line react-hooks/exhaustive-deps

  // Generate a full palette from one color (the smart path).
  const generate = (color: string, tint: NeutralTint = neutral) => { setSeed(color); setNeutral(tint); setTokens(deriveTokens({ primary: color, neutral: tint })); };

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

  const save = async () => {
    setSaving(true);
    // Tokens carry everything now — null out legacy preset/primary fields.
    try { await api.patch("/api/settings", { branding: { tokens, radius, shadow, borderColor: borderColor.trim() || null, borderWidth, neutral, tintedNav, ambient, logoUrl, iconUrl, aiAvatarUrl, aiName: aiName.trim() || null, preset: null, primary: null, primaryForeground: null } }); onSaved(); setMsg("Branding saved."); }
    finally { setSaving(false); }
  };

  const seedHex = oklchStringToHex(seed.startsWith("#") ? hexToOklchString(seed) : seed);

  return (
    <section>
      <SectionHead title="Branding" icon={Palette} scope="tenant" />
      <Card className="space-y-5">
        <div className="flex items-center gap-2.5"><div className="grid size-9 place-items-center rounded-xl bg-primary/15 text-primary [&_svg]:size-4"><Palette /></div><div><div className="font-medium">Theme</div><div className="text-sm text-muted-foreground">Pick one color — the whole app themes itself, light and dark.</div></div></div>

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
                {aiAvatarUrl && <Button size="icon" variant="secondary" aria-label="Reset to bottts" onClick={() => setAiAvatarUrl(null)}><Trash2 /></Button>}
              </div>
            </div>
          </div>
        </div>

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

        <ActionResult msg={msg} err={null} />
        <Button className="w-full" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save branding"}</Button>
      </Card>
    </section>
  );
}

/** Full token grid — every token, light + dark side by side (scena-style). */
function TokenGrid({ tokens, onSet }: { tokens: BrandTokens; onSet: (mode: "light" | "dark", key: string, value: string) => void }) {
  return (
    <div className="space-y-4">
      {THEME_TOKEN_GROUPS.map((g) => (
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
                  <TokenCell mode="light" tokenKey={key} value={tokens.light?.[key] ?? ""} def={DEFAULT_TOKENS.light?.[key] ?? ""} onSet={onSet} />
                  <TokenCell mode="dark" tokenKey={key} value={tokens.dark?.[key] ?? ""} def={DEFAULT_TOKENS.dark?.[key] ?? ""} onSet={onSet} />
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

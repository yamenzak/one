/**
 * Settings — account, security (passkeys), appearance, and (owners) the tenant
 * branding editor: pick a brand preset + radius that themes the app for clients.
 */

import { Fragment, useCallback, useEffect, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import {
  Button, Card, Badge, Chip, Switch, Textarea, Skeleton, Reveal, SkeletonLine, SkeletonCircle, SegmentedControl, SettingsList, Page, Stagger, Field, Avatar, stagger, ConfirmDialog,
  BRAND_PRESETS, THEME_TOKEN_GROUPS, DEFAULT_TOKENS, colorToHex, deriveTokens, extractPalette, hexToOklchString, oklchStringToHex, parseThemeCss, dicebearUrl,
  KeyRound, Moon, Sun, LogOut, Palette, Sparkles, Store, Plug, ImageIcon, Upload, Wand2, ChevronDown, Trash2, Check, ArrowLeft, Globe, Copy, Plus, Building2, Bell, Mail, LogIn, ExternalLink, ArrowRight,
  type Branding, type BrandTokens, type NeutralTint, type LucideIcon,
} from "@mossa/ui";
import type { LoginBranding, TenantBranding } from "@mossa/protocol";
import { resolveUnits, cmToFeetInches, feetInchesToCm } from "@mossa/domain";
import { useUnits } from "../units.js";
import { useSession } from "../session.js";
import { PreferencesEditorCard } from "./PreferencesEditor.js";
import { useTheme } from "../theme.js";
import { api, uploadMedia } from "../api.js";
import { enrollPasskey, listPasskeys, passkeySupported } from "../passkey.js";
import { usePasskey } from "../PasskeyPrompt.js";
import { AiConfigSection } from "./AiSettings.js";

/** Studio-level settings the owner controls carry this badge, so the owner can
 *  tell them apart from their own personal (Account / Preferences) settings. */
type Scope = "tenant";
function ScopeTag() {
  return <Badge tone="primary"><Building2 /> Studio</Badge>;
}
/** Section header with an optional studio-scope badge. */
function SectionHead({ title, scope }: { title: string; scope?: Scope }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2 px-1">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {scope && <ScopeTag />}
    </div>
  );
}

export function Settings({ onBack }: { onBack: () => void }) {
  const { ctx, refresh } = useSession();
  const { preview } = useTheme();
  const isOwner = ctx?.active?.role === "owner";
  const canBrand = isOwner && ctx?.entitlements.features.branding;
  const aiSuite = isOwner && ctx?.entitlements.features.aiSuite;
  const role = ctx?.active?.role ?? "member";

  const tabs = [
    { value: "account", label: "Account" },
    { value: "prefs", label: "Preferences" },
    ...(isOwner ? [{ value: "studio", label: "Studio" }] : []),
  ];
  const [tab, setTab] = useState<string>("account");

  return (
    <Page className="mx-auto max-w-xl space-y-5 p-4 pb-28">
      <div className="flex items-center gap-3">
        <Button size="icon" variant="secondary" onClick={onBack}><ArrowLeft /></Button>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
      </div>

      <Stagger>
        <Card className="flex items-center justify-between gap-3">
          <div className="min-w-0"><div className="text-sm text-muted-foreground">Signed in as</div><div className="truncate font-semibold">{ctx?.user.email}</div></div>
          <Badge tone="neutral" className="capitalize">{role}</Badge>
        </Card>
      </Stagger>

      <SegmentedControl options={tabs} value={tab} onChange={setTab} />

      {/* Keyed remount → each tab re-staggers its sections in. */}
      <motion.div key={tab} variants={stagger} initial="hidden" animate="show" className="space-y-6">
        {tab === "account" && (
          <>
            {ctx?.active?.clientId && <ClientProfileSection clientId={ctx.active.clientId} email={ctx.user.email} onSaved={() => void refresh()} />}
            {ctx?.active?.clientId && <PreferencesSection clientId={ctx.active.clientId} onSaved={() => void refresh()} />}
            <SecuritySection />
            <SignOutSection />
          </>
        )}

        {tab === "prefs" && (
          <>
            <UnitsSection />
            <AppearanceSection />
            <NotificationsSection />
          </>
        )}

        {tab === "studio" && isOwner && <StudioSettings canBrand={!!canBrand} aiSuite={!!aiSuite} />}
      </motion.div>
    </Page>
  );
}

/**
 * The owner's studio settings — split into focused sub-tabs so the (many)
 * sections don't pile into one endless page. Each sub-tab groups a cohesive
 * concern; a tab only appears when it has content the tenant is entitled to.
 */
function StudioSettings({ canBrand, aiSuite }: { canBrand: boolean; aiSuite: boolean }) {
  const { ctx, refresh } = useSession();
  const { preview } = useTheme();
  const groups: { value: string; label: string; show: boolean; render: () => ReactNode }[] = [
    { value: "brand", label: "Brand", show: canBrand, render: () => <BrandingEditor initial={(ctx?.branding ?? null) as Branding | null} onPreview={preview} onSaved={() => void refresh()} /> },
    { value: "signin", label: "Sign-in", show: true, render: () => <SignInSettings canBrand={canBrand} branding={ctx?.branding ?? null} slug={ctx?.active?.tenantSlug ?? null} onSaved={() => void refresh()} /> },
    { value: "ai", label: "AI", show: aiSuite, render: () => <AiConfigSection /> },
    { value: "messaging", label: "Messaging", show: true, render: () => <><EmailSection /><NotificationPolicySection /></> },
    { value: "marketplace", label: "Marketplace", show: true, render: () => <MarketplaceSection /> },
    { value: "integrations", label: "Integrations", show: true, render: () => <IntegrationsSection /> },
  ].filter((g) => g.show);
  const [sub, setSub] = useState<string>(groups[0]?.value ?? "signin");
  const active = groups.find((g) => g.value === sub) ?? groups[0];

  return (
    <div className="space-y-5">
      <p className="px-1 text-sm text-muted-foreground">Studio-wide settings you control as the owner — your brand, your front door, your AI and your business. The <span className="font-medium text-primary">Studio</span> badge marks them apart from your personal settings.</p>
      <div className="-mx-4 overflow-x-auto px-4 no-scrollbar">
        <SegmentedControl options={groups.map((g) => ({ value: g.value, label: g.label }))} value={active?.value ?? ""} onChange={setSub} />
      </div>
      <motion.div key={active?.value} variants={stagger} initial="hidden" animate="show" className="space-y-6">
        {active?.render()}
      </motion.div>
    </div>
  );
}

/**
 * Sign-in — the tenant's front door. Shows the shareable login link (their
 * custom domain if live, else the branded `/t/<slug>` path), the login-screen
 * customization (copy, hero image, passkey), and the custom-domain setup.
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

/** The shareable login link — a custom domain when one is live, otherwise the
 *  branded `/t/<slug>` entry on the platform host. Copy + open. */
function LoginLinkCard({ slug }: { slug: string | null }) {
  const [domains, setDomains] = useState<DomainInfo[] | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => { void api.get<{ domains: DomainInfo[] }>("/api/domains").then((r) => setDomains(r.domains)).catch(() => setDomains([])); }, []);
  const liveDomain = domains?.find((d) => d.status === "active") ?? null;
  const link = liveDomain ? `https://${liveDomain.hostname}` : slug ? `${location.origin}/t/${slug}` : location.origin;
  const pretty = link.replace(/^https?:\/\//, "");
  const copy = () => void navigator.clipboard?.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); });
  return (
    <section>
      <SectionHead title="Login link" scope="tenant" />
      <Card className="space-y-3">
        <div className="flex items-center gap-2.5"><div className="grid size-9 place-items-center rounded-xl bg-primary/15 text-primary [&_svg]:size-4"><LogIn /></div><div><div className="font-medium">Your sign-in link</div><div className="text-sm text-muted-foreground">Share this with clients — it opens a sign-in screen wearing your brand.</div></div></div>
        <div className="flex items-center gap-2 rounded-xl bg-surface-2 p-2 pl-3.5">
          <Globe className="size-4 shrink-0 text-muted-foreground" />
          <code className="min-w-0 flex-1 truncate font-mono text-sm">{pretty}</code>
          <Button size="sm" variant={copied ? "tonal" : "secondary"} onClick={copy}>{copied ? <><Check /> Copied</> : <><Copy /> Copy</>}</Button>
          <Button size="icon" variant="secondary" aria-label="Open login link" onClick={() => window.open(link, "_blank")}><ExternalLink /></Button>
        </div>
        {liveDomain
          ? <p className="text-xs text-muted-foreground">Served on your live domain <span className="font-medium text-foreground">{liveDomain.hostname}</span>.</p>
          : <p className="text-xs text-muted-foreground">This branded path works today. Connect a custom domain below for a link on your own address.</p>}
      </Card>
    </section>
  );
}

/**
 * Login-screen customization — the copy + affordances shown on the tenant's
 * branded sign-in (custom domain or `/t/<slug>`). A live mini-preview mirrors
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
      <SectionHead title="Sign-in screen" scope="tenant" />
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

        {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
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
          {sub && <div className="text-[0.7rem] text-muted-foreground/80">{sub}</div>}
        </div>
        <div className="space-y-2.5 rounded-2xl border border-border/60 bg-card p-3.5 text-left shadow-sm">
          <div className="text-[0.7rem] font-medium text-primary">{tag}</div>
          <div className="flex items-center gap-2 rounded-lg bg-surface-2 px-2.5 py-2 text-[0.7rem] text-muted-foreground"><Mail className="size-3.5" /> you@example.com</div>
          <div className="flex items-center justify-center gap-1.5 rounded-full bg-primary py-2 text-[0.7rem] font-semibold text-primary-foreground">Email me a code <ArrowRight className="size-3" /></div>
          {showPasskey && <div className="flex items-center justify-center gap-1.5 text-[0.7rem] font-medium text-muted-foreground"><KeyRound className="size-3" /> Sign in with a passkey</div>}
        </div>
      </div>
    </div>
  );
}

/** Passkey enrollment — personal, applies to the signed-in user on this device. */
function SecuritySection() {
  const [passkeys, setPasskeys] = useState<{ id: string; name: string | null }[]>([]);
  const [enrolling, setEnrolling] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const pk = usePasskey();
  useEffect(() => { if (passkeySupported()) void listPasskeys().then(setPasskeys); }, []);
  const addPasskey = async () => {
    setEnrolling(true); setMsg(null);
    try { await enrollPasskey(`${navigator.platform || "device"} passkey`); setPasskeys(await listPasskeys()); pk?.refresh(); setMsg("Passkey added — next time, sign in with a tap."); }
    catch { setMsg("Passkey setup was cancelled or failed."); }
    finally { setEnrolling(false); }
  };
  return (
    <section>
      <SectionHead title="Security" />
      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <div><div className="font-medium">Passkeys</div><div className="text-sm text-muted-foreground">One-tap sign-in with Face ID / fingerprint.</div></div>
          <Badge tone={passkeys.length ? "success" : "neutral"}>{passkeys.length}</Badge>
        </div>
        {passkeys.map((p) => <div key={p.id} className="flex items-center gap-2 text-sm text-muted-foreground"><KeyRound className="size-4" /> {p.name ?? "Passkey"}</div>)}
        {passkeySupported() ? <Button variant="tonal" className="w-full" disabled={enrolling} onClick={() => void addPasskey()}><KeyRound /> {enrolling ? "Waiting for your device…" : "Add a passkey"}</Button> : <p className="text-sm text-muted-foreground">This device doesn't support passkeys — you'll keep using email codes.</p>}
        {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
      </Card>
    </section>
  );
}

/** Personalization — theme, tinted nav, ambient wash. All device-local to you. */
function AppearanceSection() {
  const { mode, toggleMode, tintedNav, setTintedNav, ambient, setAmbient } = useTheme();
  return (
    <section>
      <SectionHead title="Appearance" />
      <Card className="divide-y divide-border/50 p-0">
        <ToggleRow icon={mode === "dark" ? Moon : Sun} title="Dark mode" desc="Switch the whole app between light and dark." checked={mode === "dark"} onChange={() => toggleMode()} />
        <ToggleRow icon={Palette} title="Colorful tab bar" desc="Tint the active tab by section — Train green, Eat amber, and so on." checked={tintedNav} onChange={setTintedNav} />
        <ToggleRow icon={Sparkles} title="Ambient page color" desc="Wash each page's hero in its section's color, fading into the background." checked={ambient} onChange={setAmbient} />
      </Card>
    </section>
  );
}

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
  const load = useCallback(async () => setData(await api.get("/api/notification-prefs")), []);
  useEffect(() => { void load(); }, [load]);
  const toggle = async (cat: string, channel: "inbox" | "email", v: boolean) => {
    setData((d) => (d ? { ...d, prefs: { ...d.prefs, [cat]: { ...d.prefs[cat]!, [channel]: v } } } : d));
    await api.patch("/api/notification-prefs", { [cat]: { [channel]: v } }).catch(() => void load());
  };
  return (
    <section>
      <SectionHead title="Notifications" />
      <Card className="divide-y divide-border/50 p-0">
        <div className="flex items-center justify-end gap-6 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
    </section>
  );
}

/** Owner: which notification categories members are allowed to receive by EMAIL.
 *  A studio-wide allow-list layered on top of each member's own preference — the
 *  inbox is never gated, only the email channel. */
function NotificationPolicySection() {
  const [data, setData] = useState<{ notifCategories: { key: string; label: string; blurb: string }[]; notifPolicy: Record<string, boolean> } | null>(null);
  const load = useCallback(async () => {
    const r = await api.get<{ notifCategories: { key: string; label: string; blurb: string }[]; notifPolicy: Record<string, boolean> }>("/api/settings");
    setData({ notifCategories: r.notifCategories, notifPolicy: r.notifPolicy });
  }, []);
  useEffect(() => { void load(); }, [load]);
  const toggle = async (cat: string, v: boolean) => {
    setData((d) => (d ? { ...d, notifPolicy: { ...d.notifPolicy, [cat]: v } } : d));
    await api.patch("/api/settings", { notifPolicy: { [cat]: v } }).catch(() => void load());
  };
  return (
    <section>
      <SectionHead title="Member email notifications" scope="tenant" />
      <Card className="p-0">
        <p className="px-4 pt-4 text-sm text-muted-foreground">Choose which notifications your members may receive by email. Turning one off keeps it in their in-app inbox but never emails it — members still tune their own preferences within what you allow here.</p>
        <div className="mt-2 divide-y divide-border/50">
          {!data
            ? [0, 1, 2].map((i) => <div key={i} className="p-4"><SkeletonLine w="8rem" h="text" /></div>)
            : data.notifCategories.map((cat) => (
                <div key={cat.key} className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0"><div className="text-sm font-medium">{cat.label}</div><div className="text-xs text-muted-foreground">{cat.blurb}</div></div>
                  <Switch checked={data.notifPolicy[cat.key] ?? true} onCheckedChange={(v) => void toggle(cat.key, v)} />
                </div>
              ))}
        </div>
      </Card>
    </section>
  );
}

/** Owner: how the studio sends email — the metered platform sender or your Brevo. */
function EmailSection() {
  const [cfg, setCfg] = useState<{ email: { provider: string; senderEmail: string; senderName: string; brevoKeySet: boolean; ready: boolean }; emailPlatformFrom: string } | null>(null);
  const [brevoKey, setBrevoKey] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [senderName, setSenderName] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await api.get<{ email: { provider: string; senderEmail: string; senderName: string; brevoKeySet: boolean; ready: boolean }; emailPlatformFrom: string }>("/api/settings");
    setCfg(r); setSenderEmail(r.email.senderEmail); setSenderName(r.email.senderName);
  }, []);
  useEffect(() => { void load(); }, [load]);
  if (!cfg) return null;
  const provider = cfg.email.provider;
  const setProvider = async (p: string) => { setCfg((c) => (c ? { ...c, email: { ...c.email, provider: p } } : c)); await api.patch("/api/settings", { email: { provider: p } }).catch(() => void load()); };
  const saveBrevo = async () => {
    setBusy(true);
    try { await api.patch("/api/settings", { email: { senderEmail, senderName, ...(brevoKey ? { brevoApiKey: brevoKey } : {}) } }); setBrevoKey(""); await load(); }
    finally { setBusy(false); }
  };
  return (
    <section>
      <SectionHead title="Email delivery" scope="tenant" />
      <Card className="space-y-3">
        <SegmentedControl
          options={[{ value: "platform", label: "Mossa" }, { value: "brevo", label: "Brevo" }, { value: "off", label: "Off" }]}
          value={provider}
          onChange={(v) => void setProvider(v)}
        />
        {provider === "platform" && (
          <p className="text-sm text-muted-foreground">Sends from <span className="font-medium text-foreground">{cfg.emailPlatformFrom.replace(/.*<|>.*/g, "")}</span> and is metered against your studio credits — no setup needed.</p>
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

interface ClientProfile { displayName: string; email: string | null; gender: string | null; dateOfBirth: string | null; heightCm: number | null; bloodType: string | null; phone: string | null; avatarUrl: string | null; avatarSeed: string | null }
const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

/** A client's own profile — photo, name, DOB, gender (BMR), blood type, phone.
 *  Email is read-only (changes go through the studio). */
function ClientProfileSection({ clientId, email, onSaved }: { clientId: string; email: string; onSaved: () => void }) {
  const [p, setP] = useState<ClientProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const units = useUnits();
  useEffect(() => { void api.get<{ client: ClientProfile }>(`/api/clients/${clientId}`).then((r) => setP(r.client)).catch(() => undefined); }, [clientId]);
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
      <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Profile</h3>
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
        {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
      </Card>
        )}
      </Reveal>
    </section>
  );
}

/** A client's training & nutrition preferences — delegates to the shared editor
 *  (the coach edits the same fields from the client's Manage tab). */
function PreferencesSection({ clientId, onSaved }: { clientId: string; onSaved: () => void }) {
  return (
    <section>
      <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Training &amp; nutrition</h3>
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
      <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Units</h3>
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

function MarketplaceSection() {
  const [marketplace, setMarketplace] = useState<{ enabled?: boolean; selfRegister?: boolean }>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void api.get<{ marketplace: { enabled?: boolean; selfRegister?: boolean } }>("/api/settings").then((r) => { setMarketplace(r.marketplace ?? {}); setLoaded(true); });
  }, []);

  const setMarket = async (patch: { enabled?: boolean; selfRegister?: boolean }) => { setMarketplace((m) => ({ ...m, ...patch })); await api.patch("/api/settings", { marketplace: patch }); };

  return (
    <section>
      <SectionHead title="Marketplace" scope="tenant" />
      <Reveal loading={!loaded} skeleton={
        <Card className="space-y-3">
          <div className="flex items-center gap-2.5"><Skeleton className="size-9 rounded-xl" /><div className="flex-1 space-y-1.5"><SkeletonLine w="45%" h="text" /><SkeletonLine w="70%" h="xs" /></div></div>
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between"><SkeletonLine w="40%" h="text" /><Skeleton className="h-6 w-11 rounded-full" /></div>
          ))}
        </Card>
      }>
        {loaded && (
        <Card className="space-y-3">
          <div className="flex items-center gap-2.5"><div className="grid size-9 place-items-center rounded-xl bg-primary/15 text-primary [&_svg]:size-4"><Store /></div><div><div className="font-medium">Public storefront</div><div className="text-sm text-muted-foreground">A shareable page with your packages and blog.</div></div></div>
          <div className="flex items-center justify-between"><span className="text-sm">Enable storefront</span><Switch checked={!!marketplace.enabled} onCheckedChange={(v) => void setMarket({ enabled: v })} /></div>
          <div className="flex items-center justify-between"><span className="text-sm">Allow self sign-up</span><Switch checked={!!marketplace.selfRegister} onCheckedChange={(v) => void setMarket({ selfRegister: v })} /></div>
        </Card>
        )}
      </Reveal>
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
}

/** A single copyable DNS field (label + monospace value + copy affordance). */
function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => void navigator.clipboard?.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); });
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
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
        <span className="rounded-md bg-primary/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-primary">{type}</span>
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

  const load = async () => {
    const r = await api.get<{ domains: DomainInfo[]; configured: boolean }>("/api/domains");
    setDomains(r.domains); setConfigured(r.configured);
  };
  useEffect(() => { void load(); }, []);

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
      <SectionHead title="Custom domain" scope="tenant" />
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
                {/* Step 1 — add the records. */}
                <div className="flex gap-2.5">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">1</span>
                  <div className="min-w-0 space-y-2">
                    <p className="text-sm">In your domain's DNS settings (GoDaddy, Namecheap, Cloudflare…), add {d.txt ? "these records" : "this record"}:</p>
                    {d.cname.target && <DnsRecord type="CNAME" name={d.cname.name} value={d.cname.target} hint="Routes your domain to the app" />}
                    {d.txt && <DnsRecord type="TXT" name={d.txt.name} value={d.txt.value} hint="Proves you own it (for the SSL certificate)" />}
                    {isApex && <p className="text-xs text-warning">Tip: use a subdomain like <span className="font-mono">app.{d.hostname}</span> — most providers can't point a root domain with a CNAME.</p>}
                  </div>
                </div>
                {/* Step 2 — verify. */}
                <div className="flex gap-2.5">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">2</span>
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
        {err && <p className="text-sm text-danger">{err}</p>}
        <p className="text-xs text-muted-foreground">Use a subdomain you own, like <span className="font-mono">app.yourgym.com</span> — we'll show the exact DNS records to add. You'll sign in with a passkey again on the new domain (each keeps its own secure sign-in).</p>
      </Card>
        )}
      </Reveal>

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

  const load = async () => {
    const r = await api.get<{ integrationProviders: ProviderMeta[]; integrations: Record<string, MaskedProvider> }>("/api/settings");
    setProviders(r.integrationProviders); setState(r.integrations);
  };
  useEffect(() => { void load(); }, []);

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
      <SectionHead title="Integrations" scope="tenant" />
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
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g.label}</div>
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
        {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
      </Card>
        )}
      </Reveal>
    </section>
  );
}

function BrandingEditor({ initial, onPreview, onSaved }: { initial: Branding | null; onPreview: (b: Branding | null) => void; onSaved: () => void }) {
  const { ctx } = useSession();
  const seedFrom = (b: Branding | null) => b?.primary || BRAND_PRESETS.find((p) => p.id === b?.preset)?.primary || "oklch(0.74 0.15 164)";
  const [tokens, setTokens] = useState<BrandTokens>(() => (initial?.tokens && hasTokens(initial.tokens) ? initial.tokens : deriveTokens({ primary: seedFrom(initial) })));
  const [seed, setSeed] = useState<string>(seedFrom(initial));
  const [neutral, setNeutral] = useState<NeutralTint>("brand");
  const [radius, setRadius] = useState(initial?.radius ?? 0.95);
  const [logoUrl, setLogoUrl] = useState<string | null>(initial?.logoUrl ?? null);
  const [iconUrl, setIconUrl] = useState<string | null>(initial?.iconUrl ?? null);
  const [aiAvatarUrl, setAiAvatarUrl] = useState<string | null>(initial?.aiAvatarUrl ?? null);
  const [advanced, setAdvanced] = useState(false);
  const [themeCss, setThemeCss] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Live-preview whenever the tokens or radius change (logo isn't a token).
  useEffect(() => { onPreview({ tokens, radius, logoUrl, iconUrl }); }, [JSON.stringify(tokens), radius]); // eslint-disable-line react-hooks/exhaustive-deps

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
    try { await api.patch("/api/settings", { branding: { tokens, radius, logoUrl, iconUrl, aiAvatarUrl, preset: null, primary: null, primaryForeground: null } }); onSaved(); setMsg("Branding saved."); }
    finally { setSaving(false); }
  };

  const seedHex = oklchStringToHex(seed.startsWith("#") ? hexToOklchString(seed) : seed);

  return (
    <section>
      <SectionHead title="Branding" scope="tenant" />
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

        {/* AI coach avatar — the face of the AI on every AI surface (bottts fallback) */}
        <div className="space-y-2">
          <div className="text-sm font-medium">AI coach avatar <span className="font-normal text-muted-foreground">— shown on AI notes</span></div>
          <div className="flex items-center gap-3">
            <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-full border border-border/60 bg-surface-2">
              <img src={aiAvatarUrl ?? dicebearUrl(`${ctx?.active?.tenantSlug ?? "mossa"}-ai-coach`, "bottts")} alt="AI coach" className="size-full object-cover" />
            </div>
            <div className="flex flex-1 flex-wrap gap-2">
              <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-secondary px-3.5 text-sm font-medium transition-colors hover:bg-surface-3 [&_svg]:size-4"><Upload /> Upload
                <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && void uploadAsset(e.target.files[0], setAiAvatarUrl)} />
              </label>
              {aiAvatarUrl && <Button size="icon" variant="secondary" aria-label="Reset to bottts" onClick={() => setAiAvatarUrl(null)}><Trash2 /></Button>}
            </div>
          </div>
        </div>

        {/* Brand color — presets + wheel, each generates the full palette */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Brand color</span>
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
              Custom
              <input type="color" value={seedHex} onChange={(e) => generate(e.target.value)} className="size-7 cursor-pointer rounded-md bg-transparent" />
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

        {/* Radius */}
        <div>
          <div className="mb-1.5 flex items-center justify-between text-sm"><span className="text-muted-foreground">Corner radius</span><span className="numeral">{radius.toFixed(2)}rem</span></div>
          <input type="range" min={0.4} max={1.4} step={0.05} value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="w-full accent-primary" />
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

        {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
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
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g.label}</div>
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-2 gap-y-1">
            <span />
            <span className="w-[5.5rem] text-center text-[10px] uppercase tracking-wider text-muted-foreground">Light</span>
            <span className="w-[5.5rem] text-center text-[10px] uppercase tracking-wider text-muted-foreground">Dark</span>
            {g.tokens.map((name) => {
              const key = `--${name}`;
              return (
                <Fragment key={name}>
                  <code className="truncate text-[11px] text-muted-foreground">{name}</code>
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
      <input
        type="color"
        value={colorToHex(value || def)}
        onChange={(e) => onSet(mode, tokenKey, hexToOklchString(e.target.value))}
        className="size-4 shrink-0 cursor-pointer rounded bg-transparent p-0"
        aria-label={`${tokenKey} ${mode}`}
      />
      <input
        value={value}
        placeholder={def.replace(/oklch\(|\)/g, "")}
        onChange={(e) => onSet(mode, tokenKey, e.target.value)}
        className="w-full bg-transparent font-mono text-[10px] outline-none placeholder:text-muted-foreground/40"
      />
    </div>
  );
}

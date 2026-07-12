/**
 * Settings — account, security (passkeys), appearance, and (owners) the tenant
 * branding editor: pick a brand preset + radius that themes the app for clients.
 */

import { Fragment, useEffect, useState } from "react";
import {
  Button, Card, Badge, Chip, Switch, Textarea, Skeleton, SegmentedControl, SettingsList, Page, Stagger, Field, Avatar,
  BRAND_PRESETS, THEME_TOKEN_GROUPS, DEFAULT_TOKENS, colorToHex, deriveTokens, extractPalette, hexToOklchString, oklchStringToHex, parseThemeCss, dicebearUrl,
  KeyRound, Moon, Sun, LogOut, Palette, Store, Plug, ImageIcon, Upload, Wand2, ChevronDown, Trash2, Check, ArrowLeft, Globe, Copy, Plus,
  type Branding, type BrandTokens, type NeutralTint,
} from "@mossa/ui";
import { resolveUnits } from "@mossa/domain";
import { useSession } from "../session.js";
import { useTheme } from "../theme.js";
import { api } from "../api.js";
import { enrollPasskey, listPasskeys, passkeySupported } from "../passkey.js";
import { AiConfigSection } from "./AiSettings.js";

export function Settings({ onBack }: { onBack: () => void }) {
  const { ctx, signOut, refresh } = useSession();
  const { mode, toggleMode, preview } = useTheme();
  const [passkeys, setPasskeys] = useState<{ id: string; name: string | null }[]>([]);
  const [enrolling, setEnrolling] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const isOwner = ctx?.active?.role === "owner";
  const canBrand = isOwner && ctx?.entitlements.features.branding;

  useEffect(() => { if (passkeySupported()) void listPasskeys().then(setPasskeys); }, []);

  const addPasskey = async () => {
    setEnrolling(true); setMsg(null);
    try { await enrollPasskey(`${navigator.platform || "device"} passkey`); setPasskeys(await listPasskeys()); setMsg("Passkey added — next time, sign in with a tap."); }
    catch { setMsg("Passkey setup was cancelled or failed."); }
    finally { setEnrolling(false); }
  };

  return (
    <Page className="mx-auto max-w-xl space-y-6 p-4 pb-28">
      <div className="flex items-center gap-3">
        <Button size="icon" variant="secondary" onClick={onBack}><ArrowLeft /></Button>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
      </div>

      <Stagger>
        <Card className="flex items-center justify-between">
          <div><div className="text-sm text-muted-foreground">Signed in as</div><div className="font-semibold">{ctx?.user.email}</div></div>
          <Badge tone="neutral">{ctx?.active?.role}</Badge>
        </Card>
      </Stagger>

      {ctx?.active?.clientId && (
        <Stagger>
          <ClientProfileSection clientId={ctx.active.clientId} email={ctx.user.email} onSaved={() => void refresh()} />
        </Stagger>
      )}

      <Stagger>
        <section>
          <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Security</h3>
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
      </Stagger>

      {canBrand && (
        <Stagger>
          <BrandingEditor initial={(ctx?.branding ?? null) as Branding | null} onPreview={preview} onSaved={() => void refresh()} />
        </Stagger>
      )}

      <Stagger>
        <UnitsSection />
      </Stagger>

      {isOwner && (
        <Stagger>
          <StudioControls />
        </Stagger>
      )}

      {isOwner && (
        <Stagger>
          <DomainSection />
        </Stagger>
      )}

      {isOwner && (
        <Stagger>
          <IntegrationsSection />
        </Stagger>
      )}

      <Stagger>
        <SettingsList
          sections={[
            { header: "Appearance", rows: [{ icon: mode === "dark" ? Sun : Moon, label: mode === "dark" ? "Switch to light" : "Switch to dark", onClick: toggleMode }] },
            { header: "Account", rows: [{ icon: LogOut, label: "Sign out", destructive: true, onClick: () => void signOut().then(() => location.reload()) }] },
          ]}
        />
      </Stagger>
    </Page>
  );
}

interface ClientProfile { displayName: string; email: string | null; gender: string | null; dateOfBirth: string | null; bloodType: string | null; phone: string | null; avatarUrl: string | null; avatarSeed: string | null }
const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

/** A client's own profile — photo, name, DOB, gender (BMR), blood type, phone.
 *  Email is read-only (changes go through the studio). */
function ClientProfileSection({ clientId, email, onSaved }: { clientId: string; email: string; onSaved: () => void }) {
  const [p, setP] = useState<ClientProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { void api.get<{ client: ClientProfile }>(`/api/clients/${clientId}`).then((r) => setP(r.client)).catch(() => undefined); }, [clientId]);
  const set = (patch: Partial<ClientProfile>) => setP((c) => (c ? { ...c, ...patch } : c));
  const uploadAvatar = async (file: File) => {
    const fd = new FormData(); fd.append("file", file); fd.append("purpose", "avatar");
    const up = await fetch("/api/media/upload", { method: "POST", credentials: "include", body: fd });
    const { key } = (await up.json()) as { key?: string };
    if (key) { const url = `/api/media/${key}`; await api.post(`/api/clients/${clientId}/avatar`, { avatarUrl: url }); set({ avatarUrl: url, avatarSeed: null }); onSaved(); }
  };
  const save = async () => {
    if (!p) return; setSaving(true); setMsg(null);
    try { await api.patch(`/api/clients/${clientId}`, { displayName: p.displayName, gender: p.gender ?? undefined, dateOfBirth: p.dateOfBirth ?? undefined, bloodType: p.bloodType ?? undefined, phone: p.phone ?? undefined }); setMsg("Profile saved."); onSaved(); }
    finally { setSaving(false); }
  };
  if (!p) return <section><h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Profile</h3><Skeleton className="h-64" /></section>;
  return (
    <section>
      <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Profile</h3>
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

function StudioControls() {
  const [marketplace, setMarketplace] = useState<{ enabled?: boolean; selfRegister?: boolean }>({});
  const [aiSuite, setAiSuite] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void api.get<{ marketplace: { enabled?: boolean; selfRegister?: boolean }; entitlements: { features: { aiSuite?: boolean } } }>("/api/settings").then((r) => {
      setMarketplace(r.marketplace ?? {}); setAiSuite(!!r.entitlements?.features?.aiSuite); setLoaded(true);
    });
  }, []);

  const setMarket = async (patch: { enabled?: boolean; selfRegister?: boolean }) => { setMarketplace((m) => ({ ...m, ...patch })); await api.patch("/api/settings", { marketplace: patch }); };

  if (!loaded) return <Skeleton className="h-40" />;

  return (
    <>
      {aiSuite && <AiConfigSection />}

      <section>
        <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Marketplace</h3>
        <Card className="space-y-3">
          <div className="flex items-center gap-2.5"><div className="grid size-9 place-items-center rounded-xl bg-primary/15 text-primary [&_svg]:size-4"><Store /></div><div><div className="font-medium">Public storefront</div><div className="text-sm text-muted-foreground">A shareable page with your packages and blog.</div></div></div>
          <div className="flex items-center justify-between"><span className="text-sm">Enable storefront</span><Switch checked={!!marketplace.enabled} onCheckedChange={(v) => void setMarket({ enabled: v })} /></div>
          <div className="flex items-center justify-between"><span className="text-sm">Allow self sign-up</span><Switch checked={!!marketplace.selfRegister} onCheckedChange={(v) => void setMarket({ selfRegister: v })} /></div>
        </Card>
      </section>
    </>
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

function Copyable({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { void navigator.clipboard?.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); }); };
  return (
    <div className="space-y-1">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <button onClick={copy} className="flex w-full items-center gap-2 rounded-lg bg-surface-3 px-2.5 py-2 text-left transition-colors hover:bg-surface-2">
        <code className="min-w-0 flex-1 truncate font-mono text-xs">{value}</code>
        {copied ? <Check className="size-3.5 shrink-0 text-success" /> : <Copy className="size-3.5 shrink-0 text-muted-foreground" />}
      </button>
    </div>
  );
}

function DomainSection() {
  const [domains, setDomains] = useState<DomainInfo[] | null>(null);
  const [configured, setConfigured] = useState(true);
  const [hostname, setHostname] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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

  if (!domains) return <Skeleton className="h-32" />;
  // Platform hasn't turned on Cloudflare for SaaS — hide the section entirely.
  if (!configured && domains.length === 0) return null;

  const tone = (s: string) => (s === "active" ? "success" : s === "error" ? "danger" : "warning");
  const label = (s: string) => (s === "active" ? "Live" : s === "error" ? "Needs attention" : "Pending DNS");

  return (
    <section>
      <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Custom domain</h3>
      <Card className="space-y-4">
        <div className="flex items-center gap-2.5"><div className="grid size-9 place-items-center rounded-xl bg-primary/15 text-primary [&_svg]:size-4"><Globe /></div><div><div className="font-medium">Your own domain</div><div className="text-sm text-muted-foreground">Run the app on your domain — e.g. train.yourgym.com.</div></div></div>

        {domains.map((d) => (
          <div key={d.hostname} className="space-y-3 rounded-xl bg-surface-2 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0"><div className="truncate font-medium">{d.hostname}</div><div className="text-xs text-muted-foreground">{d.status === "active" ? "Secured and serving." : "Add the records below at your DNS provider."}</div></div>
              <Badge tone={tone(d.status)}>{label(d.status)}</Badge>
            </div>
            {d.status !== "active" && (
              <div className="space-y-2.5">
                {d.cname.target && <Copyable label="CNAME record — points your domain here" value={`${d.cname.name}  CNAME  ${d.cname.target}`} />}
                {d.txt && <Copyable label="TXT record — proves ownership for the certificate" value={`${d.txt.name}  TXT  ${d.txt.value}`} />}
              </div>
            )}
            <div className="flex gap-2">
              {d.status === "active"
                ? <Button size="sm" variant="secondary" onClick={() => window.open(`https://${d.hostname}`, "_blank")}><Globe /> Visit</Button>
                : <Button size="sm" variant="secondary" onClick={() => void refresh(d.hostname)}>Check now</Button>}
              <Button size="icon" variant="ghost" aria-label="Remove domain" onClick={() => void remove(d.hostname)}><Trash2 /></Button>
            </div>
          </div>
        ))}

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
        <p className="text-xs text-muted-foreground">You'll sign in with a passkey again on the new domain (each domain keeps its own secure sign-in).</p>
      </Card>
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

  if (!providers) return <Skeleton className="h-40" />;
  const groups: { key: "food" | "exercise"; label: string }[] = [{ key: "food", label: "Nutrition" }, { key: "exercise", label: "Exercises" }];

  return (
    <section>
      <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Integrations</h3>
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
    const fd = new FormData(); fd.append("file", file); fd.append("purpose", "brand");
    const up = await fetch("/api/media/upload", { method: "POST", credentials: "include", body: fd });
    if (!up.ok) { setMsg("Upload failed."); return; }
    const { key } = (await up.json()) as { key?: string };
    if (key) setter(`/api/media/${key}`);
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
      <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Branding</h3>
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

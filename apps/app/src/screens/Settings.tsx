/**
 * Settings — account, security (passkeys), appearance, and (owners) the tenant
 * branding editor: pick a brand preset + radius that themes the app for clients.
 */

import { useEffect, useState } from "react";
import {
  Button, Card, Badge, Chip, Switch, Textarea, Skeleton, SettingsList, Page, Stagger,
  BRAND_PRESETS, EDITABLE_TOKENS, deriveTokens, extractPalette, hexToOklchString, oklchStringToHex, parseThemeCss,
  KeyRound, Moon, Sun, LogOut, Palette, Sparkles, Store, ImageIcon, Upload, Wand2, ChevronDown, Trash2, Check, ArrowLeft,
  type Branding, type BrandTokens, type NeutralTint,
} from "@mossa/ui";
import { useSession } from "../session.js";
import { useTheme } from "../theme.js";
import { api } from "../api.js";
import { enrollPasskey, listPasskeys, passkeySupported } from "../passkey.js";

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

      {isOwner && (
        <Stagger>
          <StudioControls />
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

const AI_FEATURES: { key: string; label: string; hint: string }[] = [
  { key: "draft-plan", label: "AI workout drafts", hint: "Draft a plan from client intake" },
  { key: "draft-meal", label: "AI meal drafts", hint: "Draft meal options from targets" },
  { key: "narrative", label: "Progress recaps", hint: "Readable summaries for clients" },
  { key: "summarize-checkins", label: "Check-in summaries", hint: "Digest recent check-ins" },
  { key: "snap-meal", label: "Snap-a-meal", hint: "Estimate macros from a photo" },
  { key: "nl-log", label: "Natural-language logging", hint: "Type meals in plain English" },
];

function StudioControls() {
  const [aiToggles, setAiToggles] = useState<Record<string, boolean> | null>(null);
  const [marketplace, setMarketplace] = useState<{ enabled?: boolean; selfRegister?: boolean }>({});
  const [aiSuite, setAiSuite] = useState(false);

  useEffect(() => {
    void api.get<{ aiToggles: Record<string, boolean>; marketplace: { enabled?: boolean; selfRegister?: boolean }; entitlements: { features: { aiSuite?: boolean } } }>("/api/settings").then((r) => {
      setAiToggles(r.aiToggles ?? {}); setMarketplace(r.marketplace ?? {}); setAiSuite(!!r.entitlements?.features?.aiSuite);
    });
  }, []);

  const setAi = async (key: string, on: boolean) => { setAiToggles((t) => ({ ...(t ?? {}), [key]: on })); await api.patch("/api/settings", { aiToggles: { [key]: on } }); };
  const setMarket = async (patch: { enabled?: boolean; selfRegister?: boolean }) => { setMarketplace((m) => ({ ...m, ...patch })); await api.patch("/api/settings", { marketplace: patch }); };

  if (!aiToggles) return <Skeleton className="h-40" />;

  return (
    <>
      {aiSuite && (
        <section className="mb-6">
          <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">AI features</h3>
          <Card className="space-y-3">
            <div className="flex items-center gap-2.5"><div className="grid size-9 place-items-center rounded-xl bg-primary/15 text-primary [&_svg]:size-4"><Sparkles /></div><div><div className="font-medium">Assistant</div><div className="text-sm text-muted-foreground">Turn individual AI tools on or off for your studio.</div></div></div>
            {AI_FEATURES.map((f) => (
              <div key={f.key} className="flex items-center justify-between gap-3">
                <div className="min-w-0"><div className="text-sm font-medium">{f.label}</div><div className="truncate text-xs text-muted-foreground">{f.hint}</div></div>
                <Switch checked={aiToggles[f.key] !== false} onCheckedChange={(v) => void setAi(f.key, v)} />
              </div>
            ))}
          </Card>
        </section>
      )}

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
function BrandingEditor({ initial, onPreview, onSaved }: { initial: Branding | null; onPreview: (b: Branding | null) => void; onSaved: () => void }) {
  const { mode } = useTheme();
  const seedFrom = (b: Branding | null) => b?.primary || BRAND_PRESETS.find((p) => p.id === b?.preset)?.primary || "oklch(0.74 0.15 164)";
  const [tokens, setTokens] = useState<BrandTokens>(() => (initial?.tokens && hasTokens(initial.tokens) ? initial.tokens : deriveTokens({ primary: seedFrom(initial) })));
  const [seed, setSeed] = useState<string>(seedFrom(initial));
  const [neutral, setNeutral] = useState<NeutralTint>("brand");
  const [radius, setRadius] = useState(initial?.radius ?? 0.95);
  const [logoUrl, setLogoUrl] = useState<string | null>(initial?.logoUrl ?? null);
  const [advanced, setAdvanced] = useState(false);
  const [themeCss, setThemeCss] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Live-preview whenever the tokens or radius change (logo isn't a token).
  useEffect(() => { onPreview({ tokens, radius, logoUrl }); }, [JSON.stringify(tokens), radius]); // eslint-disable-line react-hooks/exhaustive-deps

  // Generate a full palette from one color (the smart path).
  const generate = (color: string, tint: NeutralTint = neutral) => { setSeed(color); setNeutral(tint); setTokens(deriveTokens({ primary: color, neutral: tint })); };

  const uploadLogo = async (file: File) => {
    setMsg(null);
    const fd = new FormData(); fd.append("file", file); fd.append("purpose", "logo");
    const up = await fetch("/api/media/upload", { method: "POST", credentials: "include", body: fd });
    if (!up.ok) { setMsg("Logo upload failed."); return; }
    const { key } = (await up.json()) as { key?: string };
    if (key) setLogoUrl(`/api/media/${key}`);
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

  const tokenHex = (v: string): string => { const raw = tokens[mode]?.[v] ?? ""; return raw.startsWith("#") ? raw : oklchStringToHex(raw || "oklch(0.5 0 0)"); };
  const setToken = (v: string, hex: string) => setTokens((t) => ({ ...t, [mode]: { ...(t[mode] ?? {}), [v]: hexToOklchString(hex) } }));

  const save = async () => {
    setSaving(true);
    // Tokens carry everything now — null out legacy preset/primary fields.
    try { await api.patch("/api/settings", { branding: { tokens, radius, logoUrl, preset: null, primary: null, primaryForeground: null } }); onSaved(); setMsg("Branding saved."); }
    finally { setSaving(false); }
  };

  const seedHex = oklchStringToHex(seed.startsWith("#") ? hexToOklchString(seed) : seed);

  return (
    <section>
      <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Branding</h3>
      <Card className="space-y-5">
        <div className="flex items-center gap-2.5"><div className="grid size-9 place-items-center rounded-xl bg-primary/15 text-primary [&_svg]:size-4"><Palette /></div><div><div className="font-medium">Theme</div><div className="text-sm text-muted-foreground">Pick one color — the whole app themes itself, light and dark.</div></div></div>

        {/* Logo */}
        <div className="space-y-2">
          <div className="text-sm font-medium">Logo</div>
          <div className="flex items-center gap-3">
            <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-border/60 bg-surface-2">
              {logoUrl ? <img src={logoUrl} alt="Logo" className="max-h-14 max-w-14 object-contain" /> : <ImageIcon className="size-5 text-muted-foreground" />}
            </div>
            <div className="flex flex-1 flex-wrap gap-2">
              <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-secondary px-3.5 text-sm font-medium transition-colors hover:bg-surface-3 [&_svg]:size-4"><Upload /> Upload
                <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && void uploadLogo(e.target.files[0])} />
              </label>
              <Button size="sm" variant="secondary" disabled={!logoUrl} onClick={extractFromLogo}><Wand2 /> Theme from logo</Button>
              {logoUrl && <Button size="icon" variant="secondary" aria-label="Remove logo" onClick={() => setLogoUrl(null)}><Trash2 /></Button>}
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
            <p className="text-xs text-muted-foreground">Editing the <span className="font-medium capitalize text-foreground">{mode}</span> theme — toggle the app's theme (top bar) to edit the other.</p>
            <div className="grid grid-cols-2 gap-2">
              {EDITABLE_TOKENS.map((t) => (
                <label key={t.var} className="flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2 text-sm">
                  <span className="truncate text-muted-foreground">{t.label}</span>
                  <input type="color" value={tokenHex(t.var)} onChange={(e) => setToken(t.var, e.target.value)} className="size-7 cursor-pointer rounded-md bg-transparent" />
                </label>
              ))}
            </div>
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

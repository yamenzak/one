import { useEffect, useRef, useState } from "react";
import { FONT_FAMILIES, DEFAULT_TOKENS } from "@scena/manifest";
import { Sparkles, Palette, MonitorPlay, AtSign, Mail, Sliders, RotateCcw, Wand2, ImagePlus, Trash2, Loader2 } from "lucide-react";
import { Button } from "../components/ui/button.js";
import { Switch } from "../components/ui/switch.js";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card.js";
import { Input } from "../components/ui/input.js";
import { Textarea } from "../components/ui/textarea.js";
import { Label } from "../components/ui/label.js";
import { Separator } from "../components/ui/separator.js";
import { Skeleton } from "../components/ui/skeleton.js";
import { Badge } from "../components/ui/badge.js";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select.js";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs.js";
import { PageHeader } from "../components/page-header.js";
import { usePageChrome } from "../components/page-chrome.js";
import { toast } from "../components/toast.js";
import { useCan } from "../permissions.js";
import { useFeature } from "../entitlements.js";
import { FeatureLockBadge } from "../components/feature-gate.js";
import { applyBrandTheme, deriveTokens, parseThemeCss, THEME_TOKENS } from "../brand-theme.js";
import { assetStoreUrl } from "../components/media-picker.js";
import {
  listAiModels,
  getAiDefaults,
  setAiDefaults,
  getBranding,
  setBranding,
  getPlayback,
  setPlayback,
  getMe,
  claimUsername,
  uploadToLibrary,
  type AiModel,
  type AiDefaults,
  type Branding,
  type BrandLogo,
} from "../api.js";

const FONTS = [...FONT_FAMILIES, "system-ui"];

/** The generator tasks a tenant can pin a default model for. */
const AI_TASKS: { id: string; label: string; hint: string }[] = [
  { id: "text", label: "HTML slides & widgets", hint: "The model behind generated slides and widgets" },
  { id: "image", label: "Poster images", hint: "Image generation for poster slides" },
  { id: "tts", label: "Voice announcements", hint: "Text-to-speech for queue calls and ad voice" },
  { id: "music", label: "Music beds", hint: "Generated background music on the Music page" },
];

/** Claim/change the caller's global username (so they can use username+password
 *  sign-in). Owners created via email OTP start without one. */
function UsernameCard() {
  const [role, setRole] = useState<string | null>(null);
  const [emailAddr, setEmailAddr] = useState<string | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    getMe().then((m) => { setRole(m.role); setEmailAddr(m.email); setCurrent(m.username); setValue(m.username ?? ""); }).catch(() => {}).finally(() => setLoaded(true));
  }, []);
  async function save() {
    setBusy(true);
    try {
      await claimUsername(value.trim());
      setCurrent(value.trim());
      toast.success("Username saved — sign in with it next time.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not set username");
    } finally {
      setBusy(false);
    }
  }

  // Owners (and platform admins) sign in with an email code, not a password —
  // there's no username to manage here (§auth).
  if (loaded && role === "owner") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm"><Mail className="size-4 text-muted-foreground" /> Sign-in</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm text-muted-foreground">You sign in with a one-time code emailed to <span className="font-medium text-foreground">{emailAddr}</span> — no password to manage. Staff you add on the Team page sign in with a username + password instead.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm"><AtSign className="size-4 text-muted-foreground" /> Username</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="mb-3 text-sm text-muted-foreground">Your global username — sign in with just this and your password, no workspace to type.</p>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Label htmlFor="me-user">Username</Label>
            <Input id="me-user" value={value} onChange={(e) => setValue(e.target.value.toLowerCase())} placeholder="jane" autoCapitalize="none" className="mt-1.5" />
          </div>
          <Button onClick={save} disabled={busy || !value.trim() || value.trim() === current}>{busy ? "Saving…" : current ? "Update" : "Set username"}</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SettingsSkeleton() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <PageHeader title="Settings" description="Brand kit, AI, weather, and integrations" />
      {[0, 1, 2].map((i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-4 w-40" />
          </CardHeader>
          <CardContent className="flex flex-col gap-3 pt-0">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-2/3" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** Tenant settings: account, brand kit, playback, and default AI models.
 *  (Weather + data sources live under Sources now.) */
export function SettingsPage() {
  const [ready, setReady] = useState(false);
  const [models, setModels] = useState<AiModel[]>([]);
  const [defaults, setDefaults] = useState<AiDefaults>({});
  const [freeRun, setFreeRun] = useState(false);
  // Frame-accurate multi-screen sync is a premium capability. Without the grant
  // the tenant can't turn it on, so the control is shown read-only + off.
  const canSync = useFeature("multiScreenSync");
  // The toggle is framed positively ("Multi-screen sync"): on = keep screens
  // aligned (freeRun off). It only reflects as on when the plan actually allows it.
  const syncOn = canSync && !freeRun;

  useEffect(() => {
    listAiModels().then(setModels).catch(() => setModels([]));
    getAiDefaults().then(setDefaults).catch(() => setDefaults({}));
    getPlayback().then((p) => setFreeRun(p.freeRun)).catch(() => {});
    setReady(true);
  }, []);

  usePageChrome({ crumbs: [{ label: "Settings" }], actions: [] }, []);

  async function toggleSync(v: boolean) {
    if (!canSync) return; // gated — read-only without the grant
    setFreeRun(!v); // sync on ⇒ free-run off
    await setPlayback(!v);
    toast.success(v
      ? "Multi-screen sync on — republish channels to apply."
      : "Multi-screen sync off — screens free-run. Republish channels to apply.");
  }

  async function pickDefault(task: string, modelId: string) {
    const next = { ...defaults, [task]: modelId };
    setDefaults(next);
    await setAiDefaults({ [task]: modelId });
    toast.success("Default model updated.");
  }

  if (!ready) return <SettingsSkeleton />;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <PageHeader title="Settings" description="Brand kit, AI, and integrations" />

      <Tabs defaultValue="account">
        <TabsList>
          <TabsTrigger value="account"><AtSign className="size-4" /> Account</TabsTrigger>
          <TabsTrigger value="brand"><Palette className="size-4" /> Brand kit</TabsTrigger>
          <TabsTrigger value="general"><Sparkles className="size-4" /> AI</TabsTrigger>
        </TabsList>

        <TabsContent value="account" className="mt-5">
          <UsernameCard />
        </TabsContent>

        <TabsContent value="brand" className="mt-5">
          <BrandingTab />
        </TabsContent>

        <TabsContent value="general" className="mt-5 flex flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <MonitorPlay className="size-4 text-muted-foreground" />
            Multi-screen sync
            <FeatureLockBadge feature="multiScreenSync" className="ml-1" />
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            When two or more screens play the same channel, sync keeps them frame-aligned so a video wall reads as one picture. A single screen always free-runs on its own — this only affects channels shared by several screens. Turning sync off makes every screen free-run (lighter, no drift correction).
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          <label className={`flex items-center justify-between gap-4 rounded-lg border px-3.5 py-3 ${canSync ? "cursor-pointer" : "opacity-60"}`}>
            <div className="min-w-0">
              <div className="text-sm font-medium">Keep screens in sync</div>
              <div className="text-xs text-muted-foreground">
                {canSync
                  ? "Frame-align screens sharing a channel. Republish channels to apply."
                  : "Your plan doesn’t include multi-screen sync — screens free-run. Upgrade to enable."}
              </div>
            </div>
            <Switch checked={syncOn} onCheckedChange={toggleSync} disabled={!canSync} />
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Sparkles className="size-4 text-muted-foreground" />
            Default AI models
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Which model each generator reaches for. Every generator opens on these; you can still override per generation. Availability and pricing are managed in Admin.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 pt-0">
          {AI_TASKS.map((t, i) => {
            const opts = models.filter((m) => m.task === t.id);
            return (
              <div key={t.id}>
                {i > 0 ? <Separator className="my-1" /> : null}
                <div className="flex items-center gap-4 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium">{t.label}</div>
                    <div className="text-[11px] text-muted-foreground">{t.hint}</div>
                  </div>
                  {opts.length === 0 ? (
                    <span className="w-72 text-right text-[11px] text-muted-foreground">No models enabled for this task.</span>
                  ) : (
                    <Select value={defaults[t.id] ?? ""} onValueChange={(v) => pickDefault(t.id, v)}>
                      <SelectTrigger className="w-72"><SelectValue placeholder="Choose a model" /></SelectTrigger>
                      <SelectContent>
                        {opts.map((m) => (
                          <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

        </TabsContent>
      </Tabs>
    </div>
  );
}

const NEUTRAL_TINTS = [
  { id: "brand", label: "Brand-tinted" },
  { id: "gray", label: "Neutral gray" },
  { id: "cool", label: "Cool" },
  { id: "warm", label: "Warm" },
];

/** Quick-start brand colours for the palette generator. */
const PRESET_COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#f43f5e", "#f59e0b", "#8b5cf6", "#14b8a6", "#ef4444"];

function BrandingTab() {
  const canManage = useCan()("settings", "manage");
  const [b, setB] = useState<Branding | null>(null);
  const [saving, setSaving] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [pasted, setPasted] = useState("");
  // Generator inputs — a starting colour, not a stored field. The generated
  // tokens are what's saved; these just seed them.
  const [genColor, setGenColor] = useState("#6366f1");
  const [genAccent, setGenAccent] = useState("#f59e0b");
  const [genNeutral, setGenNeutral] = useState("brand");
  // The last *saved* kit — re-applied on unmount so an unsaved preview doesn't
  // stick around after leaving the tab.
  const savedRef = useRef<Branding | null>(null);

  useEffect(() => {
    getBranding().then((v) => { setB(v); savedRef.current = v; }).catch(() => {});
    return () => { if (savedRef.current) applyBrandTheme(savedRef.current); };
  }, []);

  /** Merge a patch, re-render, and apply the theme live across the whole UI. */
  function update(p: Partial<Branding>) {
    setB((cur) => {
      if (!cur) return cur;
      const next = { ...cur, ...p };
      applyBrandTheme(next);
      return next;
    });
  }

  /** Set one token in the theme (blank clears it → falls back to the default). */
  function setToken(mode: "light" | "dark", token: string, value: string) {
    setB((cur) => {
      if (!cur) return cur;
      const side = { ...(cur.theme?.[mode] ?? {}) };
      if (value.trim()) side[token] = value.trim(); else delete side[token];
      const next = { ...cur, theme: { ...cur.theme, [mode]: side } };
      applyBrandTheme(next);
      return next;
    });
  }

  /** Generate the full shadcn palette from the seed colour into the tokens. */
  function generate() {
    const theme = deriveTokens({ primary: genColor, secondary: genAccent, neutral: genNeutral });
    update({ theme });
    toast.success("Palette generated — tweak any token below, then save.");
  }

  function applyPastedTheme() {
    if (!b) return;
    const parsed = parseThemeCss(pasted);
    const n = Object.keys(parsed.light).length + Object.keys(parsed.dark).length;
    if (!n) { toast.error("No shadcn tokens found — paste a :root { … } / .dark { … } theme."); return; }
    update({ theme: { light: { ...b.theme.light, ...parsed.light }, dark: { ...b.theme.dark, ...parsed.dark } } });
    setPasted("");
    toast.success(`Imported ${n} token${n === 1 ? "" : "s"}. Save to keep.`);
  }

  function resetTheme() {
    update({ theme: { light: {}, dark: {} } });
    toast.success("Theme reset to the shipped defaults.");
  }

  // Brand assets: upload a logo variant to the media library, then reference it.
  const [uploading, setUploading] = useState(false);
  async function addLogo(file: File) {
    if (!b) return;
    setUploading(true);
    try {
      const { url } = await uploadToLibrary(file);
      const label = file.name.replace(/\.[^.]+$/, "").slice(0, 40) || "Logo";
      // Store an absolute URL so the logo renders on the player (a separate origin).
      const logo: BrandLogo = { id: `logo_${Math.random().toString(36).slice(2, 10)}`, label, url: assetStoreUrl(url), mime: file.type };
      const next = { ...b, logos: [...(b.logos ?? []), logo] };
      setB(next);
      await setBranding({ logos: next.logos });
      savedRef.current = next;
      toast.success("Logo added.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Upload failed"); }
    finally { setUploading(false); }
  }
  async function saveLogos(logos: BrandLogo[]) {
    if (!b) return;
    const next = { ...b, logos };
    setB(next);
    savedRef.current = next;
    try { await setBranding({ logos }); } catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); }
  }
  function renameLogo(id: string, label: string) {
    if (!b) return;
    setB({ ...b, logos: (b.logos ?? []).map((l) => (l.id === id ? { ...l, label } : l)) });
  }
  function removeLogo(id: string) {
    if (!b) return;
    void saveLogos((b.logos ?? []).filter((l) => l.id !== id));
  }

  async function save() {
    if (!b) return;
    setSaving(true);
    try {
      const fresh = await setBranding(b);
      setB(fresh);
      savedRef.current = fresh;
      applyBrandTheme(fresh);
      toast.success("Brand saved — the whole workspace now follows it.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save"); }
    finally { setSaving(false); }
  }

  if (!b) return <div className="flex flex-col gap-4"><Skeleton className="h-40 w-full rounded-xl" /><Skeleton className="h-56 w-full rounded-xl" /></div>;

  const tokenCount = Object.keys(b.theme?.light ?? {}).length + Object.keys(b.theme?.dark ?? {}).length;

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm"><Palette className="size-4 text-muted-foreground" /> Brand</CardTitle>
          <p className="text-xs text-muted-foreground">Your <b>shadcn theme tokens</b> are the single source of truth — they recolour the <b>entire workspace</b>, the on-screen widgets, and the AI's generated content. Name, radius and fonts sit alongside them.</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-5 pt-0">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Brand name</Label>
              <Input value={b.brandName} disabled={!canManage} onChange={(e) => update({ brandName: e.target.value })} placeholder="e.g. Acme Clinic" maxLength={80} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Corner radius · {b.radius}px</Label>
              <input type="range" min={0} max={32} value={b.radius} disabled={!canManage} onChange={(e) => update({ radius: +e.target.value })} className="mt-2 w-full accent-primary" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Heading font</Label>
              <Select value={b.headingFont} onValueChange={(v) => update({ headingFont: v })} disabled={!canManage}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{FONTS.map((f) => <SelectItem key={f} value={f} style={{ fontFamily: f }}>{f}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Body font · drives all UI text</Label>
              <Select value={b.bodyFont} onValueChange={(v) => update({ bodyFont: v })} disabled={!canManage}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{FONTS.map((f) => <SelectItem key={f} value={f} style={{ fontFamily: f }}>{f}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <UiSampler brandName={b.brandName} />

          {canManage && (
            <div className="flex items-center justify-between gap-3">
              <Button variant="ghost" size="sm" onClick={() => setAdvanced((v) => !v)}>
                <Sliders className="size-4" /> {advanced ? "Hide tokens" : "Edit tokens"}{tokenCount ? ` (${tokenCount})` : ""}
              </Button>
              <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save brand"}</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Palette — generate the shadcn tokens from a colour, or paste a theme. */}
      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm"><Wand2 className="size-4 text-muted-foreground" /> Palette</CardTitle>
            <p className="text-xs text-muted-foreground">Generate a full, coherent shadcn palette from a brand colour — a starting point you can fine-tune token by token. Or paste an existing shadcn theme.</p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 pt-0">
            <div className="flex flex-wrap gap-1.5">
              {PRESET_COLORS.map((c) => (
                <button key={c} onClick={() => setGenColor(c)} title={c}
                  className={`size-7 rounded-full ring-2 ring-offset-2 ring-offset-background transition ${genColor.toLowerCase() === c ? "ring-foreground" : "ring-transparent hover:ring-border"}`}
                  style={{ background: c }} />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <ColorField label="Brand colour" value={genColor} onChange={setGenColor} />
              <ColorField label="Accent" value={genAccent} onChange={setGenAccent} />
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">Neutral tint</Label>
                <Select value={genNeutral} onValueChange={setGenNeutral}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{NEUTRAL_TINTS.map((n) => <SelectItem key={n.id} value={n.id}>{n.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button className="w-full" onClick={generate}><Wand2 className="size-4" /> Generate</Button>
              </div>
            </div>

            <Separator />
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Paste a shadcn theme</Label>
              <Textarea value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder={":root { --primary: oklch(…); … }\n.dark { … }"} className="h-24 font-mono text-[11px]" />
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled={!pasted.trim()} onClick={applyPastedTheme}>Import tokens</Button>
                {tokenCount > 0 && <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={resetTheme}><RotateCcw className="size-3.5" /> Reset to defaults</Button>}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Brand assets — logo + variants, stored in the media library. */}
      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm"><ImagePlus className="size-4 text-muted-foreground" /> Brand assets</CardTitle>
            <p className="text-xs text-muted-foreground">Upload your logo and any variants (dark, light, mark, wordmark…). They're saved to your media library and available to the <b>Company logo</b> widget and the AI generators.</p>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 pt-0">
            {(b.logos ?? []).length > 0 && (
              <div className="grid gap-2 sm:grid-cols-2">
                {b.logos.map((l) => (
                  <div key={l.id} className="flex items-center gap-3 rounded-lg border p-2">
                    <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-[repeating-conic-gradient(#0000_0deg_90deg,#8884_90deg_180deg)] bg-[length:14px_14px]">
                      <img src={l.url} alt={l.label} className="max-h-12 max-w-12 object-contain" />
                    </span>
                    <Input value={l.label} onChange={(e) => renameLogo(l.id, e.target.value)} onBlur={() => saveLogos(b.logos)} className="h-8 flex-1 text-sm" maxLength={40} placeholder="Variant name" />
                    <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" onClick={() => removeLogo(l.id)}><Trash2 className="size-4" /></Button>
                  </div>
                ))}
              </div>
            )}
            <label className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed py-3 text-sm text-muted-foreground transition-colors hover:bg-accent">
              {uploading ? <><Loader2 className="size-4 animate-spin" /> Uploading…</> : <><ImagePlus className="size-4" /> Upload a logo</>}
              <input type="file" accept="image/*" className="hidden" disabled={uploading}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void addLogo(f); e.target.value = ""; }} />
            </label>
          </CardContent>
        </Card>
      )}

      {advanced && canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm"><Sliders className="size-4 text-muted-foreground" /> shadcn tokens</CardTitle>
            <p className="text-xs text-muted-foreground">The single source of truth. Set any token; blank fields fall back to the shipped default. Accepts any CSS colour (hex, <code>oklch()</code>, <code>hsl()</code>).</p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 pt-0">
            <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 gap-y-1.5 text-[11px]">
              <span className="font-semibold uppercase tracking-wider text-muted-foreground">Token</span>
              <span className="w-32 text-center font-semibold uppercase tracking-wider text-muted-foreground">Light</span>
              <span className="w-32 text-center font-semibold uppercase tracking-wider text-muted-foreground">Dark</span>
              {THEME_TOKENS.map((t) => (
                <TokenRow
                  key={t}
                  token={t}
                  light={b.theme?.light?.[t] ?? ""}
                  dark={b.theme?.dark?.[t] ?? ""}
                  lightDefault={DEFAULT_TOKENS.light[t] ?? ""}
                  darkDefault={DEFAULT_TOKENS.dark[t] ?? ""}
                  onChange={setToken}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** A hex colour swatch + text field (shared by the palette generator inputs). */
function ColorField({ label, value, disabled, onChange }: { label: string; value: string; disabled?: boolean; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2 rounded-lg border p-1.5">
        <input type="color" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="size-8 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0" aria-label={label} />
        <input value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="w-full bg-transparent font-mono text-xs uppercase outline-none" maxLength={7} />
      </div>
    </div>
  );
}

/** One token row: label + light/dark inputs with swatches (placeholder = default). */
function TokenRow({ token, light, dark, lightDefault, darkDefault, onChange }: {
  token: string; light: string; dark: string; lightDefault: string; darkDefault: string;
  onChange: (mode: "light" | "dark", token: string, value: string) => void;
}) {
  const cell = (mode: "light" | "dark", value: string, defaultVal: string) => (
    <div className="flex w-32 items-center gap-1.5 rounded-md border px-1.5 py-1">
      <span className="size-4 shrink-0 rounded-sm border" style={{ background: value || defaultVal }} />
      <input value={value} onChange={(e) => onChange(mode, token, e.target.value)} placeholder={defaultVal.replace(/oklch\(|\)/g, "")} className="w-full bg-transparent font-mono text-[10px] outline-none placeholder:text-muted-foreground/50" />
    </div>
  );
  return (
    <>
      <code className="truncate text-[11px] text-muted-foreground">--{token}</code>
      {cell("light", light, lightDefault)}
      {cell("dark", dark, darkDefault)}
    </>
  );
}

/** A compact swatch of the live theme tokens, so status colours are visible too. */
function UiSampler({ brandName }: { brandName: string }) {
  return (
    <div className="rounded-xl border p-4">
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{brandName || "Your workspace"} · live preview</div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm">Primary</Button>
        <Button size="sm" variant="secondary">Secondary</Button>
        <Button size="sm" variant="outline">Outline</Button>
        <Badge>Default</Badge>
        <Badge variant="success">Success</Badge>
        <Badge variant="warning">Warning</Badge>
        <Badge variant="info">Info</Badge>
        <Badge variant="destructive">Error</Badge>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
        {(["primary", "accent", "secondary", "muted", "success", "warning", "info", "destructive"] as const).map((t) => (
          <div key={t} className="flex flex-col items-center gap-1">
            <div className="h-8 w-full rounded-md border" style={{ background: `var(--${t})` }} />
            <span className="text-[9px] text-muted-foreground">{t}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

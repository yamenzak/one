/**
 * Settings — account, security (passkeys), appearance, and (owners) the tenant
 * branding editor: pick a brand preset + radius that themes the app for clients.
 */

import { useEffect, useState } from "react";
import { Button, Card, Badge, Switch, Skeleton, SettingsList, Page, Stagger, BRAND_PRESETS, KeyRound, Moon, Sun, LogOut, Palette, Sparkles, Store, Check, ArrowLeft, type Branding } from "@mossa/ui";
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

function BrandingEditor({ initial, onPreview, onSaved }: { initial: Branding | null; onPreview: (b: Branding | null) => void; onSaved: () => void }) {
  const [preset, setPreset] = useState(initial?.preset ?? "emerald");
  const [radius, setRadius] = useState(initial?.radius ?? 0.95);
  const [saving, setSaving] = useState(false);

  const apply = (nextPreset: string, nextRadius: number) => onPreview({ preset: nextPreset, radius: nextRadius });

  const save = async () => {
    setSaving(true);
    try { await api.patch("/api/settings", { branding: { preset, radius } }); onSaved(); }
    finally { setSaving(false); }
  };

  return (
    <section>
      <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Branding</h3>
      <Card className="space-y-4">
        <div className="flex items-center gap-2.5"><div className="grid size-9 place-items-center rounded-xl bg-primary/15 text-primary [&_svg]:size-4"><Palette /></div><div><div className="font-medium">Theme</div><div className="text-sm text-muted-foreground">Applies to every client in your studio.</div></div></div>
        <div className="grid grid-cols-3 gap-2">
          {BRAND_PRESETS.map((p) => (
            <button key={p.id} onClick={() => { setPreset(p.id); apply(p.id, radius); }} className={`relative flex flex-col items-center gap-2 rounded-xl border p-3 transition-all active:scale-95 ${preset === p.id ? "border-primary" : "border-border/60"}`}>
              <span className="size-7 rounded-full" style={{ background: p.primary }} />
              <span className="text-xs">{p.label}</span>
              {preset === p.id && <Check className="absolute right-1.5 top-1.5 size-3.5 text-primary" strokeWidth={3} />}
            </button>
          ))}
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between text-sm"><span className="text-muted-foreground">Corner radius</span><span className="numeral">{radius.toFixed(2)}rem</span></div>
          <input type="range" min={0.4} max={1.4} step={0.05} value={radius} onChange={(e) => { const r = Number(e.target.value); setRadius(r); apply(preset, r); }} className="w-full accent-primary" />
        </div>
        <Button className="w-full" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save branding"}</Button>
      </Card>
    </section>
  );
}

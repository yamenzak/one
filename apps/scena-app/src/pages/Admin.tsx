/**
 * THE OPERATOR CONSOLE'S SCENA-SPECIFIC PANELS.
 *
 * ⚠️ This file no longer renders a page. It exports the seven panels that are
 * genuinely Scena's — the plan catalog, the AI model rates, the public track
 * library, promo codes, the workspace list, the Stripe/config form and the
 * factory reset — and `AdminDoor.tsx` mounts them as sections alongside the
 * platform's own.
 *
 * What it used to be: a `TabsList` at `/admin` INSIDE the studio Shell. Two
 * things were wrong with that and only one was cosmetic. `/api/admin/*` has
 * been restricted to the `admin.` door since Stage 3, so in production the
 * route rendered the whole console and then 404'd on every call. And a tab
 * strip puts each subject one scroll apart with the rest invisible below —
 * "Workspaces" lists every workspace, "Public library" every track.
 *
 * The panels themselves are unchanged apart from losing the `addOpen` prop the
 * old shell threaded in to inject an "Add" into the page chrome. Both list
 * panels already rendered their own Add button, so that was a duplicate
 * control, not a lost one.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../components/ui/button.js";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card.js";
import { Input } from "../components/ui/input.js";
import { Label } from "../components/ui/label.js";
import { Badge } from "../components/ui/badge.js";
import { Switch } from "../components/ui/switch.js";
import { Separator } from "../components/ui/separator.js";
import { Skeleton } from "../components/ui/skeleton.js";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table.js";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "../components/ui/dialog.js";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select.js";
import { StatTile, StatusDot, Pill, type Tone } from "../components/status.js";
import { confirmDialog } from "../components/confirm.js";
import { Loader2, Music, Ticket, Users, RefreshCw, AlertTriangle, CreditCard, Package, Sparkles, Tag, Search, Upload, Trash2, ImagePlus, Plus, Pencil } from "lucide-react";
import { cn } from "../lib/utils.js";
import { FEATURE_CATALOG, QUOTA_CATALOG, FEATURE_CATEGORIES } from "@scena/manifest";
import { toast } from "@4dl/ui";
import { EmptyState } from "../components/empty.js";
import {
  getAdminConfig,
  setAdminConfig,
  stripePing,
  stripeSync,
  adminListPlans,
  adminSavePlan,
  adminListModels,
  adminSaveModel,
  adminResyncModels,
  adminListPromos,
  adminCreatePromo,
  adminTogglePromo,
  adminListTenants,
  adminAdjustCredits,
  adminTenantLifecycle,
  adminGetTenantEntitlements,
  adminSetTenantOverrides,
  adminSweep,
  sendTestEmail,
  uploadAsset,
  adminListLibrary,
  adminAddLibraryTrack,
  adminUpdateLibraryTrack,
  adminDeleteLibraryTrack,
  nukeRequest,
  nukeConfirm,
  type Plan,
  type AdminModel,
  type PromoCode,
  type AdminTenant,
  type LibraryTrack,
} from "../api.js";

const num = (n: number) => n.toLocaleString();

/** A compact search field, matching the list pages' toolbar pattern. */
function SearchBox({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder: string; className?: string }) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full pl-8" />
    </div>
  );
}

/** Section header inside a config card. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{children}</div>;
}

function Loading() {
  return (
    <div className="space-y-2.5 py-1">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-11 w-full rounded-lg" />
      ))}
    </div>
  );
}

export function DangerTab() {
  const [stage, setStage] = useState<"idle" | "sent">("idle");
  const [sentTo, setSentTo] = useState("");
  const [otp, setOtp] = useState("");
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);

  async function requestCode() {
    setBusy(true);
    try {
      const r = await nukeRequest();
      if (r.error || !r.ok) throw new Error(r.error || "Could not send code");
      setSentTo(r.sentTo || "your admin email");
      setStage("sent");
      toast.success("Confirmation code emailed.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send code");
    } finally {
      setBusy(false);
    }
  }

  async function confirmWipe() {
    const ok = await confirmDialog({
      title: "Wipe everything — are you absolutely sure?",
      description: "This permanently deletes every workspace, user, screen, channel, board, and uploaded file across the whole platform. There is no undo.",
      confirmText: "Wipe everything",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await nukeConfirm(otp.trim(), phrase.trim());
      if (r.error || !r.ok) throw new Error(r.error || "Wipe failed");
      toast.success(`Wiped ${r.tables ?? 0} tables · ${r.objects ?? 0} files. Reloading…`);
      // Our own session is gone now — send everyone back to a clean login.
      setTimeout(() => { window.location.href = "/"; }, 1500);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Wipe failed");
      setBusy(false);
    }
  }

  return (
    <Card className="max-w-2xl border-destructive/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive"><AlertTriangle className="size-4" /> Factory reset</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-muted-foreground">
          Permanently deletes <b className="text-foreground">everything</b> — all workspaces, users, screens, channels, boards, credentials, and uploaded media — and resets this deployment to a fresh install. The plan catalog is re-seeded so it stays usable. <b className="text-foreground">This cannot be undone.</b>
        </div>

        {stage === "idle" ? (
          <Button variant="destructive" className="w-fit" disabled={busy} onClick={requestCode}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <AlertTriangle className="size-4" />} Start factory reset
          </Button>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">We emailed a 6-digit code to <span className="font-medium text-foreground">{sentTo}</span>. Enter it and type the phrase to confirm.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="nuke-otp">Confirmation code</Label>
                <Input id="nuke-otp" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" inputMode="numeric" className="font-mono tracking-[0.3em]" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nuke-phrase">Type <span className="font-mono text-destructive">WIPE EVERYTHING</span></Label>
                <Input id="nuke-phrase" value={phrase} onChange={(e) => setPhrase(e.target.value)} placeholder="WIPE EVERYTHING" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="destructive" disabled={busy || otp.length < 6 || phrase.trim() !== "WIPE EVERYTHING"} onClick={confirmWipe}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <AlertTriangle className="size-4" />} Wipe everything now
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => { setStage("idle"); setOtp(""); setPhrase(""); }}>Cancel</Button>
              <button type="button" className="text-xs text-muted-foreground hover:text-foreground" disabled={busy} onClick={requestCode}>Resend code</button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* -------------------------------- Stripe --------------------------------- */
export function StripeTab() {
  const [cfg, setCfg] = useState<Record<string, string> | null>(null);
  const [ping, setPing] = useState<{ ok: boolean; account?: string; error?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getAdminConfig().then(setCfg).catch(() => {});
  }, []);
  if (!cfg) return <Loading />;

  const set = (k: string, v: string) => setCfg({ ...cfg, [k]: v });

  async function save() {
    setBusy(true);
    try {
      await setAdminConfig(cfg!);
      setPing(await stripePing());
      toast.success("Settings saved.");
    } catch (e) {
      // The server refuses some values outright — `ai.mock = "on"` outside
      // development is the first. Without this catch the rejection went to the
      // app-wide "something went wrong" toast, which tells an operator nothing
      // about WHICH field was refused or why, and the form kept showing the
      // value that was never stored.
      toast.error(e instanceof Error ? e.message : "Could not save settings.");
    } finally {
      setBusy(false);
    }
  }
  async function sync() {
    setBusy(true);
    const r = await stripeSync();
    if (r.error) toast.error(`Sync failed: ${r.error}`);
    else toast.success(`Synced ${r.plans?.length ?? 0} plans + ${r.packs?.length ?? 0} packs to Stripe.`);
    setBusy(false);
  }

  const field = (key: string, label: string, placeholder = "", helper?: string) => (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <Input
        value={cfg[key] ?? ""}
        onChange={(e) => set(key, e.target.value)}
        placeholder={placeholder}
        className={cn((key.includes("key") || key.includes("secret")) && "font-mono")}
      />
      {helper ? <span className="text-xs text-muted-foreground">{helper}</span> : null}
    </div>
  );

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.1fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Stripe credentials</CardTitle>
          <p className="text-sm text-muted-foreground">Keys are stored server-side and never shipped to the browser or screens.</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Mode</Label>
            <Select value={cfg["stripe.mode"] ?? "disabled"} onValueChange={(v) => set("stripe.mode", v)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="disabled">Disabled</SelectItem>
                <SelectItem value="test">Test</SelectItem>
                <SelectItem value="live">Live</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {field("stripe.secret_key", "Secret key", "sk_test_…")}
          {field("stripe.publishable_key", "Publishable key", "pk_test_…")}
          {field("stripe.webhook_secret", "Webhook signing secret", "whsec_…", "Endpoint: /api/stripe/webhook")}
          <div className="flex items-center gap-2 pt-1">
            <Button disabled={busy} onClick={save}>Save</Button>
            <Button variant="outline" disabled={busy} onClick={sync}>Sync catalog → Stripe</Button>
          </div>
          {ping ? (
            <Pill tone={ping.ok ? "success" : "destructive"} className="w-fit">
              <StatusDot tone={ping.ok ? "success" : "destructive"} />
              {ping.ok ? `Connected: ${ping.account}` : `Not connected: ${ping.error}`}
            </Pill>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Billing policy</CardTitle>
          <p className="text-sm text-muted-foreground">Dunning windows, AI margin, transactional email, and platform provider keys.</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {field("billing.grace_days", "Grace days (past-due → suspend)")}
          {field("billing.delete_days", "Delete days (suspend → auto-delete)")}
          {field("ai.default_markup", "Default AI markup ×")}
          <div className="flex flex-col gap-1.5">
            <Label>AI mock mode</Label>
            <Select value={cfg["ai.mock"] ?? "auto"} onValueChange={(v) => set("ai.mock", v)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto (mock if no Workers AI)</SelectItem>
                <SelectItem value="on">On (always mock)</SelectItem>
                <SelectItem value="off">Off (require Workers AI)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />
          <SectionLabel>Email (transactional)</SectionLabel>
          <div className="flex flex-col gap-1.5">
            <Label>Provider</Label>
            <Select value={cfg["email.provider"] ?? "disabled"} onValueChange={(v) => set("email.provider", v)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="disabled">Disabled</SelectItem>
                <SelectItem value="cloudflare">Cloudflare Email Sending</SelectItem>
                <SelectItem value="mock">Mock (development only)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Mock logs the message instead of sending it, including sign-in codes — outside development it refuses rather than
              reporting a delivery that never happened.
            </p>
          </div>
          {field("email.from", "From address", "Scena <noreply@yourdomain>")}
          {field("email.admin", "Send test emails to", "you@company.com", "Where the Send test button below delivers. Billing and screen notices go to each workspace's own owners, not here.")}

          <Separator />
          <SectionLabel>Platform provider keys</SectionLabel>
          {field("google.gemini_key", "Platform Gemini API key", "AIza…", "One key for all Google AI — Gemini/Lyria generation, queue voice announcements (Gemini TTS), and the model-registry Sync. Each generation is metered at the model's rate (Google's list price × markup) in credits — no BYO key.")}
          {field("weather.api_key", "Platform OpenWeather key", "OpenWeather One Call key…", "Company key that powers every weather source (Sources → Weather). Empty ⇒ locations show mock conditions for free. Each real fetch charges the tenant the per-call price below.")}
          <div className="flex flex-col gap-1.5">
            <Label>OpenWeather One Call version</Label>
            <Select value={cfg["weather.onecall_version"] ?? "4.0"} onValueChange={(v) => set("weather.onecall_version", v)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="4.0">4.0 (current)</SelectItem>
                <SelectItem value="3.0">3.0 (legacy)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">Match your key's subscription — a key is subscribed to one version, not both. New OpenWeather keys are 4.0.</p>
          </div>
          {field("weather.credits_per_call", "Weather credits per call", "3", "Credits charged per real weather fetch — per location, once an hour within its opening-hours window.")}

          <div className="flex items-center gap-2 pt-1">
            <Button disabled={busy} onClick={save}>Save policy</Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={async () => {
                await save();
                const r = await sendTestEmail();
                if (r.skipped) toast.error("Email disabled — enable a provider first.");
                else if (r.ok) toast.success(`Test email ${r.mocked ? "logged (mock)" : "sent"} to ${r.to}`);
                else toast.error(`Test failed: ${r.error}`);
              }}
            >
              Send test email
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* --------------------------------- Plans --------------------------------- */
export function PlansTab() {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [editing, setEditing] = useState<Plan | null>(null);
  const reload = () => adminListPlans().then(setPlans).catch(() => {});
  useEffect(() => { reload(); }, []);
  if (!plans) return <Loading />;

  async function savePrice(p: Plan, cents: number) {
    await adminSavePlan(p.id, { price_cents: cents });
    toast.success(`Updated ${p.name} price.`);
    await reload();
  }
  async function saveGrant(p: Plan, grant: number) {
    try {
      const ent = JSON.parse(p.entitlements_json) as { aiCredits?: { monthlyGrant?: number } };
      ent.aiCredits = { ...(ent.aiCredits ?? {}), monthlyGrant: grant };
      await adminSavePlan(p.id, { entitlements_json: JSON.stringify(ent) });
      toast.success(`Updated ${p.name} grant.`);
      await reload();
    } catch { /* ignore */ }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Plans &amp; entitlements</CardTitle>
        <p className="text-sm text-muted-foreground">Edit price/grant inline and click away to save. <b>Configure</b> opens the full entitlements editor — changes apply to <b>every current and future tenant</b> on the plan (per-tenant overrides in the Tenants tab still win).</p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Plan</TableHead>
                <TableHead className="w-36">Price ¢/mo</TableHead>
                <TableHead className="w-36">Grant cr/mo</TableHead>
                <TableHead>Stripe</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Entitlements</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans.map((p) => (
                <PlanRow key={p.id} plan={p} onPrice={savePrice} onGrant={saveGrant} onConfigure={() => setEditing(p)} />
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      {editing && <PlanEntitlementsModal plan={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </Card>
  );
}

function PlanRow({ plan, onPrice, onGrant, onConfigure }: { plan: Plan; onPrice: (p: Plan, c: number) => void; onGrant: (p: Plan, g: number) => void; onConfigure: () => void }) {
  const grant = (() => { try { return (JSON.parse(plan.entitlements_json) as { aiCredits?: { monthlyGrant?: number } }).aiCredits?.monthlyGrant ?? 0; } catch { return 0; } })();
  const [price, setPrice] = useState(String(plan.price_cents));
  const [g, setG] = useState(String(grant));
  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{plan.name}</div>
        <div className="font-mono text-xs text-muted-foreground">{plan.id}</div>
      </TableCell>
      <TableCell>
        <Input value={price} onChange={(e) => setPrice(e.target.value)} onBlur={() => onPrice(plan, Number(price) || 0)} className="h-9 w-28 font-mono tabular-nums" />
      </TableCell>
      <TableCell>
        <Input value={g} onChange={(e) => setG(e.target.value)} onBlur={() => onGrant(plan, Number(g) || 0)} className="h-9 w-28 font-mono tabular-nums" />
      </TableCell>
      <TableCell>{plan.stripe_price_id ? <Pill tone="info">synced</Pill> : <span className="text-muted-foreground">—</span>}</TableCell>
      <TableCell>
        <Pill tone={plan.active ? "success" : "muted"}>
          <StatusDot tone={plan.active ? "success" : "muted"} /> {plan.active ? "Active" : "Off"}
        </Pill>
      </TableCell>
      <TableCell className="text-right">
        <Button size="sm" variant="outline" onClick={onConfigure}>Configure</Button>
      </TableCell>
    </TableRow>
  );
}

/* ---------------------- Per-plan entitlements editor ---------------------- */
// Editing a plan's entitlements_json applies live to every tenant on the plan
// (tenantEntitlements resolves the plan row per request). Per-tenant overrides
// still take precedence. -1 = unlimited on any quota.
//
// The quota + feature rows are derived from the shared catalog (@scena/manifest)
// so every entitlement the plan shape supports appears here automatically — add
// a feature to the catalog and it shows up in this editor, the tenant overrides,
// the billing cards, and the dashboard gates at once (no drifting hand lists).
const PLAN_QUOTAS = QUOTA_CATALOG;
/*
  EVERY FEATURE IS A BOOLEAN NOW. Four used to be variant allow-lists (`ticker`,
  `clock`, `weather`, `alerting`); Stage 4 flattened them into booleans, and the
  two "Variant & channel allow-lists" editors that rendered them are gone with
  the `kind` field they filtered on.
*/
const PLAN_BOOL_FEATURES = FEATURE_CATALOG;
/** Features grouped by catalog category, in category order, for a tidy editor. */
const FEATURE_GROUPS = FEATURE_CATEGORIES
  .map((cat) => ({ cat, items: PLAN_BOOL_FEATURES.filter((f) => f.category === cat) }))
  .filter((g) => g.items.length > 0);

type PlanEnt = {
  quotas: Record<string, number>;
  features: Record<string, unknown>;
  aiCredits: { monthlyGrant?: number };
  [k: string]: unknown;
};

function PlanEntitlementsModal({ plan, onClose, onSaved }: { plan: Plan; onClose: () => void; onSaved: () => void }) {
  const [ent, setEnt] = useState<PlanEnt | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let parsed: PlanEnt;
    try { parsed = JSON.parse(plan.entitlements_json) as PlanEnt; } catch { parsed = { quotas: {}, features: {}, aiCredits: {} }; }
    parsed.quotas ??= {};
    parsed.features ??= {};
    parsed.aiCredits ??= {};
    setEnt(parsed);
  }, [plan]);

  const setQuota = (k: string, v: string) => setEnt((e) => e && ({ ...e, quotas: { ...e.quotas, [k]: v.trim() === "" || v.trim() === "-" ? 0 : Math.trunc(Number(v)) || 0 } }));
  const setBool = (k: string, v: boolean) => setEnt((e) => e && ({ ...e, features: { ...e.features, [k]: v } }));
  const toggleList = (k: string, opt: string) => setEnt((e) => {
    if (!e) return e;
    const cur = Array.isArray(e.features[k]) ? (e.features[k] as string[]) : [];
    const next = cur.includes(opt) ? cur.filter((x) => x !== opt) : [...cur, opt];
    return { ...e, features: { ...e.features, [k]: next } };
  });

  async function save() {
    if (!ent) return;
    setSaving(true);
    try {
      await adminSavePlan(plan.id, { entitlements_json: JSON.stringify(ent) });
      toast.success(`Updated ${plan.name} entitlements — applied to all ${plan.name} tenants.`);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save entitlements");
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex max-h-[88dvh] flex-col overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{plan.name} — entitlements</DialogTitle>
          <DialogDescription>
            Applies to <b>every current and future tenant</b> on <span className="font-mono">{plan.id}</span> (per-tenant overrides still win). <b>-1</b> = unlimited on any quota.
          </DialogDescription>
        </DialogHeader>
        {!ent ? <Loading /> : (
          <>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
              <div className="space-y-2">
                <SectionLabel>Quotas</SectionLabel>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {PLAN_QUOTAS.map((x) => (
                    <label key={x.key} className="flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-sm text-muted-foreground">
                      <span className="flex-1">{x.label}</span>
                      <Input value={String(ent.quotas[x.key] ?? 0)} onChange={(e) => setQuota(x.key, e.target.value)} className="h-8 w-20 text-right font-mono tabular-nums" />
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <SectionLabel>Features</SectionLabel>
                {FEATURE_GROUPS.map((g) => (
                  <div key={g.cat} className="space-y-1.5">
                    <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">{g.cat}</div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {g.items.map((x) => (
                        <label key={x.key} title={x.description} className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm">
                          <span className="flex-1 text-muted-foreground">
                            {x.label}
                            {x.safety && <span className="ml-1.5 rounded bg-muted px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground/70">always on</span>}
                          </span>
                          <Switch checked={Boolean(ent.features[x.key])} onCheckedChange={(v) => setBool(x.key, v)} />
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <label className="flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-sm text-muted-foreground">
                <span className="flex-1">Monthly AI credit grant</span>
                <Input value={String(ent.aiCredits.monthlyGrant ?? 0)} onChange={(e) => setEnt((s) => s && ({ ...s, aiCredits: { ...s.aiCredits, monthlyGrant: Math.trunc(Number(e.target.value)) || 0 } }))} className="h-8 w-24 text-right font-mono tabular-nums" />
              </label>
            </div>
            <DialogFooter className="border-t pt-3">
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button disabled={saving} onClick={save}>{saving ? "Saving…" : "Save entitlements"}</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------- Models --------------------------------- */
/** Neutral tier + tone from the underlying model id — vendor-agnostic so the
 *  admin table reads as capability tiers, not provider jargon. */
function modelProvider(cf: string): { label: string; tone: Tone } {
  if (/^@cf\//.test(cf)) return { label: "Standard", tone: "info" };
  if (/gemini|lyria/i.test(cf)) return { label: "Advanced", tone: "primary" };
  return { label: "External", tone: "muted" };
}

const TASK_FILTERS: { id: string; label: string }[] = [
  { id: "all", label: "All" },
  { id: "text", label: "Text" },
  { id: "image", label: "Image" },
  { id: "tts", label: "Speech" },
  { id: "music", label: "Music" },
];

export function ModelsTab() {
  const [models, setModels] = useState<AdminModel[] | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [q, setQ] = useState("");
  const [task, setTask] = useState("all");
  const reload = () => adminListModels().then(setModels).catch(() => {});
  useEffect(() => { reload(); }, []);

  async function save(m: AdminModel, patch: Partial<AdminModel>) {
    await adminSaveModel(m.id, patch);
    await reload();
  }
  async function resync() {
    setSyncing(true);
    try { const r = await adminResyncModels(); toast.success(`Catalog synced · ${r.added} added, ${r.updated} updated`); await reload(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Re-sync failed"); }
    finally { setSyncing(false); }
  }

  const filtered = useMemo(() => {
    if (!models) return null;
    const needle = q.trim().toLowerCase();
    return models.filter((m) =>
      (task === "all" || m.task === task) &&
      (!needle || m.label.toLowerCase().includes(needle) || m.cf_model.toLowerCase().includes(needle)),
    );
  }, [models, q, task]);

  if (!models) return <Loading />;
  const enabled = models.filter((m) => m.enabled === 1).length;

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">AI model catalog &amp; pricing</CardTitle>
            <p className="text-sm text-muted-foreground">Unit rates set the cost basis; Markup × sets the margin (3× ≈ 67%). Advanced models run on the platform key, metered at the provider's list price. Sync refreshes the live model catalog when the platform key is set.</p>
          </div>
          <Button variant="outline" disabled={syncing} onClick={resync}>
            <RefreshCw className={cn("size-4", syncing && "animate-spin")} /> {syncing ? "Syncing…" : "Re-sync catalog"}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SearchBox value={q} onChange={setQ} placeholder="Search models…" className="w-full sm:w-64" />
          <div className="flex flex-wrap gap-1.5">
            {TASK_FILTERS.map((t) => (
              <Button key={t.id} size="sm" variant={task === t.id ? "default" : "outline"} onClick={() => setTask(t.id)}>{t.label}</Button>
            ))}
          </div>
          <span className="ml-auto text-sm text-muted-foreground tabular-nums">{filtered?.length ?? 0} shown · {enabled}/{models.length} enabled</span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Model</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Task</TableHead>
                <TableHead className="text-right">Cost basis</TableHead>
                <TableHead className="w-24">Markup ×</TableHead>
                <TableHead className="text-right">Enabled</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered && filtered.length > 0 ? (
                filtered.map((m) => <ModelRow key={m.id} model={m} onSave={save} />)
              ) : (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">No models match your search.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

/** Format a model's cost basis: text → in/out per Mtok; else the unit rate. */
function costBasis(m: AdminModel): React.ReactNode {
  if (m.task === "text") {
    const i = m.input_rate != null ? num(Math.round(m.input_rate)) : "—";
    const o = m.output_rate != null ? num(Math.round(m.output_rate)) : "—";
    return <span className="font-mono tabular-nums text-muted-foreground">{i} in · {o} out<span className="ml-1 text-[10px] uppercase">/Mtok</span></span>;
  }
  const r = m.unit_rate != null ? num(Math.round(m.unit_rate)) : "—";
  const unit = (m.unit_kind ?? "").replace(/_/g, " ") || "unit";
  return <span className="font-mono tabular-nums text-muted-foreground">{r}<span className="ml-1 text-[10px] uppercase">{unit}</span></span>;
}

function ModelRow({ model, onSave }: { model: AdminModel; onSave: (m: AdminModel, patch: Partial<AdminModel>) => void }) {
  const [markup, setMarkup] = useState(String(model.markup));
  const prov = modelProvider(model.cf_model);
  return (
    <TableRow className={cn(model.enabled !== 1 && "opacity-60")}>
      <TableCell>
        <div className="font-medium">{model.label}</div>
        <div className="font-mono text-xs text-muted-foreground">{model.cf_model}</div>
      </TableCell>
      <TableCell><Pill tone={prov.tone}>{prov.label}</Pill></TableCell>
      <TableCell><Badge variant="secondary" className="capitalize">{model.task}</Badge></TableCell>
      <TableCell className="text-right">{costBasis(model)}</TableCell>
      <TableCell>
        <Input value={markup} onChange={(e) => setMarkup(e.target.value)} onBlur={() => onSave(model, { markup: Number(markup) || model.markup })} className="h-9 w-20 font-mono tabular-nums" />
      </TableCell>
      <TableCell className="text-right"><Switch checked={model.enabled === 1} onCheckedChange={(c) => onSave(model, { enabled: c ? 1 : 0 })} /></TableCell>
    </TableRow>
  );
}

/* ---------------------------- Public library ----------------------------- */
export function LibraryTab() {
  const [tracks, setTracks] = useState<LibraryTrack[] | null>(null);
  const [q, setQ] = useState("");
  // null = closed · "new" = add · a track = edit.
  const [dialog, setDialog] = useState<LibraryTrack | "new" | null>(null);
  const reload = () => adminListLibrary().then((r) => setTracks(r.tracks)).catch(() => setTracks([]));
  useEffect(() => { reload(); }, []);
  const close = () => setDialog(null);
  if (!tracks) return <Loading />;

  const needle = q.trim().toLowerCase();
  const visible = needle ? tracks.filter((t) => `${t.title} ${t.artist ?? ""} ${t.genre ?? ""}`.toLowerCase().includes(needle)) : tracks;
  const genres = new Set(tracks.map((t) => t.genre || "Uncategorized")).size;
  const runtime = tracks.reduce((s, t) => s + t.duration_ms, 0);

  async function del(t: LibraryTrack) {
    const ok = await confirmDialog({ title: `Delete “${t.title}”?`, description: "This removes the track from every tenant's public library.", confirmText: "Delete track", destructive: true });
    if (!ok) return;
    await adminDeleteLibraryTrack(t.id);
    reload();
    toast.success("Track deleted.");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Tracks" value={num(tracks.length)} />
        <StatTile label="Genres" value={num(genres)} />
        <StatTile label="Total runtime" value={mmss(runtime)} />
      </div>
      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Public library</CardTitle>
              <p className="text-sm text-muted-foreground">Licensed tracks available to every tenant whose plan includes the Music library.</p>
            </div>
            <div className="flex items-center gap-2">
              {tracks.length > 0 && <SearchBox value={q} onChange={setQ} placeholder="Search tracks…" className="w-full sm:w-56" />}
              <Button onClick={() => setDialog("new")}><Plus className="size-4" /> Add track</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {tracks.length === 0 ? (
            <EmptyState icon={Music} title="No public tracks yet" description="Upload licensed audio to build the shared library every tenant can use." action={<Button onClick={() => setDialog("new")}><Plus className="size-4" /> Add your first track</Button>} className="border-0 bg-transparent py-8" />
          ) : visible.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">No tracks match your search.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Track</TableHead>
                    <TableHead>Genre</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Length</TableHead>
                    <TableHead className="w-20 text-right" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((t) => (
                    <TableRow key={t.id} className="cursor-pointer" onClick={() => setDialog(t)}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground">
                            {t.art_url ? <img src={t.art_url} alt="" className="size-full object-cover" /> : <Music className="size-4" />}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-medium">{t.title}</div>
                            {t.artist ? <div className="truncate text-xs text-muted-foreground">{t.artist}</div> : null}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{t.genre || "Uncategorized"}</TableCell>
                      <TableCell>{t.vocal ? <Pill tone="muted" className="capitalize">{t.vocal}</Pill> : <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-muted-foreground">{mmss(t.duration_ms)}</TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" className="size-8" aria-label="Edit track" onClick={() => setDialog(t)}><Pencil className="size-4" /></Button>
                          <Button size="icon" variant="ghost" className="size-8 text-muted-foreground hover:text-destructive" aria-label="Delete track" onClick={() => del(t)}><Trash2 className="size-4" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      <TrackDialog track={dialog === "new" ? null : dialog} open={dialog !== null} onClose={close} onSaved={reload} />
    </div>
  );
}

/** Add or edit a public-library track. In add mode it uploads the audio; in edit
 *  mode the audio is immutable (content-addressed) so only metadata + art change. */
function TrackDialog({ track, open, onClose, onSaved }: { track: LibraryTrack | null; open: boolean; onClose: () => void; onSaved: () => void }) {
  const editing = !!track;
  const [genre, setGenre] = useState("");
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [vocal, setVocal] = useState<"" | "vocal" | "instrumental">("");
  const [art, setArt] = useState<{ hash: string; url: string } | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const artRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setGenre(track?.genre ?? "");
    setTitle(track?.title ?? "");
    setArtist(track?.artist ?? "");
    setVocal((track?.vocal as "vocal" | "instrumental" | null) || "");
    setArt(track?.art_hash && track?.art_url ? { hash: track.art_hash, url: track.art_url } : null);
    setFile(null);
  }, [open, track]);

  async function onArt(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try { const { hash, url } = await uploadAsset(f); setArt({ hash, url }); }
    catch { toast.error("Could not upload cover art"); }
  }
  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setFile(f);
    if (!title.trim()) setTitle(f.name.replace(/\.[^.]+$/, ""));
  }

  async function submit() {
    if (!genre.trim()) { toast.error("Pick a genre."); return; }
    setBusy(true);
    try {
      if (editing && track) {
        const r = await adminUpdateLibraryTrack(track.id, { genre: genre.trim(), title: title.trim(), artist: artist.trim(), vocal: vocal || null, artHash: art?.hash ?? null, artUrl: art?.url ?? null });
        if (r.error) { toast.error(r.error); return; }
        toast.success("Track updated.");
      } else {
        if (!file) { toast.error("Choose an audio file."); return; }
        const durationMs = await audioFileDuration(file);
        const { hash, url } = await uploadAsset(file);
        const r = await adminAddLibraryTrack({ genre: genre.trim(), title: title.trim() || file.name.replace(/\.[^.]+$/, ""), artist: artist.trim(), assetHash: hash, assetUrl: url, durationMs, vocal: vocal || undefined, artHash: art?.hash, artUrl: art?.url });
        if (r.error) { toast.error(r.error); return; }
        toast.success("Added to the public library — licensed for every tenant with the Music library feature.");
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit track" : "Add a track"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Update the track's details. The audio itself is immutable — delete and re-add to swap the file."
              : "Upload audio the platform is licensed to share. It becomes available to every tenant whose plan includes the Music library."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <div className="space-y-1.5">
            <Label>Genre</Label>
            <Input value={genre} onChange={(e) => setGenre(e.target.value)} placeholder="Lo-fi, Jazz, Ambient…" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Title <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="from filename" />
            </div>
            <div className="space-y-1.5">
              <Label>Artist <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Input value={artist} onChange={(e) => setArtist(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={vocal || "unset"} onValueChange={(v) => setVocal(v === "unset" ? "" : (v as "vocal" | "instrumental"))}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unset">Unset</SelectItem>
                <SelectItem value="vocal">Vocal</SelectItem>
                <SelectItem value="instrumental">Instrumental</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <input ref={artRef} type="file" accept="image/*" onChange={onArt} className="hidden" />
          <input ref={fileRef} type="file" accept="audio/*" onChange={onFile} className="hidden" />
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button variant="outline" onClick={() => artRef.current?.click()}>
              {art ? <><ImagePlus className="size-4 text-success" /> Cover ✓</> : <><ImagePlus className="size-4" /> Cover art</>}
            </Button>
            {!editing && (
              <Button variant="outline" onClick={() => fileRef.current?.click()}>
                <Upload className="size-4" /> {file ? `♪ ${file.name.length > 20 ? file.name.slice(0, 18) + "…" : file.name}` : "Choose audio"}
              </Button>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {editing ? "Save changes" : "Add track"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const mmss = (ms: number) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

function audioFileDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const el = document.createElement("audio");
    el.preload = "metadata";
    el.onloadedmetadata = () => { URL.revokeObjectURL(el.src); resolve(Number.isFinite(el.duration) ? Math.round(el.duration * 1000) : 0); };
    el.onerror = () => reject(new Error("could not read audio"));
    el.src = URL.createObjectURL(file);
  });
}

/* -------------------------------- Promos --------------------------------- */
export function PromosTab() {
  const [promos, setPromos] = useState<PromoCode[] | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const reload = () => adminListPromos().then(setPromos).catch(() => {});
  useEffect(() => { reload(); adminListPlans().then(setPlans).catch(() => {}); }, []);
  const close = () => setDialogOpen(false);
  if (!promos) return <Loading />;

  return (
    <>
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Promo codes <span className="ml-1 text-sm font-normal text-muted-foreground tabular-nums">{promos.length}</span></CardTitle>
            <p className="text-sm text-muted-foreground">Gift credits or a comped plan to a tenant.</p>
          </div>
          <Button onClick={() => setDialogOpen(true)}><Plus className="size-4" /> New code</Button>
        </div>
      </CardHeader>
      <CardContent>
        {promos.length === 0 ? (
          <EmptyState icon={Ticket} title="No promo codes yet" description="Create a credit top-up or plan gift to share with a tenant." action={<Button onClick={() => setDialogOpen(true)}><Plus className="size-4" /> Create a code</Button>} className="border-0 bg-transparent py-8" />
        ) : (
          <div className="overflow-x-auto">
            <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Code</TableHead>
                    <TableHead>Reward</TableHead>
                    <TableHead className="text-right">Used</TableHead>
                    <TableHead className="hidden md:table-cell">Note</TableHead>
                    <TableHead className="w-24 text-right" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {promos.map((p) => (
                    <TableRow key={p.code}>
                      <TableCell>
                        <span className="flex items-center gap-2 font-mono text-sm font-semibold">
                          {p.code}
                          {p.active ? null : <Pill tone="muted">off</Pill>}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Pill tone={p.kind === "plan" ? "primary" : "info"}>
                          {p.kind === "plan" ? `Gift ${p.plan_id} · ${p.plan_months}mo` : `${num(p.credits ?? 0)} cr`}
                        </Pill>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{p.redeemed_count}{p.max_redemptions ? `/${p.max_redemptions}` : ""}</TableCell>
                      <TableCell className="hidden max-w-[220px] truncate text-muted-foreground md:table-cell">{p.note || "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={async () => { await adminTogglePromo(p.code); await reload(); }}>{p.active ? "Disable" : "Enable"}</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      <PromoDialog open={dialogOpen} plans={plans} onClose={close} onSaved={reload} />
    </>
  );
}

/** Create a promo code (credit top-up or comped plan). */
function PromoDialog({ open, plans, onClose, onSaved }: { open: boolean; plans: Plan[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ code: "", kind: "credits", credits: "1000", planId: "pro", planMonths: "12", maxRedemptions: "", note: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setForm({ code: "", kind: "credits", credits: "1000", planId: "pro", planMonths: "12", maxRedemptions: "", note: "" }); }, [open]);

  async function create() {
    if (!form.code.trim()) return;
    setBusy(true);
    try {
      const r = await adminCreatePromo({
        code: form.code.trim(),
        kind: form.kind,
        credits: Number(form.credits) || 0,
        planId: form.planId,
        planMonths: Number(form.planMonths) || 12,
        maxRedemptions: form.maxRedemptions ? Number(form.maxRedemptions) : null,
        note: form.note,
      });
      if (r.error) { toast.error(r.error === "code exists" ? "That code already exists." : r.error); return; }
      toast.success(`Created ${form.code.trim()}.`);
      onSaved();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New promo code</DialogTitle>
          <DialogDescription>Gift credits or a comped plan to a tenant. They redeem it from their Billing page.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <div className="space-y-1.5">
            <Label>Code</Label>
            <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="WELCOME2026" className="font-mono uppercase" autoFocus />
          </div>
          <div className="flex gap-2">
            {(["credits", "plan"] as const).map((k) => (
              <Button key={k} type="button" variant={form.kind === k ? "default" : "outline"} className="flex-1" onClick={() => setForm({ ...form, kind: k })}>
                {k === "credits" ? "Credit top-up" : "Gift a plan"}
              </Button>
            ))}
          </div>
          {form.kind === "credits" ? (
            <div className="space-y-1.5">
              <Label>Credits granted</Label>
              <Input value={form.credits} onChange={(e) => setForm({ ...form, credits: e.target.value })} className="font-mono tabular-nums" />
            </div>
          ) : (
            <div className="flex gap-2">
              <div className="flex-1 space-y-1.5">
                <Label>Plan</Label>
                <Select value={form.planId} onValueChange={(v) => setForm({ ...form, planId: v })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-24 space-y-1.5">
                <Label>Months</Label>
                <Input value={form.planMonths} onChange={(e) => setForm({ ...form, planMonths: e.target.value })} className="font-mono tabular-nums" />
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Max redemptions <span className="font-normal text-muted-foreground">(blank = ∞)</span></Label>
            <Input value={form.maxRedemptions} onChange={(e) => setForm({ ...form, maxRedemptions: e.target.value })} className="font-mono tabular-nums" />
          </div>
          <div className="space-y-1.5">
            <Label>Note</Label>
            <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="e.g. gift to Northline Media" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={create} disabled={busy || !form.code.trim()}>{busy ? <Loader2 className="size-4 animate-spin" /> : null}Create code</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------- Tenants -------------------------------- */
const TENANT_TONE: Record<string, Tone> = { active: "success", suspended: "muted", pending_delete: "warning" };
/** The built-in demo/sandbox workspace (DEMO_TENANT in the API). It backs the
 *  signed-out demo + fallback content, so it's shown as a system row and shielded
 *  from suspend/delete — nuking it would break the public demo. */
const DEMO_TENANT_ID = "tenant_demo";

export function TenantsTab() {
  const [tenants, setTenants] = useState<AdminTenant[] | null>(null);
  const [overridesFor, setOverridesFor] = useState<string | null>(null);
  const [creditsFor, setCreditsFor] = useState<AdminTenant | null>(null);
  const [q, setQ] = useState("");
  const reload = () => adminListTenants().then(setTenants).catch(() => {});
  useEffect(() => { reload(); }, []);

  async function life(t: AdminTenant, action: "suspend" | "reactivate" | "delete") {
    if (action === "delete") {
      const ok = await confirmDialog({
        title: `Delete all data for ${t.tenant_id}?`,
        description: "This permanently removes all authoring data for the tenant. This is irreversible.",
        confirmText: "Delete tenant",
        destructive: true,
      });
      if (!ok) return;
    }
    await adminTenantLifecycle(t.tenant_id, action);
    toast.success(`${t.tenant_id}: ${action}`);
    await reload();
  }
  async function sweep() {
    const r = await adminSweep();
    toast.success(r.actions.length ? `Applied ${r.actions.length} lifecycle transitions.` : "No lifecycle changes due.");
    await reload();
  }

  const needle = q.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!tenants) return null;
    return needle ? tenants.filter((t) => `${t.tenant_id} ${t.plan_id}`.toLowerCase().includes(needle)) : tenants;
  }, [tenants, needle]);

  if (!tenants) return <Loading />;
  const active = tenants.filter((t) => t.status === "active").length;
  const suspended = tenants.filter((t) => t.status !== "active").length;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Tenants" value={num(tenants.length)} />
        <StatTile label="Active" value={num(active)} dot={<StatusDot tone="success" />} />
        <StatTile label="Suspended / pending" value={num(suspended)} dot={<StatusDot tone={suspended ? "warning" : "muted"} />} />
      </div>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Tenants</CardTitle>
              <p className="text-sm text-muted-foreground">Adjust credits, entitlement overrides, and lifecycle.</p>
            </div>
            <Button variant="outline" onClick={sweep}><RefreshCw className="size-4" /> Run lifecycle sweep</Button>
          </div>
          {tenants.length > 0 && <SearchBox value={q} onChange={setQ} placeholder="Search tenants…" className="w-full sm:w-64" />}
        </CardHeader>
        <CardContent>
          {tenants.length === 0 ? (
            <EmptyState icon={Users} title="No tenants yet" description="Tenants appear here once workspaces sign up." className="border-0 bg-transparent py-8" />
          ) : visible && visible.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">No tenants match your search.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Tenant</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(visible ?? []).map((t) => {
                    const tone = TENANT_TONE[t.status] ?? "muted";
                    const isDemo = t.tenant_id === DEMO_TENANT_ID;
                    return (
                      <TableRow key={t.tenant_id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-semibold">{t.tenant_id}</span>
                            {isDemo ? <Pill tone="muted">demo · system</Pill> : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="flex items-center gap-1.5">
                            <span className="capitalize text-muted-foreground">{t.plan_id}</span>
                            {t.comp ? <Pill tone="info">comped</Pill> : null}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Pill tone={tone}><StatusDot tone={tone} /> <span className="capitalize">{t.status.replace(/_/g, " ")}</span></Pill>
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{num(t.balance)}</TableCell>
                        <TableCell>
                          <div className="flex shrink-0 justify-end gap-1.5">
                            <Button size="sm" variant="ghost" onClick={() => setOverridesFor(t.tenant_id)}>Overrides</Button>
                            <Button size="sm" variant="ghost" onClick={() => setCreditsFor(t)}>Credits</Button>
                            {isDemo ? null : t.status === "suspended"
                              ? <Button size="sm" variant="ghost" onClick={() => life(t, "reactivate")}>Reactivate</Button>
                              : <Button size="sm" variant="ghost" onClick={() => life(t, "suspend")}>Suspend</Button>}
                            {isDemo ? null : <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => life(t, "delete")}>Delete</Button>}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      {overridesFor && <OverridesModal tenantId={overridesFor} onClose={() => { setOverridesFor(null); reload(); }} />}
      <AdjustCreditsModal tenant={creditsFor} onClose={() => setCreditsFor(null)} onDone={reload} />
    </div>
  );
}

/* ---------------------------- Credit adjustment --------------------------- */
function AdjustCreditsModal({ tenant, onClose, onDone }: { tenant: AdminTenant | null; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState("1000");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (tenant) setAmount("1000"); }, [tenant]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!tenant) return;
    setSaving(true);
    try {
      await adminAdjustCredits(tenant.tenant_id, "add", Number(amount) || 0);
      toast.success(`Adjusted credits for ${tenant.tenant_id}.`);
      onDone();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={Boolean(tenant)} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Adjust credits</DialogTitle>
            <DialogDescription>
              Add credits to <span className="font-mono">{tenant?.tenant_id}</span>. Use a negative amount to remove.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>Amount</Label>
            <Input autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1.5 font-mono tabular-nums" />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Apply"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------- Entitlement overrides ------------------------- */

// Overrides cover every quota + feature the catalog knows (safety features are
// always-on, so they're excluded from the per-tenant gift editor).
const OVR_QUOTAS = QUOTA_CATALOG;
const OVR_FEATURES = FEATURE_CATALOG.filter((f) => !f.safety);

function OverridesModal({ tenantId, onClose }: { tenantId: string; onClose: () => void }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof adminGetTenantEntitlements>> | null>(null);
  // Local edit state: quotas as strings ("" = inherit), features tri-state,
  // grant string.
  const [q, setQ] = useState<Record<string, string>>({});
  const [f, setF] = useState<Record<string, "inherit" | "on" | "off">>({});
  const [grant, setGrant] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminGetTenantEntitlements(tenantId).then((d) => {
      setData(d);
      setQ(Object.fromEntries(OVR_QUOTAS.map((x) => [x.key, d.overrides.quotas?.[x.key] != null ? String(d.overrides.quotas![x.key]) : ""])));
      setF(Object.fromEntries(OVR_FEATURES.map((x) => [x.key, d.overrides.features?.[x.key] == null ? "inherit" : d.overrides.features[x.key] ? "on" : "off"])) as Record<string, "inherit" | "on" | "off">);
      setGrant(d.overrides.aiCredits?.monthlyGrant != null ? String(d.overrides.aiCredits.monthlyGrant) : "");
    }).catch(() => {});
  }, [tenantId]);

  async function save() {
    setSaving(true);
    const quotas: Record<string, number> = {};
    for (const { key } of OVR_QUOTAS) if (q[key]?.trim() !== "" && q[key] != null && !Number.isNaN(Number(q[key]))) quotas[key] = Math.trunc(Number(q[key]));
    const features: Record<string, boolean> = {};
    for (const { key } of OVR_FEATURES) if (f[key] === "on") features[key] = true; else if (f[key] === "off") features[key] = false;
    const overrides: { quotas?: Record<string, number>; features?: Record<string, boolean>; aiCredits?: { monthlyGrant: number } } = {};
    if (Object.keys(quotas).length) overrides.quotas = quotas;
    if (Object.keys(features).length) overrides.features = features;
    if (grant.trim() !== "" && !Number.isNaN(Number(grant))) overrides.aiCredits = { monthlyGrant: Math.trunc(Number(grant)) };
    await adminSetTenantOverrides(tenantId, overrides);
    setSaving(false);
    toast.success(`Overrides saved for ${tenantId}.`);
    onClose();
  }

  const planQ = data?.plan.quotas ?? {};
  const planGrant = data?.plan.aiCredits.monthlyGrant ?? 0;
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex max-h-[88dvh] flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Entitlement overrides</DialogTitle>
          <DialogDescription>
            Gift extra allowances on top of <b>{data?.planId ?? "…"}</b> for <span className="font-mono">{tenantId}</span>. Blank = inherit the plan (the plan value is shown as a hint). -1 = unlimited.
          </DialogDescription>
        </DialogHeader>
        {!data ? <Loading /> : (
          <>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
              <div className="space-y-2">
                <SectionLabel>Quotas</SectionLabel>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {OVR_QUOTAS.map((x) => (
                    <label key={x.key} className="flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-sm text-muted-foreground">
                      <span className="flex-1">{x.label}</span>
                      <Input value={q[x.key] ?? ""} onChange={(e) => setQ({ ...q, [x.key]: e.target.value })} placeholder={String(planQ[x.key] ?? 0)} className="h-8 w-20 text-right font-mono tabular-nums" />
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <SectionLabel>Features</SectionLabel>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {OVR_FEATURES.map((x) => (
                    <label key={x.key} className="flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-sm text-muted-foreground">
                      <span className="flex-1">{x.label}</span>
                      <Select value={f[x.key] ?? "inherit"} onValueChange={(v) => setF({ ...f, [x.key]: v as "inherit" | "on" | "off" })}>
                        <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="inherit">Inherit</SelectItem>
                          <SelectItem value="on">Grant on</SelectItem>
                          <SelectItem value="off">Force off</SelectItem>
                        </SelectContent>
                      </Select>
                    </label>
                  ))}
                </div>
              </div>
                            <label className="flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-sm text-muted-foreground">
                <span className="flex-1">Monthly AI credit grant</span>
                <Input value={grant} onChange={(e) => setGrant(e.target.value)} placeholder={String(planGrant)} className="h-8 w-24 text-right font-mono tabular-nums" />
              </label>
            </div>
            <DialogFooter className="border-t pt-3">
              <Button variant="ghost" onClick={() => { setQ(Object.fromEntries(OVR_QUOTAS.map((x) => [x.key, ""]))); setF(Object.fromEntries(OVR_FEATURES.map((x) => [x.key, "inherit"])) as Record<string, "inherit" | "on" | "off">); setGrant(""); }}>Clear all</Button>
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button disabled={saving} onClick={save}>{saving ? "Saving…" : "Save overrides"}</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

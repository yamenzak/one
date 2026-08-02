/**
 * THE OPERATOR CONSOLE, on its own door (`admin.tessa.4dl.app`).
 *
 * Until now this door rendered "no centre at this address": `pickScreen` had no
 * `admin` case, so it fell through to the tenant branch, found no tenant, and
 * showed the wrong-address screen — while `/api/admin/*` answered perfectly well
 * underneath. The console existed on the server and nowhere else.
 *
 * Standalone rather than a route inside the Shell, for two reasons:
 *
 *  1. **It must not require a centre.** The Shell scopes everything to an active
 *     workspace, and an operator need not be a member of any.
 *  2. **It is a separate origin.** `/api/admin/*` is refused on every host but
 *     this one, which is what stops an operator's session — valid across the
 *     whole root — carrying platform powers onto a centre's subdomain. Giving
 *     the console its own screen keeps the client honest about that boundary.
 *
 * The permission check is server-side on every call; this only decides what to
 * render for someone signed in who is not an operator.
 */

import { useCallback, useState } from "react";
import {
  AdminConsole as Console,
  PlatformEmailSection,
  PlatformMaintenanceSection,
  type ConsoleSection,
} from "@4dl/admin";
import { api, errorText } from "@4dl/app-kit";
import { Badge, Building2, Button, Card, CreditCard, Field, Group, LoadError, Mail, Row, SaveBar, Spinner, Wand2, Wrench, useAction, useLoad } from "@4dl/ui";
import { useSession } from "../session.js";

export function AdminDoor() {
  const { ctx, signOut } = useSession();

  if (!ctx) {
    // Signed out on the operator door. The sign-in form belongs here — this is
    // a platform door and the server will issue a code for it.
    return null;
  }

  if (!ctx.isPlatformAdmin) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-6 py-12">
        <Card className="space-y-3 p-6 text-center">
          <h1 className="text-body-lg">Not an operator account</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            You&rsquo;re signed in, but this address is the platform console. Your practice is at its own address.
          </p>
          <Button variant="secondary" className="w-full" onClick={() => void signOut()}>
            Sign out
          </Button>
        </Card>
      </div>
    );
  }
  return <AdminConsole />;
}

const SECTIONS: ConsoleSection[] = [
  { key: "centres", label: "Centres", blurb: "Every practice, its plan, credits and standing", icon: Building2, tone: "primary", render: () => <Centres /> },
  { key: "stripe", label: "Stripe", blurb: "Keys, the lane, and syncing the catalog", icon: CreditCard, tone: "soiled", render: () => <StripeConfig /> },
  /* Without `google.gemini_key` the vision model is unreachable, so reading a
     label — the feature most likely to be why a centre bought the plan — fails
     with "unavailable" on a deployment that otherwise looks healthy. */
  { key: "ai", label: "AI", blurb: "The Gemini key, the mock lane, and the model catalog", icon: Wand2, tone: "cycle", render: () => <AiConfig /> },
  /* `@4dl/admin`'s own: who a deployment sends mail as is the shared email
     package's subject, not Tessa's. */
  { key: "email", label: "Email delivery", blurb: "How this deployment sends mail", icon: Mail, tone: "primary", render: () => <PlatformEmailSection api={api} errorText={errorText} /> },
  { key: "maintenance", label: "Maintenance", blurb: "Put the platform in read-only, or close it entirely", icon: Wrench, tone: "danger", render: () => <PlatformMaintenanceSection api={api} errorText={errorText} /> },
];

/**
 * The console shell is router-free by design — a shared package that imported
 * one router could not be consumed by an app using a different one — so the open
 * key lives here, in component state rather than a query param: Tessa's console
 * is one screen deep and there is nothing behind it to step back to.
 */
function AdminConsole() {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Console
      sections={SECTIONS}
      openKey={open}
      onOpen={setOpen}
      onBack={() => history.length > 1 && history.back()}
      title="Platform admin"
      subtitle="Tessa itself — every practice, key and switch."
    />
  );
}

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  plan_id: string | null;
  status: string | null;
  past_due_at: string | null;
}

function Centres() {
  const load = useCallback(() => api.get<{ tenants: TenantRow[] }>("/api/admin/tenants"), []);
  const { data, error, loading, reload } = useLoad(load, "centres", errorText);
  const { busy, msg, err, run } = useAction(errorText);

  if (loading) return <Spinner />;
  if (error || !data) return <LoadError what="centres" error={error ?? "—"} onRetry={reload} />;

  return (
    <div className="space-y-3">
      {msg && <p className="px-1 text-sm text-success">{msg}</p>}
      {err && <p className="px-1 text-sm text-danger">{err}</p>}
      <Group>
        {data.tenants.map((t) => (
          <Row
            key={t.id}
            sub={`${t.slug} · ${t.plan_id ?? "no plan"}`}
            trailing={
              <div className="flex items-center gap-2">
                <Badge tone={t.status === "active" ? "success" : t.status === "past_due" ? "warning" : "neutral"}>{t.status ?? "—"}</Badge>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy === t.id}
                  onClick={() =>
                    void run(t.id, async () => {
                      // 2,000 credits — one month of the Practice grant. A
                      // support top-up should be a recognisable amount rather
                      // than a number somebody typed.
                      await api.post(`/api/admin/tenants/${t.id}/topup`, { credits: 2000 });
                      reload();
                      return `Credited ${t.name}.`;
                    })
                  }
                >
                  +2k credits
                </Button>
              </div>
            }
          >
            {t.name}
          </Row>
        ))}
      </Group>
    </div>
  );
}

function StripeConfig() {
  const load = useCallback(() => api.get<Record<string, unknown>>("/api/admin/stripe/status"), []);
  const { data, error, loading, reload } = useLoad(load, "Stripe status", errorText);
  const { busy, msg, err, run } = useAction(errorText);
  const [form, setForm] = useState({ secretKey: "", publishableKey: "", webhookSecret: "" });

  if (loading) return <Spinner />;
  if (error || !data) return <LoadError what="Stripe status" error={error ?? "—"} onRetry={reload} />;

  return (
    <Card className="space-y-4 p-4">
      <pre className="overflow-x-auto rounded-lg bg-surface-2 p-3 text-xs">{JSON.stringify(data, null, 2)}</pre>
      {/* Write-only. A console that renders a secret makes every screenshot and
          every screen-share a disclosure — so the fields start blank, and blank
          means "leave what is stored". */}
      <Field label="Secret key" placeholder="sk_… (blank keeps the stored one)" value={form.secretKey} onChange={(e) => setForm((f) => ({ ...f, secretKey: e.target.value }))} />
      <Field label="Publishable key" placeholder="pk_…" value={form.publishableKey} onChange={(e) => setForm((f) => ({ ...f, publishableKey: e.target.value }))} />
      <Field label="Webhook signing secret" placeholder="whsec_…" value={form.webhookSecret} onChange={(e) => setForm((f) => ({ ...f, webhookSecret: e.target.value }))} />
      <SaveBar
        label="Save keys"
        saving={busy === "keys"}
        msg={msg}
        err={err}
        onSave={() =>
          void run("keys", async () => {
            await api.post("/api/admin/stripe/config", form);
            setForm({ secretKey: "", publishableKey: "", webhookSecret: "" });
            reload();
            return "Saved.";
          })
        }
      />
      <Button
        variant="secondary"
        className="w-full"
        disabled={busy === "sync"}
        onClick={() =>
          void run("sync", async () => {
            const r = await api.post<{ plans: number; packs: number }>("/api/admin/stripe/sync", {});
            reload();
            return `Synced ${r.plans} plan(s) and ${r.packs} pack(s).`;
          })
        }
      >
        Sync catalog to Stripe
      </Button>
    </Card>
  );
}

function AiConfig() {
  const load = useCallback(
    () => api.get<{ geminiKeySet: boolean; mock: string; models: { id: string; label: string; task: string }[] }>("/api/admin/ai"),
    [],
  );
  const { data, error, loading, reload } = useLoad(load, "AI config", errorText);
  const { busy, msg, err, run } = useAction(errorText);
  const [key, setKey] = useState("");

  if (loading) return <Spinner />;
  if (error || !data) return <LoadError what="AI config" error={error ?? "—"} onRetry={reload} />;

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm">Gemini key</span>
          <Badge tone={data.geminiKeySet ? "success" : "danger"}>{data.geminiKeySet ? "set" : "missing"}</Badge>
        </div>
        {!data.geminiKeySet && (
          <p className="text-xs text-muted-foreground">
            Without it the vision model is unreachable and &ldquo;Read a label&rdquo; fails as unavailable — on a deployment that
            otherwise looks healthy.
          </p>
        )}
        <Field label="Set key" labelHidden placeholder="AIza… (blank keeps the stored one)" value={key} onChange={(e) => setKey(e.target.value)} />
        <SaveBar
          label="Save"
          saving={busy === "key"}
          dirty={key.trim().length > 0}
          msg={msg}
          err={err}
          onSave={() =>
            void run("key", async () => {
              await api.post("/api/admin/ai", { geminiKey: key.trim() });
              setKey("");
              reload();
              return "Saved.";
            })
          }
        />
      </Card>

      <Card className="space-y-2 p-4">
        <h3 className="text-sm font-medium">Models</h3>
        {data.models.length === 0 ? (
          <p className="text-xs text-muted-foreground">None seeded yet — they seed on the first AI call.</p>
        ) : (
          data.models.map((m) => (
            <div key={m.id} className="flex items-center justify-between text-xs">
              <span className="truncate">{m.label}</span>
              <Badge tone="neutral">{m.task}</Badge>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}

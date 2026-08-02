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
  PlatformAiSection,
  PlatformDomainsSection,
  PlatformEmailSection,
  PlatformMaintenanceSection,
  PlatformStripeSection,
  PlatformTurnstileSection,
  useConsoleSection,
  type ConsoleSection,
} from "@4dl/admin";
import { api, errorText } from "@4dl/app-kit";
import {
  Badge, Building2, Button, Card, CreditCard, Field, Globe, Group, LoadError, Mail, Reveal, Row, SaveBar,
  ShieldCheck, Skeleton, SkeletonLine, Spinner, Wand2, Wrench, useAction, useLoad,
} from "@4dl/ui";
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

/**
 * ── Five of these seven are `@4dl/admin`'s, and that is the point ───────────
 *
 * Only "Centres" and "AI" are Tessa's. Everything else configures something a
 * shared package owns — Stripe (`@4dl/billing`), custom domains
 * (`@4dl/tenancy`), the sign-in bot check (`@4dl/auth`), email (`@4dl/email`),
 * maintenance (`@4dl/tenancy`) — so the panel belongs with the package, not
 * here.
 *
 * Before this it did not. Tessa's Stripe "panel" was a `JSON.stringify` dump and
 * three text boxes, with no lane switch and no way to see which lane was live;
 * custom domains and the bot check had no panel at all, even though the
 * endpoints for both have answered since day one (`domainAdminRoutes` mounts
 * `turnstileAdminRoutes` inside it). A second app is what made that visible: the
 * same routes, configured well once and badly once.
 */
const SECTIONS: ConsoleSection[] = [
  { key: "centres", label: "Centres", blurb: "Every practice, its plan, credits and standing", icon: Building2, tone: "primary", render: () => <Centres /> },
  { key: "stripe", label: "Stripe", blurb: "Keys, the active lane, and syncing the catalog", icon: CreditCard, tone: "soiled", render: () => <PlatformStripeSection api={api} errorText={errorText} platformName="Tessa" /> },
  /* Without `google.gemini_key` the vision model is unreachable, so reading a
     label — the feature most likely to be why a centre bought the plan — fails
     with "unavailable" on a deployment that otherwise looks healthy. */
  {
    key: "ai", label: "AI", blurb: "The Gemini key, the mock lane, and the model catalog", icon: Wand2, tone: "cycle",
    render: () => (
      <PlatformAiSection
        api={api}
        errorText={errorText}
        lanes={[
          { task: "text", label: "Text", desc: "Pack notes, protocol drafts, summaries." },
          { task: "text-small", label: "Text (small)", desc: "Short factual jobs — catalog metadata." },
          { task: "vision", label: "Vision", desc: "Reading a sterilisation label or an IFU. Gemini only." },
          { task: "image", label: "Image", desc: "Generated illustrations." },
          { task: "speech", label: "Speech", desc: "Spoken output. Unused here." },
        ]}
      />
    ),
  },
  { key: "domains", label: "Custom domains", blurb: "Centre domains and their certificates", icon: Globe, tone: "case", render: () => <PlatformDomainsSection api={api} errorText={errorText} tenantNoun="centre" cnameExample="saas.4dl.app" /> },
  { key: "security", label: "Security", blurb: "The bot check on sign-in", icon: ShieldCheck, tone: "danger", render: () => <PlatformTurnstileSection api={api} errorText={errorText} /> },
  /* `@4dl/admin`'s own: who a deployment sends mail as is the shared email
     package's subject, not Tessa's. */
  { key: "email", label: "Email delivery", blurb: "How this deployment sends mail", icon: Mail, tone: "primary", render: () => <PlatformEmailSection api={api} errorText={errorText} /> },
  { key: "maintenance", label: "Maintenance", blurb: "Put the platform in read-only, or close it entirely", icon: Wrench, tone: "danger", render: () => <PlatformMaintenanceSection api={api} errorText={errorText} /> },
];

/**
 * The console shell is router-free by design — a shared package that imported
 * one router could not be consumed by an app using a different one.
 *
 * This used to bind the open key to `useState`, which compiles, looks right, and
 * means every section lives at the same address: Back left the console from
 * three levels deep, no section could be linked or bookmarked, and a reload
 * always landed on the index. `useConsoleSection` is the package's own binding
 * over the History API, so the next app gets that behaviour by default instead
 * of having to know to write it.
 */
function AdminConsole() {
  const { openKey, onOpen } = useConsoleSection();
  return (
    <Console
      sections={SECTIONS}
      openKey={openKey}
      onOpen={onOpen}
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

/**
 * A row skeleton that matches the row it replaces.
 *
 * A bare `<Spinner />` is not a loading state, it is the absence of one: the
 * layout jumps when content arrives, and a spinner in the middle of an empty
 * page says "something is happening somewhere" rather than "a list is coming".
 * Kova's console has never used one; Tessa's used them everywhere, which is most
 * of what "it doesn't feel as finished" turned out to mean.
 */
function RowsSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <Card className="space-y-1">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-2.5 py-2.5">
          <div className="min-w-0 flex-1 space-y-1.5">
            <SkeletonLine w="45%" h="text" />
            <SkeletonLine w="30%" h="xs" />
          </div>
          <Skeleton className="h-6 w-16 shrink-0 rounded-full" />
        </div>
      ))}
    </Card>
  );
}

function Centres() {
  const load = useCallback(() => api.get<{ tenants: TenantRow[] }>("/api/admin/tenants"), []);
  const { data, error, loading, reload } = useLoad(load, "centres", errorText);
  const { busy, msg, err, run } = useAction(errorText);

  if (loading) return <RowsSkeleton />;
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

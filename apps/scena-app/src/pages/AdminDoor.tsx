/**
 * THE OPERATOR CONSOLE, on its own door (`admin.scena.4dl.app`).
 *
 * ── What this replaces, and why it was broken ──────────────────────────────
 *
 * `Admin.tsx` rendered a seven-tab page at `/admin` INSIDE the studio Shell, on
 * whatever host the operator happened to be on. Stage 3 restricted
 * `/api/admin/*` to the `admin.` door — so in production that route rendered
 * 1,448 lines of console and then **404'd on every single call**. It is the
 * exact failure CLAUDE.md records Kova having and removing, and it is invisible
 * in dev, where one root means the guard correctly stands down (`isDevRoot`).
 *
 * Standalone rather than a Shell route, for two reasons:
 *
 *  1. **It must not require a workspace.** The Shell scopes everything to an
 *     active workspace, and a platform operator need not be a member of any.
 *  2. **It is a separate origin.** The session cookie is valid across the whole
 *     root, so without a separate door an operator's session would carry
 *     platform powers onto every workspace subdomain they visited. Giving the
 *     console its own screen keeps the client honest about that boundary
 *     instead of implying the console is reachable from inside a workspace.
 *
 * The permission check is server-side on every call; this only decides what to
 * render for someone signed in who is not an operator.
 *
 * ── The seven tabs became sections ─────────────────────────────────────────
 *
 * A `TabsList` puts every tab's content one scroll apart and the rest behind it.
 * Kova's console proved the cost the expensive way — its first tab measured
 * 61,541px on a seeded install, with the other six invisible below it — which is
 * why `@4dl/admin` ships an index and a page per section instead. Scena's tabs
 * had the same shape: "Tenants" lists every workspace, "Public library" every
 * track.
 *
 * Six of the sections below are now the PLATFORM's panels rather than Scena's
 * code: email delivery, the shared config store, maintenance, custom domains,
 * Turnstile, and the Stripe rail's dead letter. The last of those is new
 * surface — Stage 4b gave Scena the parking table and nothing that could read
 * one back.
 */

import { useCallback } from "react";
import {
  AdminConsole,
  PlatformAiSection,
  PlatformDomainsSection,
  PlatformEmailSection,
  PlatformMaintenanceSection,
  PlatformRailSection,
  PlatformPlansSection,
  PlatformSharedConfigSection,
  PlatformStripeSection,
  PlatformTurnstileSection,
  useConsoleSection,
  type AdminApi,
  type ConsoleSection,
} from "@4dl/admin";
import { Button, Card } from "@4dl/ui";
import { AlertTriangle, CreditCard, Globe, Mail, Music, Package, ShieldCheck, SlidersHorizontal, Sparkles, Tag, Users, Wallet, Wrench } from "lucide-react";
import { API_BASE, apiError, apiFetch } from "../api.js";
import { DangerTab, LibraryTab, PromosTab, ScenaSettingsTab, TenantsTab } from "./Admin.js";

/**
 * The three verbs `@4dl/admin`'s panels need, over Scena's fetch conventions.
 *
 * Injected rather than imported by the package, because how an app talks to its
 * own worker — base URL, credentials, error shape — is the app's business and a
 * shared panel that assumed one could not be consumed by an app with another.
 */
const send = async <T,>(method: string, path: string, body?: unknown): Promise<T> => {
  // `apiFetch`, not `fetch` — the operator console is the surface most likely to
  // be left open on a second monitor overnight, so it is the one where an
  // expired session most needs to say so rather than render every panel empty.
  const res = await apiFetch(`${API_BASE}/api${path}`, {
    method,
    ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  });
  if (!res.ok) throw await apiError(res, `${method} ${path} failed`);
  return (await res.json().catch(() => ({}))) as T;
};

const api: AdminApi = {
  get: <T,>(path: string) => send<T>("GET", path),
  post: <T,>(path: string, body?: unknown) => send<T>("POST", path, body),
  patch: <T,>(path: string, body?: unknown) => send<T>("PATCH", path, body),
  // `del`, not `delete` — the shared-config panel hands a key back to the
  // platform store by removing this app's override, and a blank row would be
  // one a future reader has to reason about.
  del: <T,>(path: string) => send<T>("DELETE", path),
};

/** What a panel shows when a write is refused. */
const errorText = (e: unknown): string => (e instanceof Error ? e.message : "That didn’t go through.");

const deps = { api, errorText };

/**
 * ⚠️ ORDER IS THE INDEX'S READING ORDER, so it goes from the thing an operator
 * touches weekly to the thing they touch once. `danger` is last for the obvious
 * reason and carries the only `danger` tone in the list.
 */
function sections(): ConsoleSection[] {
  return [
    {
      /*
        `@4dl/admin`'s panel. The one it replaces was three panels wearing one
        coat: Stripe credentials, an EMAIL form duplicating the "Email delivery"
        section three rows below it, and the Gemini key. The shared one is two
        LANES (test/live) with the mismatch alarm and the catalog-id stash,
        where Scena's had one flat set of keys and no way to tell an operator
        the stored catalog belonged to the other lane.
      */
      key: "stripe",
      label: "Stripe",
      blurb: "Keys, webhooks, and what is synced",
      icon: CreditCard,
      tone: "primary",
      render: () => <PlatformStripeSection {...deps} platformName="Scena" />,
    },
    {
      /*
        `@4dl/admin`'s panel now, not Scena's.

        The one it replaces edited two numbers inline and opened a modal for the
        rest, and it had no GRANDFATHERING: tightening a tier took the capability
        away from every workspace already on it, immediately, and the help text
        said so as though it were the design. It also could not edit the free
        TRIAL, which is what actually replaced the free tier here.
      */
      key: "plans",
      label: "Plans",
      blurb: "The four tiers — price, quotas, features, the credit grant and the trial",
      icon: Package,
      render: () => <PlatformPlansSection {...deps} tenantNoun="workspace" />,
    },
    {
      /*
        `@4dl/admin`'s panel, over `@4dl/ai`'s `aiCatalogAdminRoutes`.
        `ai_models` has been the package's store since `AI_SCHEMA` became entry
        seven of `SCHEMA_MODULES`; this is the surface catching up with it, and
        it is what puts Scena on the "apply to every 4DL app" broadcast — the
        entire reason the shared selection exists, and which it could neither
        send nor receive while it had its own screen.

        ⚠️ FOUR lanes, matching `configureAiLanes` in `billing-seed.ts` — no
        `vision` and no `text-small`, because Scena's floor has no row in
        either and a lane with nothing pickable is a picker that reads as
        broken. `tts` covers Gemini's `speech` models too: `lanesFor` unifies
        the two names server-side, which is the one thing a catalog carrying
        both providers gets wrong on its own.
      */
      key: "models",
      label: "AI models",
      blurb: "The catalog Scena meters against — rates, markup, and what is switched on",
      icon: Sparkles,
      render: () => (
        <PlatformAiSection
          {...deps}
          lanes={[
            { task: "text", label: "Text", desc: "Slide copy, and the widget layouts the builder generates." },
            { task: "image", label: "Image", desc: "Generated slide backgrounds, ad creative and track art." },
            { task: "tts", label: "Speech", desc: "Voice-over clips for a slide or an announcement." },
            { task: "music", label: "Music", desc: "Generated background beds for a playlist." },
          ]}
        />
      ),
    },
    {
      key: "library",
      label: "Public library",
      blurb: "Licensed tracks every workspace can draw from",
      icon: Music,
      render: () => <LibraryTab />,
    },
    {
      key: "promos",
      label: "Promo codes",
      blurb: "Platform-scope codes against plans and credit packs",
      icon: Tag,
      render: () => <PromosTab />,
    },
    {
      key: "tenants",
      label: "Workspaces",
      blurb: "Every workspace, its standing, its credits and its per-tenant overrides",
      icon: Users,
      render: () => <TenantsTab />,
    },
    // ── the platform's own panels ────────────────────────────────────────────
    {
      key: "email",
      label: "Email delivery",
      blurb: "Provider, both senders, and what a send costs",
      icon: Mail,
      render: () => <PlatformEmailSection {...deps} />,
    },
    {
      key: "shared-config",
      label: "Shared platform config",
      blurb: "The keys every 4DL app reads — set once, not once per product",
      icon: ShieldCheck,
      render: () => <PlatformSharedConfigSection {...deps} />,
    },
    {
      key: "domains",
      label: "Custom domains",
      blurb: "Cloudflare for SaaS: token, zone, CNAME target",
      icon: Globe,
      render: () => <PlatformDomainsSection {...deps} />,
    },
    {
      key: "turnstile",
      label: "Bot check",
      blurb: "Turnstile on sign-in — including the combination that locks everybody out",
      icon: ShieldCheck,
      render: () => <PlatformTurnstileSection {...deps} />,
    },
    {
      key: "rail",
      label: "Unattributed payments",
      blurb: "Stripe events the rail could not match to an app — money in, nothing granted",
      icon: Wallet,
      tone: "warning",
      render: () => <PlatformRailSection {...deps} />,
    },
    {
      /*
        What is left of the old "Stripe & config" form once the three shared
        panels took their halves: Scena's own two-rung dunning windows (it does
        not run `@4dl/billing`'s four-rung ladder — see the audit's step 5) and
        the platform OpenWeather key, which no other product has.
      */
      key: "scena",
      label: "Scena settings",
      blurb: "Dunning windows and the platform weather key",
      icon: SlidersHorizontal,
      render: () => <ScenaSettingsTab />,
    },
    {
      key: "maintenance",
      label: "Maintenance",
      blurb: "Close the whole deployment: read-only, or fully",
      icon: Wrench,
      tone: "warning",
      render: () => <PlatformMaintenanceSection {...deps} />,
    },
    {
      key: "danger",
      label: "Danger zone",
      blurb: "The factory reset — every workspace, every file, gone",
      icon: AlertTriangle,
      tone: "danger",
      render: () => <DangerTab />,
    },
  ];
}

export function AdminDoor({ isAdmin }: { isAdmin: boolean }) {
  /**
   * The open section lives in the URL, over the History API rather than a
   * router. `useState` compiles and looks right and means every section shares
   * one address: back leaves the console from three levels deep, nothing can be
   * linked or bookmarked, and a reload always lands on the index. That is the
   * mistake `@4dl/admin`'s README names, and it is four lines nobody wrote.
   */
  const { openKey, onOpen } = useConsoleSection();
  // Nothing sits behind the console on this door, so `back` closes the tab's
  // own history entry if there is one and otherwise does nothing — rather than
  // navigating somewhere that 404s.
  const onBack = useCallback(() => {
    if (history.length > 1) history.back();
  }, []);

  if (!isAdmin) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-6 py-12">
        <Card className="space-y-3 p-6 text-center">
          <h1 className="text-body-lg">Not an operator account</h1>
          <p className="text-body leading-relaxed text-muted-foreground">
            You’re signed in, but this address is the platform console. Your workspace is at its own address.
          </p>
          <Button variant="secondary" className="w-full" onClick={() => { window.location.href = "/"; }}>
            Go back
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <AdminConsole
      sections={sections()}
      openKey={openKey}
      onOpen={onOpen}
      onBack={onBack}
      title="Platform admin"
      subtitle="Scena’s catalog, its workspaces, and the platform they run on"
    />
  );
}

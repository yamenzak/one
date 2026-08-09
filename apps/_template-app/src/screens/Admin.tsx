/**
 * THE OPERATOR CONSOLE, on its own door (`admin.<app>.4dl.app`).
 *
 * Standalone rather than a route inside the Shell, for two reasons:
 *
 *  1. **It must not require a tenant.** The Shell scopes everything to an active
 *     tenant, and a platform operator need not be a member of any.
 *  2. **It is a separate ORIGIN.** `/api/admin/*` is refused on every host but
 *     this one, which is what stops an operator's session — valid across the
 *     whole root — carrying platform powers onto a tenant's subdomain. Giving
 *     the console its own screen keeps the client honest about that boundary.
 *
 * ⚠️ Both other apps once rendered this console at `/admin` INSIDE the tenant
 * Shell, on any host. In production that drew the whole thing and then 404'd on
 * every call, because the routes answer on the operator door only. It is
 * invisible in dev, where one root means the door check correctly stands down.
 *
 * The permission check is server-side on every call; this only decides what to
 * render for somebody signed in who is not an operator.
 */

import {
  AdminConsole as Console,
  PlatformAiSection,
  PlatformDomainsSection,
  PlatformEmailSection,
  PlatformMaintenanceSection,
  PlatformPlansSection,
  PlatformRailSection,
  PlatformSharedConfigSection,
  PlatformStripeSection,
  PlatformTurnstileSection,
  useConsoleSection,
  type ConsoleSection,
} from "@4dl/admin";
import { api, errorText } from "@4dl/app-kit";
import { Button, Card, CreditCard, Globe, LayoutGrid, Mail, ShieldCheck, Wallet, Wand2, Wrench } from "@4dl/ui";
import { useSession } from "../session.js";

export function AdminDoor() {
  const { ctx, signOut } = useSession();
  if (!ctx) return null; // signed out — `pickScreen` renders the login instead

  if (!ctx.isPlatformAdmin) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-6 py-12">
        <Card className="space-y-3 p-6 text-center">
          <h1 className="text-body-lg">Not an operator account</h1>
          <p className="text-body leading-relaxed text-muted-foreground">
            You&rsquo;re signed in, but this address is the platform console. Your workspace is at its own address.
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
 * ⚠️ **EVERY SECTION HERE IS `@4dl/admin`'s, AND THAT IS THE POINT.**
 *
 * A new app's console starts complete: Stripe, plans, the AI catalog, custom
 * domains, the bot check, email, shared config, the rail's dead letter and
 * maintenance are all configuration a shared PACKAGE owns, identical in every
 * product. The app's own sections go beside them.
 *
 * Do not rebuild one of these. `admin-panels.conformance.test.ts` fails an app
 * that reaches a shared admin endpoint directly, naming the section it should
 * have used — because the honour system failed exactly once and that was enough:
 * one app built good surfaces over three shared endpoints, and the next, facing
 * the same three, shipped a `JSON.stringify` dump over one and nothing at all
 * over the other two. Neither could see the problem from the inside.
 *
 * **If a shared section is missing something, add it to the section.** The
 * tempting alternative — one more local copy, just for this app — is how two
 * consoles diverged in the first place.
 *
 * `group` and `tone` are cosmetic and worth setting: the console renders an
 * index, and a flat list of ten is a list nobody scans.
 */
const SECTIONS: ConsoleSection[] = [
  {
    group: "Tenants & money",
    key: "plans",
    label: "Plans",
    blurb: "Price, limits, the credit grant and the free trial",
    icon: LayoutGrid,
    tone: "primary",
    render: () => <PlatformPlansSection api={api} errorText={errorText} tenantNoun="workspace" />,
  },
  {
    group: "Tenants & money",
    key: "stripe",
    label: "Stripe",
    blurb: "Keys, the active lane, and syncing the catalog",
    icon: CreditCard,
    tone: "record",
    render: () => <PlatformStripeSection api={api} errorText={errorText} platformName="Template" />,
  },
  /*
    The Stripe rail's DEAD LETTER. One account serves every 4DL app, so an event
    that matched no product is the platform's problem rather than this app's —
    and it means money was captured with nothing granted. The rail parks these
    from the day it ships; without this panel nothing can read one back, which is
    the same silent success the parking table exists to replace.
  */
  {
    group: "Tenants & money",
    key: "rail",
    label: "Unattributed payments",
    blurb: "Stripe events that matched no app — money in, nothing granted",
    icon: Wallet,
    tone: "danger",
    render: () => <PlatformRailSection api={api} errorText={errorText} />,
  },
  {
    group: "This deployment",
    key: "ai",
    label: "AI",
    blurb: "The provider key, the mock lane, and the model catalog",
    icon: Wand2,
    tone: "subject",
    /*
      ⚠️ NAME ONLY THE LANES THE APP'S MODEL FLOOR HAS ROWS FOR. A lane with
      nothing pickable is a picker that reads as broken, and the default set is
      Kova's — which has no music and no poster model in it.
    */
    render: () => (
      <PlatformAiSection
        api={api}
        errorText={errorText}
        lanes={[
          { task: "text", label: "Text", desc: "Long-form generation." },
          { task: "text-small", label: "Text (small)", desc: "Short factual jobs and metadata." },
          { task: "vision", label: "Vision", desc: "Reading images. Gemini only." },
          { task: "image", label: "Image", desc: "Generated images." },
        ]}
      />
    ),
  },
  {
    group: "This deployment",
    key: "email",
    label: "Email delivery",
    blurb: "How this deployment sends mail",
    icon: Mail,
    tone: "primary",
    render: () => <PlatformEmailSection api={api} errorText={errorText} />,
  },
  /*
    The SHARED store: one value, read by every 4DL app. It sits BESIDE the
    per-app panels rather than replacing them, because the two answer different
    questions — "what does the platform use" and "what does THIS app use
    instead". A save here reaches every product, which is why its panel is the
    only settings surface in the console that confirms first.
  */
  {
    group: "This deployment",
    key: "platform",
    label: "Shared platform config",
    blurb: "Keys every 4DL app reads — set once, not once per product",
    icon: Globe,
    tone: "subject",
    render: () => <PlatformSharedConfigSection api={api} errorText={errorText} />,
  },
  {
    group: "This deployment",
    key: "domains",
    label: "Custom domains",
    blurb: "Tenant domains and their certificates",
    icon: Globe,
    tone: "record",
    render: () => <PlatformDomainsSection api={api} errorText={errorText} tenantNoun="workspace" cnameExample="saas.4dl.app" />,
  },
  {
    group: "Operations",
    key: "security",
    label: "Security",
    blurb: "The bot check on sign-in",
    icon: ShieldCheck,
    tone: "danger",
    render: () => <PlatformTurnstileSection api={api} errorText={errorText} />,
  },
  {
    group: "Operations",
    key: "maintenance",
    label: "Maintenance",
    blurb: "Put the platform in read-only, or close it entirely",
    icon: Wrench,
    tone: "danger",
    render: () => <PlatformMaintenanceSection api={api} errorText={errorText} />,
  },
];

/**
 * The console shell is ROUTER-FREE by design — a shared package that imported
 * one router could not be consumed by an app using a different one.
 *
 * ⚠️ Bind the open key with `useConsoleSection`, not `useState`. `useState`
 * compiles, looks right, and means every section lives at the same address: Back
 * leaves the console from three levels deep, nothing can be linked or
 * bookmarked, and a reload always lands on the index. The package's own binding
 * over the History API is four lines nobody wrote.
 */
function AdminConsole() {
  const { openKey, onOpen } = useConsoleSection();
  return (
    <Console
      sections={SECTIONS}
      openKey={openKey}
      onOpen={onOpen}
      /* Nothing sits behind the console on this door, so `back` closes the tab's
         own history entry if there is one and otherwise does nothing — rather
         than navigating somewhere that 404s. */
      onBack={() => { if (history.length > 1) history.back(); }}
      title="Platform admin"
      subtitle="Every tenant, and the platform they run on"
    />
  );
}

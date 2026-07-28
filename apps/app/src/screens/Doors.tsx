/**
 * The screens for hosts that are not a studio's app.
 *
 * Three of them, and the distinction between them matters because each answers a
 * different question the visitor actually has:
 *
 *   RootSignpost  `kova.4dl.app` — "this isn't anybody's studio". Deliberately not
 *                 a login: signing in here would have no tenancy to sign in to, and
 *                 the server refuses to send a code (see otp-guard). If the visitor
 *                 happens to be signed in — the session cookie covers the whole
 *                 root — it hands them their studios instead of a dead end.
 *   NoStudio      `whoever.kova.4dl.app` where no studio owns that slug. A login
 *                 here would invite someone to sign in to a place that does not
 *                 exist, and would leak nothing useful either way.
 *   WrongDoor     a reserved or too-deeply-nested host under our root. Serves
 *                 nothing and says nothing about what is here.
 */

import { motion } from "motion/react";
import { ArrowRight, Building2, Card, IconBadge, MapPin, Store } from "@mossa/ui";
import { studioUrl, useSession } from "../session.js";

/** Shared frame: centred column, soft brand glow, one gentle reveal. */
function Doorway({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 overflow-hidden px-6 py-12">
      <div aria-hidden className="pointer-events-none absolute -top-32 left-1/2 size-72 -translate-x-1/2 rounded-full bg-primary/20 blur-[100px]" />
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="relative space-y-6">
        {children}
      </motion.div>
    </div>
  );
}

/**
 * The root: a signpost, and — for someone already signed in — the way to their
 * studios.
 *
 * The studio list here is not a convenience, it is the reason this screen is not a
 * plain 404. The installed PWA's `start_url` is `/`, links get shared, and the root
 * is the address people guess; every one of those arrivals used to land on a page
 * about the product with no route back into their own studio.
 */
export function RootSignpost() {
  const { ctx, host } = useSession();
  const root = host?.rootDomain ?? location.hostname;
  const personas = ctx?.personas ?? [];

  return (
    <Doorway>
      <header className="text-center">
        <div className="mx-auto mb-5 grid size-16 place-items-center rounded-3xl bg-primary text-2xl font-black text-primary-foreground shadow-glow">M</div>
        <h1 className="text-[1.75rem] font-bold leading-tight tracking-tight">Every studio has its own address</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          There&rsquo;s no app at <span className="text-foreground">{root}</span> itself. Your studio lives at its own
          address — <span className="text-foreground">yourstudio.{root}</span>, or the domain it uses.
        </p>
      </header>

      {personas.length > 0 ? (
        <Card className="space-y-3 p-6">
          <div className="flex items-center gap-2.5">
            <IconBadge icon={Store} tone="primary" size="sm" />
            <h2 className="font-semibold tracking-tight">{personas.length === 1 ? "Your studio" : "Your studios"}</h2>
          </div>
          <div className="space-y-1">
            {personas.map((p) => (
              <a
                key={p.tenantId}
                href={studioUrl(p.tenantSlug, root)}
                className="flex min-h-12 items-center gap-3 rounded-2xl p-3 transition-colors hover:bg-secondary"
              >
                <span aria-hidden className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-2xl bg-primary/15 text-base font-bold text-primary">
                  {p.iconUrl || p.logoUrl ? <img src={p.iconUrl || p.logoUrl || ""} alt="" className="size-full object-cover" /> : p.tenantName.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold tracking-tight">{p.tenantName}</span>
                  <span className="block truncate text-xs text-muted-foreground">{p.tenantSlug}.{root}</span>
                </span>
                <ArrowRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              </a>
            ))}
          </div>
        </Card>
      ) : (
        <Card className="space-y-3.5 p-6">
          <div className="flex items-center gap-2.5">
            <IconBadge icon={MapPin} tone="activity" size="sm" />
            <h2 className="font-semibold tracking-tight">Training with a coach?</h2>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Use the link your coach sent you — look for <span className="text-foreground">&ldquo;your space is ready&rdquo;</span> in
            your email. It opens your studio&rsquo;s own sign-in page, where a one-time code lands in your inbox.
          </p>
        </Card>
      )}

      <Card className="space-y-3.5 p-6">
        <div className="flex items-center gap-2.5">
          <IconBadge icon={Building2} tone="primary" size="sm" />
          <h2 className="font-semibold tracking-tight">Run a coaching business?</h2>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Start a studio and pick its address. Solo and Light include 30 days free.
        </p>
        <a
          href={host?.setupUrl ?? "/"}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          Set up your studio <ArrowRight aria-hidden className="size-4" />
        </a>
      </Card>
    </Doorway>
  );
}

/**
 * A well-formed studio address with no studio behind it.
 *
 * Kept distinct from a login on purpose. Rendering the OTP form here would ask
 * someone to sign in to a studio that does not exist, and any code they requested
 * would arrive with nowhere to go.
 */
export function NoStudio() {
  const { host } = useSession();
  const root = host?.rootDomain ?? location.hostname;
  return (
    <Doorway>
      <header className="text-center">
        <div className="mx-auto mb-5 grid size-16 place-items-center rounded-3xl bg-secondary text-2xl font-black text-muted-foreground">?</div>
        <h1 className="text-[1.75rem] font-bold leading-tight tracking-tight">No studio at this address</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          <span className="text-foreground">{location.hostname}</span> isn&rsquo;t a studio. Check the link your coach sent
          you — the address may have changed, or there may be a typo in it.
        </p>
      </header>
      <Card className="space-y-3.5 p-6">
        <p className="text-sm leading-relaxed text-muted-foreground">
          If you run this studio and just changed its address, the old one stops working straight away. Your clients need the
          new link.
        </p>
        <a
          href={host?.setupUrl ?? `https://setup.${root}`}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-secondary px-4 font-semibold transition-colors hover:bg-secondary/70"
        >
          Studio setup <ArrowRight aria-hidden className="size-4" />
        </a>
      </Card>
    </Doorway>
  );
}

/** A reserved or over-nested host under our root. Serves nothing, says nothing. */
export function WrongDoor() {
  return (
    <Doorway>
      <header className="text-center">
        <h1 className="text-[1.75rem] font-bold leading-tight tracking-tight">Nothing here</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">This address doesn&rsquo;t serve anything.</p>
      </header>
    </Doorway>
  );
}

/**
 * The platform host's front door for an UNAUTHENTICATED visitor at `/`.
 *
 * Why this screen exists instead of the OTP form that used to live here: on
 * `mossa.4dl.app/` the same "Continue with email" card was shown to everyone, so
 * a client of a studio who landed on the platform host — a shared screenshot, a
 * guess at the URL, an app-store-style search — signed up under **Mossa** rather
 * than under their coach. That produces an account with no coach, no plan and no
 * data, in the wrong tenant, and the person has no way to tell that anything went
 * wrong. Converting that visitor into a redirect ("use the link your coach sent
 * you") is the entire point of this page.
 *
 * What it must NOT do:
 *  • It must not appear on a tenant surface. A custom domain or `/t/<slug>` keeps
 *    its branded login — that IS the end-user door (see main.tsx).
 *  • It must not lock staff out. The installed PWA's `start_url` is `/`, so a
 *    signed-out owner opening their app lands here; the low-emphasis "Sign in"
 *    link at the bottom is their way through, and it is deliberately quiet so it
 *    doesn't read as a signup call-to-action.
 */

import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { Button, Card, IconBadge, ArrowRight, Building2, LogIn, Mail, ShieldCheck } from "@mossa/ui";
import { SIGN_IN_PATH } from "./paths.js";

/** The marketing site (`apps/www`, worker `mossa-www`). Absolute on purpose:
 *  it is a different origin, not an in-app route. */
const MARKETING_URL = "https://getmossa.4dl.app";

export function PlatformGate() {
  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 overflow-hidden px-6 py-12">
      <div aria-hidden className="pointer-events-none absolute -top-32 left-1/2 size-72 -translate-x-1/2 rounded-full bg-primary/20 blur-[100px]" />

      <motion.header initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="relative text-center">
        <div className="mx-auto mb-5 grid size-16 place-items-center rounded-3xl bg-primary text-2xl font-black text-primary-foreground shadow-glow">M</div>
        <h1 className="text-[1.75rem] font-bold leading-tight tracking-tight">The platform coaches run their business on</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Mossa is where personal trainers and studios build plans, track clients and get paid. It isn't where clients sign up —
          each studio has its own door.
        </p>
      </motion.header>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.08 }} className="relative">
        <Card className="space-y-3.5 p-6">
          <div className="flex items-center gap-2.5">
            <IconBadge icon={Mail} tone="activity" size="sm" />
            <h2 className="font-semibold tracking-tight">Training with a coach?</h2>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Use the link your coach sent you — look for <span className="text-foreground">“your space is ready”</span> in your email. It
            opens your studio's own sign-in page, where a one-time code lands in your inbox.
          </p>
          <div className="flex items-start gap-2 rounded-2xl bg-secondary p-3 text-xs leading-relaxed text-muted-foreground">
            <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>
              Signing up here would create an empty account on Mossa itself, not with your coach. If you can't find the link, ask them
              to send it again — it takes them one tap.
            </span>
          </div>
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.16 }} className="relative">
        <Card className="space-y-3.5 p-6">
          <div className="flex items-center gap-2.5">
            <IconBadge icon={Building2} tone="primary" size="sm" />
            <h2 className="font-semibold tracking-tight">Run a coaching business?</h2>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            See what Mossa does, what it costs, and start a studio — Solo and Light include 30 days free.
          </p>
          <Button size="lg" className="w-full" asChild>
            <a href={MARKETING_URL}>
              Explore Mossa <ArrowRight />
            </a>
          </Button>
        </Card>
      </motion.div>

      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="relative text-center text-sm text-muted-foreground">
        Already have a Mossa account?{" "}
        <Link to={SIGN_IN_PATH} className="inline-flex min-h-12 items-center gap-1.5 font-medium text-foreground underline-offset-4 hover:underline">
          Sign in <LogIn aria-hidden className="size-3.5" />
        </Link>
      </motion.p>
    </div>
  );
}

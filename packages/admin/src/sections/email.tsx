/**
 * PLATFORM EMAIL — the deployment's own outbound mail.
 *
 * ── Why this panel exists at all ────────────────────────────────────────────
 *
 * `GET /admin/email` and `POST /admin/email` had shipped and worked for months
 * with **no caller anywhere in the app**. The consequence was in Kova's deploy
 * guide as a manual step: a fresh deployment cannot send a single email —
 * including the sign-in code, which is the only way in on a passwordless
 * platform — until somebody opens D1 and writes `email.provider` and
 * `email.from` by hand. The provider fails closed outside development, and
 * correctly so; the missing part was ever being able to set it.
 *
 * A configuration value that the product refuses to run without, and offers no
 * way to supply, is not configuration. It is a broken install with a runbook.
 *
 * ── What each control actually does ─────────────────────────────────────────
 *
 * `provider` is the DELIVERY MECHANISM for the whole deployment, and the three
 * values are not interchangeable:
 *
 *   cloudflare  the real one. Requires a verified `send_email` binding.
 *   mock        logs instead of sending. Development only — the server refuses
 *               to treat it as configured outside a dev environment, so
 *               selecting it in production means "email is off", loudly.
 *   disabled    off on purpose.
 *
 * `from` is the platform's own sender. `platformFrom` is the address tenants on
 * the shared lane send AS — a different thing, which is why both exist: the
 * first carries password-free sign-in codes for the operator's own product, the
 * second carries a tenant's mail and appears to that tenant's customers.
 *
 * `creditsPerEmail` prices the shared lane. Zero switches metering off; it does
 * not switch sending off.
 */

import { useCallback, useState } from "react";
import {
  Card, ConfigRow, Field, FieldGroup, LoadError, Reveal, SaveBar, SegmentedControl, Skeleton, SkeletonLine,
  Stagger, useAction, useLoad,
} from "@4dl/ui";
import type { AdminDeps } from "../deps.js";

interface EmailConfig {
  provider: string;
  from: string;
  platformFrom: string;
  creditsPerEmail: number;
}

const PROVIDERS = [
  { value: "cloudflare", label: "Send" },
  { value: "mock", label: "Log only" },
  { value: "disabled", label: "Off" },
];

/** A sender the MIME builder can actually use: `Name <a@b.c>` or a bare address. */
const senderOk = (s: string) => /^[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+$/.test(s.trim()) || /^[^<>]+<[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+>$/.test(s.trim());

/**
 * The loading state, shaped like the card it becomes.
 *
 * This panel used to render `null` while the fetch was in flight, so opening it
 * on a cold worker showed an empty console for as long as D1 took — which reads
 * as "this section is broken", the one impression an operator must never get
 * from the screen that tells them whether email works. A skeleton says "loading"
 * without saying anything about the configuration.
 */
function EmailSkeleton() {
  return (
    <Card className="space-y-4">
      <div className="flex items-start gap-2.5">
        <Skeleton className="mt-0.5 size-4 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <SkeletonLine w="8rem" />
          <SkeletonLine w="85%" h="xs" />
        </div>
        <SkeletonLine w="3.5rem" h="xs" className="mt-1" />
      </div>
      {[10, 18, 8].map((h, i) => (
        <div key={i} className="space-y-2.5">
          <SkeletonLine w="5rem" h="xs" />
          <SkeletonLine w={`${h}rem`} h="xs" />
          <Skeleton className="h-11 rounded-xl" />
        </div>
      ))}
      <Skeleton className="h-12 rounded-xl" />
    </Card>
  );
}

export function PlatformEmailSection({ api, errorText }: AdminDeps) {
  const load = useCallback(() => api.get<EmailConfig>("/api/admin/email"), [api]);
  const cfg = useLoad(load, "the email settings", errorText);

  if (cfg.error && !cfg.data) return <LoadError what="the email settings" error={cfg.error} onRetry={cfg.reload} />;

  return (
    <Stagger className="space-y-4">
      <Reveal loading={cfg.loading} skeleton={<EmailSkeleton />}>
        {cfg.data && <EmailForm api={api} errorText={errorText} d={cfg.data} reload={cfg.reload} />}
      </Reveal>
    </Stagger>
  );
}

function EmailForm({ api, errorText, d, reload }: AdminDeps & { d: EmailConfig; reload: () => void }) {
  const act = useAction(errorText);

  const [provider, setProvider] = useState<string | null>(null);
  const [from, setFrom] = useState<string | null>(null);
  const [platformFrom, setPlatformFrom] = useState<string | null>(null);
  const [credits, setCredits] = useState<string | null>(null);

  // Local edits fall back to the server's value, so the form is seeded without
  // an effect that would fight the operator's typing on every reload.
  const p = provider ?? d.provider;
  const f = from ?? d.from;
  const pf = platformFrom ?? d.platformFrom;
  const c = credits ?? String(d.creditsPerEmail);

  const creditsNum = Number(c);
  const creditsOk = Number.isFinite(creditsNum) && creditsNum >= 0 && creditsNum <= 1000;
  const dirty = p !== d.provider || f !== d.from || pf !== d.platformFrom || c !== String(d.creditsPerEmail);

  const save = () =>
    act.run("save", async () => {
      await api.post("/api/admin/email", { provider: p, from: f.trim(), platformFrom: pf.trim(), creditsPerEmail: creditsNum });
      setProvider(null); setFrom(null); setPlatformFrom(null); setCredits(null);
      reload();
      return "Email settings saved.";
    }, "Couldn't save the email settings — they're unchanged.");

  return (
    <Card className="space-y-4">
      {/* State first: whether this deployment can send at all is the question
          an operator came here with. */}
      <ConfigRow
        label="Outbound email"
        ok={d.provider === "cloudflare"}
        okLabel="Sending"
        missingLabel={d.provider === "mock" ? "Log only" : "Off"}
        detail={d.provider === "cloudflare"
          ? "Sign-in codes, invitations and notifications are delivered."
          : "Nothing is delivered — including sign-in codes, which are the only way into a passwordless deployment."}
      />

      {/* Helper text sits BELOW the control (UI-LANGUAGE §7). It used to sit
          between the eyebrow and the switch — three lines of prose to read
          before reaching the thing you came to press, restating what the status
          row above had already said. */}
      <FieldGroup title="Delivery">
        <SegmentedControl options={PROVIDERS} value={p} onChange={setProvider} />
        <p className="text-xs leading-relaxed text-muted-foreground">
          “Log only” never sends — it prints to the worker log, and the server refuses to treat it as configured
          outside development.
        </p>
      </FieldGroup>

      {/* Two addresses that are easy to confuse, so each says what it is on
          itself rather than in a shared preamble the eye skips. */}
      <FieldGroup title="Addresses">
        <Field
          label="Platform sender"
          value={f}
          onChange={(e) => setFrom(e.target.value)}
          placeholder="Acme <noreply@acme.example>"
          hint="Sign-in codes and everything this platform sends on its own behalf."
          error={f.trim() && !senderOk(f) ? "Use an address, or “Name <address>”." : undefined}
        />
        <Field
          label="Tenant lane sender"
          value={pf}
          onChange={(e) => setPlatformFrom(e.target.value)}
          placeholder="Acme <noreply@acme.example>"
          hint="What a tenant on the shared lane sends as — their customers see this one."
          error={pf.trim() && !senderOk(pf) ? "Use an address, or “Name <address>”." : undefined}
        />
      </FieldGroup>

      <FieldGroup title="Price">
        <Field
          label="Credits per email"
          inputMode="numeric"
          value={c}
          onChange={(e) => setCredits(e.target.value)}
          hint="Charged to a tenant per email on the shared lane, refunded if the send fails. Zero means no metering — not no sending."
          error={!creditsOk ? "A number between 0 and 1000." : undefined}
        />
      </FieldGroup>

      <SaveBar
        label="Save email settings"
        saving={act.busy === "save"}
        dirty={dirty}
        disabled={!creditsOk || !senderOk(f) || !senderOk(pf)}
        msg={act.msg}
        err={act.err}
        onSave={() => void save()}
      />
    </Card>
  );
}

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
  Card, ConfigRow, Field, FieldGroup, LoadError, SaveBar, SegmentedControl,
  useAction, useLoad,
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

export function PlatformEmailSection({ api, errorText }: AdminDeps) {
  const load = useCallback(() => api.get<EmailConfig>("/api/admin/email"), [api]);
  const cfg = useLoad(load, "the email settings", errorText);
  const act = useAction(errorText);

  const [provider, setProvider] = useState<string | null>(null);
  const [from, setFrom] = useState<string | null>(null);
  const [platformFrom, setPlatformFrom] = useState<string | null>(null);
  const [credits, setCredits] = useState<string | null>(null);

  if (cfg.error && !cfg.data) return <LoadError what="the email settings" error={cfg.error} onRetry={cfg.reload} />;
  if (!cfg.data) return null;
  const d = cfg.data;

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
      cfg.reload();
      return "Email settings saved.";
    }, "Couldn't save the email settings — they're unchanged.");

  return (
    <section className="space-y-4">
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

        <FieldGroup title="Delivery" hint="“Log only” prints mail to the worker log instead of sending it. The server refuses to treat that as configured outside development, so in production it means email is off.">
          <SegmentedControl options={PROVIDERS} value={p} onChange={setProvider} />
        </FieldGroup>

        <FieldGroup title="Addresses" hint="The first carries this platform's own mail. The second is what tenants on the shared lane send as, so their customers see it.">
          <Field
            label="Platform sender"
            value={f}
            onChange={(e) => setFrom(e.target.value)}
            placeholder="Acme <noreply@acme.example>"
            error={f.trim() && !senderOk(f) ? "Use an address, or “Name <address>”." : undefined}
          />
          <Field
            label="Tenant lane sender"
            value={pf}
            onChange={(e) => setPlatformFrom(e.target.value)}
            placeholder="Acme <noreply@acme.example>"
            error={pf.trim() && !senderOk(pf) ? "Use an address, or “Name <address>”." : undefined}
          />
        </FieldGroup>

        <FieldGroup title="Price" hint="Credits charged to a tenant per email on the shared lane, refunded if the send fails. Zero switches metering off — it does not switch sending off.">
          <Field
            label="Credits per email"
            inputMode="numeric"
            value={c}
            onChange={(e) => setCredits(e.target.value)}
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
    </section>
  );
}

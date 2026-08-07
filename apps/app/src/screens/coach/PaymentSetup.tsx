/**
 * GETTING PAID — the studio's own payment setup.
 *
 * The person reading this screen is a personal trainer, not an engineer. They
 * have been asked to do something genuinely technical (create a payment link,
 * register a webhook, copy a signing secret) and the honest cost of the design
 * we chose — the studio is paid directly, so we never hold their credentials —
 * is that those steps land on them.
 *
 * So this screen is built around three ideas:
 *
 *   NOTHING IS REQUIRED FIRST. "Off-platform" is the default and works
 *     immediately, in every country, with no setup at all. A trainer who never
 *     opens this screen can still sell — they mark purchases paid by hand. The
 *     automation is an upgrade, never a gate, and the screen says so before it
 *     asks for anything.
 *
 *   ONE STEP AT A TIME, WITH THE ANSWER IN REACH. Each step is numbered, states
 *     exactly what to click in the provider's own dashboard, and — where we can
 *     — hands over the value to paste with a copy button, so the trainer is
 *     never asked to retype a URL or transcribe a secret.
 *
 *   SAY WHAT IT COSTS AND WHAT IT BUYS. The trade is stated plainly at the top,
 *     because "why am I doing this?" is what makes someone abandon a setup
 *     flow — and because the answer is genuinely good for them: their money,
 *     their account, their name on the statement, no cut taken.
 */

import { useEffect, useState } from "react";
import {
  Button,
  Card,
  Badge,
  Field,
  Page,
  Stagger,
  Eyebrow,
  SectionHeader,
  EmptyState,
  Skeleton, SkeletonHeader, SkeletonList, ChoiceGroup, Choice,
  SaveBar,
  useAction,
  cn,
  toneVar,
  Copy,
  CircleCheck,
  ExternalLink,
  Store,
  AlertTriangle,
  Lock,
} from "@4dl/ui";
import { api, errorText } from "../../api.js";

interface ProviderMeta {
  id: string;
  label: string;
  capabilities: { recurring: boolean; refundEvents: boolean };
  setupSteps: string[];
}

interface Settings {
  provider: string;
  config: Record<string, string>;
  webhookUrl: string;
  providers: ProviderMeta[];
  ready: boolean;
}

/** Copy-to-clipboard for a value the trainer must paste somewhere else.
 *  Retyping a signing secret by hand is the single most likely way this whole
 *  setup fails, and the failure is silent — payments simply never arrive. */
function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1.5">
      <div className="text-caption font-medium text-muted-foreground">{label}</div>
      <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/40 px-3 py-2">
        <code className="min-w-0 flex-1 truncate font-mono text-caption">{value}</code>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            void navigator.clipboard?.writeText(value).then(
              () => { setCopied(true); setTimeout(() => setCopied(false), 1800); },
              () => undefined,
            );
          }}
        >
          {copied ? <><CircleCheck className="size-3.5" /> Copied</> : <><Copy className="size-3.5" /> Copy</>}
        </Button>
      </div>
    </div>
  );
}

export function PaymentSetup({ isOwner }: { isOwner: boolean }) {
  const [s, setS] = useState<Settings | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [choice, setChoice] = useState<string>("manual");
  const [link, setLink] = useState("");
  const [secret, setSecret] = useState("");
  const save = useAction(errorText);

  const load = async () => {
    try {
      const r = await api.get<Settings>("/api/payments/settings");
      setS(r);
      setChoice(r.provider);
      setLink(r.config.payment_link ?? "");
      setSecret(r.config.webhook_secret ?? "");
    } catch (e) {
      setErr(errorText(e, "Couldn't load your payment setup"));
    }
  };
  useEffect(() => { void load(); }, []);

  if (err) return <EmptyState icon={AlertTriangle} title="Couldn't load your payment setup" description={err} action={<Button onClick={() => { setErr(null); void load(); }}>Try again</Button>} />;
  /* Skeleton in the real geometry, not a spinner (§7). */
  if (!s) return <div className="space-y-3"><Skeleton className="h-24 rounded-2xl" /><SkeletonHeader /><SkeletonList card rows={3} thumb={0} /></div>;

  const selected = s.providers.find((p) => p.id === choice);
  const isStripeLink = choice === "stripe_link";

  return (
    <div className="space-y-5">
      {/* The trade, before anything is asked of them. */}
      <Stagger>
        <Card className="space-y-2">
          <div className="flex items-center gap-3">
            <div
              className="grid size-11 shrink-0 place-items-center rounded-2xl [&_svg]:size-[1.35rem]"
              style={{ backgroundColor: `color-mix(in oklch, ${toneVar.nutrition} 15%, transparent)`, color: toneVar.nutrition }}
            >
              <Store />
            </div>
            <div className="min-w-0">
              <div className="font-semibold tracking-tight">Your clients pay you directly</div>
              <p className="text-body text-muted-foreground">Straight into your own account, in your own name.</p>
            </div>
          </div>
          {/* ONE SENTENCE (§10). This was a 55-word paragraph making the full
              argument — no cut taken, no keys held, works in any country, which
              is why the setup below is yours. All true, and all of it read as a
              wall above the only control on the screen. The promise is the two
              lines above; the reasoning is a Help Center article. */}
          <p className="text-body leading-relaxed text-muted-foreground">
            We never hold your money and never take a cut — which is why the setup below is yours to do.
          </p>
        </Card>
      </Stagger>

      {/*
        `ChoiceGroup`, not a stack of hand-rolled buttons.

        This was one `<button>` per provider carrying its own border, its own
        selected tint and a 20px div drawn to look like a radio — which is what
        it is: pick exactly one from a small set. The real component brings what
        the imitation did not: actual radio semantics, ONE tab stop for the whole
        group with arrow keys between the options, and a name announced for the
        group rather than five unexplained buttons in a row.
      */}
      <section className="space-y-2">
        <Eyebrow>How you take payment</Eyebrow>
        <Stagger>
          <ChoiceGroup label="How you take payment" value={choice} onChange={(v) => isOwner && setChoice(v)}>
            {s.providers.map((p) => (
              <Choice
                key={p.id}
                value={p.id}
                title={p.label}
                badge={p.id === s.provider ? <Badge tone="success">In use</Badge> : undefined}
                disabled={!isOwner}
                sub={p.id === "manual"
                  ? "No setup. You take the money your way and tap to confirm."
                  : p.capabilities.recurring
                    ? "Clients pay online. Monthly plans renew on their own."
                    : "Clients pay online."}
              />
            ))}
          </ChoiceGroup>
        </Stagger>
      </section>

      {/* `manual` needs nothing, so it gets reassurance rather than a form. The
          worst outcome here would be a trainer thinking they are half-configured
          and unable to sell — they can sell right now. */}
      {choice === "manual" && (
        <Stagger>
          <Card className="space-y-2 text-body text-muted-foreground">
            <div className="font-semibold text-foreground">Nothing to set up</div>
            <p className="leading-relaxed">
              When a client buys a package it appears in <strong className="text-foreground">Pending payments</strong>.
              Take the money however you like — cash, bank transfer, your card machine — then tap
              <strong className="text-foreground"> Confirm</strong>. Their access starts straight away.
            </p>
          </Card>
        </Stagger>
      )}

      {isStripeLink && (
        <section className="space-y-3">
          <SectionHeader title="Set it up" />
          <p className="-mt-1 text-body text-muted-foreground">Five minutes, once. You&rsquo;ll be moving between Stripe and this page.</p>

          {(selected?.setupSteps ?? []).map((step, i) => (
            <Stagger key={i}>
              <Card className="flex gap-3 py-3">
                <div className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/12 text-caption font-bold text-primary">{i + 1}</div>
                <p className="flex-1 text-body leading-relaxed">{step}</p>
              </Card>
            </Stagger>
          ))}

          <Stagger>
            <Card className="space-y-4">
              {/* The value they cannot possibly know, handed over rather than
                  described. Paste-target for step 3. */}
              <CopyRow label="Your webhook URL — paste this into Stripe" value={s.webhookUrl} />

              <Field
                label="Payment link (for your default package)"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://buy.stripe.com/…"
                disabled={!isOwner}
              />
              <p className="-mt-2 text-caption text-muted-foreground">
                Each package can have its own link — set those on the package itself. This one is the fallback.
              </p>

              <Field
                label="Signing secret"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="whsec_…"
                disabled={!isOwner}
              />
              <p className="-mt-2 flex items-start gap-1.5 text-caption text-muted-foreground">
                <Lock aria-hidden className="mt-0.5 size-3 shrink-0" />
                {/* Worth saying out loud: a trainer who has been told "never share
                    your Stripe keys" is right, and needs to know this is not that. */}
                <span>
                  This lets us check that a payment notice really came from Stripe. It <strong>can&rsquo;t</strong> be
                  used to charge anyone, move your money, or see your customers — and we&rsquo;ll never ask you for a
                  key that could.
                </span>
              </p>

              <a
                href="https://dashboard.stripe.com/webhooks"
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 text-body font-semibold text-primary underline underline-offset-4"
              >
                Open Stripe webhooks <ExternalLink aria-hidden className="size-3.5" />
              </a>
            </Card>
          </Stagger>
        </section>
      )}

      {isOwner && (
        <SaveBar
          label="Save payment setup"
          saving={save.busy === "payments"}
          msg={save.msg}
          err={save.err}
          onSave={() =>
            void save.run("payments", async () => {
              await api.patch("/api/payments/settings", {
                provider: choice,
                // Blank means "keep what's stored" on the server, which is what
                // makes the masked secret safe to leave untouched.
                config: isStripeLink ? { payment_link: link, webhook_secret: secret.startsWith("••") ? "" : secret } : {},
              });
              await load();
              return "Payment setup saved.";
            })
          }
        />
      )}
    </div>
  );
}

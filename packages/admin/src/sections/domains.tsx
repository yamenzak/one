/**
 * CUSTOM DOMAINS — Cloudflare for SaaS, from the operator's side.
 *
 * `@4dl/tenancy` already owns both halves of this except the screen: the domain
 * routes, the DCV flow, the per-domain WebAuthn relying party, and
 * `/admin/domains/config` itself. Every app that mounts `domainAdminRoutes` —
 * which the template does on day one — therefore has a working custom-domain
 * feature with no way to configure it. Tessa is exactly that: the endpoint
 * answers, and nothing calls it.
 *
 * ── Three parts, and partial is worse than off ──────────────────────────────
 *
 * A token, a zone id and a CNAME target. Any subset means a tenant can add a
 * domain, watch it sit there, and never see it verify — so `partial` is called
 * out as loudly as a misconfiguration, because from the tenant's side it looks
 * like the product is broken rather than unconfigured.
 *
 * ── The worker-name override is the silent one ──────────────────────────────
 *
 * Routes for a new domain are created against a script NAME. Override it to
 * something that does not exist and the domain still issues a certificate and
 * still reports active — and then serves nothing, with no error anywhere. That
 * is why an override renders a warning rather than a neutral "custom" badge.
 */

import { useCallback, useEffect, useState } from "react";
import {
  ActionResult, AlertTriangle, Badge, Button, Callout, Card, CircleCheck, ConfigRow, Field, FieldGroup,
  Globe, KeyRound, LoadError, Reveal, SectionHeader, Skeleton, SkeletonLine, Spinner, Stagger,
  useAction, useLoad,
} from "@4dl/ui";
import { AdminDepsProvider, useAdminDeps, type AdminDeps } from "../deps.js";

interface DomainStatus {
  configured: boolean;
  zoneId: string | null;
  cnameTarget: string | null;
  tokenSet: boolean;
  /** Stored override, or null when the default applies. */
  workerName: string | null;
  /** What the server falls back to — matches `name` in wrangler.jsonc. */
  workerNameDefault: string;
}

export interface DomainsSectionProps extends AdminDeps {
  /**
   * What this app calls a tenant, lower case singular — "studio", "centre".
   *
   * Only three sentences need it, and all three are about what the TENANT
   * experiences when this is misconfigured. Defaulting to "tenant" keeps the
   * package honest; passing your own noun keeps the console readable.
   */
  tenantNoun?: string;
  /** A concrete example for the CNAME-target field, e.g. `saas.4dl.app`. */
  cnameExample?: string;
}

export function PlatformDomainsSection({ api, errorText, tenantNoun = "tenant", cnameExample = "saas.example.com" }: DomainsSectionProps) {
  return (
    <AdminDepsProvider value={{ api, errorText }}>
      <DomainsConfig noun={tenantNoun} cnameExample={cnameExample} />
    </AdminDepsProvider>
  );
}

function DomainsConfig({ noun, cnameExample }: { noun: string; cnameExample: string }) {
  const { api, errorText } = useAdminDeps();
  const nouns = `${noun}s`;
  const load = useCallback(() => api.get<DomainStatus>("/api/admin/domains/config"), [api]);
  const { data: status, error, loading, reload } = useLoad(load, "the custom-domain configuration", errorText);
  const [apiToken, setApiToken] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [cnameTarget, setCnameTarget] = useState("");
  const [workerName, setWorkerName] = useState("");
  const [seeded, setSeeded] = useState(false);
  const act = useAction(errorText);

  // Prefill the public fields from the server once; never stomp typing.
  useEffect(() => {
    if (status && !seeded) {
      setZoneId(status.zoneId ?? "");
      setCnameTarget(status.cnameTarget ?? "");
      setWorkerName(status.workerName ?? "");
      setSeeded(true);
    }
  }, [status, seeded]);

  // What a route created right now would point at.
  const effectiveWorker = status ? (status.workerName || status.workerNameDefault) : "";
  // A stored value that is not the default is the silent-failure case: routes
  // are created against a script name nobody re-checked after a worker rename.
  const workerOverridden = !!status?.workerName && status.workerName !== status.workerNameDefault;

  const save = () =>
    act.run("save", async () => {
      // Send only what is filled in — the token is write-only, so an empty box
      // must keep the stored one rather than clear it. The worker name is the
      // exception: it is sent whenever it differs from what is stored, so
      // emptying the box clears the override and restores the default.
      const body: Record<string, string> = {};
      if (apiToken) body.apiToken = apiToken;
      if (zoneId) body.zoneId = zoneId;
      if (cnameTarget) body.cnameTarget = cnameTarget;
      if (workerName.trim() !== (status?.workerName ?? "")) body.workerName = workerName.trim();
      await api.post("/api/admin/domains/config", body);
      setApiToken("");
      reload();
      return `Saved. ${nouns.charAt(0).toUpperCase()}${nouns.slice(1)} can add custom domains from their own settings.`;
    }, "Couldn't save the Cloudflare for SaaS credentials.");

  if (error && !status) {
    return <Stagger><LoadError what="the custom-domain configuration" error={error} onRetry={reload} /></Stagger>;
  }

  const partial = !!status && !status.configured && (status.tokenSet || !!status.zoneId || !!status.cnameTarget);

  return (
    <Stagger className="space-y-3">
      <Reveal
        loading={loading}
        skeleton={
          <Card className="space-y-3">
            <div className="flex items-center gap-2.5"><Skeleton className="size-9 rounded-2xl" /><SkeletonLine w="10rem" h="title" /></div>
            <Skeleton className="h-24 w-full rounded-2xl" />
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
          </Card>
        }
      >
        {status && (
          <Card className="space-y-4">
            <SectionHeader
              icon={Globe}
              title="Cloudflare for SaaS"
              action={<Badge tone={status.configured ? "success" : partial ? "warning" : "neutral"}>{status.configured ? "enabled" : partial ? "incomplete" : "off"}</Badge>}
            />
            <p className="text-sm text-muted-foreground">
              All three parts are needed: a zone API token with <span className="font-medium text-foreground">SSL and Certificates · Edit</span>,
              the SaaS-enabled zone id, and the CNAME target {nouns} point their domain at.
            </p>

            <div className="space-y-2.5 rounded-2xl bg-surface-2 p-3.5">
              <ConfigRow label="API token" ok={status.tokenSet} detail="Write-only — never echoed back." okLabel="Stored" />
              <ConfigRow label="Zone id" ok={!!status.zoneId} detail={status.zoneId ?? "The zone with Custom Hostnames enabled."} />
              <ConfigRow label="CNAME target" ok={!!status.cnameTarget} detail={status.cnameTarget ?? `The hostname ${nouns} CNAME their domain to.`} />
              <ConfigRow
                label="Worker script"
                ok
                okLabel={status.workerName ? "Overridden" : "Default"}
                detail={`Routes for new domains point at "${effectiveWorker}".`}
              />
            </div>

            {partial && (
              <Callout tone="warning" icon={AlertTriangle} live="alert">
                Partly configured — custom domains stay off until all three are stored, and a {noun} that adds one will
                see it never verify.
              </Callout>
            )}
            {workerOverridden && (
              <Callout tone="warning" icon={AlertTriangle} live="alert">
                The worker script is overridden to <span className="font-medium text-foreground">{status.workerName}</span> instead of
                the default <span className="font-medium text-foreground">{status.workerNameDefault}</span>. If no script by that
                name exists, a {noun}&rsquo;s domain still issues a certificate and reports active — and then serves nothing, with no error
                anywhere. Clear the field below to restore the default.
              </Callout>
            )}
            {status.configured && (
              <Callout tone="success" icon={CircleCheck}>
                Ready. A {noun} adding a domain gets a certificate issued and its own WebAuthn relying party.
              </Callout>
            )}

            <FieldGroup title="One-time Cloudflare setup" hint="These steps can't be done from here — do them in the Cloudflare dashboard first.">
              <ol className="space-y-1.5 rounded-xl bg-surface-2 p-3 text-xs leading-relaxed text-muted-foreground">
                <li><span className="font-medium text-foreground">1.</span> On the serving zone → SSL/TLS → Custom Hostnames → <span className="font-medium">Enable</span>.</li>
                <li><span className="font-medium text-foreground">2.</span> Add the Fallback Origin as an <span className="font-medium">originless</span> record on the zone apex — AAAA <code className="rounded bg-surface-3 px-1">saas</code> → <code className="rounded bg-surface-3 px-1">100::</code>, proxied — then set Fallback Origin to <code className="rounded bg-surface-3 px-1">{cnameExample}</code>. Do <span className="font-medium">not</span> CNAME it at the app: every domain gets its own worker route, and a record under the {noun} root would classify as a {noun} that does not exist.</li>
                <li><span className="font-medium text-foreground">3.</span> Create an API token scoped to that zone with <span className="font-medium">SSL and Certificates · Edit</span> <span className="font-medium">and Workers Routes · Edit</span> — both, or adding a domain fails and rolls back.</li>
              </ol>
            </FieldGroup>

            <FieldGroup title="Credentials">
              <Field
                label={status.tokenSet ? "API token — stored (blank keeps it)" : "API token"}
                icon={KeyRound}
                type="password"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
              />
              <Field label="Zone id" value={zoneId} onChange={(e) => setZoneId(e.target.value)} />
              <Field
                label="CNAME target"
                icon={Globe}
                value={cnameTarget}
                onChange={(e) => setCnameTarget(e.target.value)}
                placeholder={cnameExample}
                hint={`A proxied hostname on the serving zone — the same one you set as the Fallback Origin. Not a name under the ${noun} root.`}
              />
              <Field
                label="Worker script — blank uses the default"
                value={workerName}
                onChange={(e) => setWorkerName(e.target.value)}
                placeholder={status.workerNameDefault}
                hint={`Leave blank unless the worker was renamed. In force now: "${effectiveWorker}".`}
              />
              <Button
                className="min-h-12 w-full"
                disabled={act.busy !== null || (!apiToken && !zoneId && !cnameTarget && workerName.trim() === (status.workerName ?? ""))}
                onClick={() => void save()}
              >
                {act.busy === "save" ? <><Spinner className="size-4" /> Saving…</> : "Save"}
              </Button>
            </FieldGroup>

            {error && <Callout tone="warning" icon={AlertTriangle} live="alert">{error} Showing the last values that loaded.</Callout>}
            <ActionResult msg={act.msg} err={act.err} />
          </Card>
        )}
      </Reveal>
    </Stagger>
  );
}

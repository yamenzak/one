/**
 * THE STRIPE RAIL'S DEAD LETTER.
 *
 * One Stripe account serves every 4DL app, so an event the rail cannot
 * attribute to a product belongs to no product — it belongs to the platform.
 * `@4dl/billing-rail` parks it in `rail_parked_events` with its full payload,
 * precisely so it is not the silent `200 {received: true}` that came before:
 * money captured, nothing granted, no signal.
 *
 * The parking shipped. The reading did not. `listParked` and `countParked` sat
 * exported with zero callers in the whole repo, under a comment in the webhook
 * handler claiming "the operator console counts it". This is that console.
 *
 * ── Every decision on this screen follows from what a parked row means ──────
 *
 * It means somebody paid and did not receive. So:
 *
 * **The empty state is the good one, and says so plainly** — but it is a
 * *count*, not a reassurance. "Nothing parked" is a fact about the queue, and
 * conflating it with "billing is fine" is how a queue stops being read.
 *
 * **The payload is one tap away, not on the row.** It carries the customer id,
 * the amount and whatever metadata the object did or did not have — everything
 * needed to work out who paid for what. It is also kilobytes of JSON, so
 * fetching it is a deliberate per-event act rather than the cost of glancing at
 * a list.
 *
 * **Closing one requires a note, and the field is not optional theatre.** The
 * server refuses a blank. "Resolved" alone records that somebody looked, not
 * whether the customer ever got what they paid for — which turns a known
 * problem into an unknown one, and that is worse than leaving it open.
 *
 * **There is no Replay button.** Re-running a handler against an object whose
 * world has moved on, on a rail whose entire job is exactly-once attribution,
 * risks granting twice for one payment — strictly worse than the under-granting
 * this screen exists to reveal. The fix is made in Stripe or in the app that
 * should have owned the event, and recorded here.
 */

import { useCallback, useState } from "react";
import {
  ActionResult, AlertTriangle, Badge, Button, Callout, Card, CircleCheck, Field, Info, LoadError, Reveal,
  SectionHeader, Skeleton, SkeletonLine, Spinner, Stagger, Wallet, useAction, useLoad,
} from "@4dl/ui";
import { AdminDepsProvider, useAdminDeps, type AdminDeps } from "../deps.js";

interface Parked {
  id: string;
  eventId: string | null;
  eventType: string;
  reason: string;
  candidates: string[];
  createdAt: string;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  resolutionNote?: string | null;
}

interface ParkedList {
  /** Open events, regardless of what the list was filtered to. */
  open: number;
  events: Parked[];
}

/**
 * Cloudflare's own reason codes, in words an operator can act on.
 *
 * An unrecognised code falls through to itself rather than to "unknown": a
 * reason we have no phrasing for is still more useful than a shrug, and the raw
 * string is greppable in the rail's source.
 */
const REASONS: Record<string, string> = {
  "no-app": "No app claimed it — the event carries no product tag and no app recognised the customer.",
  "unknown-app": "Tagged for an app this deployment does not know about.",
  "ambiguous": "More than one app claimed it. Nothing was granted, deliberately — guessing here pays the wrong tenant.",
};

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
};

export function PlatformRailSection({ api, errorText }: AdminDeps) {
  return (
    <AdminDepsProvider value={{ api, errorText }}>
      <Rail />
    </AdminDepsProvider>
  );
}

function Rail() {
  const { api, errorText } = useAdminDeps();
  const [showClosed, setShowClosed] = useState(false);
  const load = useCallback(
    () => api.get<ParkedList>(`/api/admin/rail/parked${showClosed ? "?open=false" : ""}`),
    [api, showClosed],
  );
  const { data, error, loading, reload } = useLoad(load, "the parked Stripe events", errorText);
  const [open, setOpen] = useState<string | null>(null);
  const [payload, setPayload] = useState<Record<string, string | null>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const act = useAction(errorText);

  const inspect = (id: string) =>
    act.run(`load:${id}`, async () => {
      const row = await api.get<Parked & { payload: string | null }>(`/api/admin/rail/parked/${encodeURIComponent(id)}`);
      setPayload((p) => ({ ...p, [id]: row.payload }));
      setOpen(id);
      return "";
    }, "Couldn't load that event's payload.");

  const resolve = (id: string) =>
    act.run(`resolve:${id}`, async () => {
      await api.post(`/api/admin/rail/parked/${encodeURIComponent(id)}/resolve`, { note: notes[id] ?? "" });
      setNotes((n) => ({ ...n, [id]: "" }));
      setOpen(null);
      reload();
      return "Closed, with your note on the record.";
    }, "Couldn't close that event.");

  const events = data?.events ?? [];

  return (
    <Stagger className="space-y-3">
      {error && !data ? (
        <LoadError what="the parked Stripe events" error={error} onRetry={reload} />
      ) : (
        <Reveal
          loading={loading}
          skeleton={
            <Card className="space-y-3">
              <div className="flex items-center gap-2.5"><Skeleton className="size-9 rounded-2xl" /><SkeletonLine w="12rem" h="title" /></div>
              <Skeleton className="h-20 w-full rounded-2xl" />
            </Card>
          }
        >
          {data && (
            <Card className="space-y-4">
              <SectionHeader
                icon={Wallet}
                title="Unattributed payments"
                action={<Badge tone={data.open > 0 ? "danger" : "success"}>{data.open > 0 ? `${data.open} open` : "clear"}</Badge>}
              />
              <p className="text-body text-muted-foreground">
                One Stripe account serves every 4DL app. An event that can&apos;t be matched to a product is held here with
                its full payload instead of being accepted and forgotten — so a payment that granted nothing is{" "}
                <span className="font-medium text-foreground">visible</span> rather than silent.
              </p>

              {data.open === 0 ? (
                <Callout tone="success" icon={CircleCheck}>
                  Nothing parked. Every event Stripe has sent was matched to an app — this says the queue is empty, not
                  that every payment succeeded.
                </Callout>
              ) : (
                <Callout tone="danger" icon={AlertTriangle} live="alert">
                  {data.open === 1 ? "One payment" : `${data.open} payments`} reached Stripe and granted nothing. Each row
                  below carries the customer and the amount — settle it in Stripe or in the app that should have owned it,
                  then close it here with what you did.
                </Callout>
              )}

              <div className="flex items-center justify-between gap-2">
                <Button size="sm" variant="ghost" onClick={() => setShowClosed((v) => !v)}>
                  {showClosed ? "Open only" : "Include closed"}
                </Button>
                <Button size="sm" variant="ghost" onClick={reload}>Refresh</Button>
              </div>

              {events.length === 0 ? (
                <p className="text-body text-muted-foreground">Nothing to show.</p>
              ) : (
                <div className="space-y-2.5">
                  {events.map((e) => (
                    <div key={e.id} className="space-y-2 rounded-xl bg-surface-2 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <code className="font-mono text-caption font-medium">{e.eventType}</code>
                        <Badge tone={e.resolvedAt ? "neutral" : "danger"}>{e.resolvedAt ? "closed" : "open"}</Badge>
                        <span className="ml-auto text-caption text-muted-foreground">{when(e.createdAt)}</span>
                      </div>
                      <p className="text-caption text-muted-foreground">{REASONS[e.reason] ?? e.reason}</p>
                      {e.candidates.length > 0 && (
                        <p className="text-caption text-muted-foreground">Claimed by: {e.candidates.join(", ")}</p>
                      )}
                      {e.eventId && <p className="font-mono text-caption text-muted-foreground">{e.eventId}</p>}

                      {e.resolvedAt ? (
                        <p className="text-caption text-muted-foreground">
                          Closed {when(e.resolvedAt)}{e.resolvedBy ? ` by ${e.resolvedBy}` : ""} — {e.resolutionNote}
                        </p>
                      ) : (
                        <>
                          <div className="flex gap-2">
                            <Button size="sm" variant="secondary" disabled={act.busy !== null} onClick={() => void inspect(e.id)}>
                              {act.busy === `load:${e.id}` ? <><Spinner className="size-3" /> …</> : open === e.id ? "Payload below" : "Show payload"}
                            </Button>
                          </div>
                          {open === e.id && (
                            <pre className="max-h-64 overflow-auto rounded-lg bg-surface-3 p-2 font-mono text-caption leading-relaxed">
                              {payload[e.id] ?? "(no payload stored)"}
                            </pre>
                          )}
                          <Field
                            label="What did you do about it?"
                            value={notes[e.id] ?? ""}
                            onChange={(ev) => setNotes((n) => ({ ...n, [e.id]: ev.target.value }))}
                            placeholder="e.g. granted 5,000 credits to acme manually; invoice in_1A2B"
                            hint="Required. A closed event with no account of the money is not a record."
                          />
                          <Button
                            size="sm"
                            disabled={act.busy !== null || !(notes[e.id] ?? "").trim()}
                            onClick={() => void resolve(e.id)}
                          >
                            {act.busy === `resolve:${e.id}` ? <><Spinner className="size-3" /> Closing…</> : "Close this"}
                          </Button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <Callout tone="neutral" icon={Info}>
                There is no <span className="font-medium text-foreground">replay</span> button on purpose. Re-running a
                handler against an object whose world has moved on risks granting twice for one payment — worse than the
                under-granting this screen exists to reveal.
              </Callout>

              {error && <Callout tone="warning" icon={AlertTriangle} live="alert">{error} Showing the last list that loaded.</Callout>}
              <ActionResult msg={act.msg} err={act.err} />
            </Card>
          )}
        </Reveal>
      )}
    </Stagger>
  );
}

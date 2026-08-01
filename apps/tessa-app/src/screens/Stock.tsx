/**
 * STOCK — the shelf, as the person standing in front of it sees it.
 *
 * Sorted by the effective expiry, soonest first. That is FEFO (first expired,
 * first out) as a default rather than a feature: the correct thing to pick is
 * almost always at the top, so the list itself does the reminding.
 *
 * ── Why the expiry chip carries its REASON ──────────────────────────────────
 *
 * "Expires in 3 days" and "expires in 3 days because it was opened on Monday"
 * lead to different actions — the second one can be checked, argued with, or
 * fixed by correcting the opening date. The server already computes which of the
 * three clocks won (`effectiveExpiry`), so showing a bare date here would be
 * throwing that away at the last step and leaving a nurse with nothing to
 * dispute.
 */

import { useCallback, useState } from "react";
import { Archive, Badge, Button, Callout, Field, FlaskConical, Group, LoadError, Row, Screen, Section, Sheet, Skeleton, Timer, toneText, Trash2, useAction, useLoad } from "@4dl/ui";
import { expiryText, expiryTone, fmt, stock, type Lot } from "../data.js";

/** The clock that won, in words a person can act on. */
const REASON_TEXT: Record<string, string> = {
  printed: "Printed expiry",
  opened: "Opened — shortened",
  sterile: "Sterile shelf life",
};

export function Stock() {
  const load = useCallback(() => stock.shelf(), []);
  const { data, error, loading, reload } = useLoad(load, "the shelf", fmt);
  const [selected, setSelected] = useState<Lot | null>(null);

  if (error) return <Screen><LoadError what="the shelf" error={error} onRetry={reload} /></Screen>;
  if (loading || !data) return <Screen><Section><Skeleton className="h-64 w-full rounded-2xl" /></Section></Screen>;

  const lots = data.lots;

  return (
    <Screen>
      <Section title="On the shelf">
        {lots.length === 0 ? (
          <Callout tone="neutral" icon={Archive}>Nothing received yet. Scan a box to start.</Callout>
        ) : (
          <Group>
            {lots.map((lot, i) => (
              <Row
                key={lot.id}
                icon={Archive}
                sub={
                  <span className="flex items-center gap-1.5">
                    {lot.lot_code ? `Lot ${lot.lot_code}` : "No lot code"}
                    {lot.expiryReason && lot.expiryReason !== "printed" && (
                      <Badge tone="warning">{REASON_TEXT[lot.expiryReason]}</Badge>
                    )}
                  </span>
                }
                value={<span className="tabular-nums">{lot.quantity}{lot.unit_of_measure ? ` ${lot.unit_of_measure}` : ""}</span>}
                /* `toneText`, not an interpolated class name. Tailwind scans SOURCE
                   TEXT, so `text-${tone}` produces a class that is never
                   generated — the text silently renders in the inherited colour
                   and the whole expiry signal disappears. */
                valueSub={<span className={toneText[expiryTone(lot.expiryStatus)]}>{expiryText(lot)}</span>}
                onClick={() => setSelected(lot)}
                divider={i < lots.length - 1}
                tone={lot.expiryStatus === "expired" ? "danger" : "default"}
              >
                {lot.item_name ?? "Unnamed"}
              </Row>
            ))}
          </Group>
        )}
      </Section>

      {selected && <LotSheet lot={selected} onClose={() => setSelected(null)} onChanged={() => { setSelected(null); reload(); }} />}
    </Screen>
  );
}

/**
 * What you can do to one lot.
 *
 * `use` and `discard` both reduce the count and are deliberately NOT the same
 * button with a toggle: a discard is a loss the centre may need to account for,
 * and merging them into "remove" would erase the distinction at the only moment
 * anybody knows which it was.
 */
function LotSheet({ lot, onClose, onChanged }: { lot: Lot; onClose: () => void; onChanged: () => void }) {
  const [quantity, setQuantity] = useState("1");
  const act = useAction(fmt);

  const run = (action: "use" | "discard" | "open" | "quarantine") =>
    void act.run(action, async () => {
      const qty = Number(quantity);
      await stock.act(lot.id, action, action === "use" || action === "discard" ? { quantity: qty } : {});
      onChanged();
    });

  return (
    <Sheet open onClose={onClose} title={lot.item_name ?? "Lot"}>
      <div className="space-y-4">
        <Callout tone={expiryTone(lot.expiryStatus)}>
          <div>{expiryText(lot)}</div>
          {lot.expiryReason && <div className="text-caption text-muted-foreground">{REASON_TEXT[lot.expiryReason]}</div>}
        </Callout>

        <Field label="How many?" type="number" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} />

        <div className="grid grid-cols-2 gap-3">
          <Button onClick={() => run("use")} disabled={act.busy !== null}>Use</Button>
          <Button variant="secondary" onClick={() => run("discard")} disabled={act.busy !== null}>
            <Trash2 className="size-4" /> Discard
          </Button>
          {/**
           * Opening starts the post-opening clock (TESSA.md §3.4) — the one that
           * is frequently much shorter than the printed date. It takes no
           * quantity, because opening a container is not consuming from it.
           */}
          <Button variant="secondary" onClick={() => run("open")} disabled={act.busy !== null}>
            <Timer className="size-4" /> Mark opened
          </Button>
          <Button variant="secondary" onClick={() => run("quarantine")} disabled={act.busy !== null}>
            <FlaskConical className="size-4" /> Quarantine
          </Button>
        </div>

        {/* The server's own sentence, not a generic failure. "There isn't that
            much left — count the shelf and adjust" is actionable; "error" is not. */}
        {act.err && <Callout tone="danger" live="alert">{act.err}</Callout>}
      </div>
    </Sheet>
  );
}

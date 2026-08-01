/**
 * THE RECALL REPORT — the screen the whole product is for.
 *
 * ── The layout is an argument, not a preference ─────────────────────────────
 *
 * What the recall COULD NOT REACH comes first, in `danger`, above everything.
 * The trays it successfully quarantined come second, and they are the boring
 * half: the app already did that, and nobody needs to act on it.
 *
 * Ordering these the other way round — froze 12, couldn't reach 2 — reads as a
 * job that is 86% done. It is not. The two it could not reach are the only ones
 * that require a person to leave the building's software and do something in the
 * world: find the case, tell a clinician, check on a patient, notify an
 * authority. A screen that lets that scroll off the bottom is the most dangerous
 * screen in the product, which is why the summary tile for `unreachable` is
 * always drawn even when it is zero.
 *
 * ── Rule 1 shows up here at its sharpest ────────────────────────────────────
 *
 * The unreachable list can give a case REFERENCE and nothing more. Tessa cannot
 * resolve it to a person and does not try; handing over the reference is the
 * whole of what this app can do, and the copy says so rather than leaving
 * someone waiting for a name that is never coming.
 */

import { useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Badge, Button, Callout, Group, ListChecks, LoadError, RotateCcw, Row, Screen, Section, ShieldCheck, Skeleton, Tile, TileGrid, useLoad } from "@4dl/ui";
import { fmt, trace } from "../data.js";

export function Recall() {
  const { cycleId = "" } = useParams();
  const nav = useNavigate();
  const { data, error, loading, reload } = useLoad(useCallback(() => trace.cycle(cycleId), [cycleId]), "the recall", fmt);

  if (error) return <Screen><LoadError what="the recall" error={error} onRetry={reload} /></Screen>;
  if (loading || !data) return <Screen><Section><Skeleton className="h-64 w-full rounded-2xl" /></Section></Screen>;

  const { cycle, summary, packs, instruments } = data;
  const unreachable = packs.filter((p) => p.disposition === "unreachable");
  const frozen = packs.filter((p) => p.disposition !== "unreachable");

  return (
    <Screen>
      <Section>
        <Button variant="ghost" size="sm" onClick={() => nav(-1)}>
          <ArrowLeft className="size-4" /> Back
        </Button>
      </Section>

      <Section title={`Load ${cycle.cycle_number ?? cycle.id.slice(-6)}`}>
        <Callout tone="danger" icon={AlertTriangle} live="alert">
          <div>{cycle.machine} — failed{cycle.failure_reason ? ` on the ${cycle.failure_reason}` : ""}.</div>
          <div className="text-caption text-muted-foreground">Started {cycle.started_at.slice(0, 16).replace("T", " ")}</div>
        </Callout>
      </Section>

      <Section>
        <TileGrid>
          {/* Drawn even at zero. A summary that omits the number when it is
              nothing teaches people to read its absence as "not applicable". */}
          <Tile icon={AlertTriangle} label="Couldn't reach" value={`${summary.unreachable} tray${summary.unreachable === 1 ? "" : "s"}`} />
          <Tile icon={ShieldCheck} label="Quarantined" value={`${summary.quarantined}`} />
          <Tile icon={RotateCcw} label="Already frozen" value={`${summary.alreadyQuarantined}`} />
        </TileGrid>
      </Section>

      <Section title="Tessa could not reach these">
        {unreachable.length === 0 ? (
          <Callout tone="success" icon={ShieldCheck}>
            Every tray from this load was still on a shelf. Nothing from it reached a patient.
          </Callout>
        ) : (
          <>
            <Callout tone="danger" className="mb-3">
              These were opened. No action in Tessa can undo that — this list is the one to work through outside the app.
            </Callout>
            <Group>
              {unreachable.map((p, i) => (
                <Row
                  key={p.id}
                  icon={AlertTriangle}
                  tone="danger"
                  sub={p.opened_at ? `Opened ${p.opened_at.slice(0, 16).replace("T", " ")}` : "Opened"}
                  /* A reference, never a name — TESSA.md Rule 1. */
                  value={p.case_id ? <Badge tone="danger">case recorded</Badge> : <Badge tone="warning">no case</Badge>}
                  divider={i < unreachable.length - 1}
                  onClick={p.case_id ? () => nav("/cases") : undefined}
                >
                  {p.label_code}
                </Row>
              ))}
            </Group>
            <p className="px-4 pt-3 text-center text-caption text-muted-foreground">
              Tessa holds the case reference and nothing else about the patient. Your own records are the next step.
            </p>
          </>
        )}
      </Section>

      <Section title="Quarantined">
        {frozen.length === 0 ? (
          <Callout tone="neutral">Nothing from this load was still on a shelf.</Callout>
        ) : (
          <Group>
            {frozen.map((p, i) => (
              <Row
                key={p.id}
                icon={ListChecks}
                sub={p.recipe_name ?? "Tray"}
                value={<Badge tone="warning">{p.disposition === "already_quarantined" ? "already frozen" : "quarantined"}</Badge>}
                divider={i < frozen.length - 1}
              >
                {p.label_code}
              </Row>
            ))}
          </Group>
        )}
      </Section>

      {/**
       * The instruments, last. They outlive the trays they were in, so "this
       * forceps was in the failed load" stays true after the tray was opened and
       * dissolved — but they are reference material for an inspection rather
       * than something to act on today.
       */}
      <Section title="Instruments in this load">
        {instruments.length === 0 ? (
          <Callout tone="neutral">No instrument trays in this load.</Callout>
        ) : (
          <Group>
            {instruments.map((u, i) => (
              <Row key={u.unit_id} icon={RotateCcw} sub={u.item_name ?? "Instrument"} divider={i < instruments.length - 1}>
                {u.label_code}
              </Row>
            ))}
          </Group>
        )}
      </Section>
    </Screen>
  );
}

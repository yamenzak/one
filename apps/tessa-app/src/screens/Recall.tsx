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
import { useT } from "../i18n.js";

export function Recall() {
  const { cycleId = "" } = useParams();
  const nav = useNavigate();
  const t = useT();
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
          <ArrowLeft className="size-4" /> {t("common.back")}
        </Button>
      </Section>

      <Section title={t("recall.load", { load: cycle.cycle_number ?? cycle.id.slice(-6) })}>
        <Callout tone="danger" icon={AlertTriangle} live="alert">
          <div>{cycle.failure_reason ? t("recall.failedOn", { machine: cycle.machine, reason: cycle.failure_reason }) : t("recall.failed", { machine: cycle.machine })}</div>
          <div className="text-caption text-muted-foreground">{t("recall.started", { at: cycle.started_at.slice(0, 16).replace("T", " ") })}</div>
        </Callout>
      </Section>

      <Section>
        <TileGrid>
          {/* Drawn even at zero. A summary that omits the number when it is
              nothing teaches people to read its absence as "not applicable". */}
          <Tile icon={AlertTriangle} label={t("recall.couldntReach")} value={t("today.trays.count", { count: summary.unreachable })} />
          <Tile icon={ShieldCheck} label={t("recall.quarantined")} value={`${summary.quarantined}`} />
          <Tile icon={RotateCcw} label={t("recall.alreadyFrozen")} value={`${summary.alreadyQuarantined}`} />
        </TileGrid>
      </Section>

      <Section title={t("recall.unreachable.title")}>
        {unreachable.length === 0 ? (
          <Callout tone="success" icon={ShieldCheck}>
{t("recall.unreachable.none")}
          </Callout>
        ) : (
          <>
            <Callout tone="danger" className="mb-3">
{t("recall.unreachable.body")}
            </Callout>
            <Group>
              {unreachable.map((p, i) => (
                <Row
                  key={p.id}
                  icon={AlertTriangle}
                  tone="danger"
                  sub={t("recall.opened", { at: p.opened_at ? p.opened_at.slice(0, 16).replace("T", " ") : "" })}
                  /* A reference, never a name — TESSA.md Rule 1. */
                  value={p.case_id ? <Badge tone="danger">{t("recall.caseRecorded")}</Badge> : <Badge tone="warning">{t("recall.noCase")}</Badge>}
                  divider={i < unreachable.length - 1}
                  onClick={p.case_id ? () => nav("/cases") : undefined}
                >
                  {p.label_code}
                </Row>
              ))}
            </Group>
            <p className="px-4 pt-3 text-center text-caption text-muted-foreground">
{t("recall.unreachable.rule1")}
            </p>
          </>
        )}
      </Section>

      <Section title={t("recall.quarantined")}>
        {frozen.length === 0 ? (
          <Callout tone="neutral">{t("recall.frozen.none")}</Callout>
        ) : (
          <Group>
            {frozen.map((p, i) => (
              <Row
                key={p.id}
                icon={ListChecks}
                sub={p.recipe_name ?? t("cssd.tray")}
                value={<Badge tone="warning">{p.disposition === "already_quarantined" ? t("recall.alreadyFrozen") : t("recall.quarantined")}</Badge>}
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
      <Section title={t("recall.instruments")}>
        {instruments.length === 0 ? (
          <Callout tone="neutral">{t("recall.instruments.none")}</Callout>
        ) : (
          <Group>
            {instruments.map((u, i) => (
              <Row key={u.unit_id} icon={RotateCcw} sub={u.item_name ?? t("labels.instruments")} divider={i < instruments.length - 1}>
                {u.label_code}
              </Row>
            ))}
          </Group>
        )}
      </Section>
    </Screen>
  );
}

/**
 * CSSD — trays and loads, on one screen with two tabs.
 *
 * They are separated because they are two jobs at two benches: someone assembles
 * trays, and someone runs the machine. They are on ONE screen because the second
 * job's input is the first job's output, and a person moving between them should
 * not have to navigate.
 *
 * ── The release button explains itself ──────────────────────────────────────
 *
 * `/api/cycles/:id` returns `releaseCheck`'s verdict alongside the load, so a
 * disabled Release can say WHY — "record the chemical indicator first" rather
 * than being greyed out with no explanation. A disabled control with no reason
 * is the single most common way software gets worked around on paper.
 *
 * ── What is deliberately blunt about the failure path ───────────────────────
 *
 * Recording a failed biological on a released load triggers a recall, and the
 * confirmation says exactly that before it happens. Nothing about that action is
 * reversible, and a dialog that said "are you sure?" without naming the
 * consequence would be worse than none.
 */

import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Badge, Button, Callout, CircleCheck, ConfirmDialog, Group, ListChecks, LoadError, Play, RotateCcw, Row, Screen, Section, SegmentedControl, Sheet, Skeleton, Tag, Timer, useAction, useLoad } from "@4dl/ui";
import { cssd, expiryTone, fmt, type Cycle, type Pack } from "../data.js";
import { useExpiryText, useT } from "../i18n.js";
import { useCan } from "../session.js";

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral" | "primary"> = {
  running: "primary",
  ended: "warning",
  released: "success",
  failed: "danger",
};

export function Cssd() {
  const t = useT();
  const [view, setView] = useState<"trays" | "loads">("trays");
  const nav = useNavigate();
  return (
    <Screen>
      <Section action={<Button size="sm" variant="secondary" onClick={() => nav("/labels")}><Tag className="size-4" /> {t("cssd.labels")}</Button>}>
        <SegmentedControl
          value={view}
          onChange={setView}
          options={[
            { value: "trays", label: t("cssd.trays") },
            { value: "loads", label: t("cssd.loads") },
          ]}
        />
      </Section>
      {view === "trays" ? <Trays /> : <Loads />}
    </Screen>
  );
}

function Trays() {
  const t = useT();
  const expiryText = useExpiryText();
  const load = useCallback(() => cssd.packs(), []);
  const { data, error, loading, reload } = useLoad(load, "trays", fmt);
  const [selected, setSelected] = useState<Pack | null>(null);

  if (error) return <LoadError what="trays" error={error} onRetry={reload} />;
  if (loading || !data) return <Skeleton className="h-64 w-full rounded-2xl" />;

  return (
    <>
      <Section title={t("cssd.trays")}>
        {data.packs.length === 0 ? (
          <Callout tone="neutral" icon={ListChecks}>{t("cssd.trays.empty")}</Callout>
        ) : (
          <Group>
            {data.packs.map((p, i) => (
              <Row
                key={p.id}
                icon={ListChecks}
                sub={p.recipe_name ?? t("cssd.tray")}
                value={<Badge tone={p.status === "sterile" ? "success" : p.status === "quarantined" ? "danger" : "neutral"}>{p.status.replace(/_/g, " ")}</Badge>}
                valueSub={p.expiry ? expiryText(p) : undefined}
                onClick={() => setSelected(p)}
                divider={i < data.packs.length - 1}
                tone={p.expiryStatus === "expired" ? "danger" : "default"}
              >
                {p.label_code}
              </Row>
            ))}
          </Group>
        )}
      </Section>
      {selected && <TraySheet pack={selected} onClose={() => setSelected(null)} onChanged={() => { setSelected(null); reload(); }} />}
    </>
  );
}

function TraySheet({ pack, onClose, onChanged }: { pack: Pack; onClose: () => void; onChanged: () => void }) {
  const t = useT();
  const expiryText = useExpiryText();
  const act = useAction(fmt);
  const can = useCan();
  const [confirmExpired, setConfirmExpired] = useState(false);
  const expired = pack.expiryStatus === "expired";

  const open = () =>
    void act.run("open", async () => {
      await cssd.openPack(pack.id);
      onChanged();
    });

  return (
    <Sheet open onClose={onClose} title={pack.label_code}>
      <div className="space-y-4">
        <Callout tone={pack.expiry ? expiryTone(pack.expiryStatus) : "neutral"}>
          <div>{pack.recipe_name ?? t("cssd.tray")} — {pack.status.replace(/_/g, " ")}</div>
          {pack.expiry && <div className="text-caption text-muted-foreground">{expiryText(pack)}</div>}
        </Callout>

        {/**
         * An expired tray can still be opened, and that is deliberate: refusing
         * would be the app making a clinical decision, in a treatment room, with
         * a patient on the table (TESSA.md Rule 2). The confirmation makes it
         * impossible to do by accident, and the server records that it was
         * opened knowingly.
         */}
        {expired && <Callout tone="danger" icon={AlertTriangle}>{t("cssd.trayExpired")}</Callout>}

        {pack.status === "sterile" && can("pack", "open") && (
          <Button className="w-full" onClick={() => (expired ? setConfirmExpired(true) : open())} disabled={act.busy !== null}>
            {t("cssd.openTray")}
          </Button>
        )}
        {pack.status !== "sterile" && (
          <Callout tone="neutral">
{t(`cssd.state.${pack.status === "awaiting_release" || pack.status === "in_cycle" || pack.status === "quarantined" ? pack.status : "packed"}`)}
          </Callout>
        )}

        {act.err && <Callout tone="danger" live="alert">{act.err}</Callout>}
      </div>

      <ConfirmDialog
        open={confirmExpired}
        onOpenChange={setConfirmExpired}
        title={t("cssd.confirmExpired.title")}
        description={t("cssd.confirmExpired.body")}
        confirmLabel={t("cssd.confirmExpired.ok")}
        destructive
        onConfirm={open}
      />
    </Sheet>
  );
}

function Loads() {
  const t = useT();
  const load = useCallback(() => cssd.cycles(), []);
  const { data, error, loading, reload } = useLoad(load, "loads", fmt);
  const [selected, setSelected] = useState<Cycle | null>(null);

  if (error) return <LoadError what="loads" error={error} onRetry={reload} />;
  if (loading || !data) return <Skeleton className="h-64 w-full rounded-2xl" />;

  return (
    <>
      <Section title={t("cssd.loads")}>
        {data.cycles.length === 0 ? (
          <Callout tone="neutral" icon={RotateCcw}>{t("cssd.loads.empty")}</Callout>
        ) : (
          <Group>
            {data.cycles.map((c, i) => (
              <Row
                key={c.id}
                icon={c.status === "failed" ? AlertTriangle : c.status === "released" ? CircleCheck : c.status === "running" ? Play : Timer}
                sub={`${c.machine} · ${t("today.trays.count", { count: c.pack_count ?? 0 })}`}
                value={<Badge tone={STATUS_TONE[c.status] ?? "neutral"}>{c.status}</Badge>}
                onClick={() => setSelected(c)}
                divider={i < data.cycles.length - 1}
                tone={c.status === "failed" ? "danger" : "default"}
              >
                {t("recall.load", { load: c.cycle_number ?? c.id.slice(-6) })}
              </Row>
            ))}
          </Group>
        )}
      </Section>
      {selected && <LoadSheet cycle={selected} onClose={() => setSelected(null)} onChanged={() => { setSelected(null); reload(); }} />}
    </>
  );
}

function LoadSheet({ cycle, onClose, onChanged }: { cycle: Cycle; onClose: () => void; onChanged: () => void }) {
  const nav = useNavigate();
  const t = useT();
  const act = useAction(fmt);
  const can = useCan();
  const [confirmFail, setConfirmFail] = useState(false);
  const detail = useLoad(useCallback(() => cssd.cycle(cycle.id), [cycle.id]), "the load", fmt);

  const verdict = detail.data?.release;
  const released = cycle.status === "released";

  return (
    <Sheet open onClose={onClose} title={t("recall.load", { load: cycle.cycle_number ?? cycle.id.slice(-6) })} size="tall">
      <div className="space-y-4">
        <Callout tone={STATUS_TONE[cycle.status] ?? "neutral"}>
          <div>{cycle.machine} — {cycle.status}</div>
          {cycle.failure_reason && <div className="text-caption">{cycle.failure_reason}</div>}
        </Callout>

        {/**
         * The three indicators, shown separately and never collapsed into one
         * "passed". The gap between them is what makes a recall describable —
         * released on Tuesday's evidence, failed on Thursday's.
         */}
        <Group>
          <Indicator label={t("cssd.machine.printout")} value={cycle.physical_ok} />
          <Indicator label={t("cssd.indicator.chemical")} value={cycle.chemical_ok} />
          <Indicator label={t("cssd.indicator.biological")} value={cycle.biological_ok} divider={false} />
        </Group>

        {cycle.status === "running" && can("sterilisation", "run") && (
          <EndLoad cycleId={cycle.id} onDone={onChanged} />
        )}

        {cycle.status === "ended" && (
          <div className="space-y-2">
            <Button
              className="w-full"
              disabled={!verdict?.ok || act.busy !== null || !can("sterilisation", "release")}
              onClick={() => void act.run("release", async () => { await cssd.release(cycle.id); onChanged(); })}
            >
              {t("cssd.release")}
            </Button>
            {/* The button explains itself rather than being silently grey. */}
            {verdict && !verdict.ok && (
              <p className="px-1 text-caption text-muted-foreground">{t(`block.${verdict.reason}` as never)}</p>
            )}
            {verdict?.ok && verdict.biologicalPending && (
              <p className="px-1 text-caption text-muted-foreground">{t("cssd.bioPending")}</p>
            )}
          </div>
        )}

        {(cycle.status === "ended" || released) && cycle.biological_ok == null && can("sterilisation", "release") && (
          <div className="space-y-2">
            <p className="px-1 text-caption text-muted-foreground">{t("cssd.bioResult")}</p>
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="secondary"
                disabled={act.busy !== null}
                onClick={() => void act.run("bio-pass", async () => { await cssd.biological(cycle.id, true); onChanged(); })}
              >
{t("cssd.indicator.passed")}
              </Button>
              <Button variant="secondary" disabled={act.busy !== null} onClick={() => setConfirmFail(true)}>
{t("cssd.indicator.failed")}
              </Button>
            </div>
          </div>
        )}

        {cycle.status === "failed" && (
          <Button className="w-full" variant="secondary" onClick={() => { onClose(); nav(`/recall/${cycle.id}`); }}>
            {t("cssd.openReport")}
          </Button>
        )}

        {act.err && <Callout tone="danger" live="alert">{act.err}</Callout>}
      </div>

      <ConfirmDialog
        open={confirmFail}
        onOpenChange={setConfirmFail}
        title={released ? t("cssd.confirmFail.released") : t("cssd.confirmFail.title")}
        description={
          released ? t("cssd.confirmFail.releasedBody") : t("cssd.confirmFail.body")
        }
        confirmLabel={t("cssd.confirmFail.ok")}
        destructive
        onConfirm={() => void act.run("bio-fail", async () => { await cssd.biological(cycle.id, false); onChanged(); })}
      />
    </Sheet>
  );
}

/** One indicator. `null` is "not read yet", which is NOT a failure — see
 *  `releaseCheck`'s missing-vs-failed distinction. */
function Indicator({ label, value, divider = true }: { label: string; value: number | null; divider?: boolean }) {
  const t = useT();
  return (
    <Row
      divider={divider}
      value={
        value == null ? (
          <Badge tone="neutral">{t("cssd.indicator.notRead")}</Badge>
        ) : value === 1 ? (
          <Badge tone="success">{t("cssd.indicator.passed")}</Badge>
        ) : (
          <Badge tone="danger">{t("cssd.indicator.failed")}</Badge>
        )
      }
    >
      {label}
    </Row>
  );
}

function EndLoad({ cycleId, onDone }: { cycleId: string; onDone: () => void }) {
  const t = useT();
  const act = useAction(fmt);
  const [physical, setPhysical] = useState<boolean | null>(null);
  const [chemical, setChemical] = useState<boolean | null>(null);
  return (
    <div className="space-y-3">
      <p className="px-1 text-caption text-muted-foreground">{t("cssd.endHint")}</p>
      <YesNo label={t("cssd.machine.printout")} value={physical} onChange={setPhysical} />
      <YesNo label={t("cssd.indicator.chemical")} value={chemical} onChange={setChemical} />
      <Button
        className="w-full"
        disabled={physical === null || chemical === null || act.busy !== null}
        onClick={() =>
          void act.run("end", async () => {
            await cssd.endCycle(cycleId, { physicalOk: physical!, chemicalOk: chemical! });
            onDone();
          })
        }
      >
        {t("cssd.endLoad")}
      </Button>
      {act.err && <Callout tone="danger" live="alert">{act.err}</Callout>}
    </div>
  );
}

function YesNo({ label, value, onChange }: { label: string; value: boolean | null; onChange: (v: boolean) => void }) {
  const t = useT();
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-card px-4 py-3">
      <span className="text-body">{label}</span>
      <div className="flex gap-2">
        <Button size="sm" variant={value === true ? "default" : "secondary"} onClick={() => onChange(true)}>{t("cssd.indicator.passed")}</Button>
        <Button size="sm" variant={value === false ? "destructive" : "secondary"} onClick={() => onChange(false)}>{t("cssd.indicator.failed")}</Button>
      </div>
    </div>
  );
}

/**
 * CASES — what a procedure used, and whether any of it is now in doubt.
 *
 * ── The one thing this screen must never become ─────────────────────────────
 *
 * A place to put patient details. TESSA.md Rule 1: a case holds a REFERENCE the
 * centre typed and a procedure code the centre chose, and nothing else about a
 * person. The form below has two fields for that reason, and the placeholder
 * text says "OP-2026-114" rather than a name on purpose — a blank box labelled
 * "reference" is an invitation to type whatever is on the paperwork.
 *
 * ── Concerns are the reason the detail view exists ──────────────────────────
 *
 * A case closed on Tuesday was correct on Tuesday. On Thursday a load it drew
 * from fails, and the same rows mean something different. `/api/trace/case/:id`
 * joins the trays to their loads to find that, and it is shown at the TOP of the
 * case rather than in a corner, because it is the only thing on the screen that
 * anyone needs to act on.
 */

import { useCallback, useState } from "react";
import { AlertTriangle, Archive, Badge, Button, Callout, ClipboardList, ConfirmDialog, Field, Group, ListChecks, LoadError, Plus, Row, Screen, Section, Sheet, Skeleton, useAction, useLoad } from "@4dl/ui";
import { cases, fmt, trace, type CaseRow } from "../data.js";
import { useT } from "../i18n.js";
import { useCan } from "../session.js";

export function Cases() {
  const t = useT();
  const load = useCallback(() => cases.list(), []);
  const { data, error, loading, reload } = useLoad(load, "cases", fmt);
  const [opening, setOpening] = useState(false);
  const [selected, setSelected] = useState<CaseRow | null>(null);
  const can = useCan();

  if (error) return <Screen><LoadError what="cases" error={error} onRetry={reload} /></Screen>;
  if (loading || !data) return <Screen><Section><Skeleton className="h-64 w-full rounded-2xl" /></Section></Screen>;

  return (
    <Screen>
      <Section
        title={t("cases.title")}
        action={
          can("case", "create") && (
            <Button size="sm" onClick={() => setOpening(true)}>
              <Plus className="size-4" /> {t("cases.open")}
            </Button>
          )
        }
      >
        {data.cases.length === 0 ? (
          <Callout tone="neutral" icon={ClipboardList}>{t("cases.empty")}</Callout>
        ) : (
          <Group>
            {data.cases.map((c, i) => (
              <Row
                key={c.id}
                icon={ClipboardList}
                sub={`${t("cases.items", { count: c.line_count ?? 0 })}${c.procedure_code ? ` · ${c.procedure_code}` : ""}`}
                value={<Badge tone={c.status === "open" ? "primary" : "neutral"}>{c.status}</Badge>}
                /* An amended record is a different kind of document from one
                   written once. Visible in the list, not buried in the detail. */
                valueSub={(c.reopen_count ?? 0) > 0 ? t("cases.amended") : undefined}
                onClick={() => setSelected(c)}
                divider={i < data.cases.length - 1}
              >
                {c.case_ref}
              </Row>
            ))}
          </Group>
        )}
      </Section>

      {opening && <OpenCase onClose={() => setOpening(false)} onDone={() => { setOpening(false); reload(); }} />}
      {selected && <CaseSheet row={selected} onClose={() => setSelected(null)} onChanged={() => { setSelected(null); reload(); }} />}
    </Screen>
  );
}

function OpenCase({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const t = useT();
  const [ref, setRef] = useState("");
  const [code, setCode] = useState("");
  const act = useAction(fmt);
  return (
    <Sheet
      open
      onClose={onClose}
      title={t("cases.open")}
      footer={
        <Button
          className="w-full"
          disabled={!ref.trim() || act.busy !== null}
          onClick={() => void act.run("open", async () => { await cases.open({ caseRef: ref.trim(), procedureCode: code.trim() || undefined }); onDone(); })}
        >
{t("cases.openIt")}
        </Button>
      }
    >
      <div className="space-y-4">
        <Field
          label={t("cases.ref")}
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          placeholder="OP-2026-114"
          hint={t("cases.refHint")}
          autoFocus
        />
        <Field label={t("cases.code")} value={code} onChange={(e) => setCode(e.target.value)} placeholder="EXT-3" hint={t("cases.codeHint")} />
        {act.err && <Callout tone="danger" live="alert">{act.err}</Callout>}
      </div>
    </Sheet>
  );
}

function CaseSheet({ row, onClose, onChanged }: { row: CaseRow; onClose: () => void; onChanged: () => void }) {
  const t = useT();
  const act = useAction(fmt);
  const can = useCan();
  const [confirmReopen, setConfirmReopen] = useState(false);
  // The TRACE endpoint, not the plain detail: it is the one that joins the trays
  // to their loads and can therefore report a concern.
  const { data, error, loading, reload } = useLoad(useCallback(() => trace.case(row.id), [row.id]), "the case", fmt);

  return (
    <Sheet open onClose={onClose} title={row.case_ref} size="tall">
      {error && <LoadError what="the case" error={error} onRetry={reload} />}
      {loading && <Skeleton className="h-48 w-full rounded-2xl" />}
      {data && (
        <div className="space-y-4">
          {/**
           * At the top, in `danger`, before anything else. This is the only
           * thing on the screen anyone has to act on, and burying it under a
           * list of consumed gauze would be the most dangerous layout decision
           * available here.
           */}
          {data.concerns.length > 0 && (
            <Callout tone="danger" icon={AlertTriangle} live="alert">
              <div className="space-y-1">
                <div>
                  {data.concerns.length === 1 ? t("cases.concern.one") : t("cases.concern.many", { count: data.concerns.length })}
                </div>
                {data.concerns.map((c) => (
                  <div key={c.packId} className="text-caption text-muted-foreground">
                    {t("cases.concern.line", { code: c.labelCode ?? "", load: c.cycleNumber ?? c.cycleId?.slice(-6) ?? "" })}
                  </div>
                ))}
              </div>
            </Callout>
          )}

          {data.amended && (
            <Callout tone="warning">
              {row.closed_at ? t("cases.reopened", { date: row.closed_at.slice(0, 10) }) : t("cases.reopenedNoDate")}
            </Callout>
          )}

          <Section title={t("cases.whatUsed")}>
            {data.lines.length === 0 ? (
              <Callout tone="neutral">{t("cases.nothingLogged")}</Callout>
            ) : (
              <Group>
                {data.lines.map((l, i) => (
                  <Row
                    key={l.id}
                    icon={l.tracked_kind === "pack" ? ListChecks : Archive}
                    sub={`${l.event}${l.label_code ? ` · ${l.label_code}` : ""}`}
                    value={l.quantity_delta ? <span className="tabular-nums">{Math.abs(l.quantity_delta)}</span> : undefined}
                    divider={i < data.lines.length - 1}
                    tone={l.cycle_status === "failed" ? "danger" : "default"}
                  >
                    {l.item_name ?? l.tracked_kind}
                  </Row>
                ))}
              </Group>
            )}
          </Section>

          {can("case", "close") && (
            <Button
              className="w-full"
              variant={row.status === "open" ? "default" : "secondary"}
              disabled={act.busy !== null}
              onClick={() =>
                row.status === "open"
                  ? void act.run("close", async () => { await cases.act(row.id, "close"); onChanged(); })
                  : setConfirmReopen(true)
              }
            >
              {row.status === "open" ? t("cases.close") : t("cases.reopen")}
            </Button>
          )}

          {act.err && <Callout tone="danger" live="alert">{act.err}</Callout>}
        </div>
      )}

      <ConfirmDialog
        open={confirmReopen}
        onOpenChange={setConfirmReopen}
        title={t("cases.confirmReopen.title")}
        description={t("cases.confirmReopen.body")}
        confirmLabel={t("cases.reopen")}
        onConfirm={() => void act.run("reopen", async () => { await cases.act(row.id, "reopen"); onChanged(); })}
      />
    </Sheet>
  );
}

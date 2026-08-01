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
import { useCan } from "../session.js";

export function Cases() {
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
        title="Cases"
        action={
          can("case", "create") && (
            <Button size="sm" onClick={() => setOpening(true)}>
              <Plus className="size-4" /> Open a case
            </Button>
          )
        }
      >
        {data.cases.length === 0 ? (
          <Callout tone="neutral" icon={ClipboardList}>No cases yet.</Callout>
        ) : (
          <Group>
            {data.cases.map((c, i) => (
              <Row
                key={c.id}
                icon={ClipboardList}
                sub={`${c.line_count ?? 0} item${c.line_count === 1 ? "" : "s"}${c.procedure_code ? ` · ${c.procedure_code}` : ""}`}
                value={<Badge tone={c.status === "open" ? "primary" : "neutral"}>{c.status}</Badge>}
                /* An amended record is a different kind of document from one
                   written once. Visible in the list, not buried in the detail. */
                valueSub={(c.reopen_count ?? 0) > 0 ? "amended" : undefined}
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
  const [ref, setRef] = useState("");
  const [code, setCode] = useState("");
  const act = useAction(fmt);
  return (
    <Sheet
      open
      onClose={onClose}
      title="Open a case"
      footer={
        <Button
          className="w-full"
          disabled={!ref.trim() || act.busy !== null}
          onClick={() => void act.run("open", async () => { await cases.open({ caseRef: ref.trim(), procedureCode: code.trim() || undefined }); onDone(); })}
        >
          Open it
        </Button>
      }
    >
      <div className="space-y-4">
        <Field
          label="Case reference"
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          placeholder="OP-2026-114"
          hint="Your own reference. Tessa stores nothing else about the patient."
          autoFocus
        />
        <Field label="Procedure code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="EXT-3" hint="Optional — your centre's own code." />
        {act.err && <Callout tone="danger" live="alert">{act.err}</Callout>}
      </div>
    </Sheet>
  );
}

function CaseSheet({ row, onClose, onChanged }: { row: CaseRow; onClose: () => void; onChanged: () => void }) {
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
                  {data.concerns.length === 1 ? "A tray" : `${data.concerns.length} trays`} used in this case came from a load that has since FAILED.
                </div>
                {data.concerns.map((c) => (
                  <div key={c.packId} className="text-caption text-muted-foreground">
                    {c.labelCode} — load {c.cycleNumber ?? c.cycleId?.slice(-6)}
                  </div>
                ))}
              </div>
            </Callout>
          )}

          {data.amended && (
            <Callout tone="warning">
              This record was reopened after it was closed{row.closed_at ? ` on ${row.closed_at.slice(0, 10)}` : ""}.
            </Callout>
          )}

          <Section title="What was used">
            {data.lines.length === 0 ? (
              <Callout tone="neutral">Nothing logged against this case yet. Scan an item while it's open.</Callout>
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
              {row.status === "open" ? "Close this case" : "Reopen it"}
            </Button>
          )}

          {act.err && <Callout tone="danger" live="alert">{act.err}</Callout>}
        </div>
      )}

      <ConfirmDialog
        open={confirmReopen}
        onOpenChange={setConfirmReopen}
        title="Reopen this case?"
        description="It will be marked as amended, with your name and the time, and the original closing time is kept."
        confirmLabel="Reopen it"
        onConfirm={() => void act.run("reopen", async () => { await cases.act(row.id, "reopen"); onChanged(); })}
      />
    </Sheet>
  );
}

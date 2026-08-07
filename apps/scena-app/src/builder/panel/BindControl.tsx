/**
 * BindControl — wires a single widget field (or a widget's list of rows) to a
 * dynamic data source (§sources). Toggle "dynamic" on, pick a source, then map:
 *  - kind "value": a column + row (or "join whole column" for a text run).
 *  - kind "list": which columns become label / value / note (menu items).
 *
 * A live **data viewer** shows the source's real columns × rows, so the operator
 * PICKS by clicking — a cell for a value binding, a header for a list column —
 * instead of typing a column name and a row index. The dropdowns stay as a
 * precise fallback and mirror the same selection. The binding is written into
 * `config.bindings[field]`.
 */
import * as React from "react";
import { Database, Loader2 } from "lucide-react";
import { Field, SelectField, NumberField, SwitchField } from "./fields.js";
import { getSourceData, type Feed } from "../../api.js";
import { str, num, type FieldBinding } from "@scena/widgets";
import type { WNode } from "../types.js";
import { cn } from "@4dl/ui";

function readBindings(node: WNode): Record<string, FieldBinding> {
  const b = node.config.bindings;
  return b && typeof b === "object" ? (b as Record<string, FieldBinding>) : {};
}

/** Resolve a column ref (name, case-insensitive, or numeric index) to an index,
 *  matching the engine's colIndex() so highlights track the real binding. */
function colIndexOf(columns: string[], ref: string | number | undefined): number {
  if (ref == null || ref === "") return -1;
  const s = String(ref);
  const byName = columns.findIndex((c) => c.toLowerCase() === s.toLowerCase());
  if (byName >= 0) return byName;
  const n = Number(s);
  return Number.isInteger(n) && n >= 0 && n < columns.length ? n : -1;
}

export function BindControl({
  node,
  field,
  kind,
  label,
  sources,
  onConfig,
}: {
  node: WNode;
  field: string;
  kind: "value" | "list";
  /** What this binding drives, shown in the toggle (e.g. "value", "items"). */
  label: string;
  sources: Feed[];
  onConfig: (patch: Record<string, unknown>) => void;
}) {
  const bindings = readBindings(node);
  const b = bindings[field];
  const on = !!b?.sourceId;
  const [cols, setCols] = React.useState<string[]>([]);
  const [rows, setRows] = React.useState<string[][]>([]);
  const [loading, setLoading] = React.useState(false);

  // Load the chosen source's live dataset so the viewer + dropdowns show real
  // columns and sample rows (the same call already gave us the columns).
  React.useEffect(() => {
    let live = true;
    if (!b?.sourceId) {
      setCols([]);
      setRows([]);
      return;
    }
    setLoading(true);
    getSourceData(b.sourceId)
      .then((ds) => {
        if (live) {
          setCols(ds.columns);
          setRows(ds.rows.slice(0, 50));
        }
      })
      .catch(() => {
        if (live) {
          setCols([]);
          setRows([]);
        }
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [b?.sourceId]);

  const write = (next: FieldBinding | null) => {
    const map = { ...bindings };
    if (next) map[field] = next;
    else delete map[field];
    onConfig({ bindings: map });
  };
  const patch = (p: Partial<FieldBinding>) => write({ ...(b ?? { sourceId: "" }), kind, ...p } as FieldBinding);

  const colOpts = (allowNone: boolean) => [...(allowNone ? [{ id: "", label: "— none —" }] : []), ...cols.map((c) => ({ id: c, label: c }))];

  // Selected-column indices (for viewer highlighting).
  const valCol = colIndexOf(cols, b?.col);
  const valRow = num(b?.row, 0);
  const labelCol = colIndexOf(cols, b?.labelCol);
  const valueCol = colIndexOf(cols, b?.valueCol);
  const noteCol = colIndexOf(cols, b?.noteCol);

  // Click behaviour on the viewer.
  const onHeader = (ci: number) => {
    if (kind === "value") patch({ col: cols[ci] });
    else patch({ labelCol: cols[ci] }); // list: header assigns the label column
  };
  const onCell = (ci: number, ri: number) => {
    if (kind === "value") patch(b?.join != null ? { col: cols[ci] } : { col: cols[ci], row: ri });
    else patch({ labelCol: cols[ci] });
  };

  return (
    <div className="rounded-lg border border-dashed p-2">
      <SwitchField label={`Bind ${label} to a source`} value={on} onChange={(v) => (v ? patch({ sourceId: sources[0]?.id ?? "" }) : write(null))} />
      {on && (
        <div className="mt-2 flex flex-col gap-2">
          <Field label="Source">
            <SelectField
              value={str(b?.sourceId)}
              onChange={(v) => patch({ sourceId: v })}
              options={[{ id: "", label: "— pick a source —" }, ...sources.map((s) => ({ id: s.id, label: s.name }))]}
            />
          </Field>
          {sources.length === 0 && <p className="text-caption text-muted-foreground">Create a source on the Sources page first.</p>}

          {/* Live data viewer — click to pick. */}
          {b?.sourceId &&
            (loading ? (
              <div className="flex items-center gap-1.5 py-2 text-caption text-muted-foreground">
                <Loader2 className="size-3 animate-spin" /> Loading data…
              </div>
            ) : cols.length === 0 ? (
              <p className="text-caption text-muted-foreground">No columns yet — refresh the source or check its mapping.</p>
            ) : (
              <div className="rounded-md border bg-card">
                <div className="border-b px-2 py-1 text-micro text-muted-foreground uppercase">
                  {kind === "value" ? "Click a cell to bind its column + row" : "Click a header to set the label column"}
                </div>
                {kind === "list" && (
                  // A text legend so the label/value/note columns aren't distinguished by colour alone (a11y).
                  <div className="flex flex-wrap gap-x-3 gap-y-1 border-b px-2 py-1 text-caption text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <span className="size-2 rounded-sm bg-primary" /> Label
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="size-2 rounded-sm bg-success" /> Value
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="size-2 rounded-sm bg-warning" /> Note
                    </span>
                  </div>
                )}
                <div className="max-h-40 overflow-auto">
                  <table className="w-full border-collapse text-caption">
                    <thead>
                      <tr>
                        {cols.map((c, ci) => (
                          <th
                            key={ci}
                            onClick={() => onHeader(ci)}
                            title={c}
                            className={cn(
                              "sticky top-0 cursor-pointer whitespace-nowrap border-b border-r bg-muted px-2 py-1 text-left font-semibold last:border-r-0 hover:bg-accent",
                              kind === "value" && ci === valCol && "bg-primary/15 text-primary",
                              kind === "list" && ci === labelCol && "bg-primary/15 text-primary",
                              kind === "list" && ci === valueCol && "bg-success/15 text-success",
                              kind === "list" && ci === noteCol && "bg-warning/15 text-warning",
                            )}
                          >
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length === 0 ? (
                        <tr>
                          <td colSpan={cols.length} className="px-2 py-2 text-center text-muted-foreground">
                            No rows yet.
                          </td>
                        </tr>
                      ) : (
                        rows.map((r, ri) => (
                          <tr key={ri} className={cn(kind === "value" && b?.join == null && ri === valRow && "bg-primary/5")}>
                            {cols.map((_, ci) => {
                              const selected = kind === "value" && b?.join == null && ci === valCol && ri === valRow;
                              return (
                                <td
                                  key={ci}
                                  onClick={() => onCell(ci, ri)}
                                  title={r[ci] ?? ""}
                                  className={cn(
                                    "max-w-[120px] cursor-pointer truncate border-b border-r px-2 py-1 last:border-r-0 hover:bg-accent",
                                    selected && "bg-primary/20 font-medium text-primary",
                                  )}
                                >
                                  {r[ci] ?? ""}
                                </td>
                              );
                            })}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}

          {/* Precise mapping controls (mirror the viewer selection). */}
          {kind === "value" ? (
            <>
              <Field label="Column">
                <SelectField value={str(b?.col)} onChange={(v) => patch({ col: v })} options={colOpts(false)} />
              </Field>
              {!b?.join && (
                <Field label="Row" hint="0 = first data row">
                  <NumberField value={num(b?.row, 0)} onChange={(v) => patch({ row: v })} min={0} />
                </Field>
              )}
              <SwitchField label="Join whole column" value={!!b?.join} onChange={(v) => patch({ join: v ? " · " : undefined })} />
              {b?.join != null && (
                <Field label="Separator">
                  <SelectField
                    value={str(b?.join, " · ")}
                    onChange={(v) => patch({ join: v })}
                    options={[
                      { id: " · ", label: "Dot ·" },
                      { id: ", ", label: "Comma" },
                      { id: " — ", label: "Dash —" },
                      { id: "\n", label: "New line" },
                    ]}
                  />
                </Field>
              )}
            </>
          ) : (
            <>
              <Field label="Label col">
                <SelectField value={str(b?.labelCol)} onChange={(v) => patch({ labelCol: v })} options={colOpts(false)} />
              </Field>
              <Field label="Value col">
                <SelectField value={str(b?.valueCol)} onChange={(v) => patch({ valueCol: v })} options={colOpts(true)} />
              </Field>
              <Field label="Note col">
                <SelectField value={str(b?.noteCol)} onChange={(v) => patch({ noteCol: v })} options={colOpts(true)} />
              </Field>
              <Field label="Max rows" hint="0 = all">
                <NumberField value={num(b?.max, 0)} onChange={(v) => patch({ max: v })} min={0} max={50} />
              </Field>
            </>
          )}
          <p className="flex items-center gap-1 text-caption text-muted-foreground">
            <Database className="size-3" /> Live — refreshes on the source's schedule.
          </p>
        </div>
      )}
    </div>
  );
}

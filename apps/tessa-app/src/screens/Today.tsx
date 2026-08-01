/**
 * TODAY — the one screen worth opening cold.
 *
 * Not a dashboard. A dashboard shows you how things are going; this shows you
 * what is waiting. Three things, in the order they cost you if ignored:
 *
 *   A FAILED LOAD    a recall in progress. Nothing else on this screen matters
 *                    while one of these is live, so it is a callout, not a row.
 *   AWAITING RELEASE trays out of the machine that nobody has signed for. They
 *                    are unusable until someone does, so this is the queue that
 *                    silently empties a shelf.
 *   EXPIRING         stock and trays running out. Not urgent today, which is
 *                    exactly why it needs a place — nobody notices this one
 *                    until they reach for something.
 *
 * Deliberately NOT here: totals, counts of everything, charts. A stock room does
 * not need to know it holds 412 items; it needs to know which four are a problem.
 */

import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Archive, Button, Callout, CircleCheck, ClipboardList, Group, LoadError, Row, ScanLine, Screen, Section, Skeleton, Tile, TileGrid, Timer, useLoad } from "@4dl/ui";
import { cases, cssd, expiryText, fmt, stock, type Cycle, type Lot, type Pack } from "../data.js";

interface Snapshot {
  lots: Lot[];
  packs: Pack[];
  cycles: Cycle[];
  openCases: number;
}

export function Today({ onScan }: { onScan: () => void }) {
  const nav = useNavigate();
  const load = useCallback(async (): Promise<Snapshot> => {
    // Four reads in parallel: this is the first screen after boot, and doing
    // them in sequence would make the slowest one the whole wait.
    const [shelf, packs, cycles, open] = await Promise.all([
      stock.shelf(),
      cssd.packs(),
      cssd.cycles(),
      cases.list("open"),
    ]);
    return { lots: shelf.lots, packs: packs.packs, cycles: cycles.cycles, openCases: open.cases.length };
  }, []);
  const { data, error, loading, reload } = useLoad(load, "today", fmt);

  if (error) return <Screen><LoadError what="today" error={error} onRetry={reload} /></Screen>;
  if (loading || !data) {
    return (
      <Screen>
        <Section><Skeleton className="h-24 w-full rounded-2xl" /></Section>
        <Section><Skeleton className="h-40 w-full rounded-2xl" /></Section>
      </Screen>
    );
  }

  const failed = data.cycles.filter((c) => c.status === "failed");
  const awaiting = data.cycles.filter((c) => c.status === "ended");
  // Expired first, then soonest — the order a person would triage them in.
  const expiring = [...data.lots, ...data.packs]
    .filter((x) => x.expiryStatus === "soon" || x.expiryStatus === "expired")
    .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0))
    .slice(0, 8);

  return (
    <Screen>
      {/**
       * A failed load outranks everything. It is `danger`, it names the load,
       * and it goes straight to the recall report rather than to a list of
       * loads — the next action after seeing this is never "browse".
       */}
      {failed.map((c) => (
        <Callout key={c.id} tone="danger" icon={AlertTriangle} live="alert" className="mb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              Load {c.cycle_number ?? c.machine} failed{c.failure_reason ? ` — ${c.failure_reason}` : ""}.
            </span>
            <Button size="sm" variant="secondary" onClick={() => nav(`/recall/${c.id}`)}>
              Open the recall
            </Button>
          </div>
        </Callout>
      ))}

      <Section>
        <TileGrid>
          <Tile icon={ScanLine} label="Scan" value="Receive, use, open" onClick={onScan} />
          <Tile icon={Timer} label="Awaiting release" value={`${awaiting.length} load${awaiting.length === 1 ? "" : "s"}`} onClick={() => nav("/cssd")} />
          <Tile icon={Archive} label="On the shelf" value={`${data.lots.length} lots`} onClick={() => nav("/stock")} />
          <Tile icon={ClipboardList} label="Open cases" value={`${data.openCases}`} onClick={() => nav("/cases")} />
        </TileGrid>
      </Section>

      {awaiting.length > 0 && (
        <Section title="Waiting for release">
          <Group>
            {awaiting.map((c, i) => (
              <Row
                key={c.id}
                icon={Timer}
                sub={`${c.pack_count ?? 0} tray${c.pack_count === 1 ? "" : "s"} · ${c.machine}`}
                onClick={() => nav(`/cssd/load/${c.id}`)}
                divider={i < awaiting.length - 1}
              >
                Load {c.cycle_number ?? c.id.slice(-6)}
              </Row>
            ))}
          </Group>
        </Section>
      )}

      <Section title="Expiring">
        {expiring.length === 0 ? (
          <Callout tone="success" icon={CircleCheck}>Nothing expiring in the next month.</Callout>
        ) : (
          <Group>
            {expiring.map((x, i) => {
              const isPack = "recipe_name" in x;
              return (
                <Row
                  key={x.id}
                  icon={isPack ? Timer : Archive}
                  sub={isPack ? (x as Pack).recipe_name : (x as Lot).lot_code ? `Lot ${(x as Lot).lot_code}` : "No lot code"}
                  value={expiryText(x)}
                  onClick={() => nav(isPack ? "/cssd" : "/stock")}
                  divider={i < expiring.length - 1}
                  tone={x.expiryStatus === "expired" ? "danger" : "default"}
                >
                  {isPack ? (x as Pack).label_code : ((x as Lot).item_name ?? "Unnamed")}
                </Row>
              );
            })}
          </Group>
        )}
      </Section>
    </Screen>
  );
}

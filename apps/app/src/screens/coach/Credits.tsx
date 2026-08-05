/**
 * CREDIT ACTIVITY — the whole ledger, over a window the owner chooses.
 *
 * Business's overview carries eight recent movements, which answers "did
 * anything just happen" and nothing else. This screen answers the question
 * that follows it: where did the month go, is it going up, and what exactly is
 * spending it. Same shape as the other two analytics surfaces in the product
 * (Progress, the client Report) — a range picker in the eyebrow, an anchor, a
 * chart, a breakdown, then the rows — because a studio should not have to learn
 * a third layout to read a third number.
 *
 * Three deliberate choices, each of which the obvious version gets wrong:
 *
 *  1. **The breakdown is SPEND ONLY.** A monthly plan grant is a five-figure
 *     positive movement; folded into "where did my credits go" it is the
 *     biggest bar on the screen and it is the one line nobody is asking about.
 *     Additions get their own figure in the strip instead.
 *  2. **The words come off the wire, the glyph comes from the registry.**
 *     `apps/api/src/credit-reasons.ts` names a reason because the AI half of
 *     the set is `ai.<feature>` over a registry only the worker holds;
 *     `registry/credits.ts` decides what a kind LOOKS like. Neither half can
 *     drift into the other's business.
 *  3. **A wire `kind` this build does not know falls back to "Other" rather
 *     than vanishing.** The server can add a spend category before the app
 *     that draws it ships, and an owner accounting for their spend must never
 *     be shown a total its own rows do not add up to.
 */

import { useCallback, useMemo, useState } from "react";
import {
  Page, Eyebrow, Anchor, CountUp, Group, Row, Card, Button, Badge, Meter,
  RangePicker, useDateRange, ChartCard, BarChart, GlanceStrip, EmptyState, Filters,
  Reveal, SkeletonChart, SkeletonList, SkeletonHero, useLoad, LoadError,
  Wallet, TrendingUp, TrendingDown, Coins, ArrowLeft, cn, toneVar,
  type FacetSelection,
} from "@4dl/ui";
import { api, errorText, todayLocal } from "../../api.js";
import { RANGE_PRESETS } from "../../ranges.js";
import { creditKind } from "../../registry/index.js";

interface Entry { at: number; delta: number; balance: number; reason: string; label: string; kind: string; ref: string | null }
interface Bucket { kind: string; label: string; credits: number; count: number }
interface CreditReport {
  window: { start: string; end: string; days: number };
  balance: { balance: number; purchased: number; granted: number; available: number };
  totals: { spent: number; added: number; net: number; movements: number };
  daily: { date: string; spent: number; added: number }[];
  byKind: Bucket[];
  byReason: (Bucket & { reason: string })[];
  entries: Entry[];
  truncated: boolean;
}

const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const stamp = (ms: number) => new Date(ms).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const n = (v: number) => v.toLocaleString();

export function Credits({ onBack }: { onBack: () => void }) {
  const today = todayLocal();
  const range = useDateRange(RANGE_PRESETS, today, "30d");
  // The studio's days, not Greenwich's. A ledger row carries only an epoch, so
  // the offset has to travel with the request for the buckets to be theirs.
  const tz = -new Date().getTimezoneOffset();
  const load = useCallback(
    () => api.get<CreditReport>(`/api/billing/credits?${range.query}&today=${today}&tz=${tz}`),
    [range.query, today, tz],
  );
  const report = useLoad(load, "credit activity", errorText);
  const [facet, setFacet] = useState<FacetSelection>({ kind: null });

  const data = report.data;
  const kind = facet.kind ?? null;
  const rows = useMemo(
    () => (data?.entries ?? []).filter((e) => !kind || e.kind === kind),
    [data, kind],
  );
  const topSpend = data?.byReason[0]?.credits ?? 1;
  // The busiest day, so the chart's headline is a fact the strip above has not
  // already stated.
  const peak = data ? Math.max(0, ...data.daily.map((d) => d.spent)) : 0;

  return (
    <Page className="column space-y-4 p-4 pb-28">
      <div className="flex items-center gap-3">
        <Button size="icon" variant="secondary" onClick={onBack} aria-label="Back"><ArrowLeft /></Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-title-3">Credit activity</h1>
          <p className="truncate text-xs text-muted-foreground">Every credit this studio has spent and gained</p>
        </div>
      </div>

      <Eyebrow action={<RangePicker format={shortDate} {...range.props} />}>This window</Eyebrow>

      {report.error ? (
        <LoadError what="credit activity" error={report.error} onRetry={report.reload} />
      ) : (
      <Reveal
        // `Reveal` owns no layout — it is one div that swaps skeleton for
        // content — so the rhythm has to live on IT, not on the Page above.
        // Without this the strip's labels sit under the next card.
        className="space-y-4"
        loading={report.loading}
        skeleton={<div className="space-y-4"><SkeletonHero /><SkeletonChart bars /><SkeletonList rows={5} card /></div>}
      >
        {data && (
          <>
            {/* The balance is the only number here that is about NOW rather than
                about the window — so it is the anchor, and the window's own
                totals sit under it as a comparison of three. */}
            <Anchor eyebrow="Credits left" sub="across monthly and purchased">
              <CountUp value={data.balance.available} />
            </Anchor>

            <GlanceStrip items={[
              { icon: TrendingDown, tone: "warning", value: n(data.totals.spent), label: "Spent" },
              { icon: TrendingUp, tone: "success", value: n(data.totals.added), label: "Added" },
              { icon: Wallet, tone: data.totals.net >= 0 ? "success" : "danger", value: `${data.totals.net >= 0 ? "+" : ""}${n(data.totals.net)}`, label: "Net" },
            ]} />

            {data.totals.movements === 0 ? (
              <EmptyState
                icon={Coins}
                title="Nothing moved in this window"
                description="Credits are spent when the AI runs and when your studio sends email. Widen the range to look further back."
              />
            ) : (
              <>
                <ChartCard
                  title="Spent per day"
                  icon={Coins}
                  tone="warning"
                  value={peak > 0 ? n(peak) : null}
                  unit="cr"
                  delta={<Badge tone="neutral">busiest day</Badge>}
                >
                  <BarChart
                    values={data.daily.map((d) => d.spent)}
                    tone="warning"
                    height={140}
                    format={(v) => `${n(Math.round(v))} cr`}
                  />
                  <p className="text-xs text-muted-foreground">{shortDate(data.window.start)} – {shortDate(data.window.end)}</p>
                </ChartCard>

                {data.byReason.length > 0 && (
                  <section className="space-y-2">
                    <Eyebrow>What spent them</Eyebrow>
                    <Card className="space-y-3">
                      {data.byReason.slice(0, 8).map((r) => {
                        const spec = creditKind(r.kind);
                        const Glyph = spec.icon;
                        return (
                          <Meter
                            key={r.reason}
                            value={r.credits}
                            max={topSpend}
                            tone={spec.tone}
                            label={<span className="inline-flex items-center gap-1.5"><Glyph aria-hidden className="size-3.5" style={{ color: toneVar[spec.tone] }} />{r.label}</span>}
                            valueLabel={<>{n(r.credits)} cr <span className="text-muted-foreground">· {r.count}×</span></>}
                          />
                        );
                      })}
                    </Card>
                  </section>
                )}
              </>
            )}

            {data.entries.length > 0 && (
              <section className="space-y-2">
                {/* One option per kind that actually OCCURRED — a facet listing
                    categories with nothing in them is a menu of dead ends, and
                    `Filters` drops a facet that cannot split the set anyway. */}
                <Eyebrow action={
                  <Filters
                    groups={[{ key: "kind", label: "Kind", options: data.byKind.map((b) => ({ value: b.kind, label: creditKind(b.kind).label })) }]}
                    value={facet}
                    onChange={setFacet}
                  />
                }>Every movement</Eyebrow>
                <Group>
                  {rows.map((e, i) => {
                    const spec = creditKind(e.kind);
                    const up = e.delta >= 0;
                    return (
                      <Row
                        key={`${e.at}-${i}`}
                        icon={spec.icon}
                        iconTone={up ? "success" : spec.tone}
                        sub={stamp(e.at)}
                        divider={i < rows.length - 1}
                        trailing={
                          <span className="shrink-0 text-right">
                            <span className={cn("numeral block text-body-lg font-semibold", up ? "text-success" : "text-foreground")}>{up ? "+" : ""}{n(e.delta)}</span>
                            <span className="numeral mt-0.5 block text-caption text-muted-foreground">{n(e.balance)} left</span>
                          </span>
                        }
                      >
                        {e.label}
                      </Row>
                    );
                  })}
                </Group>
                {rows.length === 0 && (
                  <p className="px-1 text-xs text-muted-foreground">Nothing of that kind in this window.</p>
                )}
                {data.truncated && (
                  <p className="px-1 text-xs text-muted-foreground">
                    Showing the most recent 300 movements. The totals and the chart above cover the whole window.
                  </p>
                )}
              </section>
            )}
          </>
        )}
      </Reveal>
      )}
    </Page>
  );
}

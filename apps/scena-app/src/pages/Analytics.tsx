/**
 * Proof-of-play & analytics (BLUEPRINT §22). Advertisers and compliance need
 * provable logs: content X displayed on screen Y at time T. This surfaces the
 * playout telemetry the screens report — most-played, per-screen, per-day — and
 * exports it as CSV, the artifact that makes the ad system sellable.
 */

import { useEffect, useState } from "react";
import { Download, BarChart3 } from "lucide-react";
import { StatTile } from "../components/status.js";
import { Card, EmptyState, LoadError, PageHeader, SectionHeader, Skeleton, usePageChrome } from "@4dl/ui";
import { getAnalytics, analyticsCsvUrl, type AnalyticsSummary } from "../api.js";

/** Trigger a CSV download without navigating away from the page. */
function downloadCsv() {
  const a = document.createElement("a");
  a.href = analyticsCsvUrl();
  a.download = "scena-analytics.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      getAnalytics()
        .then((d) => {
          if (alive) {
            setData(d);
            setErr(null);
          }
        })
        .catch((e) => alive && setErr(e instanceof Error ? e.message : String(e)));
    load();
    const t = setInterval(load, 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  usePageChrome(
    {
      crumbs: [{ label: "Analytics" }],
      actions:
        data && data.totalPlays > 0
          ? [{ key: "csv", label: "Export CSV", icon: <Download className="size-4" />, variant: "outline", onClick: () => downloadCsv() }]
          : [],
    },
    [data?.totalPlays],
  );

  const totalMs = data ? data.byContent.reduce((s, c) => s + c.totalMs, 0) : 0;

  return (
    <div>
      <PageHeader
        title="Analytics"
        description={
          data
            ? `${data.totalPlays.toLocaleString()} plays across ${data.activeScreens} active screen${data.activeScreens === 1 ? "" : "s"}`
            : "Proof-of-play telemetry from your fleet."
        }
      />

      {/* This polls every three seconds, so the error only replaces the page
          while there is nothing to replace — a working dashboard must not blink
          to an error card because one request in nine hundred dropped. */}
      {err && !data ? (
        <LoadError
          what="analytics"
          error={err}
          onRetry={() =>
            void getAnalytics()
              .then((d) => {
                setData(d);
                setErr(null);
              })
              .catch(() => undefined)
          }
        />
      ) : !data ? (
        <AnalyticsSkeleton />
      ) : (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatTile label="Total plays" value={data.totalPlays.toLocaleString()} valueClassName="text-primary" />
            <StatTile label="Active screens" value={data.activeScreens.toLocaleString()} />
            <StatTile label="Distinct content" value={data.byContent.length.toLocaleString()} />
            <StatTile label="Airtime" value={fmtDur(totalMs)} />
          </div>

          <Card>
            <SectionHeader title="Plays per day" className="mb-4" />
            <DayChart days={data.byDay} />
          </Card>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.3fr_1fr]">
            <Card>
              <SectionHeader title="Most played" className="mb-4" />
              {data.byContent.length === 0 ? (
                <Empty />
              ) : (
                <div className="flex flex-col">
                  {data.byContent.map((c) => (
                    <Row
                      key={c.contentId}
                      left={c.contentId}
                      right={`${c.plays.toLocaleString()} plays`}
                      sub={fmtDur(c.totalMs)}
                      bar={c.plays / (data.byContent[0]?.plays || 1)}
                    />
                  ))}
                </div>
              )}
            </Card>
            <Card>
              <SectionHeader title="By screen" className="mb-4" />
              {data.byScreen.length === 0 ? (
                <Empty />
              ) : (
                <div className="flex flex-col">
                  {data.byScreen.map((s) => (
                    <Row
                      key={s.screenId}
                      left={s.name ?? s.screenId.slice(0, 10)}
                      right={s.plays.toLocaleString()}
                      bar={s.plays / (data.byScreen[0]?.plays || 1)}
                    />
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function DayChart({ days }: { days: { day: string; plays: number }[] }) {
  if (days.length === 0) return <Empty />;
  const max = Math.max(...days.map((d) => d.plays), 1);
  // Labels may be dates ("2026-07-04" → "07-04") or short day names ("Mon"); keep both readable.
  const label = (day: string) => (/^\d{4}-\d{2}-\d{2}/.test(day) ? day.slice(5) : day.slice(0, 3));
  return (
    // items-stretch lets each column fill the fixed height, so the bar's %-height resolves.
    <div className="flex h-44 items-stretch gap-1.5 sm:gap-2.5">
      {days.map((d) => (
        <div key={d.day} className="group flex flex-1 flex-col items-center gap-1.5">
          <div className="flex w-full flex-1 items-end">
            <div
              className="w-full rounded-t-md bg-primary/70 transition-colors group-hover:bg-primary"
              style={{ height: `${Math.max(2, (d.plays / max) * 100)}%` }}
              title={`${d.plays.toLocaleString()} plays`}
            />
          </div>
          <div className="font-mono text-caption tabular-nums text-muted-foreground">{d.plays.toLocaleString()}</div>
          <div className="text-caption text-muted-foreground/70">{label(d.day)}</div>
        </div>
      ))}
    </div>
  );
}

function Row({ left, right, sub, bar }: { left: string; right: string; sub?: string; bar: number }) {
  return (
    <div className="border-b py-2.5 last:border-0">
      <div className="flex items-baseline gap-2">
        <span className="truncate font-mono text-caption font-medium">{left}</span>
        <div className="flex-1" />
        <span className="font-mono text-caption font-semibold tabular-nums">{right}</span>
        {sub && <span className="font-mono text-caption tabular-nums text-muted-foreground">{sub}</span>}
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, bar * 100)}%` }} />
      </div>
    </div>
  );
}

const Empty = () => (
  <EmptyState icon={BarChart3} title="No plays recorded yet" description="Once your screens start playing content, proof-of-play data will show up here." />
);

function AnalyticsSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i}>
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2.5 h-7 w-16" />
          </Card>
        ))}
      </div>
      <Card>
        <div className="mb-4 pb-3">
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="flex h-40 items-end gap-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="flex-1 rounded-t-sm" style={{ height: `${30 + ((i * 37) % 70)}%` }} />
          ))}
        </div>
      </Card>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.3fr_1fr]">
        {[0, 1].map((col) => (
          <Card key={col}>
            <div className="mb-4 pb-3">
              <Skeleton className="h-4 w-24" />
            </div>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-1 w-full rounded-full" />
              </div>
            ))}
          </Card>
        ))}
      </div>
    </div>
  );
}

function fmtDur(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

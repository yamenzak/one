/**
 * Sources (§sources). A source is a dynamic data feed — Manual, RSS, a public
 * API (JSON), or a public Google Sheet — normalized to one shape: a table of
 * columns + rows. Widgets bind fields to a source in the builder (a ticker's
 * headlines, a metric's value, a menu's rows, a text string). API/Sheet sources
 * carry a fetch frequency + a response/cell mapping and are refreshed on a cron;
 * this page creates, previews, edits, and manages them.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Plus, RefreshCw, X, ExternalLink, Rss, Trash2, Inbox, Globe, Sheet, Table2, MoreVertical, CloudSun } from "lucide-react";
import { Button } from "../components/ui/button.js";
import { Card, CardContent } from "../components/ui/card.js";
import { Input } from "../components/ui/input.js";
import { Label } from "../components/ui/label.js";
import { Badge } from "../components/ui/badge.js";
import { Skeleton } from "../components/ui/skeleton.js";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../components/ui/dialog.js";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select.js";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "../components/ui/table.js";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "../components/ui/dropdown-menu.js";
import { PageHeader } from "../components/page-header.js";
import { EmptyState } from "../components/empty-state.js";
import { usePageChrome } from "../components/page-chrome.js";
import { toast } from "../components/toast.js";
import { confirmDialog } from "../components/confirm.js";
import { useCan } from "../permissions.js";
import { cn } from "@/lib/utils";
import {
  listFeeds, getFeed, createSource, updateSource, previewSource, addFeedItem, deleteFeedItem, refreshFeed, deleteFeed,
  listWeatherLocations, addWeatherLocation, updateWeatherLocation, deleteWeatherLocation, refreshWeatherLocation,
  type Feed, type SourceProvider, type SourceDataset, type WeatherLocation, type WeatherLocationInput,
} from "../api.js";

/** Providers shown in the picker. `weather` is a metered, company-provided
 *  source with its own backend (city + conditions), unlike the data feeds. */
type NewProvider = SourceProvider | "weather";

const PROVIDERS: Record<NewProvider, { label: string; icon: typeof Rss; blurb: string }> = {
  manual: { label: "Manual", icon: Inbox, blurb: "You add each item by hand" },
  rss: { label: "RSS", icon: Rss, blurb: "Auto-pulls headlines from a feed URL" },
  api: { label: "API", icon: Globe, blurb: "Fetch JSON from any public endpoint" },
  gsheet: { label: "Google Sheet", icon: Sheet, blurb: "Read rows from a public sheet" },
  weather: { label: "Weather", icon: CloudSun, blurb: "Local conditions for a city (metered)" },
};

const FREQUENCIES = [
  { sec: 60, label: "Every minute" },
  { sec: 300, label: "Every 5 minutes" },
  { sec: 900, label: "Every 15 minutes" },
  { sec: 3600, label: "Every hour" },
  { sec: 21600, label: "Every 6 hours" },
  { sec: 86400, label: "Daily" },
];

const isTabular = (p: SourceProvider) => p === "api" || p === "gsheet";

/** Calls/day a [open, close) window implies — mirrors the server's callsPerDay. */
function weatherCallsPerDay(open: number, close: number): number {
  if (open === close) return 24;
  return close > open ? close - open : 24 - open + close;
}

/** The browser's IANA timezone, for a sensible default when adding a location. */
function browserTz(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
}

/** Common timezones for the picker's datalist (the field accepts any IANA id). */
function tzOptions(): string[] {
  try {
    const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    if (fn) return fn("timeZone");
  } catch { /* older browsers */ }
  return ["UTC", "Europe/London", "Europe/Amsterdam", "America/New_York", "America/Chicago", "America/Los_Angeles", "Asia/Dubai", "Asia/Singapore", "Australia/Sydney"];
}

/* ================================ List view ============================== */

export function FeedsPage() {
  const navigate = useNavigate();
  const can = useCan();
  const canCreate = can("content", "create");
  const [feeds, setFeeds] = useState<Feed[] | null>(null);
  const [weather, setWeather] = useState<WeatherLocation[]>([]);
  const [perCall, setPerCall] = useState(3);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editLoc, setEditLoc] = useState<WeatherLocation | null>(null);

  async function reloadList() {
    setError(null);
    try {
      const [fs, wx] = await Promise.all([listFeeds(), listWeatherLocations().catch(() => ({ locations: [], creditsPerCall: 3 }))]);
      setFeeds(fs);
      setWeather(wx.locations);
      setPerCall(wx.creditsPerCall);
      return fs;
    } catch (e) {
      setError(String(e));
      return [];
    }
  }
  useEffect(() => { reloadList(); }, []);

  usePageChrome(
    { crumbs: [{ label: "Sources" }], actions: canCreate ? [{ key: "new", label: "New source", icon: <Plus className="size-4" />, onClick: () => setAddOpen(true) }] : [] },
    [canCreate],
  );

  async function createNew(input: { name: string; provider: SourceProvider; config?: unknown; refreshSec?: number }) {
    const { id } = await createSource(input);
    await reloadList();
    navigate(`/feeds/${id}`);
    toast.success(`Source “${input.name}” created.`);
  }

  async function createWeather(input: WeatherLocationInput) {
    const r = await addWeatherLocation(input);
    if (r.error) { toast.error(r.error); return; }
    await reloadList();
    toast.success("Weather location added.");
  }

  async function removeSource(feed: Feed) {
    const ok = await confirmDialog({
      title: `Delete “${feed.name}”?`,
      description: "The source is removed. Widgets bound to it will stop updating.",
      confirmText: "Delete source",
      destructive: true,
    });
    if (!ok) return;
    await deleteFeed(feed.id);
    await reloadList();
    toast.success(`Source “${feed.name}” deleted.`);
  }

  async function removeWeather(l: WeatherLocation) {
    const ok = await confirmDialog({
      title: `Remove ${l.label}?`,
      description: "Weather widgets bound to this location will stop updating.",
      confirmText: "Remove location",
      destructive: true,
    });
    if (!ok) return;
    await deleteWeatherLocation(l.id);
    await reloadList();
    toast.success("Location removed.");
  }

  const total = (feeds?.length ?? 0) + weather.length;

  return (
    <div>
      <PageHeader
        title="Sources"
        description={
          total
            ? `${total} source${total === 1 ? "" : "s"} · RSS, API, Google Sheets, and weather`
            : "Live data — RSS, a public API, a Google Sheet, or local weather — for your ticker, metric, menu, weather, and text widgets."
        }
      />

      {error ? (
        <Card className="border-dashed"><CardContent className="py-14 text-center text-sm text-muted-foreground">Couldn't reach the API: {error}</CardContent></Card>
      ) : !feeds ? (
        <div className="overflow-hidden rounded-xl bg-card shadow-sm">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="m-2 h-12 rounded-lg" />)}
        </div>
      ) : total === 0 ? (
        <EmptyState
          scena="idle"
          title="No sources yet"
          description="Connect a Google Sheet or public API, add a weather location, or curate a manual list — then bind it to a widget in the builder."
          action={canCreate ? <Button onClick={() => setAddOpen(true)}><Plus className="size-4" /> Add your first source</Button> : undefined}
        />
      ) : (
        <div className="overflow-hidden rounded-xl bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Name</TableHead>
                <TableHead className="w-32">Type</TableHead>
                <TableHead className="w-40 text-right">Detail</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {feeds.map((f) => {
                const Icon = PROVIDERS[f.provider]?.icon ?? Inbox;
                return (
                  <TableRow key={f.id} className="cursor-pointer" onClick={() => navigate(`/feeds/${f.id}`)}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="size-4" /></div>
                        <span className="truncate font-medium">{f.name}</span>
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="secondary" className="font-normal">{PROVIDERS[f.provider]?.label ?? f.provider}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{f.itemCount ?? 0} <span className="text-xs">{isTabular(f.provider) ? "row" : "item"}{(f.itemCount ?? 0) === 1 ? "" : "s"}</span></TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-8" aria-label="Source actions"><MoreVertical className="size-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem className="text-destructive" onClick={() => removeSource(f)}><Trash2 className="size-4" /> Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
              {weather.map((l) => (
                <TableRow key={l.id} className="cursor-pointer" onClick={() => setEditLoc(l)}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><CloudSun className="size-4" /></div>
                      <div className="min-w-0">
                        <div className="truncate font-medium">{l.label}</div>
                        <div className="text-[11px] tabular-nums text-muted-foreground">{l.current ? `${l.current.temp}° · ${l.current.condition}` : "no data yet"}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell><Badge variant="secondary" className="font-normal">Weather</Badge></TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">~{l.dailyCredits} <span className="text-xs">cr/day</span></TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8" aria-label="Location actions"><MoreVertical className="size-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditLoc(l)}><CloudSun className="size-4" /> Edit</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => removeWeather(l)}><Trash2 className="size-4" /> Remove</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <NewSourceDialog open={addOpen} onClose={() => setAddOpen(false)} onCreate={createNew} onCreateWeather={createWeather} weatherPerCall={perCall} />
      <WeatherEditDialog loc={editLoc} perCall={perCall} onClose={() => setEditLoc(null)} onSaved={reloadList} />
    </div>
  );
}

/* ================================ Detail view =========================== */

export function SourceDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [feed, setFeed] = useState<Feed | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  const reload = () => getFeed(id).then(setFeed).catch(() => setFeed(null)).finally(() => setLoaded(true));
  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  async function refresh() {
    if (!feed) return;
    setBusy(true);
    const r = await refreshFeed(feed.id);
    await reload();
    setBusy(false);
    if (r.error) toast.error(r.error);
    else toast.success(`Refreshed — ${r.count ?? 0} ${isTabular(feed.provider) ? "row" : "item"}${(r.count ?? 0) === 1 ? "" : "s"}.`);
  }

  async function remove() {
    if (!feed) return;
    const ok = await confirmDialog({ title: `Delete “${feed.name}”?`, description: "The source is removed. Widgets bound to it will stop updating.", confirmText: "Delete source", destructive: true });
    if (!ok) return;
    await deleteFeed(feed.id);
    toast.success(`Source “${feed.name}” deleted.`);
    navigate("/feeds");
  }

  usePageChrome(
    {
      crumbs: [{ label: "Sources", to: "/feeds" }, { label: feed?.name ?? "…" }],
      actions: [
        ...(feed && feed.provider !== "manual" ? [{ key: "refresh", label: busy ? "Refreshing…" : "Refresh", icon: <RefreshCw className={cn("size-4", busy && "animate-spin")} />, disabled: busy, onClick: refresh }] : []),
        { key: "delete", label: "Delete source", icon: <Trash2 className="size-4" />, variant: "destructive" as const, overflow: "always" as const, onClick: remove },
      ],
    },
    [feed?.name, feed?.provider, busy],
  );

  if (loaded && !feed) {
    return <div><PageHeader title="Source" description="Not found." back={{ label: "Sources", onClick: () => navigate("/feeds") }} /></div>;
  }

  const freq = feed ? FREQUENCIES.find((f) => f.sec === feed.refreshSec)?.label : "";
  const count = feed?.itemCount ?? 0;
  const unit = feed && isTabular(feed.provider) ? "row" : "item";

  return (
    <div>
      <PageHeader
        title={feed?.name ?? "Source"}
        description={feed ? `${PROVIDERS[feed.provider]?.label ?? feed.provider} source · ${count} ${unit}${count === 1 ? "" : "s"}${feed.provider !== "manual" && freq ? ` · refreshes ${freq.toLowerCase()}` : ""}` : "…"}
        back={{ label: "All sources", onClick: () => navigate("/feeds") }}
      />

      {!loaded || !feed ? (
        <Card><CardContent className="space-y-3 p-5"><Skeleton className="h-9 w-full" /><Skeleton className="h-24 w-full" /></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-5">
            {feed.provider === "manual" && <ManualItems feed={feed} onReload={reload} />}
            {feed.provider === "rss" && <RssDetail feed={feed} onReload={reload} />}
            {isTabular(feed.provider) && <TabularDetail feed={feed} onReload={reload} />}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** Manual: an add-item form + the current item list. */
function ManualItems({ feed, onReload }: { feed: Feed; onReload: () => Promise<void> }) {
  return (
    <>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const el = e.currentTarget.elements.namedItem("t") as HTMLInputElement;
          if (el.value.trim()) { await addFeedItem(feed.id, el.value.trim()); el.value = ""; await onReload(); }
        }}
        className="mb-4 flex gap-2"
      >
        <Input name="t" placeholder="Add an item…" className="flex-1" />
        <Button type="submit"><Plus className="size-4" /> Add</Button>
      </form>
      <ItemList feed={feed} onDelete={async (itemId) => { await deleteFeedItem(feed.id, itemId); await onReload(); }} />
    </>
  );
}

function ItemList({ feed, onDelete }: { feed: Feed; onDelete?: (itemId: string) => void }) {
  const items = feed.items ?? [];
  if (items.length === 0) return <div className="rounded-lg border border-dashed bg-card/40 px-4 py-10 text-center text-sm text-muted-foreground">No items yet.</div>;
  return (
    <div className="divide-y rounded-lg border">
      {items.map((it) => (
        <div key={it.id} className="group flex items-center gap-2.5 px-3 py-2.5">
          <span className="min-w-0 flex-1 truncate text-sm">{it.title}</span>
          {it.link && <a href={it.link} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline"><ExternalLink className="size-3" /> link</a>}
          {onDelete && <button onClick={() => onDelete(it.id)} className="shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-all hover:bg-accent hover:text-foreground group-hover:opacity-100" aria-label="Remove item"><X className="size-4" /></button>}
        </div>
      ))}
    </div>
  );
}

/** RSS: an editable URL + entry count + frequency, above the current headlines. */
function RssDetail({ feed, onReload }: { feed: Feed; onReload: () => Promise<void> }) {
  const [cfg, setCfg] = useState<Record<string, string>>(() => ({
    url: feed.config.url ?? "",
    count: feed.config.count != null ? String(feed.config.count) : "",
  }));
  const [refreshSec, setRefreshSec] = useState(feed.refreshSec ?? 900);
  const [saving, setSaving] = useState(false);
  const curCount = feed.config.count ?? 30;
  const nextCount = (() => { const n = parseInt(cfg.count ?? "", 10); return Number.isFinite(n) && n > 0 ? Math.min(100, n) : 30; })();
  const dirty = refreshSec !== (feed.refreshSec ?? 900) || cfg.url !== (feed.config.url ?? "") || nextCount !== curCount;
  const save = async () => {
    setSaving(true);
    await updateSource(feed.id, { config: configFor("rss", cfg), refreshSec });
    await onReload();
    setSaving(false);
    toast.success("Source updated — refresh to apply.");
  };
  return (
    <div className="space-y-4">
      <SourceConfigFields provider="rss" cfg={cfg} setCfg={setCfg} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5"><Label>Refresh frequency</Label><FrequencySelect value={refreshSec} onChange={setRefreshSec} /></div>
        <div className="flex-1" />
        {dirty && <Button size="sm" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save changes"}</Button>}
      </div>
      <div>
        <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><Rss className="size-3.5" /> Headlines</div>
        <ItemList feed={feed} />
      </div>
    </div>
  );
}

/** API / Sheet: an editable config + frequency + a live dataset preview. */
function TabularDetail({ feed, onReload }: { feed: Feed; onReload: () => Promise<void> }) {
  const [cfg, setCfg] = useState<Record<string, string>>(() => ({
    url: feed.config.url ?? "", path: feed.config.path ?? "", sheetId: feed.config.sheetId ?? "", gid: feed.config.gid ?? "",
  }));
  const [refreshSec, setRefreshSec] = useState(feed.refreshSec ?? 900);
  const [saving, setSaving] = useState(false);
  const dirty = useMemo(
    () => refreshSec !== (feed.refreshSec ?? 900) || cfg.url !== (feed.config.url ?? "") || cfg.path !== (feed.config.path ?? "") || cfg.sheetId !== (feed.config.sheetId ?? "") || cfg.gid !== (feed.config.gid ?? ""),
    [cfg, refreshSec, feed],
  );
  const save = async () => {
    setSaving(true);
    await updateSource(feed.id, { config: configFor(feed.provider, cfg), refreshSec });
    await onReload();
    setSaving(false);
    toast.success("Source updated.");
  };

  return (
    <div className="space-y-4">
      <SourceConfigFields provider={feed.provider} cfg={cfg} setCfg={setCfg} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label>Refresh frequency</Label>
          <FrequencySelect value={refreshSec} onChange={setRefreshSec} />
        </div>
        <div className="flex-1" />
        {dirty && <Button size="sm" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save changes"}</Button>}
      </div>
      <div>
        <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><Table2 className="size-3.5" /> Data preview</div>
        <DatasetTable dataset={feed.dataset ?? { columns: [], rows: [] }} />
      </div>
    </div>
  );
}

/** A compact, scrollable preview of a normalized dataset. */
function DatasetTable({ dataset }: { dataset: SourceDataset }) {
  if (dataset.columns.length === 0) return <div className="rounded-lg border border-dashed bg-card/40 px-4 py-10 text-center text-sm text-muted-foreground">No data yet — check the URL/mapping and refresh.</div>;
  const rows = dataset.rows.slice(0, 12);
  return (
    <div className="max-h-72 overflow-auto rounded-lg border">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-muted/80 backdrop-blur">
          <tr>{dataset.columns.map((c, i) => <th key={i} className="px-2.5 py-1.5 text-left font-semibold">{c}</th>)}</tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r, ri) => <tr key={ri} className="hover:bg-muted/40">{dataset.columns.map((_, ci) => <td key={ci} className="max-w-[220px] truncate px-2.5 py-1.5 tabular-nums">{r[ci] ?? ""}</td>)}</tr>)}
        </tbody>
      </table>
      {dataset.rows.length > rows.length && <div className="border-t px-2.5 py-1.5 text-[11px] text-muted-foreground">+ {dataset.rows.length - rows.length} more row{dataset.rows.length - rows.length === 1 ? "" : "s"}</div>}
    </div>
  );
}

/* -------------------------------- config UI ------------------------------- */

function configFor(provider: SourceProvider, cfg: Record<string, string>): Record<string, string | number> {
  const g = (k: string) => (cfg[k] ?? "").trim();
  if (provider === "api") return { url: g("url"), path: g("path") };
  if (provider === "gsheet") return { url: g("sheetId"), gid: g("gid") };
  if (provider === "rss") {
    const count = parseInt(g("count"), 10);
    return { url: g("url"), count: Number.isFinite(count) && count > 0 ? Math.min(100, count) : 30 };
  }
  return {};
}

function SourceConfigFields({ provider, cfg, setCfg }: { provider: SourceProvider; cfg: Record<string, string>; setCfg: (u: (c: Record<string, string>) => Record<string, string>) => void }) {
  const set = (k: string) => (v: string) => setCfg((c) => ({ ...c, [k]: v }));
  if (provider === "rss") {
    return (
      <div className="space-y-3">
        <div className="space-y-1.5"><Label>RSS URL</Label><Input value={cfg.url} onChange={(e) => set("url")(e.target.value)} className="font-mono text-xs" placeholder="https://…/feed.xml" /></div>
        <div className="space-y-1.5">
          <Label>Entries to fetch <span className="font-normal text-muted-foreground">(1–100)</span></Label>
          <Input type="number" min={1} max={100} value={cfg.count} onChange={(e) => set("count")(e.target.value)} className="w-32 text-xs tabular-nums" placeholder="30" />
          <p className="text-[10.5px] text-muted-foreground">How many recent headlines to keep. Default 30.</p>
        </div>
      </div>
    );
  }
  if (provider === "api") {
    return (
      <div className="space-y-3">
        <div className="space-y-1.5"><Label>Endpoint URL</Label><Input value={cfg.url} onChange={(e) => set("url")(e.target.value)} className="font-mono text-xs" placeholder="https://api.example.com/stats" /></div>
        <div className="space-y-1.5"><Label>Data path <span className="font-normal text-muted-foreground">(optional)</span></Label><Input value={cfg.path} onChange={(e) => set("path")(e.target.value)} className="font-mono text-xs" placeholder="data.items" /><p className="text-[10.5px] text-muted-foreground">Dot/bracket path to the array or object to tabulate, e.g. <code>results[0].rows</code>. Leave blank for the whole response.</p></div>
      </div>
    );
  }
  // gsheet
  return (
    <div className="space-y-3">
      <div className="space-y-1.5"><Label>Sheet URL or ID</Label><Input value={cfg.sheetId} onChange={(e) => set("sheetId")(e.target.value)} className="font-mono text-xs" placeholder="https://docs.google.com/spreadsheets/d/…" /><p className="text-[10.5px] text-muted-foreground">The sheet must be shared as “Anyone with the link”. The first row is used as column headers.</p></div>
      <div className="space-y-1.5"><Label>Tab gid <span className="font-normal text-muted-foreground">(optional)</span></Label><Input value={cfg.gid} onChange={(e) => set("gid")(e.target.value)} className="font-mono text-xs w-32" placeholder="0" /></div>
    </div>
  );
}

function FrequencySelect({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const known = FREQUENCIES.some((f) => f.sec === value);
  return (
    <Select value={known ? String(value) : "custom"} onValueChange={(v) => { if (v !== "custom") onChange(Number(v)); }}>
      <SelectTrigger className="h-9 w-44 text-sm"><SelectValue /></SelectTrigger>
      <SelectContent>
        {FREQUENCIES.map((f) => <SelectItem key={f.sec} value={String(f.sec)} className="text-sm">{f.label}</SelectItem>)}
        {!known && <SelectItem value="custom" className="text-sm">Custom ({value}s)</SelectItem>}
      </SelectContent>
    </Select>
  );
}

/* ------------------------------ weather config ---------------------------- */

interface WeatherWindow { openHour: number; closeHour: number; tz: string; units: string }

/** An hour-of-day picker (00:00 … 24:00). */
function HourSelect({ value, onChange }: { value: number; onChange: (h: number) => void }) {
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
      <SelectContent>
        {Array.from({ length: 25 }, (_, h) => <SelectItem key={h} value={String(h)} className="text-sm">{String(h).padStart(2, "0")}:00</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

/** Opening-hours window + timezone + units + a live daily-cost estimate. Shared
 *  by the add and edit dialogs. */
function WeatherWindowFields({ w, setW, perCall }: { w: WeatherWindow; setW: (u: Partial<WeatherWindow>) => void; perCall: number }) {
  const calls = weatherCallsPerDay(w.openHour, w.closeHour);
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>Opens</Label><HourSelect value={w.openHour} onChange={(h) => setW({ openHour: h })} /></div>
        <div className="space-y-1.5"><Label>Closes</Label><HourSelect value={w.closeHour} onChange={(h) => setW({ closeHour: h })} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Timezone</Label>
          <Input list="tz-list" value={w.tz} onChange={(e) => setW({ tz: e.target.value })} className="text-xs" placeholder="Europe/Amsterdam" />
          <datalist id="tz-list">{tzOptions().map((z) => <option key={z} value={z} />)}</datalist>
        </div>
        <div className="space-y-1.5">
          <Label>Units</Label>
          <Select value={w.units} onValueChange={(v) => setW({ units: v })}>
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="metric" className="text-sm">Metric (°C)</SelectItem>
              <SelectItem value="imperial" className="text-sm">Imperial (°F)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <p className="rounded-lg border border-dashed px-3 py-2 text-[11px] text-muted-foreground">
        Refreshes once an hour while open — about <b className="tabular-nums">{calls} call{calls === 1 ? "" : "s"}/day</b> ≈ <b className="tabular-nums">{calls * perCall} credits/day</b>. Screens keep showing the last reading outside these hours.
      </p>
    </>
  );
}

/* ------------------------------ new source -------------------------------- */

function NewSourceDialog({ open, onClose, onCreate, onCreateWeather, weatherPerCall }: {
  open: boolean;
  onClose: () => void;
  onCreate: (input: { name: string; provider: SourceProvider; config?: unknown; refreshSec?: number }) => Promise<void>;
  onCreateWeather: (input: WeatherLocationInput) => Promise<void>;
  weatherPerCall: number;
}) {
  const [provider, setProvider] = useState<NewProvider>("gsheet");
  const [name, setName] = useState("");
  const [cfg, setCfg] = useState<Record<string, string>>({ url: "", path: "", sheetId: "", gid: "", count: "" });
  const [refreshSec, setRefreshSec] = useState(900);
  const [city, setCity] = useState("");
  const [w, setWState] = useState<WeatherWindow>({ openHour: 8, closeHour: 20, tz: browserTz(), units: "metric" });
  const setW = (u: Partial<WeatherWindow>) => setWState((c) => ({ ...c, ...u }));
  const [preview, setPreview] = useState<SourceDataset | null>(null);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);

  function reset() {
    setProvider("gsheet"); setName(""); setCfg({ url: "", path: "", sheetId: "", gid: "", count: "" });
    setRefreshSec(900); setCity(""); setWState({ openHour: 8, closeHour: 20, tz: browserTz(), units: "metric" });
    setPreview(null); setPreviewErr(null); setBusy(false); setTesting(false);
  }
  function close() { onClose(); reset(); }

  const isFeed = provider !== "weather";
  const needsConfig = provider === "rss" || (isFeed && isTabular(provider as SourceProvider));
  const configReady = provider === "weather"
    ? !!city.trim()
    : provider === "manual"
      || (provider === "rss" && (cfg.url ?? "").trim())
      || (provider === "api" && (cfg.url ?? "").trim())
      || (provider === "gsheet" && (cfg.sheetId ?? "").trim());

  async function test() {
    if (provider === "weather") return;
    setTesting(true); setPreviewErr(null); setPreview(null);
    const r = await previewSource(provider as SourceProvider, configFor(provider as SourceProvider, cfg));
    setTesting(false);
    if (r.error || !r.dataset) setPreviewErr(r.error ?? "No data returned");
    else setPreview(r.dataset);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!configReady) return;
    setBusy(true);
    try {
      if (provider === "weather") {
        await onCreateWeather({ city: city.trim(), openHour: w.openHour, closeHour: w.closeHour, tz: w.tz, units: w.units });
      } else {
        if (!name.trim()) { setBusy(false); return; }
        await onCreate({ name: name.trim(), provider: provider as SourceProvider, config: configFor(provider as SourceProvider, cfg), refreshSec });
      }
      close();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create source");
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>New source</DialogTitle>
            <DialogDescription>Connect live data for your ticker, metric, menu, weather, and text widgets.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[65vh] space-y-4 overflow-y-auto py-3 pr-1">
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(PROVIDERS) as NewProvider[]).map((p) => {
                const meta = PROVIDERS[p];
                const Icon = meta.icon;
                return (
                  <button key={p} type="button" onClick={() => { setProvider(p); setPreview(null); setPreviewErr(null); }}
                    className={cn("flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors", provider === p ? "border-primary/50 bg-primary/5" : "hover:bg-muted")}>
                    <span className="flex items-center gap-1.5 text-sm font-medium"><Icon className="size-3.5" /> {meta.label}</span>
                    <span className="text-xs text-muted-foreground">{meta.blurb}</span>
                  </button>
                );
              })}
            </div>

            {provider === "weather" ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="wx-city">City</Label>
                  <Input id="wx-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Dubai, or Austin, TX" autoFocus />
                </div>
                <WeatherWindowFields w={w} setW={setW} perCall={weatherPerCall} />
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="src-name">Name</Label>
                  <Input id="src-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sales dashboard" autoFocus />
                </div>

                {needsConfig && <SourceConfigFields provider={provider as SourceProvider} cfg={cfg} setCfg={setCfg} />}

                {provider !== "manual" && (
                  <div className="space-y-1.5"><Label>Refresh frequency</Label><FrequencySelect value={refreshSec} onChange={setRefreshSec} /></div>
                )}

                {isTabular(provider as SourceProvider) && (
                  <div className="rounded-lg border border-dashed p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">Fetch &amp; preview</span>
                      <Button type="button" variant="outline" size="sm" disabled={!configReady || testing} onClick={test}><RefreshCw className={cn("size-3.5", testing && "animate-spin")} /> {testing ? "Fetching…" : "Fetch"}</Button>
                    </div>
                    {previewErr && <p className="mt-2 text-xs text-destructive">{previewErr}</p>}
                    {preview && <div className="mt-2"><DatasetTable dataset={preview} /></div>}
                    {!preview && !previewErr && <p className="mt-2 text-[11px] text-muted-foreground">Fetch once to confirm the columns before saving.</p>}
                  </div>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
            <Button type="submit" disabled={busy || !configReady}>{busy ? (provider === "weather" ? "Adding…" : "Creating…") : provider === "weather" ? "Add location" : "Create source"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------- weather edit dialog ------------------------- */

function WeatherEditDialog({ loc, perCall, onClose, onSaved }: {
  loc: WeatherLocation | null;
  perCall: number;
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const [label, setLabel] = useState("");
  const [w, setWState] = useState<WeatherWindow>({ openHour: 8, closeHour: 20, tz: browserTz(), units: "metric" });
  const setW = (u: Partial<WeatherWindow>) => setWState((c) => ({ ...c, ...u }));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loc) return;
    setLabel(loc.label);
    setWState({
      openHour: loc.open_hour ?? 8,
      closeHour: loc.close_hour ?? 20,
      tz: loc.tz || browserTz(),
      units: loc.units === "imperial" ? "imperial" : "metric",
    });
  }, [loc]);

  async function save() {
    if (!loc) return;
    setBusy(true);
    try {
      await updateWeatherLocation(loc.id, { label: label.trim() || loc.label, openHour: w.openHour, closeHour: w.closeHour, tz: w.tz, units: w.units });
      await onSaved();
      toast.success("Location updated.");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally { setBusy(false); }
  }

  async function refreshNow() {
    if (!loc) return;
    await refreshWeatherLocation(loc.id);
    await onSaved();
    toast.success("Refreshed.");
  }

  return (
    <Dialog open={!!loc} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Weather location</DialogTitle>
          <DialogDescription>Set the opening hours so this location is only fetched — and billed — while you're open.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-3">
          <div className="space-y-1.5"><Label>Label</Label><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Location name" /></div>
          <WeatherWindowFields w={w} setW={setW} perCall={perCall} />
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="outline" size="sm" onClick={refreshNow}><RefreshCw className="size-3.5" /> Refresh now</Button>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="button" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

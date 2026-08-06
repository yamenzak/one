/**
 * Health monitoring & alerting (BLUEPRINT §23). The dead-man's-switch on each
 * ScreenDO already marks screens offline; this surfaces the resulting alert log
 * and lets the operator add rules (dashboard or webhook delivery). In-dashboard
 * status is for everyone; email/webhook + shorter thresholds are the higher-tier
 * levers (§25).
 */

import { useCallback, useEffect, useState } from "react";
import { Plus, X, Webhook, Mail } from "lucide-react";
import { Button } from "../components/ui/button.js";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card.js";
import { Input } from "../components/ui/input.js";
import { Badge } from "../components/ui/badge.js";
import { Skeleton } from "../components/ui/skeleton.js";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select.js";
import { PageHeader } from "../components/page-header.js";
import { usePageChrome } from "../components/page-chrome.js";
import { confirmDialog } from "../components/confirm.js";
import { cn } from "@/lib/utils";
import { StatusDot } from "../components/status.js";
import { listAlerts, listAlertRules, addAlertRule, deleteAlertRule, listScreens, type AlertRow, type AlertRule, type Screen } from "../api.js";
import { toast } from "@4dl/ui";
import { EmptyState } from "../components/empty.js";

export function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertRow[] | null>(null);
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [screens, setScreens] = useState<Screen[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);

  // Component-scoped so the rule add/delete handlers can trigger a refresh too.
  // Handles errors — a failed poll must surface an error, not an unhandled
  // rejection or a permanent loading skeleton.
  const reload = useCallback(async () => {
    try {
      const [a, r, s] = await Promise.all([listAlerts(), listAlertRules(), listScreens()]);
      setAlerts(a); setRules(r); setScreens(s); setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, []);
  useEffect(() => {
    reload();
    const t = setInterval(reload, 3000);
    return () => clearInterval(t);
  }, []);

  const online = screens.filter((s) => s.live?.online).length;
  const offline = screens.length - online;
  const active = alerts?.filter((a) => a.type !== "recovery" && a.resolved_at === null).length ?? 0;

  usePageChrome({ crumbs: [{ label: "Alerts" }], actions: [] }, []);

  return (
    <div>
      <PageHeader title="Alerts" description="Health monitoring and delivery" />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Screens" value={alerts ? screens.length : undefined} />
        <StatTile label="Online" value={alerts ? online : undefined} dot="bg-success" valueClass="text-success" />
        <StatTile label="Offline" value={alerts ? offline : undefined} dot="bg-destructive" valueClass={offline > 0 ? "text-destructive" : undefined} />
        <StatTile label="Open alerts" value={alerts ? active : undefined} accent={active > 0} />
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Recent alerts</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {!alerts && loadFailed ? (
              <EmptyState title="Couldn't load alerts" description="Check your connection — retrying automatically." />
            ) : !alerts ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-3 py-1">
                    <Skeleton className="size-2 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3.5 w-1/3" />
                      <Skeleton className="h-3 w-2/3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : alerts.length === 0 ? (
              <EmptyState
                scena="happy"
                title="All clear"
                description="No alerts right now — the fleet is healthy. New offline events will show up here."
                className="border-0 bg-transparent py-10"
              />
            ) : (
              <div className="-my-1">
                {alerts.map((a) => {
                  const recovery = a.type === "recovery";
                  const open = a.type !== "recovery" && a.resolved_at === null;
                  return (
                    <div key={a.id} className="flex items-center gap-3 border-b py-3 last:border-0">
                      <StatusDot tone={recovery ? "success" : open ? "destructive" : "muted"} />
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium">
                          {a.screen_name ?? "Screen"} <span className="text-muted-foreground">·</span>{" "}
                          <span className={cn(recovery && "text-success", open && "text-destructive")}>{recovery ? "Recovered" : a.type}</span>
                        </div>
                        <div className="truncate font-mono text-[11px] text-muted-foreground">{a.message}</div>
                      </div>
                      <div className="flex-1" />
                      <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground/70">{new Date(a.at).toLocaleTimeString()}</span>
                      {open ? <Badge variant="destructive" className="text-[10px]">OPEN</Badge> : null}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Alert rules</CardTitle>
            <p className="text-xs text-muted-foreground">Where offline alerts are delivered, beyond this dashboard.</p>
          </CardHeader>
          <CardContent className="pt-0">
            {!alerts ? (
              <div className="space-y-3">
                {[0, 1].map((i) => (
                  <Skeleton key={i} className="h-10 w-full rounded-lg" />
                ))}
              </div>
            ) : rules.length === 0 ? (
              <p className="py-2 text-[13px] text-muted-foreground">No delivery rules yet — alerts stay in the dashboard. Add a webhook or email below.</p>
            ) : (
              <div className="-mt-1">
                {rules.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 border-b py-3 last:border-0">
                    <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-4">
                      {r.channel === "email" ? <Mail /> : <Webhook />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium capitalize">{r.type} &gt; {r.threshold_sec}s</div>
                      <div className="truncate font-mono text-[11px] text-muted-foreground">{r.channel}{r.target ? ` · ${r.target}` : ""}</div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                      aria-label="Delete rule"
                      onClick={async () => {
                        const ok = await confirmDialog({ title: "Delete this alert rule?", description: "Offline alerts will stop being delivered to this destination.", confirmText: "Delete rule", destructive: true });
                        if (!ok) return;
                        await deleteAlertRule(r.id);
                        await reload();
                        toast.success("Alert rule deleted.");
                      }}
                    >
                      <X />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <WebhookForm onAdd={reload} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatTile({ label, value, accent, dot, valueClass }: { label: string; value?: React.ReactNode; accent?: boolean; dot?: string; valueClass?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {dot ? <span aria-hidden className={cn("inline-block size-2 rounded-full", dot)} /> : null}
          {label}
        </div>
        {value === undefined ? (
          <Skeleton className="mt-2 h-7 w-10" />
        ) : (
          <div className={cn("mt-1 text-2xl font-semibold tabular-nums", accent ? "text-primary" : valueClass)}>{value}</div>
        )}
      </CardContent>
    </Card>
  );
}

function WebhookForm({ onAdd }: { onAdd: () => void }) {
  const [channel, setChannel] = useState<"webhook" | "email">("webhook");
  const [target, setTarget] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!target.trim()) return;
        await addAlertRule({ type: "offline", thresholdSec: 90, channel, target: target.trim() });
        setTarget("");
        onAdd();
        toast.success(channel === "email" ? "Email alert recipient added." : "Webhook alert added.");
      }}
      className="mt-4 flex gap-2"
    >
      <Select value={channel} onValueChange={(v) => setChannel(v as "webhook" | "email")}>
        <SelectTrigger size="sm" className="w-28"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="webhook">Webhook</SelectItem>
          <SelectItem value="email">Email</SelectItem>
        </SelectContent>
      </Select>
      <Input value={target} onChange={(e) => setTarget(e.target.value)} placeholder={channel === "email" ? "alerts@company.com" : "https://webhook…"} className="h-8 flex-1 font-mono text-xs" />
      <Button variant="outline" size="sm" type="submit" disabled={!target.trim()}>
        <Plus className="size-4" /> Add
      </Button>
    </form>
  );
}

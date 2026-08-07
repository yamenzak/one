/**
 * Health monitoring & alerting (BLUEPRINT §23). The dead-man's-switch on each
 * ScreenDO already marks screens offline; this surfaces the resulting alert log
 * and lets the operator add rules (dashboard or webhook delivery). In-dashboard
 * status is for everyone; email/webhook + shorter thresholds are the higher-tier
 * levers (§25).
 *
 * ── What changed in 7d ──────────────────────────────────────────────────────
 *
 * Two of the three writes on this screen were unguarded — `await addAlertRule`
 * and `await deleteAlertRule` with no catch — so a refused rule rejected into
 * the app-wide "Something didn't load" toast, which names neither the control
 * nor the reason, and the form kept the text it had failed to submit with no
 * sign anything was wrong. Both go through `useAction` now, which cannot leave
 * a rejection unhandled or a button stuck busy.
 *
 * The failed-load branch said "Check your connection — retrying automatically",
 * which is true of a dropped connection and a lie about a 403. It carries the
 * server's own message now, and the poll keeps running underneath.
 */

import { useCallback, useEffect, useState } from "react";
import { Plus, X, Webhook, Mail, Monitor, Wifi, WifiOff, BellRing } from "lucide-react";
import { Badge, Button, Card, EmptyState, GlanceStrip, Group, Input, LoadError, PageHeader, Row, Section, Select, SkeletonList, toast, useAction, usePageChrome } from "@4dl/ui";
import { confirmDialog } from "../components/confirm.js";
import { listAlerts, listAlertRules, addAlertRule, deleteAlertRule, listScreens, type AlertRow, type AlertRule, type Screen } from "../api.js";
import { ScenaMascot } from "../brand.js";

const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

export function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertRow[] | null>(null);
  const [rules, setRules] = useState<AlertRule[] | null>(null);
  const [screens, setScreens] = useState<Screen[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Component-scoped so the rule add/delete handlers can trigger a refresh too.
  const reload = useCallback(async () => {
    try {
      const [a, r, s] = await Promise.all([listAlerts(), listAlertRules(), listScreens()]);
      setAlerts(a);
      setRules(r);
      setScreens(s);
      setError(null);
    } catch (e) {
      setError(errorText(e, "We couldn’t reach the server."));
    }
  }, []);
  useEffect(() => {
    reload();
    const t = setInterval(reload, 3000);
    return () => clearInterval(t);
  }, [reload]);

  const online = screens.filter((s) => s.live?.online).length;
  const offline = screens.length - online;
  const active = alerts?.filter((a) => a.type !== "recovery" && a.resolved_at === null).length ?? 0;

  usePageChrome({ crumbs: [{ label: "Alerts" }], actions: [] }, []);

  return (
    <div>
      <PageHeader title="Alerts" description="Health monitoring and delivery" />

      {/*
        Four boxed stat cards became one strip. They are a COMPARISON — how many
        screens, how many of them are up — and four cards in a row on a phone is
        four half-empty boxes stacked. `GlanceStrip` is the shape for this, and
        `null` renders "Not yet" rather than a confident 0 during the first poll.
      */}
      <div className="mb-6 rounded-2xl bg-card py-4">
        <GlanceStrip
          items={[
            { icon: Monitor, tone: "neutral", value: alerts ? screens.length : null, label: "Screens" },
            { icon: Wifi, tone: "success", value: alerts ? online : null, label: "Online" },
            { icon: WifiOff, tone: offline > 0 ? "danger" : "neutral", value: alerts ? offline : null, label: "Offline" },
            { icon: BellRing, tone: active > 0 ? "danger" : "neutral", value: alerts ? active : null, label: "Open alerts" },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Section title="Recent alerts">
          {error && !alerts ? (
            <LoadError what="alerts" error={error} onRetry={() => void reload()} />
          ) : !alerts ? (
            <SkeletonList rows={4} card />
          ) : alerts.length === 0 ? (
            <EmptyState art={<ScenaMascot mood="happy" size={116} className="mb-1" />} title="All clear" description="No alerts right now — the fleet is healthy. New offline events will show up here." />
          ) : (
            <Group>
              {alerts.map((a) => {
                const recovery = a.type === "recovery";
                const open = !recovery && a.resolved_at === null;
                return (
                  <Row
                    key={a.id}
                    icon={recovery ? Wifi : WifiOff}
                    iconTone={recovery ? "success" : open ? "danger" : "neutral"}
                    sub={a.message}
                    value={new Date(a.at).toLocaleTimeString()}
                    valueSub={
                      open ? (
                        <Badge tone="danger" className="text-caption">
                          OPEN
                        </Badge>
                      ) : recovery ? (
                        "Recovered"
                      ) : (
                        "Resolved"
                      )
                    }
                  >
                    {a.screen_name ?? "Screen"}
                  </Row>
                );
              })}
            </Group>
          )}
        </Section>

        <Section title="Alert rules">
          <Card>
            <div className="mb-4">
              <h3 className="text-title-3">Where alerts go</h3>
              <p className="text-caption text-muted-foreground">Beyond this dashboard. Offline alerts always appear here.</p>
            </div>
            {rules === null ? (
              <SkeletonList rows={2} />
            ) : rules.length === 0 ? (
              <p className="py-2 text-caption text-muted-foreground">No delivery rules yet — alerts stay in the dashboard. Add a webhook or email below.</p>
            ) : (
              <Group className="bg-transparent">
                {rules.map((r) => (
                  <RuleRow key={r.id} rule={r} onDeleted={reload} />
                ))}
              </Group>
            )}
            <RuleForm onAdd={reload} />
          </Card>
        </Section>
      </div>
    </div>
  );
}

function RuleRow({ rule, onDeleted }: { rule: AlertRule; onDeleted: () => Promise<void> }) {
  const { busy, err, run } = useAction(errorText);
  return (
    <>
      <Row
        icon={rule.channel === "email" ? Mail : Webhook}
        sub={`${rule.channel}${rule.target ? ` · ${rule.target}` : ""}`}
        trailing={
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
            aria-label={`Delete the ${rule.channel} rule`}
            disabled={busy === "delete"}
            onClick={() =>
              run(
                "delete",
                async () => {
                  const ok = await confirmDialog({
                    title: "Delete this alert rule?",
                    description: "Offline alerts will stop being delivered to this destination.",
                    confirmText: "Delete rule",
                    destructive: true,
                  });
                  if (!ok) return;
                  await deleteAlertRule(rule.id);
                  await onDeleted();
                  toast.success("Alert rule deleted.");
                },
                "Couldn’t delete the rule — it is still in place.",
              )
            }
          >
            <X />
          </Button>
        }
      >
        <span className="capitalize">
          {rule.type} &gt; {rule.threshold_sec}s
        </span>
      </Row>
      {/* The refusal belongs on the control that was refused, not in a global
          toast that has scrolled past by the time you look for it. */}
      {err && <p className="px-4 pb-2 text-caption text-danger">{err}</p>}
    </>
  );
}

function RuleForm({ onAdd }: { onAdd: () => Promise<void> }) {
  const [channel, setChannel] = useState<"webhook" | "email">("webhook");
  const [target, setTarget] = useState("");
  const { busy, err, run } = useAction(errorText);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!target.trim()) return;
        void run(
          "add",
          async () => {
            await addAlertRule({ type: "offline", thresholdSec: 90, channel, target: target.trim() });
            // Cleared only AFTER the server took it. Clearing first is how a
            // refused address disappears with nothing to correct.
            setTarget("");
            await onAdd();
            toast.success(channel === "email" ? "Email alert recipient added." : "Webhook alert added.");
          },
          "Couldn’t add the rule — nothing was changed.",
        );
      }}
      className="mt-4 space-y-2"
    >
      <div className="flex gap-2">
        <Select
          value={channel}
          onChange={(v) => setChannel(v as "webhook" | "email")}
          className="w-28"
          size="sm"
          options={[
            { value: "webhook", label: "Webhook" },
            { value: "email", label: "Email" },
          ]}
        />
        <Input
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder={channel === "email" ? "alerts@company.com" : "https://webhook…"}
          className="h-8 flex-1 font-mono text-caption"
          aria-label={channel === "email" ? "Email address" : "Webhook URL"}
        />
        <Button variant="outline" size="sm" type="submit" disabled={!target.trim() || busy === "add"}>
          <Plus className="size-4" /> {busy === "add" ? "Adding…" : "Add"}
        </Button>
      </div>
      {err && <p className="text-caption text-danger">{err}</p>}
    </form>
  );
}

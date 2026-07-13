/** Coach: workout + meal plans for a client — list, create, open builder. */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, Badge, Field, Sheet, Skeleton, SegmentedControl, Page, Stagger, EmptyState, cn, Dumbbell, Utensils, Plus, Ellipsis, Trash2, Archive, History, Zap, PencilLine } from "@mossa/ui";
import { api } from "../../api.js";

interface Plan { id: string; name: string; status: string; publishedAt: string | null }
type Kind = "workout" | "meal";

export function CoachPlans({ clientId }: { clientId: string }) {
  const nav = useNavigate();
  const [kind, setKind] = useState<Kind>("workout");
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [menuFor, setMenuFor] = useState<Plan | null>(null);
  const endpoint = kind === "workout" ? "workout-plans" : "meal-plans";
  const open = (planId: string) => nav(`/clients/${clientId}/plans/${kind}/${planId}`);

  const load = useCallback(async () => { setPlans((await api.get<{ plans: Plan[] }>(`/api/${endpoint}?clientId=${clientId}`)).plans); }, [clientId, endpoint]);
  useEffect(() => { setPlans(null); void load(); }, [load]);

  const create = async () => { const r = await api.post<{ plan: Plan }>(`/api/${endpoint}`, { clientId, name }); setCreateOpen(false); setName(""); open(r.plan.id); };

  return (
    <Page className="mx-auto max-w-xl space-y-3 p-4 pb-28">
      <SegmentedControl options={[{ value: "workout", label: "Workout" }, { value: "meal", label: "Meal" }]} value={kind} onChange={setKind} />
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold capitalize">{kind} plans</h2>
        <Button size="sm" onClick={() => setCreateOpen(true)}><Plus /> New</Button>
      </div>
      {!plans ? <Skeleton className="h-64" /> : plans.length === 0 ? (
        <EmptyState icon={kind === "workout" ? Dumbbell : Utensils} title={`No ${kind} plans`} description={kind === "workout" ? "Create one and build it — or use the AI draft inside the builder." : "Create one and build the options bank."} />
      ) : (
        <Stagger className="space-y-2">
          {plans.map((p) => (
            <Card key={p.id} interactive onClick={() => open(p.id)} className="flex items-center justify-between gap-2">
              <div className="min-w-0"><div className="truncate font-semibold">{p.name}</div>{p.publishedAt && <div className="text-xs text-muted-foreground">Published {new Date(p.publishedAt).toLocaleDateString()}</div>}</div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Badge tone={p.status === "published" ? "success" : p.status === "draft" ? "neutral" : "warning"}>{p.status}</Badge>
                <button onClick={(e) => { e.stopPropagation(); setMenuFor(p); }} aria-label="Plan actions" className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground [&_svg]:size-4"><Ellipsis /></button>
              </div>
            </Card>
          ))}
        </Stagger>
      )}
      <Sheet open={createOpen} onClose={() => setCreateOpen(false)} title={`New ${kind} plan`}>
        <div className="space-y-4">
          <Field label="Plan name" icon={kind === "workout" ? Dumbbell : Utensils} value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "workout" ? "Push Pull Legs" : "Cutting Plan"} />
          <Button size="lg" className="w-full" disabled={name.trim().length < 2} onClick={() => void create()}>Create &amp; build</Button>
        </div>
      </Sheet>
      {menuFor && (
        <PlanActions
          plan={menuFor}
          endpoint={endpoint}
          onClose={() => setMenuFor(null)}
          onOpen={() => { const id = menuFor.id; setMenuFor(null); open(id); }}
          onChanged={() => { setMenuFor(null); void load(); }}
        />
      )}
    </Page>
  );
}

/**
 * Plan lifecycle actions, contextual to status. Only drafts delete; published
 * and superseded plans archive; an older superseded/archived plan can be made
 * active again (re-published — supersedes the current one) or rolled back to a
 * draft to edit first. No hard delete of anything that was ever published.
 */
function PlanActions({ plan, endpoint, onClose, onOpen, onChanged }: { plan: Plan; endpoint: string; onClose: () => void; onOpen: () => void; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const act = (fn: () => Promise<unknown>) => async () => { setBusy(true); try { await fn(); onChanged(); } catch { setBusy(false); } };
  const isOld = plan.status === "superseded" || plan.status === "archived";
  const status = (s: string) => api.post(`/api/${endpoint}/${plan.id}/status`, { status: s });
  return (
    <Sheet open onClose={onClose} title={plan.name}>
      <div className="space-y-1">
        <ActionRow icon={PencilLine} label="Open in builder" onClick={onOpen} />
        {isOld && <ActionRow icon={Zap} label="Make active again" hint="Re-publishes this plan and supersedes the current one" disabled={busy} onClick={act(() => api.post(`/api/${endpoint}/${plan.id}/publish`, {}))} />}
        {isOld && <ActionRow icon={History} label="Roll back to draft" hint="Make it editable again" disabled={busy} onClick={act(() => status("draft"))} />}
        {(plan.status === "published" || plan.status === "superseded") && <ActionRow icon={Archive} label="Archive" hint="Hide it without deleting" disabled={busy} onClick={act(() => status("archived"))} />}
        {plan.status === "draft" && (
          confirmDel
            ? <ActionRow icon={Trash2} label={busy ? "Deleting…" : "Tap again to delete"} danger disabled={busy} onClick={act(() => api.del(`/api/${endpoint}/${plan.id}`))} />
            : <ActionRow icon={Trash2} label="Delete draft" danger onClick={() => setConfirmDel(true)} />
        )}
      </div>
    </Sheet>
  );
}

function ActionRow({ icon: Icon, label, hint, danger, disabled, onClick }: { icon: (p: { className?: string }) => ReactNode; label: string; hint?: string; danger?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button disabled={disabled} onClick={onClick} className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors disabled:opacity-50 [&_svg]:size-[1.15rem]", danger ? "text-danger hover:bg-danger-soft" : "hover:bg-surface-2")}>
      <Icon className="shrink-0" />
      <div className="min-w-0 flex-1"><div className="text-sm font-medium">{label}</div>{hint && <div className="text-xs text-muted-foreground">{hint}</div>}</div>
    </button>
  );
}

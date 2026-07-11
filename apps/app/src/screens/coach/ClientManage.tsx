/** Coach client management — grant packages, approve swaps, review labs. */

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Badge, Sheet, Skeleton, Page, Stagger, IconBadge, Ticket, ArrowLeftRight, FlaskConical, Plus, Check, X } from "@mossa/ui";
import { api } from "../../api.js";

interface Sub { id: string; status: string; daysRemaining: number; packageId: string | null }
interface Pkg { id: string; name: string }
interface Swap { id: string; reason: string | null; status: string }
interface Lab { id: string; display_name: string; status: string }

export function ClientManage({ clientId }: { clientId: string }) {
  const [subs, setSubs] = useState<Sub[] | null>(null);
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [swaps, setSwaps] = useState<Swap[]>([]);
  const [labs, setLabs] = useState<Lab[]>([]);
  const [grantOpen, setGrantOpen] = useState(false);

  const load = useCallback(async () => {
    const [s, p, sw, l] = await Promise.all([
      api.get<{ subscriptions: Sub[] }>(`/api/subscriptions?clientId=${clientId}`),
      api.get<{ packages: Pkg[] }>("/api/packages"),
      api.get<{ swaps: Swap[] }>(`/api/swaps?clientId=${clientId}`),
      api.get<{ labs: Lab[] }>(`/api/labs?clientId=${clientId}`),
    ]);
    setSubs(s.subscriptions); setPackages(p.packages); setSwaps(sw.swaps); setLabs(l.labs);
  }, [clientId]);
  useEffect(() => void load(), [load]);

  const grant = async (packageId: string) => { await api.post("/api/subscriptions/grant", { clientId, packageId }); setGrantOpen(false); await load(); };
  const resolveSwap = async (id: string, status: "approved" | "rejected") => { await api.patch(`/api/swaps/${id}`, { status }); await load(); };
  const reviewLab = async (id: string) => { await api.patch(`/api/labs/${id}`, { status: "reviewed", trainerFeedback: "Reviewed — looks good." }); await load(); };

  if (!subs) return <Skeleton className="m-4 h-64" />;
  const active = subs.find((s) => s.status === "active");
  const pending = swaps.filter((s) => s.status === "pending");

  return (
    <Page className="mx-auto max-w-xl space-y-4 p-4 pb-28">
      <Stagger>
        <Card>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5"><IconBadge icon={Ticket} tone="primary" size="sm" /><h2 className="font-semibold">Access</h2></div>
            <Button size="sm" onClick={() => setGrantOpen(true)}><Plus /> Grant</Button>
          </div>
          {active ? <div className="mt-3 flex items-center justify-between"><span className="text-sm text-muted-foreground">Active subscription</span><Badge tone="success">{active.daysRemaining} days left</Badge></div> : <p className="mt-2 text-sm text-muted-foreground">No active subscription. Grant a package (or a $0 comp) to unlock features.</p>}
        </Card>
      </Stagger>

      {pending.length > 0 && (
        <Stagger>
          <Card className="space-y-3">
            <div className="flex items-center gap-2.5"><IconBadge icon={ArrowLeftRight} tone="cardio" size="sm" /><h2 className="font-semibold">Swap requests</h2></div>
            {pending.map((s) => (
              <div key={s.id} className="rounded-xl bg-surface-2 p-3">
                <div className="text-sm">{s.reason || "Exercise swap requested"}</div>
                <div className="mt-2 flex gap-2"><Button size="sm" className="flex-1" onClick={() => void resolveSwap(s.id, "approved")}><Check /> Approve</Button><Button size="sm" variant="outline" className="flex-1" onClick={() => void resolveSwap(s.id, "rejected")}><X /> Reject</Button></div>
              </div>
            ))}
          </Card>
        </Stagger>
      )}

      {labs.length > 0 && (
        <Stagger>
          <Card className="space-y-3">
            <div className="flex items-center gap-2.5"><IconBadge icon={FlaskConical} tone="sleep" size="sm" /><h2 className="font-semibold">Lab tests</h2></div>
            {labs.map((l) => (
              <div key={l.id} className="flex items-center justify-between">
                <span>{l.display_name}</span>
                {l.status === "uploaded" ? <Button size="sm" onClick={() => void reviewLab(l.id)}>Review</Button> : <Badge tone={l.status === "reviewed" ? "success" : "warning"}>{l.status}</Badge>}
              </div>
            ))}
          </Card>
        </Stagger>
      )}

      <Sheet open={grantOpen} onClose={() => setGrantOpen(false)} title="Grant a package">
        <div className="space-y-2">
          {packages.length === 0 && <p className="text-sm text-muted-foreground">No packages yet — create one in the Business tab.</p>}
          {packages.map((p) => <button key={p.id} onClick={() => void grant(p.id)} className="flex w-full items-center justify-between rounded-xl bg-secondary px-4 py-3 text-left transition-colors hover:bg-surface-3"><span>{p.name}</span><span className="text-primary">Grant</span></button>)}
        </div>
      </Sheet>
    </Page>
  );
}

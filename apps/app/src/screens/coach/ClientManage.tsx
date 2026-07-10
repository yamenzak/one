/**
 * Coach client management (SPEC §7, §8.3, §8.8) — grant packages, approve
 * swap requests, review labs. The transactional coach actions that don't fit
 * the client-mirror surfaces.
 */

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Chip, Sheet, Skeleton } from "@mossa/ui";
import { api } from "../../api.js";

interface Sub {
  id: string;
  status: string;
  daysRemaining: number;
  packageId: string | null;
}
interface Pkg {
  id: string;
  name: string;
}
interface Swap {
  id: string;
  current_exercise_id: string;
  suggested_exercise_id: string;
  reason: string | null;
  status: string;
}
interface Lab {
  id: string;
  display_name: string;
  status: string;
}

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
    setSubs(s.subscriptions);
    setPackages(p.packages);
    setSwaps(sw.swaps);
    setLabs(l.labs);
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const grant = async (packageId: string) => {
    await api.post("/api/subscriptions/grant", { clientId, packageId });
    setGrantOpen(false);
    await load();
  };
  const resolveSwap = async (id: string, status: "approved" | "rejected") => {
    await api.patch(`/api/swaps/${id}`, { status });
    await load();
  };
  const reviewLab = async (id: string) => {
    await api.patch(`/api/labs/${id}`, { status: "reviewed", trainerFeedback: "Reviewed — looks good." });
    await load();
  };

  if (!subs) return <Skeleton className="m-4 h-64" />;
  const active = subs.find((s) => s.status === "active");

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4 pb-28">
      {/* Access */}
      <Card>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Access</h2>
          <Button onClick={() => setGrantOpen(true)}>＋ Grant package</Button>
        </div>
        {active ? (
          <div className="mt-3 flex items-center justify-between">
            <span className="text-sm text-fg-muted">Active subscription</span>
            <Chip tone="good">{active.daysRemaining} days left</Chip>
          </div>
        ) : (
          <p className="mt-2 text-sm text-fg-muted">No active subscription. Grant a package (or a $0 comp) to unlock coaching features.</p>
        )}
      </Card>

      {/* Swap requests */}
      {swaps.filter((s) => s.status === "pending").length > 0 && (
        <Card>
          <h2 className="mb-3 font-semibold">Swap requests</h2>
          <div className="space-y-3">
            {swaps.filter((s) => s.status === "pending").map((s) => (
              <div key={s.id} className="rounded-2xl bg-surface-2 p-3">
                <div className="text-sm">{s.reason || "Exercise swap requested"}</div>
                <div className="mt-2 flex gap-2">
                  <Button className="flex-1" onClick={() => void resolveSwap(s.id, "approved")}>Approve</Button>
                  <Button variant="outline" className="flex-1" onClick={() => void resolveSwap(s.id, "rejected")}>Reject</Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Labs */}
      {labs.length > 0 && (
        <Card>
          <h2 className="mb-3 font-semibold">Lab tests</h2>
          <div className="space-y-2">
            {labs.map((l) => (
              <div key={l.id} className="flex items-center justify-between">
                <span>{l.display_name}</span>
                {l.status === "uploaded" ? (
                  <Button onClick={() => void reviewLab(l.id)}>Review</Button>
                ) : (
                  <Chip tone={l.status === "reviewed" ? "good" : "warn"}>{l.status}</Chip>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      <Sheet open={grantOpen} onClose={() => setGrantOpen(false)} title="Grant a package">
        <div className="space-y-2">
          {packages.length === 0 && <p className="text-sm text-fg-muted">No packages yet — create one in the Business tab.</p>}
          {packages.map((p) => (
            <button key={p.id} onClick={() => void grant(p.id)} className="flex w-full items-center justify-between rounded-2xl bg-surface-2 px-4 py-3 text-left">
              <span>{p.name}</span>
              <span className="text-primary">Grant</span>
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}

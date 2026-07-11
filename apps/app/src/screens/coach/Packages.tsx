/** Package editor + redemption codes. */

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Badge, Field, Sheet, Skeleton, Chip, Page, Stagger, EmptyState, CreditCard, Ticket, Plus } from "@mossa/ui";
import { api } from "../../api.js";

interface Pkg { id: string; name: string; one_time_price_cents: number | null; budgets: { feature: string; days: number }[]; visibility: string }
interface Code { id: string; code: string; days_to_add: number; target_feature: string; used_count: number; max_uses: number }

export function Packages() {
  const [packages, setPackages] = useState<Pkg[] | null>(null);
  const [codes, setCodes] = useState<Code[]>([]);
  const [pkgOpen, setPkgOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);

  const load = useCallback(async () => {
    const [p, c] = await Promise.all([api.get<{ packages: Pkg[] }>("/api/packages"), api.get<{ codes: Code[] }>("/api/redemption-codes")]);
    setPackages(p.packages); setCodes(c.codes);
  }, []);
  useEffect(() => void load(), [load]);

  if (!packages) return <Skeleton className="m-4 h-64" />;

  return (
    <Page className="mx-auto max-w-xl space-y-4 p-4 pb-28">
      <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Packages</h2><Button size="sm" onClick={() => setPkgOpen(true)}><Plus /> New</Button></div>
      {packages.length === 0 ? (
        <EmptyState icon={CreditCard} title="No packages yet" description="Build a package — feature budgets (workout/meal/all) sold once. $0 packages are comps you grant directly." />
      ) : (
        <Stagger className="space-y-2">
          {packages.map((p) => (
            <Card key={p.id} className="flex items-center justify-between">
              <div><div className="font-semibold">{p.name}</div><div className="mt-1 flex flex-wrap gap-1">{p.budgets.map((b, i) => <Badge key={i} tone="activity">{b.days}d {b.feature}</Badge>)}</div></div>
              <div className="text-right"><div className="numeral font-semibold">{p.one_time_price_cents ? `$${(p.one_time_price_cents / 100).toFixed(0)}` : "Free"}</div><Badge tone="neutral">{p.visibility}</Badge></div>
            </Card>
          ))}
        </Stagger>
      )}

      <div className="flex items-center justify-between pt-2"><h2 className="text-lg font-semibold">Redemption codes</h2><Button size="sm" onClick={() => setCodeOpen(true)}><Plus /> Code</Button></div>
      {codes.map((c) => (
        <Card key={c.id} className="flex items-center justify-between">
          <div className="flex items-center gap-2.5"><div className="grid size-9 place-items-center rounded-xl bg-primary/15 text-primary [&_svg]:size-4"><Ticket /></div><div><div className="font-mono font-semibold">{c.code}</div><div className="text-xs text-muted-foreground">{c.days_to_add}d {c.target_feature} · used {c.used_count}/{c.max_uses}</div></div></div>
        </Card>
      ))}

      {pkgOpen && <PackageSheet onClose={() => setPkgOpen(false)} onSaved={() => { setPkgOpen(false); void load(); }} />}
      {codeOpen && <CodeSheet onClose={() => setCodeOpen(false)} onSaved={() => { setCodeOpen(false); void load(); }} />}
    </Page>
  );
}

function PackageSheet({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [feature, setFeature] = useState<"all" | "workout" | "meal">("all");
  const [days, setDays] = useState("30");
  const [visibility, setVisibility] = useState<"private" | "marketplace">("marketplace");
  const save = async () => { await api.post("/api/packages", { name, oneTimePriceCents: price ? Math.round(Number(price) * 100) : null, budgets: [{ feature, days: Number(days) }], visibility }); onSaved(); };
  return (
    <Sheet open onClose={onClose} title="New package">
      <div className="space-y-4">
        <Field label="Name" icon={CreditCard} value={name} onChange={(e) => setName(e.target.value)} />
        <Field label="Price (USD, blank = free comp)" value={price} inputMode="decimal" onChange={(e) => setPrice(e.target.value)} />
        <div><div className="mb-2 text-sm text-muted-foreground">Feature budget</div><div className="flex gap-2">{(["all", "workout", "meal"] as const).map((f) => <Chip key={f} selected={feature === f} onClick={() => setFeature(f)}>{f}</Chip>)}</div></div>
        <Field label="Days" value={days} inputMode="numeric" onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} />
        <div className="flex gap-2">{(["marketplace", "private"] as const).map((v) => <Chip key={v} selected={visibility === v} onClick={() => setVisibility(v)}>{v}</Chip>)}</div>
        <Button size="lg" className="w-full" disabled={name.trim().length < 2 || !days} onClick={() => void save()}>Create package</Button>
      </div>
    </Sheet>
  );
}

function CodeSheet({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [code, setCode] = useState("");
  const [days, setDays] = useState("7");
  const [feature, setFeature] = useState<"all" | "workout" | "meal">("all");
  const [maxUses, setMaxUses] = useState("1");
  const save = async () => { await api.post("/api/redemption-codes", { code, daysToAdd: Number(days), targetFeature: feature, maxUses: Number(maxUses) }); onSaved(); };
  return (
    <Sheet open onClose={onClose} title="New redemption code">
      <div className="space-y-4">
        <Field label="Code" icon={Ticket} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="WELCOME7" />
        <Field label="Days to add" value={days} inputMode="numeric" onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} />
        <div className="flex gap-2">{(["all", "workout", "meal"] as const).map((f) => <Chip key={f} selected={feature === f} onClick={() => setFeature(f)}>{f}</Chip>)}</div>
        <Field label="Max uses" value={maxUses} inputMode="numeric" onChange={(e) => setMaxUses(e.target.value.replace(/\D/g, ""))} />
        <Button size="lg" className="w-full" disabled={code.length < 4 || !days} onClick={() => void save()}>Create code</Button>
      </div>
    </Sheet>
  );
}

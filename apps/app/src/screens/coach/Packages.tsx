/**
 * Package editor + redemption codes (SPEC §7) — owner surface. Build the
 * access-economy products (budgets, visibility) and issue day-top-up codes.
 */

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Chip, Field, Sheet, Skeleton, SuggestionChip } from "@mossa/ui";
import { api } from "../../api.js";

interface Pkg {
  id: string;
  name: string;
  one_time_price_cents: number | null;
  budgets: { feature: string; days: number }[];
  visibility: string;
}
interface Code {
  id: string;
  code: string;
  days_to_add: number;
  target_feature: string;
  used_count: number;
  max_uses: number;
}

export function Packages() {
  const [packages, setPackages] = useState<Pkg[] | null>(null);
  const [codes, setCodes] = useState<Code[]>([]);
  const [pkgOpen, setPkgOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);

  const load = useCallback(async () => {
    const [p, c] = await Promise.all([
      api.get<{ packages: Pkg[] }>("/api/packages"),
      api.get<{ codes: Code[] }>("/api/redemption-codes"),
    ]);
    setPackages(p.packages);
    setCodes(c.codes);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!packages) return <Skeleton className="m-4 h-64" />;

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4 pb-28">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Packages</h2>
        <Button onClick={() => setPkgOpen(true)}>＋ New</Button>
      </div>
      {packages.length === 0 ? (
        <Card className="text-center text-sm text-fg-muted">
          Build a package — feature budgets (workout/meal/all) sold once or via installments. $0
          packages are comps you grant directly.
        </Card>
      ) : (
        packages.map((p) => (
          <Card key={p.id} className="flex items-center justify-between">
            <div>
              <div className="font-semibold">{p.name}</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {p.budgets.map((b, i) => (
                  <Chip key={i} tone="activity">{b.days}d {b.feature}</Chip>
                ))}
              </div>
            </div>
            <div className="text-right">
              <div className="numeral font-semibold">{p.one_time_price_cents ? `$${(p.one_time_price_cents / 100).toFixed(0)}` : "Free"}</div>
              <Chip tone="neutral">{p.visibility}</Chip>
            </div>
          </Card>
        ))
      )}

      <div className="flex items-center justify-between pt-2">
        <h2 className="text-lg font-semibold">Redemption codes</h2>
        <Button onClick={() => setCodeOpen(true)}>＋ Code</Button>
      </div>
      {codes.map((c) => (
        <Card key={c.id} className="flex items-center justify-between">
          <div>
            <div className="font-mono font-semibold">{c.code}</div>
            <div className="text-xs text-fg-muted">{c.days_to_add}d {c.target_feature} · used {c.used_count}/{c.max_uses}</div>
          </div>
        </Card>
      ))}

      {pkgOpen && <PackageSheet onClose={() => setPkgOpen(false)} onSaved={() => (setPkgOpen(false), void load())} />}
      {codeOpen && <CodeSheet onClose={() => setCodeOpen(false)} onSaved={() => (setCodeOpen(false), void load())} />}
    </div>
  );
}

function PackageSheet({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [feature, setFeature] = useState<"all" | "workout" | "meal">("all");
  const [days, setDays] = useState("30");
  const [visibility, setVisibility] = useState<"private" | "marketplace">("marketplace");

  const save = async () => {
    await api.post("/api/packages", {
      name,
      oneTimePriceCents: price ? Math.round(Number(price) * 100) : null,
      budgets: [{ feature, days: Number(days) }],
      visibility,
    });
    onSaved();
  };

  return (
    <Sheet open onClose={onClose} title="New package">
      <div className="space-y-4">
        <Field label="Name" icon="📦" value={name} onChange={(e) => setName(e.target.value)} />
        <Field label="Price (USD, blank = free comp)" icon="💵" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        <div>
          <div className="mb-2 text-sm text-fg-muted">Feature budget</div>
          <div className="flex gap-2">
            {(["all", "workout", "meal"] as const).map((f) => (
              <SuggestionChip key={f} selected={feature === f} onClick={() => setFeature(f)}>{f}</SuggestionChip>
            ))}
          </div>
        </div>
        <Field label="Days" icon="📅" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} />
        <div className="flex gap-2">
          {(["marketplace", "private"] as const).map((v) => (
            <SuggestionChip key={v} selected={visibility === v} onClick={() => setVisibility(v)}>{v}</SuggestionChip>
          ))}
        </div>
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

  const save = async () => {
    await api.post("/api/redemption-codes", { code, daysToAdd: Number(days), targetFeature: feature, maxUses: Number(maxUses) });
    onSaved();
  };

  return (
    <Sheet open onClose={onClose} title="New redemption code">
      <div className="space-y-4">
        <Field label="Code" icon="🎟️" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="WELCOME7" />
        <Field label="Days to add" icon="📅" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} />
        <div className="flex gap-2">
          {(["all", "workout", "meal"] as const).map((f) => (
            <SuggestionChip key={f} selected={feature === f} onClick={() => setFeature(f)}>{f}</SuggestionChip>
          ))}
        </div>
        <Field label="Max uses" icon="🔢" inputMode="numeric" value={maxUses} onChange={(e) => setMaxUses(e.target.value.replace(/\D/g, ""))} />
        <Button size="lg" className="w-full" disabled={code.length < 4 || !days} onClick={() => void save()}>Create code</Button>
      </div>
    </Sheet>
  );
}

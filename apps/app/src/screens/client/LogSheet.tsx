/**
 * The Log sheet (DESIGN.md §1.8): bottom sheet, chip grid of loggable things,
 * two taps from anywhere to any log form. v1 wires water, weight, food quick
 * entry, and check-in; the rest of the grid lands with their phases.
 */

import { useState } from "react";
import { Button, Field, Sheet, SuggestionChip } from "@mossa/ui";
import { api, todayLocal } from "../../api.js";

type LogKind = "water" | "weight" | "food" | "checkin";

const CHIPS: { kind: LogKind; label: string; icon: string }[] = [
  { kind: "food", label: "Food", icon: "🍽️" },
  { kind: "water", label: "Water", icon: "💧" },
  { kind: "weight", label: "Weight", icon: "⚖️" },
  { kind: "checkin", label: "Check-in", icon: "☀️" },
];

interface LogSheetProps {
  open: boolean;
  onClose: () => void;
  clientId: string;
  onLogged: () => void;
}

export function LogSheet({ open, onClose, clientId, onLogged }: LogSheetProps) {
  const [kind, setKind] = useState<LogKind | null>(null);
  const [busy, setBusy] = useState(false);
  // Form state (kept simple; per-kind fields)
  const [amount, setAmount] = useState("");
  const [label, setLabel] = useState("");
  const [calories, setCalories] = useState("");
  const [mood, setMood] = useState<number | null>(null);

  const date = todayLocal();
  const close = () => {
    setKind(null);
    setAmount("");
    setLabel("");
    setCalories("");
    setMood(null);
    onClose();
  };

  const submit = async () => {
    setBusy(true);
    try {
      if (kind === "water") {
        await api.post("/api/logs/water", { clientId, data: { date, amountMl: Number(amount) } });
      } else if (kind === "weight") {
        await api.post("/api/measurements", { clientId, data: { date, weightKg: Number(amount) } });
      } else if (kind === "food") {
        await api.post("/api/logs/food", {
          clientId,
          data: { date, mealType: "snack", label: label || "Quick entry", calories: Number(calories) || 0 },
        });
      } else if (kind === "checkin") {
        await api.post("/api/check-ins", {
          clientId,
          data: { date, weightKg: amount ? Number(amount) : undefined, mood: mood ?? undefined },
        });
      }
      onLogged();
      close();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={close} title={kind ? undefined : "Log manually"}>
      {!kind ? (
        <div className="flex flex-wrap gap-3 pb-2">
          {CHIPS.map((c) => (
            <SuggestionChip key={c.kind} onClick={() => setKind(c.kind)}>
              <span aria-hidden>{c.icon}</span> {c.label}
            </SuggestionChip>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {kind === "water" && (
            <>
              <h2 className="text-xl font-semibold">Log water</h2>
              <div className="flex flex-wrap gap-2">
                {[250, 500, 750, 1000].map((ml) => (
                  <SuggestionChip key={ml} selected={amount === String(ml)} onClick={() => setAmount(String(ml))}>
                    {ml} ml
                  </SuggestionChip>
                ))}
              </div>
              <Field label="Amount (ml)" icon="💧" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} />
            </>
          )}
          {kind === "weight" && (
            <>
              <h2 className="text-xl font-semibold">Log weight</h2>
              <Field label="Weight (kg)" icon="⚖️" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} helper="Stored metric; shown in your preferred unit." />
            </>
          )}
          {kind === "food" && (
            <>
              <h2 className="text-xl font-semibold">Quick food entry</h2>
              <Field label="What did you eat?" icon="🍽️" value={label} onChange={(e) => setLabel(e.target.value)} />
              <Field label="Calories" icon="🔥" inputMode="numeric" value={calories} onChange={(e) => setCalories(e.target.value.replace(/\D/g, ""))} helper="Rough is fine — search + barcode arrive on the Eat tab." />
            </>
          )}
          {kind === "checkin" && (
            <>
              <h2 className="text-xl font-semibold">Daily check-in</h2>
              <Field label="Weight (kg) — optional" icon="⚖️" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
              <div>
                <div className="mb-2 text-sm text-fg-muted">Mood</div>
                <div className="flex gap-2">
                  {["😞", "🙁", "😐", "🙂", "😄"].map((face, i) => (
                    <SuggestionChip key={i} selected={mood === i + 1} onClick={() => setMood(i + 1)}>
                      {face}
                    </SuggestionChip>
                  ))}
                </div>
              </div>
            </>
          )}
          <div className="flex gap-3 pt-2">
            <Button variant="ghost" onClick={() => setKind(null)}>
              Back
            </Button>
            <Button size="lg" className="flex-1" disabled={busy} onClick={() => void submit()}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

/**
 * Log sheet — bottom sheet with a chip grid → per-kind quick forms.
 */

import { useState } from "react";
import { Button, Field, Sheet, Chip, IconBadge, Utensils, Droplet, Weight, ClipboardList, Smile, Angry, Frown, Meh, Laugh, type LucideIcon, type Tone } from "@mossa/ui";
import { api, todayLocal } from "../../api.js";

type LogKind = "food" | "water" | "weight" | "checkin";
const CHIPS: { kind: LogKind; label: string; icon: LucideIcon; tone: Tone }[] = [
  { kind: "food", label: "Food", icon: Utensils, tone: "nutrition" },
  { kind: "water", label: "Water", icon: Droplet, tone: "hydration" },
  { kind: "weight", label: "Weight", icon: Weight, tone: "activity" },
  { kind: "checkin", label: "Check-in", icon: ClipboardList, tone: "cardio" },
];

export function LogSheet({ open, onClose, clientId, onLogged }: { open: boolean; onClose: () => void; clientId: string; onLogged: () => void }) {
  const [kind, setKind] = useState<LogKind | null>(null);
  const [busy, setBusy] = useState(false);
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
      if (kind === "water") await api.post("/api/logs/water", { clientId, data: { date, amountMl: Number(amount) } });
      else if (kind === "weight") await api.post("/api/measurements", { clientId, data: { date, weightKg: Number(amount) } });
      else if (kind === "food") await api.post("/api/logs/food", { clientId, data: { date, mealType: "snack", label: label || "Quick entry", calories: Number(calories) || 0 } });
      else if (kind === "checkin") await api.post("/api/check-ins", { clientId, data: { date, weightKg: amount ? Number(amount) : undefined, mood: mood ?? undefined } });
      onLogged();
      close();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={close} title={kind ? undefined : "Log"}>
      {!kind ? (
        <div className="grid grid-cols-2 gap-3 pb-2">
          {CHIPS.map((c) => (
            <button key={c.kind} onClick={() => setKind(c.kind)} className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-4 text-left transition-all hover:border-border active:scale-[0.98]">
              <IconBadge icon={c.icon} tone={c.tone} />
              <span className="font-medium">{c.label}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {kind === "water" && (
            <>
              <h2 className="text-lg font-semibold">Log water</h2>
              <div className="flex flex-wrap gap-2">
                {[250, 500, 750, 1000].map((ml) => (
                  <Chip key={ml} selected={amount === String(ml)} onClick={() => setAmount(String(ml))}>
                    {ml} ml
                  </Chip>
                ))}
              </div>
              <Field label="Amount (ml)" icon={Droplet} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} />
            </>
          )}
          {kind === "weight" && (
            <>
              <h2 className="text-lg font-semibold">Log weight</h2>
              <Field label="Weight (kg)" icon={Weight} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} hint="Stored metric; shown in your preferred unit." />
            </>
          )}
          {kind === "food" && (
            <>
              <h2 className="text-lg font-semibold">Quick food entry</h2>
              <Field label="What did you eat?" icon={Utensils} value={label} onChange={(e) => setLabel(e.target.value)} />
              <Field label="Calories" icon={ClipboardList} inputMode="numeric" value={calories} onChange={(e) => setCalories(e.target.value.replace(/\D/g, ""))} hint="Search + barcode live on the Eat tab." />
            </>
          )}
          {kind === "checkin" && (
            <>
              <h2 className="text-lg font-semibold">Daily check-in</h2>
              <Field label="Weight (kg) — optional" icon={Weight} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
              <div>
                <div className="mb-2 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Smile className="size-4" /> Mood
                </div>
                <div className="flex gap-2">
                  {[Angry, Frown, Meh, Smile, Laugh].map((Face, i) => (
                    <button key={i} onClick={() => setMood(i + 1)} className={`grid size-11 place-items-center rounded-full transition-all active:scale-90 [&_svg]:size-5 ${mood === i + 1 ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
                      <Face />
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
          <div className="flex gap-3 pt-1">
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

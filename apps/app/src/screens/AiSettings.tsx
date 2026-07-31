/**
 * Tenant AI configuration (SPEC §6) — the studio owner's control surface over
 * the metered AI suite: a house tone, and per-feature enable / model / system-
 * prompt / tone overrides. Renders straight from the server's feature registry
 * so it never drifts from what the engine actually runs.
 */

import { useEffect, useRef, useState } from "react";
import type { AiSettingsPayload, AiFeatureMeta, AiModelMeta, TenantAiConfig, AiFeatureConfig, AiTone } from "@kova/protocol";
import { Card, Badge, Skeleton, Reveal, SkeletonLine, Switch, Button, Textarea, Chip, Field, IconBadge, cn, PencilLine, ChevronDown, Building2, Users, HeartPulse, Camera, ImageIcon, Play, Wallet, CircleCheck, CircleAlert, type Tone, type LucideIcon, Wand2, Sliders, ListChecks} from "@4dl/ui";
import { SectionSplit } from "./SectionSplit.js";
import { api } from "../api.js";
import { AiAvatar, useAiIdentity } from "../AiAvatar.js";
import { useCan } from "../FeatureLock.js";

const TONE_LABEL: Record<string, string> = {
  professional: "Professional", motivating: "Motivating", friendly: "Friendly", direct: "Direct", funny: "Funny", "tough-love": "Tough love",
};

/** Example house-rule additions, shown as the placeholder for each feature's
 *  extra-instructions field (these are appended to the built-in prompt). */
const EXAMPLE_MODS: Record<string, string> = {
  "draft-plan": "e.g. Start every session with a 5-minute mobility warm-up, and prefer dumbbell variations.",
  "draft-meal": "e.g. Favour high-protein breakfasts and never include pork.",
  "lab-extract": "e.g. Also flag any value within 10% of the range edge as borderline.",
  "supplement-reco": "e.g. Only third-party-tested brands, and never more than four supplements.",
  "checkin-reply": "e.g. Always end the reply with one specific follow-up question.",
  "client-summary": "e.g. Call out sleep and stress trends explicitly whenever they move.",
  "cover-image": "e.g. Moody, high-contrast gym aesthetic with deep shadows.",
  "food-image": "e.g. Plate everything on rustic ceramic with a linen napkin.",
  "exercise-image": "e.g. Friendly flat-illustration style in our brand green.",
  "workout-day-image": "e.g. Cinematic and dramatic, with strong rim lighting.",
  "meal-image": "e.g. Bright and fresh, overhead flat-lay on a marble surface.",
  "exercise-guide": "e.g. Add a short 'Scaling options' note for beginners in every guide.",
  "exercise-meta": "e.g. Prefer the most specific muscle names available.",
  "food-meta": "e.g. Assume metric serving sizes unless the food is counted in pieces.",
  "meal-recipe": "e.g. Keep every recipe under 20 minutes and one pan where possible.",
  "article-write": "e.g. Write at a 9th-grade reading level and explain mechanisms simply.",
  "coach-note": "e.g. Occasionally reference their long-term goal by name.",
  "narrative": "e.g. Always open with their biggest win of the period.",
  "parse-food": "e.g. Default ambiguous portions to a single typical serving.",
  "snap-meal": "e.g. Be conservative on calorie estimates when portions are unclear.",
  "label-reader": "e.g. Prefer the product's marketing name when both are visible.",
};
const exampleMod = (key: string) => EXAMPLE_MODS[key] ?? "e.g. add a house rule or preference — it's applied on top of the built-in instructions.";

/** Credits a typical request on this model costs, in the lane it is being
 *  picked for. The server prices every lane, so a Gemini text model chosen for
 *  a vision feature is quoted as a vision call, not a text one. */
const costOf = (m: AiModelMeta, task: string): number | null => {
  const c = m.costPerRequest?.[task] ?? m.costPerRequest?.[m.task];
  return typeof c === "number" && c > 0 ? c : null;
};

/** The option label a studio owner chooses on: the model, then its price. */
const modelOption = (m: AiModelMeta, task: string): string => {
  const c = costOf(m, task);
  return c === null ? m.label : `${m.label} — ~${c} cr`;
};

/** "the cheapest here costs 2" → "4× the cheapest option". Comparison inside
 *  one picker is what makes an absolute credit figure actionable. */
function costHint(models: AiModelMeta[], task: string, selectedId: string): string | null {
  const priced = models.map((m) => costOf(m, task)).filter((c): c is number => c !== null);
  const picked = models.find((m) => m.id === selectedId);
  const cost = picked ? costOf(picked, task) : null;
  if (cost === null || !priced.length) return null;
  const cheapest = Math.min(...priced);
  const ratio = cheapest > 0 ? cost / cheapest : 1;
  const rel = ratio >= 1.15 ? ` · ${ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1)}× the cheapest option here` : priced.length > 1 ? " · the cheapest option here" : "";
  return `~${cost} credit${cost === 1 ? "" : "s"} per request${rel}`;
}

/**
 * The voice pack, as three states rather than one question.
 *
 * The old card only ever asked "generate?" — it could not say "you are done", and
 * it could not see a complete pack sitting under a DIFFERENT voice, so an owner
 * who had already paid for cues was invited to pay again. It also offered
 * "Regenerate" on a finished pack, which did nothing: the server skips every
 * cached cue unless explicitly forced.
 *
 * Now: installed-and-selected, installed-under-another-voice, or not installed.
 * Each state names what clients hear today and offers exactly one action.
 */
function VoicePackStatus({ pack, selectedVoice, busy, note, onInstall, onRevoice }: {
  pack: { ready: boolean; count: number; total: number; installedVoice: string | null } | null;
  selectedVoice: string;
  busy: boolean;
  note: string | null;
  onInstall: () => void;
  onRevoice: () => void;
}) {
  const installed = pack?.installedVoice ?? null;
  const current = pack?.ready === true && installed === selectedVoice;
  const elsewhere = installed !== null && installed !== selectedVoice;
  const partial = !current && !elsewhere && (pack?.count ?? 0) > 0;

  return (
    <div className="space-y-2 rounded-xl bg-muted/40 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          {current
            ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
            : <CircleAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />}
          <div className="min-w-0 text-sm">
            {current && <><span className="font-medium">Installed</span> — clients hear <b>{selectedVoice}</b>.</>}
            {elsewhere && <><span className="font-medium">{installed} is installed.</span> Clients hear {installed}, not {selectedVoice}, until you install it.</>}
            {!current && !elsewhere && (
              <span className="text-muted-foreground">
                {partial
                  ? `Partly voiced (${pack?.count} of ${pack?.total}). Clients hear a generic device voice until it's finished.`
                  : "Not installed — clients hear a generic device voice."}
              </span>
            )}
          </div>
        </div>
        {/* One action, and it always does something. */}
        {current
          ? <Button size="sm" variant="secondary" disabled={busy} onClick={onRevoice}>{busy ? "Re-voicing…" : "Re-voice"}</Button>
          : <Button size="sm" disabled={busy} onClick={onInstall}>{busy ? "Installing…" : elsewhere ? `Switch to ${selectedVoice}` : partial ? "Finish pack" : "Install pack"}</Button>}
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {note ?? (current
          ? "Cached, so a scan costs nothing to narrate. Re-voicing bills the pack again and replaces the files in your media library."
          : "Voiced once and cached — you're billed in credits for the cue pack, not per scan. Installing replaces any pack already in your library.")}
      </p>
    </div>
  );
}

export function AiConfigSection() {
  const ai = useAiIdentity();
  const [data, setData] = useState<AiSettingsPayload | null>(null);
  const [config, setConfig] = useState<TenantAiConfig>({});
  // The coach voice exists only to narrate BODY-SCAN cues, and every route behind
  // it (`/body-scan/voice-preview`, `/body-scan/voice-pack`) is gated on
  // `bfCamera`. Without the entitlement the card was a live control that 403'd —
  // and "Generate voice pack" spends credits, so it read as a billing failure.
  const canBodyScan = useCan("bodyScan");

  useEffect(() => {
    void api.get<AiSettingsPayload>("/api/settings/ai").then((r) => { setData(r); setConfig(r.config ?? {}); }).catch(() => setData(null));
  }, []);

  const saveHouseTone = async (tone: AiTone | null) => {
    setConfig((c) => ({ ...c, tone }));
    await api.patch("/api/settings/ai", { tone }).catch(() => undefined);
  };
  const saveTtsVoice = async (ttsVoice: string) => {
    setConfig((c) => ({ ...c, ttsVoice }));
    await api.patch("/api/settings/ai", { ttsVoice }).catch(() => undefined);
  };
  // Owner cap on AI credits a single client can spend per day (SPEC §6). Empty =
  // uncapped. Edited as free text, committed on blur so partial input never saves.
  const saveCreditCap = async (cap: number | null) => {
    setConfig((c) => ({ ...c, perActorDailyCreditCap: cap }));
    await api.patch("/api/settings/ai", { perActorDailyCreditCap: cap }).catch(() => undefined);
  };
  const [capDraft, setCapDraft] = useState("");
  useEffect(() => { setCapDraft(config.perActorDailyCreditCap != null ? String(config.perActorDailyCreditCap) : ""); }, [config.perActorDailyCreditCap]);
  const commitCreditCap = () => {
    const t = capDraft.trim();
    if (t === "") { void saveCreditCap(null); return; }
    const n = Math.round(Number(t));
    if (Number.isFinite(n) && n >= 0) void saveCreditCap(n);
    else setCapDraft(config.perActorDailyCreditCap != null ? String(config.perActorDailyCreditCap) : "");
  };
  const [previewing, setPreviewing] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const previewVoice = async (voice: string) => {
    setPreviewing(voice);
    try {
      const r = await api.get<{ url: string }>(`/api/body-scan/voice-preview?voice=${encodeURIComponent(voice)}`);
      if (r.url) { audioRef.current?.pause(); const a = new Audio(r.url); audioRef.current = a; await a.play().catch(() => undefined); }
    } catch { /* preview needs the body-scan entitlement + credits; ignore */ }
    finally { setPreviewing(null); }
  };

  // Voice pack: cues are generated once, on the OWNER'S explicit action (the
  // billed moment) — never silently by a client's scan. Status tracks the saved voice.
  const selectedVoice = config.ttsVoice ?? "Kore";
  const [pack, setPack] = useState<{ ready: boolean; count: number; total: number; installedVoice: string | null } | null>(null);
  const [genBusy, setGenBusy] = useState(false);
  const [genNote, setGenNote] = useState<string | null>(null);
  useEffect(() => {
    setGenNote(null);
    void api.get<{ ready: boolean; count: number; total: number; installedVoice: string | null }>(`/api/body-scan/voice-pack?voice=${encodeURIComponent(selectedVoice)}`).then(setPack).catch(() => setPack(null));
  }, [selectedVoice]);
  /** `force` re-voices a pack that is already complete; without it the server
   *  skips every cached cue, which is what made the old "Regenerate" button do
   *  nothing at all. Either way the server retires the pack being replaced. */
  const generatePack = async (force = false) => {
    setGenBusy(true); setGenNote(null);
    try {
      const r = await api.post<{ ready: boolean; generated: number; credits: number; retired: number }>("/api/body-scan/voice-pack", { voice: selectedVoice, force });
      setPack((p) => ({ ready: r.ready, total: p?.total ?? 10, count: r.ready ? (p?.total ?? 10) : (p?.count ?? 0) + r.generated, installedVoice: r.ready ? selectedVoice : (p?.installedVoice ?? null) }));
      const freed = r.retired > 0 ? ` The old pack was removed from your library (${r.retired} file${r.retired === 1 ? "" : "s"} freed).` : "";
      setGenNote(r.generated > 0
        ? `Voiced ${r.generated} cue${r.generated === 1 ? "" : "s"} — ${r.credits} credit${r.credits === 1 ? "" : "s"}.${freed}`
        : `Already voiced in ${selectedVoice}.${freed}`);
    } catch (e) {
      const status = (e as { status?: number }).status;
      setGenNote(status === 402 ? "Not enough credits to generate the voice pack." : status === 403 ? "The body-scan add-on isn't in your plan." : "Couldn't generate the voice pack — try again.");
    } finally { setGenBusy(false); }
  };
  const saveFeature = async (key: string, patch: AiFeatureConfig) => {
    setConfig((c) => ({ ...c, features: { ...(c.features ?? {}), [key]: { ...(c.features?.[key] ?? {}), ...patch } } }));
    await api.patch("/api/settings/ai", { features: { [key]: patch } }).catch(() => undefined);
  };
  /** Apply one patch to many features at once (used by the quick model picks). */
  const saveFeatures = async (keys: string[], patch: AiFeatureConfig) => {
    const patches = Object.fromEntries(keys.map((k) => [k, patch]));
    setConfig((c) => { const features = { ...(c.features ?? {}) }; for (const k of keys) features[k] = { ...(features[k] ?? {}), ...patch }; return { ...c, features }; });
    await api.patch("/api/settings/ai", { features: patches }).catch(() => undefined);
  };

  const trainer = data?.features.filter((f) => f.audience === "trainer") ?? [];
  const client = data?.features.filter((f) => f.audience === "client") ?? [];

  return (
    <section className="mb-6 space-y-4">
      <Reveal loading={!data} className="space-y-4" skeleton={
        <>
          <div>
            <div className="mb-2 flex items-center justify-between gap-2 px-1">
              <SkeletonLine w="7rem" h="xs" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Card className="space-y-3">
              <div className="flex items-center gap-2.5">
                <Skeleton className="size-9 rounded-xl" />
                <div className="flex-1 space-y-1.5"><SkeletonLine w="35%" h="text" /><SkeletonLine w="60%" h="xs" /></div>
              </div>
              <div className="flex flex-wrap gap-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8 w-20 rounded-full" />)}</div>
            </Card>
          </div>
          <div>
            <SkeletonLine w="8rem" h="xs" className="mb-2 px-1" />
            <Card className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-center gap-2.5"><Skeleton className="size-9 rounded-xl" /><div className="min-w-0 flex-1 space-y-1.5"><SkeletonLine w="40%" h="text" /><SkeletonLine w="65%" h="xs" /></div></div>
                  <Skeleton className="h-8 w-28 shrink-0 rounded-lg" />
                </div>
              ))}
            </Card>
          </div>
          {Array.from({ length: 2 }).map((_, g) => (
            <div key={g}>
              <SkeletonLine w="6rem" h="xs" className="mb-2 px-1" />
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Card key={i} className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1.5"><SkeletonLine w="45%" h="text" /><SkeletonLine w="75%" h="xs" /></div>
                    <Skeleton className="h-6 w-11 shrink-0 rounded-full" />
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </>
      }>
        {data && (
          /*
            ── AI IS THREE SETTINGS ──────────────────────────────────────────
            The studio's assistant (its tone, its spoken voice, a per-client
            spend cap), the default model per lane, and a model + tone per
            individual action. Stacked, they ran to 221 lines and the thing an
            owner most often wants — "which model is answering, and what is it
            costing me" — sat below two screens of identity settings.
          */
          <SectionSplit
            param="a"
            subs={[
              {
                key: "voice", label: "Voice & limits", icon: Wand2, tone: "primary",
                value: `${config.tone ? String(config.tone) : "Default"} tone${config.perActorDailyCreditCap ? ` · ${config.perActorDailyCreditCap} credits/day per client` : " · no per-client cap"}`,
                render: () => (
            <div>
              <div className="mb-2 flex items-center justify-between gap-2 px-1">
                <h3 className="text-micro uppercase text-muted-foreground">AI assistant</h3>
                <Badge tone="primary"><Building2 /> Studio</Badge>
              </div>
              <Card className="space-y-3">
                {/* This is the studio's AI speaking, so it wears the studio's AI
                    face and name — not a generic glyph. The name is the one the
                    owner set in Branding, so "the tone Nova writes in" reads as a
                    property of a specific assistant. */}
                <div className="flex items-center gap-2.5">
                  <AiAvatar className="size-9" />
                  <div><div className="font-medium">{ai.name}&rsquo;s voice</div><div className="text-sm text-muted-foreground">The tone every personalized message is written in.</div></div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {data.tones.map((t) => <Chip key={t} selected={(config.tone ?? "professional") === t} onClick={() => void saveHouseTone(t)}>{TONE_LABEL[t] ?? t}</Chip>)}
                </div>
              </Card>

              {canBodyScan && (
              <Card className="mt-2 space-y-3">
                <div className="flex items-center gap-2.5">
                  <IconBadge icon={Camera} tone="primary" size="sm" />
                  <div><div className="font-medium">Coach voice</div><div className="text-sm text-muted-foreground">The spoken voice for body-scan cues (“step back”, “hold still”). Tap <Play className="inline size-3 align-[-1px]" /> to preview.</div></div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(data.voices ?? []).map((v) => {
                    const selected = (config.ttsVoice ?? "Kore") === v.id;
                    return (
                      <span key={v.id} className="inline-flex items-center">
                        <Chip selected={selected} onClick={() => void saveTtsVoice(v.id)}>{v.id} · {v.style}</Chip>
                        <button
                          type="button"
                          aria-label={`Preview ${v.id} voice`}
                          disabled={previewing === v.id}
                          onClick={() => void previewVoice(v.id)}
                          className="ml-1 grid size-7 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
                        >
                          <Play className="size-3.5" />
                        </button>
                      </span>
                    );
                  })}
                </div>
                {/* Installed state first. A card that only ever asks "generate?"
                    cannot tell an owner they are already done — and this one
                    could not even see a complete pack sitting under a different
                    voice. Three distinct states, each with one obvious action. */}
                <VoicePackStatus
                  pack={pack}
                  selectedVoice={selectedVoice}
                  busy={genBusy}
                  note={genNote}
                  onInstall={() => void generatePack(false)}
                  onRevoice={() => void generatePack(true)}
                />
              </Card>
              )}

              <Card className="mt-2 space-y-3">
                <div className="flex items-center gap-2.5">
                  <IconBadge icon={Wallet} tone="primary" size="sm" />
                  <div><div className="font-medium">Per-client daily cap</div><div className="text-sm text-muted-foreground">The most AI credits any one client can spend in a day. Leave blank for no limit.</div></div>
                </div>
                <Field
                  label="Daily credit cap"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  placeholder="No limit"
                  value={capDraft}
                  onChange={(e) => setCapDraft(e.target.value)}
                  onBlur={commitCreditCap}
                  hint="Applies to AI features clients trigger themselves; your own coaching AI is never capped."
                />
              </Card>
            </div>
                ),
              },
              {
                key: "models", label: "Default models", icon: Sliders, tone: "activity",
                value: `${data.models.length} model${data.models.length === 1 ? "" : "s"} available`,
                render: () => (<DefaultModels features={data.features} models={data.models} config={config} onApply={saveFeatures} />),
              },
              {
                key: "actions", label: "Per action", icon: ListChecks, tone: "nutrition",
                value: `${trainer.length} for trainers · ${client.length} for clients`,
                render: () => (
                  <div className="space-y-5">
            <FeatureGroup title="For trainers" icon={Users} features={trainer} models={data.models} config={config} tones={data.tones} onSave={saveFeature} />
            <FeatureGroup title="For clients" icon={HeartPulse} features={client} models={data.models} config={config} tones={data.tones} onSave={saveFeature} />
                  </div>
                ),
              },
            ]}
          />
        )}
      </Reveal>
    </section>
  );
}

/** Quick model picks — set the model for a whole category (text / vision /
 *  image) in one tap; it applies to every feature of that type. Individual
 *  features can still override below. */
const MODEL_GROUPS: { key: string; label: string; desc: string; icon: LucideIcon; tone: Tone; priceTask: string; matchFeature: (t: string) => boolean; matchModel: (m: AiModelMeta) => boolean }[] = [
  // `priceTask` is the lane the group is QUOTED in. The text group spans text
  // and text-small features, so it is quoted on the larger of the two — a price
  // that surprises upward is the one nobody wants.
  { key: "text", label: "Text model", desc: "Plans, summaries, notes & writing.", icon: PencilLine, tone: "primary", priceTask: "text", matchFeature: (t) => t === "text" || t === "text-small", matchModel: (m) => m.task !== "vision" && m.task !== "image" },
  { key: "vision", label: "Vision model", desc: "Reading meal photos, labels & lab reports.", icon: Camera, tone: "cardio", priceTask: "vision", matchFeature: (t) => t === "vision", matchModel: (m) => m.task === "vision" || m.provider === "google" },
  { key: "image", label: "Image model", desc: "Generated cover, food & exercise images.", icon: ImageIcon, tone: "nutrition", priceTask: "image", matchFeature: (t) => t === "image", matchModel: (m) => m.task === "image" || m.provider === "google" },
];

function DefaultModels({ features, models, config, onApply }: {
  features: AiFeatureMeta[]; models: AiModelMeta[]; config: TenantAiConfig; onApply: (keys: string[], patch: AiFeatureConfig) => void;
}) {
  const rows = MODEL_GROUPS.map((g) => {
    const keys = features.filter((f) => g.matchFeature(f.task)).map((f) => f.key);
    const pickable = models.filter(g.matchModel);
    if (!keys.length || !pickable.length) return null;
    const vals = new Set(keys.map((k) => config.features?.[k]?.model ?? ""));
    return { g, keys, pickable, current: vals.size === 1 ? [...vals][0]! : "", mixed: vals.size > 1 };
  }).filter((r): r is NonNullable<typeof r> => !!r);
  if (!rows.length) return null;

  return (
    <div>
      <h3 className="mb-2 px-1 text-micro uppercase text-muted-foreground">Default models</h3>
      <Card className="space-y-3">
        <p className="text-xs text-muted-foreground">Pick a model per category — it applies to every feature of that type at once. Fine-tune any single feature below.</p>
        {rows.map(({ g, keys, pickable, current, mixed }) => {
          const hint = costHint(pickable, g.priceTask, current);
          return (
            <div key={g.key} className="space-y-1">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <IconBadge icon={g.icon} tone={g.tone} size="sm" />
                  <div className="min-w-0"><div className="text-sm font-medium">{g.label}</div><div className="truncate text-xs text-muted-foreground">{g.desc}</div></div>
                </div>
                <select value={current} onChange={(e) => onApply(keys, { model: e.target.value || null })} className="max-w-[44%] shrink-0 truncate rounded-lg bg-surface-2 px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/70">
                  <option value="">{mixed ? "Mixed — set all…" : "Default (auto)"}</option>
                  {pickable.map((m) => <option key={m.id} value={m.id}>{modelOption(m, g.priceTask)}</option>)}
                </select>
              </div>
              {hint && <div className="numeral pl-[2.9rem] text-xs text-muted-foreground">{hint}</div>}
            </div>
          );
        })}
        <CostLegend />
      </Card>
    </div>
  );
}

/** Says once, plainly, what the numbers in every picker mean. Without this the
 *  "~8 cr" is a mystery unit; with it, it is a price. */
function CostLegend() {
  return (
    <p className="flex items-start gap-1.5 rounded-xl bg-muted/40 p-2.5 text-xs leading-relaxed text-muted-foreground">
      <Wallet className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>
        <b className="text-foreground">cr</b> = AI credits, the same balance your plan tops up. Figures are for a{" "}
        <b className="text-foreground">typical</b> request of that kind, so models compare like for like — a long plan
        costs more than a short note on any model. A pricier model is usually a better writer; a cheap one is plenty for
        short, factual jobs.
      </span>
    </p>
  );
}

function FeatureGroup({ title, icon: Icon, features, models, config, tones, onSave }: {
  title: string; icon: typeof Users; features: AiFeatureMeta[]; models: AiModelMeta[]; config: TenantAiConfig; tones: readonly AiTone[]; onSave: (key: string, patch: AiFeatureConfig) => void;
}) {
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-1.5 px-1 text-micro uppercase text-muted-foreground [&_svg]:size-3.5"><Icon /> {title}</h3>
      <div className="space-y-2">
        {features.map((f) => <FeatureCard key={f.key} feat={f} models={models} cfg={config.features?.[f.key] ?? {}} tones={tones} onSave={(patch) => onSave(f.key, patch)} />)}
      </div>
    </div>
  );
}

function FeatureCard({ feat, models, cfg, tones, onSave }: {
  feat: AiFeatureMeta; models: AiModelMeta[]; cfg: AiFeatureConfig; tones: readonly AiTone[]; onSave: (patch: AiFeatureConfig) => void;
}) {
  // ONE disclosure for the whole card, not one for the instructions box.
  //
  // The clutter was structural: 23 features, every enabled one showing a model
  // <select>, a seven-chip tone row and an instructions link inline. That is
  // ~70 controls stacked vertically on a phone, and the studio owner who came to
  // change one thing had to scroll past all of it. Collapsed, each feature is one
  // row that STATES its configuration; open it only to change it.
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(cfg.system ?? "");
  const enabled = cfg.enabled !== false;
  // Vision needs a multimodal model — a vision-tagged one, or any Gemini model
  // (Gemini is multimodal). Text/text-small interchange; never image models.
  const pickable = models.filter((m) =>
    feat.task === "image" ? m.task === "image" || m.provider === "google"
      : feat.task === "vision" ? m.task === "vision" || m.provider === "google"
        : m.task !== "vision" && m.task !== "image",
  );

  // The collapsed summary. Says what is actually set, so the common case — "is
  // this on, and on which model?" — needs no interaction at all.
  const picked = pickable.find((m) => m.id === cfg.model);
  const summary = !enabled ? "Off" : [
    picked ? picked.label : "Auto model",
    feat.tonable ? (cfg.tone ? TONE_LABEL[cfg.tone] ?? cfg.tone : "House tone") : null,
    cfg.system ? "custom instructions" : null,
  ].filter(Boolean).join(" · ");

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        {/* The whole heading is the disclosure control — a bigger target than a
            chevron, and it leaves the Switch as the only other thing to hit. */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          disabled={!enabled}
          className="min-w-0 flex-1 text-left disabled:cursor-default"
        >
          <div className="flex items-center gap-1.5">
            <span className="min-w-0 truncate text-sm font-medium">{feat.label}</span>
            {enabled && <ChevronDown className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />}
          </div>
          <div className={cn("truncate text-xs", open ? "text-muted-foreground" : "text-muted-foreground")}>
            {open ? feat.description : summary}
          </div>
        </button>
        <Switch checked={enabled} aria-label={feat.label} onCheckedChange={(v) => onSave({ enabled: v })} />
      </div>

      {enabled && open && (
        <div className="space-y-3 border-t border-border/50 pt-3">
          <p className="text-xs leading-relaxed text-muted-foreground">{feat.description}</p>
          <div>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">Model</span>
              <select
                value={cfg.model ?? ""}
                onChange={(e) => onSave({ model: e.target.value || null })}
                className="max-w-[60%] truncate rounded-lg bg-surface-2 px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
              >
                <option value="">Default (auto)</option>
                {pickable.map((m) => <option key={m.id} value={m.id}>{modelOption(m, feat.task)}</option>)}
              </select>
            </label>
            {/* Priced in THIS feature's lane, so the number is what this feature
                will actually cost — not a generic figure for the model. */}
            {costHint(pickable, feat.task, cfg.model ?? "") && (
              <div className="numeral mt-1 text-right text-xs text-muted-foreground">{costHint(pickable, feat.task, cfg.model ?? "")}</div>
            )}
          </div>

          {feat.tonable && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">Tone</span>
              <Chip selected={!cfg.tone} onClick={() => onSave({ tone: null })}>House</Chip>
              {tones.map((t) => <Chip key={t} selected={cfg.tone === t} onClick={() => onSave({ tone: t })}>{TONE_LABEL[t] ?? t}</Chip>)}
            </div>
          )}

          <div className="space-y-2">
            <span className="text-sm text-muted-foreground">Extra instructions</span>
            <p className="text-xs leading-relaxed text-muted-foreground">Added on top of the built-in instructions — the AI is told the studio also asked for this. Your notes refine the output; they don't replace how the feature works.</p>
            <Textarea rows={3} value={draft} placeholder={exampleMod(feat.key)} onChange={(e) => setDraft(e.target.value)} className="text-xs" />
            <div className="flex items-center gap-2">
              <Button size="sm" disabled={draft === (cfg.system ?? "")} onClick={() => onSave({ system: draft.trim() || null })}>Save</Button>
              {cfg.system && <Button size="sm" variant="ghost" onClick={() => { setDraft(""); onSave({ system: null }); }}>Clear</Button>}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

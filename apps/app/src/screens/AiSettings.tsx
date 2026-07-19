/**
 * Tenant AI configuration (SPEC §6) — the studio owner's control surface over
 * the metered AI suite: a house tone, and per-feature enable / model / system-
 * prompt / tone overrides. Renders straight from the server's feature registry
 * so it never drifts from what the engine actually runs.
 */

import { useEffect, useRef, useState } from "react";
import type { AiSettingsPayload, AiFeatureMeta, AiModelMeta, TenantAiConfig, AiFeatureConfig, AiTone } from "@mossa/protocol";
import { Card, Badge, Skeleton, Reveal, SkeletonLine, Switch, Button, Textarea, Chip, IconBadge, cn, Sparkles, ChevronDown, Building2, Users, HeartPulse, Camera, ImageIcon, Play, type Tone, type LucideIcon } from "@mossa/ui";
import { api } from "../api.js";

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

export function AiConfigSection() {
  const [data, setData] = useState<AiSettingsPayload | null>(null);
  const [config, setConfig] = useState<TenantAiConfig>({});

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
  const [pack, setPack] = useState<{ ready: boolean; count: number; total: number } | null>(null);
  const [genBusy, setGenBusy] = useState(false);
  const [genNote, setGenNote] = useState<string | null>(null);
  useEffect(() => {
    setGenNote(null);
    void api.get<{ ready: boolean; count: number; total: number }>(`/api/body-scan/voice-pack?voice=${encodeURIComponent(selectedVoice)}`).then(setPack).catch(() => setPack(null));
  }, [selectedVoice]);
  const generatePack = async () => {
    setGenBusy(true); setGenNote(null);
    try {
      const r = await api.post<{ ready: boolean; generated: number; credits: number }>("/api/body-scan/voice-pack", { voice: selectedVoice });
      setPack((p) => ({ ready: r.ready, total: p?.total ?? 10, count: r.ready ? (p?.total ?? 10) : (p?.count ?? 0) + r.generated }));
      setGenNote(r.generated > 0 ? `Generated ${r.generated} cue${r.generated === 1 ? "" : "s"} — ${r.credits} credit${r.credits === 1 ? "" : "s"}.` : "Voice pack already up to date.");
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
          <>
            <div>
              <div className="mb-2 flex items-center justify-between gap-2 px-1">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">AI assistant</h3>
                <Badge tone="primary"><Building2 /> Studio</Badge>
              </div>
              <Card className="space-y-3">
                <div className="flex items-center gap-2.5">
                  <IconBadge icon={Sparkles} tone="primary" size="sm" />
                  <div><div className="font-medium">House voice</div><div className="text-sm text-muted-foreground">The tone every personalized message is written in.</div></div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {data.tones.map((t) => <Chip key={t} selected={(config.tone ?? "professional") === t} onClick={() => void saveHouseTone(t)}>{TONE_LABEL[t] ?? t}</Chip>)}
                </div>
              </Card>

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
                <div className="rounded-xl bg-muted/40 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 text-sm">
                      {pack?.ready
                        ? <span className="text-foreground">Voice pack ready — clients hear your <b>{selectedVoice}</b> voice.</span>
                        : <span className="text-muted-foreground">Not generated yet. Until you generate it, clients hear a generic device voice.</span>}
                    </div>
                    <Button size="sm" variant={pack?.ready ? "secondary" : "default"} disabled={genBusy} onClick={() => void generatePack()}>
                      {genBusy ? "Generating…" : pack?.ready ? "Regenerate" : "Generate voice pack"}
                    </Button>
                  </div>
                  <div className="mt-1.5 text-xs text-muted-foreground">
                    {genNote ?? "Generated once and cached — you're billed in credits for the cue pack, not per scan."}
                  </div>
                </div>
              </Card>
            </div>

            <DefaultModels features={data.features} models={data.models} config={config} onApply={saveFeatures} />

            <FeatureGroup title="For trainers" icon={Users} features={trainer} models={data.models} config={config} tones={data.tones} onSave={saveFeature} />
            <FeatureGroup title="For clients" icon={HeartPulse} features={client} models={data.models} config={config} tones={data.tones} onSave={saveFeature} />
          </>
        )}
      </Reveal>
    </section>
  );
}

/** Quick model picks — set the model for a whole category (text / vision /
 *  image) in one tap; it applies to every feature of that type. Individual
 *  features can still override below. */
const MODEL_GROUPS: { key: string; label: string; desc: string; icon: LucideIcon; tone: Tone; matchFeature: (t: string) => boolean; matchModel: (m: AiModelMeta) => boolean }[] = [
  { key: "text", label: "Text model", desc: "Plans, summaries, notes & writing.", icon: Sparkles, tone: "primary", matchFeature: (t) => t === "text" || t === "text-small", matchModel: (m) => m.task !== "vision" && m.task !== "image" },
  { key: "vision", label: "Vision model", desc: "Reading meal photos, labels & lab reports.", icon: Camera, tone: "cardio", matchFeature: (t) => t === "vision", matchModel: (m) => m.task === "vision" || m.provider === "google" },
  { key: "image", label: "Image model", desc: "Generated cover, food & exercise images.", icon: ImageIcon, tone: "nutrition", matchFeature: (t) => t === "image", matchModel: (m) => m.task === "image" || m.provider === "google" },
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
      <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Default models</h3>
      <Card className="space-y-3">
        <p className="text-xs text-muted-foreground">Pick a model per category — it applies to every feature of that type at once. Fine-tune any single feature below.</p>
        {rows.map(({ g, keys, pickable, current, mixed }) => (
          <div key={g.key} className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <IconBadge icon={g.icon} tone={g.tone} size="sm" />
              <div className="min-w-0"><div className="text-sm font-medium">{g.label}</div><div className="truncate text-xs text-muted-foreground">{g.desc}</div></div>
            </div>
            <select value={current} onChange={(e) => onApply(keys, { model: e.target.value || null })} className="max-w-[44%] shrink-0 truncate rounded-lg bg-surface-2 px-3 py-1.5 text-sm outline-none">
              <option value="">{mixed ? "Mixed — set all…" : "Default (auto)"}</option>
              {pickable.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
        ))}
      </Card>
    </div>
  );
}

function FeatureGroup({ title, icon: Icon, features, models, config, tones, onSave }: {
  title: string; icon: typeof Users; features: AiFeatureMeta[]; models: AiModelMeta[]; config: TenantAiConfig; tones: readonly AiTone[]; onSave: (key: string, patch: AiFeatureConfig) => void;
}) {
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground [&_svg]:size-3.5"><Icon /> {title}</h3>
      <div className="space-y-2">
        {features.map((f) => <FeatureCard key={f.key} feat={f} models={models} cfg={config.features?.[f.key] ?? {}} tones={tones} onSave={(patch) => onSave(f.key, patch)} />)}
      </div>
    </div>
  );
}

function FeatureCard({ feat, models, cfg, tones, onSave }: {
  feat: AiFeatureMeta; models: AiModelMeta[]; cfg: AiFeatureConfig; tones: readonly AiTone[]; onSave: (patch: AiFeatureConfig) => void;
}) {
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

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium">{feat.label}</div>
          <div className="text-xs text-muted-foreground">{feat.description}</div>
        </div>
        <Switch checked={enabled} onCheckedChange={(v) => onSave({ enabled: v })} />
      </div>

      {enabled && (
        <div className="space-y-3 border-t border-border/50 pt-3">
          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">Model</span>
            <select
              value={cfg.model ?? ""}
              onChange={(e) => onSave({ model: e.target.value || null })}
              className="max-w-[60%] truncate rounded-lg bg-surface-2 px-3 py-1.5 text-sm outline-none"
            >
              <option value="">Default (auto)</option>
              {pickable.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>

          {feat.tonable && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">Tone</span>
              <Chip selected={!cfg.tone} onClick={() => onSave({ tone: null })}>House</Chip>
              {tones.map((t) => <Chip key={t} selected={cfg.tone === t} onClick={() => onSave({ tone: t })}>{TONE_LABEL[t] ?? t}</Chip>)}
            </div>
          )}

          <div>
            <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1 text-sm font-medium text-primary [&_svg]:size-4">
              <ChevronDown className={cn("transition-transform", open && "rotate-180")} /> {cfg.system ? "Extra instructions added" : "Add instructions"}
            </button>
            {open && (
              <div className="mt-2 space-y-2">
                <p className="text-xs text-muted-foreground">Added on top of the built-in instructions — the AI is told the studio also asked for this. Your notes refine the output; they don't replace how the feature works.</p>
                <Textarea rows={4} value={draft} placeholder={exampleMod(feat.key)} onChange={(e) => setDraft(e.target.value)} className="text-xs" />
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={() => onSave({ system: draft.trim() || null })}>Save</Button>
                  {cfg.system && <Button size="sm" variant="ghost" onClick={() => { setDraft(""); onSave({ system: null }); }}>Clear</Button>}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

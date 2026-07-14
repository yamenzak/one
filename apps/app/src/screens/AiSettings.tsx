/**
 * Tenant AI configuration (SPEC §6) — the studio owner's control surface over
 * the metered AI suite: a house tone, and per-feature enable / model / system-
 * prompt / tone overrides. Renders straight from the server's feature registry
 * so it never drifts from what the engine actually runs.
 */

import { useEffect, useState } from "react";
import type { AiSettingsPayload, AiFeatureMeta, AiModelMeta, TenantAiConfig, AiFeatureConfig, AiTone } from "@mossa/protocol";
import { Card, Badge, Skeleton, Switch, Button, Textarea, Chip, IconBadge, cn, Sparkles, ChevronDown, Dumbbell, Users, HeartPulse } from "@mossa/ui";
import { api } from "../api.js";

const TONE_LABEL: Record<string, string> = {
  professional: "Professional", motivating: "Motivating", friendly: "Friendly", direct: "Direct", funny: "Funny", "tough-love": "Tough love",
};

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
  const saveFeature = async (key: string, patch: AiFeatureConfig) => {
    setConfig((c) => ({ ...c, features: { ...(c.features ?? {}), [key]: { ...(c.features?.[key] ?? {}), ...patch } } }));
    await api.patch("/api/settings/ai", { features: { [key]: patch } }).catch(() => undefined);
  };

  if (!data) return <Skeleton className="h-64" />;
  const trainer = data.features.filter((f) => f.audience === "trainer");
  const client = data.features.filter((f) => f.audience === "client");

  return (
    <section className="mb-6 space-y-4">
      <div>
        <div className="mb-2 flex items-center justify-between gap-2 px-1">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">AI assistant</h3>
          <Badge tone="activity"><Dumbbell /> Trainer</Badge>
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
      </div>

      <FeatureGroup title="For trainers" icon={Users} features={trainer} models={data.models} config={config} tones={data.tones} onSave={saveFeature} />
      <FeatureGroup title="For clients" icon={HeartPulse} features={client} models={data.models} config={config} tones={data.tones} onSave={saveFeature} />
    </section>
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
    feat.task === "vision" ? m.task === "vision" || m.provider === "google" : m.task !== "vision" && m.task !== "image",
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
              <ChevronDown className={cn("transition-transform", open && "rotate-180")} /> {cfg.system ? "Custom prompt" : "Customize prompt"}
            </button>
            {open && (
              <div className="mt-2 space-y-2">
                <Textarea rows={6} value={draft} placeholder={feat.defaultSystem} onChange={(e) => setDraft(e.target.value)} className="text-xs" />
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={() => onSave({ system: draft.trim() || null })}>Save prompt</Button>
                  {cfg.system && <Button size="sm" variant="ghost" onClick={() => { setDraft(""); onSave({ system: null }); }}>Reset to default</Button>}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

/**
 * Premium detail sheets for a single check-in and a single lab test — the
 * client-facing "see what I submitted" surfaces. A check-in shows every logged
 * field, the progress photos (tap to zoom), and the coach's feedback; a lab
 * shows the uploaded file, reviewed marker values, and the coach's read.
 * Reused by the Wellness page and by activity-feed deep-links.
 */

import { fmtWeight, fmtVolume } from "@mossa/domain";
import {
  Sheet, SubCard, Badge, IconBadge, PhotoGrid, cn, toneVar, METRICS, type Photo, type Tone, type LucideIcon,
  ImageIcon, FlaskConical, ClipboardList, Calendar, Sparkles, HeartPulse,
} from "@mossa/ui";
import { useUnits } from "../../units.js";
import type { UnitPrefs } from "@mossa/domain";

export interface CheckInFull {
  id: string; date_local: string;
  weight_kg: number | null; mood: number | null; energy: number | null; stress: number | null;
  sleep_quality: number | null; sleep_hours: number | null; water_ml: number | null; steps_count: number | null;
  body_fat_percent: number | null; // as-of body-fat from measurements (server-attached)
  notes: string | null; photos_json: string | null;
  trainer_feedback: string | null; feedback_at: string | null;
}

export interface LabFull {
  id: string; display_name: string; status: string;
  instructions?: string | null; due_by?: string | null; file_key?: string | null; uploaded_at?: string | null;
  values?: { marker: string; value: string; unit?: string; refRange?: string; flag?: string }[] | null;
  client_notes?: string | null; trainer_feedback?: string | null; reviewed_at?: string | null;
}

/** Parse a check-in's photos_json into displayable photos. */
export function checkInPhotos(photosJson: string | null): Photo[] {
  if (!photosJson) return [];
  try {
    const arr = JSON.parse(photosJson) as { key: string; label?: string | null }[];
    return arr.filter((p) => p?.key).map((p) => ({ url: `/api/media/${p.key}`, label: p.label ?? null }));
  } catch { return []; }
}

const prettyDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

/** The coach's reply, styled as a warm primary-tinted note. */
function CoachFeedback({ title, body, at }: { title: string; body: string; at?: string | null }) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-primary/10 p-4">
      <div className="pointer-events-none absolute -right-6 -top-6 size-24 rounded-full bg-primary/10 blur-2xl" />
      <div className="relative flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary [&_svg]:size-3.5"><HeartPulse /> {title}{at ? <span className="ml-auto font-normal text-muted-foreground">{new Date(at).toLocaleDateString()}</span> : null}</div>
      <p className="relative mt-2 text-sm leading-relaxed">{body}</p>
    </div>
  );
}

// ── Check-in detail ──────────────────────────────────────────────────────────

function Rating({ kind, value }: { kind: "mood" | "energy" | "stress"; value: number }) {
  const m = METRICS[kind]; // label/icon/tone from the metric registry (SSOT)
  return (
    <div className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2.5">
      <IconBadge icon={m.icon} tone={m.tone} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-muted-foreground">{m.label}</div>
        <div className="mt-1 flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <span key={n} className={cn("h-1.5 flex-1 rounded-full", n > value && "bg-surface-3")} style={n <= value ? { backgroundColor: toneVar[m.tone] } : undefined} />
          ))}
        </div>
      </div>
      <span className="numeral text-sm font-semibold">{value}/5</span>
    </div>
  );
}

function Stat({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: string; tone: Tone }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-surface-2 px-3 py-2.5">
      <IconBadge icon={Icon} tone={tone} size="sm" />
      <div className="min-w-0">
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        <div className="numeral truncate text-sm font-semibold">{value}</div>
      </div>
    </div>
  );
}

// Icon / label / tone all come from the METRICS registry — this sheet is just
// another reader, so a check-in stat looks identical to the same metric on
// Progress / the home widgets.
function checkInStats(ci: CheckInFull, units: UnitPrefs): { icon: LucideIcon; label: string; value: string; tone: Tone }[] {
  const m = METRICS;
  const out: { icon: LucideIcon; label: string; value: string; tone: Tone }[] = [];
  if (ci.weight_kg != null) out.push({ icon: m.weight.icon, label: m.weight.label, value: fmtWeight(ci.weight_kg, units), tone: m.weight.tone });
  if (ci.body_fat_percent != null) out.push({ icon: m.bodyFat.icon, label: m.bodyFat.label, value: `${ci.body_fat_percent.toFixed(1)}%`, tone: m.bodyFat.tone });
  if (ci.sleep_hours != null) out.push({ icon: m.sleep.icon, label: m.sleep.label, value: `${ci.sleep_hours}h${ci.sleep_quality != null ? ` · ${ci.sleep_quality}/5` : ""}`, tone: m.sleep.tone });
  if (ci.steps_count != null) out.push({ icon: m.steps.icon, label: m.steps.label, value: ci.steps_count.toLocaleString(), tone: m.steps.tone });
  if (ci.water_ml != null && ci.water_ml > 0) out.push({ icon: m.water.icon, label: m.water.label, value: fmtVolume(ci.water_ml, units), tone: m.water.tone });
  return out;
}

export function CheckInDetailSheet({ checkIn, onClose }: { checkIn: CheckInFull; onClose: () => void }) {
  const units = useUnits();
  const photos = checkInPhotos(checkIn.photos_json);
  const ratings = (["mood", "energy", "stress"] as const).filter((k) => checkIn[k] != null);
  const stats = checkInStats(checkIn, units);

  return (
    <Sheet open onClose={onClose} title="Check-in" titleAction={<Badge tone="nutrition">{prettyDate(checkIn.date_local)}</Badge>}>
      <div className="space-y-4">
        {stats.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {stats.map((s) => <Stat key={s.label} {...s} />)}
          </div>
        )}

        {ratings.length > 0 && (
          <div className="space-y-2">
            {ratings.map((k) => <Rating key={k} kind={k} value={checkIn[k]!} />)}
          </div>
        )}

        {photos.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Sparkles className="size-3.5" /> Progress photos</div>
            <PhotoGrid photos={photos} />
          </div>
        )}

        {checkIn.notes && (
          <SubCard className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><ClipboardList className="size-3.5" /> Your note</div>
            <p className="text-sm">{checkIn.notes}</p>
          </SubCard>
        )}

        {checkIn.trainer_feedback ? (
          <CoachFeedback title="Coach feedback" body={checkIn.trainer_feedback} at={checkIn.feedback_at} />
        ) : (
          <SubCard className="text-sm text-muted-foreground">Your coach hasn't replied yet — you'll get a notification when they do.</SubCard>
        )}
      </div>
    </Sheet>
  );
}

// ── Lab detail ───────────────────────────────────────────────────────────────

const FLAG_TONE: Record<string, Tone> = { low: "cardio", normal: "success", high: "danger" };
/** Shared lab-status coding — tone + label — so the list row and this sheet
 *  always agree on how a status looks and reads. */
export const LAB_STATUS: Record<string, { tone: Tone; label: string }> = {
  requested: { tone: "warning", label: "Requested" },
  scheduled: { tone: "cardio", label: "Scheduled" },
  uploaded: { tone: "activity", label: "In review" },
  reviewed: { tone: "success", label: "Reviewed" },
  cancelled: { tone: "neutral", label: "Cancelled" },
};
export const labStatus = (status: string) => LAB_STATUS[status] ?? { tone: "lab" as Tone, label: status };
export const isLabImage = (key: string) => /\.(png|jpe?g|webp|gif|heic)$/i.test(key);

export function LabDetailSheet({ lab, onClose }: { lab: LabFull; onClose: () => void }) {
  const fileUrl = lab.file_key ? `/api/media/${lab.file_key}` : null;
  const hasImage = !!(lab.file_key && isLabImage(lab.file_key));
  const st = labStatus(lab.status);

  return (
    <Sheet open onClose={onClose} title={lab.display_name} titleAction={<Badge tone={st.tone}>{st.label}</Badge>}>
      <div className="space-y-4">
        {lab.instructions && (
          <SubCard className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><FlaskConical className="size-3.5" /> Instructions</div>
            <p className="text-sm text-muted-foreground">{lab.instructions}</p>
          </SubCard>
        )}
        {lab.due_by && lab.status !== "reviewed" && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground [&_svg]:size-4"><Calendar /> Due {new Date(lab.due_by).toLocaleDateString()}</div>
        )}

        {fileUrl && (
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Uploaded result</div>
            {hasImage ? (
              <PhotoGrid photos={[{ url: fileUrl, label: lab.display_name }]} cols={2} />
            ) : (
              <a href={fileUrl} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3 transition-colors hover:bg-surface-3">
                <IconBadge icon={ImageIcon} tone="lab" size="sm" />
                <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">View uploaded file</div><div className="text-xs text-muted-foreground">Opens in a new tab</div></div>
              </a>
            )}
          </div>
        )}

        {lab.client_notes && (
          <SubCard className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your note</div>
            <p className="text-sm">{lab.client_notes}</p>
          </SubCard>
        )}

        {lab.values && lab.values.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Results</div>
            <div className="overflow-hidden rounded-2xl bg-surface-2">
              {lab.values.map((v, i) => (
                <div key={i} className={cn("flex items-center justify-between gap-3 px-3.5 py-2.5", i > 0 && "border-t border-border/50")}>
                  <span className="min-w-0 truncate text-sm font-medium">{v.marker}</span>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="numeral text-sm font-semibold">{v.value}{v.unit ? <span className="ml-0.5 text-xs font-normal text-muted-foreground">{v.unit}</span> : null}</span>
                    {v.flag && v.flag !== "normal" && <Badge tone={FLAG_TONE[v.flag] ?? "sleep"}>{v.flag}</Badge>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {lab.trainer_feedback ? (
          <CoachFeedback title="Coach read" body={lab.trainer_feedback} at={lab.reviewed_at} />
        ) : lab.status !== "reviewed" ? (
          <SubCard className="text-sm text-muted-foreground">{lab.status === "uploaded" ? "Your coach is reviewing this — feedback is on the way." : "Upload your result to get your coach's read."}</SubCard>
        ) : null}
      </div>
    </Sheet>
  );
}

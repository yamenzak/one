/**
 * MAINTENANCE — the switch that closes the whole deployment.
 *
 * The most consequential control in any operator console, so the panel's job is
 * less "expose three values" and more "make sure the operator knows what the one
 * they are about to press does". Three things follow from that:
 *
 *   THE LEVELS ARE SPELLED OUT, not labelled. "Read-only" and "Closed" mean
 *   nothing on their own; what an operator needs is the consequence, in the
 *   present tense, for the level they have currently selected — including the
 *   part that surprises people, which is that `Closed` ends every live session.
 *
 *   THE WAY BACK OUT IS STATED. A maintenance switch that could lock out the
 *   person holding it would be a trap, so the exemptions are deliberate and
 *   documented in `@4dl/tenancy`'s maintenance.ts. Saying so here is what makes
 *   the operator willing to use the thing — the alternative is a switch nobody
 *   dares touch, which is the same as not having one.
 *
 *   CLOSING TAKES A SECOND PRESS. Not a modal, not a typed confirmation — just a
 *   button that changes what it says once, because this is a deliberate act by a
 *   competent operator and treating it as a hazard is theatre. It exists so the
 *   step from "read-only" to "everyone out" cannot be a mis-tap.
 *
 * The MESSAGE is the part that reaches actual people, and it is worth writing:
 * the app renders it verbatim above its own fallback copy. "Back by 14:00 UTC"
 * is worth more than any wording this package could pick in advance.
 */

import { useCallback, useState } from "react";
import {
  Card, ConfigRow, FieldGroup, LoadError, Reveal, SaveBar, SegmentedControl, Skeleton, SkeletonLine, Stagger, Textarea,
} from "@4dl/ui";
import { useAction, useLoad } from "@4dl/ui";
import {
  MAINTENANCE_MESSAGE_MAX,
  type Maintenance,
  type MaintenanceLevel,
} from "@4dl/tenancy/model";
import type { AdminDeps } from "../deps.js";

const LEVELS: { value: MaintenanceLevel; label: string }[] = [
  { value: "off", label: "Open" },
  { value: "readonly", label: "Read-only" },
  { value: "full", label: "Closed" },
];

/** What the selected level does, in the present tense. Shown for the SELECTION,
 *  not the saved state, so it reads as a preview of the button being pressed. */
const CONSEQUENCE: Record<MaintenanceLevel, string> = {
  off: "Everything works normally.",
  readonly:
    "The app stays usable and everything is readable. Saves are refused everywhere — logging, plans, settings, purchases. Nobody is signed out.",
  full:
    "The app is replaced by a maintenance notice and signing in is disabled. Every session ends immediately, including the ones open right now.",
};

/**
 * The loading state, shaped like the card it becomes.
 *
 * Rendering `null` while the fetch is in flight was worse here than anywhere
 * else in the console: an operator opens this panel to find out whether the
 * deployment is closed, and an empty screen is exactly what a closed deployment
 * looks like. A skeleton is silent about the answer.
 */
function MaintenanceSkeleton() {
  return (
    <Card className="space-y-4">
      <div className="flex items-start gap-2.5">
        <Skeleton className="mt-0.5 size-4 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <SkeletonLine w="8rem" />
          <SkeletonLine w="70%" h="xs" />
        </div>
        <SkeletonLine w="3rem" h="xs" className="mt-1" />
      </div>
      <div className="space-y-2.5">
        <SkeletonLine w="3rem" h="xs" />
        <SkeletonLine w="90%" h="xs" />
        <Skeleton className="h-11 rounded-xl" />
        <SkeletonLine w="75%" h="xs" />
      </div>
      <div className="space-y-2.5">
        <SkeletonLine w="4.5rem" h="xs" />
        <SkeletonLine w="80%" h="xs" />
        <Skeleton className="h-20 rounded-xl" />
      </div>
      <Skeleton className="h-12 rounded-xl" />
    </Card>
  );
}

export function PlatformMaintenanceSection({ api, errorText }: AdminDeps) {
  const load = useCallback(() => api.get<Maintenance>("/api/admin/maintenance"), [api]);
  const cfg = useLoad(load, "the maintenance switch", errorText);

  if (cfg.error && !cfg.data) return <LoadError what="the maintenance switch" error={cfg.error} onRetry={cfg.reload} />;

  return (
    <Stagger className="space-y-4">
      <Reveal loading={cfg.loading} skeleton={<MaintenanceSkeleton />}>
        {cfg.data && <MaintenanceForm api={api} errorText={errorText} d={cfg.data} reload={cfg.reload} />}
      </Reveal>
    </Stagger>
  );
}

function MaintenanceForm({ api, errorText, d, reload }: AdminDeps & { d: Maintenance; reload: () => void }) {
  const act = useAction(errorText);

  const [level, setLevel] = useState<MaintenanceLevel | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // Reset by every save and by every level change away from `full`, so the
  // confirmation can never be inherited from an earlier intention.
  const [armed, setArmed] = useState(false);

  // Local edits fall back to the server's value, so the form seeds itself
  // without an effect that would fight the operator's typing.
  const lvl = level ?? d.level;
  const msg = message ?? d.message ?? "";
  const dirty = lvl !== d.level || msg !== (d.message ?? "");
  // Only the STEP INTO closed needs arming. Already being closed and editing the
  // message does not end any more sessions, and stepping back down is recovery.
  const needsArming = lvl === "full" && d.level !== "full";

  const save = () =>
    act.run("save", async () => {
      const res = await api.post<Maintenance & { signedOut: number }>("/api/admin/maintenance", { level: lvl, message: msg.trim() });
      setLevel(null); setMessage(null); setArmed(false);
      reload();
      if (res.level === "off") return "Maintenance is off — the deployment is open.";
      if (res.level === "readonly") return "Read-only mode is on. Reads are served; every save is refused.";
      return res.signedOut > 0
        ? `Closed. ${res.signedOut} session${res.signedOut === 1 ? "" : "s"} ended.`
        : "Closed. Signing in is disabled.";
    }, "Couldn't change the maintenance switch — it is unchanged.");

  return (
    <Card className="space-y-4">
      {/* State first, in the ConfigRow's own vocabulary: whether the product is
          currently being served is the question an operator arrived with. */}
      <ConfigRow
        label="This deployment"
        ok={d.level === "off"}
        okLabel="Open"
        missingLabel={d.level === "full" ? "Closed" : "Read-only"}
        detail={
          d.level === "off"
            ? "Every door is serving normally."
            : `${CONSEQUENCE[d.level]}${d.since ? ` In effect since ${new Date(d.since).toLocaleString()}.` : ""}`
        }
      />

      {/* Both explanations sit BELOW their control (UI-LANGUAGE §7). They used
          to sit above it — four lines of reassurance to read before reaching the
          switch, which is backwards twice over: the consequence of a level is
          only interesting once you have picked one, and "you can always undo
          this" answers a doubt the picker itself raises. */}
      <FieldGroup title="Level">
        <SegmentedControl
          options={LEVELS}
          value={lvl}
          onChange={(v) => { setLevel(v); setArmed(false); }}
        />
        <p className="text-caption leading-relaxed text-muted-foreground">{CONSEQUENCE[lvl]}</p>
        {lvl !== "off" && (
          <p className="text-caption leading-relaxed text-muted-foreground">
            This console is never closed and a platform admin is exempt on every door, so it can always be undone from
            here. Signature-verified payment webhooks and the health check keep answering too.
          </p>
        )}
      </FieldGroup>

      <FieldGroup title="Message">
        <Textarea
          rows={3}
          maxLength={MAINTENANCE_MESSAGE_MAX}
          value={msg}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="We're upgrading the database. Back by 14:00 UTC."
        />
        <p className="text-caption leading-relaxed text-muted-foreground">
          Shown verbatim to everyone who arrives, above our own wording. A time is the most useful thing to put here.
        </p>
      </FieldGroup>

      {/* One press to arm, one to fire — and only for the step that ends
          sessions. Deliberately not a modal: this is an intentional act by an
          operator, and the cost of a mis-tap is what needs guarding, not the
          decision itself. */}
      {needsArming && !armed ? (
        <SaveBar
          label="Close the deployment…"
          saving={false}
          dirty={dirty}
          msg={act.msg}
          err={act.err}
          onSave={() => setArmed(true)}
        />
      ) : (
        <SaveBar
          label={needsArming ? "Yes — close it and end every session" : "Apply"}
          saving={act.busy === "save"}
          dirty={dirty}
          msg={act.msg}
          err={act.err}
          onSave={() => void save()}
        />
      )}
    </Card>
  );
}

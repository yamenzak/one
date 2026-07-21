/**
 * BodyScanLauncher — the shared "launch the on-device body scan" plumbing.
 *
 * Owns the three things every scan entry point needs: (1) the client
 * `ScanProfile` fetch (sex/age/height + latest weight from GET /api/clients/:id),
 * (2) the `canUseBodyScan` flag gate — known-off renders nothing, exactly like
 * BodyScanCard, and (3) the lazily-imported, full-screen <BodyScanFlow> overlay
 * (MediaPipe never bloats the main bundle).
 *
 * Consumers drive it via a render-prop trigger: they draw their own button and
 * call `open()` — the flow reveals + saves the body-fat measurement server-side,
 * then fires `onSaved`. Used by BodyScanCard (Progress "Body" lens) and the
 * LogSheet body-measurements drawer.
 */

import { Suspense, lazy, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Spinner } from "@mossa/ui";
import { api } from "../../../api.js";
import { useSession } from "../../../session.js";
import { useUnits } from "../../../units.js";
import type { ScanProfile, ScanResult } from "./BodyScanFlow.js";

const BodyScanFlow = lazy(() => import("./BodyScanFlow.js"));

interface ClientProfile {
  client: { gender: string | null; heightCm: number | null; dateOfBirth: string | null };
  metrics: { ageYears: number | null; weightKg: number | null };
}

export interface BodyScanLauncherState {
  /** Open the scan flow. No-op until the profile is complete. */
  open: () => void;
  /** Profile fetch still in flight. */
  loading: boolean;
  /** Profile has sex + age + height — the scan can run. */
  profileReady: boolean;
  /** Height specifically is on file (the measurement can't calibrate without it). */
  hasHeight: boolean;
  /** The studio has generated a full voice-cue pack — the camera scanner needs it. */
  voiceReady: boolean;
}

export function BodyScanLauncher({
  clientId,
  onSaved,
  children,
}: {
  clientId: string;
  /** Fired after a scan is saved (the flow already wrote the measurement). */
  onSaved?: (r: ScanResult & { id: string }) => void;
  children: (state: BodyScanLauncherState) => ReactNode;
}) {
  const { ctx } = useSession();
  const units = useUnits();
  const [profile, setProfile] = useState<{ p: ScanProfile | null; hasHeight: boolean; latestWeightKg: number | null } | null>(null);
  const [voiceReady, setVoiceReady] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);

  // Known-off flag → render nothing (the surface just skips this entry point).
  const flagOff = ctx?.clientFlags?.canUseBodyScan === false;

  useEffect(() => {
    if (flagOff) return;
    void api
      .get<ClientProfile>(`/api/clients/${clientId}`)
      .then((r) => {
        const g = r.client.gender;
        const hasHeight = r.client.heightCm != null;
        const p: ScanProfile | null =
          (g === "male" || g === "female") && r.metrics.ageYears != null && r.client.heightCm != null
            ? { gender: g, ageYears: r.metrics.ageYears, heightCm: r.client.heightCm }
            : null;
        setProfile({ p, hasHeight, latestWeightKg: r.metrics.weightKg });
      })
      .catch(() => setProfile({ p: null, hasHeight: false, latestWeightKg: null }));
    // The camera scanner is voice-guided; require the studio to have generated a
    // full cue pack first. A cue with an empty url isn't voiced → not ready.
    void api
      .get<{ cues: { url: string }[] }>("/api/body-scan/cues")
      .then((r) => setVoiceReady(r.cues.length > 0 && r.cues.every((c) => !!c.url)))
      .catch(() => setVoiceReady(false));
  }, [clientId, flagOff]);

  if (flagOff) return null;

  const profileReady = !!profile?.p;
  const hasHeight = !!profile?.hasHeight;
  const voiceOk = voiceReady === true;

  return (
    <>
      {children({ open: () => { if (profileReady) setOpen(true); }, loading: profile == null || voiceReady == null, profileReady, hasHeight, voiceReady: voiceOk })}
      {open && profile?.p && createPortal(
        // Portal to <body>: the full-screen overlay uses position:fixed, but an
        // ancestor's motion transform would otherwise become its containing block
        // (fixed resolves to the transformed parent, not the viewport), so it
        // rendered trapped inside the page — clipped, with the bottom nav bleeding
        // over it. At the body root it truly covers the viewport, above the nav.
        <Suspense fallback={<div className="fixed inset-0 z-[70] grid place-items-center bg-background"><Spinner className="size-8" /></div>}>
          <BodyScanFlow
            clientId={clientId}
            profile={profile.p}
            latestWeightKg={profile.latestWeightKg}
            units={units}
            voiceReady={voiceOk}
            onClose={() => setOpen(false)}
            onSaved={(r: ScanResult & { id: string }) => { setOpen(false); onSaved?.(r); }}
          />
        </Suspense>,
        document.body,
      )}
    </>
  );
}

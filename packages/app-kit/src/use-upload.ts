/**
 * AN UPLOAD THAT SAYS HOW FAR ALONG IT IS.
 *
 * Every upload in this product used to be `setBusy(true)` around an awaited
 * `uploadMedia`, which produces one of two indistinguishable pictures: a dimmed
 * control, or nothing at all. On a phone, on a real connection, a progress photo
 * is the request that most often takes long enough for someone to conclude the
 * app has frozen and press the button again — and there was nothing on screen
 * that could tell them otherwise.
 *
 * This owns the whole lifecycle so a screen never re-derives it:
 *
 *   progress   0..1 while the bytes go up, `null` when the length is unknown
 *              (the browser fires `lengthComputable: false` and a made-up
 *              percentage is worse than an honest spinner)
 *   phase      "sending" while it uploads, "processing" between the last byte
 *              and the server's answer — the window where a determinate bar
 *              would otherwise sit at 100% looking stuck
 *   cancel     a real abort, reported as a cancel and never as a failure
 *
 * `@4dl/ui`'s `UploadProgress` renders exactly this shape, so the pair is what
 * a call site uses rather than either alone.
 */

import { useCallback, useRef, useState } from "react";
import { isAborted, uploadMedia } from "./api.js";

export type UploadPhase = "idle" | "sending" | "processing";

export interface UseUploadResult {
  /** Run one upload. Resolves to the media key, or null if it failed/cancelled. */
  upload: (file: Blob, purpose: string, opts?: { filename?: string; fields?: Record<string, string> }) => Promise<string | null>;
  /** True from the moment `upload` is called until it settles. */
  uploading: boolean;
  phase: UploadPhase;
  /** 0..1, or null when this upload cannot report a length. */
  progress: number | null;
  /** Set when the upload FAILED. A cancel leaves this null — see the header. */
  error: string | null;
  /** Abort the upload in flight. */
  cancel: () => void;
  /** Clear a previous error without starting anything. */
  reset: () => void;
}

export function useUpload(): UseUploadResult {
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const cancel = useCallback(() => abort.current?.abort(), []);
  const reset = useCallback(() => setError(null), []);

  const upload = useCallback(async (
    file: Blob,
    purpose: string,
    opts: { filename?: string; fields?: Record<string, string> } = {},
  ): Promise<string | null> => {
    const ctl = new AbortController();
    abort.current = ctl;
    setPhase("sending");
    setProgress(null);
    setError(null);
    try {
      const key = await uploadMedia(file, purpose, {
        ...opts,
        signal: ctl.signal,
        onProgress: (f) => {
          setProgress(f);
          // The bytes are gone but the server has not answered. Saying
          // "processing" is the difference between a bar that finished and a
          // bar that stopped.
          if (f >= 1) setPhase("processing");
        },
      });
      return key;
    } catch (e) {
      // A cancel is an outcome the person chose. Reporting it as a failure is
      // how a working cancel button gets a reputation for being broken.
      if (!isAborted(e)) setError(e instanceof Error && e.message ? e.message : "Couldn't upload that — try again.");
      return null;
    } finally {
      abort.current = null;
      setPhase("idle");
      setProgress(null);
    }
  }, []);

  return { upload, uploading: phase !== "idle", phase, progress, error, cancel, reset };
}

/**
 * A CAMERA THAT READS A CODE — one control, so nobody writes `getUserMedia`.
 *
 * ⚠️ IT HANDS BACK A STRING AND KNOWS NOTHING ELSE. What the string MEANS is the
 * product's business: a barcode on a box, a label on a shelf, a ticket, a
 * membership card. A component that knew about stock would be one no other app
 * could use, and this package carries no product vocabulary at all.
 *
 * ⚠️ THE HARD PART IS NOT THE VIDEO, IT IS THE FOUR WAYS IT DOES NOT WORK. The
 * camera can be refused, absent, already in use by something else, or present on
 * a browser with no decoder — and every one of those has to say which, because
 * "scanning is not working" sends somebody to the wrong fix. Written per screen,
 * each surface gets a different subset, and the one that gets left out is always
 * the permission refusal, because the person writing it granted permission on
 * the first run and never saw the state again.
 *
 * ⚠️ AND TYPING IT IN IS ALWAYS OFFERED. Every one of those states ends in
 * somebody standing in front of a shelf with a job to do, and a scanner is a
 * convenience over a keyboard rather than a replacement for one. A scanning
 * surface with no way in but the camera is a surface that strands people.
 *
 * ⚠️ THE TORCH IS PART OF THE CONTROL, NOT A FEATURE. Stock lives in basements,
 * cold rooms and the backs of racks. A torch button on the surface that needs it
 * is one press; the same person's alternative is leaving the app.
 */

import * as React from "react";
import { Button } from "@heroui/react";
import { Cluster, Stack } from "./arrange.js";
import { DROP_PAD, SPACE } from "../tokens/metrics.js";
import { TYPE } from "../tokens/type.js";
import { MOTION } from "../tokens/motion.js";

/* --------------------------------------------------------------- the seam --- */

/**
 * ⚠️ DECLARED HERE BECAUSE IT IS NOT IN `lib.dom` YET. `BarcodeDetector` ships
 * in Chromium and in Android WebView and is absent in Safari, so the type has to
 * be written down and the ABSENCE has to be a state rather than a crash —
 * `new BarcodeDetector()` on a browser without it throws a ReferenceError that
 * unmounts the whole screen.
 */
interface Detected { readonly rawValue: string }
interface Detector { detect(source: CanvasImageSource): Promise<readonly Detected[]> }
interface DetectorClass {
  new (options?: { formats?: readonly string[] }): Detector;
  getSupportedFormats?: () => Promise<readonly string[]>;
}

/**
 * ⚠️ NAMED RATHER THAN LEFT TO THE DEFAULT, and the reason is speed on a cheap
 * phone. A detector asked for every format it knows runs every decoder over
 * every frame; these are the ones a code on a physical thing is actually in.
 */
const FORMATS = [
  "qr_code", "data_matrix", "ean_13", "ean_8", "upc_a", "upc_e",
  "code_128", "code_39", "itf",
] as const;

const detectorClass = (): DetectorClass | null => {
  const at = (globalThis as { BarcodeDetector?: DetectorClass }).BarcodeDetector;
  return typeof at === "function" ? at : null;
};

/* ---------------------------------------------------------------- the torch --- */

/** ⚠️ Not in `lib.dom` either — the constraint is real and the type is not. */
interface Torchable extends MediaTrackConstraintSet { torch?: boolean }

/* --------------------------------------------------------------- the states --- */

/**
 * ⚠️ FIVE, AND EACH ONE NAMES ITS OWN FIX. `refused` is a browser setting,
 * `none` is a device with no camera, `taken` is another app holding it, `unable`
 * is a browser with no decoder, and `blind` is the one that catches people out —
 * a camera only works on a secure origin, so a phone opening a colleague's
 * laptop over plain http gets a permission prompt that never appears.
 */
type Trouble = "refused" | "none" | "taken" | "unable" | "blind";

const SAYS: Readonly<Record<Trouble, { readonly says: string; readonly under: string }>> = {
  /* ⚠️ NONE OF THESE REPEATS "TYPE IT IN" — the button that does it is directly
     under them, and copy restating the control beside it is the interface saying
     everything twice to somebody already having a bad minute. */
  refused: {
    says: "The camera is blocked",
    under: "Allow it in the address bar, or type the code",
  },
  none: {
    says: "No camera here",
    under: "This device does not have one",
  },
  taken: {
    says: "The camera is busy",
    under: "Something else is using it — close that and try again",
  },
  unable: {
    says: "This browser cannot read codes",
    under: "It has a camera but no code reader",
  },
  blind: {
    says: "The camera needs a secure connection",
    under: "Browsers only allow a camera over https",
  },
};

/* ------------------------------------------------------------------ props --- */

export interface ViewfinderProps {
  /**
   * ⚠️ CALLED ONCE PER READ, NOT ONCE PER FRAME. A code sits in front of a lens
   * for a second or more and decodes thirty times — a caller that had to
   * de-duplicate would be every caller writing the same guard, and the first one
   * to forget records thirty movements.
   */
  readonly onRead: (code: string) => void;
  /**
   * ⚠️ HOW LONG BEFORE THE SAME CODE COUNTS AGAIN. Long enough that a label held
   * still is one read; short enough that scanning the same product twice on
   * purpose — two boxes off the same pallet — is two.
   */
  readonly again?: number;
  /** Stops the camera without unmounting: a sheet open behind another sheet. */
  readonly paused?: boolean;
  /** ⚠️ The app's words for what to point at. This package has no nouns. */
  readonly says?: string;
  /** The way in that always works. Offered beside the frame and in every fault. */
  readonly onType?: () => void;
  readonly typeLabel?: string;
}

/* ------------------------------------------------------------------ camera --- */

/**
 * ⚠️ THE WHOLE LIFECYCLE IN ONE PLACE, because half of it is the part people get
 * wrong: a stream that is not stopped keeps the camera light on after the sheet
 * closes, which reads as an app that is watching you.
 */
function useCamera(paused: boolean, video: React.RefObject<HTMLVideoElement | null>) {
  const [trouble, setTrouble] = React.useState<Trouble | null>(null);
  const [live, setLive] = React.useState(false);
  const track = React.useRef<MediaStreamTrack | null>(null);

  React.useEffect(() => {
    if (paused) return;

    /* ⚠️ CHECKED BEFORE ASKING. On an insecure origin `mediaDevices` is simply
       undefined, and reading `.getUserMedia` off it throws — so the honest state
       arrives as a crash instead of as a sentence. */
    if (!globalThis.navigator?.mediaDevices?.getUserMedia) {
      setTrouble(globalThis.isSecureContext === false ? "blind" : "none");
      return;
    }
    if (!detectorClass()) { setTrouble("unable"); return; }

    let stream: MediaStream | null = null;
    let dropped = false;

    void navigator.mediaDevices.getUserMedia({
      /* ⚠️ THE BACK CAMERA, AND `ideal` RATHER THAN `exact`. A laptop has only a
         front one, and `exact` fails outright there — which turns "scanning
         works, just with the wrong lens" into "no camera". */
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    }).then((got) => {
      if (dropped) { got.getTracks().forEach((t) => { t.stop(); }); return; }
      stream = got;
      track.current = got.getVideoTracks()[0] ?? null;
      const at = video.current;
      if (at) {
        at.srcObject = got;
        /* ⚠️ A REJECTED `play()` IS NOT A FAILURE HERE. Autoplay policies reject
           it when the element is not yet visible, and the browser starts it
           itself the moment it is — an uncaught rejection would be an error in
           the console on every open. */
        void at.play().catch(() => undefined);
      }
      setLive(true);
    }).catch((err: unknown) => {
      const name = (err as { name?: string }).name ?? "";
      setTrouble(
        name === "NotAllowedError" || name === "SecurityError" ? "refused"
          : name === "NotFoundError" || name === "OverconstrainedError" ? "none"
            : name === "NotReadableError" ? "taken"
              : "none",
      );
    });

    return () => {
      dropped = true;
      setLive(false);
      track.current = null;
      stream?.getTracks().forEach((t) => { t.stop(); });
      if (video.current) video.current.srcObject = null;
    };
  }, [paused, video]);

  return { trouble, live, track };
}

/* ------------------------------------------------------------------- watch --- */

/**
 * ⚠️ ONE DETECTOR FOR THE LIFE OF THE SURFACE, and one frame at a time. Built
 * per frame it is a decoder constructed thirty times a second; run without
 * awaiting the previous frame it queues work faster than the phone finishes it,
 * and the surface heats up and falls behind by a growing amount.
 */
function useReading(
  live: boolean,
  video: React.RefObject<HTMLVideoElement | null>,
  onRead: (code: string) => void,
  again: number,
) {
  /* ⚠️ IN A REF, NOT IN STATE. Re-arming the loop on every read would restart
     the detector, and a re-render mid-scan would forget what was just read. */
  const last = React.useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const said = React.useRef(onRead);
  said.current = onRead;

  React.useEffect(() => {
    if (!live) return;
    const Made = detectorClass();
    if (!Made) return;

    const detector = new Made({ formats: FORMATS });
    let frame = 0;
    let stopped = false;

    const look = async () => {
      if (stopped) return;
      const at = video.current;
      if (at && at.readyState >= 2) {
        try {
          const found = await detector.detect(at);
          const code = found[0]?.rawValue ?? "";
          const now = Date.now();
          if (code && (code !== last.current.code || now - last.current.at > again)) {
            last.current = { code, at: now };
            said.current(code);
          }
        } catch {
          /* ⚠️ A FRAME THAT WILL NOT DECODE IS THE ORDINARY CASE — a hand across
             the lens, a frame between resolutions. Reporting it would put a
             fault on the screen every time somebody moved. */
        }
      }
      frame = requestAnimationFrame(() => { void look(); });
    };

    frame = requestAnimationFrame(() => { void look(); });
    return () => { stopped = true; cancelAnimationFrame(frame); };
  }, [live, video, again]);
}

/* ------------------------------------------------------------------ surface --- */

export function Viewfinder({
  onRead, again = 1_500, paused = false, says, onType, typeLabel = "Type it in",
}: ViewfinderProps) {
  const video = React.useRef<HTMLVideoElement>(null);
  const { trouble, live, track } = useCamera(paused, video);
  useReading(live && !paused, video, onRead, again);

  const [lit, setLit] = React.useState(false);
  /* ⚠️ OFFERED ONLY WHERE IT EXISTS. A torch button on a laptop is a control
     that does nothing, and a control that does nothing is read as broken. */
  const hasTorch = Boolean(
    (track.current?.getCapabilities?.() as { torch?: boolean } | undefined)?.torch,
  );

  const light = React.useCallback((on: boolean) => {
    const at = track.current;
    if (!at) return;
    void at.applyConstraints({ advanced: [{ torch: on } as Torchable] })
      .then(() => { setLit(on); })
      /* ⚠️ A TORCH THAT WILL NOT LIGHT LEAVES THE BUTTON OFF rather than showing
         it on — a control claiming a state the device is not in is worse than
         one that visibly did nothing. */
      .catch(() => { setLit(false); });
  }, [track]);

  if (trouble) {
    const said = SAYS[trouble];
    return (
      <div className={`text-center ${DROP_PAD}`}>
        <Stack space="snug">
          <strong className={TYPE.label}>{said.says}</strong>
          <p className={TYPE.note}>{said.under}</p>
          {onType ? <Button variant="secondary" onPress={onType}>{typeLabel}</Button> : null}
        </Stack>
      </div>
    );
  }

  return (
    <Stack space="snug">
      <div
        /* ⚠️ A FIXED ASPECT RATHER THAN A HEIGHT. The frame is the same shape on
           every device, so the guide inside it means the same thing — and the
           video fills it by cropping rather than by letterboxing, which is what
           `object-cover` is for. */
        className="relative w-full aspect-[4/3] overflow-hidden rounded-2xl bg-black"
      >
        <video
          ref={video}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ opacity: live ? 1 : 0, transition: MOTION.enter }}
          muted
          playsInline
          /* ⚠️ The camera is a picture of what somebody is pointing at, and it
             carries nothing a reader needs described. */
          aria-hidden="true"
        />
        {/* ⚠️ NO GUIDE BOX, AND THE FIRST DRAFT DREW ONE. The decoder reads the
            WHOLE frame, so a rectangle in the middle is the interface lying
            about how it works — somebody lines a barcode up inside it and the
            one who ignored it scans faster. The frame is the guide. */}
        {hasTorch ? (
          <div className="absolute bottom-3 right-3">
            <Button size="sm" variant={lit ? "primary" : "secondary"} onPress={() => { light(!lit); }}>
              {lit ? "Light off" : "Light"}
            </Button>
          </div>
        ) : null}
      </div>

      <Cluster>
        <p className={`min-w-0 grow ${TYPE.note}`}>{says ?? "Point it at a code"}</p>
        {onType ? <Button size="sm" variant="ghost" onPress={onType}>{typeLabel}</Button> : null}
      </Cluster>
    </Stack>
  );
}

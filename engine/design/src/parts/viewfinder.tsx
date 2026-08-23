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
 * ⚠️ AND TYPING IT IN IS ALWAYS OFFERED — BY THE SHAPE, NOT BY THE CALLER. The
 * field is part of this control and `typed` is required, so every scanning
 * surface has one whether or not whoever wrote it thought about the camera
 * failing. Every one of those states ends in somebody standing in front of a
 * shelf with a job to do, and a scanner is a convenience over a keyboard rather
 * than a replacement for one; a surface with no way in but the camera strands
 * them. As an optional callback it was left out of three of the four, including
 * the count session — where the camera failing meant a shelf half counted.
 *
 * ⚠️ AND THE FIELD IS ON THE SCREEN, NOT BEHIND THE CAMERA'S FAILURE. A code
 * somebody can read off a box is faster to type than to line up — and MOST
 * WAREHOUSE SCANNERS ARE KEYBOARD WEDGES, which type into whatever holds the
 * caret and press Enter. A visible field that answers Enter is a hardware
 * integration nobody had to write; the same field behind "the camera did not
 * work" is a device that appears to be broken.
 *
 * ⚠️ THE TORCH IS PART OF THE CONTROL, NOT A FEATURE. Stock lives in basements,
 * cold rooms and the backs of racks. A torch button on the surface that needs it
 * is one press; the same person's alternative is leaving the app.
 */

import * as React from "react";
import { CameraOff } from "lucide-react";
import { Button } from "@heroui/react";
import { Stack } from "./arrange.js";
import { TextInput } from "./forms.js";
import { Nothing } from "./state.js";
import { SPACE } from "../tokens/metrics.js";
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
  /**
   * ⚠️ THE WAY IN THAT ALWAYS WORKS, AND IT IS REQUIRED. Every caller gets a
   * field under the frame that reads the same `onRead`, so a camera that is
   * refused, absent, busy or undecodable costs somebody a keystroke rather than
   * their job. It was an OPTIONAL callback and three of four scanning surfaces
   * left it out — including the count session, where the camera failing meant a
   * shelf half counted and no way to finish it.
   *
   * ⚠️ THE WORDS ARE THE APP'S because this package has no nouns; the SHAPE is
   * the package's because that is what stops it being forgotten.
   */
  readonly typed: {
    readonly label: string;
    readonly placeholder?: string;
    readonly help?: string;
  };
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
         works, just with the wrong lens" into "no camera".

         ⚠️ AND A SIZE, BECAUSE THE DECODER IS GIVEN WHATEVER ARRIVES. Unasked, a
         phone hands over the sensor's full frame — four times the pixels of this
         and four times the work per read, for a barcode that is legible at a
         fraction of it. `ideal` again: a camera that cannot do this size gives
         its nearest instead of failing. */
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
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
 * HOW OFTEN A FRAME IS ACTUALLY DECODED.
 *
 * ⚠️ THE LOOP AWAITED ITS PREVIOUS DECODE AND THEN ASKED FOR THE NEXT FRAME
 * IMMEDIATELY, which is not one frame at a time so much as ALL OF THEM, for as
 * long as the screen is open. A decode of a full-resolution frame is tens of
 * milliseconds on a phone, so back to back it is the main thread — and the
 * symptom is not a slow scanner. It is that every OTHER thing the page has to do
 * queues behind it: a tap on the nav paints its ripple from the compositor and
 * then sits there, because the handler that would answer it cannot run. Reported
 * as navigation needing several presses and the app going stubborn, which is
 * exactly what it was.
 *
 * ⚠️ AND EIGHT A SECOND IS NOT A COMPROMISE. A person points a phone at a label
 * and holds it there; the code is in frame for a second at least, which is eight
 * chances. Sixty was never about reading sooner — it was about nobody having
 * chosen a number.
 *
 * ⚠️ THE SAME FAULT AS THE ICON, ONE THREAD OVER (D60). Drawing is what spends a
 * worker's only thread; decoding is what spends a phone's.
 */
const A_SECOND = 1000;
const READS_PER_SECOND = 8;
const GAP = A_SECOND / READS_PER_SECOND;

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

    /* ⚠️ WHEN THE LAST DECODE RAN, so the loop can skip a frame rather than
       stop and restart. Waking on the frame and doing nothing costs a
       comparison; a timer instead would drift away from paint and go on firing
       in a tab nobody is looking at, which `requestAnimationFrame` does not. */
    let read = 0;

    const look = async () => {
      if (stopped) return;
      const at = video.current;
      if (at && at.readyState >= 2 && Date.now() - read >= GAP) {
        read = Date.now();
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
  onRead, again = 1_500, paused = false, says, typed,
}: ViewfinderProps) {
  const video = React.useRef<HTMLVideoElement>(null);
  const { trouble, live, track } = useCamera(paused, video);
  useReading(live && !paused, video, onRead, again);

  /*
    ⚠️ THE FIELD CLEARS ITSELF ON SUBMIT, and that is what makes it a scanner
    port rather than a text box. A handheld reader types a code and presses
    Enter; leaving the last one in place means the next read appends to it, and
    the person finds out at the shelf.

    ⚠️ AND AN EMPTY SUBMIT IS NOTHING, not a read of "". Enter is pressed on an
    empty field by everybody who is thinking.
  */
  const [code, setCode] = React.useState("");
  const enter = React.useCallback(() => {
    const said = code.trim();
    if (!said) return;
    setCode("");
    onRead(said);
  }, [code, onRead]);

  const port = (
    <TextInput
      label={typed.label}
      value={code}
      onChange={setCode}
      onSubmit={enter}
      name="code"
      {...(typed.placeholder === undefined ? {} : { placeholder: typed.placeholder })}
      {...(typed.help === undefined ? {} : { help: typed.help })}
    />
  );

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
    /* ⚠️ THE SAME EMPTY STATE EVERY OTHER SURFACE DRAWS, not a centred block of
       its own. A fault here is the `nothing` outcome: there is no frame to show,
       and the field under it is the way on. Written by hand it centred the two
       sentences and left the control under them at the left margin, which is
       what a second implementation of a shared shape costs — the divergence is
       in the half nobody re-reads. */
    const said = SAYS[trouble];
    return (
      <Stack space="snug">
        {/* ⚠️ THE MARK NAMES WHAT IS MISSING, which the neutral circle cannot.
            Drawn straight from lucide for `Circle`'s reason: it is a STILL mark
            and the registry lives in the shell, so routing it through `glyphOf`
            would make a leaf control import the frame above it. */}
        <Nothing icon={<CameraOff />} says={said.says} under={said.under} />
        {port}
      </Stack>
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

      <p className={TYPE.note}>{says ?? "Point it at a code"}</p>
      {port}
    </Stack>
  );
}

/**
 * READING A BARCODE, on whatever the person is holding.
 *
 * Every flow in Tessa starts here, so this file's job is to fail gracefully in
 * three directions rather than to be clever in one.
 *
 * ── The two engines, and why both ───────────────────────────────────────────
 *
 * `BarcodeDetector` is built into Chrome and Android WebView and is dramatically
 * faster and lighter than anything shipped in JS — it is hardware-accelerated and
 * costs no bundle. It is also absent from Safari and Firefox, which is most of
 * the iPads in a clinic. So: native when present, `@zxing/browser` lazily
 * imported when not, and the ~200 kB of ZXing never loads for the phones that do
 * not need it.
 *
 * ── The third direction: no camera at all ───────────────────────────────────
 *
 * Permission refused, no camera, a laptop in an office, or a DataMatrix too worn
 * to read. Every scanning surface in the app pairs this with a text field, and
 * that field is not a fallback bolted on — a hand-held USB scanner (which most
 * stock rooms already own) presents as a KEYBOARD, so typing into that box is
 * how the cheapest hardware in the building works. Treating manual entry as the
 * degraded path would be backwards.
 *
 * ── What it does NOT do ─────────────────────────────────────────────────────
 *
 * It does not parse. A scanner returns the raw symbol text and the app hands
 * that string to `@tessa/domain`'s `parseGs1` or to the server unchanged. Doing
 * both here would put the one exhaustively-tested pure function behind a camera
 * that cannot be tested, which is the wrong side of that line.
 */

/** The formats a medical centre's labels actually use. */
const FORMATS = ["data_matrix", "qr_code", "code_128", "code_39", "ean_13", "ean_8", "itf", "codabar"] as const;

interface NativeDetector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
type DetectorCtor = new (opts: { formats: readonly string[] }) => NativeDetector;

/** Is the native detector present AND does it support the formats we need? */
export async function nativeScanSupported(): Promise<boolean> {
  const Ctor = (globalThis as { BarcodeDetector?: DetectorCtor & { getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector;
  if (!Ctor?.getSupportedFormats) return false;
  try {
    const supported = await Ctor.getSupportedFormats();
    // DataMatrix is the one that matters — it is what an EU UDI carrier is. A
    // browser with the API but without that format is worse than none, because
    // it would silently only read the linear codes.
    return supported.includes("data_matrix");
  } catch {
    return false;
  }
}

export interface ScanHandle {
  stop: () => void;
}

/**
 * `timeout` is raised by the CALLER, not here, and that split is the point.
 *
 * The failure this file can see is "the request was refused". The failure that
 * actually strands a person is "a stream was granted and no frame ever arrived"
 * — a camera held by another app, a wedged driver, a virtual device with nothing
 * behind it. `getUserMedia` resolves happily in all three. Only the surface
 * rendering the video knows whether a picture appeared, so only it can time out;
 * a timer in here would have to guess, and the first version of it guessed
 * wrong and left the sheet saying "Starting the camera…" indefinitely.
 */
export type ScanError = "no_camera" | "denied" | "unavailable" | "timeout";

/**
 * Start reading from the rear camera into `video`, calling `onResult` with the
 * raw symbol text.
 *
 * Deliberately callback-based rather than a promise: a stock keeper receives six
 * boxes without lowering the phone, and a one-shot promise would make the caller
 * tear the camera down and bring it back up between each one — half a second of
 * black screen, every time, on the flow the product is judged by.
 *
 * The caller is responsible for de-duplicating repeats; a camera reading 30 fps
 * will return the same symbol many times, and what counts as "the same scan
 * again" is a question about the SURFACE (receiving twenty of one box is real)
 * rather than about the reader.
 */
export async function startScan(
  video: HTMLVideoElement,
  onResult: (raw: string) => void,
  onError?: (e: ScanError) => void,
): Promise<ScanHandle> {
  let stopped = false;
  let stream: MediaStream | null = null;
  const stop = () => {
    stopped = true;
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  };

  if (!navigator.mediaDevices?.getUserMedia) {
    onError?.("no_camera");
    return { stop };
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      // `environment` rather than `exact: "environment"`: the exact form THROWS
      // on a laptop with only a front camera instead of falling back, and a
      // person at a desk checking a lot number should still get a picture.
      video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
  } catch (e) {
    onError?.((e as { name?: string }).name === "NotAllowedError" ? "denied" : "no_camera");
    return { stop };
  }
  if (stopped) {
    stream.getTracks().forEach((t) => t.stop());
    return { stop };
  }

  video.srcObject = stream;
  video.setAttribute("playsinline", "true"); // iOS: without it the video goes fullscreen
  await video.play().catch(() => undefined);

  if (await nativeScanSupported()) {
    const Ctor = (globalThis as unknown as { BarcodeDetector: DetectorCtor }).BarcodeDetector;
    const detector = new Ctor({ formats: FORMATS });
    const tick = async () => {
      if (stopped) return;
      try {
        const hits = await detector.detect(video);
        // Only the first. Two codes in frame is a person holding the phone over
        // a shelf, and picking one arbitrarily is better than acting on both.
        if (hits[0]?.rawValue) onResult(hits[0].rawValue);
      } catch {
        /* a frame that cannot be decoded is the normal case, not an error */
      }
      // rAF rather than setInterval: it stops when the tab is hidden, which
      // matters because this holds the camera open.
      requestAnimationFrame(() => void tick());
    };
    void tick();
    return { stop };
  }

  /**
   * ZXing, imported only now. It is the fallback path, and loading it eagerly
   * would put a few hundred kB in front of every Android phone in the building
   * that was never going to need it.
   */
  try {
    const [{ BrowserMultiFormatReader }, { DecodeHintType, BarcodeFormat }] = await Promise.all([
      import("@zxing/browser"),
      import("@zxing/library"),
    ]);
    if (stopped) return { stop };
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.DATA_MATRIX,
      BarcodeFormat.QR_CODE,
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.EAN_13,
      BarcodeFormat.ITF,
    ]);
    const reader = new BrowserMultiFormatReader(hints);
    const controls = await reader.decodeFromVideoElement(video, (result) => {
      if (!stopped && result) onResult(result.getText());
    });
    return {
      stop: () => {
        controls.stop();
        stop();
      },
    };
  } catch {
    onError?.("unavailable");
    return { stop };
  }
}

/**
 * Has this symbol just been seen?
 *
 * A camera returns the same code 30 times a second, so every surface needs this
 * and none of them should write it twice. The window is generous on purpose:
 * shorter and a person holding a box steady triggers the same action repeatedly;
 * the surfaces where scanning the SAME item twice is meaningful (counting a
 * second identical box) all take a typed quantity instead.
 */
export function makeDebouncer(windowMs = 2500): (raw: string) => boolean {
  const seen = new Map<string, number>();
  return (raw: string) => {
    const now = Date.now();
    for (const [k, t] of seen) if (now - t > windowMs) seen.delete(k);
    if (seen.has(raw)) return false;
    seen.set(raw, now);
    return true;
  };
}

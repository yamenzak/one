/**
 * CHOOSING A FILE — one control, so nobody writes a bare `<input type="file">`.
 *
 * ⚠️ A FILE INPUT IS THE ONE CONTROL THE BROWSER WILL NOT LET YOU STYLE, and
 * every product solves it the same wrong way: a hidden input, a button that
 * clicks it, and no thought given to the four states that follow. Written per
 * screen, each one gets a different subset — the first has no drag, the second
 * has no size limit in the copy, the third reports a rejected file by doing
 * nothing at all.
 *
 * ⚠️ THE HARD PART IS NOT THE PICKER, IT IS THE REFUSAL. A file the server will
 * reject is usually knowable here — the type and the size are on the `File`
 * before a byte is sent — and telling somebody after a five-second upload that
 * their logo is a JPEG is the whole difference between this being pleasant and
 * being a form. So `accept` and `most` are checked locally and reported in
 * place, and the server still checks both, because a client check is a courtesy
 * and never a control.
 *
 * ⚠️ AND DRAGGING IS OFFERED, NOT REQUIRED. The drop target is the whole
 * control, but everything it does is reachable from the button and from the
 * keyboard — a drop zone with no button is a control a keyboard cannot use, and
 * that is most of the ones in the wild.
 */

import * as React from "react";
import { Button } from "@heroui/react";
import { PLATFORM_PROBLEMS, type Problem, problem } from "@engine/kernel";
import { Paperclip } from "lucide-react";
import { DROP_PAD, ICON, ROW, SPACE } from "../tokens/metrics.js";
import { TYPE } from "../tokens/type.js";
import { MOTION } from "../tokens/motion.js";
import { Trouble } from "./state.js";
import { Size } from "./said.js";

export interface PickFileProps {
  /**
   * ⚠️ MIME TYPES, AND THE LIST IS ALSO THE COPY. Written once, the control can
   * say what it takes without a second sentence somebody has to keep in step.
   */
  readonly accept: readonly string[];
  /** The ceiling, in bytes. Reported in kB, because that is what a picker shows. */
  readonly most: number;
  /**
   * WHAT THE TARGET SAYS — a whole line, printed as it is written.
   *
   * ⚠️ A NOUN IS NOT A LINE, AND THIS DOC USED TO ASK FOR ONE. "a logo", it
   * said — so a caller following it got a lower-case fragment floating over a
   * button, and the only caller that read correctly was the one that ignored the
   * doc and passed a sentence. A prop rendered verbatim has to be documented as
   * verbatim; anything else is a component and its own contract disagreeing,
   * with the screen going to whichever the author read.
   */
  readonly says: string;
  /** One line under it — the shape rules the server will apply. */
  readonly under?: string;
  readonly label?: string;
  readonly busy?: boolean;
  /**
   * ⚠️ HOW MANY AT ONCE, AND ONE IS NOT THE ONLY ANSWER. A person adding six
   * photographs of a box took them in the camera roll a minute ago and they are
   * adjacent in it — six trips through the picker to fetch six adjacent files is
   * the control making somebody pay for a limit that was never a decision. Above
   * one, the input is `multiple` and the picker offers a selection.
   *
   * ⚠️ AND IT IS A CEILING RATHER THAN A COUNT. The caller usually holds some
   * already, so what it may take now is `most − held` — computed by the caller,
   * because only the caller knows what it is holding.
   */
  readonly atOnce?: number;
  /** ⚠️ Bytes, already read. A caller should never be handed a `File`: two
      screens would then each write their own reader, and one would forget the
      error event. */
  readonly onPick: (bytes: ArrayBuffer, file: File) => void;
  /** Offered only when there is something to remove. */
  readonly onClear?: () => void;
}

/**
 * ⚠️ THE REFUSALS THIS CONTROL CAN ANSWER WITHOUT ASKING THE SERVER, AND THEY
 * COME FROM THE CATALOGUE. This wrote its own three sentences for a year — in
 * this file, in a raw `text-danger` — so a file rejected here read in different
 * words, in a different tone and in a colour the contrast reading later found
 * short, from the same file rejected one layer up by the server. Two answers to
 * one question, and the one somebody actually hit was the local one.
 */
const refuse = (file: File, accept: readonly string[], most: number): Problem | null => {
  const raise = (code: string, values: Readonly<Record<string, string | number>> = {}) =>
    problem(PLATFORM_PROBLEMS, code, values);
  if (accept.length && !takes(accept, file.type)) {
    return raise("platform.wrong_kind", { wants: saysKind(accept) });
  }
  if (file.size > most) {
    return raise("platform.too_large", {
      size: Math.round(file.size / 1024), most: Math.round(most / 1024),
    });
  }
  if (!file.size) return raise("platform.empty_file");
  return null;
};

/**
 * ⚠️ A WILDCARD IS A REAL `accept` VALUE AND THIS DID NOT KNOW IT. `image/*` is
 * what every camera control in the world is written with — it is what makes a
 * phone offer the camera at all — and an exact-match test against it refuses
 * EVERY photograph, because a photograph's type is `image/jpeg`. On the screen
 * that meant a camera whose every shot came back "that kind of file will not
 * work", which is the control's own refusal path working perfectly on a file
 * that was always fine.
 */
export const takes = (accept: readonly string[], type: string): boolean =>
  accept.some((want) => (want.endsWith("/*")
    ? type.startsWith(`${want.slice(0, -1)}`)
    : want === type));

/**
 * `image/png` → `a PNG`; two of them → `a PNG or a JPEG`.
 *
 * ⚠️ AND A WILDCARD IS SAID AS ITS FAMILY, WHICH IS THE OTHER HALF OF THE SAME
 * BUG. Split on `/` and upper-cased, `image/*` reads "It has to be a *." — a
 * sentence that names no file anybody could produce, in a control whose whole
 * argument is that the refusal is the hard part.
 */
export const saysKind = (accept: readonly string[]): string => {
  const names = accept.map((t) => {
    const [family = t, kind] = t.split("/");
    return kind === "*" ? `${family === "image" ? "a picture" : `a ${family} file`}`
      : `a ${(kind ?? t).toUpperCase()}`;
  });
  return names.length < 2 ? names[0] ?? "another kind of file"
    : `${names.slice(0, -1).join(", ")} or ${names.at(-1)}`;
};

/**
 * WHICH OF THE PICKED FILES LAND, AND WHAT THE CONTROL SAYS ABOUT THE REST.
 *
 * ⚠️ PURE, AND SEPARATE FROM THE CONTROL, BECAUSE THE DECISION IS THE WHOLE BUG
 * SURFACE. Every fault this control has ever had was in here — an exact-match
 * against a wildcard, a sentence naming no real file, a loop that stopped at the
 * first refusal — and none of them needed a DOM to find. As a function it is
 * checked directly; inside the component it was only reachable through a browser.
 *
 * ⚠️ EVERY FILE IS JUDGED AND THE GOOD ONES STILL LAND. The obvious loop stops at
 * the first refusal, so somebody who picked five photographs and one video gets
 * nothing and a sentence about the video — and has to work out which of the six
 * it meant. The accepted ones are taken, the FIRST refusal is what the control
 * says, and the two do not contradict each other because the files that landed
 * are visible above the sentence.
 *
 * ⚠️ AND THE CEILING IS APPLIED BEFORE THE JUDGING, not after. Reading eight
 * photographs into memory to use two is a phone paying for a limit it was told
 * about first.
 */
export const sift = (
  picked: readonly File[], accept: readonly string[], most: number, atOnce: number,
): { readonly taking: readonly File[]; readonly why: Problem | null } => {
  const taking: File[] = [];
  let why: Problem | null = null;
  for (const file of picked.slice(0, Math.max(1, atOnce))) {
    const bad = refuse(file, accept, most);
    if (bad) { why = why ?? bad; continue; }
    taking.push(file);
  }
  return { taking, why };
};

export function PickFile({
  accept, most, says, under, label, busy, atOnce = 1, onPick, onClear,
}: PickFileProps) {
  const input = React.useRef<HTMLInputElement>(null);
  const [over, setOver] = React.useState(false);
  const [why, setWhy] = React.useState<Problem | null>(null);

  const take = async (picked: FileList | null): Promise<void> => {
    /* ⚠️ `Array.from`, NOT A SPREAD. A `FileList` is array-LIKE and iterable
       only on a DOM lib that says so — the spread typechecks against the browser
       lib and not against the one the app is built with, which is a difference
       that only appears at build time. */
    const { taking, why: bad } = sift(Array.from(picked ?? []), accept, most, atOnce);
    for (const file of taking) onPick(await file.arrayBuffer(), file);
    setWhy(bad);
  };

  return (
    <div className={`flex flex-col ${SPACE.tight}`}>
      <div
        /* ⚠️ THE WHOLE CONTROL IS THE TARGET, because a small one is a game.
           `preventDefault` on dragover is what stops the browser from navigating
           away to the file — leaving it out means dropping a logo replaces the
           application with a picture of it. */
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void take(e.dataTransfer.files);
        }}
        /*
          ⚠️ A SURFACE, NOT AN OUTLINE — `ground.ts` bans both borders and
          shadows, and elevation here is a difference of VALUE. The first draft
          drew a dashed edge in a colour called `--divider`, which this system
          does not have: the border was invisible, so the drop target read as
          floating text with a button under it, and nothing failed.

          ⚠️ `data-chrome` IS THE ONE THAT IS GUARANTEED SEPARABLE from both the
          page and a card, in both themes, over every ambience family — which is
          exactly what a target somebody aims a file at has to be.
        */
        data-chrome="true"
        data-over={over ? "true" : undefined}
        className={`flex flex-col items-center justify-center rounded-2xl text-center ${DROP_PAD} ${SPACE.tight} data-[over=true]:scale-[1.01]`}
        style={{ transition: MOTION.enter }}
      >
        <span className={TYPE.note}>{says}</span>
        {under ? <span className={`${TYPE.note} opacity-60`}>{under}</span> : null}

        <input
          ref={input}
          type="file"
          accept={accept.join(",")}
          {...(atOnce > 1 ? { multiple: true } : {})}
          className="sr-only"
          /* ⚠️ RESET AFTER EVERY PICK. Choosing the same file twice fires no
             `change` event unless the value is cleared — so somebody who fixed
             their file and picked it again would watch nothing happen. */
          onChange={(e) => { void take(e.target.files); e.target.value = ""; }}
        />

        {/* ⚠️ No padding of its own — the column's gap is the rhythm. */}
        <div className={`flex items-center ${SPACE.tight}`}>
          <Button
            size="sm"
            variant="secondary"
            isDisabled={busy}
            onPress={() => input.current?.click()}
          >
            {busy ? "Uploading…" : label ?? "Choose a file"}
          </Button>
          {onClear ? (
            <Button size="sm" variant="ghost" isDisabled={busy} onPress={onClear}>
              Remove
            </Button>
          ) : null}
        </div>
      </div>

      {/* ⚠️ THE REFUSAL SITS UNDER THE CONTROL THAT CAUSED IT, never in a toast.
          A file was rejected because of something about THAT file, and the
          sentence has to be beside the place they will try again.

          ⚠️ AND IT IS `Trouble`, WHICH IS THE ONE THING THAT DRAWS A REFUSAL.
          Inline is about WHERE it goes; what it looks like, what tone it takes
          and whether it offers a retry are the platform's, and a control that
          drew its own was a control where the same failure read differently
          depending on which screen you were on. */}
      {why ? <Trouble problem={why} /> : null}
    </div>
  );
}

/**
 * A PICKED FILE AS A `data:` URL.
 *
 * ⚠️ IT IS HERE BECAUSE `PickFile` HANDS BACK BYTES, and every caller that wants
 * to show or send a photograph needs the same six lines. Written per screen they
 * are written six ways, and one of the six spreads the array into
 * `String.fromCharCode` — which is correct on a favicon and throws on a
 * photograph, because the argument list of a call is bounded and a two-megabyte
 * image is two million arguments.
 */
export function asDataUrl(bytes: ArrayBuffer, type: string): string {
  const of = new Uint8Array(bytes);
  /* ⚠️ CHUNKED FOR THE REASON ABOVE. 8k at a time is comfortably inside every
     engine's argument limit and costs nothing measurable. */
  let raw = "";
  for (let at = 0; at < of.length; at += 8_192) {
    raw += String.fromCharCode(...of.subarray(at, at + 8_192));
  }
  return `data:${type || "application/octet-stream"};base64,${btoa(raw)}`;
}

/* ------------------------------------------------------------- shrinking --- */

/**
 * ⚠️ THE LONG EDGE, AND IT IS CHOSEN FOR WHAT READS A PHOTOGRAPH RATHER THAN FOR
 * WHAT TOOK IT. A phone hands over 4000×3000; a vision model tiles its input at a
 * few hundred pixels a side and gains nothing past about this, and a person
 * checking a thing in their hand against a picture on a phone gains nothing past
 * it either. Everything above it is upload time in a basement, storage that is
 * metered, and — because an image is priced by tile — credits.
 */
const LONG_EDGE = 1_600;

/**
 * ⚠️ 0.82 IS WHERE JPEG STOPS BEING WORTH IT. Below about 0.75 the artefacts
 * start eating small printed type, which on a LABEL is the whole content of the
 * photograph; above about 0.9 the file doubles for a difference nothing here can
 * see. It is a decision rather than a default, which is why it is named.
 */
const QUALITY = 0.82;

/**
 * A PHOTOGRAPH, SMALL ENOUGH TO SEND.
 *
 * ⚠️ THIS IS THE FUNCTION TWO COMMENTS IN THE INVENTORY APP ALREADY CLAIMED
 * EXISTED. `product.see` refuses a batch over eight megabytes and says "the sheet
 * downscales before it asks" — and nothing downscaled anything, so the only way
 * to stay under the ceiling was a picker cap so tight it refused every photograph
 * a modern phone produces. The cap was the symptom; this is the thing that was
 * missing.
 *
 * ⚠️ ORIENTATION COMES FROM THE FILE, AND LEAVING IT OUT IS THE SUBTLE ONE. A
 * phone writes the sensor's pixels and an EXIF rotation beside them; a canvas
 * draws the pixels and ignores the tag unless asked. So a portrait photograph
 * arrives on its side — which a person notices and shrugs at, and which a model
 * reading a LABEL is simply worse at, silently, with no way to tell from the
 * answer that the picture was sideways.
 *
 * ⚠️ AND A PICTURE ALREADY SMALL ENOUGH IS LEFT ALONE. Re-encoding it would spend
 * a generation of JPEG loss on a file that needed nothing, and would turn a
 * lossless screenshot of a spec sheet into a blurry one.
 *
 * ⚠️ EVERY FAILURE FALLS BACK TO THE ORIGINAL BYTES. A browser that cannot decode
 * HEIC, a canvas the platform refuses, an image too large to rasterise: none of
 * those is a reason to lose the photograph somebody just took. The size ceiling
 * on the picker is what catches the ones that come through whole, which is a
 * refusal with a sentence rather than a silent loss.
 */
export async function shrunk(
  bytes: ArrayBuffer, type: string,
  of: { readonly edge?: number; readonly quality?: number } = {},
): Promise<string> {
  const edge = of.edge ?? LONG_EDGE;
  const quality = of.quality ?? QUALITY;
  if (!type.startsWith("image/")) return asDataUrl(bytes, type);

  try {
    const made = await createImageBitmap(new Blob([bytes], { type }), {
      /* ⚠️ See the header — without this a portrait photograph is landscape. */
      imageOrientation: "from-image",
    });
    const { width, height } = made;
    if (!width || !height) { made.close(); return asDataUrl(bytes, type); }

    const over = Math.max(width, height) / edge;
    if (over <= 1) { made.close(); return asDataUrl(bytes, type); }

    const w = Math.round(width / over);
    const h = Math.round(height / over);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const at = canvas.getContext("2d");
    if (!at) { made.close(); return asDataUrl(bytes, type); }

    /* ⚠️ WHITE UNDER IT, BECAUSE JPEG HAS NO ALPHA. A transparent PNG drawn onto
       an untouched canvas and encoded as JPEG comes out on BLACK — which is a
       photograph of a product turned into a photograph of a product at night. */
    at.fillStyle = "#ffffff";
    at.fillRect(0, 0, w, h);
    /* ⚠️ THE BROWSER'S OWN RESAMPLER, ASKED FOR ITS BEST. Left at the default a
       four-times reduction aliases printed type into noise, which is the one
       thing on the label that has to survive. */
    at.imageSmoothingEnabled = true;
    at.imageSmoothingQuality = "high";
    at.drawImage(made, 0, 0, w, h);
    made.close();

    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    /* ⚠️ See the header — a photograph is never lost to a decoder. */
    return asDataUrl(bytes, type);
  }
}

/* --------------------------------------------------------------- attached --- */

/**
 * A FILE THAT IS ALREADY THERE, AS A ROW.
 *
 * ⚠️ `PickFile` IS THE DOOR AND THIS IS WHAT COMES THROUGH IT. Every product
 * that accepts a file then has to list what it has — an attachment, an import, a
 * photograph, a signed document — and each screen built the row itself: a name,
 * a size somebody formatted by hand, and a remove control that was sometimes a
 * cross and sometimes the word "Remove".
 *
 * ⚠️ THE SIZE USES `Size`, WHICH IS THE POINT. `Math.round(bytes / 1024) + "KB"`
 * is the line every one of those screens wrote, and it says `0KB` for anything
 * under half a kilobyte and `1536KB` for a megabyte and a half. The reader here
 * already knows the person's own conventions.
 *
 * ⚠️ AND THE ACTION IS A NODE. Removing is the common case and it is not the
 * only one — a file can be replaced, downloaded, or opened — and a
 * `{ label, onDo }` pair would make the destructive one, which is a `Confirm`,
 * the one shape the slot could not hold.
 */
export function FileRow({ name, bytes, kind, does }: {
  readonly name: string;
  readonly bytes?: number;
  /** ⚠️ What it is in a word — "PDF", "Picture". Absent where the name says it. */
  readonly kind?: string;
  readonly does?: React.ReactNode;
}) {
  return (
    <div data-row className={`flex items-center ${ROW.gap} ${ROW.pad} ${ROW.tap}`}>
      <span
        aria-hidden="true"
        className="shrink-0 text-muted"
        style={{ ["--icon" as string]: `${ICON.row}px` }}
      >
        <Paperclip />
      </span>
      <span className={`flex min-w-0 grow flex-col ${SPACE.hair}`}>
        {/* ⚠️ THE NAME TRUNCATES AND THE FACTS DO NOT. A file name is the one
            string here that is arbitrarily long, and wrapping it pushes the
            control it belongs to onto a second line. */}
        <span className={`${TYPE.label} truncate`}>{name}</span>
        {kind || bytes !== undefined ? (
          <span className={`${TYPE.note} flex items-center ${SPACE.tight}`}>
            {kind ? <span>{kind}</span> : null}
            {bytes === undefined ? null : <Size bytes={bytes} />}
          </span>
        ) : null}
      </span>
      {does ? <span className="shrink-0">{does}</span> : null}
    </div>
  );
}

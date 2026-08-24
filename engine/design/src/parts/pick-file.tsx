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
import { DROP_PAD, SPACE } from "../tokens/metrics.js";
import { TYPE } from "../tokens/type.js";
import { MOTION } from "../tokens/motion.js";
import { Trouble } from "./state.js";

export interface PickFileProps {
  /**
   * ⚠️ MIME TYPES, AND THE LIST IS ALSO THE COPY. Written once, the control can
   * say what it takes without a second sentence somebody has to keep in step.
   */
  readonly accept: readonly string[];
  /** The ceiling, in bytes. Reported in kB, because that is what a picker shows. */
  readonly most: number;
  /** What this file IS, in the words on the screen: "a logo", "a photo". */
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

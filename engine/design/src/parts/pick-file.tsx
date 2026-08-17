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
import { DROP_PAD, SPACE } from "../tokens/metrics.js";
import { TYPE } from "../tokens/type.js";
import { MOTION } from "../tokens/motion.js";

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
  /** ⚠️ Bytes, already read. A caller should never be handed a `File`: two
      screens would then each write their own reader, and one would forget the
      error event. */
  readonly onPick: (bytes: ArrayBuffer, file: File) => void;
  /** Offered only when there is something to remove. */
  readonly onClear?: () => void;
}

/** ⚠️ The refusals this control can answer without asking the server. */
const refuse = (file: File, accept: readonly string[], most: number): string | null => {
  if (accept.length && !accept.includes(file.type)) {
    return `that is ${file.type || "an unknown kind of file"} — it has to be ${saying(accept)}`;
  }
  if (file.size > most) {
    return `that is ${Math.round(file.size / 1024)} kB — the most is ${Math.round(most / 1024)} kB`;
  }
  if (!file.size) return "that file is empty";
  return null;
};

/** `image/png` → `a PNG`; two of them → `a PNG or a JPEG`. */
const saying = (accept: readonly string[]): string => {
  const names = accept.map((t) => `a ${(t.split("/")[1] ?? t).toUpperCase()}`);
  return names.length < 2 ? names[0] ?? "another kind of file"
    : `${names.slice(0, -1).join(", ")} or ${names.at(-1)}`;
};

export function PickFile({
  accept, most, says, under, label, busy, onPick, onClear,
}: PickFileProps) {
  const input = React.useRef<HTMLInputElement>(null);
  const [over, setOver] = React.useState(false);
  const [why, setWhy] = React.useState<string | null>(null);

  const take = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    const bad = refuse(file, accept, most);
    setWhy(bad);
    if (bad) return;
    onPick(await file.arrayBuffer(), file);
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
          void take(e.dataTransfer.files?.[0]);
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
          className="sr-only"
          /* ⚠️ RESET AFTER EVERY PICK. Choosing the same file twice fires no
             `change` event unless the value is cleared — so somebody who fixed
             their file and picked it again would watch nothing happen. */
          onChange={(e) => { void take(e.target.files?.[0]); e.target.value = ""; }}
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
          sentence has to be beside the place they will try again. */}
      {why ? <span className={`${TYPE.note} text-danger`}>{why}</span> : null}
    </div>
  );
}

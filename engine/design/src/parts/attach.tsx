/**
 * FILES A PERSON IS PUTTING SOMEWHERE — the queue, its states, and one target.
 *
 * ⚠️ `PickFile` IS A DOOR AND THIS IS THE ROOM BEHIND IT. That control answers
 * one question — may this file in — and it answers it well: the type, the size
 * and the empty case are decided locally and refused in the catalogue's own
 * words. What it has never had is anything to say about what happens NEXT, and
 * "next" is where every upload a person actually notices goes wrong. Its whole
 * account of an upload in flight is `busy?: boolean`, which draws the word
 * "Uploading…" on a button and nothing else: no bar, no per-file outcome, no way
 * back from a failure but to find the file again.
 *
 * ⚠️ SO EVERY SCREEN THAT NEEDED MORE WROTE THE REST ITSELF, and the halves
 * never matched. One drew a spinner and no percentage; one showed a bar that hit
 * 100% and sat there through a ten-second server round trip; one reported a
 * failed upload by removing the row, which reads as "it worked" and is the worst
 * of the three. None offered a retry, because a retry needs the bytes and the
 * bytes were gone.
 *
 * ⚠️ THE QUEUE IS THE CALLER'S AND THE READING IS OURS, WHICH IS THE WHOLE
 * BOUNDARY. Decoding, rotating, downscaling and refusing are pure browser work
 * with no network in them, so they belong in the control and are done once.
 * SENDING is not: it needs a door, a session and an operation, and a design
 * package that fetched anything could only ever be used one way. So this hands
 * back files that are read and ready, and the caller hands back where each one
 * has got to.
 *
 * ⚠️ AND `settling` IS A STATE RATHER THAN AN OVERSIGHT. Between the last byte
 * leaving and the server answering there is a gap of seconds on a real
 * connection, and a determinate bar has nothing left to say in it. Sat at 100%
 * that gap reads as a hang; named, it reads as what it is. It is the one state
 * every hand-written uploader in this repository's history has left out.
 */

import * as React from "react";
import { Button } from "@heroui/react";
import type { Problem } from "@engine/kernel";
import { PLATFORM_PROBLEMS, problem } from "@engine/kernel";
import { PickFile, asDataUrl, shrunk } from "./pick-file.js";
import { Stack } from "./arrange.js";
import { Nothing, Trouble } from "./state.js";
import { Size } from "./said.js";
import { glyphOf } from "../frame/shell.js";
import { TYPE } from "../tokens/type.js";
import { ICON, ROW, SPACE } from "../tokens/metrics.js";
import { DURATION, EASE } from "../tokens/motion.js";

/* ------------------------------------------------------------- what it is --- */

/**
 * WHERE ONE FILE HAS GOT TO.
 *
 * ⚠️ FIVE, AND EVERY ONE OF THEM IS A DIFFERENT SCREEN. `held` is read and
 * waiting — a flow's unsaved answer, or a queue nobody has pressed Send on;
 * `sending` has a bar; `settling` has one that has nothing left to say;
 * `done` is a fact; `refused` is a sentence and a way to try again. Collapsed to
 * a boolean, three of the five are the same picture.
 */
export type Progress = "held" | "sending" | "settling" | "done" | "refused";

/** ⚠️ One file in the queue, as the caller holds it. */
export interface Attached {
  /**
   * ⚠️ NOT THE NAME. Two photographs off a phone are both `IMG_0042.jpg`, and
   * keying a list on the name makes the second one replace the first in React's
   * reconciliation — one row, two files, and no way to tell from the screen.
   */
  readonly id: string;
  readonly name: string;
  readonly bytes: number;
  readonly type: string;
  /**
   * ⚠️ WHAT IT LOOKS LIKE, WHERE IT LOOKS LIKE ANYTHING. A picture is its own
   * best label — a row reading `IMG_0042.jpg` tells somebody choosing between
   * six of them nothing at all. Absent for a PDF, where the name IS the label.
   */
  readonly preview?: string;
  /**
   * ⚠️ THE BYTES, KEPT, WHICH IS WHAT MAKES A RETRY POSSIBLE. Handed straight to
   * a fetch and dropped, a failed upload can only be retried by finding the file
   * again — so every hand-written uploader's "try again" was a picker.
   */
  readonly of: ArrayBuffer;
  readonly at: Progress;
  /** ⚠️ 0–1 while sending. Absent is indeterminate, which is honest for a small file. */
  readonly along?: number;
  readonly why?: Problem;
}

/* --------------------------------------------------------------- the mark --- */

/**
 * HOW FAR SOMETHING BEING DONE TO SOMEBODY HAS GOT.
 *
 * ⚠️ NOT THE FLOW'S OWN BAR, AND THE DIFFERENCE IS WHO IT IS ABOUT — see
 * `Along` in `story.tsx`. That one is where a person is in something THEY are
 * doing: presentational, silent, no percentage, because the heading under it is
 * what a screen reader should read. This is work being done TO them, so it
 * announces itself, carries its value, and says what it is for.
 *
 * ⚠️ AND AN ABSENT VALUE IS A REAL ANSWER RATHER THAN ZERO. A small file
 * finishes inside one progress event, so a bar for it is a bar that goes from
 * nothing to everything — which is a worse account of the truth than a stripe
 * that simply says work is happening.
 */
export function Sending({ along, says }: {
  readonly along?: number;
  readonly says: string;
}) {
  const through = along === undefined
    ? undefined
    : Math.max(0, Math.min(1, along));
  return (
    <div
      role="progressbar"
      aria-label={says}
      {...(through === undefined ? {} : {
        "aria-valuenow": Math.round(through * 100),
        "aria-valuemin": 0,
        "aria-valuemax": 100,
      })}
      className="h-1 w-full overflow-hidden rounded-full bg-[var(--line)]"
    >
      <div
        className="h-full rounded-full bg-[var(--brand)]"
        style={{
          /* ⚠️ INDETERMINATE IS A THIRD OF THE RAIL RATHER THAN AN ANIMATION.
             Ambient motion is earned here and a stripe sliding forever is the
             least earned there is; a partial fill says "started, length
             unknown", which is exactly what is true. */
          width: through === undefined ? "33%" : `${(through * 100).toFixed(1)}%`,
          transition: `width ${DURATION.moderate} ${EASE.travel}`,
        }}
      />
    </div>
  );
}

/* ---------------------------------------------------------------- the row --- */

/** ⚠️ What each state SAYS, in one place, so two rows cannot disagree. */
const SAYS: Readonly<Record<Progress, string>> = {
  held: "Ready to send",
  sending: "Sending",
  settling: "Finishing",
  done: "Sent",
  refused: "Did not send",
};

/**
 * ONE FILE, WITH ITS PREVIEW, ITS FACTS AND WHATEVER IT NEEDS NEXT.
 *
 * ⚠️ THE CONTROL AT THE END IS DECIDED BY THE STATE, and that is the row's whole
 * job. A file that failed needs a retry; one in flight needs a stop; one that is
 * done needs a remove and nothing else. Written as one always-present "Remove",
 * the two states that are not about removing are the two where somebody presses
 * it and loses their place.
 */
export function AttachedRow({ file, onRemove, onRetry, onStop }: {
  readonly file: Attached;
  readonly onRemove?: (id: string) => void;
  readonly onRetry?: (id: string) => void;
  readonly onStop?: (id: string) => void;
}) {
  const moving = file.at === "sending" || file.at === "settling";
  return (
    <li data-row className={`flex flex-col ${SPACE.hair}`}>
      <div className={`flex items-center ${ROW.gap} ${ROW.pad} ${ROW.tap}`}>
        {file.preview
          ? (
            <img
              src={file.preview}
              alt=""
              /* ⚠️ `cover` AT A FIXED BOX, so a column of rows is a column. A
                 preview that keeps its aspect ratio makes every row a different
                 height and the names stop being a list. */
              className="size-10 shrink-0 rounded-lg object-cover bg-[var(--tier-card)]"
            />
          )
          : (
            <span
              aria-hidden="true"
              className="shrink-0 text-muted"
              style={{ ["--icon" as string]: `${ICON.row}px` }}
            >
              {glyphOf(file.at === "refused" ? "alert" : "file")}
            </span>
          )}

        <span className={`flex min-w-0 grow flex-col ${SPACE.hair}`}>
          {/* ⚠️ THE NAME TRUNCATES AND THE FACTS DO NOT — see `FileRow`. */}
          <span className={`${TYPE.label} truncate`}>{file.name}</span>
          <span className={`${TYPE.note} flex items-center ${SPACE.tight}`}>
            <span>{SAYS[file.at]}</span>
            <Size bytes={file.bytes} />
          </span>
        </span>

        <span className="shrink-0">
          {file.at === "refused" && onRetry
            ? (
              <Button size="sm" variant="secondary" onPress={() => { onRetry(file.id); }}>
                Try again
              </Button>
            )
            : moving && onStop
              ? (
                <Button size="sm" variant="ghost" onPress={() => { onStop(file.id); }}>
                  Stop
                </Button>
              )
              : onRemove
                ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    isIconOnly
                    aria-label={`Remove ${file.name}`}
                    onPress={() => { onRemove(file.id); }}
                  >
                    {glyphOf("remove")}
                  </Button>
                )
                : null}
        </span>
      </div>

      {/* ⚠️ THE BAR IS UNDER THE ROW RATHER THAN INSIDE IT, so it spans the whole
          width and a row does not change height when one starts. */}
      {moving ? <Sending along={file.along} says={`Sending ${file.name}`} /> : null}

      {/* ⚠️ AND A REFUSAL IS THE PLATFORM'S SENTENCE, under the row it is about.
          A control drawing its own is how the same failure comes to read
          differently depending on which screen somebody is on. */}
      {file.at === "refused" && file.why ? <Trouble problem={file.why} /> : null}
    </li>
  );
}

/* --------------------------------------------------------------- the tile --- */

/**
 * ⚠️ THE SAME FILE AS A SQUARE, FOR WHEN WHAT MATTERS IS THE PICTURE. Six
 * photographs of a box compared as rows is six file names; as tiles it is the
 * thing somebody is actually deciding about. The state still has to reach the
 * screen, so it does — as a bar across the foot of the tile and a tone on the
 * frame, rather than as a sentence there is no room for.
 */
function AttachedTile({ file, onRemove, onRetry }: {
  readonly file: Attached;
  readonly onRemove?: (id: string) => void;
  readonly onRetry?: (id: string) => void;
}) {
  const moving = file.at === "sending" || file.at === "settling";
  return (
    <li className="relative shrink-0">
      {file.preview
        ? (
          <img
            src={file.preview}
            alt={file.name}
            className="size-20 rounded-xl object-cover bg-[var(--tier-card)]"
          />
        )
        : (
          <span
            data-chrome="true"
            className="flex size-20 items-center justify-center rounded-xl text-muted"
            style={{ ["--icon" as string]: `${ICON.row}px` }}
          >
            {glyphOf("file")}
          </span>
        )}

      {/* ⚠️ THE WRAPPER IS POSITIONED AND THE BUTTON IS NOT (D7). Where a control
          sits is the surrounding markup's business; a control given layout
          classes at a call site is a control restyled there. */}
      <span className="absolute end-1 top-1">
        {file.at === "refused" && onRetry
          ? (
            <Button
              variant="tertiary" size="sm" isIconOnly
              aria-label={`Try ${file.name} again`}
              onPress={() => { onRetry(file.id); }}
            >
              {glyphOf("refresh")}
            </Button>
          )
          : onRemove
            ? (
              <Button
                variant="tertiary" size="sm" isIconOnly
                aria-label={`Remove ${file.name}`}
                onPress={() => { onRemove(file.id); }}
              >
                {glyphOf("remove")}
              </Button>
            )
            : null}
      </span>

      {moving
        ? (
          <span className="absolute inset-x-1 bottom-1">
            <Sending along={file.along} says={`Sending ${file.name}`} />
          </span>
        )
        : null}
    </li>
  );
}

/* ------------------------------------------------------------ the ceiling --- */

/**
 * WHAT IS LEFT OF THE ALLOWANCE BETWEEN THEM.
 *
 * ⚠️ PURE, AND SEPARATE, BECAUSE AN AGGREGATE CEILING IS THE ONE `PickFile`
 * CANNOT ENFORCE. It judges one file against `most` and knows nothing about the
 * five already held — so six four-megabyte photographs each pass a
 * four-megabyte check and arrive as twenty-four megabytes at a door that refuses
 * eight. The per-file limit was tightened to compensate, which refused every
 * photograph a modern phone takes; the limit was never the problem.
 *
 * ⚠️ AND IT REFUSES THE FILE THAT WOULD BREACH IT RATHER THAN THE WHOLE PICK.
 * Four of six fitting is four files landed and one sentence about the rest,
 * which is strictly better than nothing landed and one sentence about all six.
 */
export const roomFor = (
  held: readonly { readonly bytes: number }[], adding: number, together: number,
): boolean => held.reduce((n, one) => n + one.bytes, 0) + adding <= together;

/* -------------------------------------------------------------- the whole --- */

export interface AttachProps {
  readonly held: readonly Attached[];
  /**
   * ⚠️ READ, SHRUNK AND ID'D — the caller receives files it can send, not a
   * `FileList` it has to process. Every screen that was handed raw files wrote
   * the same reader, and one of them forgot the error event.
   */
  readonly onAdd: (added: readonly Attached[]) => void;
  readonly onRemove?: (id: string) => void;
  readonly onRetry?: (id: string) => void;
  readonly onStop?: (id: string) => void;
  readonly accept: readonly string[];
  /** Per file, in bytes. */
  readonly most: number;
  /**
   * ⚠️ BETWEEN THEM, IN BYTES — see `roomFor`. Absent means only the per-file
   * ceiling applies, which is right for a library and wrong for anything with an
   * operation behind it.
   */
  readonly mostTogether?: number;
  /** How many files at all. */
  readonly mostFiles?: number;
  readonly says: string;
  readonly under?: string;
  readonly label?: string;
  /**
   * ROWS OR TILES, AND IT IS ABOUT WHAT SOMEBODY IS DECIDING.
   *
   * ⚠️ ROWS WHERE THE NAME IS THE POINT (an import, an attachment, a signed
   * document) and TILES WHERE THE PICTURE IS (photographs of a thing). A tile
   * grid of PDFs is three times the height for an icon repeated; a row list of
   * six photographs is six file names nobody can tell apart.
   */
  readonly shows?: "rows" | "tiles";
  /**
   * SHRINK PICTURES ON THE WAY IN.
   *
   * ⚠️ ON BY DEFAULT, AND THAT IS THE FIX FOR A CLAIM TWO COMMENTS ALREADY MADE.
   * `shrunk` handles the EXIF rotation a canvas ignores and the four-thousand
   * pixel edge nothing downstream can use — and it was exported, tested, and
   * called by NOTHING, while a manifest said "the screen shrinks each one before
   * it asks". A portrait photograph arrived sideways, at full size, and a model
   * reading a label was silently worse at it.
   */
  readonly shrink?: boolean;
  /**
   * ⚠️ A SCREENSHOT IS PASTED, NOT PICKED. It is how most attachments now
   * arrive, it costs one listener, and without it the only route is Save As
   * followed by a trip through a picker to find what was just saved.
   */
  readonly paste?: boolean;
  /** ⚠️ Something is in flight, so the picker holds rather than going quiet. */
  readonly busy?: boolean;
}

/**
 * ⚠️ AN ID THAT IS UNIQUE WITHOUT A CLOCK OR A RANDOM. Two files picked in the
 * same millisecond off the same phone share a name, a size and a timestamp; a
 * counter cannot collide, and it does not make this component's output depend on
 * anything a test cannot control.
 */
let counted = 0;
const nextId = (): string => `f${(counted += 1)}`;

export function Attach({
  held, onAdd, onRemove, onRetry, onStop,
  accept, most, mostTogether, mostFiles, says, under, label,
  shows = "rows", shrink = true, paste, busy,
}: AttachProps) {
  const [why, setWhy] = React.useState<Problem | null>(null);
  const room = mostFiles === undefined
    ? Number.MAX_SAFE_INTEGER
    : Math.max(0, mostFiles - held.length);

  /*
    ⚠️ THE LATEST LIST, IN A REF, BECAUSE ONE PRESS FIRES `onPick` PER FILE.
    Choosing six adjacent photographs is six calls before React re-renders once,
    so an aggregate ceiling read off the render's `held` is computed against an
    empty list six times and every one of the six passes. This is the same fault
    the strip had about the list itself, one level up: it looks perfect with one
    file, which is how anybody tries it.
  */
  const latest = React.useRef<readonly Attached[]>(held);
  latest.current = held;

  const take = async (bytes: ArrayBuffer, file: File): Promise<void> => {
    if (mostTogether !== undefined && !roomFor(latest.current, file.size, mostTogether)) {
      setWhy(problem(PLATFORM_PROBLEMS, "platform.too_large", {
        size: Math.round(file.size / 1024),
        most: Math.round(mostTogether / 1024),
      }));
      return;
    }
    const picture = file.type.startsWith("image/");
    const one: Attached = {
      id: nextId(),
      name: file.name,
      bytes: file.size,
      type: file.type,
      of: bytes,
      at: "held",
      ...(picture
        ? { preview: shrink ? await shrunk(bytes, file.type) : asDataUrl(bytes, file.type) }
        : {}),
    };
    /* ⚠️ APPENDED TO THE REF AS WELL AS ANNOUNCED, for the reason above: the
       next file of the same press is judged against a list that includes this
       one. */
    latest.current = [...latest.current, one];
    onAdd([one]);
  };

  /*
    ⚠️ PASTE IS ON THE DOCUMENT, NOT ON THE TARGET, and that is not laziness. A
    paste goes to whatever has focus, and nobody focuses a drop zone before
    pressing Ctrl+V — so a listener on the control itself fires for exactly the
    people who did not need it. It is opt-in per caller because a screen with two
    of these would otherwise put one screenshot in both.
  */
  React.useEffect(() => {
    if (!paste || !room) return undefined;
    const on = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (!files.length) return;
      e.preventDefault();
      for (const file of files.slice(0, room)) {
        void file.arrayBuffer().then((bytes) => take(bytes, file));
      }
    };
    document.addEventListener("paste", on);
    return () => { document.removeEventListener("paste", on); };
  });

  const List = shows === "tiles" ? "ul" : "ul";
  return (
    <Stack space="tight">
      {/*
        ⚠️ THE QUEUE COMES FIRST AND ONLY WHEN THERE IS ONE. Above the picker it
        is what somebody has; above nothing it is an empty rail that reads as a
        component that failed to load — see `Nothing`.
      */}
      {held.length
        ? (
          <List
            className={shows === "tiles"
              ? `flex ${SPACE.tight} overflow-x-auto`
              : `flex flex-col ${SPACE.hair}`}
            aria-label={`${held.length} file${held.length === 1 ? "" : "s"}`}
          >
            {held.map((file) => (shows === "tiles"
              ? (
                <AttachedTile
                  key={file.id}
                  file={file}
                  {...(onRemove ? { onRemove } : {})}
                  {...(onRetry ? { onRetry } : {})}
                />
              )
              : (
                <AttachedRow
                  key={file.id}
                  file={file}
                  {...(onRemove ? { onRemove } : {})}
                  {...(onRetry ? { onRetry } : {})}
                  {...(onStop ? { onStop } : {})}
                />
              )))}
          </List>
        )
        : (
          <Nothing
            icon={glyphOf(accept.some((a) => a.startsWith("image/")) ? "scan" : "file")}
            says="Nothing attached yet"
            {...(under ? { under } : {})}
          />
        )}

      {room
        ? (
          <PickFile
            accept={accept}
            most={most}
            says={says}
            {...(label ? { label } : {})}
            atOnce={Math.min(room, 12)}
            {...(busy ? { busy } : {})}
            onPick={(bytes, file) => { void take(bytes, file); }}
          />
        )
        /* ⚠️ THE CEILING IS SAID, NOT ENFORCED IN SILENCE. A picker that simply
           disappears is a control somebody looks for and cannot find. */
        : <p className={TYPE.note}>That is {mostFiles}, which is the limit</p>}

      {/* ⚠️ THE AGGREGATE REFUSAL IS THIS CONTROL'S, because `PickFile` judges one
          file and cannot see the five already held. Its own three refusals still
          draw inside it, through the same `Trouble`. */}
      {why ? <Trouble problem={why} /> : null}
    </Stack>
  );
}

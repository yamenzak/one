/**
 * GETTING STARTED, AND BEING TOLD YOU GOT SOMEWHERE.
 *
 * ⚠️ THE CHECKLIST IS DERIVED FROM WHAT HAPPENED. A step this screen could tick
 * itself is a step that stays undone when the same thing is done from the API or
 * from the second screen that also does it — and the person is then told to
 * finish what they finished last week. It renders `remaining`; it never writes.
 *
 * ⚠️ AND A STEP SOMEBODY IS NOT ALLOWED TO TAKE IS NOT COUNTED AGAINST THEM. A
 * checklist permanently at 3/5 because two items need a permission they do not
 * hold is a checklist they learn to ignore.
 *
 * ⚠️ HALF THE LIST IS THE WORKSPACE'S AND HALF IS THE PERSON'S, so `raised`
 * carries both and each step is looked up on the axis it declares. One merged
 * list would open already complete for anybody invited into a workspace that has
 * been running — a welcome that congratulates somebody for a year of work they
 * were not there for.
 */

import type { GuideBook, HelpBook, MilestoneBook, Raised } from "@engine/kernel";
import { progressOf, reached, remaining } from "@engine/kernel";
import { Card, Chip, ProgressBar } from "@heroui/react";
import { colorFor } from "../tokens/theme.js";
import { NUDGE, ROW, SPACE } from "../tokens/metrics.js";
import { TYPE } from "../tokens/type.js";
import { Group, NavRow, NoteRow } from "../parts/surfaces.js";

export interface GuideProps {
  readonly book: GuideBook;
  /**
   * What the workspace has ever done, and what this person has.
   *
   * ⚠️ `null` IS "NOT KNOWN YET", AND IT IS NOT THE SAME AS "NOTHING DONE". Both
   * arrive as empty lists from a screen that has not had its answer back, and a
   * checklist cannot tell them apart — so it drew every step untick ed under a
   * confident "0 of 3 done" for the length of a round trip, on a workspace that
   * might be two thirds finished. A count is a claim; this is the one shape that
   * lets the caller say it has not checked.
   */
  readonly raised: Raised | null;
  readonly held: ReadonlySet<string>;
  readonly onGo: (route: string) => void;
}

export function Guide({ book, raised, held, onGo }: GuideProps) {
  /*
    ⚠️ NOTHING UNTIL IT IS KNOWN, AND DELIBERATELY NOT BONES. A placeholder is
    right where the SHAPE is the component's and only the content is coming; here
    the row count is a function of the answer — a step that is done disappears —
    so a skeleton drawn before it lands is a block of the wrong length, which is
    the jump a skeleton exists to prevent arriving by way of the fix
    (`bones.tsx`). What stands in for a block whose size is data is `recall`.
  */
  if (!raised) return null;
  const left = remaining(book, raised, held);
  const done = progressOf(book, raised, held);

  /* ⚠️ Finished is gone, not a page of ticks. A checklist that stays after it is
     complete is a permanent reminder of something already handled. */
  if (!left.length) return null;

  return (
    /*
      ⚠️ UNLABELLED, BECAUSE THE SCREEN AROUND IT ALREADY SAID WHAT THIS IS. It
      carried "Getting started" of its own, under a section heading, on a screen
      whose title was also "Getting started" — three headings for one card. A
      shared component naming itself in English is the same fault twice over:
      product vocabulary in a package that has none, and a word the caller is
      better placed to choose.
    */
    <Group>
      <div className={`flex flex-col ${ROW.pad}`}>
        <span className={`flex items-baseline justify-between ${ROW.gap}`}>
          <span className={TYPE.label}>{done.done.length} of {done.total} done</span>
        </span>
        <span className={NUDGE.under}>
          <ProgressBar value={done.done.length} maxValue={Math.max(1, done.total)}>
            <ProgressBar.Track><ProgressBar.Fill /></ProgressBar.Track>
          </ProgressBar>
        </span>
      </div>
      {/* ⚠️ THE WHOLE ROW GOES, NOT A BUTTON ON THE END OF IT. A step was a
          heading, a sentence and a 32px "Do it" — three quarters of the row
          inert, and the one part that was not sat under the floor a finger
          needs. A step IS a destination, so it is the row every destination in
          this product wears. */}
      {left.map((step) => (
        <NavRow key={step.id} label={step.label} under={step.why}
          onOpen={() => onGo(step.link)} />
      ))}
    </Group>
  );
}

/* ------------------------------------------------------------- milestones --- */

export interface MilestonesProps {
  readonly book: MilestoneBook;
  readonly counts: Readonly<Record<string, number>>;
  /** ⚠️ What has already been said. Recognition repeated is not recognition. */
  readonly already: readonly string[];
}

export function Milestones({ book, counts, already }: MilestonesProps) {
  const now = reached(book, counts, already);
  if (!now.length) return null;
  return (
    /*
      ⚠️ `items-start`, OR EVERY CHIP IS THE WIDTH OF THE PAGE. A chip in a
      column stretches to the cross axis, and a full-width lozenge holding four
      words does not read as recognition — it reads as a banner.
    */
    <div className={`flex flex-col items-start ${SPACE.tight}`}>
      {now.map((m) => (
        /*
          ⚠️ THE LABEL IS THE RECOGNITION AND `said` IS THE EXPLANATION, and
          only the second was drawn. "Everybody in the workspace can see it now"
          on its own is a sentence with no subject — it never said WHAT had been
          reached, which is the only thing a milestone is for. Both are declared;
          both were always meant to be here.
        */
        <div key={m.id} className={`flex flex-col ${SPACE.hair}`}>
          <Chip color={colorFor(m.tone)} variant="soft">
            <Chip.Label>{m.label}</Chip.Label>
          </Chip>
          <span className={TYPE.note}>{m.said}</span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------- help --- */

export interface HelpProps {
  readonly book: HelpBook;
  /** The screen somebody is on. Help follows them rather than being a place. */
  readonly screen: string;
}

/**
 * ⚠️ HELP IS BESIDE THE THING IT EXPLAINS. A help centre somebody has to go to
 * is a help centre they leave the task to reach, and then read the wrong page.
 */
export function Help({ book, screen }: HelpProps) {
  const mine = Object.values(book).filter((h) => h.screen === screen);
  if (!mine.length) return null;
  return (
    <div className={`flex flex-col ${SPACE.snug}`}>
      {mine.map((h) => (
        <Group key={h.id} label={h.title}>
          <NoteRow>{h.body}</NoteRow>
        </Group>
      ))}
    </div>
  );
}

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
 */

import type { GuideBook, HelpBook, MilestoneBook } from "@engine/kernel";
import { progressOf, reached, remaining } from "@engine/kernel";
import { Button, Card, Chip, ProgressBar } from "@heroui/react";
import { colorFor } from "../tokens/theme.js";
import { SPACE } from "../tokens/metrics.js";

export interface GuideProps {
  readonly book: GuideBook;
  readonly events: readonly string[];
  readonly held: ReadonlySet<string>;
  readonly onGo: (route: string) => void;
}

export function Guide({ book, events, held, onGo }: GuideProps) {
  const left = remaining(book, events, held);
  const done = progressOf(book, events, held);

  /* ⚠️ Finished is gone, not a page of ticks. A checklist that stays after it is
     complete is a permanent reminder of something already handled. */
  if (!left.length) return null;

  return (
    <Card>
      <Card.Header>
        <Card.Title>Getting started</Card.Title>
        <Card.Description>{done.done.length} of {done.total} done</Card.Description>
      </Card.Header>
      <Card.Content>
        <div className={`flex flex-col ${SPACE.snug}`}>
          <ProgressBar value={done.done.length} maxValue={Math.max(1, done.total)}>
            <ProgressBar.Track><ProgressBar.Fill /></ProgressBar.Track>
          </ProgressBar>
          {left.map((step) => (
            <div key={step.id} className={`flex items-center justify-between ${SPACE.snug}`}>
              <div className="flex flex-col">
                <strong>{step.label}</strong>
                <small>{step.why}</small>
              </div>
              <Button variant="secondary" onPress={() => onGo(step.link)}>Do it</Button>
            </div>
          ))}
        </div>
      </Card.Content>
    </Card>
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
    <div className={`flex flex-col ${SPACE.tight}`}>
      {now.map((m) => (
        <Chip key={m.id} color={colorFor(m.tone)} variant="soft">
          <Chip.Label>{m.said}</Chip.Label>
        </Chip>
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
        <Card key={h.id}>
          <Card.Header><Card.Title>{h.title}</Card.Title></Card.Header>
          <Card.Content>{h.body}</Card.Content>
        </Card>
      ))}
    </div>
  );
}

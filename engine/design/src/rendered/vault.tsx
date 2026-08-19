/**
 * WHAT WE HOLD ABOUT SOMEBODY, SHOWN TO THEM.
 *
 * ⚠️ THIS IS THE HALF THAT MAKES A VAULT WORTH HAVING. Not that access is
 * controlled — every database claims that — but that the person it is about can
 * see what is held, why, who looked, and can take it away.
 *
 * ⚠️ CONSENT THAT CANNOT BE REFUSED IS NOT CONSENT. A purpose the product
 * depends on says so and says what is lost, rather than being presented as a
 * choice that is not one.
 *
 * ⚠️ AND ERASURE IS SAID PLAINLY, INCLUDING WHAT IT CANNOT UNDO. "Deleted" that
 * quietly means "hidden" is the claim somebody may one day have to stand behind.
 */

import type { Disclosure } from "@engine/kernel";
import { Button, Chip, Separator, Switch, Label } from "@heroui/react";
import { SPACE } from "../tokens/metrics.js";
import { Group } from "../parts/surfaces.js";
import { Nothing } from "../parts/state.js";
import { glyphOf } from "../frame/shell.js";
import { sayMoment, sayRefused, type Instant, type ReadRefusal } from "@engine/kernel";
import { useShown } from "../parts/said.js";

export interface ConsentProps {
  readonly shown: readonly Disclosure[];
  readonly given: Readonly<Record<string, boolean>>;
  readonly onChange: (purpose: string, given: boolean) => void;
}

export function ConsentSheet({ shown, given, onChange }: ConsentProps) {
  return (
    <div className={`flex flex-col ${SPACE.snug}`}>
      {/* ⚠️ In the subject's own terms. `under` is the sentence they decide on. */}
      {shown.map(({ purpose, fields, required }) => (
        <Group key={purpose.id} label={purpose.label} under={purpose.why}>
          <div className={`flex flex-col ${SPACE.snug}`}>
              <ul className={`flex flex-col ${SPACE.hair}`}>
                {fields.map((f) => <li key={f.id}>{f.label}</li>)}
              </ul>
              <Separator />
              <div className={`flex flex-wrap items-center ${SPACE.snug}`}>
                <Switch
                  isSelected={required || given[purpose.id] === true}
                  isDisabled={required}
                  onChange={(next) => onChange(purpose.id, next)}
                >
                  <Switch.Control><Switch.Thumb /></Switch.Control>
                  <Switch.Content><Label>Allowed</Label></Switch.Content>
                </Switch>
                {/* ⚠️ Said, not merely disabled: a switch that cannot move with
                    no reason beside it reads as broken. */}
                {required
                  ? (
                    <Chip color="accent" variant="soft">
                      <Chip.Label>The product does not work without this</Chip.Label>
                    </Chip>
                  )
                  : null}
                <Chip color="default" variant="soft">
                  <Chip.Label>
                    {purpose.retention === null
                      ? "Kept while you are here"
                      : `Kept for ${purpose.retention} days`}
                  </Chip.Label>
                </Chip>
              </div>
            </div>
        </Group>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------- who looked --- */

export interface Look {
  readonly grantee: string;
  readonly field: string;
  readonly purpose: string;
  readonly at: string;
  readonly refused: string | null;
}

export function WhoLooked({ looks }: { readonly looks: readonly Look[] }) {
  const shown = useShown();
  /* ⚠️ AN EMPTY STATE, NOT AN EMPTY CARD. This was a `Group` with a label and no
     children — a heading over a box with nothing in it, which reads as a section
     that failed to load rather than as an answer. "Nobody looked" IS the answer,
     and `Nothing` is the shape the product says one in. */
  if (!looks.length) {
    return <Nothing icon={glyphOf("check")} says="Nobody has looked" under="Every read of these facts is recorded here" />;
  }
  return (
    <div className={`flex flex-col ${SPACE.tight}`}>
      {looks.map((look, i) => (
        <Group
          key={`${look.at}-${i}`}
          label={`${look.grantee} · ${look.field}`}
          /* ⚠️ `sayMoment`, NOT A SLICE. This cut the ISO string and swapped its
             `T` for a space — UTC, in nobody's conventions, on the one screen
             whose whole subject is who saw what and when. */
          under={`${sayMoment(shown, look.at as Instant)} · ${look.purpose}`}
        >
          {/* ⚠️ Refused attempts are shown too. "Did anybody try" is the question
              actually asked after something goes wrong. */}
          {/* ⚠️ IN WORDS, NOT IN OUR NAME FOR THE BRANCH. This printed
              `no_grant` to the person whose data it is — on the one screen
              somebody opens to find out whether they were protected. */}
          {look.refused
            ? (
              <Chip color="warning" variant="soft">
                <Chip.Label>Refused — {sayRefused(look.refused as ReadRefusal)}</Chip.Label>
              </Chip>
            )
            : null}
        </Group>
      ))}
    </div>
  );
}

/* ------------------------------------------------------ export and erasure --- */

export interface MineProps {
  readonly onExport: () => void;
  readonly onErase: () => void;
  readonly erased?: boolean;
}

export function MyData({ onExport, onErase, erased }: MineProps) {
  return (
    <Group label="Your data" under="Take a copy, or have it destroyed">
      <div className={`flex flex-wrap items-center ${SPACE.snug}`}>
          <Button variant="secondary" onPress={onExport}>Download everything</Button>
          <Button variant="danger" isDisabled={erased} onPress={onErase}>Erase everything</Button>
          {/*
            ⚠️ WHAT ERASURE ACTUALLY DOES, SAID PLAINLY. The key is destroyed, so
            what is held becomes unreadable everywhere — including in backups we
            cannot reach into. That is a stronger promise than deletion and a
            narrower one, and both halves have to be said.
          */}
          <Chip color="default" variant="soft">
            <Chip.Label>
              Erasing destroys the key. Everything held about you becomes unreadable, here and in
              any backup, and it cannot be undone.
            </Chip.Label>
          </Chip>
          {erased
            ? <Chip color="success" variant="soft"><Chip.Label>Already erased</Chip.Label></Chip>
            : null}
      </div>
    </Group>
  );
}

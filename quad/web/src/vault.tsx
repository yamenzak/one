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

import type { Disclosure } from "@quad/kernel";
import { Button, Card, Chip, Separator, Switch, Label } from "@heroui/react";
import { SPACE } from "./metrics.js";

export interface ConsentProps {
  readonly shown: readonly Disclosure[];
  readonly given: Readonly<Record<string, boolean>>;
  readonly onChange: (purpose: string, given: boolean) => void;
}

export function ConsentSheet({ shown, given, onChange }: ConsentProps) {
  return (
    <div className={`flex flex-col ${SPACE.snug}`}>
      {shown.map(({ purpose, fields, required }) => (
        <Card key={purpose.id}>
          <Card.Header>
            <Card.Title>{purpose.label}</Card.Title>
            {/* ⚠️ In the subject's own terms. This is the sentence they decide on. */}
            <Card.Description>{purpose.why}</Card.Description>
          </Card.Header>
          <Card.Content>
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
          </Card.Content>
        </Card>
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
  if (!looks.length) {
    return (
      <Card>
        <Card.Header><Card.Title>Nobody has looked at any of this</Card.Title></Card.Header>
      </Card>
    );
  }
  return (
    <div className={`flex flex-col ${SPACE.tight}`}>
      {looks.map((look, i) => (
        <Card key={`${look.at}-${i}`}>
          <Card.Header>
            <Card.Title>{look.grantee} · {look.field}</Card.Title>
            <Card.Description>{look.at.slice(0, 16).replace("T", " ")} · {look.purpose}</Card.Description>
          </Card.Header>
          {/* ⚠️ Refused attempts are shown too. "Did anybody try" is the question
              actually asked after something goes wrong. */}
          {look.refused
            ? (
              <Card.Content>
                <Chip color="warning" variant="soft"><Chip.Label>Refused — {look.refused}</Chip.Label></Chip>
              </Card.Content>
            )
            : null}
        </Card>
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
    <Card>
      <Card.Header>
        <Card.Title>Your data</Card.Title>
        <Card.Description>Take a copy, or have it destroyed.</Card.Description>
      </Card.Header>
      <Card.Content>
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
      </Card.Content>
    </Card>
  );
}

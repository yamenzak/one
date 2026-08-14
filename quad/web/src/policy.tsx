/**
 * WHO IS TOLD WHAT — the two-level policy screen, rendered from the declarations.
 *
 * ⚠️ THE WORKSPACE SETS A CEILING AND A PERSON NARROWS IT. One screen, two
 * modes, because two screens is how the two levels come to disagree about what
 * is possible — and the one people believe is whichever they are looking at.
 *
 * ⚠️ A TYPE SOMEBODY IS NOT IN THE AUDIENCE FOR IS NOT LISTED. Its audience is a
 * permission, so this is the same question the dispatcher asks; a row for a
 * notification that will never arrive is a switch that does nothing.
 *
 * ⚠️ AND AN `action` HAS NO SWITCH AT ALL. "Your invitation is waiting", "your
 * payment failed" — a product that lets those be muted has built a way to miss
 * them silently. It is stated on the row rather than merely disabled, because a
 * disabled control invites somebody to go looking for how to enable it.
 */

import type { Channel, NotificationBook, NotificationDef, Policy, Preference } from "@quad/kernel";
import { INTERRUPTS, channelsFor, inAudience } from "@quad/kernel";
import { Card, Chip, Label, Switch } from "@heroui/react";
import { SPACE } from "./metrics.js";

export interface PolicyProps {
  readonly book: NotificationBook;
  /** `tenant` sets the ceiling; `person` narrows it for themselves. */
  readonly level: "tenant" | "person";
  readonly policy: Policy;
  readonly preference: Preference;
  readonly held: ReadonlySet<string>;
  /** What this deployment can actually deliver. */
  readonly available: readonly Channel[];
  readonly onChange: (id: string, channels: readonly Channel[]) => void;
}

const CHANNEL_LABEL: Readonly<Record<Channel, string>> = {
  inbox: "Inbox", email: "Email", push: "Push",
};

export function NotificationPolicy(
  { book, level, policy, preference, held, available, onChange }: PolicyProps,
) {
  const mine = Object.values(book).filter((def) => inAudience(def, held));

  return (
    <div className={`flex flex-col ${SPACE.snug}`}>
      {mine.map((def) => {
        const on = channelsFor(def, policy, preference, available);
        const ceiling = level === "person" ? (policy[def.id] ?? def.channels) : def.channels;
        const locked = def.category === "action";

        return (
          <Card key={def.id}>
            <Card.Header>
              <Card.Title>{def.label}</Card.Title>
              <Card.Description>{def.summary}</Card.Description>
            </Card.Header>
            <Card.Content>
              <div className={`flex flex-wrap items-center ${SPACE.snug}`}>
                {def.channels.filter((c) => c !== "inbox").map((channel) => {
                  const offered = available.includes(channel) && ceiling.includes(channel);
                  return (
                    <Switch
                      key={channel}
                      isSelected={on.includes(channel)}
                      isDisabled={locked || !offered}
                      onChange={(next) => onChange(def.id, toggle(on, channel, next))}
                    >
                      <Switch.Control><Switch.Thumb /></Switch.Control>
                      <Switch.Content><Label>{CHANNEL_LABEL[channel]}</Label></Switch.Content>
                    </Switch>
                  );
                })}
                {/* ⚠️ Said, not merely disabled — see the header. */}
                {locked
                  ? (
                    <Chip color="accent" variant="soft">
                      <Chip.Label>Always sent — this one needs you to do something</Chip.Label>
                    </Chip>
                  )
                  : null}
                {def.channels.some((c) => !available.includes(c))
                  ? (
                    <Chip color="default" variant="soft">
                      <Chip.Label>Some channels are not set up on this deployment</Chip.Label>
                    </Chip>
                  )
                  : null}
              </div>
            </Card.Content>
          </Card>
        );
      })}
    </div>
  );
}

const toggle = (on: readonly Channel[], channel: Channel, next: boolean): readonly Channel[] =>
  next ? [...new Set([...on, channel])] : on.filter((c) => c !== channel);

/**
 * ⚠️ WHAT THE SCREEN OFFERS, AS DATA — for the guard, and for the same reason
 * `settingsShown` exists: a check that reads rendered HTML breaks on a class
 * name and then gets deleted.
 */
export interface Offered {
  readonly id: string;
  readonly switches: readonly Channel[];
  readonly locked: boolean;
}

export const policyShown = (
  book: NotificationBook, held: ReadonlySet<string>, available: readonly Channel[],
): readonly Offered[] =>
  Object.values(book).filter((def: NotificationDef) => inAudience(def, held)).map((def) => ({
    id: def.id,
    switches: def.channels.filter((c) => INTERRUPTS.includes(c) && available.includes(c)),
    locked: def.category === "action",
  }));

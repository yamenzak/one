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
import { ToggleButton, ToggleButtonGroup } from "@heroui/react";
import { ControlRow, Group } from "../parts/surfaces.js";

export interface PolicyProps {
  readonly book: NotificationBook;
  /** `tenant` sets the ceiling; `person` narrows it for themselves. */
  readonly level: "tenant" | "person";
  readonly policy: Policy;
  readonly preference: Preference;
  readonly held: ReadonlySet<string>;
  /** What this deployment can actually deliver. */
  readonly available: readonly Channel[];
  /** The group's heading, and whose policy it is in a line. */
  readonly label?: string;
  readonly under?: string;
  readonly onChange: (id: string, channels: readonly Channel[]) => void;
}

const CHANNEL_LABEL: Readonly<Record<Channel, string>> = {
  inbox: "Inbox", email: "Email", push: "Push",
};

export function NotificationPolicy(
  { book, level, label, under, policy, preference, held, available, onChange }: PolicyProps,
) {
  const mine = Object.values(book).filter((def) => inAudience(def, held));

  return (
    /*
      ⚠️ ONE GROUP OF ROWS, NOT A CARD PER NOTIFICATION. Eight types came out as
      eight cards, each with a title, a summary and two unlabelled switches
      floating in its content — a screen somebody scrolls rather than sets.

      ⚠️ AND THE SWITCHES SIT AT THE END OF THE ROW, WRAPPING UNDER ON A PHONE.
      See `ControlRow`: pinning them to the corner would shorten the words that
      say which notification this is, which is the half nobody can guess.
    */
    <Group label={label} under={under}>
      {mine.map((def) => {
        const on = channelsFor(def, policy, preference, available);
        const ceiling = level === "person" ? (policy[def.id] ?? def.channels) : def.channels;
        const locked = def.category === "action";
        const missing = def.channels.some((c) => !available.includes(c));

        return (
          <ControlRow
            key={def.id}
            label={def.label}
            /*
              ⚠️ NOT `def.summary`, AND THIS IS THE ONE SCREEN THAT GETS IT
              WRONG. A summary is a TEMPLATE — "{coach} published {title}" —
              filled at dispatch with the names of real people. Everywhere else
              it is rendered after that; here it was rendered before, so the row
              under "A plan was published" read literally `{coach} published
              {title}`. The label already says which notification this is, which
              is the only question this screen asks.

              ⚠️ AND WHAT REPLACES IT IS SAID, NOT MERELY DISABLED — see the
              header. A disabled control with no reason reads as broken.
            */
            under={locked
              ? "Always sent — this one needs you to do something"
              : missing
                ? "Some channels are not set up on this deployment"
                : undefined}
          >
            {/*
              ⚠️ THE CHANNELS ARE ONE CONTROL, NOT TWO SWITCHES. A switch is a
              thing that is on or off by itself; "where does this go" is one
              question with a set of answers, and two unlabelled switches
              floating side by side in a card was neither readable nor nameable.
              `ToggleButtonGroup` in `multiple` mode IS that question, and it
              takes about half the width.
            */}
            <ToggleButtonGroup
              selectionMode="multiple"
              size="sm"
              isDisabled={locked}
              selectedKeys={new Set(on.filter((c) => c !== "inbox"))}
              onSelectionChange={(keys) => onChange(
                def.id,
                [...def.channels.filter((c) => c === "inbox"), ...[...keys] as Channel[]],
              )}
            >
              {def.channels.filter((c) => c !== "inbox").map((channel, i) => (
                <ToggleButton
                  key={channel}
                  id={channel}
                  isDisabled={!(available.includes(channel) && ceiling.includes(channel))}
                >
                  {i > 0 ? <ToggleButtonGroup.Separator /> : null}
                  {CHANNEL_LABEL[channel]}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </ControlRow>
        );
      })}
    </Group>
  );
}

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

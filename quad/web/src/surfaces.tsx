/**
 * THE CARD GROUP AND ITS ROWS — the unit almost every screen is made of.
 *
 * ⚠️ ONE OBSERVATION DRIVES THIS WHOLE FILE: in a product that reads well,
 * essentially every screen is a stack of card groups, each holding rows of one
 * of a handful of shapes. Settings, a profile, a payee list, a document index, a
 * balance breakdown — the same two components with different rows in them. The
 * moment each screen builds its own list, they drift, and the drift is not
 * fixable later because nobody can point at which one is wrong.
 *
 * ⚠️ SO THE ROWS ARE A CLOSED SET, AND THAT IS THE POINT. Seven shapes cover
 * everything below; an eighth is a decision somebody makes on purpose, in
 * review, having failed to fit it into the seven. A component library with
 * thirty row types has no row types.
 *
 * ⚠️ GROUPING CARRIES MEANING, AND A LABEL IS ONLY ADDED WHEN IT DOES NOT. Two
 * cards with a gap between them already say "these are different kinds of
 * thing"; a heading over each is the same information twice, and it pushes
 * everything below the fold. A `Group` therefore takes an OPTIONAL label.
 *
 * ⚠️ NOTHING HERE SETS A COLOUR, A RADIUS OR A BORDER. The card is HeroUI's
 * `Card`, the switch is its `Switch`, the avatar is its `Avatar` — so a
 * workspace's branding reaches all of it, and none of it has to be revisited
 * when the library changes its mind about a shadow (D7).
 */

import { Avatar, Badge, Button, Card, Label, Separator, Switch } from "@heroui/react";
import type { Tone } from "@quad/kernel";
import { TYPE } from "./type.js";
import { HEAD_GAP, LEAD, PAD, ROW, SPACE } from "./metrics.js";

/* ------------------------------------------------------------------ group --- */

export interface GroupProps {
  /** ⚠️ Only where the grouping does not already say it — see the header. */
  readonly label?: string;
  /** One line under the label, for a group whose consequence is not obvious. */
  readonly under?: string;
  readonly children?: React.ReactNode;
}

export function Group({ label, under, children }: GroupProps) {
  return (
    <section className={`flex flex-col ${HEAD_GAP}`}>
      {label ? (
        <div className="flex flex-col gap-1">
          <h2 className={TYPE.section}>{label}</h2>
          {under ? <p className={TYPE.note}>{under}</p> : null}
        </div>
      ) : null}
      <Card>
        <Card.Content>
          {/* ⚠️ `divide` rather than a border per row: a row does not know
              whether it is the last one, and a trailing rule inside a rounded
              card is the classic tell of a hand-built list. */}
          <div className="flex flex-col">{children}</div>
        </Card.Content>
      </Card>
    </section>
  );
}

/** ⚠️ Between rows, never after the last. `Group` cannot know, so the caller
    interleaves — which is also what lets one card hold two runs of rows. */
export const RowRule = () => <Separator />;

/* ------------------------------------------------------------------- rows --- */

interface RowBase {
  /** A glyph, a mark, an avatar. Kept small and optical rather than boxed. */
  readonly icon?: React.ReactNode;
  readonly label: string;
  /** ⚠️ ONE LINE, AND NO FULL STOP — see `tone.ts`. */
  readonly under?: string;
}

/**
 * ⚠️ `items-start text-left` IS THE FIX FOR THE RAGGED COLUMN. HeroUI's `Button`
 * centres its children, so a two-line row rendered its label centred over its
 * description — every list in the product had a soft, wandering left edge, and
 * it read as amateur without being nameable. `justify-start` on the button is
 * not enough: the block itself has to align its own lines.
 */
const Body = ({ label, under }: { readonly label: string; readonly under?: string }) => (
  <span className="flex min-w-0 grow flex-col items-start gap-1 text-left">
    <span className={TYPE.label}>{label}</span>
    {under ? <span className={TYPE.note}>{under}</span> : null}
  </span>
);

/** ⚠️ A FIXED BOX, so every label in a list starts at the same x — see `LEAD`. */
const Lead = ({ icon }: { readonly icon?: React.ReactNode }) =>
  icon ? <span aria-hidden="true" className={LEAD}>{icon}</span> : null;

/**
 * ⚠️ A ROW THAT GOES SOMEWHERE IS A BUTTON, NOT A DIV WITH AN onClick. The
 * difference is the focus ring, the pressed state, the disabled semantics and
 * every keyboard behaviour React Aria gives us — none of which is visible in a
 * screenshot, all of which is visible to somebody using a keyboard or a screen
 * reader.
 */
export interface NavRowProps extends RowBase {
  readonly onOpen: () => void;
  /** A count, a status, a value — whatever sits before the chevron. */
  readonly aside?: React.ReactNode;
  readonly isDisabled?: boolean;
}

export function NavRow({ icon, label, under, aside, onOpen, isDisabled }: NavRowProps) {
  return (
    <Button variant="ghost" className="w-full justify-start" isDisabled={isDisabled} onPress={onOpen}>
      <span className={`flex w-full items-center ${ROW.gap} ${ROW.pad} ${ROW.tap}`}>
        <Lead icon={icon} />
        <Body label={label} under={under} />
        <span className={`flex shrink-0 items-center ${SPACE.tight}`}>
          {aside}
          {/* ⚠️ The chevron is the promise that something is behind this. A row
              without one that navigates is a row people do not press. */}
          <span aria-hidden="true" className={TYPE.note}>›</span>
        </span>
      </span>
    </Button>
  );
}

/** A row that DOES something rather than going somewhere — so, no chevron. */
export function ActionRow({ icon, label, under, onDo, tone = "neutral" }: RowBase & {
  readonly onDo: () => void; readonly tone?: Tone;
}) {
  return (
    <Button
      variant={tone === "danger" ? "danger" : "ghost"}
      className="w-full justify-start"
      onPress={onDo}
    >
      <span className={`flex w-full items-center ${ROW.gap} ${ROW.pad} ${ROW.tap}`}>
        <Lead icon={icon} />
        <Body label={label} under={under} />
      </span>
    </Button>
  );
}

/**
 * ⚠️ THE SWITCH IS THE CONTROL AND THE WHOLE ROW IS ITS LABEL. Rendering the
 * text outside the `Switch` makes a row where tapping the words does nothing —
 * which on a phone is most of the row.
 */
export function ToggleRow({ icon, label, under, value, onChange, isDisabled }: RowBase & {
  readonly value: boolean;
  readonly onChange: (next: boolean) => void;
  readonly isDisabled?: boolean;
}) {
  return (
    /* ⚠️ THE BREATHING ROOM IS ON OUR WRAPPER, NOT ON THE SWITCH. Padding is a
       component's own density; setting it here would be restyling the library,
       and the restyle guard is right to refuse it. */
    <div className={`flex w-full ${ROW.pad} ${ROW.tap} items-center`}>
    <Switch
      /* ⚠️ `justify-between` IS THE WHOLE FIX. Without it the content takes the
         full width and the control wraps to a second line — which reads as a
         broken row rather than as a switch. That is what it looked like the
         first time it was RENDERED rather than described. */
      className={`w-full flex-row justify-between items-center ${ROW.gap}`}
      isSelected={value}
      isDisabled={isDisabled}
      onChange={onChange}
    >
      <Switch.Content className="grow">
        <span className={`flex items-center ${ROW.gap}`}>
          <Lead icon={icon} />
          <Label><Body label={label} under={under} /></Label>
        </span>
      </Switch.Content>
      <Switch.Control><Switch.Thumb /></Switch.Control>
    </Switch>
    </div>
  );
}

/**
 * A stored fact and the way to change it.
 *
 * ⚠️ THE LABEL IS ABOVE THE VALUE AND QUIETER THAN IT. The value is what
 * somebody came to read; a layout that gives the two equal weight makes them
 * scan every row twice.
 */
export function FieldRow({ label, value, onEdit }: {
  readonly label: string;
  readonly value: React.ReactNode;
  /** ⚠️ Absent means genuinely not editable — never a disabled pencil, which
      invites somebody to go looking for how to enable it. */
  readonly onEdit?: () => void;
}) {
  return (
    <div className={`flex items-center ${ROW.gap} ${ROW.pad} ${ROW.still}`}>
      <span className="flex min-w-0 grow flex-col items-start gap-1 text-left">
        <span className={TYPE.note}>{label}</span>
        <span className={TYPE.body}>{value}</span>
      </span>
      {onEdit ? (
        <span className="shrink-0">
          <Button variant="ghost" aria-label={`Change ${label.toLowerCase()}`} onPress={onEdit}>
            Change
          </Button>
        </span>
      ) : null}
    </div>
  );
}

/**
 * A person, with what last happened between you.
 *
 * ⚠️ THE TRAILING META IS TIME, NOT AN ACTION. A list of people is scanned for
 * "when", and putting a button there makes every row a decision.
 */
export function PersonRow({ name, under, when, unread, face, onOpen }: {
  readonly name: string;
  readonly under?: string;
  readonly when?: string;
  readonly unread?: number;
  readonly face?: string;
  readonly onOpen: () => void;
}) {
  return (
    <Button variant="ghost" className="w-full justify-start" onPress={onOpen}>
      <span className={`flex w-full items-center ${ROW.gap} ${ROW.pad} ${ROW.tap}`}>
        <Avatar className="shrink-0">
          {face ? <Avatar.Image src={face} alt="" /> : null}
          <Avatar.Fallback>{name.slice(0, 1).toUpperCase()}</Avatar.Fallback>
        </Avatar>
        <Body label={name} under={under} />
        <span className="flex shrink-0 flex-col items-end gap-1">
          {when ? <span className={TYPE.note}>{when}</span> : null}
          {unread ? (
            <Badge color="accent"><Badge.Label>{unread}</Badge.Label></Badge>
          ) : null}
        </span>
      </span>
    </Button>
  );
}

/**
 * A named thing and an amount.
 *
 * ⚠️ `tabular-nums` VIA `TYPE.label`'s SIBLING — see `TYPE.figure`. A column of
 * proportional digits ripples, and the reader ends up doing the arithmetic on
 * the ripple rather than on the values.
 */
export function AmountRow({ icon, label, under, amount, tone = "neutral", onOpen }: RowBase & {
  readonly amount: string;
  readonly tone?: Tone;
  readonly onOpen?: () => void;
}) {
  const inner = (
    <span className={`flex w-full items-center ${ROW.gap} ${ROW.pad} ${ROW.tap}`}>
      <Lead icon={icon} />
      <Body label={label} under={under} />
      <span className={`shrink-0 ${TYPE.label} tabular-nums`} data-tone={tone}>{amount}</span>
      {onOpen ? <span aria-hidden="true" className={TYPE.note}>›</span> : null}
    </span>
  );
  return onOpen
    ? <Button variant="ghost" className="w-full justify-start" onPress={onOpen}>{inner}</Button>
    : <div className="flex w-full">{inner}</div>;
}

/* ---------------------------------------------------------------- clusters --- */

/**
 * THE CIRCULAR SHORTCUTS UNDER A HERO.
 *
 * ⚠️ THREE OR FOUR, AND THEY ARE THE THINGS SOMEBODY CAME TO DO IN A HURRY —
 * report a fraud, replace a card, stop a device. A fifth turns a row of
 * decisions into a menu, and a menu belongs in a `Group`.
 */
export function QuickActions({ actions }: {
  readonly actions: readonly {
    readonly id: string; readonly label: string;
    readonly icon: React.ReactNode; readonly onDo: () => void;
  }[];
}) {
  return (
    /* ⚠️ Four must FIT a phone. At 80px wide with a 24px gap they came to 392px
       against 390 available, so the fourth wrapped to its own line — which reads
       as a mistake rather than as a row. */
    <div className={`flex flex-wrap items-start justify-center ${SPACE.snug} ${ROW.pad}`}>
      {actions.slice(0, 4).map((a) => (
        <div key={a.id} className={`flex w-16 flex-col items-center ${SPACE.tight}`}>
          <Button variant="secondary" aria-label={a.label} onPress={a.onDo}>{a.icon}</Button>
          <span className={`${TYPE.note} text-center`}>{a.label}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * ⚠️ `auto-fit` WITH A MINIMUM, NOT A COLUMN COUNT. A grid declared as "four
 * across" needs a breakpoint for every width it does not fit, and is wrong on
 * the first device nobody tested.
 */
export function TileGrid({ tiles }: {
  readonly tiles: readonly {
    readonly id: string; readonly label: string;
    readonly icon: React.ReactNode; readonly onOpen: () => void;
  }[];
}) {
  return (
    <div
      className={`grid ${SPACE.snug}`}
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(6rem, 45%), 1fr))" }}
    >
      {tiles.map((t) => (
        <Button
          key={t.id}
          variant="secondary"
          className={`flex-col h-24 ${SPACE.tight}`}
          onPress={t.onOpen}
        >
          <span aria-hidden="true">{t.icon}</span>
          <span className={TYPE.note}>{t.label}</span>
        </Button>
      ))}
    </div>
  );
}

/**
 * WHAT A SCREEN SAYS WHEN THERE IS NOTHING ON IT.
 *
 * ⚠️ AN EMPTY STATE IS A FACT PLUS A WAY OUT, and the fact is stated in the
 * person's terms rather than the system's — "No workspaces yet", never "0
 * results". `yet` is doing real work: it says this is a beginning rather than a
 * failure.
 *
 * ⚠️ AND IT IS NEVER SHOWN WHILE WE ARE STILL LOOKING. A loading state wearing
 * an empty state's clothes is the most common wrong answer a product gives.
 */
export function Nothing({ says, offer }: {
  readonly says: string;
  readonly offer?: { readonly label: string; readonly onDo: () => void };
}) {
  return (
    <Card>
      <Card.Header><Card.Title>{says}</Card.Title></Card.Header>
      {offer ? (
        <Card.Content>
          {/* ⚠️ `Button` takes a VARIANT, not a colour. Passing a tone here
              would be this file deciding what an accent looks like, which is
              the library's answer and not ours (D7). */}
          <Button variant="primary" onPress={offer.onDo}>{offer.label}</Button>
        </Card.Content>
      ) : null}
    </Card>
  );
}

/* ------------------------------------------------------------------ money --- */

/**
 * AN AMOUNT, WITH ITS FRACTION SET SMALLER THAN ITS WHOLE.
 *
 * ⚠️ THIS IS THE ONE TYPOGRAPHIC DEVICE THAT MAKES A BALANCE READ AS A BALANCE.
 * `€1,051.70` at one size is a number; `€1,051` with a smaller `.70` is a sum of
 * money, because the eye lands on the part that matters and treats the rest as
 * precision. Every product that handles money well does this, and it is
 * invisible until you put the two side by side.
 *
 * ⚠️ AND IT IS `tabular-nums` WHEREVER IT APPEARS, so a column of amounts lines
 * up on the decimal. Proportional digits make a list ripple, and the reader ends
 * up comparing the ripple rather than the values.
 *
 * ⚠️ THE SIGN IS A TONE, NOT A COLOUR. Money coming in is `success`, going out
 * is neutral — never red, which is for something being wrong. A product that
 * paints every outgoing payment red tells somebody their groceries were a fault.
 */
export function Money({ amount, currency = "€", size = "figure", tone = "neutral" }: {
  /** ⚠️ Minor units, as an integer. A float here is a rounding error later. */
  readonly amount: number;
  readonly currency?: string;
  readonly size?: "figure" | "label";
  readonly tone?: Tone;
}) {
  const sign = amount < 0 ? "−" : tone === "success" ? "+" : "";
  const whole = Math.floor(Math.abs(amount) / 100).toLocaleString();
  const part = String(Math.abs(amount) % 100).padStart(2, "0");
  const big = size === "figure" ? TYPE.figure : TYPE.label;

  return (
    <span className={`${big} tabular-nums`} data-tone={tone}>
      {sign}{currency}{whole}
      <span className={TYPE.minor}>.{part}</span>
    </span>
  );
}

/* ------------------------------------------------------------- more rows --- */

/**
 * A VALUE SOMEBODY CAME TO COPY.
 *
 * ⚠️ AN IBAN IS NOT READ, IT IS TAKEN. Rendering one as ordinary text makes
 * somebody select twenty characters on a phone, and they will get it wrong. The
 * value is the control.
 */
export function CopyRow({ label, value, onCopy }: {
  readonly label: string;
  readonly value: string;
  readonly onCopy: (value: string) => void;
}) {
  return (
    <div className={`flex items-center ${ROW.gap} ${ROW.pad} ${ROW.still}`}>
      <span className="flex min-w-0 grow flex-col items-start gap-1 text-left">
        <span className={TYPE.note}>{label}</span>
        <span className={`${TYPE.body} break-words`}>{value}</span>
      </span>
      <span className="shrink-0">
        <Button variant="ghost" aria-label={`Copy ${label.toLowerCase()}`} onPress={() => onCopy(value)}>
          Copy
        </Button>
      </span>
    </div>
  );
}

/**
 * SOMETHING TRUE THAT IS NOT A CONTROL.
 *
 * ⚠️ THIS IS THE ONE PLACE PROSE BELONGS, AND IT TAKES ITS FULL STOPS. A
 * deposit-protection notice is two sentences and reads as sentences; a caption
 * under a label is not, and takes none. The distinction is what `tone.ts`
 * enforces, and having a component for each is what stops somebody splitting the
 * difference.
 */
export function NoteRow({ icon, children }: {
  readonly icon?: React.ReactNode;
  readonly children: React.ReactNode;
}) {
  return (
    <div className={`flex items-start ${ROW.gap} ${ROW.pad}`}>
      <Lead icon={icon} />
      <p className={TYPE.body}>{children}</p>
    </div>
  );
}

/**
 * SOMETHING ON OFFER, WITH THE WAY IN BESIDE IT.
 *
 * ⚠️ A TRAILING BUTTON RATHER THAN A CHEVRON, AND THE DIFFERENCE IS A PROMISE. A
 * chevron says "there is more to read"; a button says "this starts now". Using
 * one for the other is how somebody ends up in a flow they were browsing.
 */
export function OfferRow({ icon, label, under, offer }: RowBase & {
  readonly offer: { readonly label: string; readonly onDo: () => void };
}) {
  return (
    <div className={`flex items-center ${ROW.gap} ${ROW.pad} ${ROW.tap}`}>
      <Lead icon={icon} />
      <Body label={label} under={under} />
      <span className="shrink-0">
        <Button variant="secondary" onPress={offer.onDo}>{offer.label}</Button>
      </span>
    </div>
  );
}

/**
 * ONE OF THE THINGS THAT HAS TO HAPPEN.
 *
 * ⚠️ NO CHEVRON AND NO CONTROL: a step is a statement, and making it look
 * pressable invites somebody to press it and find nothing. What makes it a list
 * rather than prose is that each item is one thing, with its own qualifier
 * underneath.
 */
export function StepRow({ icon, label, under }: RowBase) {
  return (
    <div className={`flex items-start ${ROW.gap} ${ROW.pad} ${ROW.still}`}>
      <Lead icon={icon} />
      <Body label={label} under={under} />
    </div>
  );
}

/**
 * ⚠️ THE WAY OUT OF A TRUNCATED LIST, AT THE BOTTOM OF THE CARD THAT TRUNCATED
 * IT. Anywhere else and it is a link to somewhere; here it is the answer to the
 * question the list just raised.
 */
export function SeeAll({ label = "See all", onOpen }: {
  readonly label?: string; readonly onOpen: () => void;
}) {
  return (
    <div className="flex justify-center">
      <Button variant="ghost" onPress={onOpen}>{label}</Button>
    </div>
  );
}

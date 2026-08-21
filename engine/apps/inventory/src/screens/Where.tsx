/**
 * A PLACE — what is on this shelf, and what is below it.
 *
 * ⚠️ IT IS THE SAME QUESTION AS THE STOCK SCREEN, ASKED FROM THE OTHER END, and
 * that is why it is a screen rather than a filter. "What is here" is what
 * somebody standing in front of a rack asks; "where is the resin" is what
 * somebody at a bench asks. One screen answering both would have a control for
 * choosing which, and a control for choosing which is the question asked twice.
 *
 * ⚠️ AND THE LABEL IS THE POINT OF THE SCREEN. A place with a printed code is a
 * place the camera can move the session to, which is what turns a two-hour count
 * into forty minutes — so the code is a fact under the name rather than a
 * setting buried in an editor.
 */

import {
  AmountRow, CopyRow, Group, Num, Screen, Section, Tree, Unit, glyphOf,
  type Branch, type Loaded,
} from "@engine/design";
import type { Line, Place } from "./sample.js";

export interface WhereProps {
  readonly place: Place;
  readonly places: readonly Place[];
  readonly of: Loaded<readonly Line[]>;
  readonly again: () => void;
  readonly back: () => void;
  readonly onGo: (id: string | null) => void;
  readonly onOpen: (line: Line) => void;
  readonly onLabel: () => void;
  readonly onCopy: (value: string) => void;
}

export function Where({
  place, places, of, again, back, onGo, onOpen, onLabel, onCopy,
}: WhereProps) {
  const below = places.filter((p) => p.of === place.id);

  return (
    <Screen
      shape="detail"
      title={place.name}
      /* ⚠️ THE COUNT, WHICH IS THE ONE FACT WORTH THE LINE. What KIND of place
         it is shows in the tree above it and in the name people gave it.

         ⚠️ AND NOTHING AT ALL WHERE THERE IS NOTHING. "0 lines" over an empty
         state that already says "Nothing here yet" is the same fact twice, in
         the two places on the screen that are furthest apart. */
      {...(place.lines === 0
        ? {}
        : { under: place.lines === 1 ? "1 line" : `${place.lines} lines` })}
      back={back}
      does={{ op: "product.label", label: "Print a label", onDo: onLabel }}
      of={of}
      again={again}
      isNothing={(lines) => lines.length === 0 && below.length === 0}
      nothing={{
        icon: glyphOf("pin"),
        says: "Nothing here yet",
        under: "Put something on it, or add a shelf inside it",
      }}
      then={(lines) => (
        <>
          {/* ⚠️ THE CODE IS COPYABLE BECAUSE SOMEBODY WILL TYPE IT INTO A LABEL
              PRINTER, and a code somebody has to read off a screen and retype is
              a code that will be wrong once. */}
          {place.code ? <Group label="Label"><CopyRow label="Code" value={place.code} onCopy={onCopy} /></Group> : null}

          {below.length
            ? (
              <Section label="Inside">
                <Tree
                  nodes={below.map((p): Branch => ({
                    id: p.id,
                    label: p.name,
                    under: p.lines === 1 ? "1 line" : `${p.lines} lines`,
                    /* ⚠️ FLATTENED TO ONE LEVEL DELIBERATELY. This is a list of
                       what is directly inside, not a second tree — the tree is
                       how somebody GOT here. */
                    of: null,
                  }))}
                  here={null}
                  onGo={onGo}
                />
              </Section>
            )
            : null}

          {lines.length
            ? (
              <Section label="On it">
                <Group>
                  {lines.map((line) => (
                    <AmountRow
                      key={line.id}
                      label={line.name}
                      amount={<Num value={line.quantity} />}
                      aside={<Unit of={line.unit} />}
                      onOpen={() => onOpen(line)}
                    />
                  ))}
                </Group>
              </Section>
            )
            : null}
        </>
      )}
    />
  );
}

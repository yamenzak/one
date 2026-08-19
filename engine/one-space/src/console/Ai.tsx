/**
 * AI — the area, and the three questions inside it.
 *
 * ⚠️ THIS WAS ONE SCREEN CARRYING FOUR SUBJECTS. A deployment-wide catalogue
 * fault, a product picker, a per-action model binding and a prompt editor, in
 * one column, because each had arrived one at a time. They are four questions
 * asked by different people on different days — which models we sell, what each
 * product's actions run on, whether the margin is holding — and stacking them
 * meant the most alarming one was drawn under a heading about something else.
 *
 * ⚠️ THE INDEX CARRIES THE ALARM AND THE DESTINATIONS DO NOT REPEAT IT. A fault
 * shown on every sub-page is a fault the reader stops seeing; shown once, here,
 * it is the reason to open the row under it.
 */

import { Group, NavRow, Screen, glyphOf } from "@engine/design";
import { useLoad } from "../centre/data.js";
import { nameOf, OF_AI, type AiPart, type Where } from "../space/where.js";

interface Fault { readonly of: string; readonly why: string; readonly detail: string }

interface AiAt {
  readonly models: readonly { readonly enabled: boolean; readonly retired: boolean }[];
  readonly faults: readonly Fault[];
}

/** ⚠️ One glyph per row, named beside the words rather than nested in a ternary
    that has to grow a branch every time a sub-page is added. */
const GLYPH: Readonly<Record<AiPart, Parameters<typeof glyphOf>[0]>> = {
  models: "bank", actions: "sparkle", gateway: "database", finding: "search",
};

/** ⚠️ What each row is FOR, in the reader's words — see `Console.tsx`'s `saidOf`. */
const ABOUT: Readonly<Record<AiPart, string>> = {
  models: "What this deployment sells, and at what margin",
  actions: "What answers each product's actions, and whose words it uses",
  gateway: "Where the calls go, and whether we are being paid above cost",
  finding: "What is indexed, and what the index would not take",
};

export function Ai({ onGo }: { readonly onGo: (to: Where) => void }) {
  const of = useLoad<AiAt>("op.models");

  return (
    <Screen shape="list" of={of.of} again={of.again} then={(at) => {
      const live = at.models.filter((m) => m.enabled && !m.retired).length;
      /* ⚠️ A COUNT ON THE ROW, because "Models" alone does not say whether this
         deployment sells three or none — and none is the state a fresh one is
         in, which is the whole reason somebody opens this. */
      const said: Readonly<Record<AiPart, string | undefined>> = {
        models: at.faults.length
          ? undefined
          : `${live} model${live === 1 ? "" : "s"} on`,
        actions: undefined,
        gateway: undefined,
        finding: undefined,
      };

      return (
        <>
          {/*
            ⚠️ THE CATALOGUE'S OWN FAULTS FIRST, BECAUSE THEY OUTRANK EVERY ROW
            UNDER THEM. A lane with no model is a product whose button does
            nothing; a row priced at nothing settles free on every call and the
            provider's invoice is the first anybody hears of it.
          */}
          {at.faults.length ? (
            <Group label="Needs attention" under="Nothing generates correctly until these are cleared">
              {at.faults.map((f) => (
                <NavRow
                  key={`${f.of}:${f.why}`}
                  icon={glyphOf("sparkle")}
                  label={f.of}
                  under={<span data-ink="danger">{f.detail}</span>}
                  onOpen={() => onGo({ at: "models" })}
                />
              ))}
            </Group>
          ) : null}

          <Group>
            {OF_AI.map((part) => (
              <NavRow
                key={part}
                icon={glyphOf(GLYPH[part])}
                label={nameOf({ at: part } as Where)}
                under={said[part] ?? ABOUT[part]}
                onOpen={() => onGo({ at: part } as Where)}
              />
            ))}
          </Group>
        </>
      );
    }} />
  );
}

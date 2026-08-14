/**
 * EVERY PIECE A SCREEN IS ASSEMBLED FROM, ON ONE PAGE.
 *
 * ⚠️ THIS IS A DEVELOPMENT SURFACE AND IT EARNS ITS KEEP TWICE. It is where a
 * design decision is SEEN rather than argued about — a card group beside a
 * toggle row beside a field row, in both themes, at both widths — and it is what
 * the screenshot sweep photographs, so a change to the vocabulary is a visible
 * diff rather than a description of one.
 *
 * ⚠️ IT IS NOT REACHABLE IN PRODUCTION. `pickScreen` only answers `gallery` on
 * the development root; a component catalogue on a customer's door is a page
 * that leaks every capability the product has, including the ones they have not
 * bought.
 */

import { useState } from "react";
import { Band, Figure, Group, Grid, NavRow, ActionRow, ToggleRow, FieldRow, PersonRow,
  AmountRow, QuickActions, TileGrid, Nothing, RowRule, Row, SectionTitle, Stack, Title,
  TYPE, type Ambience } from "@quad/web";
import { Sheet } from "../ui.js";

const nothing = () => {};

/** ⚠️ Text, not an icon font or an SVG import — the vocabulary is what is being
    shown here, and a real icon set is a decision that has not been made. */
const glyph = (mark: string) => <span aria-hidden="true">{mark}</span>;

const SKIES: readonly Ambience[] = ["calm", "focus", "lift", "mesh", "dots", "weave"];

export function Gallery() {
  const [hide, setHide] = useState(false);
  const [flip, setFlip] = useState(true);

  return (
    <Stack space="airy">
      <Title under="Every piece a screen is assembled from">The vocabulary</Title>

      {/* ------------------------------------------------------- ambience --- */}
      <section className="flex flex-col gap-3">
        <SectionTitle>Ambience</SectionTitle>
        <Grid min="9rem">
          {SKIES.map((sky) => (
            <div
              key={sky}
              data-sky={sky}
              className="flex h-24 items-end overflow-hidden rounded-2xl p-3"
            >
              <span className={TYPE.note}>{sky}</span>
            </div>
          ))}
        </Grid>
      </section>

      {/* ----------------------------------------------------------- rows --- */}
      <Group label="Rows" under="Seven shapes cover every list in the product">
        <NavRow icon={glyph("▸")} label="Goes somewhere" onOpen={nothing} />
        <RowRule />
        <NavRow
          icon={glyph("▸")}
          label="Goes somewhere, explained"
          under="One line saying what is behind it"
          aside={<span className={TYPE.note}>3</span>}
          onOpen={nothing}
        />
        <RowRule />
        <ToggleRow
          icon={glyph("◔")}
          label="Hide balances"
          under="Hide amounts for all balances and transactions"
          value={hide}
          onChange={setHide}
        />
        <RowRule />
        <ToggleRow
          icon={glyph("◑")}
          label="Messaging with friends"
          under="Send and receive messages with other people here"
          value={flip}
          onChange={setFlip}
        />
        <RowRule />
        <FieldRow label="Residential address" value="Woldegker Str. 8A, 13059, Berlin" onEdit={nothing} />
        <RowRule />
        <FieldRow label="Tax residency" value="Germany" />
        <RowRule />
        <PersonRow name="Amir Al Tarsha" under="Sent you €2.69" when="Yesterday" unread={5} onOpen={nothing} />
        <RowRule />
        <AmountRow icon={glyph("◈")} label="Savings" under="Two accounts" amount="€6,003" onOpen={nothing} />
        <RowRule />
        <AmountRow icon={glyph("◇")} label="Cash" amount="€1,169" />
        <RowRule />
        <ActionRow icon={glyph("✕")} label="Close this workspace" tone="danger" onDo={nothing} />
      </Group>

      {/* -------------------------------------------------------- figures --- */}
      <Group label="Figures">
        <div className="flex flex-wrap gap-10 py-2">
          <Figure value="€7,172" of="Total wealth" />
          <Figure value="3,677" of="Points" />
          <Figure value="12" of="Workspaces" />
        </div>
      </Group>

      {/* ------------------------------------------------------- clusters --- */}
      <section className="flex flex-col gap-3">
        <SectionTitle>Shortcuts</SectionTitle>
        <QuickActions
          actions={[
            { id: "fraud", label: "Report fraud", icon: glyph("!"), onDo: nothing },
            { id: "card", label: "Lost card", icon: glyph("▭"), onDo: nothing },
            { id: "device", label: "Lost device", icon: glyph("▯"), onDo: nothing },
          ]}
        />
        <TileGrid
          tiles={[
            { id: "a", label: "Miles", icon: glyph("✈"), onOpen: nothing },
            { id: "b", label: "Stays", icon: glyph("⌂"), onOpen: nothing },
            { id: "c", label: "eSIM", icon: glyph("▤"), onOpen: nothing },
            { id: "d", label: "Shops", icon: glyph("⬡"), onOpen: nothing },
          ]}
        />
      </section>

      {/* --------------------------------------------------------- states --- */}
      <section className="flex flex-col gap-3">
        <SectionTitle>Nothing here</SectionTitle>
        <Nothing says="No active challenges yet" />
        <Nothing
          says="You are not in any workspace yet"
          offer={{ label: "Start a workspace", onDo: nothing }}
        />
      </section>

      {/* ---------------------------------------------------------- sheet --- */}
      <section className="flex flex-col gap-3">
        <SectionTitle>Sheet</SectionTitle>
        <Band bleed="flush">
          <Sheet title="Sign in to One" lead="We will email you a code — no password to lose">
            <Row><span className={TYPE.note}>A centred sheet is for a screen somebody arrives at</span></Row>
          </Sheet>
        </Band>
      </section>
    </Stack>
  );
}

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
import { Balance, Band, CopyRow, Figure, Group, Grid, Island, Money, NavRow, ActionRow,
  ToggleRow, FieldRow, NoteRow, OfferRow, PersonRow, AmountRow, QuickActions, SeeAll,
  StepRow, TileGrid, Nothing, RowRule, Row, SectionTitle, Stack, StickyAction, Title,
  TYPE, type Ambience } from "@quad/web";
import { Button } from "@heroui/react";
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

      {/* -------------------------------------------------------- balance --- */}
      <section className="flex flex-col gap-3">
        <SectionTitle>The one number</SectionTitle>
        <Balance
          eyebrow="Personal · EUR"
          figure={<Money amount={105170} />}
          identifier="DE29 1001 0178 4770 4207 58"
          under={
            <QuickActions
              actions={[
                { id: "add", label: "Add money", icon: glyph("+"), onDo: nothing },
                { id: "move", label: "Move", icon: glyph("⇄"), onDo: nothing },
                { id: "details", label: "Details", icon: glyph("▤"), onDo: nothing },
                { id: "more", label: "More", icon: glyph("…"), onDo: nothing },
              ]}
            />
          }
        />
      </section>

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

      {/* --------------------------------------------------- copy + notes --- */}
      <Group label="For local and international transfers">
        <CopyRow label="Beneficiary" value="Yamen Zakhour" onCopy={nothing} />
        <RowRule />
        <CopyRow label="IBAN" value="DE29 1001 0178 4770 4207 58" onCopy={nothing} />
        <RowRule />
        <CopyRow label="BIC / SWIFT code" value="REVODEB2" onCopy={nothing} />
        <RowRule />
        <NoteRow icon={glyph("⌂")}>
          Eligible deposits are protected up to a value of €100,000, or more in exceptions.
        </NoteRow>
        <NoteRow icon={glyph("◷")}>
          Local transfers can be instant or take up to two working days, depending on the sending bank.
        </NoteRow>
      </Group>

      {/* -------------------------------------------------- offers + steps --- */}
      <Group label="Discover more">
        <OfferRow
          icon={glyph("◍")}
          label="International transfer"
          under="Fast, secure and low cost"
          offer={{ label: "Send", onDo: nothing }}
        />
        <RowRule />
        <OfferRow
          icon={glyph("&")}
          label="Joint account"
          under="Manage money together"
          offer={{ label: "Open", onDo: nothing }}
        />
      </Group>

      <Group label="Before 25 August, your friends">
        <StepRow icon={glyph("⚭")} label="Sign up with your link" under="And verify their identity" />
        <StepRow icon={glyph("◎")} label="Add money to their account" under="By card or bank transfer" />
        <StepRow icon={glyph("▤")} label="Order a physical card" under="And add it to a wallet" />
      </Group>

      {/* ------------------------------------------------------ truncated --- */}
      <Group label="Upcoming payments">
        <AmountRow icon={glyph("◫")} label="REWE Pay" under="Recurring" amount="−€3.08" />
        <RowRule />
        <AmountRow icon={glyph("◫")} label="Db Vertrieb GmbH" under="Monthly, next on 17 August" amount="−€63.00" />
        <SeeAll onOpen={nothing} />
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

      {/* ----------------------------------------------------------- nav --- */}
      <section className="flex flex-col gap-3">
        <SectionTitle>Getting around</SectionTitle>
        <Island
          here="/"
          onGo={nothing}
          items={[
            { id: "home", label: "Home", icon: glyph("⌂"), route: "/" },
            { id: "work", label: "Work", icon: glyph("▤"), route: "/work" },
            { id: "pay", label: "Pay", icon: glyph("⇄"), route: "/pay" },
            { id: "you", label: "You", icon: glyph("◉"), route: "/you" },
          ]}
        />
        <StickyAction>
          <Button variant="primary" className="w-full" onPress={nothing}>Invite friends</Button>
        </StickyAction>
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

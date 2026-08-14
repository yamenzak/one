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
import { AppCrown, Balance, Band, CopyRow, Figure, Group, Grid, Island, Money, NavRow, ActionRow,
  ToggleRow, FieldRow, NoteRow, OfferRow, PersonRow, AmountRow, QuickActions, SeeAll,
  StepRow, TileGrid, Nothing, Row, SectionTitle, Stack, StickyAction, Title,
  TYPE, type Ambience } from "@quad/web";
import { Button } from "@heroui/react";
import { Sheet } from "../ui.js";
import { ArrowLeftRight, ChevronRight, CirclePlus, CircleUser, Clock, Coins, CreditCard, Ellipsis, EyeOff, FileText, Globe, House, Landmark, Link2, MessagesSquare, Package, PiggyBank, Plane, Plus, Smartphone, Trash2, TriangleAlert, Users } from "lucide-react";

const nothing = () => {};

/** ⚠️ Lucide, at ONE size set by the lead box — see `ICON` in metrics. A caller
    passing a size here is a caller who can get it wrong. */
const glyph = (icon: React.ReactNode) => icon;

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
                { id: "add", label: "Add money", icon: glyph(<Plus />), onDo: nothing },
                { id: "move", label: "Move", icon: glyph(<ArrowLeftRight />), onDo: nothing },
                { id: "details", label: "Details", icon: glyph(<FileText />), onDo: nothing },
                { id: "more", label: "More", icon: glyph(<Ellipsis />), onDo: nothing },
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
        <NavRow icon={glyph(<ChevronRight />)} label="Goes somewhere" onOpen={nothing} />
        <NavRow
          icon={glyph(<ChevronRight />)}
          label="Goes somewhere, explained"
          under="One line saying what is behind it"
          aside={<span className={TYPE.note}>3</span>}
          onOpen={nothing}
        />
        <ToggleRow
          icon={glyph(<EyeOff />)}
          label="Hide balances"
          under="Hide amounts for all balances and transactions"
          value={hide}
          onChange={setHide}
        />
        <ToggleRow
          icon={glyph(<MessagesSquare />)}
          label="Messaging with friends"
          under="Send and receive messages with other people here"
          value={flip}
          onChange={setFlip}
        />
        <FieldRow label="Residential address" value="Woldegker Str. 8A, 13059, Berlin" onEdit={nothing} />
        <FieldRow label="Tax residency" value="Germany" />
        <PersonRow name="Amir Al Tarsha" under="Sent you €2.69" when="Yesterday" unread={5} onOpen={nothing} />
        <AmountRow icon={glyph(<PiggyBank />)} label="Savings" under="Two accounts" amount="€6,003" onOpen={nothing} />
        <AmountRow icon={glyph(<Coins />)} label="Cash" amount="€1,169" />
        <ActionRow icon={glyph(<Trash2 />)} label="Close this workspace" tone="danger" onDo={nothing} />
      </Group>

      {/* --------------------------------------------------- copy + notes --- */}
      <Group label="For local and international transfers">
        <CopyRow label="Beneficiary" value="Yamen Zakhour" onCopy={nothing} />
        <CopyRow label="IBAN" value="DE29 1001 0178 4770 4207 58" onCopy={nothing} />
        <CopyRow label="BIC / SWIFT code" value="REVODEB2" onCopy={nothing} />
        <NoteRow icon={glyph(<House />)}>
          Eligible deposits are protected up to a value of €100,000, or more in exceptions.
        </NoteRow>
        <NoteRow icon={glyph(<Clock />)}>
          Local transfers can be instant or take up to two working days, depending on the sending bank.
        </NoteRow>
      </Group>

      {/* -------------------------------------------------- offers + steps --- */}
      <Group label="Discover more">
        <OfferRow
          icon={glyph(<Globe />)}
          label="International transfer"
          under="Fast, secure and low cost"
          offer={{ label: "Send", onDo: nothing }}
        />
        <OfferRow
          icon={glyph(<Users />)}
          label="Joint account"
          under="Manage money together"
          offer={{ label: "Open", onDo: nothing }}
        />
      </Group>

      <Group label="Before 25 August, your friends">
        <StepRow icon={glyph(<Link2 />)} label="Sign up with your link" under="And verify their identity" />
        <StepRow icon={glyph(<CirclePlus />)} label="Add money to their account" under="By card or bank transfer" />
        <StepRow icon={glyph(<FileText />)} label="Order a physical card" under="And add it to a wallet" />
      </Group>

      {/* ------------------------------------------------------ truncated --- */}
      <Group label="Upcoming payments">
        <AmountRow icon={glyph(<Landmark />)} label="REWE Pay" under="Recurring" amount="−€3.08" />
        <AmountRow icon={glyph(<Landmark />)} label="Db Vertrieb GmbH" under="Monthly, next on 17 August" amount="−€63.00" />
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
            { id: "fraud", label: "Report fraud", icon: glyph(<TriangleAlert />), onDo: nothing },
            { id: "card", label: "Lost card", icon: glyph(<CreditCard />), onDo: nothing },
            { id: "device", label: "Lost device", icon: glyph(<Smartphone />), onDo: nothing },
          ]}
        />
        <TileGrid
          tiles={[
            { id: "a", label: "Miles", icon: glyph(<Plane />), onOpen: nothing },
            { id: "b", label: "Stays", icon: glyph(<House />), onOpen: nothing },
            { id: "c", label: "eSIM", icon: glyph(<FileText />), onOpen: nothing },
            { id: "d", label: "Shops", icon: glyph(<Package />), onOpen: nothing },
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

      {/* --------------------------------------------------------- crown --- */}
      <section className="flex flex-col gap-3">
        <SectionTitle>The crown</SectionTitle>
        <p className={TYPE.note}>
          The face and search never move; the last two slots belong to the destination
        </p>
        {([
          ["Home", "▦", "▭"],
          ["Invest", "▦", "◍"],
          ["Payments", "▤", "+"],
          ["Points", "✦", "▭"],
        ] as const).map(([where, one, two]) => (
          <AppCrown
            key={where}
            face={glyph(<CircleUser />)}
            unread={where === "Home"}
            onOpenAccount={nothing}
            onSearch={nothing}
            searchLabel={`Search ${where.toLowerCase()}`}
            actions={[
              { id: "a", label: "First", icon: glyph(one), onDo: nothing },
              { id: "b", label: "Second", icon: glyph(two), onDo: nothing },
            ]}
          />
        ))}
      </section>

      {/* ----------------------------------------------------------- nav --- */}
      <section className="flex flex-col gap-3">
        <SectionTitle>Getting around</SectionTitle>
        <p className={TYPE.note}>
          Four here, five at most, and the labels go while you scroll
        </p>
        <Island
          here="/"
          onGo={nothing}
          items={[
            { id: "home", label: "Home", icon: glyph(<House />), route: "/" },
            { id: "work", label: "Work", icon: glyph(<FileText />), route: "/work" },
            { id: "pay", label: "Pay", icon: glyph(<ArrowLeftRight />), route: "/pay", unread: true },
            { id: "you", label: "You", icon: glyph(<CircleUser />), route: "/you" },
          ]}
        />
      </section>

      {/* --------------------------------------------------------- sticky --- */}
      <section className="flex flex-col gap-3">
        <SectionTitle>The one action</SectionTitle>
        <p className={TYPE.note}>
          A screen has an island or a pinned action, never both — they occupy one place
        </p>
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

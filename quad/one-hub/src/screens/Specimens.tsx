/**
 * WHOLE SCREENS, ASSEMBLED ONLY FROM THE VOCABULARY.
 *
 * ⚠️ THIS IS THE TEST THE CATALOGUE CANNOT BE. A gallery proves each piece
 * renders; it says nothing about whether a real screen can be built from them
 * without reaching for a `<div>` and a measurement. These five are deliberately
 * five different KINDS of product — a workshop, a library, a fleet, a clinic, a
 * classroom — because a vocabulary that only assembles the thing it was derived
 * from is a copy rather than a foundation.
 *
 * ⚠️ AND NOT ONE OF THEM CONTAINS A `max-w`, A GAP, A COLOUR OR A TYPE SIZE. If
 * a specimen ever needs one, the vocabulary is missing a piece and the right
 * move is to add it here rather than to reach around it — which is precisely
 * what this file exists to make visible.
 */

import { useState } from "react";
import {
  ActionRow, AmountRow, AppCrown, Balance, Band, CopyRow, Crown, Figure, Grid, Group,
  Island, Money, NavRow, Nothing, NoteRow, OfferRow, Page, PersonRow, Prose,
  QuickActions, Row, SeeAll, SectionTitle, Stack, StepRow, StickyAction,
  TileGrid, Title, ToggleRow, FieldRow, TYPE,
} from "@quad/web";
import { Button } from "@heroui/react";
import { ChartColumn, Check, CircleUser, Clock, CreditCard, Ellipsis, EyeOff, FileText, Globe, House, KeyRound, Landmark, LogIn, Mail, MessagesSquare, Package, PiggyBank, Plus, ReceiptText, Trash2, TriangleAlert } from "lucide-react";

const nothing = () => {};
/** ⚠️ Lucide, at ONE size set by the lead box — see `ICON` in metrics. */
const glyph = (icon: React.ReactNode) => icon;

/* ------------------------------------------------------------- a workshop --- */

/** A bike workshop's day. Balance hero doing duty as a workload figure. */
function Workshop() {
  return (
    <Page
      sky="drape"
      nav={<Island here="/" onGo={nothing}
        items={[
          { id: "today", label: "Today", icon: glyph(<House />), route: "/" },
          { id: "jobs", label: "Jobs", icon: glyph(<FileText />), route: "/jobs", unread: true },
          { id: "parts", label: "Parts", icon: glyph(<Package />), route: "/parts" },
          { id: "people", label: "People", icon: glyph(<CircleUser />), route: "/people" },
        ]} />}
    >
      <AppCrown
        face={glyph(<CircleUser />)}
        unread
        onOpenAccount={nothing}
        onSearch={nothing}
        searchLabel="Search jobs"
        actions={[
          { id: "cal", label: "Calendar", icon: glyph(<FileText />), onDo: nothing },
          { id: "new", label: "New job", icon: glyph(<Plus />), onDo: nothing },
        ]}
      />
      <Band width="work">
        <Stack space="roomy">
          <Balance
            eyebrow="Today · Bay 2"
            figure={<Money amount={148000} currency="£" />}
            identifier="9 jobs booked, 3 waiting on parts"
            under={
              <QuickActions
                actions={[
                  { id: "in", label: "Check in", icon: glyph(<LogIn />), onDo: nothing },
                  { id: "quote", label: "Quote", icon: glyph(<ReceiptText />), onDo: nothing },
                  { id: "parts", label: "Parts", icon: glyph(<Package />), onDo: nothing },
                  { id: "more", label: "More", icon: glyph(<Ellipsis />), onDo: nothing },
                ]}
              />
            }
          />

          <Group label="On the stands">
            <PersonRow name="Priya Raman" under="Ribble CGR · brake bleed" when="In 40m" unread={2} onOpen={nothing} />
            <PersonRow name="Tom Okafor" under="Brompton · full service" when="Today" onOpen={nothing} />
            <PersonRow name="Lena Fischer" under="Waiting on a rear mech" when="Thu" onOpen={nothing} />
            <SeeAll onOpen={nothing} />
          </Group>

          <Group label="Waiting to be paid">
            <AmountRow icon={glyph(<Landmark />)} label="Invoice 2043" under="Sent Monday" amount="£240.00" onOpen={nothing} />
            <AmountRow icon={glyph(<Landmark />)} label="Invoice 2041" under="Overdue by 6 days" amount="£85.00" onOpen={nothing} />
          </Group>

          <Group label="Worth a look">
            <OfferRow
              icon={glyph(<Globe />)}
              label="Online booking"
              under="Let people book a slot themselves"
              offer={{ label: "Turn on", onDo: nothing }}
            />
            <OfferRow
              icon={glyph(<ChartColumn />)}
              label="Parts supplier"
              under="Order without leaving a job"
              offer={{ label: "Connect", onDo: nothing }}
            />
          </Group>
        </Stack>
      </Band>
    </Page>
  );
}

/* ------------------------------------------------------------- a settings --- */

/** Every settings screen anybody has ever built, out of two components. */
function Settings() {
  const [quiet, setQuiet] = useState(true);
  const [share, setShare] = useState(false);
  const [digest, setDigest] = useState(true);

  return (
    <Page sky="veil">
      <Crown name="Ironworks Studio" under="Settings" width="read" />
      <Band>
        <Stack space="roomy">
          <Title under="What this workspace does without being asked">Automatic</Title>

          <Group>
            <ToggleRow
              icon={glyph(<EyeOff />)}
              label="Quiet hours"
              under="Hold notifications between 8pm and 8am"
              value={quiet}
              onChange={setQuiet}
            />
            <ToggleRow
              icon={glyph(<MessagesSquare />)}
              label="Weekly digest"
              under="One summary on Monday morning"
              value={digest}
              onChange={setDigest}
            />
            <ToggleRow
              icon={glyph(<Globe />)}
              label="Share anonymous usage"
              under="Helps us find what is slow"
              value={share}
              onChange={setShare}
            />
          </Group>

          <Group label="People" under="Who can do what in here">
            <NavRow icon={glyph(<CircleUser />)} label="Members" aside={<span className={TYPE.note}>12</span>} onOpen={nothing} />
            <NavRow icon={glyph(<KeyRound />)} label="Roles" under="Three custom roles" onOpen={nothing} />
            <NavRow icon={glyph(<Mail />)} label="Invitations" aside={<span className={TYPE.note}>2</span>} onOpen={nothing} />
          </Group>

          <Group label="This workspace">
            <FieldRow label="Name" value="Ironworks Studio" onEdit={nothing} />
            <FieldRow label="Address" value="ironworks.t.4dl.app" onEdit={nothing} />
            <FieldRow label="Where records are kept" value="European Union" />
            <ActionRow icon={glyph(<Trash2 />)} label="Close this workspace" tone="danger" onDo={nothing} />
          </Group>
        </Stack>
      </Band>
    </Page>
  );
}

/* --------------------------------------------------------------- a detail --- */

/** A reference screen: things to copy, and notes about them. */
function Detail() {
  return (
    <Page sky="plain">
      <Crown name="Kit list" under="Rig 4 · Loading bay" width="read" />
      <Band>
        <Stack space="roomy">
          <Title under="Everything a driver needs before they leave">Handover</Title>

          <Group label="For the depot">
            <CopyRow label="Vehicle" value="MAN TGX 26.510 · BX24 WKD" onCopy={nothing} />
            <CopyRow label="Seal number" value="EU-4471-8890-2213" onCopy={nothing} />
            <CopyRow label="Route reference" value="RTE-2026-0814-NW" onCopy={nothing} />
            <NoteRow icon={glyph(<Clock />)}>
              Seals are checked at both ends. If one is broken on arrival, photograph it before
              opening and the load is treated as disputed.
            </NoteRow>
            <NoteRow icon={glyph(<House />)}>
              Loads over 24 tonnes need a second signature at the gate.
            </NoteRow>
          </Group>

          <Group label="On the trailer">
            <AmountRow icon={glyph(<ChartColumn />)} label="Pallets" amount="18" />
            <AmountRow icon={glyph(<PiggyBank />)} label="Weight" amount="21.4 t" />
            <AmountRow icon={glyph(<EyeOff />)} label="Temperature" under="Held since 04:10" amount="2 °C" tone="success" />
          </Group>
        </Stack>
      </Band>
    </Page>
  );
}

/* ----------------------------------------------------------------- a flow --- */

/** Steps, and one unmistakable action. */
function Flow() {
  return (
    <Page sky="aurora">
      <Crown name="Greenhouse" under="New grower" width="read" ruled={false} />
      <Band>
        <Stack space="roomy">
          <Balance
            eyebrow="Takes about ten minutes"
            figure={<span className={TYPE.title}>Get your first bed planted</span>}
          />
          <Group label="Before you can plant">
            <StepRow icon={glyph(<CircleUser />)} label="Tell us your plot size" under="So spacing is worked out for you" />
            <StepRow icon={glyph(<EyeOff />)} label="Pick your last frost date" under="We will hold seedlings until then" />
            <StepRow icon={glyph(<Package />)} label="Choose what you grow" under="Twelve to start, change any time" />
            <StepRow icon={glyph(<Check />)} label="Confirm the bed" under="And we schedule the first watering" />
          </Group>
          <Prose>
            Nothing is ordered until you confirm. You can stop after any step and come back to
            exactly where you were.
          </Prose>
        </Stack>
      </Band>
      <StickyAction>
        <Button variant="primary" className="w-full" onPress={nothing}>Start planting</Button>
      </StickyAction>
    </Page>
  );
}

/* ---------------------------------------------------------------- a start --- */

/** A first run, and a dashboard that has nothing in it yet. */
function Start() {
  return (
    <Page
      sky="tide"
      nav={<Island here="/" onGo={nothing}
        items={[
          { id: "round", label: "Round", icon: glyph(<House />), route: "/" },
          { id: "ward", label: "Ward", icon: glyph(<CreditCard />), route: "/ward" },
          { id: "notes", label: "Notes", icon: glyph(<FileText />), route: "/notes", unread: true },
          { id: "team", label: "Team", icon: glyph(<CircleUser />), route: "/team" },
        ]} />}
    >
      <AppCrown
        face={glyph(<CircleUser />)}
        onOpenAccount={nothing}
        onSearch={nothing}
        searchLabel="Search the ward"
        actions={[
          { id: "chart", label: "Charts", icon: glyph(<ChartColumn />), onDo: nothing },
          { id: "add", label: "Admit", icon: glyph(<Plus />), onDo: nothing },
        ]}
      />
      <Band width="work">
        <Stack space="roomy">
          <Title under="Nothing has been recorded on this ward today">Morning round</Title>

          <Grid min="10rem">
            <Figure value="0" of="Seen" />
            <Figure value="14" of="On the ward" />
            <Figure value="3" of="Awaiting bloods" />
          </Grid>

          <Nothing
            says="No observations recorded yet"
            offer={{ label: "Start the round", onDo: nothing }}
          />

          <SectionTitle>Get set up</SectionTitle>
          <TileGrid
            tiles={[
              { id: "beds", label: "Beds", icon: glyph(<CreditCard />), onOpen: nothing },
              { id: "staff", label: "Staff", icon: glyph(<CircleUser />), onOpen: nothing },
              { id: "rounds", label: "Rounds", icon: glyph(<Clock />), onOpen: nothing },
              { id: "alerts", label: "Alerts", icon: glyph(<TriangleAlert />), onOpen: nothing },
            ]}
          />

          <Group label="While you are here">
            <OfferRow
              icon={glyph(<FileText />)}
              label="Import last night's handover"
              under="From the evening team"
              offer={{ label: "Import", onDo: nothing }}
            />
          </Group>
        </Stack>
      </Band>
    </Page>
  );
}

/* ------------------------------------------------------------------ picker --- */

export const SPECIMENS = {
  workshop: Workshop,
  settings: Settings,
  detail: Detail,
  flow: Flow,
  start: Start,
} as const;

export type SpecimenId = keyof typeof SPECIMENS;

export const SPECIMEN_IDS = Object.keys(SPECIMENS) as readonly SpecimenId[];

export function Specimen({ id }: { readonly id: SpecimenId }) {
  const One = SPECIMENS[id];
  return <One />;
}

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
  ActionRow, AmountRow,  Balance, Band, CopyRow, Crown, Figure, Grid, Group,
  Island, Money, NavRow, Nothing, NoteRow, OfferRow, Page, PersonRow, Prose,
  PeriodInput, type PeriodId,
  QuickActions, Row, SeeAll, Section, Spacer, Stack, StepRow, Cluster, Rail,
  Await, Trouble, Working, RowsWaiting, ChartWaiting, FigureWaiting, TilesWaiting, TextWaiting,
  waiting, ready, trouble, type Loaded,
  TileGrid, Title, ToggleRow, FieldRow, PageCrown, TYPE, Layout, Screen,
} from "@engine/design";
import {
  ChartPanel, ColumnChart, CompositionBar, DivergingChart, DonutChart, HeatmapChart, Hero,
  LineChart, Meter, Ring, Rings, StackedChart, Stat, StatRow,
} from "@engine/design";
import {
  Agree, Confirm, Crumbs, DateInput, Listing, Menu, MoneyInput, OneOf, PageTabs, Picks,
  SearchInput, Segmented, Steps, TextInput, Timeline, Tray, notice, type Col,
} from "@engine/design";
import { Button } from "@heroui/react";
import { PLATFORM_PROBLEMS, problem } from "@engine/kernel";
import { ChartColumn, Check, CircleUser, Clock, CreditCard, Ellipsis, EyeOff, FileText, Globe, House, KeyRound, Landmark, LogIn, Mail, MessagesSquare, Package, PiggyBank, Plus, ReceiptText, Trash2, TriangleAlert } from "lucide-react";

const nothing = () => {};
/** ⚠️ Lucide, at ONE size set by the lead box — see `ICON` in metrics. */
const glyph = (icon: React.ReactNode) => icon;

/* ------------------------------------------------------------- a workshop --- */

/** A bike workshop's day. Balance hero doing duty as a workload figure. */
function Workshop() {
  return (
    <Page
      sky="cloth"
      nav={<Island here="/" onGo={nothing}
        items={[
          { id: "today", label: "Today", icon: glyph(<House />), route: "/" },
          { id: "jobs", label: "Jobs", icon: glyph(<FileText />), route: "/jobs", unread: true },
          { id: "parts", label: "Parts", icon: glyph(<Package />), route: "/parts" },
          { id: "people", label: "People", icon: glyph(<CircleUser />), route: "/people" },
        ]} />}
    >
      <Crown
        who={{ name: "Amara Osei", onOpen: nothing }}
        
        find={{ label: "Search jobs", onOpen: nothing }}
        also={[{ id: "a", label: "Calendar", icon: glyph(<FileText />), onDo: nothing }]}
        does={{ label: "New job", icon: glyph(<Plus />), onDo: nothing }}
      />
      <Band width="work">
        <Stack space="roomy">
          <Balance
            eyebrow="Today · Bay 2"
            figure={<Money amount={148000} currency="£" count />}
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
    <Page sky="glow">
      <Crown name="Ironworks Studio" width="read" />
      <Band>
        <Stack space="roomy">
          {/* ⚠️ ONE TITLE, AND IT IS THE SCREEN. This had the crown saying
              "Settings" and the title saying "Automatic", which is two headers
              for one screen and neither of them its name — so the eye read the
              first card's heading as the page and everything after it as
              unrelated. The sections are `Group` labels, all of them. */}
          <Title>Settings</Title>

          <Group label="Automatic" under="What this workspace does without being asked">
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

/* --------------------------------------------------------------- the states --- */

/**
 * ⚠️ THE FOUR OUTCOMES, SIDE BY SIDE, WHICH IS THE ONLY WAY ANYBODY EVER SEES
 * THREE OF THEM. In development a request is instant and it succeeds, so
 * waiting, nothing and trouble are exactly the states that ship unlooked-at —
 * this specimen renders all four at once and cycles a real one, so a change to
 * any of them is visible the moment it is made rather than the first time
 * somebody's network drops.
 */
function States() {
  const [cycle, setCycle] = useState<0 | 1 | 2 | 3>(0);
  const rows = ["Priya Raman", "Tom Okafor", "Lena Fischer"];
  const live: Loaded<readonly string[]> =
    cycle === 0 ? waiting()
      : cycle === 1 ? ready([])
        : cycle === 2 ? trouble(problem(PLATFORM_PROBLEMS, "platform.unavailable", {}, { ref: "req_8f21c04" }))
          : ready(rows);

  return (
    <Page sky="glow">
      <PageCrown title="States" back={nothing} />
      <Band width="work">
        <Stack space="roomy">
          <Section label="One surface, cycled" under="The same component through all four">
            <Stack space="snug">
              <Cluster>
                {(["Waiting", "Nothing", "Trouble", "Ready"] as const).map((w, i) => (
                  <Button
                    key={w}
                    size="sm"
                    variant={cycle === i ? "primary" : "tertiary"}
                    onPress={() => setCycle(i as 0 | 1 | 2 | 3)}
                  >
                    {w}
                  </Button>
                ))}
              </Cluster>
              <Await
                of={live}
                waiting={<RowsWaiting rows={3} />}
                nothing={<Nothing says="No one on the stands yet" under="Bikes you check in will show up here" offer={{ label: "Check one in", onDo: nothing }} />}
                again={nothing}
                then={(names) => (
                  <Group>
                    {names.map((n) => (
                      <PersonRow key={n} name={n} under="Ribble CGR · brake bleed" when="Today" onOpen={nothing} />
                    ))}
                  </Group>
                )}
              />
            </Stack>
          </Section>

          <Section label="Every skeleton" under="Each is the geometry of the thing it stands in for">
            <Stack space="roomy">
              <Group label="Rows"><RowsWaiting rows={2} /></Group>
              <ChartPanel label="A chart"><ChartWaiting /></ChartPanel>
              <ChartPanel label="A figure"><FigureWaiting /></ChartPanel>
              <ChartPanel label="Tiles"><TilesWaiting /></ChartPanel>
              <ChartPanel label="Prose"><TextWaiting /></ChartPanel>
            </Stack>
          </Section>

          <Section label="Every refusal" under="The tone comes from the problem, never from the screen">
            <Stack space="snug">
              {(["platform.unavailable", "platform.forbidden", "platform.quota_reached"] as const).map((code) => (
                <Trouble key={code} problem={problem(PLATFORM_PROBLEMS, code, {}, { ref: "req_8f21c04" })} again={nothing} />
              ))}
              <Working says="Saving" />
            </Stack>
          </Section>

          <Section label="A rail" under="Sideways, snapping, and it shows the next one">
            <Rail>
              {rows.map((n) => (
                <ChartPanel key={n} label={n} under="Ribble CGR">
                  <FigureWaiting />
                </ChartPanel>
              ))}
            </Rail>
          </Section>
        </Stack>
      </Band>
    </Page>
  );
}

/* ----------------------------------------------------------- an inner page --- */

/**
 * ⚠️ THE SPECIMEN THAT ONLY MEANS ANYTHING IN MOTION. Everything else in this
 * file is judged from a screenshot; this one is about what the header DOES when
 * somebody scrolls — the page's name starts as the biggest thing on it and comes
 * back small beside the way out. A still frame of it looks like an ordinary
 * screen with a title, which is exactly the point: the chrome is only there when
 * it is needed and the rest of the time it is the page.
 */
function Inner() {
  const days = Array.from({ length: 31 }, (_, i) => i);
  const [period, setPeriod] = useState<PeriodId>("month");

  return (
    <Page sky="cloth">
      <PageCrown
        title="Analytics"
        back={nothing}
        under={
          <Row>
            <Button size="sm" variant="ghost" data-chrome="true" onPress={nothing}>Personal</Button>
            <Spacer />
          </Row>
        }
      />
      <Band width="work">
        <Stack space="roomy">
          <Group label="Where it went">
            {/* ⚠️ THE `aside` SLOT WAS DOCUMENTED AS "A RANGE PICKER, A FILTER"
                WHILE THE PRODUCT HAD NEITHER — so this screen answered it with a
                ghost button reading "This month" that did nothing, and the crown
                carried a "Date range" action wired to nothing beside it. */}
            <ChartPanel
              label="Spent"
              under="Against the same days last month"
              aside={(
                <PeriodInput
                  value={period}
                  today="2026-08-16"
                  onChange={(id) => setPeriod(id)}
                />
              )}
            >
              <LineChart
                describes="Spend by day this month against last month"
                series={[
                  {
                    id: "now", label: "This month", subject: true,
                    points: days.map((d) => ({ x: d, y: Math.round(120 + d * 21 + Math.sin(d / 3) * 60) })),
                  },
                  {
                    id: "was", label: "Last month",
                    points: days.map((d) => ({ x: d, y: Math.round(160 + d * 17) })),
                  },
                ]}
              />
            </ChartPanel>
          </Group>

          <Group label="Overview">
            <ChartPanel label="Total assets" under="£7,166 across three accounts">
              <CompositionBar
                describes="Total assets by account type"
                unit="£"
                data={[
                  { label: "Savings & Funds", value: 5_940 },
                  { label: "Cash", value: 1_226 },
                ]}
              />
            </ChartPanel>
          </Group>

          <Group label="Recent">
            <AmountRow icon={glyph(<Landmark />)} label="EDEKA" under="12 Aug, 19:32" amount="−£5.98" />
            <AmountRow icon={glyph(<CreditCard />)} label="Personal → Groceries" under="12 Aug, 12:11" amount="+£100.00" tone="success" />
            <AmountRow icon={glyph(<ReceiptText />)} label="Monthly plan" under="10 Aug, 09:00" amount="−£8.99" />
            <AmountRow icon={glyph(<Landmark />)} label="Shell" under="9 Aug, 17:44" amount="−£62.10" />
            <AmountRow icon={glyph(<Package />)} label="Parts order 8871" under="9 Aug, 11:02" amount="−£214.00" />
            <AmountRow icon={glyph(<Landmark />)} label="Deposit" under="8 Aug, 08:30" amount="+£1,400.00" tone="success" />
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
    <Layout sky="glow" frame={{ title: "Greenhouse" }}>
      <Screen
        shape="decision"
        under="New grower"
        does={{ label: "Start planting", onDo: nothing }}
      >
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
      </Screen>
    </Layout>
  );
}

/* ---------------------------------------------------------------- a start --- */

/** A first run, and a dashboard that has nothing in it yet. */
function Start() {
  return (
    <Page
      sky="glow"
      nav={<Island here="/" onGo={nothing}
        items={[
          { id: "round", label: "Round", icon: glyph(<House />), route: "/" },
          { id: "ward", label: "Ward", icon: glyph(<CreditCard />), route: "/ward" },
          { id: "notes", label: "Notes", icon: glyph(<FileText />), route: "/notes", unread: true },
          { id: "team", label: "Team", icon: glyph(<CircleUser />), route: "/team" },
        ]} />}
    >
      <Crown
        who={{ name: "Amara Osei", onOpen: nothing }}
        find={{ label: "Search the ward", onOpen: nothing }}
        also={[{ id: "a", label: "Charts", icon: glyph(<ChartColumn />), onDo: nothing }]}
        does={{ label: "Admit", icon: glyph(<Plus />), onDo: nothing }}
      />
      <Band width="work">
        <Stack space="roomy">
          <Title under="Nothing has been recorded on this ward today">Morning round</Title>

          <Grid min="6rem">
            <Figure value="0" of="Seen" />
            <Figure value="14" of="On the ward" />
            <Figure value="3" of="Awaiting bloods" />
          </Grid>

          <Nothing
            says="No observations recorded yet"
            offer={{ label: "Start the round", onDo: nothing }}
          />

          <Section label="Get set up">
            <TileGrid
              tiles={[
                { id: "beds", label: "Beds", icon: glyph(<CreditCard />), onOpen: nothing },
                { id: "staff", label: "Staff", icon: glyph(<CircleUser />), onOpen: nothing },
                { id: "rounds", label: "Rounds", icon: glyph(<Clock />), onOpen: nothing },
                { id: "alerts", label: "Alerts", icon: glyph(<TriangleAlert />), onOpen: nothing },
              ]}
            />
          </Section>

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

/* --------------------------------------------------------------- a report --- */

/**
 * ⚠️ A SCREEN MADE ENTIRELY OF THE CHART VOCABULARY, and it is the specimen that
 * matters most: a catalogue proves each form draws, while only a whole report
 * shows whether a stat tile, a hero, a meter and four charts can share one page
 * without any of them needing a measurement.
 */
function Report() {
  const days = Array.from({ length: 30 }, (_, i) => i);
  const spend = days.map((d) => ({
    x: d,
    /* A run with a gap in it, because a real series has one. */
    y: d === 17 ? null : Math.round(180 + d * 14 + Math.sin(d / 2.4) * 90),
  }));
  const forecast = days.map((d) => ({ x: d, y: d < 14 ? null : Math.round(340 + d * 15) }));

  return (
    <Page sky="glow">
      <Crown
        who={{ name: "Amara Osei", onOpen: nothing }}
        find={{ label: "Search reports", onOpen: nothing }}
        also={[{ id: "a", label: "Date range", icon: glyph(<Clock />), onDo: nothing }]}
        does={{ label: "Export", icon: glyph(<FileText />), onDo: nothing }}
      />
      <Band width="work">
        <Stack space="roomy">
          <Hero eyebrow="Spent this month" value={12914} unit="£" delta={{ value: 2140, of: "vs last" }} upIsGood={false} />

          <StatRow>
            <Stat label="Jobs booked" value={128} delta={{ value: 12, of: "vs last" }} trend={spend.slice(0, 12)} />
            <Stat label="Average job" value={101} unit="£" delta={{ value: -4, of: "vs last" }} />
            <Stat label="Awaiting parts" value={7} delta={{ value: 0, of: "vs last" }} />
          </StatRow>

          <Group label="Where it went">
            <ChartPanel label="Spend by day" under="This month against the forecast">
              <LineChart
                describes="Spend by day, this month against the forecast"
                series={[
                  { id: "actual", label: "Actual", points: spend, subject: true },
                  { id: "forecast", label: "Forecast", points: forecast },
                ]}
              />
            </ChartPanel>
          </Group>

          <Group label="By bay">
            <ChartPanel label="Hours logged" under="Bay 2 is the one to look at">
              <ColumnChart
                describes="Hours logged by bay"
                subject={1}
                data={[
                  { label: "Bay 1", value: 62 }, { label: "Bay 2", value: 104 },
                  { label: "Bay 3", value: 71 }, { label: "Bay 4", value: 44 },
                ]}
              />
            </ChartPanel>
          </Group>

          <Group label="Against last month">
            <ChartPanel label="Change by category">
              <DivergingChart
                describes="Change by category against last month"
                data={[
                  { label: "Parts", value: 340 }, { label: "Labour", value: -120 },
                  { label: "Tyres", value: 90 }, { label: "Fluids", value: -40 },
                ]}
              />
            </ChartPanel>
          </Group>

          <Group label="What it is made of">
            <ChartPanel label="Revenue by line" under="Four weeks">
              <StackedChart
                describes="Revenue by line over four weeks"
                groups={["W1", "W2", "W3", "W4"]}
                series={[
                  { id: "parts", label: "Parts", values: [12, 15, 11, 18] },
                  { id: "labour", label: "Labour", values: [22, 20, 26, 24] },
                  { id: "other", label: "Other", values: [4, 6, 5, 7] },
                ]}
              />
            </ChartPanel>
          </Group>

          <Group label="Busiest hours">
            <ChartPanel label="Jobs by day and hour">
              <HeatmapChart
                describes="Jobs by day and hour"
                rows={["Mon", "Tue", "Wed", "Thu", "Fri"]}
                columns={["8", "10", "12", "14", "16", "18"]}
                values={[
                  [1, 4, 6, 5, 3, 1], [2, 5, 7, 6, 4, 2], [1, 3, 8, 7, 5, 1],
                  [3, 6, 9, 8, 4, 2], [2, 4, 5, null, 2, 1],
                ]}
              />
            </ChartPanel>
          </Group>

          <Group label="Where you stand">
            <ChartPanel label="This month's allowances">
              <Stack space="snug">
                <Meter label="Parts budget" value={4200} limit={5000} unit="£" />
                <Meter label="Bay hours" value={281} limit={300} suffix="h" />
                <Meter label="Storage" value={12} limit={50} suffix="GB" />
              </Stack>
            </ChartPanel>
          </Group>

          {/* ⚠️ THE COMPOSITION BAR SITS ABOVE THE DONUT ON PURPOSE. The two
              answer the same question and this one answers it better, so the
              specimen reads in the order the vocabulary wants to be reached for. */}
          <Group label="What the money is">
            <ChartPanel label="Where it sits" under="Across every account">
              <CompositionBar
                describes="Balance by account type"
                unit="£"
                data={[
                  { label: "Operating", value: 42_800 },
                  { label: "Reserve", value: 18_200 },
                  { label: "Tax set aside", value: 9_400 },
                ]}
              />
            </ChartPanel>
          </Group>

          <Group label="The same, round">
            <Grid min="14rem">
              <ChartPanel label="Spend by category">
                <DonutChart
                  describes="Spend by category this month"
                  unit="£"
                  data={[
                    { label: "Parts", value: 5_400 }, { label: "Wages", value: 4_100 },
                    { label: "Rent", value: 1_800 }, { label: "Fuel", value: 900 },
                    { label: "Insurance", value: 480 }, { label: "Software", value: 234 },
                  ]}
                />
              </ChartPanel>
              <ChartPanel label="Bay utilisation">
                <Ring label="Bay 2" value={281} limit={300} suffix="h" />
              </ChartPanel>
              <ChartPanel label="Three targets">
                <Rings
                  describes="Progress against this month's three targets"
                  items={[
                    { id: "rev", label: "Revenue", value: 12_914, limit: 15_000 },
                    { id: "jobs", label: "Jobs", value: 128, limit: 140 },
                    { id: "nps", label: "Reviews", value: 41, limit: 60 },
                  ]}
                />
              </ChartPanel>
            </Grid>
          </Group>
        </Stack>
      </Band>
    </Page>
  );
}

/* ------------------------------------------------------------ a backoffice --- */

interface Livery {
  readonly id: string;
  readonly horse: string;
  readonly owner: string;
  readonly due: string;
  readonly days: number;
  readonly amount: number;
}

const LIVERIES: readonly Livery[] = [
  { id: "L-118", horse: "Biscuit", owner: "Priya Raman", due: "12 Aug", days: 2, amount: 42000 },
  { id: "L-117", horse: "Comet", owner: "Tom Okafor", due: "11 Aug", days: 3, amount: 38500 },
  { id: "L-116", horse: "Nutmeg", owner: "Lena Fischer", due: "8 Aug", days: 6, amount: 51000 },
  { id: "L-115", horse: "Atlas", owner: "Amir Al Tarsha", due: "7 Aug", days: 7, amount: 42000 },
  { id: "L-114", horse: "Willow", owner: "Jonas Weber", due: "4 Aug", days: 10, amount: 61200 },
  { id: "L-113", horse: "Pepper", owner: "Sofia Marino", due: "1 Aug", days: 13, amount: 38500 },
];

const stableEuros = (minor: number) =>
  `€${(minor / 100).toLocaleString("en", { minimumFractionDigits: 2 })}`;

/**
 * A stables' billing desk — the DATA-SHAPED layout: crumbs over a title, a
 * filter row, a sortable listing, and the second tier behind a menu. The kind
 * of screen an operator lives in, which is why it stays `plain`.
 */
function Backoffice() {
  const [view, setView] = useState("open");
  const [q, setQ] = useState("");

  const cols: readonly Col<Livery>[] = [
    { id: "horse", label: "Horse", cell: (r) => r.horse, by: (a, b) => a.horse.localeCompare(b.horse) },
    { id: "owner", label: "Owner", cell: (r) => r.owner, by: (a, b) => a.owner.localeCompare(b.owner) },
    { id: "due", label: "Due", cell: (r) => r.due },
    { id: "days", label: "Days over", numeric: true, cell: (r) => r.days, by: (a, b) => a.days - b.days },
    { id: "amount", label: "Amount", numeric: true, cell: (r) => stableEuros(r.amount), by: (a, b) => a.amount - b.amount },
  ];

  const shown = LIVERIES.filter((r) =>
    q === "" || `${r.horse} ${r.owner}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <Page>
      <PageCrown
        title="Billing"
        back={nothing}
        also={[{
          id: "new", label: "New invoice", icon: glyph(<Plus />), onDo: nothing,
        }]}
      />
      <Band width="work">
        <Stack space="roomy">
          <Crumbs trail={[
            { label: "Aldergate Stables", onGo: nothing },
            { label: "Money", onGo: nothing },
            { label: "Billing" },
          ]} />

          <Cluster space="tight">
            <Segmented label="Which invoices" value={view} onChange={setView} options={[
              { id: "open", label: "Open" }, { id: "paid", label: "Paid" }, { id: "all", label: "All" },
            ]} />
            <SearchInput label="Search invoices" value={q} onChange={setQ} placeholder="Horse or owner" />
            <Menu
              trigger={<Button variant="tertiary">More…</Button>}
              items={[
                { id: "export", label: "Export month", onDo: nothing },
                { id: "remind", label: "Send reminders", onDo: nothing },
                { id: "void", label: "Void selected", tone: "danger", onDo: nothing },
              ]}
            />
          </Cluster>

          <Listing
            label="Open liveries"
            of={ready(shown)}
            cols={cols}
            rowKey={(r) => r.id}
            onOpen={nothing}
            pageSize={5}
            says={{ nothing: "Nothing matches", under: "Try the owner's name" }}
          />

          <Group label="Longest overdue">
            <AmountRow icon={glyph(<Landmark />)} label="Pepper · Sofia Marino" under="13 days over" amount="€385.00" onOpen={nothing} />
            <AmountRow icon={glyph(<Landmark />)} label="Willow · Jonas Weber" under="10 days over" amount="€612.00" onOpen={nothing} />
          </Group>

          <Cluster space="tight">
            <Tray
              trigger={<Button variant="secondary">Record a payment</Button>}
              title="Record a payment"
              actions={<Button variant="primary" className="w-full" onPress={() => notice.ok("Payment recorded")}>Record</Button>}
            >
              <Stack space="roomy">
                <MoneyInput label="Amount" value={385} onChange={nothing} currency="EUR" />
                <DateInput label="Received on" onChange={nothing} />
              </Stack>
            </Tray>
            <Confirm
              trigger={<Button variant="tertiary">Void an invoice</Button>}
              title="Void invoice L-113?"
              act={{ label: "Void invoice", onDo: () => notice.warn("Invoice voided") }}
            >
              <span className={TYPE.body}>The livery stays; the charge is written off and audited.</span>
            </Confirm>
          </Cluster>
        </Stack>
      </Band>
    </Page>
  );
}

/* --------------------------------------------------------------- an enroll --- */

/**
 * A wizard mid-flight — `Steps` above, one question per group, the whole form
 * vocabulary doing its ordinary work, and the one action pinned. `focus`
 * because the screen IS one task.
 */
function Enroll() {
  const [name, setName] = useState("");
  const [level, setLevel] = useState<string | null>(null);
  /* ⚠️ A CHOSEN-nothing is a fact a form may legitimately start from — but the
     specimen preselects, both to show the state and to keep the seeded-`[]`
     shape out of a file people copy from. */
  const [days, setDays] = useState<readonly string[]>(["tue", "thu"]);
  const [rate, setRate] = useState<number | undefined>(60);
  const [ok, setOk] = useState<boolean | undefined>(false);

  return (
    /* ⚠️ A `Screen`, NOT A HAND-BUILT PAGE. This wrapped its own `StickyAction`
       around its own button — which is how the dock came to exist twice. What a
       screen declares is the ACT; where it lands at each size is the frame's. */
    <Layout sky="glow" frame={{ title: "New client", back: nothing }}>
      <Screen
        shape="form"
        does={{ label: "Continue to package", onDo: nothing }}
      >
        <Stack space="roomy">
          <Steps
            at="detail"
            steps={[
              { id: "who", label: "Who" },
              { id: "detail", label: "Training" },
              { id: "plan", label: "Package" },
              { id: "done", label: "Confirm" },
            ]}
          />

          <TextInput label="Their name" value={name} onChange={setName} help="How the coach will see them" />

          <OneOf label="Where are they starting from?" value={level} onChange={setLevel} options={[
            { id: "new", label: "New to training", help: "First structured programme" },
            { id: "keen", label: "Trains already", help: "Knows the movements" },
            { id: "sharp", label: "Competitive", help: "Programming toward a meet" },
          ]} />

          <Picks label="Days they can train" value={days} onChange={setDays} options={[
            { id: "mon", label: "Monday" }, { id: "tue", label: "Tuesday" },
            { id: "wed", label: "Wednesday" }, { id: "thu", label: "Thursday" },
            { id: "fri", label: "Friday" }, { id: "sat", label: "Saturday" },
          ]} />

          <MoneyInput label="Session rate" value={rate} onChange={setRate} currency="EUR" min={0}
            help="What this client pays per session" />

          <DateInput label="First session" onChange={nothing} />

          <Agree label="Send them an invite email now" value={ok} onChange={setOk} />

          <Timeline moments={[
            { id: "a", when: "After you confirm", label: "They get an email", under: "A code, no password" },
            { id: "b", when: "First sign-in", label: "They finish their own intake", under: "Injuries, preferences, schedule" },
          ]} />
        </Stack>
      </Screen>
    </Layout>
  );
}

/* ------------------------------------------------------------------ picker --- */

export const SPECIMENS = {
  workshop: Workshop,
  settings: Settings,
  states: States,
  inner: Inner,
  detail: Detail,
  flow: Flow,
  start: Start,
  report: Report,
  backoffice: Backoffice,
  enroll: Enroll,
} as const;

export type SpecimenId = keyof typeof SPECIMENS;

export const SPECIMEN_IDS = Object.keys(SPECIMENS) as readonly SpecimenId[];

export function Specimen({ id }: { readonly id: SpecimenId }) {
  const One = SPECIMENS[id];
  return <One />;
}

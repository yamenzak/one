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
import { Balance, Band, Crown, CopyRow, Figure, Group, Grid, Island, Money, NavRow, ActionRow,
  ToggleRow, FieldRow, NoteRow, OfferRow, PersonRow, AmountRow, QuickActions, SeeAll,
  StepRow, TileGrid, Nothing, Row, Section, Stack, Title, Cluster, SPACE,
  TYPE, type Sky } from "@engine/design";
import {
  Agree, Choice, CodeEntry, Confirm, Crumbs, DateInput, Dialog, Faq, FormWaiting, Gauge, Hotkey, Listing,
  LongText, Lookup, Menu, MoneyInput, NumberInput, OneOf, PageTabs, Peek, Picks, Reveal,
  SearchInput, SecretInput, Segmented, Dial, Steps, Tags, TextInput, Timeline, TimeInput,
  Tray, notice, ready, trouble, waiting, type Col, type Loaded,
} from "@engine/design";
import { Button } from "@heroui/react";
import { CODE_DIGITS, PLATFORM_PROBLEMS, problem } from "@engine/kernel";
import { Sheet } from "../ui.js";
import { ArrowLeftRight, ChevronRight, CirclePlus, CircleUser, Clock, Coins, CreditCard, Ellipsis, EyeOff, FileText, Globe, House, Landmark, Link2, MessagesSquare, Package, PiggyBank, Plane, Plus, Smartphone, Trash2, TriangleAlert, Users } from "lucide-react";

const nothing = () => {};

/** ⚠️ Lucide, at ONE size set by the lead box — see `ICON` in metrics. A caller
    passing a size here is a caller who can get it wrong. */
const glyph = (icon: React.ReactNode) => icon;

/* ⚠️ EVERY FAMILY A SCREEN MAY NAME, and it is the whole list now rather than
   six of twenty-four. Each is a material; which world you get inside it is the
   seed, so the gallery shows one specimen of each rather than a catalogue. */
const SKIES: readonly Sky[] = ["glow", "cloth", "etch", "loops", "blobs"];

/* --------------------------------------------------------------- the forms --- */

/**
 * ⚠️ EVERY CONTROL, AND EVERY STATE BESIDE IT. The error and disabled variants
 * are not decoration — they are the two states nobody sees while building,
 * which is exactly why they sit permanently on this page.
 */
function FormsDemo() {
  const [name, setName] = useState("Amara Osei");
  const [iban, setIban] = useState("");
  const [about, setAbout] = useState("");
  const [rate, setRate] = useState<number | undefined>(85);
  const [plan, setPlan] = useState<string | null>("light");
  const [coach, setCoach] = useState<string | null>(null);
  const [days, setDays] = useState<readonly string[]>(["tue", "thu"]);
  const [level, setLevel] = useState<string | null>("keen");
  const [effort, setEffort] = useState<number | undefined>(7);
  const [view, setView] = useState("month");
  const [tags, setTags] = useState<readonly { id: string; label: string }[]>([
    { id: "a", label: "strength" }, { id: "b", label: "morning" }, { id: "c", label: "online" },
  ]);
  const [q, setQ] = useState("");
  const [code, setCode] = useState("");
  const [ok, setOk] = useState<boolean | undefined>(false);

  const coaches = [
    { id: "amara", label: "Amara Osei" },
    { id: "tom", label: "Tom Okafor", help: "Weekends only" },
    { id: "lena", label: "Lena Fischer" },
  ];

  return (
    <Stack space="roomy">
      <Section label="Asking">
        <p className={TYPE.note}>
          One grammar — label, help, error, disabled — worn by every control
        </p>
      </Section>
      <Grid min="16rem">
        <TextInput label="Full name" value={name} onChange={setName} help="As it appears on invoices" />
        <TextInput
          label="IBAN" value={iban} onChange={setIban} kind="text"
          error={iban.length > 0 && iban.length < 15 ? "That is too short to be an IBAN." : undefined}
          placeholder="DE29 1001…"
        />
        <SecretInput label="API key" set onChange={nothing} help="Stored keys are never shown back" />
        <MoneyInput label="Hourly rate" value={rate} onChange={setRate} currency="EUR" min={0} />
        <NumberInput label="Sessions a week" value={3} onChange={nothing} min={1} max={14} />
        <DateInput label="Starts on" onChange={nothing} />
        <TimeInput label="Usual time" onChange={nothing} />
        <Choice label="Plan" value={plan} onChange={setPlan} options={[
          { id: "solo", label: "Starter" }, { id: "light", label: "Light" },
          { id: "pro", label: "Pro", help: "Everything, most people" },
        ]} />
        <Lookup label="Coach" value={coach} onChange={setCoach} options={coaches} />
        <TextInput label="Locked while syncing" value="—" onChange={nothing} disabled />
      </Grid>
      <Grid min="16rem">
        <OneOf label="How do they train?" value={level} onChange={setLevel} options={[
          { id: "new", label: "New to it", help: "First programme" },
          { id: "keen", label: "Regular", help: "Knows the movements" },
          { id: "sharp", label: "Competitive", help: "Programs for a meet" },
        ]} />
        <Picks label="Training days" value={days} onChange={setDays} options={[
          { id: "mon", label: "Monday" }, { id: "tue", label: "Tuesday" },
          { id: "wed", label: "Wednesday" }, { id: "thu", label: "Thursday" },
          { id: "fri", label: "Friday" },
        ]} />
        <Stack space="roomy">
          <Dial label="Effort ceiling" value={effort} onChange={setEffort} min={1} max={10} />
          <Segmented label="Period" value={view} onChange={setView} options={[
            { id: "week", label: "Week" }, { id: "month", label: "Month" }, { id: "year", label: "Year" },
          ]} />
          <Tags label="Labels" items={tags} onRemove={(id) => setTags(tags.filter((t) => t.id !== id))} />
          <SearchInput label="Search exercises" value={q} onChange={setQ} />
          {/* ⚠️ SIX HERE BECAUSE THE SERVER SAYS SIX. The boxes are counted from
              the number, not written out — see `CodeEntry`. */}
          <CodeEntry digits={CODE_DIGITS} value={code} onChange={setCode} />
          <Agree label="Email me a weekly summary" value={ok} onChange={setOk} />
          <LongText label="Anything else?" value={about} onChange={setAbout} placeholder="Injuries, preferences, schedule…" />
        </Stack>
      </Grid>
      <Section label="A form, before it knows anything">
        <FormWaiting fields={2} />
      </Section>
    </Stack>
  );
}

/* --------------------------------------------------------------- the table --- */

interface Invoice {
  readonly id: string;
  readonly who: string;
  readonly sent: string;
  readonly days: number;
  readonly amount: number;
}

const INVOICES: readonly Invoice[] = [
  { id: "2051", who: "Priya Raman", sent: "12 Aug", days: 2, amount: 24000 },
  { id: "2050", who: "Tom Okafor", sent: "11 Aug", days: 3, amount: 8500 },
  { id: "2049", who: "Lena Fischer", sent: "8 Aug", days: 6, amount: 132000 },
  { id: "2048", who: "Amir Al Tarsha", sent: "7 Aug", days: 7, amount: 4500 },
  { id: "2047", who: "Jonas Weber", sent: "4 Aug", days: 10, amount: 61200 },
  { id: "2046", who: "Sofia Marino", sent: "1 Aug", days: 13, amount: 20000 },
  { id: "2045", who: "Priya Raman", sent: "28 Jul", days: 17, amount: 24000 },
];

const euros = (minor: number) =>
  `€${(minor / 100).toLocaleString("en", { minimumFractionDigits: 2 })}`;

const INVOICE_COLS: readonly Col<Invoice>[] = [
  { id: "who", label: "Customer", cell: (r) => r.who, by: (a, b) => a.who.localeCompare(b.who) },
  { id: "sent", label: "Sent", cell: (r) => r.sent },
  { id: "days", label: "Days open", numeric: true, cell: (r) => r.days, by: (a, b) => a.days - b.days },
  { id: "amount", label: "Amount", numeric: true, cell: (r) => euros(r.amount), by: (a, b) => a.amount - b.amount },
];

function TableDemo() {
  const [rows] = useState<Loaded<readonly Invoice[]>>(ready(INVOICES));
  return (
    <Stack space="roomy">
      <Section label="Rows and columns">
        <p className={TYPE.note}>
          Sortable where a column says how; numbers right, on tabular figures; pages only past the page size
        </p>
      </Section>
      <Listing
        label="Unpaid invoices"
        of={rows}
        cols={INVOICE_COLS}
        rowKey={(r) => r.id}
        onOpen={nothing}
        pageSize={5}
      />
      <Section label="The same surface, before and without">
        <Grid min="16rem">
          <Listing label="Loading" of={waiting<readonly Invoice[]>()} cols={INVOICE_COLS} rowKey={(r) => r.id} pageSize={4} />
          <Stack space="roomy">
            <Listing
              label="Empty"
              of={ready<readonly Invoice[]>([])}
              cols={INVOICE_COLS}
              rowKey={(r) => r.id}
              says={{ nothing: "Nothing unpaid", under: "Invoices land here the moment they are sent" }}
            />
            <Listing
              label="Failed"
              of={trouble<readonly Invoice[]>(problem(PLATFORM_PROBLEMS, "platform.unavailable", {}, { ref: "req_8f21c04" }))}
              cols={INVOICE_COLS}
              rowKey={(r) => r.id}
              again={nothing}
            />
          </Stack>
        </Grid>
      </Section>
    </Stack>
  );
}

/* ------------------------------------------------------------ interruptions --- */

function OverlayDemo() {
  return (
    <Stack space="roomy">
      <Section label="Interruptions">
        <p className={TYPE.note}>
          A tray for a task, a dialog for a moment, a confirm for the irreversible, a menu for the second tier
        </p>
      </Section>
      <Cluster space="tight">
        <Tray
          trigger={<Button variant="secondary">Open a tray</Button>}
          title="Share this plan"
          actions={<Button variant="primary" className="w-full" onPress={nothing}>Send</Button>}
        >
          <p className={TYPE.body}>The screen behind is still the subject; this is a task inside it.</p>
        </Tray>
        <Dialog
          trigger={<Button variant="secondary">Open a dialog</Button>}
          title="Rename workspace"
          actions={<Button variant="primary" onPress={nothing}>Save</Button>}
        >
          <p className={TYPE.body}>A moment of its own — the screen behind stops mattering until this is done.</p>
        </Dialog>
        <Confirm
          trigger={<Button variant="danger">Delete something</Button>}
          title="Delete this plan?"
          act={{ label: "Delete plan", onDo: () => notice.ok("Plan deleted") }}
        >
          <p className={TYPE.body}>Every session logged against it stays with the client.</p>
        </Confirm>
        <Menu
          trigger={<Button variant="tertiary" aria-label="More">More…</Button>}
          items={[
            { id: "rename", label: "Rename", onDo: nothing },
            { id: "copy", label: "Duplicate", onDo: nothing },
            { id: "delete", label: "Delete", tone: "danger", onDo: nothing },
          ]}
        />
        <Peek trigger={<Button variant="tertiary">What is this?</Button>} title="Grandfathering">
          <p className={TYPE.note}>A plan edited down holds existing customers at what they were sold.</p>
        </Peek>
      </Cluster>
      <Cluster space="tight">
        <Button variant="tertiary" onPress={() => notice.ok("Saved")}>Notice: ok</Button>
        <Button variant="tertiary" onPress={() => notice.warn("Saved, but the email bounced")}>Notice: warn</Button>
        <Button variant="tertiary" onPress={() => notice.fail("That did not save")}>Notice: fail</Button>
      </Cluster>
    </Stack>
  );
}

/* ----------------------------------------------------------------- blocks --- */

function BlocksDemo() {
  const [tab, setTab] = useState("plan");
  return (
    <Stack space="roomy">
      <Section label="Blocks">
        <p className={TYPE.note}>
          Bigger than a control, smaller than a screen — the shapes every product redraws
        </p>
      </Section>
      <Steps
        at="detail"
        steps={[
          { id: "who", label: "Who" }, { id: "detail", label: "Details" },
          { id: "plan", label: "Plan" }, { id: "done", label: "Confirm" },
        ]}
      />
      <Crumbs trail={[
        { label: "Studios", onGo: nothing }, { label: "Kreuzberg", onGo: nothing }, { label: "Coaches" },
      ]} />
      <PageTabs
        label="Client"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "plan", label: "Plan", content: <p className={TYPE.body}>The active programme, week by week.</p> },
          { id: "progress", label: "Progress", content: <p className={TYPE.body}>Lifts, weight, wellness.</p> },
          { id: "notes", label: "Notes", content: <p className={TYPE.body}>Everything the coach wrote down.</p> },
        ]}
      />
      <Grid min="16rem">
        <Timeline moments={[
          { id: "a", when: "Today, 9:12", label: "Checked in", under: "Weight and sleep logged" },
          { id: "b", when: "Yesterday", label: "Session 14 of 24", under: "Lower body — all sets done" },
          { id: "c", when: "Monday", label: "Plan updated", under: "Deload week added" },
        ]} />
        <Stack space="roomy">
          <Gauge value={62} label="Storage" note="31 GB of 50 used" />
          <Row>
            <span className={TYPE.body}>Quick add</span>
            <Hotkey keys={["cmd", "K"]} />
          </Row>
          <Reveal label="What counts as a session?">
            <p className={TYPE.note}>Anything logged against a plan day — even a partial one.</p>
          </Reveal>
        </Stack>
      </Grid>
      <Faq items={[
        { id: "a", q: "Can a client have two coaches?", a: <p className={TYPE.note}>Yes — both see the same record, scoped by assignment.</p> },
        { id: "b", q: "What happens when a package lapses?", a: <p className={TYPE.note}>The studio's own ladder decides: read-only, blocked, archive or delete.</p> },
      ]} />
    </Stack>
  );
}

export function Gallery() {
  const [hide, setHide] = useState(false);
  const [flip, setFlip] = useState(true);

  return (
    <Stack space="airy">
      <Title under="Every piece a screen is assembled from">The vocabulary</Title>

      {/* -------------------------------------------------------- balance --- */}
      <section className={`flex flex-col ${SPACE.snug}`}>
        <Section label="The one number">
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
        </Section>
      </section>

      {/* ------------------------------------------------------- ambience --- */}
      <section className={`flex flex-col ${SPACE.snug}`}>
        <Section label="Ambience">
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
        </Section>
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
        <Cluster space="airy">
          <Figure value="€7,172" of="Total wealth" />
          <Figure value="3,677" of="Points" />
          <Figure value="12" of="Workspaces" />
        </Cluster>
      </Group>

      {/* ------------------------------------------------------- clusters --- */}
      <section className={`flex flex-col ${SPACE.snug}`}>
        <Section label="Shortcuts">
          <QuickActions
            actions={[
              { id: "fraud", label: "Report fraud", icon: glyph(<TriangleAlert />), onDo: nothing },
              { id: "card", label: "Lost card", icon: glyph(<CreditCard />), onDo: nothing },
              { id: "device", label: "Lost device", icon: glyph(<Smartphone />), onDo: nothing },
            ]}
          />
        </Section>
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
      <section className={`flex flex-col ${SPACE.snug}`}>
        <Section label="Nothing here">
          <Nothing says="No active challenges yet" />
        </Section>
        <Nothing
          says="You are not in any workspace yet"
          offer={{ label: "Start a workspace", onDo: nothing }}
        />
      </section>

      {/* --------------------------------------------------------- crown --- */}
      <section className={`flex flex-col ${SPACE.snug}`}>
        <Section label="The crown">
          <p className={TYPE.note}>
            The face and search never move; the last two slots belong to the destination
          </p>
        </Section>
        {([
          ["Home", "▦", "▭"],
          ["Invest", "▦", "◍"],
          ["Payments", "▤", "+"],
          ["Points", "✦", "▭"],
        ] as const).map(([where, one, two]) => (
          <Crown
            key={where}
            who={{ name: "Amara Osei", onOpen: nothing, unread: where === "Home" }}
            find={{ label: `Search ${where.toLowerCase()}`, onOpen: nothing }}
            also={[{ id: "a", label: "First", icon: glyph(one), onDo: nothing }]}
            does={{ label: "Second", icon: glyph(two), onDo: nothing }}
          />
        ))}
      </section>

      {/* ----------------------------------------------------------- nav --- */}
      <section className={`flex flex-col ${SPACE.snug}`}>
        <Section label="Getting around">
          <p className={TYPE.note}>
            Four here, five at most, and the labels go while you scroll
          </p>
        </Section>
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

      {/* ---------------------------------------------------------- sheet --- */}
      <section className={`flex flex-col ${SPACE.snug}`}>
        <Section label="Sheet">
          <Band bleed="flush">
            <Sheet title="Sign in to One" lead="We will email you a code — no password to lose">
              <Row><span className={TYPE.note}>A centred sheet is for a screen somebody arrives at</span></Row>
            </Sheet>
          </Band>
        </Section>
      </section>

      {/* ---------------------------------------------------------- forms --- */}
      <FormsDemo />

      {/* --------------------------------------------------------- tables --- */}
      <TableDemo />

      {/* ------------------------------------------------------- overlays --- */}
      <OverlayDemo />

      {/* --------------------------------------------------------- blocks --- */}
      <BlocksDemo />
    </Stack>
  );
}

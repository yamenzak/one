/**
 * RIDGELINE — a whole product, built only from the language.
 *
 * ⚠️ NOT SHIPPED CODE, AND NOTHING IN `src` MAY IMPORT IT. Every screen below is
 * assembled from `@one/ui`'s real components and rendered through `@one/ui`'s
 * real stylesheet, so a defect in the picture is a defect in the product.
 *
 * ⚠️ IT IS A PRODUCT AND NOT A GRID, AND THAT IS THE WHOLE POINT OF IT. A
 * specimen board answers "does this component exist"; it cannot answer the
 * questions that have actually gone wrong here — whether a page-level action
 * lands beside its title or under it, whether a tappable row says it is
 * tappable, whether four kinds of button sitting together read as four kinds.
 * Those are compositional, and a component photographed alone is composed with
 * nothing.
 *
 * ⚠️ AND IT CANNOT HIDE A COMPONENT, which is the property the grid had and a
 * demo screen normally destroys. `test/app.test.tsx` RENDERS these screens and
 * reads the `data-one` attributes back out of the markup, so a registered
 * component that no screen uses is a test failure rather than a thing nobody
 * noticed was missing. Nine surfaces the boundary forbids an app to build sat
 * unimplemented for four stages behind exactly that gap.
 *
 * ⚠️ EVERY STATE APPEARS IN CONTEXT RATHER THAN IN A ROW OF ITSELF. The refusals
 * are what a product ships most and reviews least: a locked control, an invalid
 * field, a collection that failed, a screen that has not answered yet. Here they
 * are where they occur — which is also the only place their copy can be judged.
 */

import React from "react";
import {
  AppBar, Amount, Badge, Breadcrumbs, BulkActions, Button, Callout, Check, Choose, Collection,
  Confirm, Crown, Dial, Disclosure, Divider, EmptyState, Field, Form, Glyph, Icon, Identity,
  Input, Medallion, Menu, NoData, Overlay, Page, PageHeader, PageTitle, Pagination, Progress,
  Promo, QuickActions, Row, SaveBar, Scroller, Section, Segmented, Select, Skeleton, Spinner,
  Stat, Steps, Surface, Switch, Table, Text, TileGrid, Toast, Tooltip, Topic, Textarea,
  type BoundControl, type Destination,
} from "../src/index.js";

const noop = () => undefined;
const bound = (over: Partial<BoundControl> = {}): BoundControl => ({ id: "x", describedBy: undefined, invalid: false, ...over });

/**
 * ⚠️ FOUR DESTINATIONS. Three is the floor and five the ceiling — past five, two
 * of them are the same place and the rail is somewhere people aim from memory
 * rather than read. `navProblems` refuses anything outside that.
 */
export const DESTINATIONS: readonly Destination[] = [
  { id: "today", label: "Today", icon: "chart", kind: "overview" },
  { id: "members", label: "Members", icon: "users", kind: "collection" },
  { id: "sessions", label: "Sessions", icon: "list", kind: "collection" },
  { id: "account", label: "Account", icon: "shield", kind: "task" },
];

interface Member { readonly id: string; readonly name: string; readonly detail: string; readonly at: string; readonly initials: string }

const ROSTER: readonly Member[] = [
  { id: "1", name: "Marion Keller", detail: "Lead — Tuesdays", at: "9:12", initials: "MK" },
  { id: "2", name: "Aya Tanaka", detail: "Bouldering", at: "12:40", initials: "AT" },
  { id: "3", name: "Rafael Souza", detail: "Top rope · induction due", at: "17:05", initials: "RS" },
];

/* ================================================================== today === */

/**
 * ⚠️ A CROWN, because this screen is about ONE NUMBER. The archetype is not a
 * layout preference: it decides the top, the sky, and how far down the light
 * survives, and a screen that picks the wrong one is a screen whose backdrop
 * gives out in the middle of its own subject.
 */
export const Today = () => (
  <Page
    archetype="crown"
    top={
      <Crown
        eyebrow="Club credit"
        amount={<Amount prefix="$" whole="184" fraction=".00" />}
        under={<Text role="caption">Renews 1 September</Text>}
        actions={[
          { id: "top-up", icon: "plus", label: "Top up" },
          { id: "send", icon: "send", label: "Gift" },
          { id: "passes", icon: "box", label: "Passes" },
        ]}
      />
    }
  >
    <Section title="Today" total="2 booked">
      <Row lead={<Medallion icon="dumbbell" />} title="Lead climbing" detail="Wall 3 · with Marion" value="18:30" onOpen={noop} />
      <Row lead={<Medallion icon="users" />} title="Bouldering social" detail="Cave" value="20:00" onOpen={noop} />
    </Section>

    <Section title="Guest passes" total="2 left">
      <Surface depth={1}>
        <Text role="body">Bring somebody who has never climbed here. They get an induction and a two-hour session.</Text>
        {/* ⚠️ BUSY AND LOCKED, where a person would actually meet them: one
            control waiting on the wall's availability, and one the plan withholds
            with the way out named. */}
        <Button kind="primary" state="busy">Checking Wall 3</Button>
        <Button kind="tonal" state="locked" reason="A second guest pass is on the Peak plan.">Add another guest</Button>
      </Surface>
    </Section>

    <Promo
      title="Bring a friend in August"
      detail="Your plan includes two guest passes a month."
      action={<Button kind="quiet">Invite</Button>}
    />

    <Section title="Shortcuts">
      <TileGrid
        tiles={[
          { id: "book", icon: "clock", label: "Book" },
          { id: "routes", icon: "list", label: "Routes" },
          { id: "photos", icon: "image", label: "Photos" },
          { id: "shop", icon: "box", label: "Shop" },
        ]}
      />
    </Section>

    <Section title="Coaches in today" bleed>
      <Scroller label="Coaches in today">
        {ROSTER.concat(ROSTER).map((m, i) => (
          <span key={`${m.id}-${i}`} data-one="scroller-item"><Medallion initials={m.initials} /></span>
        ))}
      </Scroller>
    </Section>

    <Section title="This month">
      <Surface depth={1}>
        <Stat label="Sessions" value="11" trend={{ direction: "up", label: "+3", good: true }} />
        <Divider />
        <Stat label="Missed bookings" value="2" trend={{ direction: "up", label: "+1", good: false }} />
        <Divider />
        {/* ⚠️ NOT COMPUTED IS NOT ZERO. A slot with nothing in it says so. */}
        <Stat label="Grade average" value={null} detail="Needs three more logged climbs" />
      </Surface>
    </Section>
  </Page>
);

/* ================================================================ members === */

/**
 * ⚠️ A TITLE PAGE — the archetype for a LIST. Its search sits in the top rather
 * than in the body, because a list whose search scrolls away is a list somebody
 * scrolls back up through to filter.
 */
export const Members = () => (
  <Page archetype="title" top={<PageTitle title="Members" search="Search members" />}>
    <Segmented options={[{ id: "all", label: "All" }, { id: "due", label: "Renewing" }, { id: "lapsed", label: "Lapsed" }]} at="all" />

    <Section title="Active" total="184">
      <Collection
        items={ROSTER}
        empty={{ title: "No members yet", detail: "Invite the first one and they appear here." }}
      >
        {(items) => items.map((m) => (
          <Row key={m.id} lead={<Medallion initials={m.initials} />} title={m.name} detail={m.detail} value={<Badge tone="success">Active</Badge>} onOpen={noop} />
        ))}
      </Collection>
    </Section>

    {/*
      ⚠️ FOUR CONTAINERS, FOUR DATA STATES, ALL ON A REAL SCREEN. `null` means
      not answered and `[]` means answered and empty — conflating them is how a
      screen says "nothing here" for the length of a round trip and then says it
      permanently when the request failed and somebody swallowed the error.
    */}
    <Section title="Renewing this week" total="—">
      <Collection items={null} empty={{ title: "Nobody is renewing" }}>{(i) => i.map(() => null)}</Collection>
    </Section>

    <Section title="Lapsed">
      <Collection
        items={[]}
        empty={{ title: "Nobody has lapsed", detail: "Anybody whose pass runs out shows up here.", action: <Button kind="quiet">Lapse rules</Button> }}
      >
        {(i) => i.map(() => null)}
      </Collection>
    </Section>

    <Section title="Guest passes">
      <Collection items={null} failed empty={{ title: "No guests" }}>{(i) => i.map(() => null)}</Collection>
    </Section>

    <Section title="Coaching notes">
      <Collection
        items={ROSTER.slice(0, 1)}
        included={{ notes: true, assessments: false }}
        empty={{ title: "No notes" }}
      >
        {(items) => items.map((m) => <Row key={m.id} title={m.name} detail="Working on overhangs" value="Aug 4" />)}
      </Collection>
    </Section>

    <Pagination page={2} pages={9} />
  </Page>
);

/* =============================================================== a member === */

/** ⚠️ AN IDENTITY PAGE — the archetype for ONE PERSON, and only for a person. */
export const MemberRecord = () => (
  <Page
    archetype="identity"
    top={<Identity initials="RS" name="Rafael Souza" detail="Member since March · Top rope" action={<Button kind="primary">Message</Button>} />}
  >
    <PageHeader
      title="Induction due"
      detail="Rafael's lead certificate expires in eleven days."
      trail={[{ id: "m", label: "Members", onGo: noop }, { id: "r", label: "Rafael Souza" }]}
      action={<Menu label="Rafael" items={[{ id: "edit", label: "Edit details", icon: "key" }, { id: "pause", label: "Pause membership", icon: "clock" }, { id: "remove", label: "Remove", destructive: true }]} />}
    />

    <Callout tone="warning" title="Lead certificate expiring">
      Bookings that need a lead certificate will stop being offered on 22 August.
    </Callout>

    <Section title="Progress">
      <Surface depth={1}>
        <Progress value={62} label="Route grade V4" />
        <Divider />
        {/* ⚠️ A length that is not known is drawn as not known, not as zero. */}
        <Progress value={null} label="Assessment syncing" />
      </Surface>
    </Section>

    <Section title="Recent climbs">
      <Table
        caption="Rafael's last three climbs"
        keyOf={(r: { id: string }) => r.id}
        columns={[
          { id: "route", label: "Route", cell: (r: { route: string }) => r.route },
          { id: "wall", label: "Wall", cell: (r: { wall: string }) => r.wall },
          { id: "grade", label: "Grade", numeric: true, cell: (r: { grade: string }) => r.grade },
        ]}
        rows={[
          { id: "1", route: "Kestrel", wall: "Cave", grade: "V4" },
          { id: "2", route: "Long Way Round", wall: "Wall 3", grade: "V3" },
          { id: "3", route: "Hairline", wall: "Slab", grade: "V5" },
        ]}
      />
    </Section>

    <Disclosure title="Emergency contact">
      <Row lead={<Glyph icon="phone" />} title="Ana Souza" detail="Sister" value={<Text role="body">+44 7700 900312</Text>} />
      <Row lead={<Glyph icon="mail" />} title="Preferred contact" value={<NoData label="Not given" />} />
    </Disclosure>

    <Section title="Passes">
      <Row
        lead={<Medallion icon="box" />}
        title="Peak membership"
        detail="Renews monthly"
        value={<Tooltip hint="Renews on the 1st"><Badge tone="info">Auto</Badge></Tooltip>}
        onOpen={noop}
      />
      <Row lead={<Medallion icon="key" />} title="Locker 214" detail="Paid to September" value={<Badge>Held</Badge>} onOpen={noop} />
    </Section>
  </Page>
);

/* =============================================================== sessions === */

/**
 * ⚠️ A FEED — independent sections under an app bar, and the one archetype with
 * no hero at all. It is what a screen is when it is about several things at once
 * rather than about one, and a feed with a hero is a screen that has not decided.
 */
export const Sessions = () => (
  <Page archetype="feed" top={<AppBar title="Sessions" action={<Badge tone="danger">3</Badge>} />}>
    <Section title="Waiting for review" total="3">
      {ROSTER.map((m) => (
        <Row key={m.id} lead={<Medallion initials={m.initials} />} title={m.name} detail={m.detail} value={m.at} onOpen={noop} />
      ))}
    </Section>

    {/* ⚠️ A BULK BAR EXISTS ONLY WHILE SOMETHING IS SELECTED. One that is always
        there is a permanent claim that work is outstanding. */}
    <BulkActions selected={2} actions={[{ id: "approve", label: "Approve" }, { id: "cancel", label: "Cancel", destructive: true }]} />

    <Section title="Still loading">
      <Skeleton rows={3} />
    </Section>

    <Section title="Everything else">
      <EmptyState
        title="No other sessions today"
        detail="Sessions appear here as soon as somebody books one."
        action={<Button kind="primary">Open bookings</Button>}
      />
    </Section>

    <Section title="Syncing">
      <Surface depth={1}><Spinner label="Checking the door system" /></Surface>
    </Section>

    <Toast tone="success" title="Session approved" undo={{ label: "Undo", onUndo: noop }} onDismiss={noop} />
  </Page>
);

/* ================================================================ account === */

/**
 * ⚠️ A TOPIC PAGE — one subject, named by an icon and a word. It is the
 * archetype every settings screen takes, and the reason a settings screen in
 * this language never needs a decision about its own header.
 */
export const Account = () => (
  <Page archetype="topic" top={<Topic icon="shield" title="Account" />}>
    <Breadcrumbs trail={[{ id: "a", label: "Account", onGo: noop }, { id: "s", label: "Security" }]} />

    <Steps steps={[{ id: "who", label: "Details" }, { id: "plan", label: "Plan" }, { id: "pay", label: "Payment" }]} at="plan" />

    {/*
      ⚠️ THE BUTTON KINDS AND STATES ARE SPREAD ACROSS THE PRODUCT, NOT LINED UP
      HERE. A row of seven buttons is a specimen grid smuggled into a screen, and
      it produces exactly the picture a grid produces: a wall of identical pills
      that answers "does this exist" and nothing about whether three kinds sitting
      together read as three kinds. Each one below is where it would really be.
    */}
    <Form
      title="Your details"
      actions={
        <>
          <Button kind="primary" onPress={noop}>Save changes</Button>
          <Button kind="quiet" onPress={noop}>Cancel</Button>
        </>
      }
    >
      <Field label="Full name" hint="As it appears on your certificate.">
        {(b) => <Input bound={b} value="Rafael Souza" onChange={noop} />}
      </Field>
      <Field label="Email" fault="That address is already on another membership.">
        {(b) => <Input bound={b} kind="email" value="rafael@ridgeline.club" onChange={noop} />}
      </Field>
      <Field label="Home wall">
        {(b) => <Select bound={b} value="cave" onChange={noop} options={[{ value: "cave", label: "The Cave" }, { value: "slab", label: "Slab" }, { value: "w3", label: "Wall 3" }]} />}
      </Field>
      <Field label="Anything we should know" hint="Injuries, access needs, anything at all.">
        {(b) => <Textarea bound={b} value="" onChange={noop} rows={3} />}
      </Field>
      <Check label="Send me a reminder the day before a booking" checked onCheck={noop} />
      <Choose name="Billing" value="year" onChoose={noop} options={[{ value: "month", label: "Monthly — $54" }, { value: "year", label: "Yearly — $540" }]} />
      <Field label="Remind me before a booking">
        {(b) => <Dial bound={b} min={0} max={48} step={6} value="24" onChange={noop} format={(h) => `${h}h before`} />}
      </Field>
      <Switch label="Show my climbs on the club board" on onToggle={noop} />
      {/* ⚠️ DISABLED IS NOT LOCKED, and the difference is whether there is a way
          out. A locked control stays focusable and says what would unlock it. */}
      <Switch label="Share my grade history with coaches" on={false} disabled reason="Coaching is not part of the Base plan." />
    </Form>

    <Section title="Sessions">
      <Row lead={<Glyph icon="phone" />} title="This phone" detail="Signed in 4 August" value={<Badge tone="success">Now</Badge>} />
      <Row lead={<Glyph icon="lock" />} title="Front desk tablet" detail="Signed in 2 August" value="Sign out" onOpen={noop} />
    </Section>

    <Divider />

    {/*
      ⚠️ THE IRREVERSIBLE THING IS BEHIND A DISCLOSURE AND AT THE END. A
      destructive button in the same row as Save is a mis-tap away from being the
      last thing somebody does here.
    */}
    <Disclosure title="Close your membership">
      <Text role="body">Your climbs, grades and photos are deleted after thirty days. Any credit left is refunded to the card that paid.</Text>
      <Button kind="destructive" onPress={noop}>Close membership</Button>
    </Disclosure>

    {/* ⚠️ DISABLED, not locked: nothing has changed, so there is nothing this
        control could do — and no plan or permission would change that. */}
    <Button kind="quiet" state="disabled" reason="Nothing has changed yet.">Revert to last saved</Button>

    <SaveBar dirty count={3} onSave={noop} onDiscard={noop} />
  </Page>
);

/* =============================================================== overlays === */

/**
 * ⚠️ THE OVERLAYS ARE A SCREEN'S, NOT A BOARD'S. Each is shown over the surface
 * it would actually appear on, because an overlay's whole job is its
 * relationship to what it covers — one shown loose reads as a card that happens
 * to contain a question, which is the single thing an overlay must never be.
 */
export const OVERLAYS: readonly { readonly id: string; readonly caption: string; readonly node: React.ReactNode }[] = [
  {
    id: "sheet",
    caption: "A sheet — yields to Escape and to a downward drag",
    node: (
      <Overlay kind="sheet" title="Book a session" onDismiss={noop} action={<Button kind="primary" size="sm">Book</Button>}>
        <Row lead={<Medallion icon="clock" />} title="Lead climbing" detail="Wall 3 · 18:30" value="45 min" />
      </Overlay>
    ),
  },
  {
    id: "dialog",
    caption: "A dialog — the one that takes the whole screen's attention",
    node: (
      <Overlay kind="dialog" title="Move this booking?" onDismiss={noop} action={<Button kind="primary" size="sm">Move it</Button>}>
        <Text role="body">Rafael will be told, and the wall will be released for anybody else.</Text>
      </Overlay>
    ),
  },
  {
    id: "confirm",
    caption: "A confirm — the verb is the button, never the word OK",
    node: <Confirm verb="Cancel" object="Rafael's Tuesday booking" short="the booking" onConfirm={noop} onCancel={noop} />,
  },
];

/* ================================================================= screens == */

export interface Screen {
  readonly id: string;
  /** ⚠️ The destination this screen answers to, so the nav can be real. */
  readonly at: string;
  readonly title: string;
  readonly note: string;
  readonly node: React.ReactNode;
}

export const SCREENS: readonly Screen[] = [
  { id: "today", at: "today", title: "Today", note: "A CROWN — the archetype for a screen about one number. The light reaches furthest here because the subject is at the top and everything under it is detail.", node: <Today /> },
  { id: "members", at: "members", title: "Members", note: "A TITLE page — a list, with its search in the top rather than in the body. Every data state a container can be in is on this screen, in the place it would really occur.", node: <Members /> },
  { id: "member", at: "members", title: "One member", note: "An IDENTITY page — one person, and only ever a person. The record beside the list at desktop width is the same element that was the row.", node: <MemberRecord /> },
  { id: "sessions", at: "sessions", title: "Sessions", note: "A FEED — independent sections under an app bar, and the one archetype with no hero. A feed with a hero is a screen that has not decided what it is about.", node: <Sessions /> },
  { id: "account", at: "account", title: "Account", note: "A TOPIC page — one subject, named by an icon and a word. Every form control the language has is here, including the two ways a control can refuse.", node: <Account /> },
];

/**
 * ONE SPECIMEN PER COMPONENT, PER STATE — the language, shown.
 *
 * ⚠️ NOT SHIPPED CODE, AND NOTHING IN `src` MAY IMPORT IT. It is the other half
 * of `registry.ts`: that file declares what exists and what states each thing has
 * been designed in, and this one is the proof that somebody drew every one of
 * them. `test/specimens.test.ts` fails on a registered component with no specimen
 * — a declared state nobody has looked at is a state that was considered on
 * paper and shipped unexamined.
 *
 * ⚠️ AND IT IS DELIBERATELY NOT FIVE FAKE SCREENS. Demo screens photograph a
 * product that does not exist and hide the components that were never built;
 * this photographs the language itself, which is the thing being agreed.
 */

import React from "react";
import {
  AppBar, Amount, Badge, Breadcrumbs, Button, Callout, Check, Choose, Collection, Confirm,
  Crown, Dial, Disclosure, Divider, EmptyState, Field, Form, Glyph, Icon, ICON_NAMES, Identity,
  Input, Medallion, Menu, NoData, Overlay, Page, PageHeader, PageTitle, Pagination, Progress,
  Promo, QuickActions, Row, SaveBar, Scroller, Section, Segmented, Select, Skeleton, Spinner,
  Stat, Steps, Surface, Switch, Table, Text, TileGrid, Toast, Tooltip, Topic, Textarea,
  BulkActions, Shell,
  type BoundControl,
} from "../src/index.js";

const bound: BoundControl = { id: "spec", describedBy: undefined, invalid: false };
const options = [{ value: "a", label: "Monthly" }, { value: "b", label: "Yearly" }];
const noop = () => undefined;

export interface Specimen {
  /** ⚠️ The registry id this proves. The test matches on it. */
  readonly of: string;
  readonly caption: string;
  readonly node: React.ReactNode;
  /** A specimen that needs room gets a whole row rather than a cell. */
  readonly wide?: boolean;
}

export interface Group { readonly title: string; readonly note: string; readonly items: readonly Specimen[] }

/* ------------------------------------------------------------- the groups --- */

export const GROUPS: readonly Group[] = [
  {
    title: "Surfaces",
    note: "Depth is a step toward the light. In dark that is lightness; in light it is the shadow, because a bright room tells things apart by what they cast.",
    items: [
      { of: "surface", caption: "depth 0 · the canvas", node: <Surface depth={0}><Text role="body">The page</Text></Surface> },
      { of: "surface", caption: "depth 1 · a card", node: <Surface depth={1}><Text role="body">A card</Text></Surface> },
      { of: "surface", caption: "depth 2", node: <Surface depth={2}><Text role="body">Inside it</Text></Surface> },
      { of: "surface", caption: "depth 3", node: <Surface depth={3}><Text role="body">Inside that</Text></Surface> },
      { of: "divider", caption: "divider", node: <Divider label="or" /> },
    ],
  },
  {
    title: "Text",
    note: "Five sizes and no more, verified by ratio against a reference rather than chosen by eye. A role is chosen at a call site; a size never is.",
    items: [
      ...(["display", "title", "subtitle", "body", "caption", "micro"] as const).map((role): Specimen => ({
        of: "text", caption: role, node: <Text role={role}>The quick brown fox</Text>,
      })),
      { of: "no-data", caption: "no-data", node: <NoData /> },
    ],
  },
  {
    title: "Buttons",
    note: "Four kinds and one refusal rule: a control that refuses says why, and a locked one stays reachable because pressing it is how somebody reaches the plan that unlocks it.",
    items: [
      { of: "button", caption: "primary", node: <Button kind="primary">Save</Button> },
      { of: "button", caption: "tonal", node: <Button>Edit</Button> },
      { of: "button", caption: "quiet", node: <Button kind="quiet">Cancel</Button> },
      { of: "button", caption: "destructive", node: <Button kind="destructive">Delete</Button> },
      { of: "button", caption: "busy", node: <Button state="busy">Saving</Button> },
      { of: "button", caption: "locked", node: <Button state="locked" reason="Not in your plan" resolve="billing">Publish</Button> },
      { of: "button", caption: "disabled", node: <Button state="disabled" reason="Add a client first">Publish</Button> },
    ],
  },
  {
    title: "Rows and leads",
    note: "The whole row is the target, never the glyph. A setting takes a bare glyph; a thing with a value takes a medallion — and one list never mixes the two.",
    items: [
      { of: "row", caption: "setting", wide: true, node: <Row lead={<Glyph icon="lock" />} title="Step-up codes" onOpen={noop} /> },
      { of: "row", caption: "a value", wide: true, node: <Row lead={<Medallion initials="MK" />} title="Marion Keller" detail="Week 6" value="$240.00" onOpen={noop} /> },
      { of: "row", caption: "nothing yet", wide: true, node: <Row lead={<Glyph icon="chart" />} title="Body scan" value={null} /> },
      { of: "medallion", caption: "medallion", node: <Medallion initials="AT" /> },
      { of: "glyph", caption: "glyph", node: <Glyph icon="users" /> },
      { of: "badge", caption: "badge", node: <Badge tone="accent">Pro</Badge> },
      { of: "badge", caption: "danger", node: <Badge tone="danger">3</Badge> },
    ],
  },
  {
    title: "Icons",
    note: "Lucide's geometry, our names, and a closed set. Press one: the motion plays on interaction and never on hover, because half the devices this ships to have none.",
    items: ICON_NAMES.map((name) => ({
      of: "icon", caption: name,
      node: <button type="button" data-one="quick-action"><span data-one="quick-action-well"><Icon name={name} /></span></button>,
    })),
  },
  {
    title: "Fields",
    note: "A label, a control, a hint, then a fault — in that order, because it is the order somebody reads when the control has just failed.",
    items: [
      { of: "field", caption: "with a hint", wide: true, node: <Field label="Studio name" hint="Shown to your clients">{(b) => <Input bound={b} example="Northlight Strength" />}</Field> },
      { of: "field", caption: "invalid", wide: true, node: <Field label="Slug" hint="Letters and dashes" fault="That name is taken">{(b) => <Input bound={b} value="north light" />}</Field> },
      { of: "field", caption: "optional", wide: true, node: <Field label="Nickname" optional>{(b) => <Input bound={b} />}</Field> },
      { of: "select", caption: "select", wide: true, node: <Field label="Billing">{(b) => <Select bound={b} options={options} value="a" />}</Field> },
      { of: "textarea", caption: "textarea", wide: true, node: <Field label="Notes">{(b) => <Textarea bound={b} />}</Field> },
      { of: "input", caption: "disabled", wide: true, node: <Field label="Owner" hint="Only an owner can change this">{(b) => <Input bound={b} value="marion@example.com" disabled />}</Field> },
    ],
  },
  {
    title: "Choices",
    note: "A switch takes effect immediately and says so by moving — which is why it is never used for anything that needs confirming.",
    items: [
      { of: "switch", caption: "on", wide: true, node: <Switch label="Email me about renewals" on /> },
      { of: "switch", caption: "off", wide: true, node: <Switch label="Weekly digest" on={false} /> },
      { of: "switch", caption: "refused", wide: true, node: <Switch label="Custom domain" on={false} disabled reason="Not on your plan" /> },
      { of: "checkbox", caption: "checkbox", wide: true, node: <Check label="Remember this device" checked /> },
      { of: "radio", caption: "one of a few", wide: true, node: <Choose name="Billing" options={options} value="b" /> },
      { of: "dial", caption: "dial", wide: true, node: <Dial bound={bound} min={0} max={100} value="40" format={(v) => `${v} kg`} /> },
    ],
  },
  {
    title: "Feedback",
    note: "Never colour alone, at any saturation: every state carries a word and an icon, so a greyscale screenshot reads the same screen.",
    items: [
      ...([
        ["success", "Saved"], ["warning", "Two clients lapse this week"], ["danger", "Payment failed"], ["info", "Some of this is not in your plan"],
      ] as const).map(([tone, title]): Specimen => ({ of: "callout", caption: tone, wide: true, node: <Callout tone={tone} title={title} /> })),
      { of: "toast", caption: "toast · undoable", wide: true, node: <Toast tone="success" title="Client archived" undo={{ label: "Undo", onUndo: noop }} /> },
      { of: "toast", caption: "toast · a failure stays", wide: true, node: <Toast tone="danger" title="Could not reach the payment provider" /> },
      { of: "empty-state", caption: "empty", wide: true, node: <EmptyState title="No clients yet" detail="Invite one by email." action={<Button kind="primary">Invite</Button>} /> },
      { of: "skeleton", caption: "waiting, shape known", wide: true, node: <Skeleton rows={3} /> },
      { of: "spinner", caption: "waiting, shape unknown", node: <Spinner label="Loading" /> },
      { of: "tooltip", caption: "tooltip", node: <Tooltip hint="Credits reset monthly"><Badge>1,204</Badge></Tooltip> },
    ],
  },
  {
    title: "Collections",
    note: "`null` is not-yet and `[]` is empty, and the type makes conflating them unwritable — the bug that turns a failed load into “nothing here”.",
    items: (["unknown", "empty", "error", "ready"] as const).map((state): Specimen => ({
      of: "collection", caption: state, wide: true,
      node: (
        <Collection
          items={state === "unknown" ? null : state === "empty" ? [] : ["Marion", "Aya"]}
          failed={state === "error"}
          empty={{ title: "No clients yet" }}
        >
          {(items) => <>{items.map((n) => <Row key={String(n)} title={String(n)} />)}</>}
        </Collection>
      ),
    })),
  },
  {
    title: "Reading",
    note: "A table scrolls in its own box; a trend's tone comes from whether it is good, never from its arrow.",
    items: [
      { of: "stat", caption: "with a trend", node: <Stat label="Revenue" value="$12,480" trend={{ direction: "up", label: "+12%", good: true }} /> },
      { of: "stat", caption: "bad news, up", node: <Stat label="Churn" value="4.2%" trend={{ direction: "up", label: "+0.8%", good: false }} /> },
      { of: "stat", caption: "not computed", node: <Stat label="Retention" value={null} /> },
      { of: "progress", caption: "determinate", wide: true, node: <Progress value={62} label="Storage used" /> },
      { of: "progress", caption: "length unknown", wide: true, node: <Progress value={null} label="Uploading" /> },
      {
        of: "table", caption: "table", wide: true,
        node: (
          <Table
            caption="Outstanding invoices"
            keyOf={(r: { id: string }) => r.id}
            columns={[
              { id: "who", label: "Client", cell: (r: { who: string }) => r.who },
              { id: "due", label: "Due", cell: (r: { due: string }) => r.due },
              { id: "owed", label: "Owed", numeric: true, cell: (r: { owed: string }) => r.owed },
            ]}
            rows={[
              { id: "1", who: "Marion Keller", due: "12 Aug", owed: "$240.00" },
              { id: "2", who: "Aya Tanaka", due: "19 Aug", owed: "$96.00" },
            ]}
          />
        ),
      },
      { of: "disclosure", caption: "disclosure", wide: true, node: <Disclosure title="Advanced"><Text role="body">Detail somebody may not need.</Text></Disclosure> },
      { of: "menu", caption: "actions on one thing", node: <Menu label="Client" items={[{ id: "e", label: "Edit", icon: "key" }, { id: "d", label: "Delete", destructive: true }]} /> },
    ],
  },
  {
    title: "Position",
    note: "Three levels that are not interchangeable: a destination survives a reload, a section is a lens on one, a record is one thing from a collection.",
    items: [
      { of: "page-header", caption: "page header", wide: true, node: <PageHeader title="Clients" detail="18 active" trail={[{ id: "h", label: "Home" }, { id: "c", label: "Clients" }]} action={<Button kind="primary">Invite</Button>} /> },
      { of: "breadcrumb", caption: "breadcrumbs", wide: true, node: <Breadcrumbs trail={[{ id: "h", label: "Home" }, { id: "c", label: "Clients" }, { id: "m", label: "Marion" }]} /> },
      { of: "segmented", caption: "segmented · tabs", wide: true, node: <Segmented options={[{ id: "w", label: "Week" }, { id: "m", label: "Month" }, { id: "y", label: "Year" }]} at="m" /> },
      { of: "steps", caption: "steps", wide: true, node: <Steps steps={[{ id: "a", label: "Details" }, { id: "b", label: "Plan" }, { id: "c", label: "Pay" }]} at="b" /> },
      { of: "pagination", caption: "pagination", wide: true, node: <Pagination page={2} pages={9} /> },
      { of: "app-bar", caption: "app bar", wide: true, node: <AppBar leading="back" title="Security" action={<Badge>24</Badge>} /> },
    ],
  },
  {
    title: "Committing",
    note: "A bar appears only when there is something to say. One that is always there is a permanent claim that work is outstanding, and people stop reading it.",
    items: [
      { of: "save-bar", caption: "unsaved", wide: true, node: <SaveBar dirty count={3} /> },
      { of: "save-bar", caption: "saving", wide: true, node: <SaveBar dirty busy /> },
      { of: "bulk-actions", caption: "selected", wide: true, node: <BulkActions selected={4} actions={[{ id: "a", label: "Archive" }, { id: "d", label: "Delete", destructive: true }]} /> },
      { of: "form", caption: "a form", wide: true, node: <Form title="Studio"><Field label="Name">{(b) => <Input bound={b} />}</Field><Button kind="primary">Save</Button></Form> },
      { of: "overlay", caption: "sheet", wide: true, node: <Overlay kind="sheet" title="Edit client" onDismiss={noop}><Text role="body">A sheet yields to Escape and to a gesture.</Text></Overlay> },
      { of: "overlay", caption: "confirm", wide: true, node: <Confirm verb="Delete" object="the June plan" onConfirm={noop} onCancel={noop} /> },
    ],
  },
  {
    title: "The tops",
    note: "The top of a screen is decided by what the screen IS. Five shapes, and a new screen picks one rather than inventing a sixth.",
    items: [
      { of: "crown", caption: "A · crown — one number", wide: true, node: <Crown eyebrow="Studio balance" amount={<Amount prefix="$" whole="12,480" fraction=".50" />} under={<Text role="caption">+$1,204 this month</Text>} actions={[{ id: "a", icon: "plus", label: "Invoice" }, { id: "b", icon: "send", label: "Pay out" }, { id: "c", icon: "box", label: "Packages" }]} /> },
      { of: "topic", caption: "B · topic — one subject", wide: true, node: <Topic icon="shield" title="Security" /> },
      { of: "page-title", caption: "C · title — a list", wide: true, node: <PageTitle title="Clients" search="Search clients" /> },
      { of: "identity", caption: "D · identity — one person", wide: true, node: <Identity initials="MK" name="Marion Keller" detail="Client since March" action={<Button kind="primary">Message</Button>} /> },
      { of: "amount", caption: "amount", node: <Amount prefix="$" whole="1,240" fraction=".50" /> },
      { of: "quick-action", caption: "quick actions", wide: true, node: <QuickActions actions={[{ id: "a", icon: "plus", label: "Add" }, { id: "b", icon: "send", label: "Send" }, { id: "c", icon: "camera", label: "Scan" }, { id: "d", icon: "dots", label: "More" }]} /> },
      { of: "tile", caption: "tiles", wide: true, node: <TileGrid tiles={[{ id: "a", icon: "list", label: "Plans" }, { id: "b", icon: "apple", label: "Meals" }, { id: "c", icon: "image", label: "Media" }, { id: "d", icon: "chart", label: "Reports" }]} /> },
      { of: "promo", caption: "promo", wide: true, node: <Promo title="Add a second coach" detail="Your plan covers three seats." action={<Button kind="quiet">Invite</Button>} /> },
    ],
  },
  {
    title: "Assembling",
    note: "A section's header sits outside its card everywhere except a feed, where the card IS the section rather than a list the section contains.",
    items: [
      {
        of: "page", caption: "a page, assembled", wide: true,
        node: (
          <Page archetype="feed" top={<AppBar title="Today" action={<Badge tone="danger">3</Badge>} />}>
            <Section title="Recent" total="4 today">
              <Row lead={<Medallion initials="MK" />} title="Marion Keller" detail="Logged a set" value="9:12" onOpen={noop} />
              <Row lead={<Medallion initials="AT" />} title="Aya Tanaka" detail="Logged lunch" value="12:40" onOpen={noop} />
            </Section>
            <Section title="Coaches" bleed>
              <Scroller label="Coaches">
                {["AL", "MK", "RS", "JD"].map((w) => <span key={w} data-one="scroller-item"><Medallion initials={w} /></span>)}
              </Scroller>
            </Section>
          </Page>
        ),
      },
      {
        of: "shell", caption: "the shell — one navigation surface", wide: true,
        node: (
          <Shell
            width="phone"
            at="home"
            destinations={[
              { id: "home", label: "Home", icon: "chart", kind: "overview" },
              { id: "clients", label: "Clients", icon: "users", kind: "collection" },
              { id: "plans", label: "Plans", icon: "list", kind: "collection" },
            ]}
          >
            <Text role="body">The pane the shell holds.</Text>
          </Shell>
        ),
      },
      { of: "nav", caption: "nav item", node: <Text role="micro">rail at ≥48rem, island below</Text> },
      { of: "sky", caption: "the sky is behind every page", node: <Text role="micro">aurora · photo · dots · waves · grid · rings</Text> },
      { of: "section", caption: "section", wide: true, node: <Section title="This week" total="4 of 5"><Row title="Lower body" detail="Yesterday" value="Done" /></Section> },
      { of: "scroller", caption: "the one thing that leaves the inset", node: <Text role="micro">first item aligned, last item cut</Text> },
    ],
  },
];

/** Every registry id this file draws — what the conformance test reads. */
export const COVERED: readonly string[] = [...new Set(GROUPS.flatMap((g) => g.items.map((i) => i.of)))];

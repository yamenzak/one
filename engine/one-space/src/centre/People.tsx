/**
 * PEOPLE — one roster, and nothing else on the screen.
 *
 * ⚠️ THE SCREEN IS A `list` AND ITS ONE ACTION IS "INVITE SOMEBODY", DECLARED
 * RATHER THAN PLACED. It used to sit as the last row of the roster, which is
 * fine at three members and invisible at thirty: whoever is at the bottom of a
 * long page has to scroll to the top to act, or whoever is at the top has to
 * scroll to the bottom, and which of the two was never decided. The `list` shape
 * docks it above the thumb on a phone and puts it in the crown on a desktop, and
 * on an EMPTY roster moves it into the empty state — the one place all three are
 * decided is `screen.tsx`.
 *
 * ⚠️ THE ONE ROSTER IS THE POINT (D15). A person appears once, with their
 * platform office and what they are in each product — not once per product.
 * Every control here lands on a bounded operation: the screen can offer a role
 * the gate would refuse, but only until the answer comes back, and the answer
 * is a sentence.
 *
 * ⚠️ AND THE PACKAGES LEFT, WHICH IS THE WHOLE OF WHAT CHANGED HERE. Composing
 * one IS the same gesture as composing a role (D16), and that is an argument
 * about the mechanism rather than about the screen: a roster is who works here
 * and a catalogue is what the business sells. One control changes a person's
 * access and the other changes a price, which is two screens (DESIGN.md §3) —
 * and with six products the catalogue was six cards of empty state stacked under
 * a list of staff.
 */

import { useState } from "react";
import { PLATFORM_ROLES, sayDate, type Instant } from "@engine/kernel";
import { Button, Card, Chip } from "@heroui/react";
import {
  Await, Choice, Confirm, FieldRow, Group, Listing, Menu, NavRow, NoteRow, Nothing, Picks,
  RowsWaiting, Screen, Stack, TextInput, ToggleRow, Tray,
  glyphOf, notice, sentence, useMoney, useShown, whoFace,
} from "@engine/design";
import { api } from "../api.js";
import {
  useLoad, type CentreApp, type CentreView, type HoldingLine, type MemberLine, type PackageLine,
  type PlaceLine,
} from "./data.js";

const ROLE_SAID: Readonly<Record<string, string>> = {
  owner: "Runs everything, including the bill.",
  manager: "Runs the roster and the settings; sees the bill.",
  staff: "On the team. App roles say what they do all day.",
  customer: "A customer — no workspace authority, costs no seat.",
};

export function People({ view }: { readonly view: CentreView }) {
  const members = useLoad<{ items: readonly MemberLine[] }>("member.list");
  const manage = view.you.platform.includes("member:manage");
  /* ⚠️ THE ROW OPENS THE PERSON, which is what a roster is for. The tray used to
     hang off a "Manage" button in the corner, leaving the row itself inert —
     so the largest target on the screen did nothing and the smallest did
     everything (DESIGN.md §5). One tray, opened by the list. */
  const [opened, setOpened] = useState<MemberLine | null>(null);
  const [inviting, setInviting] = useState(false);
  /*
    ⚠️ ROLES ARE A CROWN CHIP RATHER THAN A SECOND LIST ON THIS SCREEN. A roster
    and a list of roles are two lists about two different things, and a screen
    with both has decided neither is the subject — the roster is who works here,
    which is what somebody opens People for.

    ⚠️ AND IT IS BESIDE THE ROSTER RATHER THAN ITS OWN AREA, because a role only
    ever exists to be assigned to somebody two rows away. An area of its own is
    a destination people visit once and then cannot find again.
  */
  const [roles, setRoles] = useState(false);

  return (
    <>
      <Screen
        shape="list"
        does={manage ? { label: "Invite somebody", onDo: () => setInviting(true) } : undefined}
        also={manage
          ? [{ id: "roles", label: "Roles", icon: glyphOf("key"), onDo: () => setRoles(true) }]
          : undefined}
        of={members.of}
        again={members.again}
        isNothing={(d) => d.items.length === 0}
        waiting={<RowsWaiting rows={4} />}
        nothing={{
          icon: glyphOf("people"),
          says: "Nobody here yet",
          under: "Invite somebody by email — they join by signing in as that address",
        }}
        then={(data) => (
          <Listing
            label="Members"
            of={{ status: "ready", data: data.items }}
            rowKey={(m) => m.id}
            /* ⚠️ EMPTY IS THE SCREEN'S NOW, NOT THE LISTING'S. Two components
               both able to answer "there is nothing here" is two answers, and
               only one of them can also stand the primary action down. */
            says={{ icon: glyphOf("people"), nothing: "Nobody here yet" }}
            /* ⚠️ A ROSTER IS A LIST OF PEOPLE BEFORE IT IS A TABLE. On a phone
               the three columns were a scroll box with two of them cut off
               mid-word; the same rows carry the same facts in the shape the
               rest of OneSpace already uses. Columns survive on a desktop, where
               comparing a hundred members down a page is what they are for. */
            onOpen={manage ? (m) => setOpened(m) : undefined}
            asRow={(m) => ({
              name: m.email,
              /* ⚠️ THE ACCOUNT, NOT THE ROW AND NOT THE EMAIL — see `face.tsx`.
                 An unclaimed invitation has no account, so it keeps the
                 initial: a face for somebody who has not arrived yet would be
                 a picture of nobody. */
              face: m.accountId ? whoFace(m.accountId) : undefined,
              /* ⚠️ A ROLE IS NAMED, NOT KEYED. These are the strings the roster
                 stores, and printed raw the row read "staff · Inventory: keeper" —
                 on a screen where the name beside them is capitalised. */
              under: [
                sentence(m.platformRole),
                ...Object.entries(m.appRoles)
                  .map(([appId, role]) => `${nameOf(view, appId)}: ${sentence(role)}`),
              ].join(" · "),
              aside: m.accepted
                ? undefined
                : <Chip color="warning" variant="soft"><Chip.Label>Invited</Chip.Label></Chip>,
            })}
            cols={[
              { id: "email", label: "Email", cell: (m) => m.email },
              {
                id: "role", label: "Workspace",
                cell: (m) => (
                  <Chip color={m.platformRole === "customer" ? "default" : "accent"} variant="soft">
                    <Chip.Label>{sentence(m.platformRole)}</Chip.Label>
                  </Chip>
                ),
              },
              {
                id: "apps", label: "In the products",
                cell: (m) => Object.entries(m.appRoles)
                  .map(([appId, role]) => `${nameOf(view, appId)}: ${role}`).join(" · ") || "—",
              },
              {
                id: "state", label: "",
                cell: (m) => m.accepted
                  ? null
                  : <Chip color="warning" variant="soft"><Chip.Label>Invited</Chip.Label></Chip>,
              },
            ]}
          />
        )}
      />

      {/* ⚠️ ONE TRAY FOR THE LIST, not one per row. Mounting a drawer per member
          means forty drawers in the tree on a roster of forty. */}
      {inviting ? (
        <InviteTray
          view={view}
          onClose={() => setInviting(false)}
          onDone={() => { members.again(); setInviting(false); }}
        />
      ) : null}
      {roles ? (
        <RolesTray
          view={view}
          onClose={() => setRoles(false)}
          /* ⚠️ THE ROSTER IS RE-READ TOO, because a role somebody adopted is a
             role the member trays can now offer — and a picker that has not
             heard about it is a screen promising less than the door allows. */
          onDone={() => { members.again(); }}
        />
      ) : null}
      {opened ? (
        <MemberActions
          view={view}
          member={opened}
          onDone={() => { members.again(); setOpened(null); }}
          onClose={() => setOpened(null)}
        />
      ) : null}
    </>
  );
}

const nameOf = (view: CentreView, appId: string): string =>
  view.apps.find((a) => a.id === appId)?.name ?? appId;

/* ------------------------------------------------------------------ invite --- */

function InviteTray({ view, onDone, onClose }: {
  readonly view: CentreView;
  readonly onDone: () => void;
  readonly onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const [platformRole, setPlatformRole] = useState("staff");
  const [appRoles, setAppRoles] = useState<Record<string, string>>({});

  const invite = async () => {
    const sent = await api.post("member.invite", { email, platformRole, appRoles });
    if (!sent.ok) { notice.fail(sent.problem.title); return; }
    notice.ok(`Invited ${email}. They join by signing in as that address.`);
    setEmail(""); setAppRoles({});
    onDone();
  };

  return (
    /* ⚠️ THE TRAY HAS NO TRIGGER OF ITS OWN — the screen's primary action opens
       it. A trigger here would be a second copy of the same control, in a place
       the shape did not choose, which is the fault this whole pass removes. */
    <Tray
      isOpen
      onOpenChange={(open) => { if (!open) onClose(); }}
      title="Invite somebody"
      actions={<Button slot="close" variant="primary" isDisabled={!email.includes("@")} onPress={() => void invite()}>Send the invitation</Button>}
    >
      <Stack space="roomy">
        <TextInput label="Email" kind="email" value={email} onChange={setEmail}
          help="They sign in as this address — that is how the invitation is claimed." />
        <Choice
          label="In the workspace"
          value={platformRole}
          onChange={(v) => setPlatformRole(v ?? "staff")}
          options={Object.keys(PLATFORM_ROLES).map((id) => ({ id, label: id, help: ROLE_SAID[id] }))}
        />
        {view.apps.map((app) => (
          <Choice
            key={app.id}
            label={`In ${app.name}`}
            value={appRoles[app.id] ?? null}
            onChange={(v) => setAppRoles((prev) => {
              const next = { ...prev };
              if (v) next[app.id] = v; else delete next[app.id];
              return next;
            })}
            options={app.roles.map((id) => ({ id, label: id }))}
            placeholder="Not a user"
          />
        ))}
      </Stack>
    </Tray>
  );
}

/* ------------------------------------------------------------------- rows --- */

function MemberActions({ view, member, onDone, onClose }: {
  readonly view: CentreView;
  readonly member: MemberLine;
  readonly onDone: () => void;
  readonly onClose: () => void;
}) {
  const setPlatform = async (role: string) => {
    const out = await api.post("member.role", { id: member.id, platformRole: role });
    if (!out.ok) { notice.fail(out.problem.title); return; }
    notice.ok(`${member.email} is ${role} now.`);
    onDone();
  };

  const setApp = async (appId: string, role: string | null) => {
    const out = await api.post("member.role", { id: member.id, app: appId, role });
    if (!out.ok) { notice.fail(out.problem.title); return; }
    notice.ok(role ? `${member.email} is ${role} in ${nameOf(view, appId)} now.` : `Removed from ${nameOf(view, appId)}.`);
    onDone();
  };

  const remove = async () => {
    const out = await api.post("member.remove", { id: member.id });
    if (!out.ok) { notice.fail(out.problem.title); return; }
    notice.ok(`${member.email} no longer has access.`);
    onDone();
  };

  return (
    <Tray isOpen onOpenChange={(open) => { if (!open) onClose(); }} title={member.email}>
      <Stack space="roomy">
        <Choice
          label="In the workspace"
          value={member.platformRole}
          onChange={(v) => { if (v && v !== member.platformRole) void setPlatform(v); }}
          options={Object.keys(PLATFORM_ROLES).map((id) => ({ id, label: id, help: ROLE_SAID[id] }))}
        />
        {view.apps.map((app) => (
          <Choice
            key={app.id}
            label={`In ${app.name}`}
            value={member.appRoles[app.id] ?? null}
            onChange={(v) => {
              if ((v ?? null) !== (member.appRoles[app.id] ?? null)) void setApp(app.id, v);
            }}
            options={app.roles.map((id) => ({ id, label: id }))}
            placeholder="Not a user"
          />
        ))}
        <Where view={view} member={member} onDone={onDone} />
        <Holdings view={view} member={member} />
        <Confirm
          trigger={<Button variant="danger-soft">Remove from the workspace</Button>}
          title={`Remove ${member.email}?`}
          act={{ label: "Remove", onDo: () => void remove() }}
        >
          They lose access now. Their records stay until erasure runs its own course.
        </Confirm>
      </Stack>
    </Tray>
  );
}

/* ------------------------------------------------------------------- where --- */

/**
 * WHERE IN THE WORKSPACE THIS PERSON WORKS.
 *
 * ⚠️ A PRODUCT THAT IS NOT NARROWED BY ANYTHING DRAWS NOTHING HERE, and that is
 * every product but one. `member.places` answers with no label where the app
 * declared no reach, so a business with one site never meets the concept and the
 * roster does not grow a card explaining it.
 *
 * ⚠️ "EVERYWHERE" IS A ROW RATHER THAN AN EMPTY SET OF TICKS. Nothing ticked
 * means nowhere, which is a real answer somebody may mean; the default is the
 * whole workspace, and the two have to be two different presses or clearing the
 * list would silently take somebody's access away.
 */
function Where({ view, member, onDone }: {
  readonly view: CentreView;
  readonly member: MemberLine;
  readonly onDone: () => void;
}) {
  return (
    <>
      {view.apps.map((app) => (
        <AppWhere key={app.id} app={app} member={member} onDone={onDone} />
      ))}
    </>
  );
}

function AppWhere({ app, member, onDone }: {
  readonly app: CentreApp;
  readonly member: MemberLine;
  readonly onDone: () => void;
}) {
  const of = useLoad<{
    label: { one: string; many: string } | null;
    items: readonly PlaceLine[];
  }>("member.places", { app: app.id });

  const held = member.reach[app.id];

  const save = async (places: readonly string[] | null) => {
    const out = await api.post("member.reach", { app: app.id, id: member.id, places });
    if (!out.ok) {
      notice.fail(out.problem.fields?.places ?? out.problem.title);
      return;
    }
    notice.ok(places === null ? "They work everywhere here." : "Saved.");
    onDone();
  };

  return (
    <Await
      of={of.of}
      again={of.again}
      /* ⚠️ SILENT WHERE THERE IS NOTHING TO NARROW BY — a heading over an empty
         card is a feature this workspace does not have, explained. */
      waiting={null}
      isNothing={(d) => d.label === null}
      nothing={null}
      then={(data) => (
        <Group
          label={`Where in ${app.name}`}
          under={held === undefined
            ? "Everywhere"
            : `${held.length} of ${data.items.length} ${data.label!.many.toLowerCase()}`}
        >
          {/* ⚠️ THE WAY BACK TO EVERYWHERE IS ITS OWN CONTROL — see the header.
              Untick-everything means nowhere, which is a different answer. */}
          <ToggleRow
            label="Everywhere here"
            under={`They reach every ${data.label!.one.toLowerCase()} this workspace has, including new ones`}
            value={held === undefined}
            onChange={(on) => void save(on ? null : [])}
          />
          {held === undefined
            ? null
            : (
              <Picks
                label={data.label!.many}
                value={held}
                onChange={(ids) => void save(ids)}
                help={`A ${data.label!.one.toLowerCase()} covers everything inside it`}
                options={data.items.map((one) => ({ id: one.id, label: one.name }))}
              />
            )}
        </Group>
      )}
    />
  );
}

/* ---------------------------------------------------------------- holdings --- */

function Holdings({ view, member }: { readonly view: CentreView; readonly member: MemberLine }) {
  return (
    <Stack space="snug">
      {view.apps.map((app) => <AppHoldings key={app.id} app={app} member={member} />)}
    </Stack>
  );
}

function AppHoldings({ app, member }: { readonly app: CentreApp; readonly member: MemberLine }) {
  const price = useMoney();
  const reader = useShown();
  const held = useLoad<{ items: readonly HoldingLine[] }>("package.held",
    { member: member.id, app: app.id });
  const sold = useLoad<{ items: readonly PackageLine[] }>("package.list", { app: app.id });

  const grant = async (packageId: string) => {
    const out = await api.post("package.grant", { member: member.id, package: packageId, app: app.id });
    if (!out.ok) { notice.fail(out.problem.title); return; }
    notice.ok("Granted. Renewing later extends the same clock.");
    held.again();
  };

  const revoke = async (packageId: string) => {
    const out = await api.post("package.revoke", { member: member.id, package: packageId, app: app.id });
    if (!out.ok) { notice.fail(out.problem.title); return; }
    notice.ok("Taken away.");
    held.again();
  };

  return (
    <Await
      of={held.of}
      waiting={<RowsWaiting rows={1} />}
      again={held.again}
      then={(holdings) => (
        /* ⚠️ NO `Stack` — a card is already one, and a second inside it is a
           second inset and a second rhythm. See `test/rhythm.test.tsx`. */
        <Group label={`Packages in ${app.name}`}>
              {holdings.items.length === 0
                ? (
                  <Nothing
                    icon={glyphOf("package")}
                    says="Holds nothing here"
                    under="Grant one below — a paid one arrives the same way"
                  />
                )
                : holdings.items.map((h) => (
                  <div key={h.packageId} className="flex flex-wrap items-center justify-between">
                    <span>{h.name}</span>
                    <Chip
                      color={h.state === "active" ? "success" : h.state === "grace" ? "warning" : "default"}
                      variant="soft"
                    >
                      <Chip.Label>
                        {h.state === "active" && h.paidUntil ? `Until ${sayDate(reader, h.paidUntil as Instant)}`
                          : h.state === "grace" ? "In grace — renew to keep it"
                            : "Lapsed"}
                      </Chip.Label>
                    </Chip>
                    <Menu
                      trigger={<Button variant="ghost" aria-label={`Manage ${h.name}`}>…</Button>}
                      items={[
                        { id: "extend", label: "Extend one period", icon: glyphOf("calendar"), onDo: () => void grant(h.packageId) },
                        { id: "revoke", label: "Take it away", icon: glyphOf("remove"), tone: "danger", onDo: () => void revoke(h.packageId) },
                      ]}
                    />
                  </div>
                ))}
              {sold.of.status === "ready" && sold.of.data.items.length
                ? (
                  <Menu
                    trigger={<Button variant="secondary">Grant a package</Button>}
                    items={sold.of.data.items.map((p) => ({
                      id: p.id,
                      label: `${p.name} — ${price(p.priceCents, p.currency)} / ${p.periodDays} days`,
                      onDo: () => void grant(p.id),
                    }))}
                  />
                )
                : null}
        </Group>
      )}
    />
  );
}

/* ------------------------------------------------------------------ roles --- */

/** One of the workspace's own roles, as `role.list` answers it. */
interface RoleLine {
  readonly id: string;
  readonly name: string;
  readonly permissions: readonly string[];
}

interface RoleBook {
  readonly items: readonly RoleLine[];
  readonly declared: readonly { readonly id: string; readonly permissions: readonly string[] }[];
  readonly permissions: readonly string[];
  /** ⚠️ The caller's own keys IN THIS APP. It is the ceiling — see `beyond_you`. */
  readonly yours: readonly string[];
  readonly presets: readonly {
    readonly id: string; readonly name: string; readonly said: string;
    readonly permissions: readonly string[];
  }[];
}

/**
 * THE WORKSPACE'S OWN ROLES, PER PRODUCT.
 *
 * ⚠️ PER PRODUCT BECAUSE A ROLE COMPOSES ONE APP'S KEYS. A role spanning two
 * products would be a name that means something different depending on which one
 * is looking at it, and the platform's four offices are not composable at all —
 * a fifth kind of "who runs this place" is a governance question rather than a
 * bundle.
 *
 * ⚠️ AND A PRESET IS A STARTING POINT, NOT A ROLE. What the app declares belongs
 * to the app and every workspace has it; what somebody adopts here is theirs, and
 * stays what they made it the day the product ships a new key.
 */
function RolesTray({ view, onDone, onClose }: {
  readonly view: CentreView;
  readonly onDone: () => void;
  readonly onClose: () => void;
}) {
  const [app, setApp] = useState(view.apps[0]?.id ?? "");
  /* ⚠️ THE APP IS PART OF THE KEY, so switching products re-reads rather than
     redrawing the last one's roles under the new one's name. */
  const book = useLoad<RoleBook>("role.list", { app });
  const [editing, setEditing] = useState<RoleLine | null>(null);

  return (
    <Tray isOpen onOpenChange={(open) => { if (!open) onClose(); }} title="Roles">
      <Stack space="roomy">
        {/* ⚠️ ONLY WHERE THERE IS A CHOICE. A workspace with one product would
            otherwise read a picker with one option, which is a control that
            cannot do anything. */}
        {view.apps.length > 1
          ? (
            <Choice
              label="In"
              value={app}
              onChange={(v) => { if (v) { setApp(v); setEditing(null); } }}
              options={view.apps.map((a) => ({ id: a.id, label: a.name }))}
            />
          )
          : null}

        <Await
          of={book.of}
          again={book.again}
          waiting={<RowsWaiting rows={3} />}
          then={(said) => (editing
            ? (
              <RoleEditor
                app={app}
                role={editing}
                book={said}
                onBack={() => setEditing(null)}
                onDone={() => { setEditing(null); book.again(); onDone(); }}
              />
            )
            : (
              <Stack space="roomy">
                <Group label="Yours" under="Roles this workspace made, and can change">
                  {said.items.map((r) => (
                    <NavRow
                      key={r.id}
                      label={r.name}
                      under={`${r.permissions.length} of ${said.permissions.length}`}
                      onOpen={() => setEditing(r)}
                    />
                  ))}
                  {/* ⚠️ SAID WHERE IT IS TRUE. An absent list is indistinguishable
                      from one that failed to load. */}
                  {said.items.length ? null : <NoteRow>None yet</NoteRow>}
                </Group>

                {/*
                  ⚠️ THE PRESETS ARE THE WAY IN, and starting from an empty list of
                  forty keys is the way nobody uses. Each says what that person
                  does all day rather than which permissions it holds — the keys
                  are on the next screen, where somebody is changing them.
                */}
                <Group label="Start from" under="Shapes this product knows about">
                  {said.presets.filter((p) => !said.items.some((r) => r.id === p.id)).map((p) => (
                    <NavRow
                      key={p.id}
                      label={p.name}
                      under={p.said}
                      onOpen={() => setEditing({
                        id: p.id, name: p.name, permissions: p.permissions,
                      })}
                    />
                  ))}
                  <NavRow
                    label="Something else"
                    under="Start with nothing and pick what they may do"
                    onOpen={() => setEditing({ id: "", name: "", permissions: [] })}
                  />
                </Group>

                {/* ⚠️ WHAT THE APP ITSELF DECLARES, SHOWN AND NOT EDITABLE. A
                    workspace cannot redefine one — `registryWith` lets the app's
                    own win, so a row that tried would resolve to nothing — and
                    seeing them is how somebody decides a bundle is worth making
                    at all. */}
                <Group label="The product's own" under="Every workspace has these">
                  {said.declared.map((r) => (
                    <FieldRow
                      key={r.id}
                      label={sentence(r.id)}
                      value={`${r.permissions.length} of ${said.permissions.length}`}
                    />
                  ))}
                </Group>
              </Stack>
            ))}
        />
      </Stack>
    </Tray>
  );
}

/**
 * ⚠️ THE CEILING IS DRAWN, NOT ONLY ENFORCED. A key the person composing this
 * role does not hold themselves is offered disabled with a reason — because
 * `role.save` refuses it (`beyond_you`), and a picker that offered it silently
 * would be a form whose submit is the first thing that tells anybody.
 *
 * ⚠️ AND THAT REFUSAL IS THE ESCALATION CHECK, not a nicety: composing a role
 * out of keys you do not hold and assigning it to yourself is the shortest path
 * from "I can manage people" to "I can do anything".
 */
function RoleEditor({ app, role, book, onBack, onDone }: {
  readonly app: string;
  readonly role: RoleLine;
  readonly book: RoleBook;
  readonly onBack: () => void;
  readonly onDone: () => void;
}) {
  const [id, setId] = useState(role.id);
  const [name, setName] = useState(role.name);
  const [keys, setKeys] = useState<readonly string[]>(role.permissions);
  const yours = new Set(book.yours);
  const existing = book.items.some((r) => r.id === role.id) && role.id !== "";

  const save = async () => {
    const out = await api.post("role.save", { app, id, name, permissions: keys });
    if (!out.ok) { notice.fail(out.problem.title); return; }
    notice.ok(`${name} can do ${keys.length} of ${book.permissions.length} things.`);
    onDone();
  };

  const drop = async () => {
    const out = await api.post("role.remove", { app, id: role.id });
    if (!out.ok) { notice.fail(out.problem.title); return; }
    notice.ok(`${role.name} is gone.`);
    onDone();
  };

  return (
    <Stack space="roomy">
      <TextInput
        label="Name" value={name} onChange={setName}
        help="What this person is called here."
      />
      <TextInput
        label="Id" value={id} onChange={setId} disabled={existing}
        help="Letters, numbers and dashes. It never changes once somebody holds it."
      />
      <Picks
        label="They may"
        value={[...keys]}
        onChange={setKeys}
        options={book.permissions.map((k) => ({
          id: k,
          label: sentence(k.replace(":", " · ")),
          ...(yours.has(k) ? {} : { help: "You cannot grant this — you do not hold it" }),
        }))}
      />
      <Stack space="snug">
        <Button
          variant="primary"
          isDisabled={!id.trim() || !name.trim() || keys.some((k) => !yours.has(k))}
          onPress={() => void save()}
        >
          {existing ? "Save" : "Make this role"}
        </Button>
        {existing
          ? (
            <Confirm
              trigger={<Button variant="danger-soft">Delete this role</Button>}
              title={`Delete ${role.name}?`}
              act={{ label: "Delete", onDo: () => void drop() }}
            >
              Anybody still holding it has to be moved off it first.
            </Confirm>
          )
          : null}
        <Button variant="ghost" onPress={onBack}>Back to the list</Button>
      </Stack>
    </Stack>
  );
}

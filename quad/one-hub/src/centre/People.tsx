/**
 * PEOPLE — one roster, and nothing else on the screen.
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
import { PLATFORM_ROLES } from "@quad/kernel";
import { Button, Card, Chip } from "@heroui/react";
import {
  Agree, Await, Choice, Confirm, Group, Listing, Menu, NavRow, Nothing, NumberInput,
  Picks, RowsWaiting, Stack, TextInput, Tray, glyphOf, notice, money as saidMoney,
} from "@quad/web";
import { api } from "../api.js";
import { useLoad, type CentreApp, type CentreView, type HoldingLine, type MemberLine, type PackageLine } from "./data.js";

const ROLE_SAID: Readonly<Record<string, string>> = {
  owner: "Runs everything, including the bill.",
  manager: "Runs the roster and the settings; sees the bill.",
  staff: "On the team. App roles say what they do all day.",
  customer: "A customer — no workspace authority, costs no seat.",
};

export function People({ view }: { readonly view: CentreView }) {
  const members = useLoad<{ items: readonly MemberLine[] }>("member.list");
  const manage = view.you.platform.includes("member:manage");

  return (
    <Stack space="roomy">
      {/* ⚠️ NO HEADING OF ITS OWN: the hub's crown is the screen's name, and a
          section repeating it puts the same word on the page twice. */}
      {/* ⚠️ THE LIST FIRST, THEN THE WAY TO ADD TO IT. Above the roster the
          invite is the first thing on a screen whose subject is who is already
          here — and it put a `+` row over a list it is not part of. Every other
          "make a new one" in the hub sits at the foot of its own list. */}
      <Stack space="snug">
          <Listing
            label="Members"
            of={members.of.status === "ready"
              ? { status: "ready", data: members.of.data.items }
              : members.of.status === "trouble" ? members.of : { status: "waiting" }}
            again={members.again}
            rowKey={(m) => m.id}
            says={{ nothing: "Nobody here yet", under: "Invite somebody by email to get started" }}
            /* ⚠️ A ROSTER IS A LIST OF PEOPLE BEFORE IT IS A TABLE. On a phone
               the three columns were a scroll box with two of them cut off
               mid-word; the same rows carry the same facts in the shape the
               rest of the hub already uses. Columns survive on a desktop, where
               comparing a hundred members down a page is what they are for. */
            asRow={(m) => ({
              name: m.email,
              under: [
                m.platformRole,
                ...Object.entries(m.appRoles).map(([appId, role]) => `${nameOf(view, appId)}: ${role}`),
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
                    <Chip.Label>{m.platformRole}</Chip.Label>
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
              ...(manage
                ? [{
                  id: "act", label: "",
                  cell: (m: MemberLine) => <MemberActions view={view} member={m} onDone={members.again} />,
                }]
                : []),
            ]}
          />
          {manage ? <InviteTray view={view} onDone={members.again} /> : null}
      </Stack>
    </Stack>
  );
}

const nameOf = (view: CentreView, appId: string): string =>
  view.apps.find((a) => a.id === appId)?.name ?? appId;

/* ------------------------------------------------------------------ invite --- */

function InviteTray({ view, onDone }: { readonly view: CentreView; readonly onDone: () => void }) {
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
    <div>
      {/* ⚠️ A ROW, NOT A FLOATING PRIMARY. It sat above the roster as a bare
          button attached to nothing — the one control on the screen with no
          card under it. Every other "make a new one of these" in the hub is a
          row with a `+` at the foot of the list it adds to, and this is that. */}
      <Tray
        trigger={(
          <Group>
            <NavRow icon={glyphOf("add")} label="Invite somebody" onOpen={() => undefined} />
          </Group>
        )}
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
    </div>
  );
}

/* ------------------------------------------------------------------- rows --- */

function MemberActions({ view, member, onDone }: {
  readonly view: CentreView;
  readonly member: MemberLine;
  readonly onDone: () => void;
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
    <Tray
      trigger={<Button variant="ghost" aria-label={`Manage ${member.email}`}>Manage</Button>}
      title={member.email}
    >
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

/* ---------------------------------------------------------------- holdings --- */

function Holdings({ view, member }: { readonly view: CentreView; readonly member: MemberLine }) {
  return (
    <Stack space="snug">
      {view.apps.map((app) => <AppHoldings key={app.id} app={app} member={member} />)}
    </Stack>
  );
}

function AppHoldings({ app, member }: { readonly app: CentreApp; readonly member: MemberLine }) {
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
        <Card>
          <Card.Header>
            <Card.Title>Packages in {app.name}</Card.Title>
          </Card.Header>
          <Card.Content>
            <Stack space="snug">
              {holdings.items.length === 0
                ? <Nothing says="Holds nothing here" under="Grant one below — a paid one arrives the same way" />
                : holdings.items.map((h) => (
                  <div key={h.packageId} className="flex flex-wrap items-center justify-between">
                    <span>{h.name}</span>
                    <Chip
                      color={h.state === "active" ? "success" : h.state === "grace" ? "warning" : "default"}
                      variant="soft"
                    >
                      <Chip.Label>
                        {h.state === "active" && h.paidUntil ? `Until ${h.paidUntil.slice(0, 10)}`
                          : h.state === "grace" ? "In grace — renew to keep it"
                            : "Lapsed"}
                      </Chip.Label>
                    </Chip>
                    <Menu
                      trigger={<Button variant="ghost" aria-label={`Manage ${h.name}`}>…</Button>}
                      items={[
                        { id: "extend", label: "Extend one period", onDo: () => void grant(h.packageId) },
                        { id: "revoke", label: "Take it away", tone: "danger", onDo: () => void revoke(h.packageId) },
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
                      label: `${p.name} — ${saidMoney(p.priceCents, p.currency)} / ${p.periodDays} days`,
                      onDo: () => void grant(p.id),
                    }))}
                  />
                )
                : null}
            </Stack>
          </Card.Content>
        </Card>
      )}
    />
  );
}

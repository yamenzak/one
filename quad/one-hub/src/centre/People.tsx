/**
 * PEOPLE — one roster, two authorities, and the packages beside them.
 *
 * ⚠️ THE ONE ROSTER IS THE POINT (D15). A person appears once, with their
 * platform office and what they are in each product — not once per product.
 * Every control here lands on a bounded operation: the screen can offer a role
 * the gate would refuse, but only until the answer comes back, and the answer
 * is a sentence.
 *
 * ⚠️ AND A PACKAGE SITS BESIDE THE ROLES BECAUSE IT IS THE SAME GESTURE WITH A
 * CLOCK (D16). Composing one looks like composing a role, plus a price and a
 * period; granting one is the same door inviting is.
 */

import { useState } from "react";
import { PLATFORM_ROLES } from "@quad/kernel";
import { Button, Card, Chip } from "@heroui/react";
import {
  Agree, Await, Choice, Confirm, Listing, Menu, MoneyInput, Nothing, NumberInput, Picks,
  RowsWaiting, Section, Stack, TextInput, Tray, notice, money as saidMoney,
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
      <Section
        label="People"
        under="Staff and customers, one roster, across every product"
      >
        <Stack space="snug">
          {manage ? <InviteTray view={view} onDone={members.again} /> : null}
          <Listing
            label="Members"
            of={members.of.status === "ready"
              ? { status: "ready", data: members.of.data.items }
              : members.of.status === "trouble" ? members.of : { status: "waiting" }}
            again={members.again}
            rowKey={(m) => m.id}
            says={{ nothing: "Nobody here yet", under: "Invite somebody by email to get started" }}
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
        </Stack>
      </Section>

      {manage ? <Packages view={view} /> : null}
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
      <Tray
        trigger={<Button variant="primary">Invite somebody</Button>}
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

/* ---------------------------------------------------------------- packages --- */

function Packages({ view }: { readonly view: CentreView }) {
  return (
    <Section
      label="Packages"
      under="A bundle of capabilities with a price and a clock"
    >
      <Stack space="snug">
        {view.apps.map((app) => <AppPackages key={app.id} app={app} />)}
      </Stack>
    </Section>
  );
}

function AppPackages({ app }: { readonly app: CentreApp }) {
  const sold = useLoad<{ items: readonly PackageLine[] }>("package.list", { app: app.id });

  return (
    <Card>
      <Card.Header>
        <Card.Title>{app.mark} {app.name}</Card.Title>
      </Card.Header>
      <Card.Content>
        <Stack space="snug">
          <Await
            of={sold.of}
            waiting={<RowsWaiting rows={2} />}
            again={sold.again}
            isNothing={(d) => d.items.length === 0}
            nothing={<Nothing says="Nothing on sale yet" under="Compose the first package below" />}
            then={(data) => (
              <Stack space="tight">
                {data.items.map((p) => (
                  <div key={p.id} className="flex flex-wrap items-center justify-between">
                    <span>{p.name}</span>
                    <span className="tabular-nums">
                      {saidMoney(p.priceCents, p.currency)} / {p.periodDays} days
                    </span>
                    <ArchiveButton app={app} pkg={p} onDone={sold.again} />
                  </div>
                ))}
              </Stack>
            )}
          />
          <ComposeTray app={app} onDone={sold.again} />
        </Stack>
      </Card.Content>
    </Card>
  );
}

function ArchiveButton({ app, pkg, onDone }: {
  readonly app: CentreApp; readonly pkg: PackageLine; readonly onDone: () => void;
}) {
  const archive = async () => {
    const out = await api.post("package.archive", { id: pkg.id, app: app.id });
    if (!out.ok) { notice.fail(out.problem.title); return; }
    notice.ok(`${pkg.name} is off the shelf. Live holdings run out their clock.`);
    onDone();
  };
  return (
    <Confirm
      trigger={<Button variant="ghost">Stop selling</Button>}
      title={`Stop selling ${pkg.name}?`}
      act={{ label: "Stop selling", onDo: () => void archive() }}
    >
      Nobody new can buy it. Anybody holding it keeps it until their time runs out.
    </Confirm>
  );
}

/* ⚠️ A SELECTION'S EMPTY IS A FACT, NOT A LOADING STATE. Nothing is picked
   until the person picks it — this is form input, and the `Loaded` rule is
   about answers that have not arrived. */
const NOTHING_PICKED: readonly string[] = [];

function ComposeTray({ app, onDone }: { readonly app: CentreApp; readonly onDone: () => void }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState<number | undefined>(500);
  const [period, setPeriod] = useState<number | undefined>(30);
  const [grace, setGrace] = useState<number | undefined>(3);
  const [grants, setGrants] = useState(NOTHING_PICKED);
  const [oncePer, setOncePer] = useState(false);

  const compose = async () => {
    const id = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const out = await api.post("package.create", {
      app: app.id, id, name: name.trim(),
      priceCents: price ?? 0, currency: "EUR",
      periodDays: period ?? 30, graceDays: grace ?? 3,
      grants, oncePer,
    });
    if (!out.ok) { notice.fail(out.problem.title); return; }
    notice.ok(`${name.trim()} is on the shelf.`);
    setName(""); setGrants(NOTHING_PICKED);
    onDone();
  };

  return (
    <div>
      <Tray
        trigger={<Button variant="secondary">Compose a package</Button>}
        title={`A package in ${app.name}`}
        actions={
          <Button
            slot="close"
            variant="primary"
            isDisabled={!name.trim() || grants.length === 0}
            onPress={() => void compose()}
          >
            Put it on the shelf
          </Button>
        }
      >
        <Stack space="roomy">
          <TextInput label="Name" value={name} onChange={setName} placeholder="Strength coaching" />
          <MoneyInput label="Price" currency="EUR" value={price} onChange={setPrice}
            help="Zero is a real price — a free package works the same way." />
          <NumberInput label="Days one purchase buys" value={period} onChange={setPeriod} min={1} />
          <NumberInput label="Grace days" value={grace} onChange={setGrace} min={0}
            help="After expiry it still works this long, while both sides are told." />
          <Picks
            label="What holding it lets them do"
            value={grants}
            onChange={setGrants}
            options={app.sellable.map((p) => ({ id: p, label: p }))}
          />
          <Agree label="One per customer" value={oncePer} onChange={setOncePer}
            help="A starter offer. The ledger remembers even after it lapses." />
        </Stack>
      </Tray>
    </div>
  );
}

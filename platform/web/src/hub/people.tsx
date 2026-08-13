/**
 * WHO IS IN A WORKSPACE, AND WHAT EACH OF THEM MAY DO.
 *
 * ⚠️ THE ROSTER HAD NO SCREEN AT ALL. `member.invite`, `member.remove` and
 * `member.permissions` have been on every app's surface since the day membership
 * was written, reachable by anybody who could compose an HTTP request and by
 * nobody else — so the one capability every multi-person product needs on its
 * first day was a feature only its authors could use.
 *
 * ⚠️ NOTHING HERE NAMES A ROLE OR A PERMISSION. Both come from `role.list`, which
 * reads the product's manifest merged with what this workspace made for itself —
 * the same rule `declared.tsx` follows for settings, and it exists for the same
 * reason. A screen that listed a product's roles would be a screen that goes out
 * of date in the direction nobody notices.
 *
 * ⚠️ A ROLE SOMEBODY MAY NOT GRANT IS SHOWN AND STOOD DOWN, never hidden. The
 * server refuses to hand out a role carrying keys the granter does not hold, and
 * a screen that silently dropped those roles would leave an administrator
 * wondering why the list on their screen is shorter than the one their colleague
 * describes. `editable` and `assignable` are the server's own answer, carried.
 *
 * ⚠️ AND A PERMISSION IS A CHECKBOX, WHICH IS THE WHOLE FEATURE. What a workspace
 * gets here is not "roles we thought of" — it is the product's own permission
 * list, in bundles the workspace names. Every product gets that without
 * declaring anything, because every product declares permissions already.
 */

import { useState, type ElementType, type ReactNode } from "react";
import type { Problem } from "@one/kernel";
import { Button } from "../button.js";
import { Pill } from "../capsule.js";
import { Choose, type Option } from "../choose.js";
import { useCommit } from "../commit.js";
import { Confirm } from "../confirm.js";
import { Blank, Card, Item, Unset, Waiting } from "../list.js";
import { Screen, Section, Title } from "../screen.js";
import { Sheet } from "../sheet.js";
import { SwitchRow } from "../switch.js";
import { ValueEditor } from "../editor.js";

/** One member, as `member.list` answers. */
export interface Member {
  readonly id: string;
  readonly email: string;
  readonly role: string;
  readonly state: "accepted" | "invited";
}

/** One role, as `role.list` answers — the product's and the workspace's alike. */
export interface Role {
  readonly id: string;
  readonly name: string;
  readonly permissions: readonly string[];
  /** ⚠️ The product's, or this workspace's. Only the second may be changed. */
  readonly source: "app" | "workspace";
  /** Whether this person holds everything it carries — the server's own answer. */
  readonly editable: boolean;
  readonly held: number;
}

export interface PeopleProps {
  readonly workspace: { readonly name: string; readonly tenantId: string };
  /** ⚠️ Null until known. An empty roster and a pending fetch are different facts. */
  readonly members: readonly Member[] | null;
  readonly roles: readonly Role[] | null;
  /** Every permission this person could put in a role. Already narrowed server-side. */
  readonly permissions: readonly string[];
  readonly seats: { readonly used: number; readonly allowed: number | boolean } | null;
  readonly onInvite: (email: string, role: string) => Promise<Problem | null>;
  readonly onRole: (id: string, role: string) => Promise<Problem | null>;
  readonly onRemove: (id: string) => Promise<Problem | null>;
  readonly onSaveRole: (role: { id: string; name: string; permissions: readonly string[] }) => Promise<Problem | null>;
  readonly onRemoveRole: (id: string) => Promise<Problem | null>;
  /**
   * ⚠️ ABSENT MEANS READ-ONLY, WHICH IS THE ORDINARY CASE. Most people in a
   * workspace are not its administrator, and who else is in it is not a secret
   * from them — so the roster is shown and every control is stood down.
   */
  readonly mayManage?: boolean;
  readonly onBack: () => void;
  readonly Heading?: ElementType;
}

/**
 * ⚠️ A ROLE ID FROM A NAME, AND A PERSON NEVER TYPES ONE. It is a key in a merged
 * registry — a space or a dot in it resolves to nothing, which is a role somebody
 * made, assigned, and that grants nothing at all. The server refuses it; deriving
 * it here means nobody meets that refusal.
 */
/** ⚠️ Not a role id, and it cannot be one: `roleIdOk` demands a letter first. */
export const REMOVE = "__remove";

export const roleIdFrom = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 39) || "role";

/** ⚠️ The permission's own words, grouped by what it is about. Never a lookup table. */
export const subjectOfKey = (key: string): string =>
  (key.includes(":") ? key.slice(0, key.indexOf(":")) : "").replace(/^./, (c) => c.toUpperCase());

/** ⚠️ What it lets somebody do, from the key itself — `note:write` is "Write". */
export const verbOfKey = (key: string): string =>
  (key.includes(":") ? key.slice(key.indexOf(":") + 1) : key).replace(/^./, (c) => c.toUpperCase());

export const seatsSaid = (seats: { used: number; allowed: number | boolean }): string =>
  seats.allowed === true || seats.allowed === -1 ? `${seats.used} in use`
    : seats.allowed === false ? `${seats.used} in use`
      : `${seats.used} of ${seats.allowed} in use`;

/**
 * THE PERMISSION BUILDER — a sheet of switches over the product's own keys.
 *
 * ⚠️ IT SAVES ONCE, NOT PER SWITCH. A write per toggle turns composing a role
 * into fifteen requests, any of which can fail on its own and leave a role that
 * is half of what somebody meant — and there is no moment they could point at
 * and say "that is what I decided".
 */
function RoleSheet({ role, permissions, onSave, onDelete, onClose }: {
  readonly role: Role;
  readonly permissions: readonly string[];
  readonly onSave: (role: { id: string; name: string; permissions: readonly string[] }) => Promise<Problem | null>;
  readonly onDelete: () => void;
  readonly onClose: () => void;
}): ReactNode {
  const [held, setHeld] = useState<readonly string[]>(role.permissions);
  const commit = useCommit(() => onSave({ id: role.id, name: role.name, permissions: held }), onClose);

  const groups = new Map<string, string[]>();
  for (const key of permissions) {
    const at = subjectOfKey(key) || "Other";
    groups.set(at, [...(groups.get(at) ?? []), key]);
  }

  return (
    <Sheet open onClose={onClose} dismissible label={`What ${role.name} may do`}>
      <div className="sheet-body">
        <header className="sheet-top">
          <h2 className="sheet-title">{role.name}</h2>
          <p className="lede">{held.length} of {permissions.length} permissions</p>
        </header>
        {[...groups].sort(([a], [b]) => a.localeCompare(b)).map(([at, keys]) => (
          <Section key={at} name={at}>
            <Card>
              {keys.map((key) => (
                <SwitchRow
                  key={key} title={verbOfKey(key)} detail={key}
                  on={held.includes(key)}
                  onChange={(next) => {
                    setHeld((was) => (next ? [...was, key] : was.filter((k) => k !== key)));
                    /* ⚠️ A change after a failure is a new attempt, not a retry of
                       the refused one — otherwise the sheet keeps showing a
                       refusal about a set nobody is proposing any more. */
                    commit.reset();
                  }}
                />
              ))}
            </Card>
          </Section>
        ))}
        {commit.state.at === "failed" ? <p className="wrong">{commit.state.problem.detail}</p> : null}
        <Button wide tone="loud" onClick={() => void commit.run()} disabled={commit.state.at === "working"}>
          {commit.state.at === "done" ? "Saved" : "Save"}
        </Button>
        {/* ⚠️ DELETING A ROLE IS ASKED FOR HERE AND CONFIRMED OUTSIDE, because a
            sheet inside a sheet is a stack nobody can find their way out of. */}
        <Button wide tone="quiet" onClick={onDelete}>Delete this role</Button>
      </div>
    </Sheet>
  );
}

export function PeopleScreen({
  workspace, members, roles, permissions, seats,
  onInvite, onRole, onRemove, onSaveRole, onRemoveRole,
  mayManage = false, onBack, Heading = "h1",
}: PeopleProps): ReactNode {
  /* ⚠️ ONE PIECE OF STATE PER KIND OF SHEET, because only one of each is ever
     open. A flag per row is a screen that can show two. */
  const [inviting, setInviting] = useState<string | null>(null);
  const [moving, setMoving] = useState<Member | null>(null);
  const [dropping, setDropping] = useState<Member | null>(null);
  const [pickRole, setPickRole] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [naming, setNaming] = useState(false);
  const [scrapping, setScrapping] = useState<Role | null>(null);

  /* ⚠️ ONLY WHAT THIS PERSON COULD ACTUALLY HAND OUT. A role they may not grant
     is refused by the server, and offering it is offering a refusal. */
  const assignable: Option<string>[] = (roles ?? [])
    .filter((r) => r.editable)
    .map((r) => ({ value: r.id, label: r.name }));

  const nameOf = (id: string) => roles?.find((r) => r.id === id)?.name ?? id;

  return (
    <Screen leave="up" onLeave={onBack} name="People" sky="silk"
      title={<Title as={Heading}>People</Title>}
      lede={workspace.name}
      action={mayManage && assignable.length ? (
        <Button tone="loud" onClick={() => setPickRole(true)}>Invite</Button>
      ) : undefined}
    >
      <Section name={seats ? seatsSaid(seats) : undefined}>
        {members === null ? <Waiting rows={3} /> : members.length === 0 ? (
          <Blank title="Nobody else yet">
            Invite a colleague and they will find this workspace waiting the first time they sign in.
          </Blank>
        ) : (
          <Card>
            {members.map((m) => (
              <Item
                key={m.id}
                title={m.email}
                detail={m.state === "invited" ? <>Invited<Pill tone="quiet">Not accepted</Pill></> : nameOf(m.role)}
                action={m.state === "invited" ? <span className="value">{nameOf(m.role)}</span> : undefined}
                {...(mayManage ? { onGo: () => setMoving(m) } : {})}
              />
            ))}
          </Card>
        )}
      </Section>

      {/*
        ⚠️ THE ROLES ARE ON THE SAME SCREEN AS THE PEOPLE, deliberately. A role
        is only ever made because somebody is about to be put in it, and a
        builder one level away is one nobody finds until they are told it exists.
      */}
      <Section name="Roles">
        {roles === null ? <Waiting rows={2} /> : (
          <Card>
            {roles.map((r) => (
              <Item
                key={r.id}
                title={r.name}
                detail={
                  <>
                    {r.permissions.length} permission{r.permissions.length === 1 ? "" : "s"}
                    {r.source === "app" ? <Pill tone="quiet">This product</Pill> : null}
                    {r.held ? ` · ${r.held} here` : null}
                  </>
                }
                {...(mayManage && r.source === "workspace" && r.editable ? { onGo: () => setEditing(r) } : {})}
                action={r.source === "app" ? <Unset>Fixed</Unset> : undefined}
              />
            ))}
            {mayManage ? (
              <Item title="New role" detail="Name a bundle of permissions this workspace can hand out"
                onGo={() => setNaming(true)} />
            ) : null}
          </Card>
        )}
      </Section>

      {/* ⚠️ The role is chosen BEFORE the address, because it is the decision.
          Asked afterwards it becomes a field somebody clears on the way past. */}
      <Choose
        open={pickRole} title="Invite as" options={assignable} value=""
        onPick={(role) => { setPickRole(false); setInviting(role); }}
        onClose={() => setPickRole(false)}
      />

      {inviting ? (
        <ValueEditor
          field={{
            name: "email", kind: "email", title: "Who are you inviting?",
            lede: `They will join as ${nameOf(inviting)}.`,
            label: "Email address", value: "", maxLength: 200,
          }}
          onSave={(_name, email) => onInvite(email, inviting)}
          onClose={() => setInviting(null)}
        />
      ) : null}

      {/*
        ⚠️ MOVING SOMEBODY IS THE SAME PICKER THE INVITE USES, so the two can
        never disagree about which roles this person may hand out.

        ⚠️ AND REMOVING THEM IS THE LAST ROW OF IT RATHER THAN A SECOND CONTROL
        ON THE LINE. A row either goes somewhere or does something — a remove
        button beside a pressable row is two targets on one line, and the finger
        that meant "remove" and landed a millimetre left opens a screen instead.
      */}
      <Choose
        open={moving !== null} title={moving ? moving.email : ""}
        options={[...assignable, { value: REMOVE, label: "Remove from this workspace" }]}
        value={moving?.role ?? ""}
        onPick={(picked) => {
          const who = moving;
          setMoving(null);
          if (!who) return;
          if (picked === REMOVE) { setDropping(who); return; }
          void onRole(who.id, picked);
        }}
        onClose={() => setMoving(null)}
      />

      {dropping ? (
        <Confirm
          open title={`Remove ${dropping.email}?`}
          lede="They lose access to this workspace. Their records stay."
          verb="Remove" tone="alarm" gate={{ kind: "tick", label: "I understand they lose access" }}
          onConfirm={() => onRemove(dropping.id)}
          onClose={() => setDropping(null)}
        />
      ) : null}

      {naming ? (
        <ValueEditor
          field={{
            name: "name", kind: "text", title: "What is this role called?",
            lede: "You choose what it may do next.",
            label: "Name", value: "", maxLength: 60,
          }}
          /* ⚠️ Created empty and then filled in, rather than composed in one
             sheet — a role with no permissions grants nothing and is harmless,
             and it means the builder is reached the same way every time. */
          onSave={async (_field, name) => {
            const problem = await onSaveRole({ id: roleIdFrom(name), name, permissions: [] });
            if (!problem) setEditing({ id: roleIdFrom(name), name, permissions: [], source: "workspace", editable: true, held: 0 });
            return problem;
          }}
          onClose={() => setNaming(false)}
        />
      ) : null}

      {editing ? (
        <RoleSheet
          role={editing} permissions={permissions} onSave={onSaveRole}
          onDelete={() => { const it = editing; setEditing(null); setScrapping(it); }}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {scrapping ? (
        <Confirm
          open title={`Delete ${scrapping.name}?`}
          lede="Anybody in it has to be moved somewhere else first."
          verb="Delete" tone="alarm" gate={{ kind: "press" }}
          onConfirm={() => onRemoveRole(scrapping.id)}
          onClose={() => setScrapping(null)}
        />
      ) : null}
    </Screen>
  );
}

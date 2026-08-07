/**
 * Team — who can sign in, and what they can do.
 *
 * ── The screen changed shape in Stage 2 ────────────────────────────────────
 *
 * It used to CREATE accounts: an owner typed a username, generated a password,
 * and read both back off a dialog to hand over. Two of its four actions were
 * about that password. All of it is gone — a colleague's credential is not an
 * admin's to choose, and an account whose password its administrator knows makes
 * "who did this" unanswerable.
 *
 * What replaces it is an INVITATION: an address, a role, and a link the person
 * follows to set themselves up. They sign in with an emailed code or a passkey.
 *
 * Two consequences worth knowing at a call site:
 *
 *   • A pending invitation RESERVES A SEAT. It is shown beside the members for
 *     that reason — an owner who cannot see it cannot understand the count.
 *   • The seat numbers come from the SERVER, not from `members.length`. Board
 *     users are memberships that consume no seat, so counting rows tells an
 *     owner they are full when they are not.
 *
 * Guarded to owner by the API; this screen assumes the caller can manage the
 * team.
 */
import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, MailWarning, MoreVertical, SlidersHorizontal, Copy, Trash2, UserPlus, UserRound, UserX } from "lucide-react";
import {
  getTeam,
  getStaff,
  inviteStaff,
  cancelInvitation,
  setMemberRole,
  setMemberPermissions,
  revokeMember,
  type TeamState,
  type StaffState,
  type TenantMember,
  type Role,
} from "../api.js";
import { PERMISSION_CATALOG, ROLE_PRESETS } from "../permissions.js";
import { confirmDialog } from "../components/confirm.js";
import { Badge, Button, cn, Collection, Dialog, DialogContent, DialogDescription, DialogFooter, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, Group, Input, Label, PageHeader, Row, Section, Select, toast, usePageChrome } from "@4dl/ui";

type Grant = Record<string, string[]>;
const cloneGrant = (g: Grant): Grant => Object.fromEntries(Object.entries(g).map(([k, v]) => [k, [...v]]));

/** A resource×action permission checklist. Toggling edits the grant in place. */
function PermissionGrid({ value, onChange }: { value: Grant; onChange: (g: Grant) => void }) {
  function toggle(res: string, act: string) {
    const cur = new Set(value[res] ?? []);
    if (cur.has(act)) cur.delete(act);
    else cur.add(act);
    const next = { ...value, [res]: [...cur] };
    if (!next[res]!.length) delete next[res];
    onChange(next);
  }
  return (
    <div className="max-h-[42vh] space-y-2 overflow-y-auto rounded-lg border p-2">
      {PERMISSION_CATALOG.map((r) => (
        <div key={r.resource} className="rounded-md px-1.5 py-1">
          <div className="mb-1 text-xs font-semibold">{r.label}</div>
          <div className="flex flex-wrap gap-1.5">
            {r.actions.map((a) => {
              const on = value[r.resource]?.includes(a);
              return (
                <button
                  key={a}
                  type="button"
                  onClick={() => toggle(r.resource, a)}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-[11px] font-medium capitalize transition-colors",
                    on ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent",
                  )}
                >
                  {a}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Preset quick-fill row (owner/operator/receptionist/viewer → fills the grid). */
function PresetRow({ onPick }: { onPick: (role: Role) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-muted-foreground">Start from:</span>
      {(["owner", "operator", "receptionist", "viewer"] as Role[]).map((r) => (
        <button key={r} type="button" onClick={() => onPick(r)} className="rounded-md border px-2 py-0.5 text-[11px] font-medium capitalize hover:bg-accent">
          {r}
        </button>
      ))}
    </div>
  );
}

export function TeamPage() {
  const [team, setTeam] = useState<TeamState | null>(null);
  const [staff, setStaff] = useState<StaffState | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [q, setQ] = useState("");

  /*
    A FAILED LOAD MUST NOT RENDER AS AN EMPTY TEAM.

    `.catch(() => setTeam({ members: [] }))` is the shape this had, and it draws
    "No members yet" over a network error — on the one screen where that reads as
    "your colleagues' access is gone". `team` stays null and the error carries
    the retry.

    ⚠️ The error is the SERVER'S message now. Stage 7a left this as a
    `loadFailed: boolean` and a hardcoded "We couldn't reach the server.", which
    is honest about a dropped connection and a lie about a 403 — the two cases
    an owner most needs told apart.
  */
  const [error, setError] = useState<string | null>(null);
  const reload = () => {
    setError(null);
    return Promise.all([getTeam(), getStaff()])
      .then(([t, st]) => {
        setTeam(t);
        setStaff(st);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };
  useEffect(() => {
    reload();
  }, []);

  const [editAccess, setEditAccess] = useState<TenantMember | null>(null);

  async function changeRole(m: TenantMember, role: Role) {
    try {
      // Applying a role resets the member to that role's preset (clears any
      // custom grant), so role + effective access stay consistent.
      //
      // The role write is keyed by USER id (the shared staff routes are), the
      // grant write by MEMBER id (Scena's own table is). Two ids, two routes,
      // deliberately not unified — a member row is per tenant, a user is not.
      await setMemberRole(m.userId, role);
      await setMemberPermissions(m.memberId, {}).catch(() => {});
      reload();
      toast.success(`${m.name} is now ${role}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not change role");
    }
  }

  async function cancelInvite(id: string, email: string) {
    const ok = await confirmDialog({
      title: `Cancel the invitation to ${email}?`,
      description: "The link stops working and the seat it was holding is freed.",
      confirmText: "Cancel invitation",
      destructive: true,
    });
    if (!ok) return;
    try {
      await cancelInvitation(id);
      reload();
      toast.success("Invitation cancelled.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not cancel it");
    }
  }

  async function revoke(m: TenantMember) {
    const ok = await confirmDialog({
      title: `Remove ${m.name}?`,
      description: "Their access is removed and any active sessions end immediately.",
      confirmText: "Remove",
      destructive: true,
    });
    if (!ok) return;
    try {
      await revokeMember(m.userId);
      reload();
      toast.success(`${m.name} was revoked.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not revoke");
    }
  }

  const roles = team?.roles ?? (["owner", "operator", "receptionist", "viewer"] as Role[]);

  usePageChrome(
    { crumbs: [{ label: "Team" }], actions: [{ key: "invite", label: "Invite", icon: <UserPlus className="size-4" />, onClick: () => setInviteOpen(true) }] },
    [],
  );

  const seats = staff?.seats;
  const description = seats
    ? seats.max < 0
      ? `${seats.used} member${seats.used === 1 ? "" : "s"}${seats.pending ? ` · ${seats.pending} invited` : ""} · unlimited seats`
      : `${seats.used} of ${seats.max} seat${seats.max === 1 ? "" : "s"} in use${seats.pending ? `, ${seats.pending} invited` : ""}`
    : "Who can sign in, and what they can do.";

  const shown = useMemo(() => {
    if (!team) return null;
    const needle = q.trim().toLowerCase();
    if (!needle) return team.members;
    return team.members.filter((m) => `${m.name} ${m.email ?? ""}`.toLowerCase().includes(needle));
  }, [team, q]);

  const inviteButton = (
    <Button onClick={() => setInviteOpen(true)}>
      <UserPlus className="size-4" /> Invite
    </Button>
  );

  return (
    <div>
      <PageHeader title="Team" description={description} />

      {/*
        Pending invitations sit ABOVE the roster and are not part of it: each one
        is holding a seat, so an owner who cannot see them cannot understand the
        count. They are their own group rather than ghost rows in the list,
        because everything you can do to a member — change their role, narrow
        their access — you cannot do to an invitation.
      */}
      {staff && staff.invitations.length > 0 && (
        <Section title="Invited — not signed in yet" className="mb-6">
          <Group>
            {staff.invitations.map((inv) => (
              <Row
                key={inv.id}
                icon={MailWarning}
                iconTone="warning"
                sub={`${inv.role} · holding a seat`}
                trailing={
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => cancelInvite(inv.id, inv.email)}>
                    Cancel
                  </Button>
                }
              >
                {inv.email}
              </Row>
            ))}
          </Group>
        </Section>
      )}

      {/*
        One rendering, not two. This was a desktop `<Table>` and a duplicated
        stack of mobile cards — the same four facts written twice, which is how
        the two drift. A `Row` is the same object at every width, and the role
        moved from an inline 150px `<Select>` into the ⋮ menu so nothing has to
        be cramped to fit a phone.
      */}
      <Collection
        items={shown}
        itemKey={(m: TenantMember) => m.memberId}
        error={error}
        onRetry={reload}
        noun="members"
        query={q}
        onQuery={setQ}
        action={inviteButton}
        empty={{
          icon: UserPlus,
          title: "Nobody here yet",
          description: "Invite a colleague — they set themselves up and sign in with a one-time code.",
          action: inviteButton,
        }}
        renderList={(m: TenantMember) => (
          <Row
            icon={m.email ? UserRound : UserX}
            iconTone={m.email ? "primary" : "warning"}
            sub={m.email ?? "No address — this member cannot be sent a sign-in code"}
            value={<Badge className="capitalize">{m.role}</Badge>}
            trailing={<MemberMenu m={m} roles={roles} onRole={changeRole} onEdit={setEditAccess} onRevoke={revoke} />}
          >
            {m.name}
          </Row>
        )}
      />

      <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} roles={roles} onSent={reload} />
      <EditAccessDialog member={editAccess} onClose={() => setEditAccess(null)} onSaved={reload} />
    </div>
  );
}

/**
 * Everything you can do to one member, in one menu.
 *
 * The role lives here rather than in an always-visible `<Select>` because
 * changing somebody's role is not a thing you do while scanning a roster — and
 * a select that is always armed on every row is a mis-tap away from demoting a
 * colleague.
 */
function MemberMenu({
  m,
  roles,
  onRole,
  onEdit,
  onRevoke,
}: {
  m: TenantMember;
  roles: Role[];
  onRole: (m: TenantMember, r: Role) => void;
  onEdit: (m: TenantMember) => void;
  onRevoke: (m: TenantMember) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${m.name}`}>
          <MoreVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Role</DropdownMenuLabel>
        {roles.map((r) => (
          <DropdownMenuItem key={r} disabled={r === m.role} onSelect={() => onRole(m, r)}>
            <span className="capitalize">{r}</span>
            {r === m.role && <Check className="ml-auto size-4" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onEdit(m)}>
          <SlidersHorizontal className="size-4" /> Narrow access…
        </DropdownMenuItem>
        <DropdownMenuItem className="text-destructive" onSelect={() => onRevoke(m)}>
          <Trash2 className="size-4" /> Remove
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Edit an existing member's exact permissions (custom grant). */
function EditAccessDialog({ member, onClose, onSaved }: { member: TenantMember | null; onClose: () => void; onSaved: () => void }) {
  const [grant, setGrant] = useState<Grant>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (member) setGrant(cloneGrant(member.permissions ?? {}));
  }, [member]);
  async function save() {
    if (!member) return;
    setBusy(true);
    try {
      await setMemberPermissions(member.memberId, grant);
      toast.success(`Access updated for ${member.name}.`);
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={!!member}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent title={<>Access for {member?.name}</>}>
        <DialogDescription>Check exactly what this person can do. Applying a role from the dropdown resets these to that preset.</DialogDescription>
        <div className="mb-2">
          <PresetRow onPick={(r) => setGrant(cloneGrant(ROLE_PRESETS[r] ?? {}))} />
        </div>
        <PermissionGrid value={grant} onChange={setGrant} />
        {/*
          This can only ever take capability AWAY. The server intersects what is
          saved here with the member's ROLE preset, so ticking a box their role
          does not carry is not an error and is not applied — it simply resolves
          to nothing. Saying so beats an owner discovering it by testing.
        */}
        <p className="mt-2 text-xs text-muted-foreground">
          Narrows what the role already allows. Anything ticked here that their role doesn't include is ignored — change the role to grant more.
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : "Save access"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Invite somebody. An address and a role — nothing else, because nothing else is
 * ours to decide: they choose their own name when they accept, and there is no
 * credential to generate.
 *
 * ⚠️ The LINK is shown when delivery failed, and that is deliberate rather than
 * a fallback nobody thought about. The invitation is created before the email is
 * attempted and is NOT rolled back if the mail bounces — an invitation that
 * exists and cannot be delivered is recoverable (hand the link over); one that
 * was rolled back looks to the owner exactly like one that worked.
 */
function InviteDialog({ open, onClose, roles, onSent }: { open: boolean; onClose: () => void; roles: Role[]; onSent: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("receptionist");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState<{ url: string; emailed: boolean; emailError: string | null } | null>(null);

  function reset() {
    setEmail("");
    setRole("receptionist");
    setErr(null);
    setSent(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await inviteStaff({ email: email.trim(), role });
      setSent({ url: r.url, emailed: r.emailed, emailError: r.emailError });
      onSent();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not send the invitation");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
          reset();
        }
      }}
    >
      <DialogContent title={!sent ? "Invite someone" : sent.emailed ? "Invitation sent" : "Invitation created"}>
        {sent ? (
          <>
            <DialogDescription>
              {sent.emailed
                ? "They'll get an email with a link. It works once, and expires in seven days."
                : "The email could not be delivered, so pass this link on yourself. It works once, and expires in seven days."}
            </DialogDescription>
            {!sent.emailed && (
              <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
                <MailWarning className="mt-0.5 size-4 shrink-0 text-warning" />
                {/* The server's own words — it is the side that knows why. */}
                <span>{sent.emailError ?? "The email could not be sent."} The invitation itself is fine.</span>
              </div>
            )}
            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3">
              <code className="min-w-0 flex-1 truncate font-mono text-xs">{sent.url}</code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  void navigator.clipboard.writeText(sent.url);
                  toast.success("Link copied.");
                }}
              >
                <Copy className="size-3.5" />
              </Button>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={reset}>
                Invite someone else
              </Button>
              <Button
                onClick={() => {
                  onClose();
                  reset();
                }}
              >
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit}>
            <DialogDescription>They'll set themselves up and sign in with a one-time code — there's no password for you to choose.</DialogDescription>
            <div className="space-y-3 py-3">
              <div>
                <Label htmlFor="inv-email">Email</Label>
                <Input
                  id="inv-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="colleague@company.com"
                  autoComplete="off"
                  required
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="inv-role">Role</Label>
                <Select
                  value={role}
                  onChange={(v) => setRole(v as Role)}
                  className="mt-1.5"
                  id="inv-role"
                  options={[...roles.map((r) => ({ value: r, label: <span className="capitalize">{r}</span> }))]}
                />
                <p className="mt-1.5 text-xs text-muted-foreground">You can narrow what they can do once they've accepted.</p>
              </div>
              {err && <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{err}</div>}
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !email.trim()}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send invitation"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

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
import { useEffect, useState } from "react";
import { Loader2, UserPlus, Trash2, SlidersHorizontal, Copy, MailWarning } from "lucide-react";
import { Button } from "../components/ui/button.js";
import { Card, CardContent } from "../components/ui/card.js";
import { Input } from "../components/ui/input.js";
import { Label } from "../components/ui/label.js";
import { Badge } from "../components/ui/badge.js";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select.js";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table.js";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../components/ui/dialog.js";
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
import { PageHeader } from "../components/page-header.js";
import { LoadError } from "../components/load-error.js";
import { usePageChrome } from "../components/page-chrome.js";
import { toast } from "../components/toast.js";
import { confirmDialog } from "../components/confirm.js";
import { cn } from "@/lib/utils";

type Grant = Record<string, string[]>;
const cloneGrant = (g: Grant): Grant => Object.fromEntries(Object.entries(g).map(([k, v]) => [k, [...v]]));

/** A resource×action permission checklist. Toggling edits the grant in place. */
function PermissionGrid({ value, onChange }: { value: Grant; onChange: (g: Grant) => void }) {
  function toggle(res: string, act: string) {
    const cur = new Set(value[res] ?? []);
    if (cur.has(act)) cur.delete(act); else cur.add(act);
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
                <button key={a} type="button" onClick={() => toggle(r.resource, a)}
                  className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-medium capitalize transition-colors", on ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent")}>
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
        <button key={r} type="button" onClick={() => onPick(r)} className="rounded-md border px-2 py-0.5 text-[11px] font-medium capitalize hover:bg-accent">{r}</button>
      ))}
    </div>
  );
}

export function TeamPage() {
  const [team, setTeam] = useState<TeamState | null>(null);
  const [staff, setStaff] = useState<StaffState | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  /*
    A FAILED LOAD MUST NOT RENDER AS AN EMPTY TEAM.

    `.catch(() => setTeam({ members: [] }))` is the shape this had, and it draws
    "No members yet" over a network error — on the one screen where that reads as
    "your colleagues' access is gone". `team` stays null and `loadFailed` carries
    the retry.
  */
  const [loadFailed, setLoadFailed] = useState(false);
  const reload = () =>
    Promise.all([getTeam(), getStaff()])
      .then(([t, st]) => { setTeam(t); setStaff(st); setLoadFailed(false); })
      .catch(() => setLoadFailed(true));
  useEffect(() => { reload(); }, []);

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

  return (
    <div>
      <PageHeader title="Team" description={description} />

      {loadFailed && <LoadError what="the team" onRetry={reload} />}

      {staff && staff.invitations.length > 0 && (
        <Card className="mb-4">
          <CardContent className="p-0">
            <div className="border-b px-4 py-2.5 text-xs font-semibold text-muted-foreground">
              Invited — not signed in yet. Each one is holding a seat.
            </div>
            <div className="divide-y">
              {staff.invitations.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{inv.email}</div>
                    <div className="text-xs capitalize text-muted-foreground">{inv.role}</div>
                  </div>
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => cancelInvite(inv.id, inv.email)}>
                    Cancel
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {!team ? (
            <div className="grid place-items-center p-10 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : team.members.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">Nobody here yet. Invite someone to get started.</div>
          ) : (
            <>
              {/* Desktop: table */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Member</TableHead>
                      <TableHead>Sign in</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {team.members.map((m) => (
                      <TableRow key={m.memberId}>
                        <TableCell>
                          <div className="font-medium">{m.name}</div>
                          {m.email && <div className="text-xs text-muted-foreground">{m.email}</div>}
                        </TableCell>
                        <TableCell><SignIn m={m} /></TableCell>
                        <TableCell>
                          <RoleSelect m={m} roles={roles} onChange={changeRole} />
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <MemberActions m={m} onRevoke={revoke} onEdit={setEditAccess} />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile: stacked cards */}
              <div className="divide-y md:hidden">
                {team.members.map((m) => (
                  <div key={m.memberId} className="flex flex-col gap-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium">{m.name}</div>
                        {m.email && <div className="truncate text-xs text-muted-foreground">{m.email}</div>}
                        <div className="mt-1.5"><SignIn m={m} /></div>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <MemberActions m={m} onRevoke={revoke} onEdit={setEditAccess} />
                      </div>
                    </div>
                    <RoleSelect m={m} roles={roles} onChange={changeRole} className="w-full" />
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} roles={roles} onSent={reload} />
      <EditAccessDialog member={editAccess} onClose={() => setEditAccess(null)} onSaved={reload} />
    </div>
  );
}

/** Edit an existing member's exact permissions (custom grant). */
function EditAccessDialog({ member, onClose, onSaved }: { member: TenantMember | null; onClose: () => void; onSaved: () => void }) {
  const [grant, setGrant] = useState<Grant>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (member) setGrant(cloneGrant(member.permissions ?? {})); }, [member]);
  async function save() {
    if (!member) return;
    setBusy(true);
    try {
      await setMemberPermissions(member.memberId, grant);
      toast.success(`Access updated for ${member.name}.`);
      onSaved();
      onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save"); }
    finally { setBusy(false); }
  }
  return (
    <Dialog open={!!member} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Access for {member?.name}</DialogTitle>
          <DialogDescription>
            Check exactly what this person can do. Applying a role from the dropdown resets these to that preset.
          </DialogDescription>
        </DialogHeader>
        <div className="mb-2"><PresetRow onPick={(r) => setGrant(cloneGrant(ROLE_PRESETS[r] ?? {}))} /></div>
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
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : "Save access"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * How a member signs in. There is one answer now, which is the point.
 *
 * The badge stays rather than being deleted because the column used to carry
 * real information — some people signed in with a handle and a password — and
 * an owner who remembers that needs to be told it is no longer true.
 */
function SignIn({ m }: { m: TenantMember }) {
  return m.email ? <Badge variant="outline">email code · passkey</Badge> : <Badge variant="secondary">no address</Badge>;
}

/** Inline role changer (shared by the desktop table + mobile cards). */
function RoleSelect({ m, roles, onChange, className }: { m: TenantMember; roles: Role[]; onChange: (m: TenantMember, r: Role) => void; className?: string }) {
  return (
    <Select value={m.role} onValueChange={(v) => onChange(m, v as Role)}>
      <SelectTrigger className={cn("h-8 w-[150px]", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {roles.map((r) => (
          <SelectItem key={r} value={r}>
            <span className="capitalize">{r}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Edit-access (permissions) + remove. The reset-password control that sat
 *  between them is gone with the passwords. */
function MemberActions({ m, onRevoke, onEdit }: { m: TenantMember; onRevoke: (m: TenantMember) => void; onEdit: (m: TenantMember) => void }) {
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => onEdit(m)} title="Edit access">
        <SlidersHorizontal className="size-4" />
      </Button>
      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => onRevoke(m)} title="Remove">
        <Trash2 className="size-4" />
      </Button>
    </>
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
    setEmail(""); setRole("receptionist"); setErr(null); setSent(null);
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
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); reset(); } }}>
      <DialogContent>
        {sent ? (
          <>
            <DialogHeader>
              <DialogTitle>{sent.emailed ? "Invitation sent" : "Invitation created"}</DialogTitle>
              <DialogDescription>
                {sent.emailed
                  ? "They'll get an email with a link. It works once, and expires in seven days."
                  : "The email could not be delivered, so pass this link on yourself. It works once, and expires in seven days."}
              </DialogDescription>
            </DialogHeader>
            {!sent.emailed && (
              <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
                <MailWarning className="mt-0.5 size-4 shrink-0 text-warning" />
                {/* The server's own words — it is the side that knows why. */}
                <span>{sent.emailError ?? "The email could not be sent."} The invitation itself is fine.</span>
              </div>
            )}
            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3">
              <code className="min-w-0 flex-1 truncate font-mono text-xs">{sent.url}</code>
              <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(sent.url); toast.success("Link copied."); }}>
                <Copy className="size-3.5" />
              </Button>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={reset}>Invite someone else</Button>
              <Button onClick={() => { onClose(); reset(); }}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>Invite someone</DialogTitle>
              <DialogDescription>They'll set themselves up and sign in with a one-time code — there's no password for you to choose.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-3">
              <div>
                <Label htmlFor="inv-email">Email</Label>
                <Input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="colleague@company.com" autoComplete="off" required className="mt-1.5" />
              </div>
              <div>
                <Label htmlFor="inv-role">Role</Label>
                <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                  <SelectTrigger id="inv-role" className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {roles.map((r) => <SelectItem key={r} value={r}><span className="capitalize">{r}</span></SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="mt-1.5 text-xs text-muted-foreground">You can narrow what they can do once they've accepted.</p>
              </div>
              {err && <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{err}</div>}
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={busy || !email.trim()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send invitation"}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

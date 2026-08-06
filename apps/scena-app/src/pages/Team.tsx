/**
 * Team — the tenant admin's control over who can sign in and what they can do.
 *
 * Two kinds of member sit side by side: **owners/managers** (real email, OTP
 * sign-in) and **staff** (a username + password the admin sets here). The admin
 * can add staff, reset a staff password, change anyone's role, or revoke access.
 * Staff sign in at the workspace slug shown at the top of the page.
 *
 * Guarded to owner/operator by the API + nav; this screen assumes the caller can
 * manage members.
 */
import { useEffect, useState } from "react";
import { Loader2, UserPlus, KeyRound, Trash2, RefreshCw, SlidersHorizontal } from "lucide-react";
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
  createStaffMember,
  resetMemberPassword,
  setMemberRole,
  setMemberPermissions,
  revokeMember,
  type TeamState,
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

function randomPassword(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "").slice(0, 10);
}

export function TeamPage() {
  const [team, setTeam] = useState<TeamState | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [resetFor, setResetFor] = useState<TenantMember | null>(null);

  const [loadFailed, setLoadFailed] = useState(false);
  const reload = () => getTeam().then((t) => { setTeam(t); setLoadFailed(false); }).catch(() => { setTeam((prev) => prev ?? { members: [], loginSlug: null, roles: ["owner", "operator", "receptionist", "viewer"] }); setLoadFailed(true); });
  useEffect(() => { reload(); }, []);

  const [editAccess, setEditAccess] = useState<TenantMember | null>(null);

  async function changeRole(m: TenantMember, role: Role) {
    try {
      // Applying a role resets the member to that role's preset (clears any
      // custom grant), so role + effective access stay consistent.
      await setMemberRole(m.memberId, role);
      await setMemberPermissions(m.memberId, {}).catch(() => {});
      reload();
      toast.success(`${m.name} is now ${role}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not change role");
    }
  }

  async function revoke(m: TenantMember) {
    const ok = await confirmDialog({
      title: `Revoke ${m.name}?`,
      description: "Their access is removed and any active sessions end immediately.",
      confirmText: "Revoke access",
      destructive: true,
    });
    if (!ok) return;
    try {
      await revokeMember(m.memberId);
      reload();
      toast.success(`${m.name} was revoked.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not revoke");
    }
  }

  const roles = team?.roles ?? (["owner", "operator", "receptionist", "viewer"] as Role[]);

  usePageChrome(
    { crumbs: [{ label: "Team" }], actions: [{ key: "add", label: "Add staff", icon: <UserPlus className="size-4" />, onClick: () => setAddOpen(true) }] },
    [],
  );

  return (
    <div>
      <PageHeader
        title="Team"
        description={team ? `${team.members.length} member${team.members.length === 1 ? "" : "s"} · owners sign in by email, staff by username + password` : "Who can sign in, and what they can do."}
      />

      {loadFailed && <LoadError what="the team" onRetry={reload} />}
      <Card>
        <CardContent className="p-0">
          {!team ? (
            <div className="grid place-items-center p-10 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : team.members.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">No members yet. Add a staff login to get started.</div>
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
                            <MemberActions m={m} onReset={setResetFor} onRevoke={revoke} onEdit={setEditAccess} />
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
                        <MemberActions m={m} onReset={setResetFor} onRevoke={revoke} onEdit={setEditAccess} />
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

      <AddStaffDialog open={addOpen} onClose={() => setAddOpen(false)} roles={roles} onCreated={reload} />
      <ResetPasswordDialog member={resetFor} onClose={() => setResetFor(null)} />
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
          <DialogDescription>Check exactly what this user can do. Applying a role from the dropdown resets these to that preset.</DialogDescription>
        </DialogHeader>
        <div className="mb-2"><PresetRow onPick={(r) => setGrant(cloneGrant(ROLE_PRESETS[r] ?? {}))} /></div>
        <PermissionGrid value={grant} onChange={setGrant} />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : "Save access"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** How a member signs in — an OTP email badge, or the staff username. */
function SignIn({ m }: { m: TenantMember }) {
  return m.isStaff ? (
    <span className="flex items-center gap-1.5 text-sm">
      <Badge variant="secondary">staff</Badge>
      <code className="font-mono text-xs">{m.username}</code>
    </span>
  ) : (
    <Badge variant="outline">email · OTP</Badge>
  );
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

/** Edit-access (permissions) + reset-password (staff only) + revoke controls. */
function MemberActions({ m, onReset, onRevoke, onEdit }: { m: TenantMember; onReset: (m: TenantMember) => void; onRevoke: (m: TenantMember) => void; onEdit: (m: TenantMember) => void }) {
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => onEdit(m)} title="Edit access">
        <SlidersHorizontal className="size-4" />
      </Button>
      {m.isStaff && (
        <Button size="sm" variant="ghost" onClick={() => onReset(m)} title="Reset password">
          <KeyRound className="size-4" />
        </Button>
      )}
      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => onRevoke(m)} title="Revoke access">
        <Trash2 className="size-4" />
      </Button>
    </>
  );
}

function AddStaffDialog({ open, onClose, roles, onCreated }: { open: boolean; onClose: () => void; roles: Role[]; onCreated: () => void }) {
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("receptionist");
  const [grant, setGrant] = useState<Grant>(() => cloneGrant(ROLE_PRESETS.receptionist!));
  const [password, setPassword] = useState(randomPassword);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ username: string } | null>(null);
  void roles;

  function pickPreset(r: Role) {
    setRole(r);
    setGrant(cloneGrant(ROLE_PRESETS[r] ?? {}));
  }

  function reset() {
    setUsername(""); setName(""); setRole("receptionist"); setGrant(cloneGrant(ROLE_PRESETS.receptionist!)); setPassword(randomPassword()); setErr(null); setDone(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await createStaffMember({ username: username.trim(), password, role, name: name.trim() || undefined, permissions: grant });
      setDone({ username: username.trim().toLowerCase() });
      onCreated();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not create member");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); reset(); } }}>
      <DialogContent>
        {done ? (
          <>
            <DialogHeader>
              <DialogTitle>Staff account created</DialogTitle>
              <DialogDescription>Share these credentials — they sign in with just their username + password.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2 rounded-lg border bg-muted/40 p-4 text-sm">
              <div className="flex items-center justify-between gap-3"><span className="shrink-0 text-muted-foreground">Username</span><code className="truncate font-mono font-semibold">{done.username}</code></div>
              <div className="flex items-center justify-between gap-3"><span className="shrink-0 text-muted-foreground">Password</span><code className="truncate font-mono font-semibold">{password}</code></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={reset}>Add another</Button>
              <Button onClick={() => { onClose(); reset(); }}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>Add a staff member</DialogTitle>
              <DialogDescription>They sign in with a username + password — no email needed.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-3">
              <div>
                <Label htmlFor="su">Username</Label>
                <Input id="su" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="frontdesk" autoCapitalize="none" required className="mt-1.5" />
              </div>
              <div>
                <Label htmlFor="sn">Display name (optional)</Label>
                <Input id="sn" value={name} onChange={(e) => setName(e.target.value)} placeholder="Front Desk" className="mt-1.5" />
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <Label>Permissions</Label>
                </div>
                <div className="mb-2"><PresetRow onPick={pickPreset} /></div>
                <PermissionGrid value={grant} onChange={setGrant} />
                <p className="mt-1.5 text-xs text-muted-foreground">Pick a preset to start, then check exactly what this user can do.</p>
              </div>
              <div>
                <Label htmlFor="sp">Password</Label>
                <div className="mt-1.5 flex gap-2">
                  <Input id="sp" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="font-mono" />
                  <Button type="button" variant="outline" size="icon" onClick={() => setPassword(randomPassword())} title="Generate">
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {err && <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{err}</div>}
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({ member, onClose }: { member: TenantMember | null; onClose: () => void }) {
  const [password, setPassword] = useState(randomPassword);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => { if (member) { setPassword(randomPassword()); setErr(null); setDone(false); } }, [member]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!member) return;
    setBusy(true);
    setErr(null);
    try {
      await resetMemberPassword(member.memberId, password);
      setDone(true);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not reset password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={Boolean(member)} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>
              Set a new password for <span className="font-medium text-foreground">{member?.username}</span>. Their current sessions end immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-3">
            <div className="flex gap-2">
              <Input value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="font-mono" />
              <Button type="button" variant="outline" size="icon" onClick={() => setPassword(randomPassword())} title="Generate"><RefreshCw className="h-4 w-4" /></Button>
            </div>
            {done && <div className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">Password updated. Share it with the member.</div>}
            {err && <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{err}</div>}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>{done ? "Close" : "Cancel"}</Button>
            {!done && <Button type="submit" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Set password"}</Button>}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

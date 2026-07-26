/**
 * Staff management — roster, role changes, custom permission grants, invite.
 *
 * Both mutating paths here can be refused by the plan's `staffSeats` ceiling —
 * inviting reserves a seat, promoting a client-role member to staff claims one —
 * and the server's message names the fix ("free a seat or upgrade"). Show it
 * verbatim: a bare "Invite failed" hides a billing decision behind a shrug.
 */

import { useCallback, useEffect, useState } from "react";
import { PERMISSION_CATALOG } from "@mossa/domain";
import { Button, Card, Badge, Field, Sheet, Avatar, Select, Chip, Page, Stagger, SectionHeader, ConfirmDialog, Reveal, SkeletonRow, Users, Mail, ShieldCheck, Plus, personaLabel, personaTone } from "@mossa/ui";
import { api, errorText } from "../../api.js";
import { useSession } from "../../session.js";

interface Member { userId: string; role: string; name: string | null; email: string | null; customGrant?: Record<string, string[]> | null }
// Labels + tones read from the persona registry — `trainer` shows as "Coach".
const ROLES = ["owner", "trainer", "assistant", "client"].map((value) => ({ value, label: personaLabel(value) }));

export function Staff() {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"trainer" | "assistant">("trainer");
  const [msg, setMsg] = useState<string | null>(null);
  const [permMember, setPermMember] = useState<Member | null>(null);
  const [pendingRole, setPendingRole] = useState<{ member: Member; role: string } | null>(null);

  const load = useCallback(async () => setMembers((await api.get<{ members: Member[] }>("/api/members")).members), []);
  useEffect(() => void load(), [load]);

  const [busy, setBusy] = useState(false);
  const changeRole = async (userId: string, newRole: string) => {
    setBusy(true);
    setMsg(null);
    try { await api.patch(`/api/members/${userId}/role`, { role: newRole }); await load(); }
    catch (e) {
      // The seat-ceiling 403 and the last-owner 409 both carry usable copy.
      setMsg(e instanceof Error && e.message.includes("last owner") ? "Can't demote the last owner." : errorText(e, "Couldn't change role."));
    }
    finally { setBusy(false); }
  };
  const ROLE_LABEL = (r: string) => personaLabel(r);
  const myUserId = useSession().ctx?.user.id ?? null;
  const invite = async () => {
    setBusy(true);
    setMsg(null);
    try { await api.post("/api/auth/organization/invite-member", { email, role }); setMsg(`Invite sent to ${email}.`); setInviteOpen(false); setEmail(""); }
    catch (e) { setMsg(errorText(e, "Invite failed — check the email and try again.")); }
    finally { setBusy(false); }
  };

  return (
    <Page className="mx-auto max-w-xl space-y-3 p-4 pb-28">
      <SectionHeader icon={Users} tone="cardio" title="Staff" action={<Button size="sm" onClick={() => setInviteOpen(true)}><Plus /> Invite</Button>} />
      {msg && <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{msg}</p>}
      <Reveal loading={!members} className="space-y-3" skeleton={
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-2xl bg-card p-4"><SkeletonRow thumb={40} /></div>
          ))}
        </div>
      }>
        {members && (
        <>
          <Stagger className="space-y-2">
            {members.filter((m) => m.role !== "client").map((m) => (
              <Card key={m.userId} className="flex items-center gap-3">
                <Avatar name={m.name || m.email || "?"} seed={m.email ?? m.userId} className="size-10" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{m.name || m.email}</span>
                    <Badge tone={personaTone(m.role, { self: m.userId === myUserId })}>{personaLabel(m.role, { self: m.userId === myUserId })}</Badge>
                    {m.customGrant && <Badge tone="warning">Custom</Badge>}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{m.email}</div>
                </div>
                {m.role !== "owner" && <Button size="icon" variant="secondary" aria-label="Permissions" onClick={() => setPermMember(m)}><ShieldCheck /></Button>}
                {/* `Select` has no disabled prop, so gate the mutation itself on
                    `busy` — a second role change mid-flight would race the roster
                    reload and show a stale role. */}
                <div className="w-28"><Select aria-label="Role" value={m.role} onChange={(v) => v !== m.role && !busy && setPendingRole({ member: m, role: v })} options={ROLES} /></div>
              </Card>
            ))}
          </Stagger>
          <p className="pt-1 text-xs text-muted-foreground">Clients appear in the Clients tab, not here.</p>
        </>
        )}
      </Reveal>

      <Sheet open={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite staff">
        <div className="space-y-4">
          <Field label="Email" icon={Mail} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <div className="flex gap-2"><Chip selected={role === "trainer"} onClick={() => setRole("trainer")}>{personaLabel("trainer")}</Chip><Chip selected={role === "assistant"} onClick={() => setRole("assistant")}>{personaLabel("assistant")}</Chip></div>
          <Button size="lg" className="w-full" disabled={!email.includes("@") || busy} onClick={() => void invite()}>{busy ? "Sending…" : "Send invite"}</Button>
          <p className="text-xs text-muted-foreground">They sign in with a code — no password to set.</p>
        </div>
      </Sheet>

      {permMember && <PermissionSheet member={permMember} onClose={() => setPermMember(null)} onSaved={() => { setPermMember(null); void load(); }} />}

      <ConfirmDialog
        open={!!pendingRole}
        onOpenChange={(o) => !o && setPendingRole(null)}
        title={pendingRole ? `Change role to ${ROLE_LABEL(pendingRole.role)}?` : "Change role?"}
        description={pendingRole ? `${pendingRole.member.name || pendingRole.member.email || "This member"} will have the ${ROLE_LABEL(pendingRole.role)} role. This changes what they can access${pendingRole.role === "client" ? " and removes their staff powers" : ""}.` : undefined}
        confirmLabel="Change role"
        destructive={pendingRole?.role === "client" || pendingRole?.role === "assistant"}
        onConfirm={() => { if (pendingRole) void changeRole(pendingRole.member.userId, pendingRole.role); }}
      />
    </Page>
  );
}

function PermissionSheet({ member, onClose, onSaved }: { member: Member; onClose: () => void; onSaved: () => void }) {
  const [grant, setGrant] = useState<Record<string, string[]>>(() => structuredClone(member.customGrant ?? {}));
  const [busy, setBusy] = useState(false);
  const toggle = (res: string, action: string) => setGrant((g) => {
    const cur = new Set(g[res] ?? []);
    cur.has(action) ? cur.delete(action) : cur.add(action);
    const next = { ...g };
    if (cur.size) next[res] = [...cur]; else delete next[res];
    return next;
  });
  const save = async () => {
    setBusy(true);
    try { await api.patch(`/api/members/${member.userId}/permissions`, { permissions: Object.keys(grant).length ? grant : null }); onSaved(); }
    finally { setBusy(false); }
  };
  return (
    <Sheet open onClose={onClose} title={`Access — ${member.name || member.email}`}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Override the role's defaults with a custom grant. Clear everything to fall back to the {personaLabel(member.role)} role.</p>
        <div className="max-h-[55vh] space-y-3 overflow-y-auto">
          {Object.entries(PERMISSION_CATALOG).map(([res, actions]) => (
            <div key={res}>
              <div className="mb-1.5 text-sm font-medium capitalize">{res}</div>
              <div className="flex flex-wrap gap-2">{actions.map((a) => <Chip key={a} selected={(grant[res] ?? []).includes(a)} onClick={() => toggle(res, a)}>{a}</Chip>)}</div>
            </div>
          ))}
        </div>
        <Button size="lg" className="w-full" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save access"}</Button>
      </div>
    </Sheet>
  );
}

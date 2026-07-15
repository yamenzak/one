/** Staff management — roster, role changes, custom permission grants, invite. */

import { useCallback, useEffect, useState } from "react";
import { PERMISSION_CATALOG } from "@mossa/domain";
import { Button, Card, Badge, Field, Sheet, Avatar, Select, Chip, Page, Stagger, SectionHeader, Reveal, SkeletonRow, Users, Mail, ShieldCheck, Plus } from "@mossa/ui";
import { api } from "../../api.js";

interface Member { userId: string; role: string; name: string | null; email: string | null; customGrant?: Record<string, string[]> | null }
const ROLES = [
  { value: "owner", label: "Owner" }, { value: "trainer", label: "Trainer" }, { value: "assistant", label: "Assistant" }, { value: "client", label: "Client" },
];

export function Staff() {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"trainer" | "assistant">("trainer");
  const [msg, setMsg] = useState<string | null>(null);
  const [permMember, setPermMember] = useState<Member | null>(null);

  const load = useCallback(async () => setMembers((await api.get<{ members: Member[] }>("/api/members")).members), []);
  useEffect(() => void load(), [load]);

  const changeRole = async (userId: string, newRole: string) => {
    try { await api.patch(`/api/members/${userId}/role`, { role: newRole }); await load(); }
    catch (e) { setMsg(e instanceof Error && e.message.includes("last owner") ? "Can't demote the last owner." : "Couldn't change role."); }
  };
  const invite = async () => {
    try { await api.post("/api/auth/organization/invite-member", { email, role }); setMsg(`Invite sent to ${email}.`); setInviteOpen(false); setEmail(""); }
    catch { setMsg("Invite failed — check the email and try again."); }
  };

  return (
    <Page className="mx-auto max-w-xl space-y-3 p-4 pb-28">
      <SectionHeader icon={Users} tone="cardio" title="Staff" action={<Button size="sm" onClick={() => setInviteOpen(true)}><Plus /> Invite</Button>} />
      {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
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
                  <div className="flex items-center gap-2"><span className="truncate font-medium">{m.name || m.email}</span>{m.customGrant && <Badge tone="warning">Custom</Badge>}</div>
                  <div className="truncate text-xs text-muted-foreground">{m.email}</div>
                </div>
                {m.role !== "owner" && <Button size="icon" variant="secondary" aria-label="Permissions" onClick={() => setPermMember(m)}><ShieldCheck /></Button>}
                <div className="w-28"><Select value={m.role} onChange={(v) => void changeRole(m.userId, v)} options={ROLES} /></div>
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
          <div className="flex gap-2"><Chip selected={role === "trainer"} onClick={() => setRole("trainer")}>Trainer</Chip><Chip selected={role === "assistant"} onClick={() => setRole("assistant")}>Assistant</Chip></div>
          <Button size="lg" className="w-full" disabled={!email.includes("@")} onClick={() => void invite()}>Send invite</Button>
          <p className="text-xs text-muted-foreground">They sign in with a code — no password to set.</p>
        </div>
      </Sheet>

      {permMember && <PermissionSheet member={permMember} onClose={() => setPermMember(null)} onSaved={() => { setPermMember(null); void load(); }} />}
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
        <p className="text-sm text-muted-foreground">Override the role's defaults with a custom grant. Clear everything to fall back to the {member.role} role.</p>
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

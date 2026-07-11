/** Staff management — roster, role changes, email invite. */

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Field, Sheet, Skeleton, Avatar, Select, Chip, Page, Stagger, Mail, Plus } from "@mossa/ui";
import { api } from "../../api.js";

interface Member { userId: string; role: string; name: string | null; email: string | null }
const ROLES = [
  { value: "owner", label: "Owner" }, { value: "trainer", label: "Trainer" }, { value: "assistant", label: "Assistant" }, { value: "client", label: "Client" },
];

export function Staff() {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"trainer" | "assistant">("trainer");
  const [msg, setMsg] = useState<string | null>(null);

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

  if (!members) return <Skeleton className="m-4 h-64" />;

  return (
    <Page className="mx-auto max-w-xl space-y-3 p-4 pb-28">
      <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Staff</h2><Button size="sm" onClick={() => setInviteOpen(true)}><Plus /> Invite</Button></div>
      {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
      <Stagger className="space-y-2">
        {members.filter((m) => m.role !== "client").map((m) => (
          <Card key={m.userId} className="flex items-center gap-3">
            <Avatar name={m.name || m.email || "?"} className="size-10" />
            <div className="min-w-0 flex-1"><div className="truncate font-medium">{m.name || m.email}</div><div className="truncate text-xs text-muted-foreground">{m.email}</div></div>
            <div className="w-32"><Select value={m.role} onChange={(v) => void changeRole(m.userId, v)} options={ROLES} /></div>
          </Card>
        ))}
      </Stagger>
      <p className="pt-1 text-xs text-muted-foreground">Clients appear in the Clients tab, not here.</p>

      <Sheet open={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite staff">
        <div className="space-y-4">
          <Field label="Email" icon={Mail} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <div className="flex gap-2"><Chip selected={role === "trainer"} onClick={() => setRole("trainer")}>Trainer</Chip><Chip selected={role === "assistant"} onClick={() => setRole("assistant")}>Assistant</Chip></div>
          <Button size="lg" className="w-full" disabled={!email.includes("@")} onClick={() => void invite()}>Send invite</Button>
          <p className="text-xs text-muted-foreground">They sign in with a code — no password to set.</p>
        </div>
      </Sheet>
    </Page>
  );
}

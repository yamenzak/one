/**
 * Staff management (SPEC §4) — owner surface. List members, change roles,
 * invite by email (a client record with an email auto-links on their first
 * sign-in; staff invites use Better Auth's org invite).
 */

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Chip, Field, Sheet, Skeleton } from "@mossa/ui";
import { api } from "../../api.js";

interface Member {
  userId: string;
  role: string;
  name: string | null;
  email: string | null;
}

const ROLES = ["owner", "trainer", "assistant", "client"] as const;

export function Staff() {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"trainer" | "assistant">("trainer");
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await api.get<{ members: Member[] }>("/api/members");
    setMembers(r.members);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const changeRole = async (userId: string, newRole: string) => {
    try {
      await api.patch(`/api/members/${userId}/role`, { role: newRole });
      await load();
    } catch (e) {
      setMsg(e instanceof Error && e.message.includes("last owner") ? "Can't demote the last owner." : "Couldn't change role.");
    }
  };

  const invite = async () => {
    try {
      await api.post("/api/auth/organization/invite-member", { email, role });
      setMsg(`Invite sent to ${email}.`);
      setInviteOpen(false);
      setEmail("");
    } catch {
      setMsg("Invite failed — check the email and try again.");
    }
  };

  if (!members) return <Skeleton className="m-4 h-64" />;

  return (
    <div className="mx-auto max-w-xl space-y-3 p-4 pb-28">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Staff</h2>
        <Button onClick={() => setInviteOpen(true)}>＋ Invite</Button>
      </div>
      {msg && <p className="text-sm text-fg-muted">{msg}</p>}
      {members
        .filter((m) => m.role !== "client")
        .map((m) => (
          <Card key={m.userId} className="flex items-center justify-between">
            <div>
              <div className="font-medium">{m.name || m.email}</div>
              <div className="text-xs text-fg-muted">{m.email}</div>
            </div>
            <select value={m.role} onChange={(e) => void changeRole(m.userId, e.target.value)} className="rounded-full bg-surface-2 px-3 py-1.5 text-sm">
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </Card>
        ))}
      <p className="pt-2 text-xs text-fg-muted">Clients appear in the Clients tab, not here.</p>

      <Sheet open={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite staff">
        <div className="space-y-4">
          <Field label="Email" icon="✉️" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <div className="flex gap-2">
            <Chip tone={role === "trainer" ? "primary" : "neutral"}>
              <button onClick={() => setRole("trainer")}>Trainer</button>
            </Chip>
            <Chip tone={role === "assistant" ? "primary" : "neutral"}>
              <button onClick={() => setRole("assistant")}>Assistant</button>
            </Chip>
          </div>
          <Button size="lg" className="w-full" disabled={!email.includes("@")} onClick={() => void invite()}>
            Send invite
          </Button>
          <p className="text-xs text-fg-muted">They sign in with a code — no password to set.</p>
        </div>
      </Sheet>
    </div>
  );
}

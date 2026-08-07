/**
 * Staff management — roster, PENDING INVITATIONS, role changes, removal, and
 * custom permission grants.
 *
 * `/api/staff` is `@4dl/auth`'s, so the seat arithmetic, the guards and the
 * shape all come from one place. Three things on this screen did not exist
 * before that: a pending invitation was invisible (the old roster read joined
 * `member` alone), there was no way to revoke one, and no way to remove a
 * member at all. An invite to a mistyped address was permanent until it expired.
 *
 * The seat counters come from the SERVER now rather than being derived here.
 * The derived version could not see pending invitations, so it reported a free
 * seat that the invite button would then refuse — the exact number a coach uses
 * to decide whether to upgrade.
 *
 * Every mutating path can be refused by the plan's `staffSeats` ceiling, and the
 * server's message names the fix. Show it verbatim: a bare "Invite failed" hides
 * a billing decision behind a shrug.
 */

import { useCallback, useEffect, useState } from "react";
import { PERMISSION_CATALOG } from "@kova/domain";
import { Button, Card, Badge, Field, Sheet, Avatar, Select, Chip, Page, Stagger, Eyebrow, ConfirmDialog, Reveal, SkeletonRow, Users, Mail, ShieldCheck, UserMinus, Plus, Group, Row, Anchor, CountUp } from "@4dl/ui";
import { personaLabel, personaTone } from "../../registry/index.js";
import { api, errorText } from "../../api.js";
import { useSession } from "../../session.js";
import { useCan } from "../../FeatureLock.js";
import { staffAvatar } from "../../registry/avatars.js";

/* `clientId`/`avatarUrl`/`avatarSeed` come from `decorateMembers` — a staff
   member who also trains here wears the face they wear everywhere else. */
interface Member {
  userId: string; role: string; name: string | null; email: string | null;
  customGrant?: Record<string, string[]> | null;
  clientId?: string | null; avatarUrl?: string | null; avatarSeed?: string | null;
}
interface Invitation { id: string; email: string; role: string; expiresAt: string }
interface Seats { used: number; pending: number; max: number; remaining: number }
interface StaffPayload { members: Member[]; invitations: Invitation[]; seats: Seats; canManage: boolean }
// Labels + tones read from the persona registry — `trainer` shows as "Coach".
const roleOption = (value: string) => ({ value, label: personaLabel(value) });

export function Staff() {
  const { ctx } = useSession();
  const [data, setData] = useState<StaffPayload | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"trainer" | "assistant">("trainer");
  const [msg, setMsg] = useState<string | null>(null);
  const [permMember, setPermMember] = useState<Member | null>(null);
  const [pendingRole, setPendingRole] = useState<{ member: Member; role: string } | null>(null);
  const [pendingRemove, setPendingRemove] = useState<Member | null>(null);

  // The assistant SEAT is half of what `frontDesk` sells (SPEC §5), so a studio
  // without it should not be offered the role. `sessions` is the registry's
  // frontDesk spec. This is the UI half; the server's `checkRole` closes the
  // INVITE and the PROMOTION alike, so this only saves a coach the round trip.
  // Members already holding it stay listed and selectable (a grandfathered
  // assistant must remain demotable).
  const canAssistant = useCan("sessions");
  const rolesFor = (current: string) =>
    ["owner", "trainer", "assistant", "client"]
      .filter((r) => r !== "assistant" || canAssistant || current === "assistant")
      .map(roleOption);

  const load = useCallback(async () => setData(await api.get<StaffPayload>("/api/staff")), []);
  useEffect(() => void load(), [load]);
  const members = data?.members ?? null;

  // The seat ceiling was invisible until an invite bounced off it. It is the one
  // number on this tab a coach acts on — "can I add someone, or do I need to
  // upgrade first" — so it is the anchor (§1).
  //
  // Counted on the SERVER, because a pending invitation HOLDS a seat and this
  // screen cannot know that from the roster. Deriving it here reported a free
  // seat the invite button would then refuse.
  const seatCap = data ? (data.seats.max < 0 ? null : data.seats.max) : null;
  const seatsUsed = data ? data.seats.used : null;
  const seatsPending = data?.seats.pending ?? 0;
  const seatsLeft = data ? (data.seats.max < 0 ? null : data.seats.remaining) : null;

  const [busy, setBusy] = useState(false);
  const changeRole = async (userId: string, newRole: string) => {
    setBusy(true);
    setMsg(null);
    try { await api.patch(`/api/staff/${userId}/role`, { role: newRole }); await load(); }
    catch (e) {
      // The seat-ceiling 403 and the last-owner 409 both carry usable copy.
      setMsg(e instanceof Error && e.message.includes("last owner") ? "Can't demote the last owner." : errorText(e, "Couldn't change role."));
    }
    finally { setBusy(false); }
  };
  const removeMember = async (userId: string) => {
    setBusy(true);
    setMsg(null);
    try { await api.del(`/api/staff/${userId}`); await load(); }
    catch (e) { setMsg(errorText(e, "Couldn't remove them.")); }
    finally { setBusy(false); }
  };
  const revokeInvite = async (id: string) => {
    setBusy(true);
    setMsg(null);
    try { await api.del(`/api/staff/invitations/${id}`); await load(); }
    catch (e) { setMsg(errorText(e, "Couldn't revoke that invitation.")); }
    finally { setBusy(false); }
  };
  const ROLE_LABEL = (r: string) => personaLabel(r);
  const myUserId = ctx?.user.id ?? null;
  const invite = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.post<{ emailed: boolean; emailError: string | null }>("/api/staff/invite", { email, role });
      // A send failure does NOT lose the invitation — the row is the invitation
      // and the link still works. Saying "sent" when it bounced is the lie; so
      // is rolling it back and leaving nothing behind.
      setMsg(r.emailed ? `Invite sent to ${email}.` : `Invitation created, but the email didn't send (${r.emailError ?? "unknown"}). You can resend it or share the link.`);
      setInviteOpen(false);
      setEmail("");
      await load();
    }
    catch (e) { setMsg(errorText(e, "Invite failed — check the email and try again.")); }
    finally { setBusy(false); }
  };

  return (
    <Page className="column space-y-3 p-4 pb-28">
      {/* T1 — the tab's anchor (§1: a tabbed surface is N screens sharing chrome). */}
      {seatsUsed == null ? (
        <Anchor eyebrow="Staff seats" word="Loading…" className="pt-1" />
      ) : (
        <Anchor
          eyebrow="Staff seats"
          className="pt-1"
          sub={seatCap == null ? (seatsUsed === 1 ? "person on the team" : "people on the team")
            : seatsLeft === 0 ? `of ${seatCap} · none left${seatsPending ? ` (${seatsPending} invited)` : ""}`
            : `of ${seatCap} · ${seatsLeft} left${seatsPending ? ` (${seatsPending} invited)` : ""}`}
        >
          <CountUp value={seatsUsed} />
        </Anchor>
      )}
      {/* `Eyebrow`, like every other section on the Business tabs. `SectionHeader`
          is the in-CARD device; using both across four tabs of one screen gave the
          same idea two spellings. */}
      <Eyebrow action={<Button size="sm" onClick={() => setInviteOpen(true)}><Plus /> Invite</Button>}>Team</Eyebrow>
      {msg && <p role="status" aria-live="polite" className="text-body text-muted-foreground">{msg}</p>}
      <Reveal loading={!members} className="space-y-3" skeleton={
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-2xl bg-card p-4"><SkeletonRow thumb={40} /></div>
          ))}
        </div>
      }>
        {members && (
        <>
          <Group>
            {members.filter((m) => m.role !== "client").map((m) => (
              <Row
                key={m.userId}
                leading={<Avatar {...staffAvatar(m)} className="size-10" />}
                /*
                  TWO TRAILING CONTROLS, NOT THREE AND A DROPDOWN (§7).

                  This row carried a permissions button, a remove button AND a
                  112px `Select` — beside a title that was the name plus up to
                  two badges. At 375px the name had barely 80px, so every staff
                  member on the team read as a truncation with three controls
                  after it.

                  The ROLE moves into the sub-line, where it is a fact rather
                  than a control, and changing it becomes the row's own job:
                  tapping opens the permissions sheet, which is where a role and
                  its grants belong together anyway. That leaves one trailing
                  verb — remove — which is the only one that is not "edit this
                  person".
                */
                sub={[
                  personaLabel(m.role, { self: m.userId === myUserId }),
                  m.customGrant ? "custom permissions" : null,
                  m.email && m.email !== (m.name || m.email) ? m.email : null,
                ].filter(Boolean).join(" · ")}
                onClick={m.role === "owner" ? undefined : () => setPermMember(m)}
                trailing={
                  m.userId !== myUserId ? (
                    <Button size="icon" variant="ghost" className="text-muted-foreground" aria-label={`Remove ${m.name || m.email}`} disabled={busy} onClick={(e) => { e.stopPropagation(); setPendingRemove(m); }}><UserMinus /></Button>
                  ) : undefined
                }
              >
                {m.name || m.email}
              </Row>
            ))}
          </Group>
          {/**
            * PENDING INVITATIONS — invisible before this screen read `/api/staff`.
            *
            * Each one holds a seat, so a roster that omits them explains neither
            * the seat count nor a refusal at the invite button. And an invite to
            * a mistyped address was unrevokable: it simply sat there, holding a
            * seat, until it expired.
            */}
          {data && data.invitations.length > 0 && (
            <>
              <Eyebrow className="pt-2">Invited</Eyebrow>
              <Group>
                {data.invitations.map((inv) => (
                  <Row
                    key={inv.id}
                    leading={<Avatar {...staffAvatar({ email: inv.email })} className="size-10" />}
                    sub={`Invited as ${personaLabel(inv.role)} · expires ${new Date(inv.expiresAt).toLocaleDateString()}`}
                    trailing={
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => void revokeInvite(inv.id)}>Revoke</Button>
                    }
                  >
                    {/* No "Pending" badge: the section is called INVITED, so
                        every row here would carry it — the status repeated down
                        a list is texture, and it was squeezing the address
                        between itself and Revoke until it truncated. */}
                    {inv.email}
                  </Row>
                ))}
              </Group>
            </>
          )}
          {/* At the ceiling the Invite button still works — the server's refusal
              names the fix — but a coach should not have to press it to find
              out. Now that the seat count is on screen, saying nothing here
              would be the odd choice. */}
          {seatsLeft === 0 && seatCap != null && (
            <p className="pt-1 text-caption text-warning">
              All {seatCap} seat{seatCap === 1 ? " is" : "s are"} in use. Upgrade your plan to add another coach.
            </p>
          )}
          <p className="pt-1 text-caption text-muted-foreground">Clients appear in the Clients tab, not here.</p>
        </>
        )}
      </Reveal>

      <Sheet open={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite staff" footer={<Button size="lg" className="w-full" disabled={!email.includes("@") || busy} onClick={() => void invite()}>{busy ? "Sending…" : "Send invite"}</Button>}>
        <div className="space-y-4">
          <Field label="Email" icon={Mail} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <div className="flex gap-2">
            <Chip selected={role === "trainer"} onClick={() => setRole("trainer")}>{personaLabel("trainer")}</Chip>
            {canAssistant && <Chip selected={role === "assistant"} onClick={() => setRole("assistant")}>{personaLabel("assistant")}</Chip>}
          </div>
          <p className="text-caption text-muted-foreground">They sign in with a code — no password to set.</p>
        </div>
      </Sheet>

      {permMember && (
        <PermissionSheet
          member={permMember}
          roles={rolesFor(permMember.role)}
          rolePending={busy}
          onRole={(role) => setPendingRole({ member: permMember, role })}
          onClose={() => setPermMember(null)}
          onSaved={() => { setPermMember(null); void load(); }}
        />
      )}

      <ConfirmDialog
        open={!!pendingRole}
        onOpenChange={(o) => !o && setPendingRole(null)}
        title={pendingRole ? `Change role to ${ROLE_LABEL(pendingRole.role)}?` : "Change role?"}
        description={pendingRole ? `${pendingRole.member.name || pendingRole.member.email || "This member"} will have the ${ROLE_LABEL(pendingRole.role)} role. This changes what they can access${pendingRole.role === "client" ? " and removes their staff powers" : ""}.` : undefined}
        confirmLabel="Change role"
        destructive={pendingRole?.role === "client" || pendingRole?.role === "assistant"}
        onConfirm={() => { if (pendingRole) void changeRole(pendingRole.member.userId, pendingRole.role); }}
      />
      <ConfirmDialog
        open={!!pendingRemove}
        onOpenChange={(o) => !o && setPendingRemove(null)}
        title="Remove from staff?"
        description={
          pendingRemove
            ? `${pendingRemove.name || pendingRemove.email || "This person"} loses access to the studio immediately. Their history stays — anything they logged or wrote keeps their name on it.`
            : undefined
        }
        confirmLabel="Remove"
        destructive
        onConfirm={() => { if (pendingRemove) void removeMember(pendingRemove.userId); }}
      />
    </Page>
  );
}

/**
 * ROLE AND ACCESS, IN ONE PLACE.
 *
 * The role used to be a 112px `Select` in the roster row's trailing slot, beside
 * two icon buttons and after a title that was a name plus up to two badges — so
 * at 375px the person's name had about 80px and the row read as a truncation
 * with a dropdown after it. And it sat one control away from this sheet, whose
 * own copy already said "clear everything to fall back to the {role} role"
 * without being able to change that role.
 *
 * They are one question — what may this person do — so they are one surface.
 * The row shows the role as a FACT in its sub-line and opens this to change it.
 */
function PermissionSheet({ member, roles, rolePending, onRole, onClose, onSaved }: {
  member: Member;
  roles: { value: string; label: string }[];
  /** A role change is in flight on the roster — gate a second one. */
  rolePending: boolean;
  onRole: (role: string) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
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
    <Sheet open onClose={onClose} title={`Access — ${member.name || member.email}`} footer={<Button size="lg" className="w-full" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save access"}</Button>}>
      <div className="space-y-4">
        {/* The role first: it is the decision, and the grants below only ever
            override it. Changing it goes through the same confirmation the
            roster's dropdown did — a demotion can be refused (the last owner)
            and a promotion can hit the seat ceiling. */}
        <div className="space-y-1.5">
        <div className="text-body font-medium text-muted-foreground">Role</div>
        <Select
          aria-label={`Role for ${member.name || member.email}`}
          value={member.role}
          onChange={(v) => { if (v !== member.role && !rolePending) onRole(v); }}
          options={roles}
        />
        </div>
        <p className="text-body text-muted-foreground">Override the role&rsquo;s defaults with a custom grant. Clear everything to fall back to the {personaLabel(member.role)} role.</p>
        <div className="max-h-[45vh] space-y-3 overflow-y-auto">
          {Object.entries(PERMISSION_CATALOG).map(([res, actions]) => (
            <div key={res}>
              <div className="mb-1.5 text-body font-medium capitalize">{res}</div>
              <div className="flex flex-wrap gap-2">{actions.map((a) => <Chip key={a} selected={(grant[res] ?? []).includes(a)} onClick={() => toggle(res, a)}>{a}</Chip>)}</div>
            </div>
          ))}
        </div>
      </div>
    </Sheet>
  );
}

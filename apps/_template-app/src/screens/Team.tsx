/**
 * THE ROSTER — `@4dl/auth`'s staff routes, rendered.
 *
 * ⚠️ **PENDING INVITATIONS ARE IN THE SAME LIST, and that is the whole reason
 * this screen is in the template.** A roster that shows only accepted members
 * makes an invitation that has not landed indistinguishable from one never sent,
 * and the owner's response to that is to send another. `GET /api/staff` folds
 * both in and marks the pending ones; keep it that way.
 *
 * The seat count comes from the same payload rather than being derived here: the
 * server counts the seats it will actually enforce against, and a client that
 * counted rows would disagree with it the moment a role is seat-free.
 */

import { useCallback, useState } from "react";
import { api, errorText } from "@4dl/app-kit";
import {
  Badge,
  Button,
  Card,
  Field,
  Group,
  LoadError,
  Mail,
  Page,
  Row,
  Section,
  Select,
  Skeleton,
  Users,
  useAction,
  useLoad,
} from "@4dl/ui";
import { useCan } from "../session.js";

interface Member {
  id: string;
  email: string;
  name?: string | null;
  role: string;
  pending?: boolean;
}
interface RoleMeta {
  key: string;
  label: string;
  blurb: string;
}
interface StaffFeed {
  members: Member[];
  roles: RoleMeta[];
  seats: { used: number; max: number };
}

export function Team() {
  const can = useCan();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const load = useCallback(() => api.get<StaffFeed>("/api/staff"), []);
  const { data, error, loading, reload } = useLoad(load, "the team", errorText);

  const act = useAction(errorText);

  if (error) return <Page><LoadError what="the team" error={error} onRetry={reload} /></Page>;
  if (loading) return <Page><div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-11 w-full rounded-lg" />)}</div></Page>;

  const { members, roles, seats } = data!;
  /* `-1` is unlimited everywhere in this platform's entitlements, and it always
     wins a merge. Rendering it as a number would say "-1 seats left". */
  const seatsLeft = seats.max < 0 ? null : seats.max - seats.used;

  return (
    <Page>
      <Section
        title="Team"
        /* The ceiling is the tenant's business position, so it belongs beside
           the list rather than inside a refusal at the moment they hit it. */
        action={seatsLeft === null ? "Unlimited seats" : `${seatsLeft} seat${seatsLeft === 1 ? "" : "s"} left`}
      >
        {/* `can` is a COURTESY: the server re-checks at the route, and this only
            decides whether the form is drawn for somebody who could only ever
            get a 403 from it. */}
        {can("member", "invite") && (
          <Card className="space-y-3">
            <Field label="Email" icon={Mail} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="them@example.com" />
            {/* The role list comes from the SERVER, with its copy. A screen that
                hard-codes it drifts the moment a role is added, and drifts
                silently: the new role is assignable through the API and simply
                absent from this picker. */}
            <Select
              value={role || roles[0]?.key || ""}
              onChange={setRole}
              options={roles.map((r) => ({ value: r.key, label: r.label }))}
            />
            <p className="text-caption text-muted-foreground">{roles.find((r) => r.key === (role || roles[0]?.key))?.blurb}</p>
            <Button
              disabled={!email.trim() || act.busy === "invite"}
              onClick={() => void act.run("invite", async () => {
                await api.post("/api/staff/invite", { email: email.trim(), role: role || roles[0]!.key });
                setEmail("");
                reload();
                /* A returned string becomes the success message — and the one
                   worth returning here is that the LINK exists even when the
                   mail did not. `sendInvite` hands both back for that reason. */
                return "Invitation sent.";
              })}
            >
              {act.busy === "invite" ? "Sending…" : "Send invitation"}
            </Button>
            {act.err && <p className="text-caption text-danger">{act.err}</p>}
            {act.msg && <p className="text-caption text-success">{act.msg}</p>}
          </Card>
        )}

        <Group>
          {members.map((m, i) => (
            <Row
              key={m.id}
              divider={i < members.length - 1}
              icon={Users}
              sub={m.email}
              trailing={
                <span className="flex items-center gap-2">
                  {/* The distinction this screen exists to draw. */}
                  {m.pending && <Badge tone="warning">Invited</Badge>}
                  <Badge tone="neutral">{roles.find((r) => r.key === m.role)?.label ?? m.role}</Badge>
                </span>
              }
            >
              {m.name || m.email}
            </Row>
          ))}
        </Group>
      </Section>
    </Page>
  );
}

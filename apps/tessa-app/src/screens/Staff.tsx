/**
 * STAFF — who works here, what they may do, and how someone new gets in.
 *
 * ── The role picker shows the GRANT, not just a name ────────────────────────
 *
 * "CSSD" means nothing to the person choosing it on their first day. What they
 * need to know is that this role can perform the **Freigabe** and that one
 * cannot — and getting it wrong is not a UX inconvenience, it is either a nurse
 * who cannot release a load at 7am or a stock keeper who can. So every role
 * carries its actions, straight from the server's registry, and the screen
 * renders them rather than restating them.
 *
 * ── Everything here confirms ────────────────────────────────────────────────
 *
 * Role changes are instant and go through `useConfirmedState`, so a refused
 * write snaps the picker back. A role that appears to change and did not is the
 * worst outcome on this screen: the owner walks away believing someone can
 * release loads.
 */

import { useCallback, useState } from "react";
import {
  Badge,
  Button,
  Callout,
  Card,
  ConfirmDialog,
  Field,
  Group,
  LoadError,
  Row,
  Select,
  SettingsPage,
  Spinner,
  Users,
  useAction,
  useLoad,
} from "@4dl/ui";
import { fmt, staff as staffApi, type RoleInfo, type StaffMember } from "../data.js";
import { useT } from "../i18n.js";
import { useSession } from "../session.js";

export function StaffSection({ onBack }: { onBack: () => void }) {
  const t = useT();
  const { ctx } = useSession();
  const load = useCallback(() => staffApi.read(), []);
  const { data, error, loading, reload } = useLoad(load, t("staff.title"), fmt);
  const act = useAction(fmt);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState("clinical");
  const [invited, setInvited] = useState<{ url: string; emailed: boolean } | null>(null);
  const [removing, setRemoving] = useState<StaffMember | null>(null);

  if (loading) return <SettingsPage title={t("staff.title")} onBack={onBack}><Spinner /></SettingsPage>;
  if (error || !data) {
    return (
      <SettingsPage title={t("staff.title")} onBack={onBack}>
        <LoadError what={t("staff.title")} error={error ?? "—"} onRetry={reload} />
      </SettingsPage>
    );
  }

  const me = ctx?.user?.id;
  const roleOf = (name: string) => data.roles.find((r) => r.name === name);
  const full = data.seats.max >= 0 && data.seats.remaining <= 0;

  return (
    <SettingsPage title={t("staff.title")} description={t("staff.intro")} onBack={onBack}>
      {act.msg && <p className="px-1 text-body text-success">{act.msg}</p>}
      {act.err && <p className="px-1 text-body text-danger">{act.err}</p>}

      {/* Seats, stated with the pending ones counted — the server counts them
          when it decides, so the screen must count them when it promises. */}
      <p className="px-1 text-caption text-muted-foreground">
        {data.seats.max < 0
          ? t("staff.seats.unlimited", { used: data.seats.used })
          : t("staff.seats", { used: data.seats.used, max: data.seats.max, pending: data.seats.pending })}
      </p>

      <Group>
        {data.members.map((m) => (
          <Row
            key={m.userId}
            sub={m.email ?? undefined}
            trailing={
              data.canManage && m.userId !== me ? (
                <Select
                  value={m.role}
                  aria-label={t("staff.role")}
                  disabled={act.busy === m.userId}
                  options={data.roles.map((r) => ({ value: r.name, label: r.label }))}
                  onChange={(next) =>
                    void act.run(
                      m.userId,
                      async () => {
                        await staffApi.setRole(m.userId, next);
                        // Reload rather than patch locally: the server is the
                        // authority on the resulting role, and a refusal must
                        // not leave the picker showing what it refused.
                        reload();
                        return t("staff.roleChanged", { name: m.name ?? m.email ?? "" });
                      },
                      t("staff.roleFailed"),
                    )
                  }
                />
              ) : (
                // Your own row has no picker. The server refuses a self-change
                // anyway; rendering the control would be offering something that
                // cannot work.
                <Badge tone={m.role === "owner" ? "success" : "neutral"}>{roleOf(m.role)?.label ?? m.role}</Badge>
              )
            }
          >
            {m.name ?? m.email ?? m.userId}
            {m.userId === me && <span className="ml-2 text-caption text-muted-foreground">{t("staff.you")}</span>}
          </Row>
        ))}
      </Group>

      {/* What the selected role can actually do. */}
      <RoleCard role={roleOf(role)} />

      {data.canManage && (
        <Card className="space-y-3 p-4">
          <h3 className="text-body-lg">{t("staff.invite")}</h3>
          {full && <Callout tone="warning" icon={Users}>{t("staff.seatsFull")}</Callout>}
          <Field
            label={t("staff.email")}
            type="email"
            inputMode="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Select
            value={role}
            aria-label={t("staff.role")}
            options={data.roles.map((r) => ({ value: r.name, label: r.label }))}
            onChange={setRole}
          />
          <Button
            className="w-full"
            disabled={!email.includes("@") || act.busy === "invite" || full}
            onClick={() =>
              void act.run(
                "invite",
                async () => {
                  const r = await staffApi.invite(email.trim(), role);
                  setInvited({ url: r.url, emailed: r.emailed });
                  setEmail("");
                  reload();
                  return r.emailed ? t("staff.invited", { email }) : t("staff.invitedNoMail");
                },
                t("staff.inviteFailed"),
              )
            }
          >
            {t("staff.send")}
          </Button>

          {/**
           * The link, always — not only when mail failed.
           *
           * A clinic hands things over in person constantly, and a deployment
           * whose sender is not yet verified is a normal state on day one. The
           * invitation is the ROW; the email was only how the link travelled.
           */}
          {invited && (
            <div className="space-y-2 rounded-lg bg-surface-2 p-3">
              {!invited.emailed && <p className="text-caption text-warning">{t("staff.mailFailed")}</p>}
              <p className="break-all text-caption text-muted-foreground">{invited.url}</p>
              <Button size="sm" variant="secondary" onClick={() => void navigator.clipboard?.writeText(invited.url)}>
                {t("action.copy")}
              </Button>
            </div>
          )}
        </Card>
      )}

      {data.invitations.length > 0 && (
        <>
          <h2 className="px-1 text-micro uppercase text-muted-foreground">{t("staff.pending")}</h2>
          <Group>
            {data.invitations.map((i) => (
              <Row
                key={i.id}
                sub={`${roleOf(i.role)?.label ?? i.role} · ${t("staff.expires", { date: i.expiresAt.slice(0, 10) })}`}
                trailing={
                  data.canManage ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={act.busy === i.id}
                      onClick={() =>
                        void act.run(i.id, async () => {
                          await staffApi.revoke(i.id);
                          reload();
                          return t("staff.revoked");
                        })
                      }
                    >
                      {t("staff.revoke")}
                    </Button>
                  ) : undefined
                }
              >
                {i.email}
              </Row>
            ))}
          </Group>
        </>
      )}

      {data.canManage && data.members.length > 1 && (
        <>
          <h2 className="px-1 text-micro uppercase text-muted-foreground">{t("staff.remove")}</h2>
          <Group>
            {data.members
              .filter((m) => m.userId !== me)
              .map((m) => (
                <Row key={`rm-${m.userId}`} tone="danger" onClick={() => setRemoving(m)}>
                  {t("staff.removeName", { name: m.name ?? m.email ?? "" })}
                </Row>
              ))}
          </Group>
        </>
      )}

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o: boolean) => !o && setRemoving(null)}
        title={t("staff.removeTitle", { name: removing?.name ?? removing?.email ?? "" })}
        /**
         * The copy says what is NOT deleted, because that is the question a
         * quality manager actually has. `ledger.actor_user_id` and
         * `sterilisation_cycles.released_by` name whoever performed an act, and
         * a Freigabe with no named releaser is not a record — it is the absence
         * of one. Removing staff must never read as a way to erase that.
         */
        description={t("staff.removeBody")}
        confirmLabel={t("staff.remove")}
        destructive
        onConfirm={() => {
          const target = removing;
          setRemoving(null);
          if (!target) return;
          void act.run(target.userId, async () => {
            await staffApi.remove(target.userId);
            reload();
            return t("staff.removed", { name: target.name ?? target.email ?? "" });
          });
        }}
      />
    </SettingsPage>
  );
}

/** What a role may do, drawn from the server's registry rather than restated. */
function RoleCard({ role }: { role: RoleInfo | undefined }) {
  const t = useT();
  if (!role) return null;
  return (
    <Card className="space-y-2 p-4">
      <div>
        <h3 className="text-body-lg">{role.label}</h3>
        <p className="text-caption text-muted-foreground">{role.blurb}</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(role.grant).map(([resource, actions]) =>
          actions.map((a) => (
            // `sterilisation: release` is the one worth spotting at a glance —
            // it is the difference between a role that can sign off a load and
            // one that cannot.
            <Badge key={`${resource}.${a}`} tone={a === "release" ? "warning" : "neutral"}>
              {resource}:{a}
            </Badge>
          )),
        )}
      </div>
      {!Object.keys(role.grant).length && <p className="text-caption text-muted-foreground">{t("staff.noGrant")}</p>}
    </Card>
  );
}

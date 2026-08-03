/**
 * The multi-studio switcher.
 *
 * One identity can belong to several studios — you own one, you train at
 * another, you coach at a third. Those are separate BUSINESSES, and the old
 * switcher was a run of dropdown rows: the studio's name in the app's own
 * typeface behind a generic shop glyph, buried between the mode toggle and the
 * settings links. Nothing said which one you were in beyond a tick, nothing said
 * what you were there (owner? client?), and nothing distinguished a gym from a
 * physio clinic from your own studio.
 *
 * So each studio gets its own mark and its own colour, and its own answer to
 * "who am I here". Switching is a real decision with real consequences — it
 * changes whose data you are looking at — so it gets a sheet, not a menu row.
 *
 * Only rendered when there is genuinely a choice: two or more personas.
 *
 * ── Switching is now a NAVIGATION ───────────────────────────────────────────
 *
 * Every studio has its own hostname, and the server pins the tenancy from it — so
 * `context/switch` cannot move you between studios on a studio host, and this
 * control has to cross origins instead. It targets the other studio's SUBDOMAIN
 * (never its custom domain, even if it has one) because the session cookie is
 * issued for the platform root: a subdomain hop carries the session and lands you
 * signed in, while a custom domain is a separate cookie jar and would ask you to
 * sign in again. `switchTenant` in session.tsx does the routing.
 *
 * This also fixes the guard. It used to hide whenever `ctx.hostTenantId` was set,
 * which was true only on a custom domain — under the subdomain model that is true
 * on EVERY studio host, so the switcher would have disappeared entirely.
 */

import { useState } from "react";
import type { PersonaRef } from "@kova/protocol";
import { Badge, Button, Card, Sheet, Check, ChevronsUpDown, Store, Spinner, brandMark, cn } from "@4dl/ui";
import { personaLabel, personaTone } from "./registry/index.js";
import { useSession } from "./session.js";
import { useTheme } from "./theme.js";

/** The mark for a studio: its uploaded icon, else its initial on its own colour. */
function StudioMark({ persona, className }: { persona: PersonaRef; className?: string }) {
  const { mode } = useTheme();
  const icon = brandMark(persona, mode, "icon");
  // A studio that has set a brand colour wears it here even when the app is
  // currently themed by a DIFFERENT studio — that is the whole point of the
  // switcher: you are looking at other businesses, not at this one's palette.
  const tint = persona.primary
    ? { backgroundColor: `color-mix(in oklch, ${persona.primary} 18%, transparent)`, color: persona.primary }
    : undefined;
  return (
    <span
      className={cn("grid size-11 shrink-0 place-items-center overflow-hidden rounded-2xl bg-primary/15 text-base font-bold text-primary", className)}
      style={tint}
      aria-hidden
    >
      {icon ? <img src={icon} alt="" className="size-full object-cover" /> : persona.tenantName.charAt(0).toUpperCase()}
    </span>
  );
}

/** One studio row: mark, name, your role there, and whether you're in it now. */
function StudioRow({ persona, current, busy, onPick }: {
  persona: PersonaRef; current: boolean; busy: boolean; onPick: () => void;
}) {
  return (
    <button
      onClick={onPick}
      disabled={busy || current}
      aria-current={current ? "true" : undefined}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl p-3 text-left transition-colors",
        current ? "bg-primary/10" : "hover:bg-secondary disabled:opacity-60",
      )}
    >
      <StudioMark persona={persona} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold tracking-tight">{persona.tenantName}</span>
        <span className="mt-0.5 flex items-center gap-1.5">
          <Badge tone={personaTone(persona.role)}>{personaLabel(persona.role)}</Badge>
          {/* Staff who also have a client record can train here as well — worth
              saying, because it is the difference between "my workplace" and
              "where I train". */}
          {persona.role !== "client" && persona.clientId && <Badge tone="sleep">Also training</Badge>}
        </span>
      </span>
      {busy ? <Spinner className="size-4" /> : current ? <Check className="size-5 shrink-0 text-primary" /> : null}
    </button>
  );
}

/** The app-bar trigger: the studio you're in, and that there are others. */
export function StudioSwitcher() {
  const { ctx, switchTenant } = useSession();
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const active = ctx?.active;
  const personas = ctx?.personas ?? [];

  // No choice to offer ⇒ no control. Nothing else disqualifies it: on a studio
  // host `switchTenant` navigates rather than calling the refusing endpoint.
  if (!active || personas.length < 2) return null;

  const pick = async (tenantId: string) => {
    if (tenantId === active.tenantId) return setOpen(false);
    setBusyId(tenantId);
    setError(null);
    try {
      await switchTenant(tenantId);
      setOpen(false);
    } catch {
      // Membership is re-checked server-side on every switch, so a failure is
      // real (revoked seat, network) and must not look like a no-op.
      setError("Couldn't switch studios. Your access there may have changed.");
    } finally {
      setBusyId(null);
    }
  };

  const currentPersona = personas.find((p) => p.tenantId === active.tenantId);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={`Studio: ${active.tenantName}. Switch studio`}
        className="flex h-9 min-w-0 items-center gap-1 rounded-full px-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        {currentPersona ? <StudioMark persona={currentPersona} className="size-6 rounded-lg text-xs" /> : <Store className="size-4" />}
        <ChevronsUpDown className="size-3.5 shrink-0" />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Your studios">
        <div className="space-y-1">
          <p className="px-1 pb-2 text-sm text-muted-foreground">
            One account, {personas.length} studios. Switching changes whose data you&rsquo;re working in — your role and what
            you can do change with it.
          </p>
          {personas.map((p) => (
            <StudioRow
              key={p.tenantId}
              persona={p}
              current={p.tenantId === active.tenantId}
              busy={busyId === p.tenantId}
              onPick={() => void pick(p.tenantId)}
            />
          ))}
          {error && <p role="alert" className="px-1 pt-2 text-sm text-warning">{error}</p>}
        </div>
      </Sheet>
    </>
  );
}

/**
 * The studio list as a CARD, for a surface that has replaced the whole Shell and
 * therefore has no app bar to switch from.
 *
 * The locked Shop is the case that needs it: a client with no live access at this
 * studio sees only that screen, and before this the only control on it was Sign
 * out. Someone locked at one studio who has a paid plan at another was stranded —
 * signing out and back in lands them in whichever tenant the session names, which
 * can be the locked one again. One studio's unpaid access must not cost you the
 * studios you did pay for.
 */
export function StudioListCard() {
  const { ctx } = useSession();
  if ((ctx?.personas.length ?? 0) < 2) return null;
  return (
    <Card className="space-y-2">
      <div className="text-sm font-medium">Your other studios</div>
      <p className="text-sm text-muted-foreground">
        This studio needs an active plan. Your access elsewhere is unaffected — switch to another studio to keep training.
      </p>
      <StudioList />
    </Card>
  );
}

/** The same list as a full-width block, for surfaces with room (not the bar). */
export function StudioList({ onSwitched }: { onSwitched?: () => void }) {
  const { ctx, switchTenant } = useSession();
  const [busyId, setBusyId] = useState<string | null>(null);
  const active = ctx?.active;
  const personas = ctx?.personas ?? [];
  if (!active || personas.length < 2) return null;
  return (
    <div className="space-y-1">
      {personas.map((p) => (
        <StudioRow
          key={p.tenantId}
          persona={p}
          current={p.tenantId === active.tenantId}
          busy={busyId === p.tenantId}
          onPick={() => {
            if (p.tenantId === active.tenantId) return;
            setBusyId(p.tenantId);
            void switchTenant(p.tenantId).then(() => onSwitched?.()).finally(() => setBusyId(null));
          }}
        />
      ))}
    </div>
  );
}

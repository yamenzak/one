/**
 * THE PLAN BUILDER'S FRAME — the parts of "writing a plan" that are the same
 * whether the plan is workouts or meals.
 *
 * The two builders had grown independently into the same screen: an identical
 * lifecycle (draft → publish, superseded → roll back or re-activate), an
 * identical footer, an identical template picker, and an identical scatter of
 * plan-level verbs across four separate blocks above the content — a seed row, a
 * template button, an AI button, a save-as-template icon in the header, a copy
 * chip under the day grid.
 *
 * ── The decisions ───────────────────────────────────────────────────────────
 *
 * VERBS ABOUT THE PLAN LIVE IN ONE MENU.  Seeding, templating and drafting are
 *   things you do ONCE, at the start, to the whole plan. They were each given a
 *   permanent full-width button above the content — so every scroll to the
 *   exercise you are editing passed four controls you had already finished
 *   with. They are now the header's overflow menu: one glyph, always in the same
 *   place, and the screen below it is the plan.
 * THE FOOTER IS THE ONLY COMMIT.  `ActionBar` (§13) owns the frame. The
 *   read-only explanation goes in `notice` — above the buttons, because it is
 *   the reason they say what they say.
 * ONE LIFECYCLE, NOT TWO.  `usePlanLifecycle` holds the in-flight guard and the
 *   visible failure both builders had copied. A flaky publish that changes
 *   nothing on screen is a coach who walks away believing the client has the
 *   plan.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Badge, Button, Sheet, Skeleton, EmptyState, IconBadge, Field, Switch,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  ActionBar, ArrowLeft, ChevronRight, History, LayoutGrid, MoreHorizontal, Save, type Tone,
} from "@4dl/ui";
import { api, errorText } from "../../api.js";

export type PlanKind = "workout" | "meal";

/** The one place a plan's status becomes a word and a colour. */
export const statusTone = (status: string): Tone => (status === "published" ? "success" : status === "draft" ? "neutral" : "warning");

/**
 * The builder's top row: out, what this is, where it stands, and everything you
 * can do TO it. Nothing here scrolls away, and nothing else competes for the
 * space — the content underneath is the plan.
 */
export function BuilderHeader({ title, status, onBack, menu }: {
  title: string;
  status: string;
  onBack: () => void;
  /** `DropdownMenuItem`s. Omitted entirely on a read-only plan. */
  menu?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Button size="icon" variant="secondary" onClick={onBack} aria-label="Back"><ArrowLeft /></Button>
      <h1 className="min-w-0 flex-1 truncate text-title-3">{title}</h1>
      <Badge tone={statusTone(status)}>{status}</Badge>
      {menu && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="secondary" aria-label="Plan actions"><MoreHorizontal /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>{menu}</DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

/**
 * The lifecycle a plan has, and the guards it needs.
 *
 * `save` is separate from `saveBody` deliberately: publish COMPOSES the body
 * write, so that one has to throw rather than swallow — publishing an unsaved
 * body hands the client the wrong plan.
 */
export function usePlanLifecycle({ kind, planId, body, reload }: {
  kind: PlanKind;
  planId: string;
  /** The body to PATCH. Read at call time, so a stale closure can't publish
   *  yesterday's draft. */
  body: () => unknown;
  reload: () => Promise<void>;
}) {
  const base = `/api/${kind === "workout" ? "workout" : "meal"}-plans/${planId}`;
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [action, setAction] = useState<"publish" | "activate" | "rollback" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // A new plan id is a new plan: carrying `dirty` across would offer to save a
  // draft the coach never touched.
  useEffect(() => { setDirty(false); setErr(null); }, [planId]);

  const saveBody = useCallback(async () => { await api.patch(base, { body: body() }); setDirty(false); }, [base, body]);

  const run = async (name: "publish" | "activate" | "rollback", fn: () => Promise<void>, fallback: string) => {
    if (action || saving) return;
    setAction(name); setErr(null);
    try { await fn(); } catch (e) { setErr(errorText(e, fallback)); } finally { setAction(null); }
  };

  return {
    dirty, saving, action, err,
    markDirty: () => setDirty(true),
    save: async () => {
      if (saving || action) return;
      setSaving(true); setErr(null);
      try { await saveBody(); }
      catch (e) { setErr(errorText(e, "Couldn't save the draft. Please try again.")); }
      finally { setSaving(false); }
    },
    publish: () => run("publish", async () => { await saveBody(); await api.post(`${base}/publish`); await reload(); },
      "Couldn't publish this plan — the client hasn't received it. Please try again."),
    // A superseded/archived plan is read-only (PATCH 409s), so "Make active"
    // re-publishes WITHOUT saving first; rollback returns it to a draft.
    makeActive: () => run("activate", async () => { await api.post(`${base}/publish`); await reload(); },
      "Couldn't make this plan active. Please try again."),
    rollback: () => run("rollback", async () => { await api.post(`${base}/status`, { status: "draft" }); await reload(); },
      "Couldn't roll this plan back to a draft. Please try again."),
  };
}

export type PlanLifecycle = ReturnType<typeof usePlanLifecycle>;

/** The committing bar, with the right verbs for the plan's standing. */
export function BuilderFooter({ status, readOnly, life }: { status: string; readOnly: boolean; life: PlanLifecycle }) {
  const { dirty, saving, action, err } = life;
  return (
    <ActionBar
      error={err}
      notice={readOnly ? (
        <div className="flex items-start gap-2 rounded-xl bg-warning-soft px-3 py-2 text-caption text-warning [&_svg]:mt-px [&_svg]:size-3.5 [&_svg]:shrink-0">
          <History /> <span>This plan is {status} — read-only. Roll it back to a draft to edit, or make it active again.</span>
        </div>
      ) : undefined}
    >
      {readOnly ? (
        <>
          <Button variant="outline" className="flex-1" disabled={action !== null} onClick={() => void life.rollback()}>{action === "rollback" ? "Rolling back…" : "Roll back to draft"}</Button>
          <Button className="flex-1" disabled={action !== null} onClick={() => void life.makeActive()}>{action === "activate" ? "Activating…" : "Make active"}</Button>
        </>
      ) : (
        <>
          {/*
            The save button is SECONDARY and states the draft's standing rather
            than commanding. Publishing is what the coach came to do; saving is
            housekeeping the publish does for them anyway.
          */}
          <Button variant="outline" className="flex-1" disabled={!dirty || saving || action !== null} onClick={() => void life.save()}>
            {saving ? "Saving…" : dirty ? "Save draft" : "Saved"}
          </Button>
          <Button className="flex-1" disabled={saving || action !== null} onClick={() => void life.publish()}>
            {action === "publish" ? "Publishing…" : status === "published" ? "Re-publish" : "Publish"}
          </Button>
        </>
      )}
    </ActionBar>
  );
}

/** Seed + template + AI, as menu rows. Both builders offer the same three; the
 *  labels differ only in the noun, which the caller supplies. */
export function SeedMenuItems({ latestName, onLatest, onTemplate, extra }: {
  /** The name of the client's most recent other plan in this lane, if any. */
  latestName: string | null;
  onLatest: () => void;
  onTemplate: () => void;
  extra?: ReactNode;
}) {
  return (
    <>
      <DropdownMenuItem onSelect={onLatest} className={latestName ? undefined : "pointer-events-none opacity-40"}>
        <History /> {latestName ? `Seed from “${latestName}”` : "No previous plan to seed from"}
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={onTemplate}><LayoutGrid /> Start from a template</DropdownMenuItem>
      {extra}
    </>
  );
}

/**
 * Pick a saved template to seed a draft with. One component for both kinds —
 * the two copies differed by an endpoint, a tone and the word "day"/"option",
 * which is not two components.
 */
export function TemplatePickerSheet<B>({ kind, tone, countOf, onClose, onPick }: {
  kind: PlanKind;
  tone: Tone;
  /** How many things this template contains, and what to call them. */
  countOf: (body: B) => string;
  onClose: () => void;
  onPick: (body: B, name: string) => void;
}) {
  type Row = { id: string; name: string; description?: string | null; body: B };
  const [templates, setTemplates] = useState<Row[] | null>(null);
  useEffect(() => {
    let alive = true;
    api.get<{ templates: Row[] }>(`/api/${kind}-templates`)
      .then((r) => { if (alive) setTemplates(r.templates ?? []); })
      .catch(() => { if (alive) setTemplates([]); });
    return () => { alive = false; };
  }, [kind]);
  return (
    <Sheet open onClose={onClose} title="Start from a template" size="tall">
      <p className="mb-3 text-body text-muted-foreground">Loads a saved template into this draft, replacing what's here now.</p>
      {templates === null ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
      ) : templates.length === 0 ? (
        <EmptyState icon={LayoutGrid} title="No templates yet" description="Save one from a plan you've already written, and it'll be here next time." />
      ) : (
        <div className="max-h-96 space-y-1.5 overflow-y-auto">
          {templates.map((t) => (
            <button key={t.id} onClick={() => onPick(t.body, t.name)} className="flex w-full items-center gap-3 rounded-xl border border-border/60 bg-card p-3 text-left transition-colors hover:bg-surface-2">
              <IconBadge icon={LayoutGrid} tone={tone} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-body font-semibold">{t.name}</div>
                <div className="truncate text-caption text-muted-foreground">{countOf(t.body)}{t.description ? ` · ${t.description}` : ""}</div>
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}

/** Save the current plan's structure as a reusable template. */
export function SaveTemplateSheet({ kind, body, defaultName, stripNote, onClose }: {
  kind: PlanKind;
  body: unknown;
  defaultName: string;
  /** What the save strips, in one clause — the coach should know before they
   *  reuse it that the client-specific numbers are gone. */
  stripNote: string;
  onClose: () => void;
}) {
  const [name, setName] = useState(defaultName);
  const [shared, setShared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => {
    setBusy(true); setErr(null);
    try { await api.post(`/api/${kind}-templates`, { name, visibility: shared ? "tenant" : "private", body, stripWeights: true }); setDone(true); }
    catch (e) { setErr(errorText(e, "Couldn't save the template. Please try again.")); }
    finally { setBusy(false); }
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title="Save as template"
      /* Once it is saved there is nothing left to submit — the done branch is a
         receipt with its own way out, so the footer goes with the form. */
      footer={done ? undefined : <Button size="lg" className="w-full" disabled={busy || !name.trim()} onClick={() => void run()}>{busy ? "Saving…" : "Save template"}</Button>}
    >
      {done ? (
        <EmptyState icon={Save} title="Saved to your library" description={stripNote} action={<Button onClick={onClose}>Done</Button>} />
      ) : (
        <div className="space-y-4">
          <p className="text-body text-muted-foreground">Copies this plan's structure into something you can start from again. {stripNote}</p>
          <Field label="Template name" value={name} onChange={(e) => setName(e.target.value)} />
          <label className="flex items-center justify-between rounded-xl bg-secondary px-4 py-3 text-body"><span>Share with the whole team</span><Switch checked={shared} onCheckedChange={setShared} /></label>
          {err && <p className="text-caption text-warning" role="alert">{err}</p>}
        </div>
      )}
    </Sheet>
  );
}

export { DropdownMenuItem as BuilderMenuItem, DropdownMenuSeparator as BuilderMenuSeparator };

/**
 * Coach Library — exercises, foods, templates, content.
 *
 * ── What this pass changed ──────────────────────────────────────────────────
 *
 * Four tabs, four hand-rolled collections. Each had its own loading skeleton,
 * its own empty state, its own idea of what a row looks like (a floating `Card`
 * per item on two of them, a real `Group` on one, a `Card` with a button inside
 * it on the fourth), and none of them told "nothing here yet" apart from
 * "nothing matches what you typed" — which are opposite problems with opposite
 * fixes. `Collection` (§7) owns all five states and one row rhythm, so all four
 * tabs are the same object now.
 *
 * The browse facets were two horizontally-scrolling chip rows stacked under the
 * search box, on two of the tabs: a third of a phone viewport spent on controls
 * before the first result, with half of each facet's options off the edge. They
 * are one `Filters` button (§13) opening a sheet where the options wrap.
 *
 * And the actions came off the rows. Every exercise carried two unlabelled
 * glyphs — eight on a four-row screen — for jobs done a few times a month,
 * squeezing the name they sat next to. They are behind the same `···` the plan
 * list and the content tab already use, so three of the four tabs no longer
 * disagree about where a row's actions live.
 */

import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, Card, Badge, Field, Textarea, Sheet, Skeleton, SegmentedControl, Chip, Page, Eyebrow, EmptyState, cn, Reveal, SkeletonList, Avatar, Search, Plus, Trash2, Archive, AlertTriangle, Dumbbell, Utensils, LayoutGrid, PencilLine, ArrowLeftRight, Ellipsis, Send, History, Users, Group, Row, ConfirmDialog, Collection, Filters, useCollectionView, activeFacetCount, type FacetSelection } from "@4dl/ui";
import { MacroInline } from "../../registry/index.js";
import { api, errorText } from "../../api.js";
import { useCan } from "../../FeatureLock.js";
import { AiAvatar } from "../../AiAvatar.js";
import { AiErrorBox } from "../../AiError.js";
import { FoodEditor } from "../client/FoodEditor.js";
import { ExerciseEditor } from "./ExerciseEditor.js";
import { FoodThumb } from "../food.js";
import { fmtEnergy } from "@kova/domain";
import { useUnits } from "../../units.js";
import { ExerciseRow, ExerciseThumb, metaText, splitList, pretty, type ExerciseInfo } from "../exercise.js";

type Tab = "exercises" | "foods" | "templates" | "content";
const TABS: Tab[] = ["exercises", "foods", "templates", "content"];

export function Library() {
  const nav = useNavigate();
  // The active tab lives in the URL (/library/:tab) so tabs are deep-linkable
  // and back/forward navigable; an unknown/absent tab falls back to exercises.
  const { tab: tabParam } = useParams<{ tab?: string }>();
  const tab = (TABS.includes(tabParam as Tab) ? tabParam : "exercises") as Tab;
  return (
    <Page className="column space-y-4 p-4 pb-28">
      {/* Same opening as every other tabbed surface: the eyebrow names it, the
          rail switches it. Nothing else above the fold. */}
      <Eyebrow>Library</Eyebrow>
      <SegmentedControl
        fill
        options={[
          { value: "exercises", label: "Exercises" },
          { value: "foods", label: "Foods" },
          { value: "templates", label: "Templates" },
          { value: "content", label: "Content" },
        ]}
        value={tab}
        onChange={(v) => nav(`/library/${v}`)}
      />
      {tab === "exercises" && <Exercises />}
      {tab === "foods" && <Foods />}
      {tab === "templates" && <Templates />}
      {tab === "content" && <Content />}
    </Page>
  );
}

type LibraryExercise = ExerciseInfo & { source?: string; tenant_id?: string | null };
type ExEdit = { exerciseId?: string; initial?: Partial<ExerciseInfo> };

function Exercises() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<LibraryExercise[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Remembered, like every other collection's view — this one used to reset to
  // the list on every visit, which is why nobody switched it twice.
  const [view, setView] = useCollectionView("exercises");
  const [facets, setFacets] = useState<FacetSelection>({ muscle: null, equipment: null });
  const [editor, setEditor] = useState<ExEdit | null>(null);
  const [menuFor, setMenuFor] = useState<LibraryExercise | null>(null);
  const [altFor, setAltFor] = useState<LibraryExercise | null>(null);
  const [archiveFor, setArchiveFor] = useState<LibraryExercise | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try { setItems((await api.get<{ exercises: LibraryExercise[] }>(`/api/exercises?q=${encodeURIComponent(q)}`)).exercises); }
    catch (e) { setError(errorText(e, "We couldn't reach your library.")); }
  }, [q]);
  useEffect(() => { const t = setTimeout(() => void load(), 200); return () => clearTimeout(t); }, [load]);
  // Tenant-owned rows edit in place; platform seeds fork into a tenant copy.
  const open = (e: LibraryExercise) => setEditor(e.tenant_id ? { exerciseId: e.id, initial: e } : { initial: { ...e, id: undefined } });

  // Facet options derived from the loaded library, most-common-first (the same
  // derivation the plan-builder's picker uses). They read the FULL loaded set,
  // so choosing one doesn't make the others vanish; the list applies both.
  const opts = (get: (e: LibraryExercise) => string[]) => {
    const count = new Map<string, number>();
    for (const e of items ?? []) for (const v of get(e)) count.set(v, (count.get(v) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([v]) => ({ value: v, label: pretty(v) }));
  };
  const groups = [
    { key: "muscle", label: "Muscle group", options: opts((e) => splitList(e.muscle_groups)) },
    { key: "equipment", label: "Equipment", options: opts((e) => splitList(e.equipment)) },
  ];
  const filtered = items === null ? null : items.filter((e) =>
    (!facets.muscle || splitList(e.muscle_groups).concat(splitList(e.secondary_muscle_groups)).includes(facets.muscle)) &&
    (!facets.equipment || splitList(e.equipment).includes(facets.equipment)),
  );

  /*
    THE ROW'S ACTIONS ARE BEHIND ONE `···`.

    Every row carried Alternatives and Archive as inline glyphs — eight
    unlabelled icons on a screen of four rows, squeezing the exercise name they
    sat beside, for two jobs a coach does a few times a month. §7 allows two
    inline icons; it does not require them, and the plan list and the content
    tab had already settled on a menu. Three of the four Library tabs agreeing
    is worth more here than saving one tap on a rare action — and the menu can
    label what the glyphs could not.
  */
  const menu = (e: LibraryExercise) => (
    <Button size="icon" variant="ghost" className="shrink-0 text-muted-foreground" aria-label={`Actions for ${e.name}`}
      onClick={(ev) => { ev.stopPropagation(); setMenuFor(e); }}><Ellipsis /></Button>
  );

  return (
    <>
      <Collection
        items={filtered}
        itemKey={(e) => e.id}
        error={error}
        onRetry={() => void load()}
        noun="exercises"
        view={view}
        onView={setView}
        query={q}
        onQuery={setQ}
        filter={<Filters groups={groups} value={facets} onChange={setFacets} />}
        narrowed={activeFacetCount(facets) > 0}
        onClearFilters={() => setFacets({ muscle: null, equipment: null })}
        action={<Button variant="tonal" aria-label="New exercise" onClick={() => setEditor({})}><Plus /></Button>}
        thumb={52}
        empty={{
          icon: Dumbbell,
          title: "No exercises yet",
          description: "Build your library as you go, or install the starter set from the platform.",
          action: <Button onClick={() => setEditor({})}><Plus /> New exercise</Button>,
        }}
        renderList={(e) => (
          <div className="px-4 py-2">
            <ExerciseRow ex={e} thumbSize={44} onClick={() => open(e)} trailing={menu(e)} />
          </div>
        )}
        renderGrid={(e) => (
          <Card className="relative overflow-hidden p-0">
            <button onClick={() => open(e)} className="block w-full text-left transition-opacity active:opacity-80">
              <div className="aspect-square bg-surface-2"><ExerciseThumb thumb={e.thumb_url} thumb2={e.thumb2_url} size={0} className="!size-full !rounded-none" /></div>
              <div className="px-3 pb-3 pt-2">
                <div className="truncate text-sm font-semibold">{e.name}</div>
                <div className="truncate text-xs text-muted-foreground">{metaText(e) || "—"}</div>
              </div>
            </button>
            {/* Over the image, where a tile's actions go — not a strip under it
                competing with the name for the tile's last row. */}
            <div className="absolute right-1 top-1 rounded-full bg-background/70 backdrop-blur-sm">{menu(e)}</div>
          </Card>
        )}
      />

      {/* After a NEW add, clear any active search so the new row is actually visible (not filtered out by a stale query). */}
      {editor && <ExerciseEditor exerciseId={editor.exerciseId} initial={editor.initial} onClose={() => setEditor(null)} onSaved={() => { const wasNew = !editor.exerciseId; setEditor(null); if (wasNew && q) setQ(""); else void load(); }} />}
      {menuFor && (
        <Sheet open onClose={() => setMenuFor(null)} title={menuFor.name}>
          <Group>
            <Row icon={PencilLine} iconTone="primary" chevron={false} onClick={() => { const e = menuFor; setMenuFor(null); open(e); }}>
              {menuFor.tenant_id ? "Edit" : "Make a copy to edit"}
            </Row>
            <Row icon={ArrowLeftRight} iconTone="activity" chevron={false} sub="Bound swaps a client can make instantly"
              onClick={() => { const e = menuFor; setMenuFor(null); setAltFor(e); }}>Alternatives</Row>
            {/* Only tenant-owned rows can be archived; platform seeds have no
                delete affordance at all. */}
            {menuFor.tenant_id && (
              <Row icon={Archive} tone="danger" chevron={false}
                onClick={() => { const e = menuFor; setMenuFor(null); setArchiveFor(e); }}>Archive</Row>
            )}
          </Group>
        </Sheet>
      )}
      {altFor && <AlternativesSheet exercise={altFor} onClose={() => setAltFor(null)} />}
      {archiveFor && <ArchiveConfirm kind="exercise" id={archiveFor.id} name={archiveFor.name} onClose={() => setArchiveFor(null)} onDone={() => { setArchiveFor(null); void load(); }} />}
    </>
  );
}

/** Bind an exercise's alternatives (SPEC §8.3) — two-way, instant client swaps. */
function AlternativesSheet({ exercise, onClose }: { exercise: ExerciseInfo; onClose: () => void }) {
  const [alts, setAlts] = useState<ExerciseInfo[] | null>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ExerciseInfo[]>([]);
  const load = useCallback(async () => setAlts((await api.get<{ alternatives: ExerciseInfo[] }>(`/api/exercises/${exercise.id}/alternatives`)).alternatives), [exercise.id]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(async () => setResults((await api.get<{ exercises: ExerciseInfo[] }>(`/api/exercises?q=${encodeURIComponent(q)}`)).exercises.filter((e) => e.id !== exercise.id)), 200);
    return () => clearTimeout(t);
  }, [q, exercise.id]);
  const add = async (id: string) => { await api.post(`/api/exercises/${exercise.id}/alternatives`, { exerciseId: id }); setQ(""); setResults([]); await load(); };
  const remove = async (id: string) => { await api.del(`/api/exercises/${exercise.id}/alternatives/${id}`); await load(); };
  const altIds = new Set((alts ?? []).map((a) => a.id));
  return (
    <Sheet open onClose={onClose} title={`Alternatives · ${exercise.name}`} size="tall">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">A bound alternative is one the client can swap to on their own, mid-session, with no approval. Binding works both ways.</p>
        <Reveal loading={!alts} skeleton={<SkeletonList card rows={3} thumb={36} />}>
          {alts && (alts.length === 0 ? (
            <EmptyState icon={ArrowLeftRight} title="Nothing bound yet" description="Add a movement that trains the same thing with what else the gym has." />
          ) : (
            <Group>
              {alts.map((a) => (
                <div key={a.id} className="px-4 py-2">
                  <ExerciseRow ex={a} thumbSize={36} trailing={
                    <Button size="icon" variant="ghost" className="shrink-0 text-muted-foreground" aria-label={`Unbind ${a.name}`} onClick={() => void remove(a.id)}><Trash2 /></Button>
                  } />
                </div>
              ))}
            </Group>
          ))}
        </Reveal>
        <div className="space-y-2 border-t border-border/50 pt-4">
          <Field label="Add an alternative" labelHidden icon={Search} placeholder="Search exercises…" type="search" value={q} onChange={(e) => setQ(e.target.value)} />
          {q.trim().length >= 2 && (
            results.filter((e) => !altIds.has(e.id)).length === 0
              ? <p className="px-1 text-caption text-muted-foreground">Nothing else matches “{q.trim()}”.</p>
              : (
                <Group className="max-h-64 overflow-y-auto">
                  {results.filter((e) => !altIds.has(e.id)).map((e) => (
                    <div key={e.id} className="px-4 py-2">
                      <ExerciseRow ex={e} thumbSize={34} meta={false} onClick={() => void add(e.id)} trailing={<Plus className="size-4 shrink-0 text-primary" />} />
                    </div>
                  ))}
                </Group>
              )
          )}
        </div>
      </div>
    </Sheet>
  );
}

/**
 * Archive (soft-delete) confirm. Archiving hides a row from the library and
 * pickers but keeps it resolvable for plans/logs that already reference it, so
 * nothing goes blank. For exercises we surface how many plans still use it.
 */
function ArchiveConfirm({ kind, id, name, onClose, onDone }: { kind: "exercise" | "food"; id: string; name: string; onClose: () => void; onDone: () => void }) {
  const [usage, setUsage] = useState<{ plans: number; templates: number } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (kind !== "exercise") return;
    void api.get<{ plans: number; templates: number }>(`/api/exercises/${id}/usage`).then(setUsage).catch(() => setUsage(null));
  }, [kind, id]);
  const archive = async () => {
    setBusy(true);
    try { await api.del(`/api/${kind === "exercise" ? "exercises" : "foods"}/${id}`); onDone(); }
    finally { setBusy(false); }
  };
  const used = usage ? usage.plans + usage.templates : 0;
  const parts = usage ? [usage.plans && `${usage.plans} plan${usage.plans === 1 ? "" : "s"}`, usage.templates && `${usage.templates} template${usage.templates === 1 ? "" : "s"}`].filter(Boolean).join(" and ") : "";
  /*
    A DECISION, SO A DIALOG (§7 Overlay).

    This was a `Sheet` with two buttons in it — the shape for DOING something
    with inputs, used to ask a yes/no question. It also rolled its own button
    pair, so the destructive one sat on the left on this screen and on the right
    everywhere else `ConfirmDialog` is used.

    The usage warning stays: "archive" is reversible, but archiving something 12
    plans still reference is a different decision from archiving something
    nothing uses, and only the count can tell you which one you are making.
  */
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={`Archive ${name}?`}
      description={
        <>
          It leaves your library and the pickers. Plans and logs that already use it keep working — the name still shows.
          {kind === "exercise" && used > 0 && (
            <span className="mt-2 flex items-start gap-2 rounded-xl bg-warning-soft p-2.5 text-caption text-warning">
              <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>Still used in {parts}. Those keep showing it; it just won't be offered for new plans.</span>
            </span>
          )}
        </>
      }
      confirmLabel={busy ? "Archiving…" : "Archive"}
      destructive
      onConfirm={() => void archive()}
    />
  );
}

interface FoodRow { id: string; name: string; calories: number; brand: string | null; tenant_id: string | null; visibility?: string | null; protein_g?: number; carbs_g?: number; fat_g?: number; image_url?: string | null }

const FOOD_TAG_LABEL = { seed: "Library", shared: "Shared", private: "Mine" } as const;
type FoodTag = keyof typeof FOOD_TAG_LABEL;
const foodTag = (f: FoodRow): FoodTag => (f.tenant_id === null ? "seed" : f.visibility === "private" ? "private" : "shared");
const foodTagTone = (t: FoodTag) => (t === "seed" ? "cardio" : t === "private" ? "neutral" : "activity");

function Foods() {
  const units = useUnits();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<FoodRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useCollectionView("foods");
  const [facets, setFacets] = useState<FacetSelection>({ kind: null, owner: null });
  // `null` = closed; `{}` = new; `{ id }` = edit that food.
  const [editor, setEditor] = useState<{ id?: string } | null>(null);
  const [menuFor, setMenuFor] = useState<FoodRow | null>(null);
  const [archiveFor, setArchiveFor] = useState<FoodRow | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try { setItems((await api.get<{ foods: FoodRow[] }>(`/api/foods?q=${encodeURIComponent(q)}`)).foods); }
    catch (e) { setError(errorText(e, "We couldn't reach your library.")); }
  }, [q]);
  useEffect(() => { const t = setTimeout(() => void load(), 200); return () => clearTimeout(t); }, [load]);

  // Type (whole vs branded) + ownership. `Filters` drops a facet that cannot
  // split the loaded set, so these are passed unconditionally.
  const groups = [
    {
      key: "kind", label: "Type",
      options: [
        ...((items ?? []).some((f) => !f.brand) ? [{ value: "whole", label: "Whole" }] : []),
        ...((items ?? []).some((f) => f.brand) ? [{ value: "branded", label: "Branded" }] : []),
      ],
    },
    {
      key: "owner", label: "Where it came from",
      options: (["private", "shared", "seed"] as const)
        .filter((o) => (items ?? []).some((f) => foodTag(f) === o))
        .map((o) => ({ value: o, label: FOOD_TAG_LABEL[o] })),
    },
  ];
  const filtered = items === null ? null : items.filter((f) =>
    (!facets.kind || (facets.kind === "branded" ? !!f.brand : !f.brand)) &&
    (!facets.owner || foodTag(f) === facets.owner),
  );

  const macros = (f: FoodRow) => (
    <>
      <span className="numeral font-semibold text-calories">{fmtEnergy(f.calories, units)}</span>
      {f.protein_g != null && <MacroInline proteinG={f.protein_g} carbsG={f.carbs_g ?? 0} fatG={f.fat_g ?? 0} className="text-xs" />}
    </>
  );
  const menu = (f: FoodRow) => (
    <Button size="icon" variant="ghost" className="shrink-0 text-muted-foreground" aria-label={`Actions for ${f.name}`}
      onClick={(ev) => { ev.stopPropagation(); setMenuFor(f); }}><Ellipsis /></Button>
  );

  return (
    <>
      <Collection
        items={filtered}
        itemKey={(f) => f.id}
        error={error}
        onRetry={() => void load()}
        noun="foods"
        view={view}
        onView={setView}
        query={q}
        onQuery={setQ}
        filter={<Filters groups={groups} value={facets} onChange={setFacets} />}
        narrowed={activeFacetCount(facets) > 0}
        onClearFilters={() => setFacets({ kind: null, owner: null })}
        action={<Button variant="tonal" aria-label="New food" onClick={() => setEditor({})}><Plus /></Button>}
        thumb={44}
        empty={{
          icon: Utensils,
          title: "No foods yet",
          description: "Add one, or build your library from the Eat tab.",
          action: <Button onClick={() => setEditor({})}><Plus /> New food</Button>,
        }}
        renderList={(f) => (
          // Two lines, so the NAME gets the full width — it shares its line with
          // one menu button; energy, macros and where it came from sit beneath.
          <Row
            leading={<FoodThumb src={f.image_url} size={44} />}
            onClick={() => setEditor({ id: f.id })}
            trailing={menu(f)}
            sub={
              <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                {macros(f)}
                <Badge tone={foodTagTone(foodTag(f))}>{FOOD_TAG_LABEL[foodTag(f)]}</Badge>
              </span>
            }
          >
            {f.name}{f.brand && <span className="ml-1.5 text-caption font-normal text-muted-foreground">{f.brand}</span>}
          </Row>
        )}
        renderGrid={(f) => (
          <Card className="relative overflow-hidden p-0">
            <button onClick={() => setEditor({ id: f.id })} className="block w-full text-left transition-opacity active:opacity-80">
              <div className="aspect-square bg-nutrition-soft"><FoodThumb src={f.image_url} size={0} className="!size-full !rounded-none" /></div>
              <div className="px-3 pb-3 pt-2">
                <div className="truncate text-sm font-semibold">{f.name}</div>
                {f.brand && <div className="truncate text-xs text-muted-foreground">{f.brand}</div>}
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">{macros(f)}</div>
              </div>
            </button>
            <div className="absolute right-1 top-1 rounded-full bg-background/70 backdrop-blur-sm">{menu(f)}</div>
          </Card>
        )}
      />

      {editor && (
        <FoodEditor
          foodId={editor.id}
          isStaff
          onClose={() => setEditor(null)}
          onSaved={() => { const wasNew = !editor.id; setEditor(null); if (wasNew && q) setQ(""); else void load(); }}
        />
      )}
      {menuFor && (
        <Sheet open onClose={() => setMenuFor(null)} title={menuFor.name}>
          <Group>
            <Row icon={PencilLine} iconTone="primary" chevron={false} onClick={() => { const f = menuFor; setMenuFor(null); setEditor({ id: f.id }); }}>Edit</Row>
            {/* Seeds (tenant_id null) can't be archived — only a tenant's own rows. */}
            {menuFor.tenant_id !== null && (
              <Row icon={Archive} tone="danger" chevron={false} onClick={() => { const f = menuFor; setMenuFor(null); setArchiveFor(f); }}>Archive</Row>
            )}
          </Group>
        </Sheet>
      )}
      {archiveFor && <ArchiveConfirm kind="food" id={archiveFor.id} name={archiveFor.name} onClose={() => setArchiveFor(null)} onDone={() => { setArchiveFor(null); void load(); }} />}
    </>
  );
}

interface Template { id: string; name: string; visibility: string; createdBy: string }

function Templates() {
  const nav = useNavigate();
  const [kind, setKind] = useState<"workout" | "meal">("workout");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Template[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clients, setClients] = useState<ClientOpt[]>([]);
  const [useFor, setUseFor] = useState<Template | null>(null); // template being applied to a client
  const [toDelete, setToDelete] = useState<Template | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setError(null);
    try { setItems((await api.get<{ templates: Template[] }>(`/api/${kind}-templates`)).templates); }
    catch (e) { setError(errorText(e, "We couldn't reach your templates.")); }
  }, [kind]);
  useEffect(() => { setItems(null); void load(); }, [load]);
  useEffect(() => { void api.get<{ clients: ClientOpt[] }>("/api/clients").then((r) => setClients(r.clients)).catch(() => undefined); }, []);
  const remove = async (t: Template) => { await api.del(`/api/${kind}-templates/${t.id}`); await load(); };
  const applyTo = async (clientId: string) => {
    if (!useFor) return;
    setBusy(true);
    try {
      const { plan } = await api.post<{ plan: { id: string } }>(`/api/${kind}-plans/from-template`, { clientId, templateId: useFor.id });
      setUseFor(null);
      nav(`/clients/${clientId}/plans/${kind}/${plan.id}`); // straight into the builder to publish
    } finally { setBusy(false); }
  };

  const needle = q.trim().toLowerCase();
  const filtered = items === null ? null : items.filter((t) => !needle || t.name.toLowerCase().includes(needle));

  return (
    <div className="space-y-3">
      <SegmentedControl fill options={[{ value: "workout", label: "Workout" }, { value: "meal", label: "Meal" }]} value={kind} onChange={setKind} />
      <Collection
        items={filtered}
        itemKey={(t) => t.id}
        error={error}
        onRetry={() => void load()}
        noun="templates"
        query={q}
        onQuery={setQ}
        thumb={0}
        empty={{
          icon: LayoutGrid,
          title: `No ${kind} templates yet`,
          description: "Save any plan as a template from its builder to reuse it across clients.",
        }}
        renderList={(t) => (
          <Row
            icon={kind === "workout" ? Dumbbell : Utensils}
            iconTone={kind === "workout" ? "activity" : "nutrition"}
            sub={t.visibility === "tenant" ? "Shared with the team" : "Only you"}
            chevron={false}
            trailing={
              <span className="flex shrink-0 items-center gap-1">
                <Button size="sm" variant="tonal" onClick={() => setUseFor(t)}><Send /> Use</Button>
                <Button size="icon" variant="ghost" className="text-muted-foreground" aria-label={`Delete template ${t.name}`} onClick={() => setToDelete(t)}><Trash2 /></Button>
              </span>
            }
          >
            {t.name}
          </Row>
        )}
      />

      {/* Deleting used to happen on the FIRST tap of an unlabelled bin, with no
          confirmation of any kind — the only irreversible control in the
          Library that asked nothing. */}
      <ConfirmDialog
        open={toDelete != null}
        onOpenChange={(o) => { if (!o) setToDelete(null); }}
        title={`Delete ${toDelete?.name ?? "this template"}?`}
        description="Plans already created from it are unaffected. The template itself cannot be recovered."
        confirmLabel="Delete"
        destructive
        onConfirm={() => { const t = toDelete; setToDelete(null); if (t) void remove(t); }}
      />

      {useFor && (
        <Sheet open onClose={() => !busy && setUseFor(null)} title={`Use “${useFor.name}”`}>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Creates a {kind} plan for the client and opens the builder, so you can review it before publishing.</p>
            {clients.length === 0 ? (
              <EmptyState icon={Users} title="No clients yet" description="Add someone to your roster first." />
            ) : (
              <Group>
                {clients.map((cl) => (
                  <Row
                    key={cl.id}
                    leading={<Avatar name={cl.displayName} src={cl.avatarUrl} seed={cl.avatarSeed ?? cl.id} className="size-10" />}
                    disabled={busy}
                    onClick={() => void applyTo(cl.id)}
                  >
                    {cl.displayName}
                  </Row>
                ))}
              </Group>
            )}
          </div>
        </Sheet>
      )}
    </div>
  );
}

interface Resource { id: string; type: string; title: string; status: string; audience: string; category?: string | null; topics?: string[] }
interface ClientOpt { id: string; displayName: string; avatarUrl?: string | null; avatarSeed?: string | null }

const AUDIENCE_LABEL: Record<string, string> = { clients: "All clients", public: "Public", assigned: "Specific clients" };
/** The DB's words are not the coach's (§10). `status` was printed verbatim, so
 *  a badge read "published" in lower case beside sentence-cased ones. */
const ARTICLE_STATUS: Record<string, string> = { published: "Live", draft: "Draft", archived: "Archived" };

function Content() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Resource[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // `null` = closed; `{}` = new; `{ id }` = edit that article.
  const [sheet, setSheet] = useState<{ id?: string } | null>(null);
  const [menuFor, setMenuFor] = useState<Resource | null>(null);
  const [clients, setClients] = useState<ClientOpt[]>([]);
  const load = useCallback(async () => {
    setError(null);
    try { setItems((await api.get<{ resources: Resource[] }>("/api/resources")).resources); }
    catch (e) { setError(errorText(e, "We couldn't reach your content.")); }
  }, []);
  useEffect(() => void load(), [load]);
  useEffect(() => { void api.get<{ clients: ClientOpt[] }>("/api/clients").then((r) => setClients(r.clients)).catch(() => undefined); }, []);
  const tone = (s: string) => (s === "published" ? "success" : s === "archived" ? "warning" : "neutral");

  const needle = q.trim().toLowerCase();
  const filtered = items === null ? null : items.filter((r) => !needle || r.title.toLowerCase().includes(needle));

  return (
    <>
      <Collection
        items={filtered}
        itemKey={(r) => r.id}
        error={error}
        onRetry={() => void load()}
        noun="articles"
        query={q}
        onQuery={setQ}
        thumb={0}
        action={<Button variant="tonal" aria-label="Write article" onClick={() => setSheet({})}><Plus /></Button>}
        empty={{
          icon: PencilLine,
          title: "Nothing published yet",
          description: "Articles, recipes and routines — public ones become your marketplace blog.",
          action: <Button onClick={() => setSheet({})}><PencilLine /> Write article</Button>,
        }}
        renderList={(r) => (
          <Row
            icon={PencilLine}
            iconTone={r.status === "published" ? "primary" : undefined}
            onClick={() => setSheet({ id: r.id })}
            sub={[r.category || r.type, AUDIENCE_LABEL[r.audience] ?? r.audience].join(" · ")}
            trailing={
              <span className="flex shrink-0 items-center gap-1">
                <Badge tone={tone(r.status)}>{ARTICLE_STATUS[r.status] ?? r.status}</Badge>
                <Button size="icon" variant="ghost" className="text-muted-foreground" aria-label={`Actions for ${r.title}`} onClick={(e) => { e.stopPropagation(); setMenuFor(r); }}><Ellipsis /></Button>
              </span>
            }
          >
            {r.title}
          </Row>
        )}
      />
      {sheet && <ArticleEditor id={sheet.id} clients={clients} onClose={() => setSheet(null)} onSaved={() => { setSheet(null); void load(); }} />}
      {menuFor && <ArticleActions article={menuFor} onClose={() => setMenuFor(null)} onEdit={() => { const id = menuFor.id; setMenuFor(null); setSheet({ id }); }} onChanged={() => { setMenuFor(null); void load(); }} />}
    </>
  );
}

/** Create/edit an article — AI draft, cover, category + tags, audience (with a
 *  per-client picker for "specific clients"), saved as draft or published. */
function ArticleEditor({ id, clients, onClose, onSaved }: { id?: string; clients: ClientOpt[]; onClose: () => void; onSaved: () => void }) {
  const [loading, setLoading] = useState(!!id);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("");
  const [tags, setTags] = useState("");
  const [audience, setAudience] = useState<"public" | "clients" | "assigned">("clients");
  const [assigned, setAssigned] = useState<string[]>([]);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverBusy, setCoverBusy] = useState(false);
  const [aiTopic, setAiTopic] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  // `/api/ai/article` + `/api/ai/cover-image` are gated on aiSuite.
  const canAi = useCan("aiSuite");
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    void api.get<{ resource: { title?: string; summary?: string | null; bodyMd?: string | null; category?: string | null; topics?: string[]; audience?: string; assignedClientIds?: string[]; coverUrl?: string | null } }>(`/api/resources/${id}`)
      .then((r) => { if (!alive) return; const x = r.resource; setTitle(x.title ?? ""); setSummary(x.summary ?? ""); setBody(x.bodyMd ?? ""); setCategory(x.category ?? ""); setTags((x.topics ?? []).join(", ")); setAudience((x.audience as typeof audience) ?? "clients"); setAssigned(x.assignedClientIds ?? []); setCoverUrl(x.coverUrl ?? null); setLoading(false); })
      .catch(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [id]);

  const genCover = async () => { setCoverBusy(true); setErr(null); try { const r = await api.post<{ url: string }>("/api/ai/cover-image", { prompt: title || aiTopic }); setCoverUrl(r.url); } catch (e) { setErr(e); } finally { setCoverBusy(false); } };
  const draftAi = async () => { setAiBusy(true); setErr(null); try { const r = await api.post<{ article: { title: string; summary: string; body: string } }>("/api/ai/article", { topic: aiTopic }); setTitle(r.article.title); setSummary(r.article.summary ?? ""); setBody(r.article.body); } catch (e) { setErr(e); } finally { setAiBusy(false); } };
  const toggleClient = (cid: string) => setAssigned((p) => (p.includes(cid) ? p.filter((x) => x !== cid) : [...p, cid]));

  const save = async (status: "draft" | "published") => {
    setBusy(true); setErr(null);
    try {
      const req = { type: "article", title, summary: summary || undefined, bodyMd: body, coverUrl: coverUrl || undefined, category: category.trim() || undefined, topics: tags.split(",").map((t) => t.trim()).filter(Boolean), audience, assignedClientIds: audience === "assigned" ? assigned : [] };
      const rid = id ? (await api.patch(`/api/resources/${id}`, req), id) : (await api.post<{ id: string }>("/api/resources", req)).id;
      await api.post(`/api/resources/${rid}/publish`, { status });
      onSaved();
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };

  return (
    <Sheet open onClose={onClose} title={id ? "Edit article" : "Write article"}>
      <Reveal loading={loading} skeleton={
        <div className="space-y-4">
          <Skeleton className="h-11 rounded-xl" />
          <Skeleton className="h-11 rounded-xl" />
          <div className="grid grid-cols-2 gap-3"><Skeleton className="h-11 rounded-xl" /><Skeleton className="h-11 rounded-xl" /></div>
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-11 rounded-xl" />
        </div>
      }>
        {!loading && (
        <div className="space-y-4">
          {!id && canAi && (
            <div className="space-y-2 rounded-2xl bg-primary/10 p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-primary"><AiAvatar className="size-6" /> Draft with AI</div>
              <div className="flex gap-2">
                <input value={aiTopic} onChange={(e) => setAiTopic(e.target.value)} placeholder="Topic — e.g. Sleep for muscle growth" className="min-w-0 flex-1 rounded-lg bg-surface-2 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/70" />
                <Button size="sm" disabled={aiBusy || aiTopic.trim().length < 3} onClick={() => void draftAi()}>{aiBusy ? "Writing…" : "Draft"}</Button>
              </div>
            </div>
          )}
          {err ? <AiErrorBox error={err} /> : null}
          <Field label="Title" icon={PencilLine} value={title} onChange={(e) => setTitle(e.target.value)} />
          <Field label="Summary" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="One-line teaser (optional)" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Nutrition" />
            <Field label="Tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="comma, separated" />
          </div>
          <div className="space-y-2">
            {coverUrl && <img src={coverUrl} alt="Cover" className="h-32 w-full rounded-xl object-cover" />}
            {canAi && <Button size="sm" variant="secondary" className="w-full" disabled={coverBusy || (!title && !aiTopic)} onClick={() => void genCover()}><AiAvatar className="size-5" /> {coverBusy ? "Generating…" : coverUrl ? "Regenerate cover" : "Generate cover image"}</Button>}
          </div>
          <div><label className="mb-1.5 block text-sm font-medium text-muted-foreground">Body (markdown — supports tables)</label><Textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} /></div>
          <div className="space-y-1.5">
            <div className="text-xs text-muted-foreground">Who sees it</div>
            <div className="flex flex-wrap gap-2">{(["clients", "public", "assigned"] as const).map((a) => <Chip key={a} selected={audience === a} onClick={() => setAudience(a)}>{AUDIENCE_LABEL[a]}</Chip>)}</div>
          </div>
          {audience === "assigned" && (
            <div className="space-y-1.5">
              <div className="text-xs text-muted-foreground">Shared only with {assigned.length ? `${assigned.length} client${assigned.length === 1 ? "" : "s"}` : "…pick clients"}</div>
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-border/50 p-1.5">
                {clients.length === 0 ? <p className="p-2 text-center text-xs text-muted-foreground">No clients yet.</p> : clients.map((cl) => (
                  <button key={cl.id} onClick={() => toggleClient(cl.id)} className={cn("flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm transition-colors", assigned.includes(cl.id) ? "bg-primary/10 text-primary" : "hover:bg-surface-2")}>
                    <span className="truncate">{cl.displayName}</span>
                    {assigned.includes(cl.id) && <span className="text-xs">✓</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" disabled={busy || title.trim().length < 2} onClick={() => void save("draft")}>{busy ? "Saving…" : "Save draft"}</Button>
            <Button className="flex-1" disabled={busy || title.trim().length < 2} onClick={() => void save("published")}><Send /> Publish</Button>
          </div>
        </div>
        )}
      </Reveal>
    </Sheet>
  );
}

/** Article lifecycle menu — publish/unpublish, archive/restore, delete. */
function ArticleActions({ article, onClose, onEdit, onChanged }: { article: Resource; onClose: () => void; onEdit: () => void; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const act = (fn: () => Promise<unknown>) => async () => { setBusy(true); try { await fn(); onChanged(); } catch { setBusy(false); } };
  const status = (sv: string) => api.post(`/api/resources/${article.id}/publish`, { status: sv });
  return (
    <Sheet open onClose={onClose} title={article.title}>
      {/* The app's rows. This file had its own `ActionRow` — a private copy of
          `Row` with different heights, no press animation and no stagger — and
          so did the plan list, which is how two menus in one product end up
          feeling like two products. */}
      <Group>
        <Row icon={PencilLine} iconTone="primary" chevron={false} onClick={onEdit}>Edit</Row>
        {article.status !== "published" && <Row icon={Send} iconTone="success" chevron={false} disabled={busy} onClick={act(() => status("published"))}>Publish</Row>}
        {article.status === "published" && <Row icon={History} chevron={false} sub="Back to a draft only you can see" disabled={busy} onClick={act(() => status("draft"))}>Unpublish</Row>}
        {article.status !== "archived" && <Row icon={Archive} chevron={false} sub="Hide it without deleting" disabled={busy} onClick={act(() => status("archived"))}>Archive</Row>}
        {article.status === "archived" && <Row icon={History} chevron={false} disabled={busy} onClick={act(() => status("draft"))}>Restore to draft</Row>}
        <Row icon={Trash2} tone="danger" chevron={false} disabled={busy} onClick={() => setConfirmDel(true)}>Delete permanently</Row>
      </Group>

      <ConfirmDialog
        open={confirmDel}
        onOpenChange={(o) => { if (!o) setConfirmDel(false); }}
        title={`Delete ${article.title}?`}
        description="Anyone who has read it keeps nothing, and it cannot be recovered. Archive instead if you only want it out of the way."
        confirmLabel={busy ? "Deleting…" : "Delete"}
        destructive
        onConfirm={act(() => api.del(`/api/resources/${article.id}`))}
      />
    </Sheet>
  );
}

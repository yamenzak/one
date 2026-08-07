/** Client Explore — the tenant's content hub (articles / recipes / routines),
 *  a premium magazine surface: search + category chips, a featured cover hero,
 *  fresh article cards, and an immersive reader with a cover-bleed header. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, Badge, Chip, Field, Button, Page, Stagger, EmptyState, motion, cn, ArrowLeft, Search, Clock, BookOpen, Utensils, Dumbbell, AlertTriangle, Reveal, SkeletonHero, SkeletonList, DUR} from "@4dl/ui";
import { api } from "../../api.js";
import { Markdown } from "../../Markdown.js";

interface Resource { id: string; type: string; title: string; summary: string | null; bodyMd: string | null; coverUrl: string | null; durationMinutes: number | null; category?: string | null; topics?: string[] }

/** ~200 wpm reading estimate from the body (falls back to the summary). */
const readMin = (r: Resource) => Math.max(1, Math.round(((r.bodyMd ?? r.summary ?? "").trim().split(/\s+/).filter(Boolean).length || 60) / 200));
const typeIcon = (t: string) => (t === "recipe" ? Utensils : t === "warmup" || t === "stretch" ? Dumbbell : BookOpen);
const matches = (r: Resource, q: string) => {
  const s = q.toLowerCase();
  return r.title.toLowerCase().includes(s) || (r.summary ?? "").toLowerCase().includes(s) || (r.category ?? "").toLowerCase().includes(s) || (r.topics ?? []).some((t) => t.toLowerCase().includes(s));
};

export function Explore({ clientId, onBack }: { clientId: string; onBack: () => void }) {
  const [items, setItems] = useState<Resource[] | null>(null);
  const [open, setOpen] = useState<Resource | null>(null);
  const [cat, setCat] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState(false);
  const reqRef = useRef(0);
  const load = useCallback(async () => {
    const rid = ++reqRef.current;
    setError(false);
    try {
      const r = await api.get<{ resources: Resource[] }>(`/api/resources/feed?clientId=${clientId}`);
      if (rid === reqRef.current) setItems(r.resources);
    } catch {
      if (rid === reqRef.current) setError(true);
    }
  }, [clientId]);
  useEffect(() => void load(), [load]);

  const categories = useMemo(() => [...new Set((items ?? []).map((r) => r.category).filter((x): x is string => !!x))], [items]);
  const filtered = (items ?? []).filter((r) => (!cat || r.category === cat) && (!q.trim() || matches(r, q)));
  const featured = filtered[0];
  const rest = featured ? filtered.slice(1) : [];

  if (open) return <Reader r={open} onBack={() => setOpen(null)} />;

  return (
    <Page className="column space-y-5 p-4 pb-28">
      <div className="flex items-center gap-3">
        <Button size="icon" variant="secondary" onClick={onBack} aria-label="Back"><ArrowLeft /></Button>
        <div className="min-w-0">
          <h1 className="text-title-2">Explore</h1>
          <p className="text-body text-muted-foreground">Guides &amp; recipes from your coach</p>
        </div>
      </div>

      {items && items.length > 0 && (
        <Field label="Search" icon={Search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search articles, tags…" />
      )}

      {categories.length > 0 && (
        <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
          <span className="shrink-0"><Chip selected={cat === null} onClick={() => setCat(null)}>All</Chip></span>
          {categories.map((cName) => <span key={cName} className="shrink-0"><Chip selected={cat === cName} onClick={() => setCat(cName)}>{cName}</Chip></span>)}
        </div>
      )}

      {error && !items ? (
        <EmptyState icon={AlertTriangle} title="Couldn't load Explore" description="Something went wrong loading content. Check your connection and try again." action={<Button onClick={() => void load()}>Try again</Button>} />
      ) : (
      <Reveal loading={!items} className="space-y-5" skeleton={
        <>
          <SkeletonHero height={224} />
          <div className="space-y-3">
            <SkeletonList card rows={1} thumb={96} />
            <SkeletonList card rows={1} thumb={96} />
            <SkeletonList card rows={1} thumb={96} />
          </div>
        </>
      }>
        {items && (filtered.length === 0 ? (
          <EmptyState icon={BookOpen} title={q || cat ? "Nothing matches" : "Nothing here yet"} description={q || cat ? "Try another search or category." : "Your coach hasn't published articles or routines yet."} />
        ) : (
          <div className="space-y-5">
            {featured && <FeaturedCard r={featured} onOpen={() => setOpen(featured)} />}
            {rest.length > 0 && (
              <Stagger className="space-y-3">
                {rest.map((r) => <ArticleCard key={r.id} r={r} onOpen={() => setOpen(r)} />)}
              </Stagger>
            )}
          </div>
        ))}
      </Reveal>
      )}
    </Page>
  );
}

/** The lead story — a full-bleed cover with a legible gradient scrim. */
function FeaturedCard({ r, onOpen }: { r: Resource; onOpen: () => void }) {
  const Icon = typeIcon(r.type);
  return (
    <motion.button initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: DUR.slow, ease: [0.22, 1, 0.36, 1] }} whileTap={{ scale: 0.985 }} onClick={onOpen} className="relative block w-full overflow-hidden rounded-3xl text-left shadow-lg">
      {r.coverUrl ? <img src={r.coverUrl} alt="" className="h-56 w-full object-cover" /> : <div className="grid h-56 w-full place-items-center bg-gradient-to-br from-primary/30 via-primary/10 to-surface-2 text-primary/60 [&_svg]:size-12"><Icon /></div>}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
      <div className="absolute left-4 top-4"><span className="rounded-full bg-white/15 px-2.5 py-1 text-micro uppercase text-white backdrop-blur-md">Featured</span></div>
      <div className="absolute inset-x-0 bottom-0 p-5">
        <div className="mb-2 flex items-center gap-2 text-caption font-medium text-white/85">
          {r.category && <span className="rounded-full bg-primary px-2 py-0.5 font-semibold text-primary-foreground">{r.category}</span>}
          <span className="inline-flex items-center gap-1 [&_svg]:size-3.5"><Clock /> {readMin(r)} min</span>
        </div>
        <h2 className="text-title-3 font-bold leading-tight tracking-tight text-white">{r.title}</h2>
        {r.summary && <p className="mt-1 line-clamp-2 text-body text-white/75">{r.summary}</p>}
      </div>
    </motion.button>
  );
}

/** A rich list card — cover thumbnail, category, read time, title, tags. */
function ArticleCard({ r, onOpen }: { r: Resource; onOpen: () => void }) {
  const Icon = typeIcon(r.type);
  return (
    <motion.button whileTap={{ scale: 0.99 }} onClick={onOpen} className="block w-full text-left">
      <Card interactive className="flex gap-3.5 p-3">
        <div className="size-24 shrink-0 overflow-hidden rounded-2xl bg-surface-2">
          {r.coverUrl ? <img src={r.coverUrl} alt="" className="size-full object-cover" /> : <div className="grid size-full place-items-center bg-gradient-to-br from-primary/15 to-surface-3 text-primary [&_svg]:size-6"><Icon /></div>}
        </div>
        <div className="min-w-0 flex-1 py-0.5">
          <div className="mb-1 flex items-center gap-2 text-caption text-muted-foreground">
            {r.category ? <Badge tone="activity">{r.category}</Badge> : <span className="capitalize">{r.type}</span>}
            <span className="inline-flex items-center gap-1 [&_svg]:size-3"><Clock /> {readMin(r)} min</span>
          </div>
          <h3 className="line-clamp-2 font-semibold leading-snug">{r.title}</h3>
          {r.summary && <p className="mt-1 line-clamp-2 text-body text-muted-foreground">{r.summary}</p>}
          {(r.topics ?? []).length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">{(r.topics ?? []).slice(0, 3).map((t) => <span key={t} className="rounded-full bg-surface-2 px-2 py-0.5 text-caption text-muted-foreground">#{t}</span>)}</div>
          )}
        </div>
      </Card>
    </motion.button>
  );
}

/** Immersive reader — cover-bleed header, meta, then the premium Markdown body. */
function Reader({ r, onBack }: { r: Resource; onBack: () => void }) {
  return (
    <Page className="column p-0 pb-28">
      {r.coverUrl ? (
        <div className="relative">
          <img src={r.coverUrl} alt="" className="h-60 w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />
          <button onClick={onBack} aria-label="Back" className="absolute left-4 top-4 grid size-9 place-items-center rounded-full bg-black/40 text-white backdrop-blur-md transition-colors hover:bg-black/60 [&_svg]:size-5"><ArrowLeft /></button>
        </div>
      ) : (
        <div className="p-4"><Button size="icon" variant="secondary" onClick={onBack} aria-label="Back"><ArrowLeft /></Button></div>
      )}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DUR.slow, ease: [0.22, 1, 0.36, 1] }}
        className={cn("column space-y-4 px-4", r.coverUrl && "relative -mt-8")}
      >
        <div className="flex flex-wrap items-center gap-2">
          {r.category && <Badge tone="activity">{r.category}</Badge>}
          <span className="inline-flex items-center gap-1 text-caption text-muted-foreground [&_svg]:size-3.5"><Clock /> {readMin(r)} min read</span>
        </div>
        <h1 className="text-title-2 font-bold leading-tight tracking-tight">{r.title}</h1>
        {r.summary && <p className="text-body-lg leading-relaxed text-muted-foreground">{r.summary}</p>}
        {(r.topics ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1.5">{(r.topics ?? []).map((t) => <span key={t} className="rounded-full bg-surface-2 px-2.5 py-0.5 text-caption text-muted-foreground">#{t}</span>)}</div>
        )}
        <div className="h-px bg-gradient-to-r from-border to-transparent" />
        {r.bodyMd ? <Markdown className="text-body text-foreground/90">{r.bodyMd}</Markdown> : <p className="text-body leading-relaxed text-foreground/90">{r.summary}</p>}
      </motion.div>
    </Page>
  );
}

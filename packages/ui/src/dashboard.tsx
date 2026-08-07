/**
 * THE DASHBOARD SHELL — the platform's SECOND shell shape, and the reason there
 * are two.
 *
 * `AppBar` + `BottomTabs` + `NavRail` (shell.tsx) is the phone-first shape: a
 * handful of destinations, one column, thumb-reachable. It is what Kova and
 * Tessa are, and it is right for them.
 *
 * This is the desk shape: a labelled sidebar of grouped destinations, a thin
 * breadcrumb bar, and an inset content panel. It exists because a product with
 * twenty-three destinations cannot express them as five tabs — a bottom bar
 * with an "More…" tab is a menu wearing a tab's costume, and the sixteenth
 * destination is unreachable in any real sense.
 *
 * ── This is not a licence to diverge ─────────────────────────────────────────
 *
 * Both shapes are built from the SAME tokens, the same type scale, the same
 * motion, and they contain the same `Section`/`Group`/`Row` grammar. What
 * differs is how you get between screens, which is a function of how many
 * screens there are and whether the person is holding the device or sitting at
 * it. An app picks one shape; it does not invent a third. If a product needs
 * something neither shape offers, that is a change to this file, in review, for
 * every app at once — which is the whole point of it living here.
 *
 * ── The chrome is published by the PAGE, not passed down the tree ────────────
 *
 * Breadcrumbs and top-bar actions belong to the screen you are on, and the
 * screen is rendered several levels below the shell by a router the shell knows
 * nothing about. Threading them through props would make every intermediate
 * component carry chrome it does not use. So a page CALLS `usePageChrome` and
 * the shell reads it — and the effect clears on unmount, so a stale action from
 * the previous screen can never sit in the bar of the next one.
 */

import * as React from "react";
import { motion } from "motion/react";
import { chromeIn, contentIn, contentStagger } from "./lib/animation.js";
import { cn } from "./lib/utils.js";
import { ArrowLeft, Circle, Menu, MoreVertical, PanelLeft } from "./lib/icons.js";
import { Button } from "./primitives.js";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, Tooltip } from "./overlays.js";
import { Breadcrumbs, NavDrawer, ScrollArea, type Crumb } from "./shell.js";
import { SkeletonHeader } from "./skeleton.js";
import { useShape } from "./shapes.js";

/* ═══════════════════════ the chrome a page publishes ═══════════════════════ */

/** A sub-item of a dropdown-style page action. */
export interface PageActionItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "destructive";
}

/**
 * A page-level action in the shell's top bar. Inline on wide screens, collapsed
 * into a ⋮ menu on narrow ones.
 *
 * `items` makes it a dropdown. `overflow: "always"` keeps it in the ⋮ menu even
 * when there is room — for destructive actions, which should cost one more
 * deliberate tap than the thing beside them.
 */
export interface PageAction {
  key: string;
  label: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  variant?: "default" | "outline" | "ghost" | "secondary" | "destructive";
  disabled?: boolean;
  items?: PageActionItem[];
  overflow?: "auto" | "always";
}

export interface Chrome {
  crumbs: Crumb[];
  actions: PageAction[];
}

const ChromeCtx = React.createContext<{ chrome: Chrome; setChrome: React.Dispatch<React.SetStateAction<Chrome>> } | null>(null);

export function PageChromeProvider({ children }: { children: React.ReactNode }) {
  const [chrome, setChrome] = React.useState<Chrome>({ crumbs: [], actions: [] });
  const value = React.useMemo(() => ({ chrome, setChrome }), [chrome]);
  return <ChromeCtx.Provider value={value}>{children}</ChromeCtx.Provider>;
}

export function useChrome(): Chrome {
  return React.useContext(ChromeCtx)?.chrome ?? { crumbs: [], actions: [] };
}

/**
 * Publish this page's breadcrumbs and top-bar actions.
 *
 * ⚠️ `deps` is the dependency list for the PUBLISH, not for the chrome object —
 * pass `[]` for a static trail, `[name]` for one that names a loaded record. It
 * clears on unmount, which is what stops the previous screen's Delete button
 * appearing in the next screen's bar.
 */
export function usePageChrome(chrome: { crumbs?: Crumb[]; actions?: PageAction[] }, deps: React.DependencyList): void {
  const ctx = React.useContext(ChromeCtx);
  const set = ctx?.setChrome;
  React.useEffect(() => {
    if (!set) return;
    set({ crumbs: chrome.crumbs ?? [], actions: chrome.actions ?? [] });
    return () => set({ crumbs: [], actions: [] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/* ═════════════════════════════ the sidebar ═════════════════════════════════ */

export interface NavItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

function NavButton({ item, active, collapsed, onClick }: { item: NavItem; active: boolean; collapsed: boolean; onClick: () => void }) {
  const btn = (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex items-center rounded-lg text-body font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        collapsed ? "mx-auto size-10 justify-center" : "w-full gap-3 px-2.5 py-2",
        active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
      )}
    >
      <span className="flex size-[18px] shrink-0 items-center justify-center [&_svg]:size-[18px]">{item.icon ?? <Circle />}</span>
      {!collapsed && <span className="truncate">{item.label}</span>}
    </button>
  );
  // Collapsed, the label IS the tooltip — there is nothing else identifying the
  // icon. `side="right"` because the rail is on the left and the default `top`
  // would cover the item above the one being pointed at.
  return collapsed ? <Tooltip content={item.label} side="right">{btn}</Tooltip> : btn;
}

/**
 * The labelled, grouped sidebar — rendered by BOTH the desktop rail and the
 * mobile drawer, from one definition.
 *
 * Exported because a product may want it somewhere the shell does not put it
 * (a settings sub-navigation, a two-pane picker), and the alternative is a
 * second list that looks the same and drifts.
 */
export function NavSidebar({ navGroups, active, onNavigate, brand, footer, collapsed = false }: {
  navGroups: NavGroup[];
  active: string;
  onNavigate: (key: string) => void;
  /** The product's mark. A node, so this package carries no brand of its own. */
  brand?: (collapsed: boolean) => React.ReactNode;
  /** Account, plan, sign-out. Receives `collapsed` so it can go icons-only. */
  footer?: (collapsed: boolean) => React.ReactNode;
  collapsed?: boolean;
}) {
  return (
    // Chrome enters LAST (§8's tier order) and never has a skeleton — it is not
    // waiting for data, it is the frame the data arrives into.
    <motion.div initial="hidden" animate="show" variants={chromeIn} className="flex h-full flex-col">
      {brand && <div className={cn("flex h-14 shrink-0 items-center", collapsed ? "justify-center px-0" : "px-4")}>{brand(collapsed)}</div>}
      {/*
        `mask` is not decoration here. Without it the scroll region ends in a
        hard horizontal cut, and a nav list longer than the viewport lands that
        cut mid-glyph on whichever item straddles the fold — which reads as a
        broken layout, not as "there is more below". The fade is the only thing
        distinguishing a scrollable list from a clipped one, because the
        scrollbar is an overlay and has faded out by the time anybody looks.

        Found in a screenshot, not in review: it is invisible in the source and
        unmissable in a picture.
      */}
      <ScrollArea mask className="min-h-0 flex-1 px-2">
        <nav className="flex flex-col gap-4 py-2">
          {navGroups.map((group) => (
            <div key={group.label} className="flex flex-col gap-1">
              {!collapsed && <div className="px-2.5 pb-1 text-micro uppercase text-sidebar-foreground/45">{group.label}</div>}
              {group.items.map((item) => (
                <NavButton key={item.key} item={item} active={item.key === active} collapsed={collapsed} onClick={() => onNavigate(item.key)} />
              ))}
            </div>
          ))}
        </nav>
      </ScrollArea>
      {footer && <div className="shrink-0 p-2">{footer(collapsed)}</div>}
    </motion.div>
  );
}

/* ═══════════════════════════ the top-bar actions ═══════════════════════════ */

/** Flatten actions into menu rows: a `menu` action becomes a labelled group. */
function actionMenuRows(actions: PageAction[]): React.ReactNode[] {
  const rows: React.ReactNode[] = [];
  actions.forEach((a, i) => {
    if (a.items?.length) {
      if (i > 0) rows.push(<DropdownMenuSeparator key={`${a.key}-sep`} />);
      rows.push(<DropdownMenuLabel key={`${a.key}-lbl`}>{a.label}</DropdownMenuLabel>);
      a.items.forEach((it) =>
        rows.push(
          <DropdownMenuItem key={it.key} disabled={it.disabled} onSelect={it.onClick} destructive={it.variant === "destructive"}>
            {it.icon}
            {it.label}
          </DropdownMenuItem>,
        ),
      );
    } else {
      rows.push(
        <DropdownMenuItem key={a.key} disabled={a.disabled} onSelect={a.onClick} destructive={a.variant === "destructive"}>
          {a.icon}
          {a.label}
        </DropdownMenuItem>,
      );
    }
  });
  return rows;
}

/**
 * A page's own actions, inline on wide screens and collapsed into a ⋮ menu on
 * narrow ones.
 *
 * EXPORTED because the chrome mechanism (`usePageChrome`) is the package's and
 * the SHELL is the app's. Scena publishes actions from every screen and used to
 * get them rendered by `DashboardShell`'s breadcrumb bar for free; moving that
 * app onto the phone-first shell took the renderer away and every "Pair
 * screen", "Publish" and "Delete" silently vanished. A mechanism with one
 * private renderer is a mechanism that only works inside one shell.
 */
export function ShellActions({ actions }: { actions: PageAction[] }) {
  if (!actions.length) return null;
  const pinned = actions.filter((a) => a.overflow !== "always");
  const overflowOnly = actions.filter((a) => a.overflow === "always");
  return (
    <>
      {/* Inline from `sm` up. */}
      <div className="hidden items-center gap-2 sm:flex">
        {pinned.map((a) =>
          a.items?.length ? (
            <DropdownMenu key={a.key}>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant={a.variant ?? "default"} disabled={a.disabled}>
                  {a.icon}
                  <span className="hidden md:inline">{a.label}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {a.items.map((it) => (
                  <DropdownMenuItem key={it.key} disabled={it.disabled} onSelect={it.onClick} destructive={it.variant === "destructive"}>
                    {it.icon}
                    {it.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button key={a.key} size="sm" variant={a.variant ?? "default"} disabled={a.disabled} onClick={a.onClick}>
              {a.icon}
              <span className="hidden md:inline">{a.label}</span>
            </Button>
          ),
        )}
        {overflowOnly.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="More actions">
                <MoreVertical />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">{actionMenuRows(overflowOnly)}</DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {/* Below `sm` everything collapses into one ⋮ — including the primary
          action, because four buttons in a 40px bar on a phone is four targets
          nobody can hit. */}
      <div className="sm:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Page actions">
              <MoreVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">{actionMenuRows(actions)}</DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}

/* ══════════════════════════════ the frame ══════════════════════════════════ */

const COLLAPSE_KEY = "4dl.sidebar.collapsed";

export interface DashboardShellProps {
  navGroups: NavGroup[];
  active: string;
  onNavigate: (key: string) => void;
  /** The product's mark, for the sidebar head. */
  brand?: (collapsed: boolean) => React.ReactNode;
  /** Breadcrumb label when the page publishes none — usually its title. */
  fallbackCrumb?: string;
  /** Where the root crumb points, and what it is called. */
  home?: Crumb;
  /** Navigate when a breadcrumb hop is clicked. */
  onCrumb?: (to: string) => void;
  /** Sidebar footer; receives the collapsed state so it can render icons-only. */
  footer?: (collapsed: boolean) => React.ReactNode;
  children: React.ReactNode;
}

export function DashboardShell({ navGroups, active, onNavigate, brand, fallbackCrumb, home, onCrumb, footer, children }: DashboardShellProps) {
  const [collapsed, setCollapsed] = React.useState<boolean>(() => typeof localStorage !== "undefined" && localStorage.getItem(COLLAPSE_KEY) === "1");
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const chrome = useChrome();

  const toggleCollapsed = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {
        /* a private window refuses storage; the toggle still works for the session */
      }
      return !c;
    });

  const handleNavigate = React.useCallback(
    (key: string) => {
      onNavigate(key);
      setMobileOpen(false);
    },
    [onNavigate],
  );

  const published = chrome.crumbs.length ? chrome.crumbs : fallbackCrumb ? [{ label: fallbackCrumb }] : [];
  const crumbs = home ? [home, ...published] : published;
  const sidebar = (c: boolean) => <NavSidebar navGroups={navGroups} active={active} onNavigate={handleNavigate} brand={brand} footer={footer} collapsed={c} />;

  return (
    /* 100dvh, not 100vh: on mobile the browser chrome makes `vh` taller than
       what is visible, so the frame itself scrolls and the inset panel below
       never gets its own scroll container. */
    <div className="flex h-[100dvh] w-full overflow-hidden bg-sidebar font-sans text-foreground">
      <aside className={cn("hidden shrink-0 transition-[width] duration-200 ease-out md:block", collapsed ? "w-[68px]" : "w-[248px]")}>{sidebar(collapsed)}</aside>

      <div className="flex min-w-0 flex-1 flex-col gap-2 p-2 md:pl-0">
        <header className="flex h-10 shrink-0 items-center gap-1.5 px-1">
          <Button variant="ghost" size="icon-sm" className="md:hidden" aria-label="Open navigation" onClick={() => setMobileOpen(true)}>
            <Menu />
          </Button>
          {/* The SAME sidebar the desktop renders — one navigation drawn twice,
              never two lists that drift. */}
          <NavDrawer open={mobileOpen} onClose={() => setMobileOpen(false)}>
            {sidebar(false)}
          </NavDrawer>
          <Button variant="ghost" size="icon-sm" className="hidden text-muted-foreground md:inline-flex" onClick={toggleCollapsed} aria-label="Toggle sidebar">
            <PanelLeft />
          </Button>
          <Breadcrumbs crumbs={crumbs} onNavigate={(to) => onCrumb?.(to)} />
          <div className="ml-auto flex shrink-0 items-center">
            <ShellActions actions={chrome.actions} />
          </div>
        </header>

        {/* The content panel is its OWN scroll container. The frame never
            scrolls, so the sidebar and the breadcrumb bar stay put. */}
        {/* A `Shape` (§11.2) is the one thing that must NOT sit inside this
            padding, and the panel is already the bounded box it needs: its
            panes scroll on their own, so the outer scroller stands down and
            the shape fills the frame edge to edge. `has-[[data-shape]]` is a
            descendant match rather than a child one because an app's routes
            wrap their element in at least a remount key. */}
        <main className="min-h-0 flex-1 overflow-hidden rounded-xl bg-background shadow-sm">
          <div className="h-full overflow-y-auto has-[[data-shape]]:overflow-hidden">
              {/*
              THE PANEL ORCHESTRATES, and until now nothing did.

              §8's entrance choreography is variant-driven: a component declares
              `contentIn` or `rowIn` and an ANCESTOR hands it the label. Kova's
              `Page` does that for every screen it wraps. This shell did not, so
              every screen in a dashboard app rendered with its motion inert —
              the same `Section`, `Row` and `Collection` components, correctly
              declaring their variants, and simply never told to show. Two
              products built from one design system, one of which animated.

              Keyed on the active destination so moving between them re-runs the
              entrance rather than swapping content in place. It is not keyed on
              the full route: inside a two-pane, opening a record must not
              re-animate the list beside it.
            */}
            <motion.div
              key={active}
              initial="hidden"
              animate="show"
              variants={contentStagger}
              className="w-full px-5 py-6 has-[[data-shape]]:h-full has-[[data-shape]]:p-0 sm:px-7 lg:px-8"
            >
              {children}
            </motion.div>
          </div>
        </main>
      </div>
    </div>
  );
}

/* ════════════════════════════ the page opener ══════════════════════════════ */

/**
 * The title block a dashboard page opens with — its T1 anchor (§1).
 *
 * ⚠️ It does NOT repeat the breadcrumbs or the primary action. Those are the
 * shell's, published through `usePageChrome`, and a page that renders its own
 * copy gives you two Delete buttons twelve pixels apart with no way to tell
 * which one you pressed.
 *
 * `actions` here is for controls that BELONG to the content — a search box, a
 * filter, a view toggle. Anything that acts on the page as a whole is chrome.
 */
export function PageHeader({ title, description, back, actions, className, children }: {
  title: React.ReactNode;
  description?: React.ReactNode;
  /**
   * Inner-page back link.
   *
   * DROPPED inside a `Shape` two-pane (§11.4 rule 3), where the list it returns
   * to is already on screen — an arrow that appears to do nothing. The caller
   * passes it unconditionally and the shape decides; see `useShape`.
   */
  back?: { label?: string; onClick: () => void };
  /** Right-aligned CONTENT controls: search, filters, view toggles. */
  actions?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  const { twoPane } = useShape();
  return (
    <motion.div variants={contentIn} className={cn("mb-6", className)}>
      {back && !twoPane && (
        <button
          onClick={back.onClick}
          className="mb-3 inline-flex items-center gap-1.5 rounded-sm text-caption font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <ArrowLeft className="size-4" /> {back.label ?? "Back"}
        </button>
      )}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="truncate text-title-2">{title}</h1>
          {description ? <p className="mt-1 text-body text-muted-foreground">{description}</p> : null}
          {children}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </motion.div>
  );
}

/** Title and description at their real sizes, so arrival is a fill. */
PageHeader.Skeleton = function PageHeaderSkeleton({ action = false, className }: { action?: boolean; className?: string }) {
  return <SkeletonHeader action={action} className={className} />;
};

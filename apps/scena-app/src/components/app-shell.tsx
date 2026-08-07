import * as React from "react";
import { Circle, Menu, PanelLeft, MoreVertical } from "lucide-react";

import { ScenaIcon } from "../brand.js";
import { cn } from "@/lib/utils";
import { Button, ScrollArea, Tooltip } from "@4dl/ui";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useChrome, type Crumb, type PageAction, type PageActionItem } from "@/components/page-chrome";

const COLLAPSE_KEY = "scena.sidebar.collapsed";

export type NavItem = { key: string; label: string; icon?: React.ReactNode };
export type NavGroup = { label: string; items: NavItem[] };

export interface AppShellProps {
  navGroups: NavGroup[];
  active: string;
  onNavigate: (key: string) => void;
  /** Fallback breadcrumb label when the page publishes none (the page title). */
  fallbackCrumb?: string;
  /** Navigate when a breadcrumb hop is clicked. */
  onCrumb?: (to: string) => void;
  /** Sidebar footer; receives the collapsed state so it can render icons-only. */
  footer?: (collapsed: boolean) => React.ReactNode;
  children: React.ReactNode;
}

function Wordmark({ collapsed }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-2 overflow-hidden">
      <ScenaIcon size={28} className="shrink-0" />
      {!collapsed && <span className="truncate text-lg font-bold tracking-tight">Scena</span>}
    </div>
  );
}

function NavButton({ item, active, collapsed, onClick }: { item: NavItem; active: boolean; collapsed: boolean; onClick: () => void }) {
  const btn = (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex items-center rounded-lg text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        collapsed ? "mx-auto size-10 justify-center" : "w-full gap-3 px-2.5 py-2",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
      )}
    >
      <span className="flex size-[18px] shrink-0 items-center justify-center [&_svg]:size-[18px]">{item.icon ?? <Circle />}</span>
      {!collapsed && <span className="truncate">{item.label}</span>}
    </button>
  );
  if (!collapsed) return btn;
  return (
    <Tooltip content={item.label} side="right">
      {btn}
    </Tooltip>
  );
}

function SidebarBody({
  navGroups, active, onNavigate, footer, collapsed,
}: Pick<AppShellProps, "navGroups" | "active" | "onNavigate" | "footer"> & { collapsed: boolean }) {
  return (
    <div className="flex h-full flex-col">
      <div className={cn("flex h-14 shrink-0 items-center", collapsed ? "justify-center px-0" : "px-4")}>
        <Wordmark collapsed={collapsed} />
      </div>
      <ScrollArea className="min-h-0 flex-1 px-2">
        <nav className="flex flex-col gap-4 py-2">
          {navGroups.map((group) => (
            <div key={group.label} className="flex flex-col gap-1">
              {!collapsed && (
                <div className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/45">{group.label}</div>
              )}
              {group.items.map((item) => (
                <NavButton key={item.key} item={item} active={item.key === active} collapsed={collapsed} onClick={() => onNavigate(item.key)} />
              ))}
            </div>
          ))}
        </nav>
      </ScrollArea>
      {footer && <div className="shrink-0 p-2">{footer(collapsed)}</div>}
    </div>
  );
}

function ShellBreadcrumbs({ crumbs, onCrumb }: { crumbs: Crumb[]; onCrumb?: (to: string) => void }) {
  const all: Crumb[] = [{ label: "Home", to: "/" }, ...crumbs];
  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        {all.map((c, i) => {
          const last = i === all.length - 1;
          return (
            <React.Fragment key={`${c.label}-${i}`}>
              <BreadcrumbItem className="min-w-0">
                {last || !c.to ? (
                  <BreadcrumbPage className="truncate">{c.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink onClick={() => onCrumb?.(c.to!)} className="truncate">{c.label}</BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!last && <BreadcrumbSeparator />}
            </React.Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

/** Flatten actions into dropdown-menu rows. A `menu` action (has items) becomes
 *  a labeled group; a plain action becomes a single row. */
function actionMenuRows(actions: PageAction[]): React.ReactNode[] {
  const rows: React.ReactNode[] = [];
  actions.forEach((a, i) => {
    if (a.items?.length) {
      if (i > 0) rows.push(<DropdownMenuSeparator key={`${a.key}-sep`} />);
      rows.push(<DropdownMenuLabel key={`${a.key}-lbl`}>{a.label}</DropdownMenuLabel>);
      a.items.forEach((it: PageActionItem) => rows.push(
        <DropdownMenuItem key={it.key} disabled={it.disabled} onClick={it.onClick} className={it.variant === "destructive" ? "text-destructive" : undefined}>
          {it.icon}{it.label}
        </DropdownMenuItem>,
      ));
    } else {
      rows.push(
        <DropdownMenuItem key={a.key} disabled={a.disabled} onClick={a.onClick} className={a.variant === "destructive" ? "text-destructive" : undefined}>
          {a.icon}{a.label}
        </DropdownMenuItem>,
      );
    }
  });
  return rows;
}

function ShellActions({ actions }: { actions: PageAction[] }) {
  if (!actions.length) return null;
  // Pinned actions show inline on wide screens; `overflow: "always"` ones live
  // only in the ⋮ menu (e.g. Delete). On narrow screens everything collapses.
  const pinned = actions.filter((a) => a.overflow !== "always");
  const overflowOnly = actions.filter((a) => a.overflow === "always");
  return (
    <>
      {/* Inline on ≥sm */}
      <div className="hidden items-center gap-2 sm:flex">
        {pinned.map((a) =>
          a.items?.length ? (
            <DropdownMenu key={a.key}>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant={a.variant ?? "default"} disabled={a.disabled}>{a.icon}<span className="hidden md:inline">{a.label}</span></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {a.items.map((it) => (
                  <DropdownMenuItem key={it.key} disabled={it.disabled} onClick={it.onClick} className={it.variant === "destructive" ? "text-destructive" : undefined}>{it.icon}{it.label}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button key={a.key} size="sm" variant={a.variant ?? "default"} disabled={a.disabled} onClick={a.onClick}>{a.icon}<span className="hidden md:inline">{a.label}</span></Button>
          ),
        )}
        {overflowOnly.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8" aria-label="More actions"><MoreVertical className="size-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">{actionMenuRows(overflowOnly)}</DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {/* Everything collapses to one ⋮ menu on < sm */}
      <div className="sm:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" aria-label="Page actions"><MoreVertical className="size-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">{actionMenuRows(actions)}</DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}

export function AppShell({ navGroups, active, onNavigate, fallbackCrumb, onCrumb, footer, children }: AppShellProps) {
  const [collapsed, setCollapsed] = React.useState<boolean>(() => (typeof localStorage !== "undefined" && localStorage.getItem(COLLAPSE_KEY) === "1"));
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const chrome = useChrome();

  const toggleCollapsed = () =>
    setCollapsed((c) => {
      try { localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1"); } catch { /* ignore */ }
      return !c;
    });

  const handleNavigate = React.useCallback((key: string) => { onNavigate(key); setMobileOpen(false); }, [onNavigate]);
  const crumbs: Crumb[] = chrome.crumbs.length ? chrome.crumbs : fallbackCrumb ? [{ label: fallbackCrumb }] : [];

  return (
    <>
      {/* 100dvh (not 100vh) so the frame matches the *visual* viewport on mobile —
          otherwise the browser chrome pushes it taller and the whole shell scrolls;
          only the inset <main> below should scroll. */}
      <div className="flex h-[100dvh] w-full overflow-hidden bg-sidebar font-sans text-foreground">
        {/* Desktop rail */}
        <aside className={cn("hidden shrink-0 transition-[width] duration-200 ease-out md:block", collapsed ? "w-[68px]" : "w-[248px]")}>
          <SidebarBody navGroups={navGroups} active={active} onNavigate={handleNavigate} footer={footer} collapsed={collapsed} />
        </aside>

        {/* Main column: a thin top bar in the chrome + the inset content panel */}
        <div className="flex min-w-0 flex-1 flex-col gap-2 p-2 md:pl-0">
          <header className="flex h-10 shrink-0 items-center gap-1.5 px-1">
            {/* Mobile: hamburger → sheet */}
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <Button variant="ghost" size="icon" className="size-8 md:hidden" aria-label="Open navigation" onClick={() => setMobileOpen(true)}>
                <Menu className="size-5" />
              </Button>
              <SheetContent side="left" className="w-[260px] bg-sidebar p-0 text-sidebar-foreground">
                <SheetHeader className="sr-only"><SheetTitle>Navigation</SheetTitle></SheetHeader>
                <SidebarBody navGroups={navGroups} active={active} onNavigate={handleNavigate} footer={footer} collapsed={false} />
              </SheetContent>
            </Sheet>
            {/* Desktop: collapse toggle */}
            <Button variant="ghost" size="icon" className="hidden size-8 text-muted-foreground md:inline-flex" onClick={toggleCollapsed} aria-label="Toggle sidebar">
              <PanelLeft className="size-4" />
            </Button>
            <ShellBreadcrumbs crumbs={crumbs} onCrumb={onCrumb} />
            <div className="ml-auto flex shrink-0 items-center">
              <ShellActions actions={chrome.actions} />
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-hidden rounded-xl bg-background shadow-sm">
            <div className="h-full overflow-y-auto">
              <div className="w-full px-5 py-6 sm:px-7 lg:px-8">{children}</div>
            </div>
          </main>
        </div>
      </div>
    </>
  );
}

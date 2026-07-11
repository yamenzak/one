/**
 * Role-adaptive shell (DESIGN.md §5) — one app, nav by persona + mode. Premium
 * app bar + animated tab bar / nav rail + account dropdown. Overlays for
 * settings, wellness, shop, admin.
 */

import { useEffect, useMemo, useState } from "react";
import {
  AppBar, Avatar, BottomTabs, NavRail, Button, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  Home, Dumbbell, Utensils, LineChart, Users, LayoutGrid, Wallet, Settings as SettingsIcon, Sun, Moon, LogOut, Store, HeartPulse, ShieldCheck, ArrowLeftRight, Check, type TabDef,
} from "@mossa/ui";
import { useSession, useActiveClientId } from "./session.js";
import { useTheme } from "./theme.js";
import { api } from "./api.js";
import { Today } from "./screens/client/Today.js";
import { Train } from "./screens/client/Train.js";
import { Eat } from "./screens/client/Eat.js";
import { Progress } from "./screens/client/Progress.js";
import { CoachToday } from "./screens/coach/CoachToday.js";
import { Clients } from "./screens/coach/Clients.js";
import { Business } from "./screens/coach/Business.js";
import { Library } from "./screens/coach/Library.js";
import { Settings } from "./screens/Settings.js";
import { Wellness } from "./screens/client/Wellness.js";
import { Onboarding } from "./screens/client/Onboarding.js";
import { Shop } from "./screens/client/Shop.js";
import { Explore } from "./screens/client/Explore.js";
import { AdminConsole } from "./screens/admin/AdminConsole.js";
import { NotificationBell } from "./NotificationBell.js";
import { BookOpen } from "@mossa/ui";

const CLIENT_TABS: TabDef[] = [
  { key: "today", label: "Today", icon: Home },
  { key: "train", label: "Train", icon: Dumbbell },
  { key: "eat", label: "Eat", icon: Utensils },
  { key: "progress", label: "Progress", icon: LineChart },
];

export function Shell() {
  const { ctx, mode, setMode, switchTenant, signOut, refresh } = useSession();
  const { mode: themeMode, toggleMode } = useTheme();
  const clientId = useActiveClientId();
  const active = ctx!.active!;
  const isStaff = active.role !== "client";
  const clientSurface = !isStaff || mode === "train";

  const tabs = useMemo<TabDef[]>(() => {
    if (clientSurface) return CLIENT_TABS;
    const t: TabDef[] = [
      { key: "today", label: "Today", icon: Home },
      { key: "clients", label: "Clients", icon: Users },
      { key: "library", label: "Library", icon: LayoutGrid },
    ];
    if (active.role === "owner") t.push({ key: "business", label: "Business", icon: Wallet });
    return t;
  }, [clientSurface, active.role]);

  const [tab, setTab] = useState("today");
  const [overlay, setOverlay] = useState<"settings" | "wellness" | "shop" | "admin" | "explore" | null>(null);
  const current = tabs.some((t) => t.key === tab) ? tab : "today";

  const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(null);
  const gateClientId = active.role === "client" ? active.clientId : null;
  useEffect(() => {
    if (!gateClientId) return setNeedsOnboarding(false);
    void api.get<{ client: { onboardingComplete: boolean } }>(`/api/clients/${gateClientId}`).then((r) => setNeedsOnboarding(!r.client.onboardingComplete)).catch(() => setNeedsOnboarding(false));
  }, [gateClientId]);

  if (gateClientId && needsOnboarding) return <Onboarding clientId={gateClientId} displayName={ctx!.user.name || "there"} onDone={() => setNeedsOnboarding(false)} />;
  if (overlay === "settings") return <Settings onBack={() => setOverlay(null)} />;
  if (overlay === "wellness" && clientId) return <Wellness clientId={clientId} onBack={() => setOverlay(null)} />;
  if (overlay === "shop" && clientId) return <Shop clientId={clientId} onBack={() => setOverlay(null)} />;
  if (overlay === "explore" && clientId) return <Explore clientId={clientId} onBack={() => setOverlay(null)} />;
  if (overlay === "admin") return <AdminConsole onBack={() => setOverlay(null)} />;

  const enterTrainMode = async () => {
    if (!active.clientId) {
      await api.post("/api/clients/self");
      await refresh();
    }
    setMode("train");
    setTab("today");
  };

  return (
    <div className="min-h-dvh pb-20 md:pb-0 md:pl-24">
      <AppBar
        leading={
          <div className="flex min-w-0 items-center gap-2">
            {ctx!.branding?.logoUrl ? (
              <img src={ctx!.branding.logoUrl} alt={active.tenantName} className="h-8 max-w-32 object-contain" />
            ) : (
              <span className="truncate text-base font-semibold tracking-tight">{active.tenantName}</span>
            )}
            {isStaff && (
              <span className="hidden rounded-full bg-secondary px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground sm:inline">
                {clientSurface ? "Train" : "Coach"}
              </span>
            )}
          </div>
        }
        trailing={
          <>
          <NotificationBell />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="rounded-full outline-none ring-ring focus-visible:ring-2" aria-label="Account">
                <Avatar name={ctx!.user.name || ctx!.user.email} seed={ctx!.user.email} className="size-9" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>{ctx!.user.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {isStaff && (
                <>
                  <DropdownMenuItem onSelect={clientSurface ? () => (setMode("coach"), setTab("today")) : () => void enterTrainMode()}>
                    <ArrowLeftRight /> {clientSurface ? "Switch to Coach mode" : "Switch to Train mode"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              {/* Cross-tenant switching is hidden on a custom domain — the
                  domain IS the tenant (SPEC §14.1). */}
              {ctx!.personas.length > 1 && !ctx!.hostTenantId && (
                <>
                  {ctx!.personas.map((p) => (
                    <DropdownMenuItem key={p.tenantId} onSelect={() => void switchTenant(p.tenantId)}>
                      <Store /> {p.tenantName}
                      {p.tenantId === active.tenantId && <Check className="ml-auto size-4 text-primary" />}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                </>
              )}
              {clientSurface && clientId && (
                <>
                  <DropdownMenuItem onSelect={() => setOverlay("explore")}>
                    <BookOpen /> Explore
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setOverlay("wellness")}>
                    <HeartPulse /> Wellness &amp; supplements
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setOverlay("shop")}>
                    <Store /> Plans &amp; access
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuItem onSelect={() => setOverlay("settings")}>
                <SettingsIcon /> Settings &amp; passkeys
              </DropdownMenuItem>
              {ctx!.isPlatformAdmin && (
                <DropdownMenuItem onSelect={() => setOverlay("admin")}>
                  <ShieldCheck /> Platform admin
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={toggleMode}>
                {themeMode === "dark" ? <Sun /> : <Moon />} {themeMode === "dark" ? "Light mode" : "Dark mode"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onSelect={() => void signOut().then(() => location.reload())}>
                <LogOut /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          </>
        }
      />

      <main>
        {clientSurface && clientId ? (
          <>
            {current === "today" && <Today clientId={clientId} onStart={() => setTab("train")} />}
            {current === "train" && <Train clientId={clientId} />}
            {current === "eat" && <Eat clientId={clientId} />}
            {current === "progress" && <Progress clientId={clientId} />}
          </>
        ) : clientSurface ? (
          <div className="p-8 text-center text-muted-foreground">
            No client record yet.
            <Button className="mt-4" onClick={() => void enterTrainMode()}>
              Create my training space
            </Button>
          </div>
        ) : (
          <>
            {current === "today" && <CoachToday />}
            {current === "clients" && <Clients />}
            {current === "library" && <Library />}
            {current === "business" && <Business />}
          </>
        )}
      </main>

      <BottomTabs tabs={tabs} active={current} onSelect={setTab} />
      <NavRail
        tabs={tabs}
        active={current}
        onSelect={setTab}
        brand={ctx!.branding?.iconUrl ? <img src={ctx!.branding.iconUrl} alt={active.tenantName} className="size-full object-cover" /> : active.tenantName.charAt(0).toUpperCase()}
      />
    </div>
  );
}

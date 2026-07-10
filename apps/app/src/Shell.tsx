/**
 * The role-adaptive shell (DESIGN.md §5): one app, one page grammar, nav by
 * persona + mode. Client → Today/Train/Eat/Progress. Staff (coach mode) →
 * Today/Clients/Library/Business(owner). Staff with a linked client record
 * can flip to Train mode = the client nav pointed at their own record.
 */

import { useMemo, useState } from "react";
import { AppBar, BottomTabs, Button, NavRail, Sheet, type TabDef } from "@mossa/ui";
import { useSession, useActiveClientId } from "./session.js";
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

const CLIENT_TABS: TabDef[] = [
  { key: "today", label: "Today", icon: "☀️" },
  { key: "train", label: "Train", icon: "🏃" },
  { key: "eat", label: "Eat", icon: "🍽️" },
  { key: "progress", label: "Progress", icon: "📈" },
];

export function Shell() {
  const { ctx, mode, setMode, switchTenant, signOut, refresh } = useSession();
  const clientId = useActiveClientId();
  const active = ctx!.active!;
  const isStaff = active.role !== "client";
  const clientSurface = !isStaff || mode === "train";

  const tabs = useMemo<TabDef[]>(() => {
    if (clientSurface) return CLIENT_TABS;
    const t: TabDef[] = [
      { key: "today", label: "Today", icon: "☀️" },
      { key: "clients", label: "Clients", icon: "🤝" },
      { key: "library", label: "Library", icon: "📚" },
    ];
    if (active.role === "owner") t.push({ key: "business", label: "Business", icon: "💼" });
    return t;
  }, [clientSurface, active.role]);

  const [tab, setTab] = useState("today");
  const [menuOpen, setMenuOpen] = useState(false);
  const [overlay, setOverlay] = useState<"settings" | "wellness" | null>(null);
  const current = tabs.some((t) => t.key === tab) ? tab : "today";

  if (overlay === "settings") return <Settings onBack={() => setOverlay(null)} />;
  if (overlay === "wellness" && clientId) return <Wellness clientId={clientId} onBack={() => setOverlay(null)} />;

  const enterTrainMode = async () => {
    if (!active.clientId) {
      await api.post("/api/clients/self");
      await refresh();
    }
    setMode("train");
    setTab("today");
    setMenuOpen(false);
  };

  return (
    <div className="min-h-dvh md:pl-20">
      <AppBar
        leading={
          isStaff ? (
            <button
              onClick={() => setMenuOpen(true)}
              className="rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold text-fg-muted"
            >
              {clientSurface ? "🏃 Train mode" : "🎓 Coach mode"}
            </button>
          ) : (
            <span className="px-1 text-sm font-semibold text-fg-muted">{active.tenantName}</span>
          )
        }
        title={active.tenantName}
        trailing={
          <button
            onClick={() => setMenuOpen(true)}
            className="grid size-10 place-items-center rounded-full bg-activity-container font-bold text-activity"
            aria-label="Account"
          >
            {(ctx!.user.name || ctx!.user.email).slice(0, 1).toUpperCase()}
          </button>
        }
      />

      <main>
        {clientSurface && clientId ? (
          <>
            {current === "today" && <Today clientId={clientId} />}
            {current === "train" && <Train clientId={clientId} />}
            {current === "eat" && <Eat clientId={clientId} />}
            {current === "progress" && <Progress clientId={clientId} />}
          </>
        ) : clientSurface ? (
          <div className="p-6 text-center text-fg-muted">
            No client record linked yet — open the menu and tap "Train mode" to create yours.
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
      <NavRail tabs={tabs} active={current} onSelect={setTab} />

      {/* Account / persona sheet */}
      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Account">
        <div className="space-y-4">
          <div className="text-sm text-fg-muted">{ctx!.user.email}</div>

          {isStaff && (
            <div className="flex gap-2">
              <Button variant={!clientSurface ? "tonal" : "ghost"} className="flex-1" onClick={() => (setMode("coach"), setTab("today"), setMenuOpen(false))}>
                🎓 Coach
              </Button>
              <Button variant={clientSurface ? "tonal" : "ghost"} className="flex-1" onClick={() => void enterTrainMode()}>
                🏃 Train
              </Button>
            </div>
          )}

          {ctx!.personas.length > 1 && (
            <div>
              <div className="mb-2 text-sm font-semibold text-good">Workspaces</div>
              {ctx!.personas.map((p) => (
                <button
                  key={p.tenantId}
                  onClick={() => void switchTenant(p.tenantId).then(() => setMenuOpen(false))}
                  className="flex w-full items-center justify-between rounded-2xl px-2 py-3 text-left hover:bg-surface-2"
                >
                  <span>{p.tenantName}</span>
                  <span className="text-xs text-fg-muted">{p.role}</span>
                </button>
              ))}
            </div>
          )}

          <div className="space-y-1">
            {clientSurface && clientId && (
              <button onClick={() => (setOverlay("wellness"), setMenuOpen(false))} className="flex w-full items-center gap-3 rounded-2xl px-2 py-3 text-left hover:bg-surface-2">
                <span className="text-xl">🌿</span> Wellness &amp; supplements
              </button>
            )}
            <button onClick={() => (setOverlay("settings"), setMenuOpen(false))} className="flex w-full items-center gap-3 rounded-2xl px-2 py-3 text-left hover:bg-surface-2">
              <span className="text-xl">⚙️</span> Settings &amp; passkeys
            </button>
          </div>

          <Button variant="outline" className="w-full" onClick={() => void signOut().then(() => location.reload())}>
            Sign out
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

/**
 * Scena's binding to the platform's dashboard shell.
 *
 * The shell itself — the sidebar, the collapse toggle, the mobile drawer, the
 * breadcrumb bar, the action overflow, the inset scroll panel — is
 * `@4dl/ui`'s `DashboardShell`. What was 273 lines here is now the two things
 * that are genuinely Scena's: the wordmark, and the fact that this product's
 * root is the fleet.
 *
 * There is no type pass-through here on purpose. `NavItem`, `NavGroup`,
 * `Crumb` and `PageAction` are the package's, and every screen imports them
 * from `@4dl/ui` directly — re-exporting them from this file would be a second
 * name for one type, which is how an app comes to have its own idea of what a
 * nav item is.
 */
import type * as React from "react";
import { DashboardShell, type DashboardShellProps } from "@4dl/ui";

import { ScenaIcon } from "../brand.js";

export interface AppShellProps extends Omit<DashboardShellProps, "brand" | "home"> {}

function Wordmark({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="flex items-center gap-2 overflow-hidden">
      <ScenaIcon size={28} className="shrink-0" />
      {!collapsed && <span className="truncate text-lg font-bold tracking-tight">Scena</span>}
    </div>
  );
}

export function AppShell(props: AppShellProps): React.ReactElement {
  // `home` is the product's decision: Scena's root is the fleet, and it is
  // called Home because that is what an operator calls the screen they land on.
  return <DashboardShell {...props} brand={(collapsed) => <Wordmark collapsed={collapsed} />} home={{ label: "Home", to: "/" }} />;
}

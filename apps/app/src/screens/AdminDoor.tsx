/**
 * The operator console on its own door (`admin.kova.4dl.app`).
 *
 * Standalone rather than a route inside the Shell, for two reasons:
 *
 *  1. **It must not require a studio.** The Shell scopes everything to an active
 *     persona, and a platform operator need not be a member of any tenant. Routed
 *     through the Shell, an operator with no studio would have been dropped into
 *     the first-run studio wizard.
 *  2. **It is a separate origin now.** `/api/admin/*` is refused on every host but
 *     this one (route-guard.ts), which is what stops an operator's session — valid
 *     across the whole root — from carrying platform powers onto tenant subdomains
 *     they happen to visit. Giving the console its own screen keeps the client side
 *     honest about that boundary instead of implying the console is reachable from
 *     inside a studio.
 *
 * The permission check is still server-side on every call; this only decides what
 * to render for someone who is signed in but not an operator.
 */

import { Button, Card } from "@kova/ui";
import { AdminConsole } from "./admin/AdminConsole.js";
import { useSession } from "../session.js";

export function AdminDoor() {
  const { ctx, signOut } = useSession();

  if (!ctx?.isPlatformAdmin) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-6 py-12">
        <Card className="space-y-3 p-6 text-center">
          <h1 className="text-lg font-semibold tracking-tight">Not an operator account</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            You&rsquo;re signed in, but this address is the platform console. Your studio is at its own address.
          </p>
          <Button variant="secondary" className="w-full" onClick={() => void signOut()}>
            Sign out
          </Button>
        </Card>
      </div>
    );
  }

  // No `onBack` destination exists on this door — there is nothing behind the
  // console here — so the control closes the tab's history entry if it can and
  // otherwise does nothing rather than navigating somewhere that 404s.
  return <AdminConsole onBack={() => history.length > 1 && history.back()} />;
}

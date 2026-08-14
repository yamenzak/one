/**
 * THE HUB — one page, and the door decides what it is.
 *
 * ⚠️ NO ROUTER, AND THAT IS A MEASUREMENT RATHER THAN A PRINCIPLE. Every screen
 * here is picked by two facts — which door, and whether anybody is signed in —
 * neither of which is in the path. A router over one destination per door is a
 * dependency that renders the same element; the first account screen that is
 * genuinely a second place to be is when one earns its way in.
 *
 * ⚠️ AND THE PICK IS A PURE FUNCTION, so it is a test rather than a click
 * through five hostnames. The bug it exists to catch is a state that resolves to
 * nothing: a door served by the worker with no screen behind it renders a blank
 * page, which is the same picture as a page that failed to load.
 */

import { Band, Crown, Page, Spacer, TYPE } from "@quad/web";
import { Waiting, Refusal } from "./ui.js";
import { useSession } from "./session.js";
import type { Face } from "./door.js";
import { Elsewhere } from "./screens/Elsewhere.js";
import { NewWorkspace } from "./screens/NewWorkspace.js";
import { SignIn } from "./screens/SignIn.js";
import { Signpost } from "./screens/Signpost.js";
import { Workspaces } from "./screens/Workspaces.js";

/** What the Hub shows, as a name — the thing the guard and the tests read. */
export type Screen = "waiting" | "stuck" | "signpost" | "sign-in" | "workspaces" | "new-workspace" | "elsewhere";

/**
 * ⚠️ EVERY COMBINATION IS ANSWERED, INCLUDING THE ONES THAT SHOULD NOT HAPPEN.
 * "That cannot occur" is how a blank page ships: the state that could not occur
 * occurs, nothing matches, and React renders nothing at all.
 */
export function pickScreen(
  face: Face | null, signedIn: boolean | null, stuck: boolean,
): Screen {
  if (stuck) return "stuck";
  if (face === null) return "waiting";
  if (face === "signpost") return "signpost";
  if (face === "elsewhere") return "elsewhere";
  /* Both remaining doors need somebody. */
  if (signedIn === null) return "waiting";
  if (!signedIn) return "sign-in";
  return face === "create" ? "new-workspace" : "workspaces";
}

const LEAD: Readonly<Record<string, string>> = {
  create: "Sign in first — a workspace belongs to somebody.",
  hub: "We will email you a code. There is no password to remember or lose.",
};

export function App() {
  const { where, face, me, stuck } = useSession();
  const screen = pickScreen(face, me === null ? null : me !== "nobody", stuck !== null);

  /* ⚠️ A SCREEN SOMEBODY WORKS IN AND A SCREEN SOMEBODY ARRIVES AT ARE NOT THE
     SAME LAYOUT. The first is a column under a ruled crown; the second is a
     centred sheet with no chrome. Using one for both makes the sign-in look like
     a settings page — which is how a product comes to feel like a form. */
  const settled = screen === "workspaces";

  return (
    /* ⚠️ The ambience is an attribute on the frame, read by a stylesheet rule
       built from theme tokens — never an inline style, which would beat every
       token and stop a workspace's branding reaching any screen. */
    <Page sky="calm">
      <Crown
        name="One"
        under={where?.root}
        width={settled ? "work" : "read"}
        ruled={settled}
        aside={me && me !== "nobody" ? <span className={TYPE.note}>{me.email}</span> : null}
      />
      <Band width={settled ? "work" : "read"}>
        <div
          className={settled
            ? "py-8"
            : "min-h-[68dvh] flex flex-col items-center justify-center gap-6 py-8"}
        >
          {screen === "waiting" ? <Waiting what="Getting your workspaces" /> : null}
          {screen === "stuck" && stuck ? <Refusal problem={stuck} /> : null}
          {screen === "signpost" && where ? <Signpost where={where} /> : null}
          {screen === "sign-in" ? <SignIn lead={LEAD[face ?? ""] ?? LEAD.hub!} /> : null}
          {screen === "workspaces" && where ? <Workspaces where={where} /> : null}
          {screen === "new-workspace" && where ? <NewWorkspace where={where} /> : null}
          {screen === "elsewhere" && where ? <Elsewhere where={where} kind={where.kind} /> : null}
        </div>
      </Band>
      <Spacer />
    </Page>
  );
}

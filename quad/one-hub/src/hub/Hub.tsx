/**
 * THE HUB — one surface, presented over whatever somebody was doing.
 *
 * ⚠️ IT IS NOT AN APP AND IT HAS NO NAV. A workspace's people, its bill, its
 * settings and its records are not five places somebody moves between all day —
 * they are things you go and do, once, and then leave. Given a bottom bar they
 * become a product of their own, sitting permanently over whatever the person
 * actually came here to use, and the account they belong to ends up somewhere
 * else entirely.
 *
 * ⚠️ SO IT IS ONE SURFACE, REACHABLE FROM EVERY DOOR, AND IT DISMISSES. The
 * product's own screens keep their shell underneath; the hub is pulled over
 * them and returns you where you were. That is why the way out at the root is
 * an × rather than a back arrow.
 *
 * ⚠️ AND THE SCREEN INSIDE IT IS AN ADDRESS. `where.ts` parses the location and
 * decides what is above each screen, so leaving is never a decision a screen's
 * author makes — see the header there.
 *
 * ⚠️ SOME DOORS HAVE NOTHING UNDERNEATH, AND THEY GET NO WAY OUT. On the
 * account door and the operator door the hub IS the page: an × there closes
 * onto a backdrop, which is a control that appears to do nothing. `onClose` is
 * `null` and the root's crown says so by having no leave control at all.
 */

import {
  Band, CROWN, Layout, LeaveChip, Over, Spacer, placeFace, sentence,
} from "@quad/web";
import type { Ambience } from "@quad/web";
import type { Belonging, Me } from "../api.js";
import { useSession } from "../session.js";
import { HubHome } from "./Home.js";
import { You } from "./You.js";
import { Workspaces } from "./Workspaces.js";
import { OneWorkspace } from "./Workspace.js";
import { WorkspacePart } from "./Part.js";
import { ConsoleHome, ConsolePart } from "./Console.js";
import { OneTenant } from "../console/OneTenant.js";
import { InboxScreen } from "../centre/InboxScreen.js";
import { TellingMe } from "./TellingMe.js";
import { HUB, above, isConsole, nameOf, parseWhere, pathOf, type Where } from "./where.js";

/* ⚠️ Every branch this file draws, named — the guard reads it, because an
   address the parser can produce with no branch renders a blank page. */
export const HUB_SCREENS: readonly Where["at"][] = [
  "home", "you", "inbox", "told", "workspaces", "workspace",
  "people", "money", "plan", "packages", "settings", "notices", "wording", "trust",
  "console", "tenants", "tenant", "actions", "switches", "works", "ground",
];

export function Hub({ path, onGo, onClose }: {
  readonly path: string;
  readonly onGo: (path: string) => void;
  /** `null` where the hub is the page itself — see the header. */
  readonly onClose: (() => void) | null;
}) {
  const where = parseWhere(path);
  const up = above(where);
  const travel = (to: Where) => onGo(pathOf(to));

  const screen = (
    <Screen
      where={where}
      onGo={travel}
      onLeave={up ? () => travel(up) : onClose}
    />
  );

  /* ⚠️ Presented over the product, or the page itself — one set of screens
     either way. Two components would be two designs within a week. */
  if (!onClose) return screen;
  return <Over open onClose={onClose} label="Account and workspaces">{screen}</Over>;
}

/**
 * ⚠️ ONE FRAME FOR EVERY SCREEN, AND IT DECIDES THE WAY OUT FROM THE ADDRESS.
 * The root is dismissed; anything deeper is left upwards. No screen inside
 * knows which of the two it is, which is the only way sixteen of them agree.
 */
function Screen({ where, onGo, onLeave }: {
  readonly where: Where;
  readonly onGo: (to: Where) => void;
  readonly onLeave: (() => void) | null;
}) {
  const { me } = useSession();
  const person = me && me !== "nobody" ? me : null;
  const root = where.at === "home";
  /* ⚠️ ONE TITLE PER SCREEN, AND THE CROWN IS IT. Drawing a `Title` under a
     `PageCrown` puts the same word on the page twice — once at display weight
     and once again three lines down — which reads as a rendering fault. */
  const held = "slug" in where
    ? person?.tenants.find((t) => t.slug === where.slug) ?? null
    : null;

  /*
    ⚠️ ONE MATERIAL ACROSS THE WHOLE HUB, AT THREE STRENGTHS — see `groundOf`.
    ⚠️ AND NOT `aurora`, EVER, HERE: it carries a second hue by design, which a
    monochrome product renders as a green cast nobody chose.
  */
  /*
    ⚠️ THE ROOT HAS NO CROWN, BECAUSE THE FACE IS ITS HEADING. `Identity` puts
    the person at the top of it — their avatar, their address, what they are —
    and a display heading over that is a second name for a screen the face has
    already named. What the crown was carrying that the root still needs is the
    way out, and that is `LeaveChip` on its own (`layout.tsx`).

    ⚠️ AND EVERYTHING ELSE IS `Framed` RATHER THAN CROWNED HERE. The name, the
    way out and the fact under it are properties of the ADDRESS, so they are
    decided once and handed down; what KIND of page it is, and the one thing it
    is for, are the screen's own and it declares them (`@quad/web`'s `Screen`).
    Before this the frame drew a crown around content that then had to guess its
    own width, its own skeleton and where to put its action — and twenty screens
    guessed twenty times.
  */
  return (
    /*
      ⚠️ ONE ADDRESS IN THE HUB LANDS SOMEWHERE RATHER THAN WEARING A MATERIAL,
      and it is a workspace's own screen. `subject` is the whole of saying so:
      the ground becomes that planet's sky, the crown becomes a title card
      wearing the same planet, and the density becomes an arrival's. Those were
      three expressions here, each deriving from `where.slug` and each able to
      disagree with the other two — see `Layout`.

      ⚠️ AND ONLY THAT ONE ADDRESS. People, Money and Settings under the same
      workspace keep `linen`, because an arrival somebody never leaves is not an
      arrival — and because those are screens with eight rows of content on them,
      where a lit colour field is the fault `groundOf` was written to fix.
      Landing is a moment; working is a material.
    */
    <Layout
      sky={groundOf(where)}
      subject={where.at === "workspace" ? placeFace(where.slug) : undefined}
      /* ⚠️ THE ROOT HAS NO FRAME, BECAUSE ITS FACE IS ITS HEADING — see below. */
      frame={root ? undefined : {
        title: where.at === "workspace" ? held?.name ?? where.slug : nameOf(where),
        under: said(where, person, held),
        back: onLeave ?? undefined,
        leave: "back",
      }}
    >
      {root
        ? (
          <>
            <Band width="read">
              <div className={`flex ${CROWN} items-center`}>
                {onLeave ? <LeaveChip leave="dismiss" onDo={onLeave} /> : null}
              </div>
            </Band>
            <Band width="read">
              <div className="py-2"><HubHome person={person} onGo={onGo} /></div>
            </Band>
            {/* ⚠️ Only the root needs one — every `Screen` owns its own
                (`screen.tsx`), and two would split the slack and leave the dock
                halfway up. */}
            <Spacer />
          </>
        )
        : <Inside where={where} onGo={onGo} />}
    </Layout>
  );
}

/**
 * WHICH GROUND, FROM THE ADDRESS — one decision for every screen in the hub.
 *
 * ⚠️ THE HUB WEARS ONE MATERIAL AND VARIES ITS STRENGTH, NOT ITS FAMILY. It
 * carried a drawn line field on its arrival and a soft grey wash one step in,
 * so walking into a workspace changed what the product appeared to be made of
 * — and the wash, being a lit colour behind eight rows of content, read as a
 * dusty grey rather than as a world. All three below are the same drawing at
 * three settings (`ambience.ts`), and the two a person works on are DARKER
 * than the one they land on rather than lighter.
 *
 * ⚠️ AND IT IS READ FROM THE ADDRESS, so no screen picks its own. A screen
 * that chose would be a screen somebody has to remember to update, and the
 * hub has twenty of them.
 */
const groundOf = (where: Where): Ambience => {
  if (where.at === "home") return "silk";
  /* ⚠️ The operator's side is about a deployment rather than a business, and
     the drawing says so before a word is read: schematic, not woven. */
  return isConsole(where) ? "wire" : "linen";
};

/**
 * ⚠️ A FACT, OR NOTHING AT ALL. Every screen used to carry a sentence under its
 * name — "Your details, how you sign in, and what is held about you", "The
 * deployment itself, and nobody else's business" — and every one of them was
 * EXPLAINING the screen to somebody already standing on it. A description is a
 * symptom: if a screen needs one, the name or the contents are wrong
 * (DESIGN.md §1). What survives is what a person could not work out by looking:
 * which workspace this is, and what they are in it.
 */
const said = (
  where: Where, person: Me | null, held: Belonging | null,
): string | undefined => {
  if ("slug" in where) {
    /* ⚠️ ONE WORKSPACE'S LINE IS WHAT THE NAME DOES NOT SAY: which products it
       holds, and what you are in it. */
    if (where.at === "workspace") {
      /* ⚠️ AN APP ID IS NOT A NAME — see `sentence`. `me.who` carries ids
         because it answers before there is a tenancy to read manifests from. */
      const products = (held?.apps ?? []).map(sentence).join(" · ");
      const role = held?.platformRole ? `you are ${held.platformRole}` : "waiting for you to claim it";
      return products ? `${products} · ${role}` : role;
    }
    /* ⚠️ WHOSE WORKSPACE THIS IS, four levels from the root, on a surface
       reachable from any door. It is the one question the name does not answer. */
    return held?.name ?? where.slug;
  }
  return where.at === "home" ? person?.email ?? undefined : undefined;
};

function Inside({ where, onGo }: {
  readonly where: Where;
  readonly onGo: (to: Where) => void;
}) {
  switch (where.at) {
    case "you": return <You onGo={onGo} />;
    case "inbox": return <InboxScreen onGo={() => undefined} onSeen={() => undefined} />;
    case "told": return <TellingMe />;
    case "workspaces": return <Workspaces onGo={onGo} />;
    case "workspace": return <OneWorkspace slug={where.slug} onGo={onGo} />;
    case "people": case "money": case "plan": case "packages": case "settings": case "notices":
    case "trust": case "wording":
      return (
        <WorkspacePart
          part={where.at}
          slug={where.slug}
          app={"app" in where ? where.app : undefined}
          onGo={onGo}
        />
      );
    case "console": return <ConsoleHome onGo={onGo} />;
    case "tenants": case "actions": case "switches": case "works": case "ground":
      return (
        <ConsolePart
          part={where.at}
          app={"app" in where ? where.app : undefined}
          onGo={onGo}
        />
      );
    case "tenant": return <OneTenant id={where.id} />;
    /* ⚠️ Home is drawn by the frame above — it is the only screen with no title
       of its own, because the lockup IS its title. */
    case "home": return null;
  }
}

export { HUB, parseWhere, pathOf };

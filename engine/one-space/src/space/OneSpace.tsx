/**
 * THE SPACE — one surface, presented over whatever somebody was doing.
 *
 * ⚠️ IT IS NOT AN APP AND IT HAS NO NAV. A workspace's people, its bill, its
 * settings and its records are not five places somebody moves between all day —
 * they are things you go and do, once, and then leave. Given a bottom bar they
 * become a product of their own, sitting permanently over whatever the person
 * actually came here to use, and the account they belong to ends up somewhere
 * else entirely.
 *
 * ⚠️ SO IT IS ONE SURFACE, REACHABLE FROM EVERY DOOR, AND IT DISMISSES. The
 * product's own screens keep their shell underneath; OneSpace is pulled over
 * them and returns you where you were. That is why the way out at the root is
 * an × rather than a back arrow.
 *
 * ⚠️ AND THE SCREEN INSIDE IT IS AN ADDRESS. `where.ts` parses the location and
 * decides what is above each screen, so leaving is never a decision a screen's
 * author makes — see the header there.
 *
 * ⚠️ SOME DOORS HAVE NOTHING UNDERNEATH, AND THEY GET NO WAY OUT. On the
 * account door and the operator door OneSpace IS the page: an × there closes
 * onto a backdrop, which is a control that appears to do nothing. `onClose` is
 * `null` and the root's crown says so by having no leave control at all.
 */

import {
  Band, CROWN, Layout, LeaveChip, Over, Spacer, placeFace, sentence, whoFace,
} from "@engine/design";
import type { FaceOf, Sky } from "@engine/design";
import type { Belonging, Me } from "../api.js";
import { useSession } from "../session.js";
import { SpaceHome } from "./Home.js";
import { You } from "./You.js";
import { Workspaces } from "./Workspaces.js";
import { OneWorkspace } from "./Workspace.js";
import { WorkspacePart } from "./Part.js";
import { Preferences } from "../centre/Preferences.js";
import { Formats } from "./Formats.js";
import { Agreed } from "./Agreed.js";
import { ConsoleHome, ConsolePart, ConsoleTenant } from "./Console.js";
import { InboxScreen } from "../centre/InboxScreen.js";
import { Data } from "./Data.js";
import { TellingMe } from "./TellingMe.js";
import {
  OF_CONSOLE, OF_WORKSPACE_SCREEN,
  SPACE, above, atConsoleScreen, atWorkspaceScreen, groundOf, isConsole, nameOf, parseWhere,
  pathOf, seedOf,
  type Where,
} from "./where.js";

/**
 * ⚠️ THIS IS NOT WHAT STOPS A BLANK SCREEN, AND IT SAID IT WAS. The old comment
 * claimed the guard reading this list is why an address always has a branch —
 * and the guard checks that a name appears HERE, which `brand` and `footing`
 * both did while the dispatch below drew neither. A list agreeing with a list
 * proves the two lists agree.
 *
 * ⚠️ THE `never` ASSERTION AT THE END OF `Inside` IS WHAT STOPS IT NOW, because
 * it makes an unanswered address fail the build rather than render nothing. What
 * this list is still good for is the other direction: a `Where` variant that no
 * address can produce, which the compiler cannot see.
 *
 * ⚠️ AND THE TWO HALVES IT SHARES WITH THE ADDRESS GRAMMAR ARE DERIVED RATHER
 * THAN RETYPED. They were written out here a third time, so adding a console
 * screen meant editing three lists — and the one nobody thought of failed a test
 * rather than the build. The only names spelled out are the account centre's
 * own, which no other list holds.
 */
export const SPACE_SCREENS: readonly Where["at"][] = [
  "home", "you", "inbox", "told", "data", "prefs", "formats", "agreed", "workspaces", "workspace",
  ...OF_WORKSPACE_SCREEN,
  "console", "tenant",
  ...OF_CONSOLE,
];

export function OneSpace({ path, onGo, onClose }: {
  readonly path: string;
  readonly onGo: (path: string) => void;
  /** `null` where OneSpace is the page itself — see the header. */
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
    ⚠️ ONE MATERIAL ACROSS THE WHOLE SPACE, AT THREE STRENGTHS — see `groundOf`.
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
    is for, are the screen's own and it declares them (`@engine/design`'s `Screen`).
    Before this the frame drew a crown around content that then had to guess its
    own width, its own skeleton and where to put its action — and twenty screens
    guessed twenty times.
  */
  return (
    /* ⚠️ Two addresses land somewhere; everything else wears a material — see
       `subjectOf`. */
    <Layout
      sky={groundOf(where)}
      seedling={seedOf(where)}
      /* ⚠️ WHAT THIS SCREEN IS, AND WHOSE WORLD IT STANDS IN — two facts, and
         only the first draws a title card. See `aboutOf`. */
      subject={aboutOf(where, person)}
      world={subjectOf(where, person)}
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
              <div className="py-2"><SpaceHome person={person} onGo={onGo} /></div>
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
 * WHAT THIS SCREEN IS ABOUT, WHERE IT IS ABOUT ANYTHING — and two addresses in
 * OneSpace are.
 *
 * ⚠️ THE SPACE HAS EXACTLY TWO ARRIVALS AND THEY ARE THE TWO IDENTITIES IN THE
 * PRODUCT. A workspace's own screen is that workspace's world; the root is
 * YOURS. Everything else is a screen you work on — People, Money, Settings, the
 * console — and those wear a material, because an arrival somebody never leaves
 * is not an arrival and because a lit colour field behind eight rows of content
 * is the fault `groundOf` was written to fix. Landing is a moment; working is a
 * material.
 *
 * ⚠️ AND THE TWO WORLDS ARE DIFFERENT IN KIND, WHICH IS THE WHOLE PAYOFF OF THE
 * SUBJECT BEING A FACE. A workspace's face is a planet, so its ground is space
 * seen large — somewhere you look at from outside. A person's face is a mood, so
 * theirs is an aura: light with no horizon in it, which is what standing in
 * somebody's own place looks like rather than visiting it. Neither is chosen
 * here. `worldFor` reads the kind off the face and the colours out of the
 * picture, so this file names a subject and nothing else.
 *
 * ⚠️ `null` UNTIL THE SESSION RESOLVES, and that is why the root's subject is
 * conditional. A face seeded on nothing is a different person's world for one
 * frame, which is a flash of somebody else's colours on the screen that is
 * supposed to be yours.
 */
export const subjectOf = (where: Where, person: Me | null): FaceOf | undefined => {
  /* ⚠️ THE OPERATOR'S SIDE HAS NO SUBJECT, AND THAT IS WHY IT LOOKS DIFFERENT.
     A console screen is about the deployment rather than about anybody in it, so
     there is nothing whose colours it could be wearing — `groundOf` gives it a
     ruled ground of its own. */
  if (isConsole(where)) return undefined;
  /* ⚠️ A WORKSPACE'S OWN PLANET, ON EVERY SCREEN OF IT — not only on its front
     one. Its roster, its bill, its packages and its trust page are all that
     workspace, so they are all somewhere INSIDE its world; a screen that lost
     the subject fell through to a shared grey material and read as a different
     product one tap in. `"slug" in where` is the same question `pathOf` asks. */
  if ("slug" in where) return placeFace(where.slug);
  /* ⚠️ AND THE ACCOUNT IS THE PERSON, WHEREVER YOU ARE IN IT. Their inbox,
     their data, what they are told and how they sign in are one subject, so the
     whole area stands in their own light. */
  return person ? whoFace(person.accountId) : undefined;
};

/**
 * WHETHER THIS SCREEN IS ITS SUBJECT, OR ONLY STANDS IN ITS WORLD.
 *
 * ⚠️ THE TITLE CARD IS A COMPOSITION FOR A NOUN, AND ONLY SOME SCREENS ARE ONE.
 * A workspace's own screen is that workspace: its planet at the size of the page
 * with its name across it is the one arrangement that says "here". "Your
 * workspaces" is a list of places and "Your data" is a set of controls — handed
 * the same treatment, the frame drew the PERSON at the size of the screen with
 * the word "Workspaces" over it, which is a title card for the wrong noun.
 *
 * ⚠️ SO THE AREA HANDS EVERY SCREEN A WORLD AND ONLY THESE NAME A SUBJECT. The
 * ground stays continuous — which is the whole point of the area — and the hero
 * appears exactly where the screen and the thing are the same.
 *
 * ⚠️ AND A PERSON IS NEVER ONE, WHICH WAS FOUND BY TRYING IT. `you` is a screen
 * about you, so it looked like the second entry — and a person's face at the
 * size of a screen is a flat cartoon blob with "You" written across it, above
 * the same face again at row size and the address it belongs to. A place is seen
 * from outside and scales; a person does not. See `Orb`.
 */
const ABOUT_ITSELF: readonly Where["at"][] = ["workspace"];

const aboutOf = (where: Where, person: Me | null): FaceOf | undefined =>
  (ABOUT_ITSELF as readonly string[]).includes(where.at)
    ? subjectOf(where, person)
    : undefined;

/**
 * WHICH GROUND, FROM THE ADDRESS — one decision for every screen in OneSpace.
 *
 * ⚠️ THE SPACE WEARS ONE MATERIAL AND VARIES ITS STRENGTH, NOT ITS FAMILY. It
 * carried a drawn line field on its arrival and a soft grey wash one step in,
 * so walking into a workspace changed what the product appeared to be made of
 * — and the wash, being a lit colour behind eight rows of content, read as a
 * dusty grey rather than as a world. All three below are the same drawing at
 * three settings (`ambience.ts`), and the two a person works on are DARKER
 * than the one they land on rather than lighter.
 *
 * ⚠️ AND IT IS READ FROM THE ADDRESS, so no screen picks its own. A screen
 * that chose would be a screen somebody has to remember to update, and the
 * OneSpace has twenty of them.
 */


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
      /* ⚠️ AND SO IS A ROLE, and it is said the way the workspaces LIST says it
         — this read "you are owner", which is both the stored key and a
         sentence missing its article, four words from the same fact written
         differently one screen away. */
      const role = held?.platformRole
        ? sentence(held.platformRole) : "waiting for you to claim it";
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
  /*
    ⚠️ ANSWERED BY MEMBERSHIP OF A LIST, NEVER BY A RUN OF `case`s. Every one of
    these goes to the same component with the same four props, so writing them
    out is nine chances to leave one off — and it took the first: `brand` was in
    the address grammar, in the workspace screen's rows, in `Part.tsx`'s own
    switch and in the screen registry, and missing HERE. It matched no case, the
    switch returned nothing, and the screen was blank at an address every other
    part of the product agreed existed.

    ⚠️ AND IT IS BEFORE THE SWITCH RATHER THAN INSIDE IT, so the narrowing comes
    from the predicate and the remaining cases stay exhaustive.
  */
  if (atWorkspaceScreen(where)) {
    return (
      <WorkspacePart
        part={where.at}
        slug={where.slug}
        app={"app" in where ? where.app : undefined}
        area={"area" in where ? where.area : undefined}
        onGo={onGo}
      />
    );
  }

  /* ⚠️ AND THE OPERATOR'S SIDE THE SAME WAY, which had the same hole: five of
     the six console parts were named here and `footing` was the sixth. */
  if (atConsoleScreen(where)) {
    return (
      <ConsolePart
        part={where.at}
        app={"app" in where ? where.app : undefined}
        lane={"lane" in where ? where.lane : undefined}
        onGo={onGo}
      />
    );
  }

  switch (where.at) {
    case "you": return <You onGo={onGo} />;
    case "inbox": return <InboxScreen onGo={() => undefined} onSeen={() => undefined} />;
    case "told": return <TellingMe onGo={onGo} />;
    /* ⚠️ THE COPY AND THE DELETION — see `Data.tsx`. Reachable from the
       acceptance wall too, which is what keeps that wall leaveable. */
    case "data": return <Data />;
    /* ⚠️ YOUR OWN PREFERENCES, ACROSS EVERY PRODUCT — no slug, because they are
       not a workspace's. The same split as `told` against `notices`. */
    case "formats": return <Formats />;
    case "agreed": return <Agreed />;
    case "prefs": return <Preferences where={where} onGo={onGo} />;
    case "workspaces": return <Workspaces onGo={onGo} />;
    case "workspace": return <OneWorkspace slug={where.slug} onGo={onGo} />;
    case "console": return <ConsoleHome onGo={onGo} />;
    case "tenant": return <ConsoleTenant id={where.id} />;
    /* ⚠️ Home is drawn by the frame above — it is the only screen with no title
       of its own, because the lockup IS its title. */
    case "home": return null;
    /*
      ⚠️ THE COMPILER IS THE GUARD, AND WITHOUT THIS IT WAS NOT. A switch that
      falls through returns `undefined`, which React renders as nothing — so an
      address with no branch is a BLANK PAGE, not an error, and TypeScript is
      perfectly happy because every branch that exists returns a valid element.
      That is precisely how `brand` was lost: present in the address grammar, in
      the rows that link to it and in the screen registry a test checks, and
      missing from the one place that draws it.

      ⚠️ ASSIGNING TO `never` IS WHAT MAKES ADDING A `Where` VARIANT A BUILD
      FAILURE HERE. A test comparing two lists cannot do this: it checks that a
      name appears somewhere, and this checks that the code handles it.
    */
    default: {
      const unanswered: never = where;
      throw new Error(`no screen for ${(unanswered as Where).at}`);
    }
  }
}

export { SPACE, parseWhere, pathOf };

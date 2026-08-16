/**
 * THE SHELL — one product's chrome, on a phone and on a desktop.
 *
 * ⚠️ FIVE PRIMARY DESTINATIONS, MAXIMUM (D10). Past five a bottom bar stops
 * being tappable and becomes a menu, and a destination added because a feature
 * had nowhere else to go is a sign the feature belongs inside an existing one.
 * The manifest refuses a sixth; this renders what survives.
 *
 * ⚠️ THE CROWN IS CHROME, NOT A DESTINATION. The app switcher, the bell and the
 * account sit above the nav because they are about *where you are* rather than
 * *what you are doing* — putting any of them in the five spends a scarce slot
 * on something every screen already has.
 *
 * ⚠️ AND A DESTINATION SOMEBODY CANNOT REACH IS NOT DRAWN. A nav item that leads
 * to a 403 is a promise the product does not keep, and the person has no way to
 * tell it from something that is broken.
 *
 * ⚠️ ROUTER-FREE ON PURPOSE. `onGo` hands the route back; an app brings its own
 * router, and a shared shell that imported one would make every app take that
 * dependency and that version.
 */

import type { ScreenSpec } from "@quad/kernel";
import { PRIMARY_MAX, primaryOf } from "@quad/kernel";
import { Button, Separator } from "@heroui/react";
import {
  Banknote, Bell, Building2, Calendar, Circle, ClipboardList, Clock, Cog, Coins, Database,
  Boxes, FileText, House, Inbox as InboxGlyph, NotebookPen, Package, Plus, Shield, Sparkles, Sun,
  UserRound, Users,
} from "lucide-react";
import { Crown, Island, Page, type Slot } from "./layout.js";
import { type Sky } from "../tokens/ambience.js";
import { PAD, SPACE } from "../tokens/metrics.js";
import { Face, appFace, worldFor, type FaceOf } from "../parts/face.js";

/**
 * ⚠️ AN ICON IS A NAME IN A MANIFEST AND A GLYPH HERE. The manifest stays pure
 * data — no React in a declaration — and the mapping lives once, so a new
 * screen names a glyph instead of importing one. A name nobody mapped renders
 * the neutral mark rather than nothing: an empty slot in a nav reads as a
 * broken button.
 */
const GLYPHS: Readonly<Record<string, React.ReactNode>> = {
  home: <House />, house: <House />, sun: <Sun />,
  people: <Users />, users: <Users />,
  /* ⚠️ A WORKSPACE IS A BUSINESS AND A PERSON IS ONE PERSON, and both were
     landing on the neutral mark — an anonymous circle in a menu, which is the
     one glyph that says nothing at all. */
  workspace: <Building2 />, person: <UserRound />,
  money: <Coins />, coins: <Coins />, bank: <Banknote />,
  settings: <Cog />, cog: <Cog />,
  trust: <Shield />, shield: <Shield />,
  inbox: <InboxGlyph />, bell: <Bell />,
  note: <NotebookPen />, file: <FileText />, list: <ClipboardList />,
  calendar: <Calendar />, package: <Package />,
  /* ⚠️ Making a new one of something is a row like any other, and it needs a
     mark like any other — a menu with one unmarked row reads as a mistake. */
  add: <Plus />,
  /* ⚠️ THE OPERATOR CONSOLE'S FIVE, and they were the reason this list needed
     extending rather than a reason to reach for `Circle`. A name nobody mapped
     draws the neutral mark, which in a five-row menu is five identical circles
     — the one outcome worse than no glyph at all. */
  sparkle: <Sparkles />, clock: <Clock />, database: <Database />,
};

export const glyphOf = (name?: string): React.ReactNode =>
  (name && GLYPHS[name]) ?? <Circle />;

/**
 * ⚠️ THE DATA IN THE CROWN, NOT THE CROWN ITSELF. `Crown` is the component in
 * `layout.tsx`; this is what the Shell needs to draw one. Sharing the name made
 * `@quad/web` export two different things under it, and the ambiguity is the
 * kind a bundler resolves silently in whichever order it happened to read.
 */
export interface CrownInfo {
  readonly appId: string;
  readonly appName: string;
  readonly appMark: string;
  readonly tenantName: string;
  /** The other products this workspace has switched on. */
  readonly apps?: readonly { readonly id: string; readonly name: string; readonly mark: string }[];
  readonly unread?: number;
  readonly personEmail?: string;
  /**
   * ⚠️ THE ACCOUNT, NOT THE EMAIL. The face is drawn from an identity that does
   * not change when somebody corrects their address (`face.tsx`); the email
   * beside it is only the letter of last resort.
   */
  readonly personFace?: FaceOf;
}

export interface ShellProps {
  readonly screens: readonly ScreenSpec[];
  readonly here: string;
  readonly held: ReadonlySet<string>;
  /** Our own switches. A screen behind an unset one is not drawn. */
  readonly flags?: Readonly<Record<string, boolean>>;
  readonly crown: CrownInfo;
  readonly onGo: (route: string) => void;
  readonly onSwitchApp?: (appId: string) => void;
  readonly onOpenInbox?: () => void;
  /**
   * ⚠️ THE WAY INTO THE HUB, AND IT IS THE ONLY ONE A PRODUCT NEEDS. Who you
   * are, everywhere you belong and everything about this workspace are one
   * surface pulled OVER the product — so the chrome spends one control on it
   * rather than a nav slot on each. Absent leaves the face as a face.
   */
  readonly onOpenHub?: () => void;
  readonly children?: React.ReactNode;
}

/** ⚠️ Permission first, then our switch — the same order the gate uses. */
export const reachable = (
  screens: readonly ScreenSpec[],
  held: ReadonlySet<string>,
  flags: Readonly<Record<string, boolean>> = {},
): readonly ScreenSpec[] =>
  screens.filter((s) => held.has(s.permission) && (!s.flag || flags[s.flag] === true));

export function Shell(props: ShellProps) {
  const { screens, here, held, flags, crown, onGo, onSwitchApp, onOpenInbox, onOpenHub, children } = props;

  const mine = reachable(screens, held, flags);
  /* ⚠️ Sliced as well as refused at composition: a deployment reading a manifest
     it did not compose must not draw a sixth either. */
  const primary = primaryOf(mine).slice(0, PRIMARY_MAX);
  const secondary = mine.filter((s) => s.nav === "secondary");
  const at = mine.find((s) => s.route === here);

  /*
    ⚠️ THE PRODUCT'S OWN GROUND, WHERE A SCREEN HAS NOT NAMED ONE — and from the
    SAME face already in the crown, so the mark over the door and the world under
    the page are one subject. A product is a SYSTEM, so its family is a lattice:
    structure, adjacency, a pattern that re-routes itself rather than a place you
    visit or a room you stand in.

    ⚠️ A SCREEN THAT NAMES AN AMBIENCE STILL WINS. The per-screen table is a real
    design decision — a report wants `tide`, a paywall wants `spotlight` — and
    replacing all of them with one product ground would delete it. What this
    fills is the DEFAULT, which was `plain`: nothing at all, on most screens of
    every product.

    ⚠️ AND `quiet`, BECAUSE THIS IS WHERE PEOPLE WORK. The hub's arrivals run
    `rich`; a screen with a table on it gets the same world with a third of the
    marks, which is the whole reason density is an intent rather than a number.
  */
  /*
    ⚠️ THE SHELL DECIDES WHICH WORLD; `Page` IS WHAT MOUNTS IT. This file used to
    call `worldCss` and hand-render its own `<svg data-field>`, which is the
    two-places-must-agree fault the layout work exists to remove, reintroduced
    one level up: a grain, a vignette, a reduced-motion opt-out or a `data-tone`
    added to `Page` would have reached every screen in the product except the
    shell around them. Choosing a ground is a decision; painting one is a
    mechanism, and only the decision belongs here.
  */
  const named = at?.sky as Sky | undefined;
  /* ⚠️ SEEDED ON THE SCREEN'S OWN ROUTE, which is the whole gain over a name.
     Two screens of one product naming `glow` are two grounds of one material
     rather than the same picture twice, and nobody chose either of them. */
  const lit = named && named !== "plain"
    ? { sky: named, seedling: `${crown.appId}|${at?.route ?? ""}` }
    : { world: worldFor(appFace(crown.appId)) ?? undefined };

  return (
    <Page
      {...lit}
      density="quiet"
      /* ⚠️ THE NAV IS THE PAGE'S — see `PageProps.nav`. A sticky island floats
         over whatever precedes it, and only the page can reserve the room. */
      /* ⚠️ `only`, NOT A WRAPPER — a `md:hidden` div around a sticky element is
         its containing block, and it is exactly the nav's own height. See
         `Island`. */
      nav={<Island
        only="phone"
        here={here}
        onGo={onGo}
        items={primary.map((s) => ({
          id: s.id, label: s.label, route: s.route, icon: glyphOf(s.icon ?? s.id),
        }))}
      />}
    >
      {/*
        ------------------------------------------------------------ crown ---

        ⚠️ IT IS `Crown` NOW, AND IT WAS THE ONLY ONE THAT WAS NOT. This was a
        hand-rolled `<header>`: a face, two stacked names and a right-hand strip
        of buttons, assembled here because it needed a shape the old `Crown`
        did not have. Being the copy nobody could find is exactly why it was the
        one that scrolled away, the one with a `Separator` under it, and the one
        whose controls were three different heights.

        ⚠️ AND ITS SLOTS MAP WITHOUT INVENTING ANYTHING. The account leads (it
        opens the hub), the product's mark and the two names are the middle, and
        the trail is the switcher and the inbox.

        ⚠️ THE PER-APP SWITCHER BUTTONS ARE GONE AND THAT IS A FIX. There was one
        button per other product, gated on `apps.length > 1` — but `apps` is
        already the OTHERS, so with exactly two products the list had one entry,
        `1 > 1` was false, and the switcher never appeared at all. It is one
        control to the hub now, which is the surface that lists them.

        ⚠️ AND THE MARK AND THE SECOND LINE ARE GONE WITH THEM. This drew a face,
        then a product mark, then a workspace name stacked over a product name —
        two circles and a paragraph in a 64px row, which is the clutter that made
        it the crown nobody wanted. What a crown owes here is WHOSE data this is;
        which product is the nav underneath, and choosing between them is the
        hub. One face, one name.
      */}
      <Crown
        bleed="edge"
        width="work"
        who={{
          name: crown.personEmail ?? "You",
          face: crown.personFace,
          onOpen: onOpenHub,
        }}
        name={crown.tenantName}
        also={[
          ...((crown.apps ?? []).length && onSwitchApp && onOpenHub
            ? [{ id: "apps", label: "Your products", icon: <Boxes />, onDo: onOpenHub }]
            : []),
          ...(onOpenInbox
            ? [{ id: "inbox", label: "Notifications", icon: <InboxGlyph />, onDo: onOpenInbox,
                dot: Boolean(crown.unread) }]
            : []),
        ].slice(0, 2) as unknown as readonly [Slot, Slot]}
      />

      {/* ------------------------------------------------------- the middle --- */}
      <div className="flex flex-1 min-h-0">
        {/* ⚠️ The same five, plus room for more. A desktop sidebar that showed a
            different set would make the two layouts two products. */}
        <nav className={`hidden md:flex flex-col gap-1 w-56 shrink-0 ${PAD}`} aria-label="Sections">
          {primary.map((s) => (
            <Button
              key={s.id}
              variant={s.route === here ? "primary" : "ghost"}
              onPress={() => onGo(s.route)}
            >
              {s.label}
            </Button>
          ))}
          {secondary.length ? <Separator /> : null}
          {secondary.map((s) => (
            <Button
              key={s.id}
              variant={s.route === here ? "secondary" : "ghost"}
              onPress={() => onGo(s.route)}
            >
              {s.label}
            </Button>
          ))}
        </nav>

        {/* ⚠️ NO `NAV_SPACE` HERE ANY MORE — `Page` adds it, because `Page` is
            what was handed the nav and therefore what knows there is one to
            reserve room for. Set in both places it is twice the room under the
            last card, which is the failure mode of every measurement that lives
            in two files. */}
        <main className={`flex-1 min-w-0 ${PAD}`}>{children}</main>
      </div>
    </Page>
  );
}


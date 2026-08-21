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

import * as React from "react";
import type { Kind, ScreenSpec } from "@engine/kernel";
import { PRIMARY_MAX, isBusiness, primaryOf, screenFor } from "@engine/kernel";
import { Button, Separator } from "@heroui/react";
import {
  Banknote, Bell, Building2, Calendar, CheckCheck, Circle, ClipboardList, Clock, Cog, Coins, Database,
  Boxes, ChartColumn, FileText, House, Inbox as InboxGlyph, Mail, MapPin, NotebookPen, Package, Plus, Search,
  Power, Shield, Sparkles, Star, Sun, Tag, TriangleAlert, UserRound, Users,
} from "lucide-react";
/* ⚠️ OURS, BECAUSE THEIR MOTION IS INSIDE THEM — see `marks.tsx`. A bell rings
   by its clapper and a calendar turns its days over; neither is a transform on
   the outside, and lucide's path order is not something to build on. */
import {
  BellMark, CalendarMark, CheckMark, FlagMark, InboxMark, KeyMark, LayersMark, LeaveMark,
  RefreshMark, SearchMark, ShareMark, ShieldMark,
} from "../parts/marks.js";
import { Page } from "./page.js";
import { Island } from "./chrome.js";
import { Tray } from "./overlay.js";
import { Group, NavRow } from "../parts/surfaces.js";
import {
  Crown, CrownSocketProvider, crownFor, type CrownClaim, type Slot,
} from "./crown.js";
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
  /* ⚠️ A PRODUCT IS A NOUN THIS SYSTEM SAYS CONSTANTLY AND HAD NO MARK FOR.
     The crown drew `Boxes` inline for "Your products" while every other surface
     that meant the same thing fell through to the neutral circle. */
  apps: <Boxes />, product: <Boxes />,
  /* ⚠️ A THING ON A SHELF AND THE SHELF IT IS ON — the two nouns an inventory
     says on every screen it has, and both drew the neutral circle. `product` is
     the CATALOGUE entry (a stack of them); `box` is one object somebody picks
     up, and `pin` is where it lives. */
  box: <Package />, pin: <MapPin />,
  /* ⚠️ AND ONE NAMED OBJECT IS NEITHER OF THOSE. `box` is a thing on a shelf and
     there may be forty of it; a tag is the label that says WHICH one — the whole
     difference between a quantity and an object with a history. */
  tag: <Tag />,
  money: <Coins />, coins: <Coins />, bank: <Banknote />,
  settings: <Cog />, cog: <Cog />,
  trust: <ShieldMark />, shield: <ShieldMark />,
  inbox: <InboxMark />, bell: <BellMark />, mail: <Mail />,
  /* ⚠️ Clearing a list is a noun this system says on more than one screen. */
  check: <CheckMark />,
  note: <NotebookPen />, file: <FileText />, list: <ClipboardList />,
  calendar: <CalendarMark />, package: <Package />,
  /* ⚠️ Making a new one of something is a row like any other, and it needs a
     mark like any other — a menu with one unmarked row reads as a mistake. */
  add: <Plus />,
  /* ⚠️ THE OPERATOR CONSOLE'S FIVE, and they were the reason this list needed
     extending rather than a reason to reach for `Circle`. A name nobody mapped
     draws the neutral mark, which in a five-row menu is five identical circles
     — the one outcome worse than no glyph at all. */
  sparkle: <Sparkles />, clock: <Clock />, database: <Database />,
  /* ⚠️ AND THE THREE A MANIFEST ALREADY NAMED. `chart`, `search` and `star` are
     in a reference app's own screen declarations, so the nav drew a neutral
     circle for three of its destinations — the failure this map's own header
     describes, reached by the app it was written for. A glyph name is data in a
     manifest, so nothing can typecheck it; the only place it is visible is a
     rendered nav. */
  chart: <ChartColumn />, search: <SearchMark />, star: <Star />,
  /* ⚠️ A BELL THAT IS ALREADY RINGING, for the row that turns ringing on. Two
     screens imported it straight from lucide and drew a mark with no character
     — see `LIVELY`, and `scripts/glyphs.test.mjs`, which now refuses that. */
  "bell-ring": <BellMark />,
  /* ⚠️ LEAVING IS A ROW LIKE ANY OTHER AND NEEDS A MARK LIKE ANY OTHER. Sign
     out was the one row in the account centre with an empty lead, which reads
     as a row that failed to load rather than as a different kind of thing. */
  leave: <LeaveMark />,
  /* ⚠️ THE VOCABULARY HAD NO SHARE MARK, and the app that needed one reached for
     `star` and then for `people` — both already in its own nav. A gap in the
     registry is answered by adding to it, never by a second screen wearing
     somebody else's mark. */
  share: <ShareMark />,
  /* ⚠️ TWO OF THE OPERATOR CONSOLE'S OWN NINE ROWS DREW THE NEUTRAL CIRCLE, on
     the one menu where every other row has a mark — which is the failure this
     map's header describes, on the screen written after it. */
  key: <KeyMark />, layers: <LayersMark />,
  /*
    ⚠️ THREE MARKS THAT EXISTED ONLY AS A SPARKLE, WHICH IS HOW A SPARKLE CAME TO
    MEAN FIVE THINGS. A sync button, a model fault, a refusal to index, a list of
    flags and a screen about wording all drew the mark for "a model made this" —
    so the one place it was RIGHT said nothing, and four rows claimed a meaning
    they did not have. `glyphs.test.mjs` reserves it now.
  */
  refresh: <RefreshMark />, sync: <RefreshMark />,
  alert: <TriangleAlert />, flag: <FlagMark />,
  /* ⚠️ THE DEPLOYMENT'S OWN SWITCH, AND IT IS NOT A COG. Maintenance shares no
     subject with settings: one is what a person configures, the other is us
     withholding the whole product from everybody at once. They wore the same
     mark while they shared a screen, which is the screen split reaching the
     one place a reader looks first. */
  power: <Power />,
};

/**
 * WHAT EACH MARK DOES WHEN IT IS PRESSED — one of `GLYPH_MOTION`'s nine.
 *
 * ⚠️ THE CHARACTER FALLS OUT OF WHAT THE MARK IS. A bell rings, a shield braces,
 * a cog turns, an inbox takes something in. That is information the press itself
 * cannot carry: the row's own shrink says SOMETHING was pressed, and the mark
 * says WHICH — which is why a uniform scale-and-fade on every icon is the same
 * as no animation at all.
 *
 * ⚠️ A MARK MAY BE STILL, AND SAYING SO IS THE POINT. `Circle` is the neutral
 * fallback and has no character to have; a mark that is merely absent from this
 * map is indistinguishable from one somebody forgot, so the guard reads the
 * omission as deliberate only where it is written down (`STILL`).
 */
export const LIVELY: Readonly<Record<string, string>> = {
  /* Parts move — see `marks.tsx`. */
  bell: "ring", "bell-ring": "ring",
  inbox: "take",
  calendar: "page",
  leave: "depart", share: "reach",
  trust: "guard", shield: "guard",
  check: "draw",
  search: "seek",
  /* The whole mark moving IS the purpose. */
  settings: "turn", cog: "turn", clock: "turn",
  money: "flip", coins: "flip", bank: "flip", card: "flip",
  star: "twinkle", sun: "twinkle",
  /* ⚠️ `spark`, NOT `twinkle`, AND THE SPLIT IS THE POINT. A star catches the
     light; a sparkle is the one mark in this product that means "a model made
     this", and a character of its own is what stops the two drifting into one. */
  sparkle: "spark",
  people: "nod", users: "nod", person: "nod", home: "nod", house: "nod",
  /* A key turns in a lock, and a stack of plates settles when one lands. */
  key: "unlock", layers: "stack",
  /* ⚠️ A REFRESH GOES ROUND ONCE — see `glyph-round`. Not a spinner: the mark
     says the work was asked for, and how long it takes is the row's business. */
  refresh: "round", sync: "round",
  /* ⚠️ A FLAG LIFTS, and an alert is deliberately STILL — see `STILL`. */
  flag: "lift",
};

/** ⚠️ Marks with no character, on purpose — see `LIVELY`. */
/**
 * ⚠️ MARKS WITH NO ACT OF THEIR OWN, ON PURPOSE. A file, a list, a note, a
 * workspace, a product: nouns. There is no motion a document MAKES, and giving
 * one a nudge would be exactly the uniform scale-and-fade the character
 * vocabulary exists to replace. `circle` is the neutral fallback and has no
 * subject at all.
 */
export const STILL: readonly string[] = [
  "circle", "mail", "package", "note", "file", "list", "add", "apps", "product",
  "workspace", "database", "chart", "add", "plus",
  /*
    ⚠️ A BOX AND A PLACE ARE NOUNS LIKE THE REST OF THIS LIST, and the pin is the
    one worth arguing about — a pin obviously drops. It is still anyway, because
    in an inventory the mark for a location is on nearly every row of nearly every
    screen: a character there is a list that twitches wherever a thumb lands.
  */
  "box", "pin", "tag",
  /*
    ⚠️ `power` IS STILL FOR `alert`'S REASON, AND IT IS THE SAME DECISION. This
    is the mark on the row that shuts every door — it is already the only item on
    the console menu that can be carrying a danger tone. A character on top would
    make the outage the liveliest thing on a menu of things that are fine, which
    is the interface raising its voice.
  */
  "power",
  /*
    ⚠️ AN ALERT IS STILL, AND IT IS THE ONE ENTRY HERE THAT IS A DECISION RATHER
    THAN A SHRUG. Every other mark on this list is a noun with no act of its own;
    this one has an obvious act — a wobble, a flash — and giving it one would make
    the mark for "something is wrong" the liveliest thing on a screen full of
    things that are fine. It is already carrying a tone. Motion on top of that is
    the interface raising its voice.
  */
  "alert",
];

/**
 * A MARK THAT ANSWERS WHEN ITS ROW IS PRESSED.
 *
 * ⚠️ IT LISTENS ON ITS HOST RATHER THAN ON ITSELF, because a thumb lands on the
 * label far more often than on the icon — an icon that only answers when hit
 * directly is one most people never see move. The nearest pressable ancestor is
 * the row, and that is what a person pressed.
 *
 * ⚠️ AND THE ANIMATION RESTARTS BY REMOUNTING. CSS cancels an animation the
 * moment its trigger is removed, so driving this from `:active` or the row's own
 * `data-pressed` plays a fraction of the character on a quick tap and the whole
 * of it only if somebody holds — which is backwards. A counter in the key
 * remounts the span, which is the one way to replay a keyframe from the start.
 */
export function Glyph({ of }: { readonly of: string }) {
  const [beat, setBeat] = React.useState(0);
  const at = React.useRef<HTMLSpanElement>(null);
  const character = LIVELY[of];

  React.useEffect(() => {
    if (!character) return;
    const host = at.current?.closest("button, a, [data-row]");
    if (!host) return;
    const go = () => setBeat((n) => n + 1);
    host.addEventListener("pointerdown", go);
    return () => { host.removeEventListener("pointerdown", go); };
  }, [character]);

  return (
    <span
      key={beat}
      ref={at}
      {...(character ? { "data-glyph": character } : {})}
      /* ⚠️ Only after a real press — otherwise every mark on the screen plays
         its character on first paint, which is the jungle AMBIENCE.md bans. */
      {...(character && beat > 0 ? { "data-lively": "true" } : {})}
    >
      {GLYPHS[of] ?? <Circle />}
    </span>
  );
}

/**
 * ⚠️ WHICH NAMES EXIST, AS DATA, so a check can ask. Twice now a declaration has
 * named a glyph this map does not have and drawn a neutral circle for it — the
 * failure this file's own header describes, reached by the app it was written
 * for, because nothing could see the two lists disagreeing. A manifest's icon is
 * a STRING, so no compiler will ever catch it.
 */
export const GLYPH_NAMES: readonly string[] = Object.keys(GLYPHS);

/**
 * ⚠️ EVERY MARK IN THE PRODUCT COMES THROUGH HERE, AND THAT IS WHAT MAKES THE
 * ANIMATION A PROPERTY OF THE SYSTEM RATHER THAN OF A SCREEN. A component
 * importing `Bell` from lucide gets a still bell that looks identical until
 * somebody touches it — `scripts/glyphs.test.mjs` refuses that.
 */
export const glyphOf = (name?: string): React.ReactNode =>
  name ? <Glyph of={name} /> : <Circle />;

/**
 * ⚠️ THE DATA IN THE CROWN, NOT THE CROWN ITSELF. `Crown` is the component in
 * `layout.tsx`; this is what the Shell needs to draw one. Sharing the name made
 * `@engine/design` export two different things under it, and the ambiguity is the
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
  /**
   * ⚠️ WHAT THIS WORKSPACE IS (D21), so a business-only screen is not offered to
   * one that is not. Absent reads as `personal` — the direction that withholds,
   * matching the gate, so a shell wired without it hides rather than promises.
   */
  readonly kind?: Kind;
  readonly crown: CrownInfo;
  readonly onGo: (route: string) => void;
  readonly onSwitchApp?: (appId: string) => void;
  readonly onOpenInbox?: () => void;
  /**
   * ⚠️ THE WAY INTO THE SPACE, AND IT IS THE ONLY ONE A PRODUCT NEEDS. Who you
   * are, everywhere you belong and everything about this workspace are one
   * surface pulled OVER the product — so the chrome spends one control on it
   * rather than a nav slot on each. Absent leaves the face as a face.
   */
  readonly onOpenSpace?: () => void;
  readonly children?: React.ReactNode;
}

/**
 * ⚠️ PERMISSION, THEN WHAT THE WORKSPACE IS, THEN OUR SWITCH — THE GATE'S OWN
 * ORDER. A screen offered here and refused by the gate is a promise the product
 * does not keep, so the two walks have to ask the same questions in the same
 * sequence; the day they diverge, the nav advertises a destination that answers
 * 402 and nothing says which of the two is wrong.
 *
 * ⚠️ AND `commercial` WAS DECLARED AND READ BY NOTHING. `ScreenSpec` has carried
 * the field since the kind gate landed and only OPERATIONS were ever checked, so
 * a screen marked business-only was drawn, navigable and reachable by URL in a
 * personal workspace — every declaration correct, every test green, the
 * mechanism absent. Absent kind reads as `personal`, which withholds rather than
 * offers.
 *
 * ⚠️ AND `feature` IS ASKED BEFORE THE SCREEN TRAVELS, NOT HERE. What a plan
 * includes is the server's answer — the chrome holds no plan, and giving it one
 * would mean a second round trip on the read every screen stands on, plus a
 * second opinion about what a workspace bought. A screen the page never receives
 * has no nav row, no route and no way in by typing, which is a stronger answer
 * than a filter here could give (`publicFace`).
 */
export const reachable = (
  screens: readonly ScreenSpec[],
  held: ReadonlySet<string>,
  flags: Readonly<Record<string, boolean>> = {},
  kind: Kind = "personal",
): readonly ScreenSpec[] =>
  screens.filter((s) =>
    held.has(s.permission)
    && (!s.commercial || isBusiness(kind))
    && (!s.flag || flags[s.flag] === true));

/**
 * WHAT THE PHONE'S BAR HOLDS, AND WHAT THE SHEET BEHIND IT HOLDS.
 *
 * ⚠️ A FUNCTION RATHER THAN TWO LINES INSIDE THE SHELL, because the invariant is
 * the whole point and an invariant inside a render is one nothing can ask about.
 * Every screen with a nav tier is in exactly one of the two lists — which is
 * what stopped being true when `secondary` was drawn in the desktop rail alone,
 * and an app with twelve destinations offered five of them to a phone.
 *
 * ⚠️ THE BAR KEEPS ALL FIVE WHERE THERE IS NOTHING TO HOLD. The fifth slot is
 * spent on the way to everywhere else only when there IS an everywhere else, so
 * an app of four destinations is untouched by any of this.
 */
export function phoneNav(mine: readonly ScreenSpec[]): {
  readonly bar: readonly ScreenSpec[];
  readonly rest: readonly ScreenSpec[];
} {
  const primary = primaryOf(mine).slice(0, PRIMARY_MAX);
  const secondary = mine.filter((s) => s.nav === "secondary");
  const bar = primary.slice(0, PRIMARY_MAX - (secondary.length ? 1 : 0));
  return { bar, rest: [...primary.slice(bar.length), ...secondary] };
}

export function Shell(props: ShellProps) {
  const {
    screens, here, held, flags, kind, crown, onGo, onSwitchApp, onOpenInbox, onOpenSpace, children,
  } = props;

  const mine = reachable(screens, held, flags, kind);
  /* ⚠️ Sliced as well as refused at composition: a deployment reading a manifest
     it did not compose must not draw a sixth either. */
  const primary = primaryOf(mine).slice(0, PRIMARY_MAX);
  const secondary = mine.filter((s) => s.nav === "secondary");

  /*
    ⚠️ WHAT THE BAR CANNOT HOLD, AND UNTIL THIS EXISTED IT WAS NOWHERE ON A
    PHONE. `secondary` was drawn in the rail below and by nothing above it, so
    an app declaring twelve destinations offered five to anybody holding one —
    and the other seven had no gesture at all. It rendered correctly, tested
    green, and read as a design decision rather than as an omission.

    ⚠️ THE FIFTH NAV SLOT HOLDS THEM, so the last primary is in here too — see
    `Island.more`. The order is the rail's: what did not fit, then the second
    tier, which is how the same product reads on both halves of the breakpoint.
  */
  const [elsewhere, setElsewhere] = React.useState(false);
  const { bar: inBar, rest } = phoneNav(mine);
  /* ⚠️ THE SCREEN THE ADDRESS BELONGS TO, NOT THE ONE IT EQUALS. A detail screen
     carries what it is about (`/thing/t-glove`), so an exact match left the nav
     with nothing selected and the page with no title the moment anybody opened a
     record — see `screenFor`. */
  const at = screenFor(mine, here);

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

    ⚠️ AND `quiet`, BECAUSE THIS IS WHERE PEOPLE WORK. The OneSpace's arrivals run
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
  /*
    ⚠️ A SCREEN INSIDE MAY OWN THE CROWN — see `useCrownSocket`. A sub-page has a
    way out, so its crown replaces this one entirely; a destination has none, so
    this crown stands and takes the screen's actions into its trail. Held as
    state rather than read during render because the screen mounts BELOW this,
    and the publish lands in a layout effect — before paint, so neither crown is
    ever seen in the wrong place.
  */
  const [claim, setClaim] = React.useState<CrownClaim | null>(null);

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
        /*
          ⚠️ THE SCREEN'S ACT, IN THE BAR — the phone half of the same
          declaration the crown carries above `md`. It arrives through the crown
          socket, which is already the seam a screen publishes itself through, so
          the nav needs no second channel and cannot disagree with the crown
          about what the button says.

          ⚠️ AND `wide` IS THE CROWN'S BUSINESS, NOT THIS ONE'S. `Screen` marks
          its act `wide` so the crown's copy is `hidden md:flex`; the bar is
          `md:hidden` already, so exactly one of the two is ever on screen.
        */
        act={claim?.does}
        items={inBar.map((s) => ({
          id: s.id, label: s.label, route: s.route, icon: glyphOf(s.icon ?? s.id),
        }))}
        /*
          ⚠️ NAMED BY WHERE YOU ARE WHEN YOU ARE IN IT, and by the app when you
          are not. A person on Reports reads "Reports" in the bar rather than a
          bar with nothing marked — which is what "where am I" costs if the
          fifth item is a button called More.
        */
        {...(rest.length
          ? {
            more: {
              label: at && rest.some((s) => s.id === at.id) ? at.label : crown.appName,
              icon: glyphOf(at && rest.some((s) => s.id === at.id)
                ? (at.icon ?? at.id)
                : "apps"),
              onOpen: () => { setElsewhere(true); },
              here: Boolean(at && rest.some((s) => s.id === at.id)),
            },
          }
          : {})}
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
        opens OneSpace), the product's mark and the two names are the middle, and
        the trail is the switcher and the inbox.

        ⚠️ THE PER-APP SWITCHER BUTTONS ARE GONE AND THAT IS A FIX. There was one
        button per other product, gated on `apps.length > 1` — but `apps` is
        already the OTHERS, so with exactly two products the list had one entry,
        `1 > 1` was false, and the switcher never appeared at all. It is one
        control to OneSpace now, which is the surface that lists them.

        ⚠️ AND THE MARK AND THE SECOND LINE ARE GONE WITH THEM. This drew a face,
        then a product mark, then a workspace name stacked over a product name —
        two circles and a paragraph in a 64px row, which is the clutter that made
        it the crown nobody wanted. What a crown owes here is WHOSE data this is;
        which product is the nav underneath, and choosing between them is the
        OneSpace. One face, one name.
      */}
      <Crown
        bleed="edge"
        width="work"
        {...crownFor(claim, {
          who: {
            name: crown.personEmail ?? "You",
            face: crown.personFace,
            onOpen: onOpenSpace,
          },
          name: crown.tenantName,
          also: [
            ...((crown.apps ?? []).length && onSwitchApp && onOpenSpace
              ? [{ id: "apps", label: "Your products", icon: <Boxes />, onDo: onOpenSpace }]
              : []),
            ...(onOpenInbox
              ? [{ id: "inbox", label: "Notifications", icon: <InboxGlyph />, onDo: onOpenInbox,
                  dot: Boolean(crown.unread) }]
              : []),
          ],
        })}
      />

      {/* ------------------------------------------------------- the middle --- */}
      <div className="flex flex-1 min-h-0">
        {/* ⚠️ The same five, plus room for more. A desktop sidebar that showed a
            different set would make the two layouts two products. */}
        <nav className={`hidden md:flex flex-col gap-1 w-56 shrink-0 ${PAD}`} aria-label="Sections">
          {primary.map((s) => (
            <Button
              key={s.id}
              variant={s.route === at?.route ? "primary" : "ghost"}
              onPress={() => onGo(s.route)}
            >
              {s.label}
            </Button>
          ))}
          {secondary.length ? <Separator /> : null}
          {secondary.map((s) => (
            <Button
              key={s.id}
              variant={s.route === at?.route ? "secondary" : "ghost"}
              onPress={() => onGo(s.route)}
            >
              {s.label}
            </Button>
          ))}
        </nav>

        {/*
          ⚠️ THE PHONE'S OTHER HALF OF THAT RAIL, AND IT IS THE SAME LIST IN THE
          SAME ORDER. A sheet whose contents were chosen separately would be a
          second navigation model, and the two would drift the first time
          somebody added a screen.

          ⚠️ IT IS MOUNTED AT ANY WIDTH BECAUSE NOTHING OPENS IT ABOVE `md` —
          the trigger is inside the nav, which is `md:hidden` already. A second
          `md:hidden` here would be a breakpoint asserted in two places, which
          is how the two come to disagree.

          ⚠️ AND EVERY ROW SAYS WHERE IT GOES RATHER THAN WHAT IT IS FOR. These
          are the app's own screen labels, unedited — the sheet is a map, and a
          map that renames places is a worse map.
        */}
        {rest.length ? (
          <Tray title={crown.appName} isOpen={elsewhere} onOpenChange={setElsewhere}>
            <Group>
              {rest.map((s) => (
                <NavRow
                  key={s.id}
                  icon={glyphOf(s.icon ?? s.id)}
                  label={s.label}
                  onOpen={() => { setElsewhere(false); onGo(s.route); }}
                />
              ))}
            </Group>
          </Tray>
        ) : null}

        {/* ⚠️ NO `NAV_SPACE` HERE ANY MORE — `Page` adds it, because `Page` is
            what was handed the nav and therefore what knows there is one to
            reserve room for. Set in both places it is twice the room under the
            last card, which is the failure mode of every measurement that lives
            in two files. */}
        {/* ⚠️ A COLUMN, NOT A BLOCK, AND IT IS THE ONE LINK IN THE HEIGHT CHAIN.
            `Page` is a full-height column and a `Screen` inside it grows to fill
            what is left — but a block `main` in between absorbs the height and
            hands its children none of it, so an empty state that asked to be
            centred in the page was centred in its own 188px instead and sat
            under the heading with the viewport blank beneath it. Nothing
            overflows and nothing warns; it simply looks like a page that stopped
            loading. */}
        {/* ⚠️ NO PADDING HERE. `Band` is the page gutter and it is the ONLY one
            — measured, this `main` added a second inset on top of it and a
            tabbed screen's HeroUI panel added a third, so one app's cards sat at
            40px from the edge on Settings and 16px on its list screen. Nothing
            failed; the screens simply did not line up with each other, which is
            the kind of thing nobody can point at and everybody feels. */}
        <main className="flex flex-1 min-w-0 flex-col">
          <CrownSocketProvider onClaim={setClaim}>{children}</CrownSocketProvider>
        </main>
      </div>
    </Page>
  );
}


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

import type { ScreenSpec, Tone } from "@quad/kernel";
import { PRIMARY_MAX, primaryOf } from "@quad/kernel";
import { Avatar, Button, Chip, Separator, Tooltip } from "@heroui/react";
import {
  Banknote, Bell, Calendar, Circle, ClipboardList, Cog, Coins, FileText, House,
  Inbox as InboxGlyph, NotebookPen, Package, Shield, Sun, Users,
} from "lucide-react";
import { Island } from "./layout.js";
import { skyCss, type Sky } from "./theme.js";
import { GUTTER, NAV_SPACE, PAD, ROW, SPACE } from "./metrics.js";

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
  money: <Coins />, coins: <Coins />, bank: <Banknote />,
  settings: <Cog />, cog: <Cog />,
  trust: <Shield />, shield: <Shield />,
  inbox: <InboxGlyph />, bell: <Bell />,
  note: <NotebookPen />, file: <FileText />, list: <ClipboardList />,
  calendar: <Calendar />, package: <Package />,
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
  readonly appName: string;
  readonly appMark: string;
  readonly tenantName: string;
  /** The other products this workspace has switched on. */
  readonly apps?: readonly { readonly id: string; readonly name: string; readonly mark: string }[];
  readonly unread?: number;
  readonly personEmail?: string;
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

  return (
    <div
      className="min-h-dvh flex flex-col"
      data-sky={at?.sky ?? "plain"}
      style={{ ...skyStyle(at?.sky as Sky | undefined, at?.tone) }}
    >
      {/* ------------------------------------------------------------ crown --- */}
      <header className={`flex items-center ${SPACE.snug} ${GUTTER} ${ROW.pad}`}>
        <span aria-hidden="true">{crown.appMark}</span>
        <div className="flex flex-col">
          <strong>{crown.tenantName}</strong>
          <small>{crown.appName}</small>
        </div>

        <div className={`ml-auto flex items-center ${SPACE.tight}`}>
          {(crown.apps ?? []).length > 1 && onSwitchApp
            ? (crown.apps ?? []).map((other) => (
              <Tooltip key={other.id}>
                <Button variant="ghost" aria-label={other.name} onPress={() => onSwitchApp(other.id)}>
                  {other.mark}
                </Button>
                <Tooltip.Content>{other.name}</Tooltip.Content>
              </Tooltip>
            ))
            : null}

          {onOpenInbox ? (
            <Button variant="ghost" aria-label="Notifications" onPress={onOpenInbox}>
              {/* ⚠️ A count of nothing is not a zero badge. Zero is texture. */}
              {crown.unread
                ? <Chip color="danger" variant="primary"><Chip.Label>{crown.unread}</Chip.Label></Chip>
                : "Inbox"}
            </Button>
          ) : null}

          {onOpenHub
            ? (
              <Button isIconOnly variant="ghost" aria-label="Account and workspaces" onPress={onOpenHub}>
                <Avatar size="sm">
                  <Avatar.Fallback>
                    {(crown.personEmail ?? "?").slice(0, 1).toUpperCase()}
                  </Avatar.Fallback>
                </Avatar>
              </Button>
            )
            : (
              <Avatar>
                <Avatar.Fallback>{(crown.personEmail ?? "?").slice(0, 1).toUpperCase()}</Avatar.Fallback>
              </Avatar>
            )}
        </div>
      </header>
      <Separator />

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

        <main className={`flex-1 min-w-0 ${PAD} ${NAV_SPACE} md:${PAD}`}>{children}</main>
      </div>

      {/* ⚠️ THE ISLAND, not a welded bar — glass, one travelling pill, labels
          that fold while somebody scrolls. The same component every specimen
          uses, so the phone nav cannot drift from the design. */}
      <div className="md:hidden">
        <Island
          here={here}
          onGo={onGo}
          items={primary.map((s) => ({
            id: s.id, label: s.label, route: s.route, icon: glyphOf(s.icon ?? s.id),
          }))}
        />
      </div>
    </div>
  );
}

/**
 * ⚠️ THE AMBIENCE IS A STYLE ON THE FRAME, NOT A CLASS ON A COMPONENT. It is
 * derived from theme tokens (D7), so a workspace's brand reaches the background
 * of every screen without a single screen knowing that branding exists.
 */
function skyStyle(sky: Sky | undefined, tone: Tone | undefined): React.CSSProperties {
  const css = skyCss(sky ?? "plain", tone ?? "neutral");
  if (!css) return {};
  const [, value] = css.split(/:\s*/, 2);
  return { backgroundImage: value };
}

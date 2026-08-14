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
import { skyCss, type Sky } from "./theme.js";

export interface Crown {
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
  readonly crown: Crown;
  readonly onGo: (route: string) => void;
  readonly onSwitchApp?: (appId: string) => void;
  readonly onOpenInbox?: () => void;
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
  const { screens, here, held, flags, crown, onGo, onSwitchApp, onOpenInbox, children } = props;

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
      <header className="flex items-center gap-3 px-4 py-3">
        <span aria-hidden="true">{crown.appMark}</span>
        <div className="flex flex-col">
          <strong>{crown.tenantName}</strong>
          <small>{crown.appName}</small>
        </div>

        <div className="ml-auto flex items-center gap-2">
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

          <Avatar>
            <Avatar.Fallback>{(crown.personEmail ?? "?").slice(0, 1).toUpperCase()}</Avatar.Fallback>
          </Avatar>
        </div>
      </header>
      <Separator />

      {/* ------------------------------------------------------- the middle --- */}
      <div className="flex flex-1 min-h-0">
        {/* ⚠️ The same five, plus room for more. A desktop sidebar that showed a
            different set would make the two layouts two products. */}
        <nav className="hidden md:flex flex-col gap-1 w-56 shrink-0 p-3" aria-label="Sections">
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

        <main className="flex-1 min-w-0 p-4 pb-24 md:pb-4">{children}</main>
      </div>

      {/* -------------------------------------------------------- the island --- */}
      <nav
        className="md:hidden fixed inset-x-0 bottom-0 flex justify-around gap-1 p-2"
        aria-label="Sections"
      >
        {primary.map((s) => (
          <Button
            key={s.id}
            variant={s.route === here ? "primary" : "ghost"}
            aria-current={s.route === here ? "page" : undefined}
            onPress={() => onGo(s.route)}
          >
            {s.label}
          </Button>
        ))}
      </nav>
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

/**
 * THE TWO THINGS THAT SIT BESIDE A CONTROL WITHOUT BEING ONE.
 *
 * A `Pip` is a mark ON a control — something is waiting here. A `Hint` is a word
 * ABOUT a control — this is what it does. Neither is pressable, neither takes
 * part in the flow, and both were being improvised where they were needed.
 *
 * ⚠️ A PIP IS ANCHORED BY THE LIBRARY, NOT BY HAND. This was a private `Dot`
 * span placed with `absolute -top-N -right-N`, written out at THREE call sites
 * with THREE different offsets — so the same mark sat in a different place on
 * the account, on a crown action and in the nav. Nothing catches that: each one
 * looks deliberate on its own, and the drift only shows when two are on screen
 * together. `Badge.Anchor` is the library's answer and it has one offset.
 *
 * ⚠️ A HINT IS WHAT AN ICON-ONLY CONTROL OWES EVERYONE WHO IS NOT USING A SCREEN
 * READER. Every one of them already carried an `aria-label`, so the product read
 * correctly aloud and showed a bare glyph to everybody else. An app's own crown
 * actions are the sharp case: the icons are the app's, nobody has seen them
 * before, and the row is the one piece of chrome on every screen.
 */

import { Badge, Tooltip } from "@heroui/react";
import * as React from "react";

/* -------------------------------------------------------------------- pip --- */

/**
 * ⚠️ A DOT, NOT A NUMBER, WHEREVER THE MARK IS ON CHROME. At nav and crown size
 * a figure is unreadable, and what chrome owes is "something happened here" —
 * the count belongs on the screen the control opens. `count` exists for the one
 * place with room for it, and it caps rather than growing the control.
 *
 * ⚠️ AND NOTHING IS ANCHORED WHEN THERE IS NOTHING TO SAY. `on={false}` returns
 * the child untouched rather than an anchor wrapping it, so a control that never
 * has news is laid out exactly as it would be without this component.
 */
export function Pip({ on, count, tone = "danger", children }: {
  readonly on: boolean;
  /** Omit for a dot. Given, it is shown as a figure and capped at `99+`. */
  readonly count?: number;
  readonly tone?: "danger" | "accent";
  readonly children: React.ReactNode;
}): React.ReactElement {
  if (!on) return <>{children}</>;
  return (
    <Badge.Anchor>
      {children}
      <Badge
        color={tone}
        size="sm"
        /* ⚠️ A DOT IS SIZED HERE AND A COUNT IS NOT, AND THE PHOTOGRAPH IS WHY.
           `sm` is the box a DIGIT needs (`min-h-4 min-w-4`), so an empty badge
           came out 16px — four times the area of the 8px mark it replaced. On a
           monochrome interface a saturated disc that wide beside a 40px face is
           the loudest thing on the screen; it read as a traffic light rather
           than as a mark. The colour never changed, only the area.
           ⚠️ AND `!` IS NEEDED BECAUSE THE LIBRARY'S SHEET LOADS SECOND. Its
           `min-w` is what holds the box open, so a plain `size-2` sets width and
           height and changes nothing. This is the one place in the package that
           overrides a HeroUI rule, it is a MEASUREMENT rather than an
           appearance, and the library's 1px `--background` ring is kept — that
           ring is what the old hand-rolled dot never had. */
        className={count === undefined ? "size-2.5! min-w-0! min-h-0! p-0" : undefined}
      >
        {count === undefined ? undefined : count > 99 ? "99+" : String(count)}
      </Badge>
    </Badge.Anchor>
  );
}

/* ------------------------------------------------------------------- hint --- */

/**
 * ⚠️ THE HINT IS NOT THE ACCESSIBLE NAME AND DOES NOT REPLACE ONE. A tooltip is
 * hover and focus only — it never reaches a touch screen — so the control keeps
 * its `aria-label` and this is the sighted pointer user's copy of it. Passing
 * the same string to both is correct and is what every caller here does.
 *
 * ⚠️ THE LIBRARY'S DELAY IS KEPT. 700ms is what stops a row of four icons from
 * flashing four tooltips as the pointer crosses it, which is the failure an
 * eager delay produces and the reason to leave the default alone.
 */
export function Hint({ says, at = "bottom", when = true, children }: {
  readonly says: string;
  readonly at?: "top" | "bottom" | "left" | "right";
  /**
   * ⚠️ FOR A CONTROL THAT IS ICON-ONLY ONLY SOMETIMES. A button whose visible
   * text already IS its label does not want a tooltip repeating it — that is the
   * same word twice, one of them floating. `false` returns the child untouched,
   * the way `Pip`'s `on` does.
   */
  readonly when?: boolean;
  readonly children: React.ReactNode;
}): React.ReactElement {
  if (!when) return <>{children}</>;
  return (
    <Tooltip>
      {children}
      <Tooltip.Content placement={at}>{says}</Tooltip.Content>
    </Tooltip>
  );
}

/**
 * WHAT A PERSON MEETS BEFORE THEY ARE ANYBODY — the mark, and the frame it
 * stands in.
 *
 * ⚠️ AN ENTRY SCREEN IS THE PAGE, NOT A CARD ON ONE. Every door here used to be
 * a `Card` floating dead-centre in a gradient, under a crown carrying the
 * product's name a second time and the raw hostname under it — so the first
 * screen anybody sees said the name twice, showed them a debug string, and
 * anchored nothing. A door has one job and the whole viewport to do it in.
 *
 * ⚠️ AND IT IS TOP-WEIGHTED, NOT CENTRED. Vertical centring is what makes a form
 * look like it is waiting for the rest of the page to load: nothing is above it,
 * nothing below, and the eye has no edge to start from. The column starts high,
 * the mark is the first thing in it, and the ambience is the page's own.
 */

import * as React from "react";
import { Link } from "@heroui/react";
import { ARRIVE_MARK, ARRIVE_RISE, doorAt } from "./motion.js";
import { GUTTER, SPACE, WIDTH } from "./metrics.js";
import { TYPE } from "./type.js";
import { Page, Spacer, Stack } from "./layout.js";
import type { Ambience } from "./ambience.js";

/* ------------------------------------------------------------------- mark --- */

/**
 * THE MARK IS A FRAME, AND A PRODUCT IS WHAT SITS INSIDE IT.
 *
 * ⚠️ THAT IS A SYSTEM RATHER THAN A LOGO, WHICH IS THE POINT ON A PLATFORM WHERE
 * A PRODUCT IS A MANIFEST. The deployment is the bare diamond; a product is the
 * same diamond with something in the middle of it. A new app gets an identity
 * that already belongs to the family instead of a drawing somebody commissions,
 * and four marks side by side read as four of one thing rather than four things.
 *
 * ⚠️ IT INHERITS `currentColor` AND NEVER TAKES THE ACCENT. The interface is
 * values and the data is hues (`ground.ts`); a mark tinted with the brand is the
 * one piece of chrome that stops working the moment a workspace picks a colour
 * close to the ground it sits on.
 *
 * ⚠️ AND IT IS DRAWN, NOT TYPED. `◇` and `◈` stood in for this everywhere — a
 * glyph whose weight, size and vertical alignment are whatever the reader's font
 * decides, which is why the crown's mark sat a pixel low on one machine and
 * looked bold on another.
 */
/**
 * ⚠️ AND THE DEPLOYMENT'S OWN INNER IS THE NUMERAL, BECAUSE THE PRODUCT IS
 * CALLED ONE. A bare frame is a shape; a frame with a `1` in it is a name
 * somebody can say out loud after seeing it once, which is the entire job of a
 * mark at 18 pixels in a crown. It is drawn as a stem and a flag rather than
 * set as text — a glyph inside an SVG is the reader's font again, at whatever
 * weight and baseline their machine decides.
 */
export type MarkSize = "nav" | "row" | "crown" | "door";
export type MarkInner = "one" | "none" | "solid" | "ring";

const MARK_PX: Readonly<Record<MarkSize, number>> = {
  nav: 18, row: 20, crown: 24, door: 56,
};

/* ⚠️ ONE GEOMETRY AT EVERY SIZE, AND THE STROKE SCALES WITH IT. A fixed stroke
   makes the 18px mark a blob and the 56px one a hairline — the two sizes stop
   being the same shape, which is the only thing a mark has to be. */
const STROKE: Readonly<Record<MarkSize, number>> = {
  nav: 2.4, row: 2.2, crown: 2, door: 2,
};

export function Mark({ size = "crown", inner = "none", label }: {
  readonly size?: MarkSize;
  readonly inner?: MarkInner;
  /** An accessible name. Absent means decorative, beside text that already says it. */
  readonly label?: string;
}) {
  const px = MARK_PX[size];
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={STROKE[size]}
      strokeLinejoin="round"
      strokeLinecap="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className="shrink-0"
    >
      <path d="M12 2.6 21.4 12 12 21.4 2.6 12Z" />
      {/* ⚠️ The stem sits ON the diamond's vertical axis and the flag hangs to
          its left, so the numeral is optically centred rather than measured —
          a `1` centred by its bounding box always reads a hair right. */}
      {inner === "one" ? <path d="M10.5 9.6 12.4 7.9v8.2" /> : null}
      {inner === "solid" ? <path d="M12 8.2 15.8 12 12 15.8 8.2 12Z" fill="currentColor" /> : null}
      {inner === "ring" ? <path d="M12 7.6 16.4 12 12 16.4 7.6 12Z" /> : null}
    </svg>
  );
}

/* ---------------------------------------------------------------- arrival --- */

/**
 * THE FRAME EVERY DOOR SHARES.
 *
 * ⚠️ THE THREE ENTRY SCREENS ARE ONE COMPOSITION, AND THAT IS WHAT MAKES THEM
 * FEEL LIKE ONE PRODUCT. The signpost, the sign-in and the wizard are the same
 * column — mark, name, one claim, the action — with only the action differing.
 * Written separately they drifted within a week: three headings at three
 * weights, two of them wrapped in a card and one not.
 *
 * ⚠️ `aside` IS THE QUIET WAY OUT AND IT IS NEVER A SECOND PRIMARY. A door has
 * one thing to do; the other route belongs under it, in a voice that says so.
 */
/**
 * ⚠️ `veil`, NOT `aurora`, AND THE REASON IS IN `ambience.ts`. Aurora is the one
 * ambience that mixes a SECOND hue — `--success` — by design, so it stays green
 * however neutral a deployment's brand is: a monochrome product using it looks
 * like a monochrome product with a bug. Veil is one broad directional sweep from
 * a single hue, described in that file as the ground for a single large figure,
 * which is exactly what a door is.
 */
export function Arrival({ mark = "one", name, claim, children, aside, sky = "veil" }: {
  readonly mark?: MarkInner;
  readonly name: string;
  /** One line. What this is, or what is about to happen. */
  readonly claim?: string;
  readonly children: React.ReactNode;
  readonly aside?: React.ReactNode;
  readonly sky?: Ambience;
}) {
  return (
    <Page sky={sky}>
      {/* ⚠️ `door` RATHER THAN `read`, AND THE REASON IS IN `metrics.ts`: a
          sign-in form at prose width is a field the width of a paragraph. */}
      <div className={`w-full ${WIDTH.door} mx-auto ${GUTTER}`}>
        {/* ⚠️ ONE THIRD DOWN, NOT HALF. Optically centred rather than
            arithmetically: a short block placed at exactly 50% reads as low,
            because the eye takes the middle of a page to be above its middle. */}
        <div className="min-h-dvh flex flex-col justify-center pt-12 pb-[14vh] md:justify-start md:pt-[22vh] md:pb-12">
          {/* ⚠️ FOUR BLOCKS, ARRIVING IN THE ORDER SOMEBODY READS THEM. The mark
              turns in first and everything else rises under it — see
              `DOOR_MOTION`. Staggering the name and the form separately from the
              mark is what makes it a sequence rather than a page fading in. */}
          <Stack space="roomy">
            <Stack space="tight">
              <div {...ARRIVE_MARK} style={doorAt(0)}>
                <Mark size="door" inner={mark} label={name} />
              </div>
              <div {...ARRIVE_RISE} style={doorAt(1)}>
                <h1 className={TYPE.display}>{name}</h1>
                {claim ? <p className={`${TYPE.body} text-muted`}>{claim}</p> : null}
              </div>
            </Stack>

            <div {...ARRIVE_RISE} style={doorAt(2)}>
              <div className={`flex flex-col ${SPACE.snug}`}>{children}</div>
            </div>

            {aside
              ? <div {...ARRIVE_RISE} style={doorAt(3)}>{aside}</div>
              : null}
          </Stack>
        </div>
      </div>
      <Spacer />
    </Page>
  );
}

/**
 * A DOOR'S SECOND ROUTE — A SENTENCE WITH A LINK IN IT, NEVER A SECOND BUTTON.
 *
 * ⚠️ TWO BUTTONS OF ONE WEIGHT IS THE DOOR ASKING SOMEBODY TO CHOOSE BEFORE IT
 * HAS TOLD THEM ANYTHING. "Sign in" is what almost everybody arriving came to
 * do; starting a business is a decision made once. A ghost button beside the
 * primary still reads as a peer — and it carries the library's `px-4`, so the
 * words sat a thumb away from the sentence introducing them.
 *
 * ⚠️ AND WHERE IT LEAVES THE ORIGIN IT IS A REAL ANCHOR. Every one of these
 * crosses a door, which is a full page load either way — so `href` costs
 * nothing and buys middle-click, "open in new tab", and a status bar that shows
 * a person where they are about to go. A `Button` calling `location.assign`
 * silently takes all three away.
 */
export function AsideRoute({ says, label, href, onDo, isDisabled }: {
  readonly says: string;
  readonly label: string;
  /** Absent means this route stays on the page — a step back, not a door. */
  readonly href?: string;
  readonly onDo?: () => void;
  readonly isDisabled?: boolean;
}) {
  return (
    <p className={TYPE.note}>
      {says}{" "}
      <Link href={href} isDisabled={isDisabled} onPress={onDo ? () => onDo() : undefined}>
        {label}
        {/* ⚠️ THE ARROW MEANS "THIS LEAVES", SO IT IS ONLY DRAWN WHEN IT DOES.
            On "use a different address" — a step back within the same screen —
            it promises a page load that never comes, which is the small kind of
            lie that makes somebody stop trusting the other arrows. */}
        {href ? <Link.Icon /> : null}
      </Link>
    </p>
  );
}

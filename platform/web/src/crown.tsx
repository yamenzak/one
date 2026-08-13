/**
 * A CROWN — a destination that is a PLACE rather than a setting.
 *
 * ⚠️ IT WAS ONE HARD-CODED CARD AND THE SECOND ONE WOULD HAVE BEEN A COPY. The
 * vault had a card of its own — its own light, its own lockup, the whole surface
 * as the target — with everything about it written inline in the hub's home. The
 * hub now has three areas that are exactly the same order of thing, and three
 * copies of that markup is three cards that agree on the day they are written
 * and drift by the second edit.
 *
 * ⚠️ A CROWN IS NOT A BIG ROW, AND THAT IS THE WHOLE DISTINCTION. A row says
 * "somewhere to go and change something"; a crown says "somewhere". The
 * difference is carried by the light, the lockup and the fact that the entire
 * card is the target — a button inside one would be a second thing to hit on a
 * surface that is already the offer.
 *
 * ⚠️ AND THE HUE IS THE ONLY THING THAT VARIES BETWEEN THEM. Same mechanism,
 * same sky variant, one number moved — so three crowns on one screen read as
 * three of the same thing rather than as three designs. Given free rein each
 * would grow its own gradient, and the screen would stop being a set.
 */

import type { CSSProperties, ReactNode } from "react";
import { Lockup } from "./brand/mark.js";
import { Onward } from "./icon.js";

export interface CrownProps {
  readonly word: string;
  /**
   * ⚠️ THE MARK IS FOR WHAT IS ACTUALLY NAMED AFTER THE BRAND, and almost nothing
   * is. The hub drew three crowns as lockups and the page title as a fourth, so
   * one screen carried the mark four times — which does not make three areas
   * look important, it makes the mark furniture, and it read as three products
   * called "4° Account Center", "4° Workspaces" and "4° Marketplace". The Vault
   * keeps it because "4° Vault" is its name; an area of the hub is not a name.
   */
  readonly marked?: boolean;
  /** What this place IS, in one or two lines. Never a list of its contents. */
  readonly said: ReactNode;
  /**
   * The one fact worth carrying on the outside, so somebody does not have to
   * open it to find out whether they need to.
   *
   * ⚠️ `null` IS "NOT KNOWN YET" AND RENDERS A WAIT, not an empty foot. A
   * destination renders with no answer at all — only the fact is unknown, and a
   * confident "Nothing" shown to somebody with four things is worse than showing
   * nothing.
   */
  readonly foot?: ReactNode | null;
  /**
   * ⚠️ AURORA'S HUE, IN DEGREES. It is a number rather than a colour so a crown
   * cannot be given a palette of its own — see the header.
   */
  readonly hue: number;
  readonly onGo: () => void;
}

export function Crown({ word, said, foot, hue, marked = false, onGo }: CrownProps): ReactNode {
  return (
    <button type="button" className="crown press" onClick={onGo}>
      {/*
        ⚠️ AURORA RATHER THAN THE PAGE'S SILK. Silk is ribbons across a wide
        field and needs the width to read as fabric; at card size it is two
        bright streaks. Aurora is three broad sources with a wide falloff, which
        is what still reads as light in something small.
      */}
      <div className="sky" data-sky="aurora" data-in="card" style={{ "--sky-h": hue } as CSSProperties} aria-hidden="true" />
      <span className="crown-name">{marked ? <Lockup word={word} /> : word}</span>
      <span className="crown-said">{said}</span>
      {foot !== undefined ? (
        <span className="crown-foot">
          {foot === null ? <span className="waiting line short" /> : foot}
          <Onward className="chevron" />
        </span>
      ) : null}
    </button>
  );
}

/**
 * ⚠️ THE THREE HUES, DECLARED TOGETHER SO THEY CAN BE COMPARED. Chosen apart,
 * each is reasonable and the set is not: two of them land within fifteen degrees
 * and the screen has two cards nobody can tell apart at a glance, which is the
 * one job the hue is doing.
 */
export const HUES = {
  /** Who you are. The platform's own violet — the vault's, and the account's. */
  account: 268,
  /** What you belong to. Cool, because a workspace is somewhere you work. */
  workspaces: 196,
  /**
   * What you may start. Warm, because it is the one that takes money.
   *
   * ⚠️ ORANGE RATHER THAN AMBER, AND THE REASON IS THE SECOND SOURCE. Aurora
   * draws its middle light at the hue plus thirty, so 38 put the card's other
   * half at 68 — yellow-green — and the whole thing read as olive beside a
   * violet and a teal. At 20 both sources stay warm.
   */
  market: 20,
} as const;

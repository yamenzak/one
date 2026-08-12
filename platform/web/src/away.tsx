/**
 * A LINK OUT — the one way this interface points at something it does not own.
 *
 * ⚠️ EVERY LINK IN THE ACCOUNT CENTRE WAS A BARE ANCHOR. Browser blue, browser
 * underline, no press, no motion, and nothing saying it leaves — on a surface
 * where every other control has a tone, a spring and a considered focus ring. It
 * is the one place the interface stopped being designed, and it happened because
 * an anchor is the only element that looks finished with no styling at all.
 *
 * ⚠️ IT SAYS IT LEAVES, AND THE MARK IS PART OF THE WORD. Rendering an operative
 * document's address as more of this page is how somebody agrees to a summary
 * believing they read the contract — so the glyph is not decoration, it is the
 * difference between a link and a heading.
 *
 * ⚠️ THE UNDERLINE IS DRAWN, NOT INHERITED, so it can move. A browser underline
 * sits at a fixed offset, cannot change thickness without changing the text
 * metrics, and cannot animate at all; a gradient background on the text box can do
 * all three — and what it does here is thicken under the pointer, which is the
 * smallest possible way of saying a link is a thing you act on.
 *
 * ⚠️ AND AN ADDRESS IS NOT A NEW TAB. A mailto opens somebody's mail client; sent
 * through the same treatment it promised a page that never arrives, and the
 * outward mark — the whole point of which is that it is honest — was the part that
 * lied. The scheme decides: a letter for mail, the outward arrow for the web.
 *
 * ⚠️ AND IT IS A `Mark`-FREE ROW OF ITS OWN AT LIST SCALE. `Away.Row` is what a
 * card full of external references uses: the same row shape as everything else in
 * the interface, with the outward glyph where a chevron would be — because a
 * chevron is a promise of a NEXT SCREEN, and this is a promise of a new tab.
 */

import type { ReactNode } from "react";
import { Letter, Outward } from "./icon.js";

export interface AwayProps {
  readonly href: string;
  readonly children: ReactNode;
}

/**
 * ⚠️ `noreferrer` AS WELL AS `noopener`. The first is a security property and the
 * second is a privacy one — a link out of a page about somebody's data should not
 * hand the destination the address of the screen they were on.
 */
export const Away = ({ href, children }: AwayProps): ReactNode => {
  const mail = href.startsWith("mailto:");
  return (
    <a className="away" href={href} target={mail ? undefined : "_blank"} rel="noreferrer">
      <span className="away-word">{children}</span>
      {mail
        ? <Letter className="away-mark" size={14} />
        : <Outward className="away-mark" size={14} />}
    </a>
  );
};

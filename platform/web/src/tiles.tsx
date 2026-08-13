/**
 * TILES — a set of things recognised by their mark rather than read by name.
 *
 * ⚠️ IT IS A GRID BECAUSE THE MARK IS THE CONTENT. A row is right when the
 * second line carries a fact somebody needs: a price, a standing, a count. A
 * product on a shelf has a logo, a name, and nothing else worth a line — set as
 * rows that is a column of mostly empty space where the eye has to read every
 * label to find one it recognises, and a grid of marks is scanned in one pass.
 *
 * ⚠️ THREE ACROSS, AND IT IS NOT A BREAKPOINT. Two is a list with gaps; four
 * puts the mark below the size at which a logo is a logo. Three fits the width
 * this interface is designed at with a mark large enough to recognise and a name
 * that does not wrap for any product anybody would ship.
 *
 * ⚠️ AND A TILE THAT CANNOT BE PRESSED STILL LOOKS LIKE A TILE. Something on
 * offer that is not open to this person is shown and said, never hidden — hidden,
 * the grid is a different shape per person and "where is the other one" has no
 * answer anybody can act on. It goes quiet rather than away.
 */

import type { ReactNode } from "react";

export interface Tile {
  readonly id: string;
  readonly name: string;
  /** The logo or generated face. `Mark` is what draws one everywhere else. */
  readonly mark: ReactNode;
  /**
   * ⚠️ ONE WORD UNDER THE NAME, AND ONLY WHERE THERE IS A STATE WORTH SAYING.
   * A line on every tile is a second row of text in a grid whose whole argument
   * is that the mark carries it.
   */
  readonly said?: string;
  /** Absent makes the tile inert — see the header. */
  readonly onGo?: () => void;
}

export interface TilesProps {
  readonly tiles: readonly Tile[];
  /**
   * ⚠️ THE CEILING IS SHOWN, NEVER SILENT. A grid truncated with no way on reads
   * as the whole set, and somebody looking for the seventh thing concludes it is
   * not there. `onMore` is what the row under it presses.
   */
  readonly cap?: number;
  readonly onMore?: () => void;
}

export function Tiles({ tiles, cap, onMore }: TilesProps): ReactNode {
  const shown = cap ? tiles.slice(0, cap) : tiles;
  const hidden = tiles.length - shown.length;
  return (
    <div className="tiles-wrap">
      <ul className="tiles">
        {shown.map((t) => (
          <li key={t.id}>
            {/*
              ⚠️ A BUTTON ONLY WHERE IT DOES SOMETHING. Rendered as a disabled
              button, an inert tile is announced as a control somebody cannot use;
              rendered as a plain element it is what it is — a thing on a shelf,
              with a word saying why it is not for them.
            */}
            {t.onGo ? (
              <button type="button" className="tile press" onClick={t.onGo}>
                <span className="tile-mark">{t.mark}</span>
                <span className="tile-name">{t.name}</span>
                {t.said ? <span className="tile-said">{t.said}</span> : null}
              </button>
            ) : (
              <div className="tile" data-off="">
                <span className="tile-mark">{t.mark}</span>
                <span className="tile-name">{t.name}</span>
                {t.said ? <span className="tile-said">{t.said}</span> : null}
              </div>
            )}
          </li>
        ))}
      </ul>
      {hidden > 0 && onMore ? (
        <button type="button" className="tiles-more press-flat" onClick={onMore}>
          {`See all ${tiles.length}`}
        </button>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ quick --- */

export interface Act {
  readonly id: string;
  readonly icon: ReactNode;
  /** One or two words. It sits under a 56-pixel circle and may not wrap twice. */
  readonly label: string;
  readonly onGo: () => void;
}

/**
 * A ROW OF ACTIONS, EACH A CIRCLE WITH ITS NAME UNDER IT.
 *
 * ⚠️ IT IS FOR THE TWO OR THREE THINGS SOMEBODY CAME TO DO, and it earns its
 * place by being the alternative to three full-width buttons stacked down a
 * screen — which is a screen that looks like a decision when it is a menu. Above
 * about four it stops being a row of choices and becomes a toolbar nobody reads.
 *
 * ⚠️ THE LABEL IS PART OF THE TARGET, not a caption beside it. A circle with a
 * word underneath where only the circle is pressable is a control with a
 * mis-sized hit area and no way to tell from looking.
 */
export function Quick({ acts }: { readonly acts: readonly Act[] }): ReactNode {
  return (
    <div className="quick">
      {acts.map((a) => (
        <button key={a.id} type="button" className="quick-act" onClick={a.onGo}>
          <span className="quick-ring press">{a.icon}</span>
          <span className="quick-label">{a.label}</span>
        </button>
      ))}
    </div>
  );
}

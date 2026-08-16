/**
 * THE HUB'S OWN FURNITURE — one piece, and it is one because the other two left.
 *
 * ⚠️ `Refusal` AND `Waiting` USED TO LIVE HERE AND ARE `@quad/design`'S NOW. That
 * is the whole point of this file being short: a refusal drawn from a `Problem`
 * and a "we are fetching" line are not things about the Hub, they are things
 * every app has, and two of them existing meant two answers to the same
 * question. The Hub's `Refusal` even carried its own tone→status map — the same
 * five pairs, re-derived, in a second place where one of them could drift.
 *
 * ⚠️ NOTHING HERE RESTYLES A COMPONENT (D7). What is left is an arrangement:
 * where a card sits on a page. The moment it sets a colour or a radius it
 * becomes a screen a workspace's branding does not reach, and nobody finds out
 * until somebody with a strong brand asks why one page still looks like ours.
 */

import { Card } from "@heroui/react";
import { SPACE } from "@quad/design";

/** One column, centred, with room to breathe. Placement, nothing else. */
export function Sheet(
  { title, lead, children }: {
    readonly title: string;
    readonly lead?: string;
    readonly children: React.ReactNode;
  },
) {
  return (
    <Card className="w-full max-w-lg">
      <Card.Header>
        <Card.Title>{title}</Card.Title>
        {lead ? <Card.Description>{lead}</Card.Description> : null}
      </Card.Header>
      <Card.Content>
        {/* ⚠️ THE GAP COMES FROM THE SCALE, NOT FROM THIS FILE. It was `gap-4`,
            which is not a step on it — so a sheet's rows sat a pixel apart from
            every other stack in the product, defensibly, and nobody could point
            at which one was wrong. */}
        <div className={`flex flex-col ${SPACE.snug}`}>{children}</div>
      </Card.Content>
    </Card>
  );
}

/**
 * ONE WORKSPACE — the way into everything about it, and the way into it.
 *
 * ⚠️ THE ROWS ARE THE FIVE THINGS THAT USED TO BE TABS, and putting them here
 * is the whole correction. People, money, settings and records are things
 * somebody goes and does once and then leaves — given a permanent bar they
 * become a product of their own, sitting over whatever the person actually came
 * to use.
 *
 * ⚠️ A ROW SOMEBODY CANNOT OPEN IS NOT DRAWN. The same rule the navigation and
 * the tool catalogue follow: a destination that answers 403 is a promise the
 * product does not keep, and nothing on the row says which of the two it is.
 *
 * ⚠️ AND OPENING THE PRODUCT IS A FULL PAGE LOAD, BECAUSE IT IS ANOTHER ORIGIN.
 * A workspace lives at its own address; a router pushing a path here would land
 * on a screen this door does not have, and the first thing to fail would be a
 * fetch nobody can see.
 */

import { Button, Chip } from "@heroui/react";
import { Group, NavRow, Nothing, Row, Stack, glyphOf } from "@quad/web";
import { useSession } from "../session.js";
import { tenantUrl } from "../door.js";
import { OF_WORKSPACE, nameOf, partsFor, type Where, type WorkspacePart } from "./where.js";

/**
 * ⚠️ A GLYPH PER ROW AND NO DESCRIPTION, WHICH IS THE HOME'S GRAMMAR. Every row
 * here carried a sentence, so five destinations came out as ten lines of text —
 * a wall to read where the home beside it is a list to scan. The sentence is
 * what each screen says when somebody arrives on it, which is where it is
 * useful and where it is not competing with four others.
 */
const GLYPH: Readonly<Record<WorkspacePart, string>> = {
  people: "people",
  money: "money",
  settings: "settings",
  trust: "trust",
  wording: "note",
};

export function OneWorkspace({ slug, onGo }: {
  readonly slug: string;
  readonly onGo: (to: Where) => void;
}) {
  const { me, where } = useSession();
  const person = me && me !== "nobody" ? me : null;
  const workspace = person?.tenants.find((t) => t.slug === slug);

  if (person && !workspace) {
    return (
      <Nothing
        says="You are not in this workspace"
        under="It may have been closed, or your access taken away"
      />
    );
  }

  const role = workspace?.platformRole ?? null;
  /* ⚠️ Decided in `where.ts`, so it is a table of cases rather than a walk
     through four sign-ins — and so the rule is stated once. */
  const mine = new Set(partsFor(role));

  return (
    <Stack space="roomy">
      {/* ⚠️ THE PRODUCT COMES FIRST, BECAUSE IT IS WHY MOST PEOPLE OPENED THIS.
          It was the last thing on the screen, under five rows of administration
          — so the one action somebody wants daily sat below the five they want
          twice a year. */}
      <Row>
        <Button
          variant="primary"
          size="lg"
          fullWidth
          onPress={() => { if (where) location.assign(tenantUrl(slug, where, location)); }}
        >
          Open {workspace?.name ?? slug}
        </Button>
      </Row>

      {/* ⚠️ THE PROBLEM COMES BEFORE THE LIST, NOT INSIDE IT. A failed payment
          filed as the first row of a menu is a row; above the menu it is the
          reason the person is looking. */}
      {workspace?.attention ? (
        <Row>
          <Chip color="warning" variant="soft">
            <Chip.Label>A payment did not go through — Money has the detail</Chip.Label>
          </Chip>
        </Row>
      ) : null}

      {/* ⚠️ The workspace's own name and what you are in it are the crown's —
          see `Hub.tsx`. An unlabelled group is the whole of this screen. */}
      <Group>
        {/* ⚠️ Every member may look at the roster; only some may change it, and
            the screen behind that row is what decides it, not the row. */}
        {OF_WORKSPACE.filter((p) => mine.has(p)).map((part) => (
          <NavRow
            key={part}
            icon={glyphOf(GLYPH[part])}
            label={nameOf({ at: part, slug })}
            onOpen={() => onGo({ at: part, slug })}
          />
        ))}
      </Group>
    </Stack>
  );
}

/**
 * STORES — every store this deployment made, and the ones it deliberately did
 * not make.
 *
 * ⚠️ DRAINING IS ITS OWN CARD BECAUSE IT IS THE ONLY ONE WITH A DEADLINE. A
 * database with customers on it, listed for deletion thirty days out, is a
 * sentence somebody acts on — and mixed into an alphabetical inventory it is one
 * chip among forty, found by whoever happened to scroll past it. It is at the
 * top and it is absent the rest of the time.
 *
 * ⚠️ THE WITHHELD LIST IS THE INVENTORY FROM THE OTHER SIDE. A need dropped
 * because its store cannot be held to a jurisdiction is a store that will never
 * appear above — correctly, and silently. Saying so turns "the product
 * mysteriously does less in Europe" into a decision somebody made, which is why
 * it is on this page and not on the one about what changes tonight.
 *
 * ⚠️ AND THE PLAN LEFT THIS SCREEN. It was a fourth card here with a primary
 * button in it, read after two lists of things that are simply true — so the one
 * control that spends money and destroys databases was the least prominent thing
 * on the page. It is `Pass.tsx` now.
 *
 * ⚠️ A CHIP CARRIES A STATE, NEVER A SENTENCE. "draining until Sep 14, 2026"
 * in a chip wrapped onto two lines and pushed its row out of the rhythm of the
 * card; the state is one word and the date is what the row says underneath it.
 */

import {
  ControlRow, FieldRow, Group, Nothing, Screen, Stack, glyphOf, sentence, useShown,
} from "@engine/design";
import {
  sayDate, sayKind, sayWhere, type Instant, type Residency, type ResourceKind,
} from "@engine/kernel";
import { Chip } from "@heroui/react";
import { useLoad } from "../centre/data.js";

interface Item {
  readonly name: string;
  readonly kind: string;
  readonly binding: string;
  readonly residency: string | null;
  readonly state: string;
  readonly detail: string | null;
  readonly drainAfter: string | null;
}

interface Withheld {
  readonly app: string;
  readonly need: string;
  readonly kind: string;
  readonly residency: string;
  readonly why: string;
}

interface Answer {
  readonly configured: boolean;
  readonly serves: readonly string[];
  readonly items: readonly Item[];
  readonly withheld: readonly Withheld[];
}

/*
  ⚠️ ONE TONE FOR "ON ITS WAY" AND ANOTHER FOR "GOING", because they are read at
  a glance and confusing them is the whole risk. `draining` is the only state on
  this screen with a consequence somebody has to prevent.
*/
const TONE: Readonly<Record<string, "default" | "success" | "warning" | "danger">> = {
  live: "success", bound: "default", created: "default", creating: "default",
  wanted: "default", draining: "warning", failed: "danger", gone: "default",
};

/**
 * ⚠️ A JURISDICTION IS A PLACE, NOT THE KEY WE BRANCH ON. `eu` and `global` are
 * values in a closed set — see `sayWhere`, which is in the kernel because four
 * screens print this and a fifth would invent a fifth wording.
 */
const where = (of: string | null): string => (of ? sayWhere(of as Residency) : "no region");

/**
 * ⚠️ ONE ROW SHAPE FOR A STORE, USED BY BOTH CARDS. Written twice, the draining
 * copy is the one that drifts — and it is the copy where a wrong date is a
 * database deleted on a day nobody expected.
 */
function StoreRow({ item, reader }: {
  readonly item: Item;
  readonly reader: ReturnType<typeof useShown>;
}) {
  return (
    <ControlRow
      label={item.name}
      /* ⚠️ THE JURISDICTION IS ON THE ROW. It is fixed at creation and cannot be
         edited, so it is the one fact about a store that is worth reading before
         anything else — and a date it is counting down to goes here rather than
         in the chip. */
      under={item.state === "draining" && item.drainAfter
        ? (
          /* ⚠️ THE DEADLINE TAKES THE REGION'S PLACE, because a store on its way
             out is not somewhere any more — it is a date. Same three-part shape,
             same order. */
          <span data-ink="warning">
            {`${sentence(sayKind(item.kind as ResourceKind))} · gone after `
              + sayDate(reader, item.drainAfter as Instant)}
          </span>
        )
        : [sentence(sayKind(item.kind as ResourceKind)), where(item.residency), item.binding]
          .join(" · ")}
    >
      {/* ⚠️ SAID, NOT PRINTED. `live`, `draining`, `creating` are the
          reconciler's own words and they are the right ones — lowercase in a chip
          beside "Behind" and "Closed" on the workspaces list, they were the
          reconciler's SPELLING. */}
      <Chip color={TONE[item.state] ?? "default"} variant="soft">
        <Chip.Label>{sentence(item.state)}</Chip.Label>
      </Chip>
    </ControlRow>
  );
}

export function Stores() {
  const reader = useShown();
  const of = useLoad<Answer>("op.infra");

  return (
    <Screen
      shape="list"
      under="Every store this deployment made, and where each one is"
      of={of.of}
      again={of.again}
      then={(data) => {
        const draining = data.items.filter((i) => i.state === "draining");
        const standing = data.items.filter((i) => i.state !== "draining");
        return (
          <Stack space="roomy">
            {/*
              ⚠️ NO TOKEN IS AN ANSWER, NOT AN ERROR. A deployment that cannot
              provision is a self-host, a test run, and this one before the secret
              is set — every declared need simply stays wanted and every capability
              behind one reads as absent.
            */}
            {!data.configured
              ? (
                <Nothing
                  icon={glyphOf("database")}
                  says="This deployment cannot provision anything"
                  under="No account token is set, so every declared need is still waiting"
                />
              )
              : null}

            {draining.length
              ? (
                <Group
                  label="Counting down to deletion"
                  under="Nothing is destroyed for thirty days — until then, wanting it back is enough"
                >
                  {draining.map((item) => (
                    <StoreRow key={item.name} item={item} reader={reader} />
                  ))}
                </Group>
              )
              : null}

            <Group
              label="What it stands on"
              under={data.serves.length
                ? `Serving ${data.serves.map((s) => where(s)).join(" and ")}`
                : undefined}
            >
              {standing.length
                ? standing.map((item) => (
                  <StoreRow key={item.name} item={item} reader={reader} />
                ))
                : <Nothing icon={glyphOf("database")} says="Nothing has been made yet" />}
            </Group>

            {/*
              ⚠️ WHAT THIS DEPLOYMENT CANNOT PROMISE, NAMED. A store with no
              residency control is not provisioned where a jurisdiction was
              promised — so the feature does not exist there. Listing it is the
              difference between a considered refusal and a product that
              mysteriously does less in Europe.
            */}
            {data.withheld.length
              ? (
                <Group
                  label="Withheld, and why"
                  under="These cannot be held to a region, so nothing personal goes through them there"
                >
                  {data.withheld.map((w) => (
                    <FieldRow
                      key={`${w.app}-${w.need}-${w.residency}`}
                      label={sentence(w.need)}
                      /* ⚠️ THE VALUE IS THE VERDICT, NOT THE KIND. It read `ai` —
                         the enum the planner switches on — where somebody was
                         looking for what is true about this need. */
                      value={<span data-ink="warning">{`Not in ${where(w.residency)}`}</span>}
                      under={w.why}
                    />
                  ))}
                </Group>
              )
              : null}
          </Stack>
        );
      }}
    />
  );
}

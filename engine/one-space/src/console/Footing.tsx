/**
 * FOOTING — what this deployment stands on, and what it is about to throw away.
 *
 * ⚠️ THE THIRD LIST IS WHY THIS IS A SCREEN. What exists is reassuring and what
 * is planned is interesting, but what is DRAINING is the only one with a
 * deadline: a database with customers on it, listed for deletion thirty days
 * out. Read here it is a sentence somebody acts on; read nowhere it is a
 * deletion nobody chose.
 *
 * ⚠️ AND THE WITHHELD LIST IS THE LEGAL HALF MADE VISIBLE. A need dropped
 * because its store cannot be held to a jurisdiction is a feature that does not
 * exist in that jurisdiction — correctly, and silently. Saying so turns "the
 * product mysteriously does less in Europe" into a decision somebody made.
 *
 * ⚠️ FOUR SECTION HEADINGS ARE NOT A HIERARCHY, THEY ARE FOUR TITLES. `Section`
 * sets a heading nearly as loud as the screen's own, so this read as four pages
 * stacked — with the two that have a deadline third and fourth. Cards with
 * labels are the same four groups at the weight a group deserves, and the ones
 * that only exist when something is happening now sit at the top.
 *
 * ⚠️ AND A CHIP CARRIES A STATE, NEVER A SENTENCE. "draining until Sep 14, 2026"
 * in a chip wrapped onto two lines and pushed its row out of the rhythm of the
 * card; the state is one word and the date is what the row says underneath it.
 */

import {
  ControlRow, FieldRow, Group, Nothing, Screen, Stack, glyphOf, notice, sentence, useShown,
} from "@engine/design";
import {
  sayDate, sayKind, sayWhere, type Instant, type Residency, type ResourceKind,
} from "@engine/kernel";
import { Button, Chip } from "@heroui/react";
import { api } from "../api.js";
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

interface Step {
  readonly do: string;
  readonly name: string;
  readonly kind: string;
  readonly residency?: string | null;
  readonly after?: string | null;
}

interface Withheld {
  readonly app: string;
  readonly need: string;
  readonly kind: string;
  readonly residency: string;
  readonly why: string;
}

interface Move {
  readonly tenant_id: string;
  readonly from_shard: string;
  readonly to_shard: string;
  readonly state: string;
  readonly detail: string | null;
  readonly drain_after: string | null;
}

interface Answer {
  readonly configured: boolean;
  readonly serves: readonly string[];
  readonly items: readonly Item[];
  readonly steps: readonly Step[];
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
 * ⚠️ WHAT THE PASS WOULD DO, AS SOMETHING IT DOES. `create`, `bind` and
 * `destroy` are the verbs the planner branches on, and printed raw they are a
 * column of lowercase words under a heading in sentence case.
 */
const DOES: Readonly<Record<string, string>> = {
  create: "Create it",
  bind: "Bind it to this worker",
  destroy: "Destroy it",
};

export function Footing() {
  const reader = useShown();
  const of = useLoad<Answer>("op.infra");
  /* ⚠️ A MOVE IN FLIGHT HOLDS A WORKSPACE READ-ONLY, so it is not something to
     learn about from its owner. It sits here rather than on its own screen
     because it is the same question as everything above — what this deployment
     is standing on, and what is currently moving underneath it. */
  const moves = useLoad<{ items: readonly Move[] }>("op.moves");

  /*
    ⚠️ A REFUSAL IS SAID, NOT SWALLOWED. This is the one control on the screen
    that spends money and creates things, so "it did nothing and told you
    nothing" is the failure to avoid — and the reconciler's own refusals are
    sentences an operator can act on ("this token cannot list queues").
  */
  const reconcile = async () => {
    const out = await api.post("op.infra.apply", {});
    if (!out.ok) { notice.fail(out.problem.title); return; }
    const did = (out.value as { did?: readonly string[] }).did ?? [];
    notice.ok(did.length ? did.join("; ") : "Nothing needed doing.");
    of.again();
  };

  return (
    <Screen
      shape="list"
      under="Every store this deployment made, where it is, and what changes tonight"
      of={of.of}
      again={of.again}
      then={(data) => {
        const moving = moves.of.status === "ready"
          ? moves.of.data.items.filter((m) => m.state !== "gone") : [];
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

            {/*
              ⚠️ WHAT IS HAPPENING NOW GOES ABOVE WHAT IS TRUE, and it is the one
              ordering decision on this screen. A move holds a workspace read-only
              while it runs, so it is read before the inventory it is happening
              inside — and it is absent entirely the rest of the time.
            */}
            {moving.length
              ? (
                <Group label="Moving" under="A workspace is read-only until its copy is verified">
                  {moving.map((m) => (
                    <ControlRow
                      key={`${m.tenant_id}-${m.to_shard}`}
                      label={`${m.from_shard} → ${m.to_shard}`}
                      under={m.detail ?? m.tenant_id}
                    >
                      <Chip color={m.state === "copying" ? "warning" : "default"} variant="soft">
                        <Chip.Label>{m.state}</Chip.Label>
                      </Chip>
                    </ControlRow>
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
              {data.items.length
                ? data.items.map((item) => (
                  <ControlRow
                    key={item.name}
                    label={item.name}
                    /* ⚠️ THE JURISDICTION IS ON THE ROW. It is fixed at creation
                       and cannot be edited, so it is the one fact about a store
                       that is worth reading before anything else — and a date it
                       is counting down to goes here rather than in the chip. */
                    under={item.state === "draining" && item.drainAfter
                      ? (
                        /* ⚠️ THE DEADLINE TAKES THE REGION'S PLACE, because a
                           store on its way out is not somewhere any more — it is
                           a date. Same three-part shape, same order. */
                        <span data-ink="warning">
                          {`${sentence(sayKind(item.kind as ResourceKind))} · gone after `
                            + sayDate(reader, item.drainAfter as Instant)}
                        </span>
                      )
                      : [sentence(sayKind(item.kind as ResourceKind)), where(item.residency), item.binding]
                        .join(" · ")}
                  >
                    <Chip color={TONE[item.state] ?? "default"} variant="soft">
                      <Chip.Label>{item.state}</Chip.Label>
                    </Chip>
                  </ControlRow>
                ))
                : <Nothing icon={glyphOf("database")} says="Nothing has been made yet" />}
            </Group>

            {/*
              ⚠️ THE PLAN, SEPARATE FROM THE BUTTON THAT RUNS IT. Every destructive
              step here is at the far end of a thirty-day window, so this is where
              a mistake is still free — reading it has to cost nothing, which is
              why it is a read and not a dry-run flag on the write.

              ⚠️ AND THE BUTTON BELONGS TO THE CARD IT RUNS. It was a bare pill
              between two sections, owned by neither — a primary-looking control
              floating in a gap, which is the one place nothing says what it acts
              on. `does` is the slot for exactly this.
            */}
            <Group
              label="What the next pass would do"
              under="The nightly pass does this on its own — the button is only sooner"
              does={data.configured
                ? <Button variant="primary" onPress={reconcile}>Reconcile now</Button>
                : undefined}
            >
              {data.steps.length
                ? data.steps.map((step) => (
                  <FieldRow
                    key={`${step.do}-${step.name}`}
                    label={step.name}
                    value={DOES[step.do] ?? sentence(step.do)}
                    under={step.after
                      ? `After ${sayDate(reader, step.after as Instant)}`
                      : undefined}
                  />
                ))
                : (
                  <Nothing
                    icon={glyphOf("list")}
                    says="Nothing to do"
                    under="Everything declared exists and is bound"
                  />
                )}
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

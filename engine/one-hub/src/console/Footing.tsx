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
 */

import { ControlRow, FieldRow, Group, Nothing, Screen, Section, notice } from "@engine/design";
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

export function Footing() {
  const of = useLoad<Answer>("op.infra");

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
      of={of.of}
      again={of.again}
      then={(data) => (
        <>
          {/*
            ⚠️ NO TOKEN IS AN ANSWER, NOT AN ERROR. A deployment that cannot
            provision is a self-host, a test run, and this one before the secret
            is set — every declared need simply stays wanted and every capability
            behind one reads as absent.
          */}
          {!data.configured
            ? (
              <Nothing
                says="This deployment cannot provision anything"
                under="No account token is set, so every declared need is still waiting"
              />
            )
            : null}

          <Section
            label="What it stands on"
            under={data.serves.length ? `Serving ${data.serves.join(", ")}` : undefined}
          >
            {data.items.length
              ? (
                <Group>
                  {data.items.map((item) => (
                    <ControlRow
                      key={item.name}
                      label={item.name}
                      /* ⚠️ THE JURISDICTION IS ON THE ROW. It is fixed at
                         creation and cannot be edited, so it is the one fact
                         about a store that is worth reading before anything
                         else. */
                      under={[item.kind, item.residency ?? "no region", item.binding]
                        .filter(Boolean).join(" · ")}
                    >
                      <Chip color={TONE[item.state] ?? "default"} variant="soft">
                        <Chip.Label>
                          {item.state === "draining" && item.drainAfter
                            ? `draining until ${item.drainAfter.slice(0, 10)}`
                            : item.state}
                        </Chip.Label>
                      </Chip>
                    </ControlRow>
                  ))}
                </Group>
              )
              : <Nothing says="Nothing has been made yet" />}
          </Section>

          {/*
            ⚠️ THE PLAN, SEPARATE FROM THE BUTTON THAT RUNS IT. Every destructive
            step here is at the far end of a thirty-day window, so this is where
            a mistake is still free — reading it has to cost nothing, which is
            why it is a read and not a dry-run flag on the write.
          */}
          <Section
            label="What the next pass would do"
            under="The nightly pass does this on its own — the button is only sooner"
          >
            {data.steps.length
              ? (
                <Group>
                  {data.steps.map((step) => (
                    <FieldRow
                      key={`${step.do}-${step.name}`}
                      label={step.name}
                      value={step.after ? `${step.do} after ${step.after.slice(0, 10)}` : step.do}
                    />
                  ))}
                </Group>
              )
              : <Nothing says="Nothing to do" under="Everything declared exists and is bound" />}

            {data.configured
              ? (
                <Button variant="primary" onPress={reconcile}>Reconcile now</Button>
              )
              : null}
          </Section>

          {/*
            ⚠️ WHAT THIS DEPLOYMENT CANNOT PROMISE, NAMED. A store with no
            residency control is not provisioned where a jurisdiction was
            promised — so the feature does not exist there. Listing it is the
            difference between a considered refusal and a product that
            mysteriously does less in Europe.
          */}
          {data.withheld.length
            ? (
              <Section
                label="Withheld, and why"
                under="These cannot be held to a region, so nothing personal goes through them there"
              >
                <Group>
                  {data.withheld.map((w) => (
                    <FieldRow
                      key={`${w.app}-${w.need}-${w.residency}`}
                      label={`${w.need} in ${w.residency}`}
                      value={w.kind}
                      under={w.why}
                    />
                  ))}
                </Group>
              </Section>
            )
            : null}
        </>
      )}
    />
  );
}

/**
 * THE NEXT PASS — what the reconciler would do, and the button that does it now.
 *
 * ⚠️ ITS OWN PAGE, BECAUSE IT IS THE ONE THAT ACTS. This was the third card on
 * the inventory screen, under two lists of things that are simply true — so the
 * only control in the console that creates databases and destroys them was the
 * least prominent thing on its page, and reading the plan meant scrolling past
 * everything that already exists.
 *
 * ⚠️ THE PLAN IS A READ, NOT A DRY-RUN FLAG ON THE WRITE. Every destructive step
 * here is at the far end of a thirty-day window, so this is where a mistake is
 * still free — and looking has to cost nothing, which a flag on the write cannot
 * promise.
 *
 * ⚠️ AND THE BUTTON BELONGS TO THE CARD IT RUNS. It was a bare pill between two
 * sections, owned by neither — a primary-looking control floating in a gap, which
 * is the one place nothing says what it acts on. `does` is the slot for exactly
 * this.
 */

import {
  ControlRow, FieldRow, Group, Nothing, Screen, Stack, glyphOf, notice, sentence, useShown,
} from "@engine/design";
import { sayDate, sayKind, type Instant, type ResourceKind } from "@engine/kernel";
import { Button, Chip } from "@heroui/react";
import { api } from "../api.js";
import { useLoad } from "../centre/data.js";

interface Step {
  readonly do: string;
  readonly name: string;
  readonly kind: string;
  readonly residency?: string | null;
  readonly after?: string | null;
}

interface Answer {
  readonly configured: boolean;
  readonly steps: readonly Step[];
}

/**
 * ⚠️ WHAT THE TOKEN CAN ACTUALLY DO, AND IT WAS ASKED OF NOTHING. `op.infra.verify`
 * has been declared, guarded and testable since the reconciler shipped, and no
 * screen ever called it — so the one question that separates "the plan will run"
 * from "the plan will half run and report the rest as an outage" was answerable
 * and unanswered.
 */
interface Able {
  readonly configured: boolean;
  readonly can: readonly ResourceKind[];
  readonly why?: string;
}

/** ⚠️ Every kind the planner can ask for — a permission missing from `can` is a
    step that will fail, so the absent ones are the point rather than the held. */
const KINDS: readonly ResourceKind[] = ["d1", "kv", "r2", "queue", "ai", "do"];

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

export function Pass() {
  const reader = useShown();
  const of = useLoad<Answer>("op.infra");
  const able = useLoad<Able>("op.infra.verify");

  /*
    ⚠️ A REFUSAL IS SAID, NOT SWALLOWED. This is the one control in the console
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
      under="What the nightly pass would create, bind and destroy"
      of={of.of}
      again={of.again}
      then={(data) => {
        const can = able.of.status === "ready" && able.of.data.configured
          ? able.of.data : null;
        const missing = can ? KINDS.filter((k) => !can.can.includes(k)) : [];
        return (
        <Stack space="roomy">
        {/*
          ⚠️ WHAT THE TOKEN CANNOT DO GOES ABOVE THE BUTTON THAT NEEDS IT. A
          token with D1 but not Queues produces a pass that half works and
          reports the other half as an outage — knowable in one call, and read
          after the failure it explains if it sits underneath.

          ⚠️ AND IT IS ABSENT WHEN EVERYTHING IS PERMITTED. Six green rows on
          every visit is texture; the ones that are missing are the message.
        */}
        {missing.length
          ? (
            <Group
              label="This token cannot do everything"
              under={can?.why ?? "Steps needing these will be refused rather than run"}
            >
              {missing.map((k) => (
                <ControlRow key={k} label={sentence(sayKind(k))} under="Not permitted by this token">
                  <Chip color="warning" variant="soft"><Chip.Label>Refused</Chip.Label></Chip>
                </ControlRow>
              ))}
            </Group>
          )
          : null}

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
                under={data.configured
                  ? "Everything declared exists and is bound"
                  /* ⚠️ AND AN EMPTY PLAN MEANS TWO OPPOSITE THINGS. With no token
                     the pass cannot do anything rather than having nothing to do,
                     and one sentence for both is the screen telling somebody they
                     are converged when nothing has ever been created. */
                  : "No account token is set, so nothing can be provisioned"}
              />
            )}
        </Group>
        </Stack>
        );
      }}
    />
  );
}

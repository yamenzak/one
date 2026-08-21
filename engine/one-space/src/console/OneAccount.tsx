/**
 * ONE PERSON, FROM THE OPERATOR'S SIDE.
 *
 * ⚠️ THIS IS THE SCREEN "GIVE MY FRIEND A WORKSPACE AT MAX" IS ONE PRESS ON.
 * Every mechanism behind it already existed one workspace at a time — comp a
 * plan, top up a wallet, raise a commercial count — and each began by knowing a
 * workspace, so giving somebody something meant finding one first, and giving it
 * to somebody with none meant waiting for them to make one and coming back.
 *
 * ⚠️ IT OPENS ON AN ADDRESS THAT MAY HAVE NO ACCOUNT, and that is the feature
 * rather than an edge. A demo account, a friend and a customer who paid cash
 * last week are all addresses nobody has signed in as yet — refusing here would
 * make the gift invisible until they arrived, which is exactly when nobody is
 * looking at it.
 *
 * ⚠️ AND WHAT WAS GIVEN IS A LIST, INCLUDING WHAT IS OVER. Three ways a gift
 * ends — an operator stopped it, its date passed, it was spent — and a screen
 * that showed only the live ones could not answer "they say they were promised
 * a year", which is the question that brings somebody here.
 */

import { useState } from "react";
import { Button, Chip } from "@heroui/react";
import {
  AmountRow, Choice, Cluster, Credits, DateInput, FieldRow, Group, Identity, Nothing,
  NumberInput, RowsWaiting, Screen, Stack, TextInput, Tray, glyphOf, notice, placeFace,
  sentence, useShown, whoFace,
} from "@engine/design";
import type { Instant, PlanSpec } from "@engine/kernel";
import { isBusiness, sayDate } from "@engine/kernel";
import { api } from "../api.js";
import { useLoad } from "../centre/data.js";

/** ⚠️ A workspace they are in, with what they ARE in it — see `op.account`. */
interface Belongs {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly kind: string;
  readonly role: string | null;
  readonly planId: string | null;
  readonly status: string | null;
  readonly compedAt: string | null;
}

interface Gift {
  readonly id: string;
  readonly kind: "plan" | "credits";
  readonly planId: string | null;
  readonly credits: number;
  readonly workspaces: number;
  readonly spent: number;
  readonly until: string | null;
  readonly why: string;
  readonly by: string;
  readonly at: string;
  readonly stoppedAt: string | null;
  /** ⚠️ Which of the three ways it ended, or `null` while it is live. */
  readonly over: "stopped" | "lapsed" | "spent" | null;
}

interface Answer {
  readonly account: {
    readonly id: string; readonly email: string;
    readonly name: string | null; readonly at: string;
  } | null;
  readonly email: string;
  readonly tenants: readonly Belongs[];
  readonly gifts: readonly Gift[];
  readonly commercial: {
    readonly granted: number; readonly used: number; readonly left: number;
    readonly bare?: number;
  };
  readonly plans?: readonly PlanSpec[];
}

const OVER: Readonly<Record<string, string>> = {
  stopped: "Stopped", lapsed: "Ended", spent: "Used",
};

export function OneAccount({ email, onGo }: {
  readonly email: string;
  readonly onGo: (tenantId: string) => void;
}) {
  const of = useLoad<Answer>("op.account", { email });
  const reader = useShown();

  return (
    <Screen
      shape="detail"
      title={email}
      of={of.of}
      again={of.again}
      waiting={<RowsWaiting rows={5} />}
      then={(data) => (
        <>
          {/*
            ⚠️ AN ADDRESS WITH NO ACCOUNT SAYS SO, AND THE ACTIONS STAY. This is
            the state a gift is usually made in — somebody who has not signed in
            yet — so a screen that refused, or that hid the one thing an operator
            came to do, would be closed exactly when the feature is being used.
          */}
          <Group label="Who">
            {data.account
              ? (
                <>
                  <Identity
                    face={whoFace(data.account.id)}
                    name={data.account.name || data.account.email}
                    under={data.account.name ? data.account.email : undefined}
                  />
                  <FieldRow
                    label="Signed up"
                    value={sayDate(reader, data.account.at as Instant, "long")}
                  />
                </>
              )
              : (
                <Nothing
                  icon={glyphOf("people")}
                  says="Nobody has signed in as this address"
                  under="What is given now waits for them"
                />
              )}
          </Group>

          {/*
            ⚠️ THE TWO GIVING ACTIONS SIT ABOVE WHAT THEY PRODUCE, because an
            operator arrives here to DO one of them. Reading what somebody
            already holds is what the lists below are for.
          */}
          <Group
            label="Give"
            under="Nothing here is charged, and no card is involved"
            does={(
              <Cluster space="snug">
                <GivePlan
                  email={data.email}
                  plans={data.plans ?? []}
                  onDone={of.again}
                />
                <GiveCredits email={data.email} onDone={of.again} />
              </Cluster>
            )}
          >
            <FieldRow
              label="Businesses they may open"
              value={data.commercial.left === 0 ? "None left" : String(data.commercial.left)}
              under={`${data.commercial.used} of ${data.commercial.granted} used`}
            />
          </Group>

          <Group label="Given">
            {data.gifts.length
              ? data.gifts.map((gift) => (
                <AmountRow
                  key={gift.id}
                  label={gift.kind === "plan"
                    ? `${sentence(gift.planId ?? "a plan")}${
                      gift.workspaces > 1 ? ` × ${gift.workspaces}` : ""}`
                    : "Credits"}
                  /* ⚠️ WHY, AND WHO SAID SO. A gift with nothing explaining it is
                     the one row nobody can reconstruct — and the operator who
                     made it is the person the next one has to ask. */
                  under={`${gift.why} · ${gift.by}${
                    gift.until ? ` · until ${sayDate(reader, gift.until as Instant, "short")}` : ""}`}
                  amount={gift.kind === "credits"
                    ? <Credits value={gift.credits} />
                    : `${gift.spent} of ${gift.workspaces}`}
                  /* ⚠️ THE VERDICT GOES IN `mark`, BEFORE THE AMOUNT, so the
                     amounts stay in a column — it is on some rows and not
                     others, which is what `mark` is for. */
                  {...(gift.over
                    ? {
                      mark: (
                        <Chip variant="soft"><Chip.Label>{OVER[gift.over]}</Chip.Label></Chip>
                      ),
                    }
                    : {})}
                  aside={gift.over
                    ? undefined
                    : <StopGift gift={gift} onDone={of.again} />}
                />
              ))
              : (
                <Nothing
                  icon={glyphOf("star")}
                  says="Nothing has been given to this address"
                />
              )}
          </Group>

          <Group label="Where they are">
            {data.tenants.length
              ? data.tenants.map((t) => (
                <AmountRow
                  key={t.id}
                  face={placeFace(t.slug)}
                  label={t.name}
                  under={[
                    t.role ? sentence(t.role) : "Waiting to be claimed",
                    t.slug,
                  ].join(" · ")}
                  amount={t.planId ? sentence(t.planId) : "—"}
                  {...(t.compedAt
                    ? { mark: <Chip variant="soft"><Chip.Label>Given</Chip.Label></Chip> }
                    : {})}
                  onOpen={() => onGo(t.id)}
                />
              ))
              : (
                <Nothing
                  icon={glyphOf("workspace")}
                  says="They are not in any workspace"
                  under="A plan given now lands on the first one they make"
                />
              )}
          </Group>
        </>
      )}
    />
  );
}

/* ------------------------------------------------------------------- give --- */

/**
 * GIVING A PLAN, WHICH IS A COUNT OF WORKSPACES AND NOT A SWITCH.
 *
 * ⚠️ "THEY MAY HAVE MAX" CANNOT BE TAKEN BACK from a workspace already founded
 * on it; "two more workspaces at Max" simply runs out. The same argument the
 * commercial allowance is built on, one level up — and it is what makes a demo
 * account and a partner deal the same mechanism.
 *
 * ⚠️ AND THE TERM IS OPTIONAL BECAUSE MOST GIFTS HAVE NONE. Friends and family
 * are open-ended; a year of cash and a fortnight of demo are not. A required
 * date would make the commonest case a far-future year somebody types in.
 */
function GivePlan({ email, plans, onDone }: {
  readonly email: string;
  readonly plans: readonly PlanSpec[];
  readonly onDone: () => void;
}) {
  const [plan, setPlan] = useState("");
  const [workspaces, setWorkspaces] = useState<number | undefined>(1);
  const [until, setUntil] = useState("");
  const [why, setWhy] = useState("");

  const give = async () => {
    const out = await api.post("op.account.give", {
      email, kind: "plan", plan, workspaces, until: until || null, why,
    });
    if (!out.ok) { notice.fail(out.problem.title); return; }
    notice.ok(`${email} can open ${workspaces === 1 ? "a workspace" : `${workspaces} workspaces`} on ${
      plans.find((p) => p.id === plan)?.name ?? plan}.`);
    setPlan("");
    setWhy("");
    setUntil("");
    onDone();
  };

  return (
    <Tray
      trigger={<Button variant="secondary">Give a workspace</Button>}
      title="Give a workspace"
      actions={
        <Button
          slot="close"
          variant="primary"
          isDisabled={!plan || !why.trim() || !(workspaces && workspaces > 0)}
          onPress={() => void give()}
        >
          Give it
        </Button>
      }
    >
      <Stack space="roomy">
        {/* ⚠️ THE PRICE AND THE CREDITS ARE ON EVERY ROW, because an operator is
            choosing what to give away and those are the two numbers that decide
            it — the two a bare picker would hide. */}
        <Choice
          label="Which plan"
          value={plan}
          onChange={setPlan}
          options={[...plans].sort((a, b) => a.order - b.order).map((p) => ({
            id: p.id,
            label: p.name,
            /* ⚠️ `isBusiness`, NOT A COMPARISON. Which kinds are businesses is
               the kernel's one answer — see `workspace.test.mjs`. */
            help: `${p.credits} credits a month · ${isBusiness(p.kind) ? "a business" : "personal"}`,
          }))}
        />
        <NumberInput
          label="How many workspaces"
          value={workspaces}
          min={1}
          onChange={setWorkspaces}
        />
        {/* ⚠️ CLEARED IS EMPTY AND EMPTY IS FOR EVER — see `Gift.until`. The
            control answers `null` when somebody clears it, and that is the
            common case rather than a missing value. */}
        <DateInput
          label="Until"
          onChange={(iso) => { setUntil(iso ?? ""); }}
          help="Leave it empty for no end."
        />
        <TextInput
          label="Why"
          value={why}
          onChange={setWhy}
          help="Paid cash, a friend, a demo — whoever reads this next is you."
        />
      </Stack>
    </Tray>
  );
}

/**
 * ⚠️ CREDITS GIVEN TO A PERSON LAND IN A WORKSPACE'S WALLET, because there is no
 * personal one — a balance belongs to the place that spends it. They wait until
 * there is a workspace, and the first one founded takes them.
 */
function GiveCredits({ email, onDone }: {
  readonly email: string;
  readonly onDone: () => void;
}) {
  const [credits, setCredits] = useState<number | undefined>(undefined);
  const [why, setWhy] = useState("");

  const give = async () => {
    const out = await api.post("op.account.give", { email, kind: "credits", credits, why });
    if (!out.ok) { notice.fail(out.problem.title); return; }
    notice.ok(`${credits} credits are waiting for ${email}.`);
    setCredits(undefined);
    setWhy("");
    onDone();
  };

  return (
    <Tray
      trigger={<Button variant="secondary">Give credits</Button>}
      title="Give credits"
      actions={
        <Button
          slot="close"
          variant="primary"
          isDisabled={!(credits && credits > 0) || !why.trim()}
          onPress={() => void give()}
        >
          Give them
        </Button>
      }
    >
      <Stack space="roomy">
        <NumberInput label="Credits" value={credits} min={1} onChange={setCredits} />
        <TextInput
          label="Why"
          value={why}
          onChange={setWhy}
          help="This is what they will read on their own statement."
        />
      </Stack>
    </Tray>
  );
}

/**
 * ⚠️ STOPPING ONE ENDS WHAT IS LEFT AND TAKES BACK NOTHING. A workspace already
 * founded on a gift keeps its plan — you cannot un-give a business somebody has
 * been running — and the row stays, because "they were given three and I stopped
 * it after two" has to be answerable afterwards.
 */
function StopGift({ gift, onDone }: {
  readonly gift: Gift;
  readonly onDone: () => void;
}) {
  const stop = async () => {
    const out = await api.post("op.account.give.stop", { gift: gift.id });
    if (!out.ok) { notice.fail(out.problem.title); return; }
    notice.ok("Stopped. What was already given stays.");
    onDone();
  };

  return (
    <Button variant="ghost" onPress={() => void stop()}>Stop</Button>
  );
}

/**
 * THE PRICE LIST — what this deployment sells, and the numbers an operator may move.
 *
 * ⚠️ TWO LAYERS ON ONE SCREEN, AND SAYING WHICH IS THE WHOLE POINT. What the code
 * declares is the authority for which plans exist and which keys each one prices;
 * what is stored over it is somebody's edit. A screen showing only the current
 * numbers cannot offer "back to what the code says", which is the one action every
 * editable-configuration surface needs.
 *
 * ⚠️ AND THE COUNT COMES FIRST, BEFORE THE FIELD. Cutting a limit is a different
 * decision at three customers and at three hundred — so the row says how many are
 * on the tier, and the sheet says again, beside the number being cut.
 *
 * ⚠️ A REFUSAL IS THE BUILD'S REFUSAL. The same `refuseCatalog` CI runs, reported
 * rather than corrected: a console that quietly clamped a lobby back under the
 * floor would be deciding a price on the operator's behalf.
 */

import { useState } from "react";
import { sayNumber } from "@engine/kernel";
import { Button, Chip } from "@heroui/react";
import {
  AmountRow, Await, Credits, Group, Money, NoteRow, NumberInput, RowsWaiting, Screen, Stack,
  TYPE, Tray, notice, useMoney, useShown,
} from "@engine/design";
import type { Allowance, EntitlementDef } from "@engine/kernel";
import { api } from "../api.js";
import { useLoad } from "../centre/data.js";

/* ⚠️ The shape `op.plans` answers with. Hand-written beside the call, like every
   other load in this surface — see `data.tsx`. */
interface PlanLine {
  readonly id: string;
  readonly name: string;
  readonly said: string;
  readonly price: number;
  readonly currency: string;
  readonly credits: number;
  readonly trialDays?: number;
  readonly parking?: boolean;
  readonly kind: string;
  readonly includes: Readonly<Record<string, Allowance>>;
}

interface CatalogueAnswer {
  readonly declared: readonly PlanLine[];
  readonly sold: readonly PlanLine[];
  readonly edits: readonly { readonly planId: string; readonly at: string; readonly by: string | null }[];
  readonly on: Readonly<Record<string, number>>;
  readonly keys: Readonly<Record<string, EntitlementDef>>;
  readonly problems: readonly { readonly why: string; readonly detail: string }[];
}

/* ⚠️ A number an operator typed, beside the one the code declares. `—` for
   unlimited would be a lie; `-1` is what the field takes and what the walk
   compares, so it is what the row shows. */
const shown = (v: Allowance | undefined): string =>
  v === undefined ? "—" : v === -1 ? "Unlimited" : v === false ? "Off" : v === true ? "On" : String(v);

export function Catalogue() {
  const of = useLoad<CatalogueAnswer>("op.plans");

  return (
    /* ⚠️ THE SENTENCE IS THE SCREEN'S, NOT A CARD'S. It was a `Group` labelled
       "Plans" under a crown that already says "Price list" — the same word
       twice, with the one fact that matters (which plans exist is not editable
       here) as a card's subtitle rather than the page's. */
    <Screen
      shape="settings"
      under="Prices and limits. Which plans exist is decided in the code"
    >
      <Await
        of={of.of}
        waiting={<RowsWaiting rows={4} />}
        again={of.again}
        then={(now) => <Rows now={now} again={of.again} />}
      />
    </Screen>
  );
}

function Rows({ now, again }: { readonly now: CatalogueAnswer; readonly again: () => void }) {
  const reader = useShown();
  const declaredBy = new Map(now.declared.map((p) => [p.id, p]));
  const edited = new Set(now.edits.map((e) => e.planId));
  /* ⚠️ THE ROW OPENS THE EDITOR, so the tray is controlled and there is no
     button. A plan carried an "Edit" trigger whose LABEL became "Edited" once
     one had been made — a state wearing a control, so the one row somebody had
     changed was the one whose button said something else. The state is a chip
     and the press is the row. */
  const [editing, setEditing] = useState<string | null>(null);
  const open = now.sold.find((p) => p.id === editing) ?? null;

  const reset = async (id: string) => {
    const out = await api.post("op.plan.reset", { plan: id });
    if (!out.ok) { notice.fail(out.problem.title); return; }
    const held = (out.value as { held: number }).held;
    notice.ok(held
      ? `Back to what the code says. ${held} workspace${held === 1 ? "" : "s"} kept what they had.`
      : "Back to what the code says.");
    again();
  };

  return (
    <Stack space="roomy">
      {/*
        ⚠️ WHY THE EDITS ARE NOT BEING SERVED, WHEN THEY ARE NOT. The fallback to
        the declaration is correct and silent — an operator would otherwise see
        their own numbers ignored with nothing anywhere saying so.
      */}
      {now.problems.length
        ? (
          <Group label="These edits are not being served" under="The declaration is what customers see until this is fixed">
            {now.problems.map((p) => (
              <NoteRow key={`${p.why}:${p.detail}`}>{p.detail}</NoteRow>
            ))}
          </Group>
        )
        : null}

      <Group>
        {now.sold.map((plan) => (
          <AmountRow
            key={plan.id}
            label={plan.name}
            /* ⚠️ WHAT A MONTH BUYS, WHICH IS THE OTHER HALF OF A PRICE. The row
               carried the plan's own sentence and how many were on it, and the
               credits — the number every plan differs by — sat behind the
               sheet. A price list where the allowance is not on the row is a
               list of names and amounts. */
            under={[
              plan.parking ? "The lobby, and nobody chooses it"
                : `${sayNumber(reader, plan.credits)} credits a month`,
              now.on[plan.id] ? `${now.on[plan.id]} on it` : "",
            ].filter(Boolean).join(" · ")}
            /* ⚠️ `label`, NOT `figure`. A figure is the one number a screen is
               about; four of them in one card is four headlines, and measured
               the price was twice the size of the plan's own name. */
            amount={<Money minor={plan.price} currency={plan.currency} size="label" />}
            /* ⚠️ ONE CHIP IN THE CORNER, AND ONLY WHERE THERE IS ONE. Two of
               them stacked at a phone's width and pushed the price into the
               name; a plan's allowance and how many are on it are both facts
               ABOUT the plan and belong on its line, while "somebody has edited
               this over the code" is the exception and is what the corner is
               for. */
            mark={edited.has(plan.id)
              ? <Chip variant="soft"><Chip.Label>Edited</Chip.Label></Chip>
              : undefined}
            onOpen={() => setEditing(plan.id)}
          />
        ))}
      </Group>

      {open ? (
        <EditTray
          /* ⚠️ KEYED, so opening a second plan does not inherit the first one's
             half-typed number. */
          key={open.id}
          plan={open}
          declared={declaredBy.get(open.id)}
          keys={now.keys}
          on={now.on[open.id] ?? 0}
          edited={edited.has(open.id)}
          onReset={() => void reset(open.id)}
          onDone={again}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </Stack>
  );
}

/**
 * ⚠️ A SHEET, BECAUSE TYPING A PRICE IS A STEP RATHER THAN A TOGGLE. Same shape
 * as the workspace adjustment beside it: the rows say what is set, the field
 * below writes one of them.
 */
function EditTray({ plan, declared, keys, on, edited, onReset, onDone, onClose }: {
  readonly plan: PlanLine;
  readonly declared: PlanLine | undefined;
  readonly keys: Readonly<Record<string, EntitlementDef>>;
  readonly on: number;
  readonly edited: boolean;
  readonly onReset: () => void;
  readonly onDone: () => void;
  readonly onClose: () => void;
}) {
  const say = useMoney();
  const reader = useShown();
  const [price, setPrice] = useState<number | undefined>(undefined);
  const [credits, setCredits] = useState<number | undefined>(undefined);
  const [key, setKey] = useState<string>("");
  const [limit, setLimit] = useState<number | undefined>(undefined);

  const sellable = Object.entries(keys).filter(([, d]) => !d.reserved);

  const write = async () => {
    const edit: Record<string, unknown> = {};
    if (price !== undefined) edit.price = Math.round(price * 100);
    if (credits !== undefined) edit.credits = credits;
    if (key && limit !== undefined) edit.includes = { [key]: limit };
    if (!Object.keys(edit).length) { notice.fail("Nothing to save."); return; }

    const out = await api.post("op.plan.edit", { plan: plan.id, edit });
    if (!out.ok) { notice.fail(out.problem.title); return; }
    const held = (out.value as { held: number }).held;
    /* ⚠️ THE GRANDFATHERING IS REPORTED RATHER THAN ASSUMED. An operator who
       narrows a tier needs to be told how many people were held at what they
       bought — otherwise the safest thing this product does is invisible. */
    notice.ok(held
      ? `Saved. ${held} workspace${held === 1 ? "" : "s"} kept what they were sold.`
      : "Saved.");
    setPrice(undefined); setCredits(undefined); setLimit(undefined); setKey("");
    onDone();
    onClose();
  };

  return (
    <Tray
      isOpen
      onOpenChange={(is) => { if (!is) onClose(); }}
      title={plan.name}
      actions={<Button slot="close" variant="primary" onPress={() => void write()}>Save</Button>}
    >
      <Stack space="roomy">
        {/* ⚠️ WHO THIS LANDS ON, BESIDE THE FIELD THAT MOVES IT. */}
        <NoteRow>
          {on
            ? `${on} workspace${on === 1 ? "" : "s"} on this plan. Anything you cut, they keep.`
            : "Nobody is on this plan yet."}
        </NoteRow>

        <Group label="Price and allowance">
          <AmountRow
            label="A month"
            under={declared && declared.price !== plan.price
              ? `The code says ${say(declared.price, plan.currency)}` : undefined}
            /* ⚠️ `label`, NOT `figure`. A figure is the one number a screen is
               about; four of them in one card is four headlines, and measured
               the price was twice the size of the plan's own name. */
            amount={<Money minor={plan.price} currency={plan.currency} size="label" />}
          />
          <AmountRow
            label="Credits a month"
            under={declared && declared.credits !== plan.credits
              ? `The code says ${sayNumber(reader, declared.credits)}` : undefined}
            amount={<Credits value={plan.credits} as="figure" />}
          />
        </Group>

        <NumberInput
          label="New price a month"
          value={price}
          onChange={setPrice}
          min={0}
          help="Dollars. The lobby must stay at zero."
        />
        <NumberInput
          label="New credits a month"
          value={credits}
          onChange={setCredits}
          min={0}
        />

        {/*
          ⚠️ EVERY KEY IS A ROW WITH ITS OWN NUMBER, rather than a picker and a
          field. The operator is looking for the one that is wrong, and a select
          hides the other thirteen behind the fourteenth.
        */}
        <Group label="What it includes">
          {sellable.map(([id, def]) => (
            <AmountRow
              key={id}
              label={def.label}
              under={id === key
                ? "changing this one"
                : declared && declared.includes[id] !== plan.includes[id]
                  ? `The code says ${shown(declared.includes[id])}`
                  : undefined}
              amount={shown(plan.includes[id])}
              aside={<Button variant="ghost" onPress={() => setKey(id)}>Change</Button>}
            />
          ))}
        </Group>
        {key
          ? (
            <NumberInput
              label={`New number for ${keys[key]?.label ?? key}`}
              value={limit}
              onChange={setLimit}
              help="-1 is unlimited."
            />
          )
          : null}

        {/* ⚠️ THE WAY BACK, AND IT GRANDFATHERS TOO — a declaration that moved
            down since the edit makes reverting a cut like any other. */}
        {edited
          ? (
            <Stack space="tight">
              <span className={TYPE.note}>Edited over the code.</span>
              <Button variant="secondary" onPress={onReset}>Back to what the code says</Button>
            </Stack>
          )
          : null}
      </Stack>
    </Tray>
  );
}

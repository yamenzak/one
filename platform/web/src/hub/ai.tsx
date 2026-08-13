/**
 * A WORKSPACE'S AI SETTINGS — discovered, never written down.
 *
 * ⚠️ NOTHING HERE NAMES AN ACTION. `ai.models.list` walks the product's manifest,
 * so an action added to a product appears on this screen and one removed stops
 * appearing — which is the same rule `declared.tsx` follows for settings, and it
 * exists for the same reason. A hand-written list of a product's AI features is
 * a list that goes out of date in the direction nobody notices: an action added
 * and not listed is one nobody can configure, on a screen that looks complete.
 *
 * ⚠️ AND NOTHING HERE NAMES A MODEL EITHER. What a workspace may pick is decided
 * by four layers — the deployment's catalogue, what the operator has in service,
 * what the region permits, and what the action's lane needs — and every one of
 * them is server-side. A screen that offered a list of its own would offer
 * something the save would refuse.
 *
 * ⚠️ THE SYSTEM PROMPT IS NOT EDITABLE HERE, DELIBERATELY. It is what makes an
 * action do what the product promises; a workspace that could rewrite it could
 * turn a nutrition assistant into anything at all with the product's name still
 * on the answer. What a workspace legitimately decides is what it wants
 * mentioned — and that goes in front of the request, where it is measured and
 * paid for like any other words.
 */

import { useState, type ElementType, type ReactNode } from "react";
import type { Problem } from "@one/kernel";
import { Pill } from "../capsule.js";
import { Choose } from "../choose.js";
import { Blank, Card, Item, Unset, Waiting } from "../list.js";
import { Screen, Section, Title } from "../screen.js";
import { ValueEditor, type EditableField } from "../editor.js";

/** One AI action, as `ai.models.list` answers. */
export interface Action {
  readonly action: string;
  readonly summary: string;
  readonly lane: string;
  /** Every model this workspace may pick, after every layer. */
  readonly options: readonly { readonly id: string; readonly provider: string }[];
  /** ⚠️ Null where nothing is eligible — then `why` says which layer refused. */
  readonly inEffect: string | null;
  readonly decidedBy: "catalogue" | "workspace" | null;
  readonly why: string | null;
  /** ⚠️ True where this workspace's pick is no longer offered. */
  readonly stale: boolean;
  /**
   * ⚠️ WHETHER THE PRODUCT ASKED FOR THE DEAR ONE. An action that costs several
   * times what its neighbours do otherwise reads as a model somebody chose
   * badly, when what happened is that the product said this one has to be good.
   */
  readonly prefer?: "cheapest" | "capable";
  readonly prompt: string;
}

export interface AiProps {
  /** ⚠️ Null until known — a screen showing "no actions" while fetching is a lie. */
  readonly actions: readonly Action[] | null;
  readonly onChoose: (action: string, model: string | null) => Promise<Problem | null>;
  readonly onPrompt: (action: string, prompt: string) => Promise<Problem | null>;
  /** ⚠️ Absent means this person may read but not change. Shown either way. */
  readonly mayWrite?: boolean;
  readonly onBack: () => void;
  readonly Heading?: ElementType;
}

/**
 * ⚠️ WHY NOTHING RUNS, IN WORDS SOMEBODY CAN ACT ON. "none_in_lane" and
 * "none_permitted" are different problems with different owners: one is an
 * operator who has not added a model, the other is a residency decision to
 * accept. A single "unavailable" makes both the same shrug — which is exactly
 * what this used to be.
 */
export const refusalOf = (why: string): string =>
  why === "none_in_lane" ? "Nothing on this deployment can do this yet"
    : why === "none_permitted" ? "No model this workspace's region permits can do this"
      : "This product no longer has this action";

/** ⚠️ The lane in the words of whoever reads it. An unknown one prints itself. */
export const laneOf = (lane: string): string =>
  ({ text: "Words", vision: "Reads a picture", image: "Draws", speech: "Speaks", transcribe: "Listens", video: "Video" })[lane] ?? lane;

export function AiScreen({ actions, onChoose, onPrompt, mayWrite = false, onBack, Heading = "h1" }: AiProps): ReactNode {
  /* ⚠️ One piece of state for the screen, because only one sheet is ever open. */
  const [picking, setPicking] = useState<Action | null>(null);
  const [editing, setEditing] = useState<EditableField | null>(null);

  return (
    <Screen leave="up" onLeave={onBack} name="AI" sky="silk"
      title={<Title as={Heading}>AI</Title>}
      lede="What this workspace asks a model for, which model answers, and what it says first."
    >
      {actions === null ? <Section><Waiting rows={4} /></Section> : actions.length === 0 ? (
        <Section>
          <Blank title="This product asks no model anything">
            Nothing here generates, so there is nothing to configure.
          </Blank>
        </Section>
      ) : (
        actions.map((a) => (
          <Section key={a.action} name={a.summary}>
            <Card>
              <Item
                title="Model"
                detail={
                  <>
                    {laneOf(a.lane)}
                    {/*
                      ⚠️ A PICK THAT IS NO LONGER OFFERED IS SAID, not shown as
                      though it were running. It is the state an operator's switch
                      or a region's allow-list creates silently, months later —
                      and without this the only symptom is an answer that changed.
                    */}
                    {a.stale ? <Pill tone="warn">Your choice is no longer offered</Pill> : null}
                    {a.decidedBy === "catalogue" && !a.stale ? <Pill tone="quiet">Chosen for you</Pill> : null}
                    {a.prefer === "capable" ? <Pill tone="quiet">Uses the best available</Pill> : null}
                  </>
                }
                {...(mayWrite && a.options.length > 0 ? { onGo: () => setPicking(a) } : {})}
                {...(mayWrite && a.options.length > 0 ? {} : {
                  action: a.inEffect
                    ? <span className="value">{a.inEffect}</span>
                    : <Unset>{refusalOf(a.why ?? "")}</Unset>,
                })}
              />
              {/*
                ⚠️ WHEN IT IS PRESSABLE THE VALUE MOVES TO THE DETAIL, because a
                row goes somewhere or carries something on the right and never
                both — put right beside an `onGo`, the value is silently dropped
                AND the row stops opening.
              */}
              {mayWrite && a.options.length > 0 ? (
                <Item title="Running" detail={a.inEffect ?? refusalOf(a.why ?? "")} />
              ) : null}
              <Item
                title="What to mention first"
                detail={a.prompt ? a.prompt : "Nothing — the product's own wording only"}
                {...(mayWrite ? {
                  onGo: () => setEditing({
                    name: a.action, kind: "text", title: "What to mention first",
                    label: "Said in front of every request",
                    lede: "Your own words, added before what somebody asks. The product's own instructions are not editable.",
                    value: a.prompt,
                  } as EditableField),
                } : {})}
              />
            </Card>
          </Section>
        ))
      )}

      {/*
        ⚠️ ONE SHEET, FOR THE OPEN ACTION ONLY. One per action would mount a
        dialog per row, each with its own focus trap waiting to be the wrong one.
      */}
      {picking ? (
        <Choose
          open
          title={picking.summary}
          options={[
            /* ⚠️ "Choose for me" is a real option rather than an absence, because
               going back to the deployment's own pick has to be expressible. */
            { value: "", label: "Choose for me", detail: "Whichever costs least and can do this" },
            ...picking.options.map((m) => ({ value: m.id, label: m.id, detail: m.provider })),
          ]}
          value={picking.decidedBy === "workspace" ? picking.inEffect ?? "" : ""}
          onPick={(next) => onChoose(picking.action, next || null)}
          onClose={() => setPicking(null)}
        />
      ) : null}

      <ValueEditor
        field={editing}
        onSave={(name, value) => onPrompt(name, value)}
        onClose={() => setEditing(null)}
      />
    </Screen>
  );
}

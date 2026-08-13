/**
 * WHAT A WORKSPACE LETS ITS PRODUCT SAY ON ITS BEHALF.
 *
 * ⚠️ TWO LEVELS, AND THIS IS THE CEILING. A studio that does not want its clients
 * emailed about every published programme is making a decision about its own
 * business; a person then chooses within what is left. The other order does not
 * work — somebody cannot opt into a channel their workspace has turned off,
 * because the switch would do nothing and say nothing.
 *
 * ⚠️ NOTHING HERE NAMES A NOTIFICATION. The list is the product's registry, so a
 * type it adds appears on this screen and one it removes stops appearing — the
 * same rule the settings screen follows, and it exists because a hand-written
 * list goes out of date in the direction nobody notices.
 *
 * ⚠️ AND THE PERMISSION IS ON THE ROW. "Why does the front desk get this" is the
 * question a two-level screen creates, and the answer is that the audience is
 * whoever holds the key — including roles this workspace composed itself, which
 * the product has never heard of.
 */

import { useState, type ElementType, type ReactNode } from "react";
import type { Problem } from "@one/kernel";
import { Pill } from "../capsule.js";
import { Card, Item, Unset, Waiting } from "../list.js";
import { Screen, Section, Title } from "../screen.js";
import { Sheet } from "../sheet.js";
import { SwitchRow } from "../switch.js";
import { Button } from "../button.js";
import { useCommit } from "../commit.js";
import { categoryOf, iconFor } from "./inbox.js";

/** One type and what this workspace allows — as `notify.policy` answers. */
export interface Policy {
  readonly type: string;
  readonly category: string;
  readonly icon: string;
  readonly title: string;
  readonly roles: readonly string[];
  readonly needs: string;
  /**
   * ⚠️ THE ONE THE WORKSPACE MAY NOT TOUCH, SAID OUT LOUD. `action` means nothing
   * proceeds until somebody does something, so a missing switch has a reason on
   * the screen rather than looking like a rendering fault.
   */
  readonly required: boolean;
  readonly off: boolean;
  /** ⚠️ Null is the product's own default, never "none". */
  readonly channels: readonly string[] | null;
}

export interface NoticePolicyProps {
  /** ⚠️ Null until known. */
  readonly rows: readonly Policy[] | null;
  /** What the DEPLOYMENT can deliver. A channel not in it is never offered. */
  readonly channels: readonly string[];
  readonly onSet: (type: string, policy: { off?: boolean; channels?: readonly string[] }) => Promise<Problem | null>;
  readonly onClear: (type: string) => Promise<Problem | null>;
  /** ⚠️ Absent means read-only, which is the ordinary case for most members. */
  readonly mayWrite?: boolean;
  readonly onBack: () => void;
  readonly Heading?: ElementType;
}

export const CHANNEL_NAMES: Readonly<Record<string, string>> = {
  inbox: "Notifications", email: "Email", push: "Devices",
};

/** ⚠️ What a row is doing now, in one line. `null` channels is the product's own. */
export const allowingSaid = (row: Policy, channels: readonly string[]): string => {
  if (row.off) return "Off";
  const on = row.channels ?? channels;
  const beyond = on.filter((c) => c !== "inbox").map((c) => CHANNEL_NAMES[c] ?? c);
  return beyond.length === 0 ? "Notifications only" : `Notifications and ${beyond.join(" and ")}`;
};

function PolicySheet({ row, channels, onSet, onClear, onClose }: {
  readonly row: Policy;
  readonly channels: readonly string[];
  readonly onSet: NoticePolicyProps["onSet"];
  readonly onClear: NoticePolicyProps["onClear"];
  readonly onClose: () => void;
}): ReactNode {
  const [off, setOff] = useState(row.off);
  const [on, setOn] = useState<readonly string[]>(row.channels ?? channels);
  const commit = useCommit(() => onSet(row.type, { off, channels: on }), onClose);
  const reset = useCommit(() => onClear(row.type), onClose);

  return (
    <Sheet open onClose={onClose} dismissible label={row.title}>
      <div className="sheet-body">
        <header className="sheet-top">
          <h2 className="sheet-title">{row.title}</h2>
          <p className="lede">
            {/* ⚠️ WHO GETS IT IS THE HALF THAT IS NOT OBVIOUS, and it is the
                permission rather than the role list — a role a workspace made for
                itself is not in the product's list and is told all the same. */}
            Reaches anybody who may {row.needs}.
          </p>
        </header>

        <Section>
          <Card>
            {/*
              ⚠️ AN `action` HAS NO OFF SWITCH, AND THE ROW SAYS WHY. Nothing
              proceeds until somebody acts on it, and the person who would press
              this is not the person the product then silently stops working for.
            */}
            {row.required ? (
              <Item title="Always sends" detail="Nothing proceeds until somebody acts on this one" />
            ) : (
              <SwitchRow
                title="Send it at all" detail="Off means nobody is told, anywhere"
                on={!off} onChange={(next) => { setOff(!next); commit.reset(); }}
              />
            )}
          </Card>
        </Section>

        <Section name="Where it may go">
          <Card>
            {channels.map((c) => (
              <SwitchRow
                key={c}
                title={CHANNEL_NAMES[c] ?? c}
                /* ⚠️ THE INBOX IS NEVER OPTIONAL. Email can be declined, filtered
                   or sent to an address somebody has left — the record is what
                   makes "I never got that" answerable without a mail provider. */
                detail={c === "inbox" ? "Always. This is the record." : undefined}
                on={c === "inbox" || on.includes(c)}
                disabled={c === "inbox" || off}
                onChange={(next) => {
                  setOn((was) => (next ? [...was, c] : was.filter((x) => x !== c)));
                  commit.reset();
                }}
              />
            ))}
          </Card>
        </Section>

        {commit.state.at === "failed" ? <p className="wrong">{commit.state.problem.detail}</p> : null}
        <Button wide tone="loud" onClick={() => void commit.run()} disabled={commit.state.at === "working"}>
          {commit.state.at === "done" ? "Saved" : "Save"}
        </Button>
        {/* ⚠️ Going back to the product's own behaviour is its own action, because
            "no decision" and "every switch happens to be on" are different states —
            the first follows the product when it changes and the second does not. */}
        {row.channels || row.off ? (
          <Button wide tone="quiet" onClick={() => void reset.run()}>Use the product's own</Button>
        ) : null}
      </div>
    </Sheet>
  );
}

export function NoticePolicyScreen({
  rows, channels, onSet, onClear, mayWrite = false, onBack, Heading = "h1",
}: NoticePolicyProps): ReactNode {
  const [editing, setEditing] = useState<Policy | null>(null);

  return (
    <Screen leave="up" onLeave={onBack} name="Notifications" sky="silk"
      title={<Title as={Heading}>Notifications</Title>}
      lede="Everything this product can tell the people in your workspace."
    >
      <Section>
        {rows === null ? <Waiting rows={5} /> : (
          <Card>
            {rows.map((row) => {
              const Glyph = iconFor(row.icon);
              return (
                <Item
                  key={row.type}
                  icon={<Glyph />}
                  title={row.title}
                  detail={
                    <>
                      {categoryOf(row.category)}
                      {/* ⚠️ Only a row that was MOVED is tagged. A badge on every
                          line is texture; a badge on the two somebody changed is
                          the answer to "what have we altered here". */}
                      {row.off ? <Pill tone="warn">Off</Pill>
                        : row.channels ? <Pill tone="quiet">Changed</Pill> : null}
                    </>
                  }
                  {...(mayWrite ? { onGo: () => setEditing(row) } : {})}
                  action={mayWrite ? undefined : <span className="value">{allowingSaid(row, channels)}</span>}
                />
              );
            })}
          </Card>
        )}
      </Section>

      {rows !== null && rows.length === 0 ? (
        <Section>
          <Card><Item title="This product tells nobody anything" detail="There is nothing to allow yet" /></Card>
        </Section>
      ) : null}

      {!mayWrite ? (
        <Section>
          <Card>
            <Item title="You may read this and not change it" detail={<Unset>Ask an administrator</Unset>} />
          </Card>
        </Section>
      ) : null}

      {editing ? (
        <PolicySheet
          row={editing} channels={channels} onSet={onSet} onClear={onClear}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </Screen>
  );
}

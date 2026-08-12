/**
 * DOWNLOAD YOUR DATA — everything this platform holds about one person.
 *
 * ⚠️ THE ROW OFFERING THIS EXISTED BEFORE THE SCREEN DID, and before the
 * operation did. The account home has said "Download your data · Everything we
 * hold about you" since it was written, and the only export in the product wanted
 * `workspace:close` — a permission an ordinary member does not have, about records
 * that are mostly not theirs. A promise on a settings row with nothing behind it
 * is the failure this whole platform is a reaction to, on the one subject where a
 * person has a legal right to the answer.
 *
 * ⚠️ IT SAYS WHAT IS IN IT BEFORE IT IS ASKED FOR, AND THE LIST IS THE ANSWER'S
 * OWN. Every table name in it comes from the export the server actually produced —
 * so a table that stops being included stops being listed, rather than being
 * described here forever by a paragraph nobody re-reads.
 *
 * ⚠️ AND IT SAYS WHAT IS NOT IN IT. `dropped` is the platform admitting which
 * declared tables it could not read, and printing the file without it is the exact
 * omission that makes an export dangerous: it arrives, it is full of somebody's
 * data, and nothing in it says what is missing.
 *
 * ⚠️ NOT A SHEET AND NOT A CONFIRM. Nothing is destroyed and nothing is
 * irreversible — asking "are you sure you want your own data" is a product being
 * reluctant about a right.
 */

import { useState, type ElementType, type ReactNode } from "react";
import type { Instant, Problem } from "@one/kernel";
import { Button } from "../button.js";
import { Save, Tick } from "../icon.js";
import { Card, Entry } from "../list.js";
import { Screen, Section, Title } from "../screen.js";

/**
 * ⚠️ EXACTLY WHAT `exit.account.export` ANSWERS WITH. Named here so the screen
 * cannot describe a shape the operation does not send — the failure the wire guard
 * exists for, one module over.
 */
export interface Taken {
  readonly at: Instant;
  /** Table name to rows. The list of names IS the list of what is included. */
  readonly tables: Readonly<Record<string, readonly unknown[]>>;
  /** ⚠️ What a declaration promised and the read could not produce. */
  readonly dropped: readonly string[];
  readonly account: Readonly<Record<string, unknown>>;
  readonly workspaces: readonly { readonly name: string }[];
}

export interface ExportScreenProps {
  /** ⚠️ `null` is "not asked for yet", which is where this screen starts. */
  readonly taken: Taken | null;
  /** Asks the server for it. The screen never assembles a file itself. */
  readonly onTake: () => Promise<Problem | null>;
  /** Hands the answer to the browser. Absent until there is something to save. */
  readonly onSave?: () => void;
  readonly onBack: () => void;
  readonly Heading?: ElementType;
}

/**
 * ⚠️ A COUNT PER TABLE, NOT A LIST OF ROWS. Somebody checking whether their
 * records are all there counts; somebody reading them opens the file. Rendering
 * the rows would put every fact this platform holds on a screen that can be shown
 * to whoever is standing behind them.
 */
const rows = (n: number): string => `${n} ${n === 1 ? "record" : "records"}`;

/**
 * ⚠️ A TABLE NAME IS A DATABASE WORD, and this is the one place the interface has
 * to print one. It is what the export FILE calls it — so somebody matching the
 * screen against the file has one vocabulary rather than two, and a prettier name
 * here would be a translation nothing in the file agrees with.
 */
export function ExportScreen({ taken, onTake, onSave, onBack, Heading = "h1" }: ExportScreenProps): ReactNode {
  const [state, setState] = useState<"idle" | "working" | "done" | "failed">(taken ? "done" : "idle");
  const [problem, setProblem] = useState<Problem | null>(null);

  const take = () => {
    setState("working");
    setProblem(null);
    void onTake().then((why) => {
      setProblem(why);
      setState(why ? "failed" : "done");
    });
  };

  return (
    <Screen leave="up" onLeave={onBack} name="Download your data"
      title={<Title as={Heading}>Download your data</Title>}
      lede="Everything your account holds about you, in one document, whenever you want it."
    >
      <Section>
        {/* ⚠️ WHAT IT COVERS, IN THE PERSON'S OWN TERMS, AND SAID ONCE. Every
            sentence here is about what an account IS rather than about which
            tables exist — the table names arrive below, from the answer. */}
        <p className="note">
          It covers your account itself — how you sign in, what you have agreed to,
          the notifications you have had — and your vault, including who has read
          each fact in it. Records inside a workspace belong to that workspace and
          are exported by whoever runs it.
        </p>
      </Section>

      {taken === null ? null : (
        <>
          <Section name="What is in it">
            <Card className="entries">
              {Object.entries(taken.tables).map(([table, all]) => (
                <Entry key={table} label={table}>{rows(all.length)}</Entry>
              ))}
            </Card>
          </Section>

          {/* ⚠️ WHAT IS NOT IN IT, AND ONLY WHERE THERE IS SOMETHING. A "nothing
              was dropped" row on every successful export is a reassurance that
              trains people to skip the one time it says otherwise. */}
          {taken.dropped.length ? (
            <Section name="What could not be read">
              <Card className="entries">
                {taken.dropped.map((table) => (
                  <Entry key={table} label={table}>Not included</Entry>
                ))}
              </Card>
            </Section>
          ) : null}
        </>
      )}

      <Section>
        {problem ? (
          <p className="note wrong" role="alert">
            <strong>{problem.title}</strong>
            {problem.detail ? <> {problem.detail}</> : null}
            <span className="note-ref">{problem.ref}</span>
          </p>
        ) : null}
        {/* ⚠️ TWO BUTTONS, NEVER ONE THAT CHANGES ITS MIND. Preparing it and saving
            it are different actions with different consequences, and a single
            control that becomes the other after a round trip is how somebody
            presses "download" and gets a second request instead. */}
        <Button
          tone={taken ? "quiet" : "loud"} wide
          data-state={state}
          disabled={state === "working"}
          onClick={take}
          sign={state === "done" ? <Tick className="button-sign" size={21} /> : undefined}
        >
          {state === "working" ? "Gathering"
            : taken ? "Gather it again"
              : problem?.retryable ? "Try again" : "Prepare my data"}
        </Button>
        {taken && onSave ? (
          <Button tone="loud" wide onClick={onSave} sign={<Save size={19} />}>
            Save the file
          </Button>
        ) : null}
      </Section>
    </Screen>
  );
}

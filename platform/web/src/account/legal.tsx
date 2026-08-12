/**
 * CONSENT AND LEGAL — what this product asked you to agree to, and who else
 * receives what it holds.
 *
 * ⚠️ TWO HALVES, AND ONLY ONE OF THEM IS ABOUT AGREEING. The documents are a
 * record: which of these did I accept, on what day, at which version. Below them
 * is the disclosure — who else gets this data, where they process it, and whether
 * any of it goes to a model. A person opening this screen is asking one of those
 * two questions and almost never both, which is why they are sections rather than
 * a single list of legal-looking rows.
 *
 * ⚠️ THE ONLY THING THAT CAN BE PRESSED IS AN OUTSTANDING DOCUMENT. Everything
 * else here reports. A screen about consent whose every row is actionable
 * teaches that agreeing is something you do repeatedly and casually, which is
 * exactly the reflex a consent ledger exists to be evidence against.
 *
 * ⚠️ AND IT IS A RENDERER. Every document, every version, every subprocessor and
 * every region below comes from the manifest — `legal.list` and
 * `protection.list` — so an app declaring a fourth document gets a fourth row
 * without this file being opened. The screen writes no copy about any of them.
 */

import { useState, type ElementType, type ReactNode } from "react";
import type { Problem } from "@one/kernel";
import { Button } from "../button.js";
import { useCommit } from "../commit.js";
import { Paper, Tick } from "../icon.js";
import { Blank, Card, Entry, Item, Waiting } from "../list.js";
import { Screen, Section, Title } from "../screen.js";
import { Stack } from "../stack.js";
import { Disclose } from "../disclose.js";

/**
 * ⚠️ A DOCUMENT AS THE SCREEN TAKES IT — the declaration, plus what this person
 * did about it. `acceptedOn` is a day already spoken by `wire.ts`, and null is
 * "not this version", which is a different thing from "never".
 */
export interface Doc {
  readonly id: string;
  readonly version: string;
  readonly title: string;
  /** The text, where it is short enough to read here. */
  readonly body?: string;
  /** The operative document, where there is one to open. */
  readonly url?: string;
  /** ⚠️ The day THIS version was accepted, or null. Never a boolean — a record
   *  that says only "yes" is the one part of an acceptance nobody disputes. */
  readonly acceptedOn: string | null;
  /** ⚠️ Whether this person still has to. Derived by the kernel from their role,
   *  because the same person is an owner here and somebody's customer there. */
  readonly outstanding: boolean;
}

/** Who else receives what is held, exactly as `protection.list` answers. */
export interface Protection {
  readonly controller: string;
  readonly contact: string;
  readonly subprocessors: readonly {
    readonly name: string;
    readonly purpose: string;
    readonly region: string;
  }[];
  readonly regions: readonly string[];
  /** ⚠️ What is sent to a model, named. A product that infers and does not say
   *  so is the disclosure people most want and least often get. */
  readonly inference: readonly string[];
  readonly transfers: readonly { readonly to: string; readonly basis: string }[];
}

export interface LegalScreenProps {
  /** ⚠️ Null until known. `[]` is "this product declares none", which is a fact. */
  readonly docs: readonly Doc[] | null;
  readonly protection: Protection | null;
  readonly onAccept: (id: string, version: string) => Promise<Problem | null>;
  readonly onBack: () => void;
  readonly Heading?: ElementType;
}

/**
 * ⚠️ AN ACCEPTANCE IS A TAP ON THE DOCUMENT, NEVER A ROW OF BUTTONS. Agreeing
 * without opening is what a checkbox beside a link buys, and it is worth nothing
 * as evidence: the only defensible record is one where the text was on screen.
 * So an outstanding document opens like every other one, and the agreement lives
 * at the bottom of what it says.
 */
export function LegalScreen({
  docs, protection, onAccept, onBack, Heading = "h1",
}: LegalScreenProps): ReactNode {
  const [reading, setReading] = useState<string | null>(null);
  const open = docs?.find((d) => d.id === reading) ?? null;

  return (
    <Stack at={open ? open.id : null}>
      {open
        ? (
          <DocScreen
            doc={open}
            onAccept={() => onAccept(open.id, open.version)}
            onBack={() => setReading(null)}
            Heading={Heading}
          />
        )
        : (
          <Screen leave="up" onLeave={onBack} name="Consent and legal"
            title={<Title as={Heading}>Consent and legal</Title>}
            /* ⚠️ IT SAYS WHAT THE SCREEN IS FOR, not what the words below mean.
               A lede that explains the concept of terms and conditions is one
               nobody reads twice. */
            lede="What you have agreed to, and who else receives what is held here."
          >
            <Section>
              {docs === null
                ? <Waiting />
                : docs.length === 0
                  ? <Blank title="Nothing to agree to">This product asks you to accept no documents.</Blank>
                  : (
                    <Card>
                      {docs.map((d) => (
                        <Item
                          key={d.id}
                          icon={<Paper />}
                          /* ⚠️ AMBER, NOT RED, AND ONLY ON WHAT IS UNFINISHED. Red
                             is what the row that closes an account wears; a document
                             waiting to be read is not that kind of thing, and toning
                             it the same way says it is. */
                          tone={d.outstanding ? "warn" : undefined}
                          title={d.title}
                          detail={said(d) || undefined}
                          onGo={() => setReading(d.id)}
                        />
                      ))}
                    </Card>
                  )}
            </Section>

            <Section name="Where your data goes">
              {protection === null
                ? <Waiting rows={3} />
                : <Receivers of={protection} />}
            </Section>
          </Screen>
        )}
    </Stack>
  );
}

/**
 * ⚠️ THREE STATES, AND THE MIDDLE ONE IS THE WHOLE REASON THIS IS NOT A BOOLEAN.
 * "Accepted an earlier version" is what a person sees the day terms change, and
 * it is neither "you agreed" nor "you never did" — collapsing it into either one
 * misreports the record on precisely the day the record matters.
 */
export const said = (d: Doc): string =>
  d.outstanding
    ? (d.acceptedOn ? "New version" : "Not accepted")
    /* ⚠️ AND THE FOURTH STATE SAYS NOTHING AT ALL. A document this person is not
       asked to accept is published rather than owed — a line explaining why it has
       no date is an explanation of an absence nobody had noticed. */
    : d.acceptedOn ? `Accepted ${d.acceptedOn}` : "";

/**
 * WHO ELSE RECEIVES IT.
 *
 * ⚠️ FOLDED, BECAUSE IT IS A REFERENCE RATHER THAN A READ. Nobody scrolls a
 * subprocessor list for pleasure; the people who want it want all of it, and the
 * people who do not want the screen above it to be short. What stays visible is
 * the count — which is the only part of the answer somebody scanning is after.
 */
const Receivers = ({ of }: { readonly of: Protection }): ReactNode => (
  <>
    <Card className="entries">
      <Entry label="Responsible for your data">{of.controller}</Entry>
      <Entry label="Who to write to">{of.contact}</Entry>
      <Entry label="Processed in">{list(of.regions)}</Entry>
    </Card>

    {of.subprocessors.length ? (
      <Disclose title="Who else receives it" said={String(of.subprocessors.length)}>
        <Card className="entries">
          {of.subprocessors.map((p) => (
            /* ⚠️ WHAT THEY RECEIVE IT FOR, BESIDE WHO THEY ARE. A list of company
               names is a disclosure that discloses nothing — the question anybody
               has is what this one does with it. */
            <Entry key={p.name} label={p.name}>{p.purpose} · {p.region}</Entry>
          ))}
        </Card>
      </Disclose>
    ) : null}

    {of.inference.length ? (
      <Disclose title="Sent to a model" said={String(of.inference.length)}>
        {/* ⚠️ PLAIN ROWS, BECAUSE THERE IS ONLY ONE FACT PER LINE. Set as
            label-and-value every row read "…: Used to generate" — a column of
            identical values, which is a shape saying there is something to compare
            when there is not. */}
        <Card>
          {of.inference.map((what) => <Item key={what} title={what} />)}
        </Card>
      </Disclose>
    ) : null}

    {of.transfers.length ? (
      <Disclose title="Sent outside those regions" said={String(of.transfers.length)}>
        <Card className="entries">
          {/* ⚠️ THE BASIS TRAVELS WITH THE TRANSFER. "Data goes to the United
              States" on its own is the half that alarms; the lawful basis is the
              half that answers. */}
          {of.transfers.map((t) => <Entry key={t.to} label={t.to}>{t.basis}</Entry>)}
        </Card>
      </Disclose>
    ) : null}
  </>
);

/* ⚠️ EVERY ROW HERE IS AN `Entry` WITH NO `onEdit`, which the list already draws
   as a report rather than a control — nothing on this screen is editable, and a
   read-only fact in the shape of an editable one is a control that does nothing.
   A local row would have been a second answer to a question `list.tsx` already
   answers. */

const list = (of: readonly string[]): string => of.join(", ");

/**
 * ONE DOCUMENT, READ.
 *
 * ⚠️ THE TEXT IS THE SCREEN. No card, no rows, no chrome around it — a legal
 * document set inside a settings list reads as a form field containing a novel,
 * and the measure is what makes it readable at all. Everything here is in service
 * of somebody actually getting through it.
 *
 * ⚠️ THE AGREEMENT IS AT THE END, WHICH IS THE POINT. A button at the top is one
 * pressed before reading; at the bottom it is one pressed after scrolling past
 * the text, which is the only version of this that means anything.
 */
export function DocScreen({ doc, onAccept, onBack, Heading = "h1" }: {
  readonly doc: Doc;
  readonly onAccept: () => Promise<Problem | null>;
  /** ⚠️ Called once the agreement has been SEEN to have landed, not when it was
   *  sent — `useCommit` holds "Done" for a moment before this fires. */
  readonly onBack: () => void;
  readonly Heading?: ElementType;
}): ReactNode {
  /*
    ⚠️ THE SAME LIFECYCLE EVERY OTHER WRITE IN THIS PACKAGE USES. A local
    `saving` boolean is shorter and cannot express the two states that matter:
    a refusal, which has to be shown where the button is, and the moment of
    "Done" that tells somebody it landed. It also carries the haptic and the
    sound, which a hand-rolled flag silently would not.
  */
  const { state, run, reset } = useCommit(onAccept, onBack);
  const problem = state.at === "failed" ? state.problem : null;

  return (
    <Screen leave="up" onLeave={onBack} name={doc.title}
      title={<Title as={Heading}>{doc.title}</Title>}
      /* ⚠️ THE VERSION IS ON THE SCREEN, because a consent is recorded against a
         version and a document that does not say which one it is cannot be
         checked against the record. */
      lede={`Version ${doc.version}`}
    >
      <Section>
        {doc.body ? <div className="prose">{paragraphs(doc.body)}</div> : null}
        {doc.url ? (
          /* ⚠️ A LINK OUT IS A LINK OUT AND SAYS SO. Rendering the operative
             document's address as though it were more of this page is how
             somebody agrees to a summary believing they read the contract. */
          <p className="prose-away">
            <a href={doc.url} target="_blank" rel="noreferrer">Open the full document</a>
          </p>
        ) : null}
      </Section>

      {doc.outstanding ? (
        <Section>
          {problem ? (
            /* ⚠️ WHERE THE PRESS WAS, NOT IN A TOAST. A refusal that travels to
               the corner of the screen is one somebody reads after they have
               already navigated away from what caused it. */
            <p className="note wrong" role="alert">
              <strong>{problem.title}</strong>
              {problem.detail ? <> {problem.detail}</> : null}
              <span className="note-ref">{problem.ref}</span>
            </p>
          ) : null}
          <Button
            tone="loud" wide
            data-state={state.at}
            disabled={state.at === "working" || state.at === "done"}
            onClick={() => { reset(); void run(); }}
            sign={state.at === "done" ? <Tick className="button-sign" size={21} /> : undefined}
          >
            {state.at === "working" ? "Recording" : state.at === "done" ? "Agreed"
              : problem?.retryable ? "Try again" : "I agree"}
          </Button>
        </Section>
      ) : doc.acceptedOn ? (
        /* ⚠️ WHAT WAS AGREED, AT THE END, WHERE THE BUTTON WOULD HAVE BEEN. The
           same place answers the same question in both states. */
        <Section><p className="prose-said">Accepted {doc.acceptedOn}.</p></Section>
      ) : null}
    </Screen>
  );
}

/**
 * ⚠️ BLANK LINES ARE PARAGRAPHS, AND NOTHING ELSE IS MARKUP. A declared document
 * is text somebody wrote in a manifest, so rendering it as HTML would make the
 * manifest a script injection surface for the sake of bold headings. Splitting on
 * blank lines is the whole formatting vocabulary, and it is enough for prose.
 */
export const paragraphs = (body: string): readonly ReactNode[] =>
  body.split(/\n\s*\n/).map((p, i) => <p key={i}>{p.trim()}</p>);

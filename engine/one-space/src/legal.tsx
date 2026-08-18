/**
 * READING WHAT THE DEPLOYMENT PROMISED — one tray, one read, every door.
 *
 * ⚠️ THREE SURFACES SHOW THE SAME DOCUMENTS AND THEY MUST NOT SHOW THEM
 * DIFFERENTLY. The sign-in door offers them before anybody is anybody; the wall
 * lists what somebody still owes an agreement to; the trust screen lists
 * everything published. A copy of "open it and read it" in each is three
 * behaviours that agree until one is touched — and the fault this whole area is
 * a catalogue of is exactly that: a link, a route and a screen that each
 * believed something different about where a document lives. So there is ONE
 * tray, mounted once, and every surface asks it to open.
 *
 * ⚠️ AND IT IS A TRAY RATHER THAN A PAGE LOAD, WHICH IS WHY IT EXISTS AT ALL.
 * The documents are published at `/legal` and that page stays — it is the
 * address somebody can send, and what a person with no app open reads. But
 * following a link from a sign-in screen costs somebody the sign-in screen: a
 * half-typed address, and the whole boot again on the way back.
 *
 * ⚠️ THE WORDS COME FROM `legal.list`, WHICH NEEDS NO SESSION. The door has
 * nobody to ask as, and deciding whether to agree is what somebody does BEFORE
 * they are anybody here. It is the same text the worker already serves to
 * anybody at `/legal/<id>`, so the shape is new and the exposure is not.
 *
 * ⚠️ ONE READ PER PAGE LOAD AND ONLY WHERE IT IS WANTED. A document is immutable
 * for its version, so two mounts asking is two round trips for an answer that
 * cannot have changed in between — and a tray sitting above every page must not
 * fetch on pages nobody opens it from.
 */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@heroui/react";
import {
  Await, Document, Documents, ReadingProvider, SPACE, TYPE, TextWaiting, Tray, useReading,
  type Loaded, ready, trouble, waiting,
} from "@engine/design";
import type { DocumentDef } from "@engine/kernel";
import { api } from "./api.js";

/** One document as the deployment publishes it. */
export interface Published {
  readonly id: string;
  readonly title: string;
  readonly version: string;
  readonly kind: string;
  readonly url: string | null;
  /** ⚠️ `null` where the deployment does not hold the words — see `legalUrlOf`. */
  readonly text: string | null;
  readonly mustAccept: boolean;
  readonly binds: "person" | "tenant";
}

/**
 * ⚠️ MODULE-LEVEL, AND DELIBERATELY NOT STATE ON THE PROVIDER. The value is
 * immutable for the life of the page and two surfaces want it, so the simplest
 * correct thing is one promise everybody awaits.
 */
let inflight: Promise<Loaded<readonly Published[]>> | null = null;

const fetchBook = (): Promise<Loaded<readonly Published[]>> => {
  inflight ??= api.get<{ readonly documents: readonly Published[] }>("legal.list")
    /* ⚠️ A FAILED READ IS A PROBLEM, NEVER AN EMPTY LIST. "Nothing to read" over
       a dropped connection is the shape this codebase keeps finding. */
    .then((got) => (got.ok ? ready(got.value.documents) : trouble<readonly Published[]>(got.problem)))
    .then((out) => {
      /* ⚠️ A FAILURE IS NOT CACHED. Holding onto it would make one bad moment
         permanent for the life of the tab, with a retry that cannot retry. */
      if (out.status !== "ready") inflight = null;
      return out;
    });
  return inflight;
};

function useDocuments(): Loaded<readonly Published[]> {
  const [book, setBook] = useState<Loaded<readonly Published[]>>(waiting());
  useEffect(() => {
    let live = true;
    void fetchBook().then((out) => { if (live) setBook(out); });
    return () => { live = false; };
  }, []);
  return book;
}

const asDef = (d: Published): DocumentDef => ({
  id: d.id, title: d.title, kind: d.kind as DocumentDef["kind"],
  version: d.version as DocumentDef["version"],
  mustAccept: d.mustAccept, binds: d.binds,
});

/**
 * ⚠️ ONE DOCUMENT, DRAWN IN ONE PLACE. Two components rendering a legal text is
 * two renderings of one wording that agree until somebody edits one — which is
 * the whole fault this file exists to end, one level down.
 */
function Reader({ of }: { readonly of: Published }) {
  return (
    <div className={`flex flex-col ${SPACE.snug}`}>
      <h2 className={TYPE.section}>{of.title}</h2>
      <p className={TYPE.note}>Version {of.version}</p>
      {/* ⚠️ A DOCUMENT HELD SOMEWHERE ELSE STILL GETS A LINK, and says so. We do
          not have its words, and drawing an empty sheet would pretend we do. */}
      {of.text
        ? <Document text={of.text} />
        : of.url
          ? (
            <Button
              variant="secondary"
              onPress={() => { window.open(of.url!, "_blank", "noopener"); }}
            >
              Read it on the web
            </Button>
          )
          : <p className={TYPE.body}>This one is not published here yet.</p>}
    </div>
  );
}

/**
 * THE ONE TRAY, MOUNTED ONCE, ABOVE EVERY DOOR AND EVERY SCREEN.
 *
 * ⚠️ TWO LEVELS IN ONE SHEET RATHER THAN A SHEET INSIDE A SHEET. Opening with no
 * document shows the list; choosing one replaces it and Back returns. Nested
 * overlays each trap focus, and the second to close hands it to the wrong place.
 */
export function Reading({ children }: { readonly children: React.ReactNode }) {
  /* ⚠️ `undefined` IS SHUT, `null` IS OPEN AT THE LIST, a string is a document.
     Two flags would let the pair contradict — open with nothing to show, or shut
     on a document. */
  const [at, setAt] = useState<string | null | undefined>(undefined);
  const read = useCallback((id?: string) => { setAt(id ?? null); }, []);

  return (
    <ReadingProvider value={{ read }}>
      {children}
      <Tray
        title={at ? "" : "Documents"}
        isOpen={at !== undefined}
        onOpenChange={(is) => { if (!is) setAt(undefined); }}
        actions={at
          ? <Button variant="ghost" onPress={() => { setAt(null); }}>Back</Button>
          : <Button variant="ghost" onPress={() => { setAt(undefined); }}>Close</Button>}
      >
        {/* ⚠️ MOUNTED ONLY WHILE IT IS OPEN, so a tray sitting above every page
            costs a request on no page at all. The read fires the first time
            somebody actually asks for the documents. */}
        {at !== undefined ? <Book at={at} onOpen={read} /> : null}
      </Tray>
    </ReadingProvider>
  );
}

/** The read, and the two things it can draw. Mounted where it is wanted. */
function Book({ at, onOpen }: {
  readonly at: string | null;
  readonly onOpen: (id: string) => void;
}) {
  const book = useDocuments();
  return (
    <Await
      of={book}
      waiting={<TextWaiting lines={6} />}
      then={(all) => {
        const one = at ? all.find((d) => d.id === at) ?? null : null;
        return one
          ? <Reader of={one} />
          : (
            <div className={`flex flex-col ${SPACE.snug}`}>
              <p className={TYPE.note}>What One promises, and what it asks you to agree to.</p>
              <Documents documents={all.map(asDef)} onOpen={onOpen} />
            </div>
          );
      }}
    />
  );
}

/**
 * A LIST OF DOCUMENTS, IN PLACE, THAT OPENS THE TRAY ABOVE.
 *
 * ⚠️ IT OWNS NO OVERLAY OF ITS OWN. On the wall the rows are the subject and
 * agreeing is the act, so they belong on the screen — but what they OPEN is the
 * same tray the door opens, or the wall and the door would be two readers of one
 * text again.
 */
export function DocumentList({ show, outstanding = [] }: {
  /** Which to list. Absent lists everything the deployment publishes. */
  readonly show?: readonly { readonly id: string }[];
  readonly outstanding?: readonly { readonly id: string }[];
}) {
  const book = useDocuments();
  const reading = useReading();
  /* ⚠️ MOUNTED INSIDE `Reading`, ALWAYS — rows that quietly did nothing would be
     the same dead affordance this file exists to fix, wearing a different
     shape. */
  if (!reading) throw new Error("DocumentList outside Reading");

  return (
    <Await
      of={book}
      waiting={<TextWaiting lines={4} />}
      then={(all) => {
        const wanted = show ? all.filter((d) => show.some((s) => s.id === d.id)) : all;
        return (
          <Documents
            documents={wanted.map(asDef)}
            outstanding={wanted.filter((d) => outstanding.some((o) => o.id === d.id)).map(asDef)}
            onOpen={reading.read}
          />
        );
      }}
    />
  );
}

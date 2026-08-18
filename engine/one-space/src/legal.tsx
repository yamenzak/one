/**
 * READING WHAT THE DEPLOYMENT PROMISED — one way, wherever it is asked from.
 *
 * ⚠️ TWO SCREENS SHOW THE SAME DOCUMENTS AND THEY MUST NOT SHOW THEM
 * DIFFERENTLY. The wall lists what somebody still owes an agreement to; the
 * trust screen lists everything the deployment publishes. A copy of "open it in
 * a sheet" in each is two behaviours that agree until one is touched — and the
 * fault this whole area is a catalogue of is exactly that: a link, a route and a
 * screen that each believed a different thing about where a document lives.
 *
 * ⚠️ THE WORDS COME FROM `me.agreements`, WHICH IS REACHABLE BEFORE ACCEPTING BY
 * CONSTRUCTION. It is the one read the acceptance gate must never refuse, so it
 * is the right carrier — where `owed` is computed on every operation the
 * deployment answers, and three legal documents on that would ride every
 * response of every screen.
 *
 * ⚠️ AND IT IS READ ONCE PER PAGE LOAD, NOT ONCE PER SCREEN. Two surfaces
 * mounting the same read is two round trips for one answer that cannot have
 * changed in between — a document is immutable for its version.
 */

import { useEffect, useState } from "react";
import { Button } from "@heroui/react";
import {
  Await, Document, Documents, SPACE, TYPE, TextWaiting, Tray, type Loaded,
  ready, trouble, waiting,
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
 * ⚠️ MODULE-LEVEL, AND DELIBERATELY NOT A CONTEXT. A provider would have to wrap
 * both the wall — which renders before any shell exists — and the centre, which
 * is inside one. The value is immutable for the life of the page, so the
 * simplest correct thing is one promise everybody awaits.
 */
let inflight: Promise<Loaded<readonly Published[]>> | null = null;

const fetchBook = (): Promise<Loaded<readonly Published[]>> => {
  inflight ??= api.get<{ readonly documents: readonly Published[] }>("me.agreements")
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

export function useDocuments(): Loaded<readonly Published[]> {
  const [book, setBook] = useState<Loaded<readonly Published[]>>(waiting());
  useEffect(() => {
    let live = true;
    void fetchBook().then((out) => { if (live) setBook(out); });
    return () => { live = false; };
  }, []);
  return book;
}

/**
 * A LIST OF DOCUMENTS THAT CAN ACTUALLY BE READ.
 *
 * ⚠️ A SHEET, NOT A TAB, AND THE TAB IS WHY. A new window on this deployment
 * loads the app, which boots, finds a document unaccepted and draws the wall —
 * so the only way to read what was being asked led back to being asked. The
 * words are here already.
 *
 * ⚠️ A DOCUMENT HELD SOMEWHERE ELSE STILL GETS A LINK, and says so. We do not
 * have its words, and drawing an empty sheet would be pretending we do.
 */
export function DocumentList({ show, outstanding = [] }: {
  /** Which to list. Absent lists everything the deployment publishes. */
  readonly show?: readonly { readonly id: string }[];
  readonly outstanding?: readonly { readonly id: string }[];
}) {
  const book = useDocuments();
  const [reading, setReading] = useState<string | null>(null);

  const asDef = (d: Published): DocumentDef => ({
    id: d.id, title: d.title, kind: d.kind as DocumentDef["kind"],
    version: d.version as DocumentDef["version"],
    mustAccept: d.mustAccept, binds: d.binds,
  });

  return (
    <Await
      of={book}
      waiting={<TextWaiting lines={4} />}
      then={(all) => {
        const wanted = show ? all.filter((d) => show.some((s) => s.id === d.id)) : all;
        const open = wanted.find((d) => d.id === reading) ?? null;
        return (
          <>
            <Documents
              documents={wanted.map(asDef)}
              outstanding={wanted.filter((d) => outstanding.some((o) => o.id === d.id)).map(asDef)}
              onOpen={(id) => { setReading(id); }}
            />
            {/* ⚠️ A TRAY RATHER THAN A DIALOG: the screen behind is still the
                subject, because reading is a step on the way to answering it. */}
            <Tray
              title={open?.title ?? ""}
              isOpen={open !== null}
              onOpenChange={(is) => { if (!is) setReading(null); }}
              actions={<Button variant="ghost" onPress={() => { setReading(null); }}>Close</Button>}
            >
              {open ? (
                <div className={`flex flex-col ${SPACE.snug}`}>
                  <p className={TYPE.note}>Version {open.version}</p>
                  {open.text
                    ? <Document text={open.text} />
                    : open.url
                      ? (
                        <Button
                          variant="secondary"
                          onPress={() => { window.open(open.url!, "_blank", "noopener"); }}
                        >
                          Read it on the web
                        </Button>
                      )
                      : <p className={TYPE.body}>This one is not published here yet.</p>}
                </div>
              ) : null}
            </Tray>
          </>
        );
      }}
    />
  );
}

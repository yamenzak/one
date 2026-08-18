/**
 * WHAT YOU HAVE TO AGREE TO — the wall, and the doors in it.
 *
 * ⚠️ THIS IS THE ONE WALL THAT HOLDS THE WHOLE PRODUCT, READS INCLUDED, so the
 * three things that stay open are the point of it rather than an exception to
 * it: read what is being asked, take a copy, delete everything. A wall nobody
 * can leave through is a hostage, and the version of this screen that only
 * offered "Agree" would be one.
 *
 * ⚠️ AND IT NAMES THE VERSION IT IS ASKING ABOUT. A press meaning "whatever is
 * current" records an agreement to text the person may never have seen — the
 * screen showed one wording and the server stored another, which is exactly the
 * confusion the version exists to prevent. The version travels with the press.
 *
 * ⚠️ THE DOCUMENT OPENS HERE, NOT IN A TAB. It opened in a tab, and the tab was
 * the app — a new window on this deployment boots the SPA, which reads the
 * session, finds the document unaccepted, and draws THIS SCREEN again. So the
 * only way to read what was being asked led back to being asked. `me.agreements`
 * carries the words (it is reachable before accepting, by construction) and they
 * are shown over the wall rather than instead of it.
 *
 * ⚠️ A DOCUMENT WITH NOWHERE TO READ IT IS REFUSED AT COMPOSITION
 * (`must_accept_without_binding`), so every row here has something to open.
 */

import { useEffect, useState } from "react";
import { Button } from "@heroui/react";
import type { Problem } from "@engine/kernel";
import {
  Arrival, AsideRoute, Await, Document, Group, NavRow, SPACE, TYPE, TextWaiting, Tray, Trouble,
  glyphOf, notice, ready, trouble, waiting, type Loaded,
} from "@engine/design";
import { api, type Owed } from "../api.js";
import { Data } from "../space/Data.js";
import { useSession } from "../session.js";

/** What a document actually holds, once the read comes back. */
interface Held {
  readonly text: string | null;
  readonly url: string | null;
}

type Book = Readonly<Record<string, Held>>;

export function Agreements({ owed }: { readonly owed: readonly Owed[] }) {
  const { refresh, leave } = useSession();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  /**
   * ⚠️ THE WAY OUT IS ON THIS SCREEN RATHER THAN A ROUTE AWAY. Sending somebody
   * into OneSpace for their copy opens every other screen in it, and every
   * operation behind those is behind this wall — so each refuses with a status
   * the screen has no reason to expect. One flag, two faces, nothing gated in
   * between.
   */
  const [leaving, setLeaving] = useState(false);
  const [reading, setReading] = useState<Owed | null>(null);
  /**
   * ⚠️ READ ONCE, WHEN THE WALL DRAWS, RATHER THAN WHEN A ROW IS PRESSED. The
   * words are what this screen is asking about; fetching them on the press puts
   * a spinner between "let me read that" and the text, on the one screen where
   * somebody has already been told they cannot go anywhere else.
   *
   * ⚠️ AND IT IS ITS OWN READ RATHER THAN A FIELD ON THE BOOT PAYLOAD. What is
   * owed is computed on every operation the deployment answers, so carrying the
   * text there would put three legal documents on every response of every
   * screen.
   */
  const [book, setBook] = useState<Loaded<Book>>(waiting());

  useEffect(() => {
    let live = true;
    void (async () => {
      const got = await api.get<{
        readonly documents: readonly ({ readonly id: string } & Held)[];
      }>("me.agreements");
      if (!live) return;
      /* ⚠️ A FAILED READ IS A PROBLEM, NEVER AN EMPTY BOOK. Rendering "nothing
         to read" over a dropped connection is the exact shape this codebase
         keeps finding — see `session.tsx`. */
      if (!got.ok) { setBook(trouble(got.problem)); return; }
      setBook(ready(Object.fromEntries(
        got.value.documents.map((d) => [d.id, { text: d.text, url: d.url }]),
      )));
    })();
    return () => { live = false; };
  }, []);

  const agree = async () => {
    setBusy(true);
    setProblem(null);
    for (const doc of owed) {
      const out = await api.post("me.accept", { document: doc.id, version: doc.version });
      if (!out.ok) { setBusy(false); setProblem(out.problem); return; }
    }
    /* ⚠️ NOTHING NAVIGATES HERE. The boot read is what decided this screen was
       showing; refreshing it is what takes it away, and a redirect written into
       this screen would be a second answer to "where do you go next". */
    notice.ok("Thank you.");
    await refresh();
    setBusy(false);
  };

  const one = owed.length === 1;

  if (leaving) {
    return (
      <Arrival
      /* ⚠️ THE DOOR IS WHERE THE LOGO IS THE SUBJECT — see `Arrival.brand`. */
      brand={{ of: "space", name: ["One", "Space"] }}
        name="Your data"
        claim="Take a copy, or delete everything. Neither needs you to agree to anything."
        aside={<AsideRoute says="Changed your mind?" label="Back to the agreements"
          onDo={() => { setLeaving(false); }} />}
      >
        <Data />
      </Arrival>
    );
  }

  return (
    <Arrival
      /* ⚠️ THE DOOR IS WHERE THE LOGO IS THE SUBJECT — see `Arrival.brand`. */
      brand={{ of: "space", name: ["One", "Space"] }}
      name={one ? "One thing to agree to" : "A few things to agree to"}
      claim={owed.some((d) => d.binds === "tenant")
        ? "Some of these are agreed on behalf of your workspace."
        : undefined}
      aside={(
        /* ⚠️ ALWAYS OFFERED, AND IT IS WHAT MAKES THIS A WALL RATHER THAN A
           TRAP. Somebody who will not agree can still take everything they have
           and go. */
        <AsideRoute
          says="Would rather not?"
          label="Take a copy or delete"
          isDisabled={busy}
          onDo={() => { setLeaving(true); }}
        />
      )}
    >
      {problem ? <Trouble problem={problem} /> : null}

      <div className={`flex flex-col ${SPACE.snug}`}>
        <Group>
          {owed.map((doc) => (
            <NavRow
              key={`${doc.appId ?? "one"}:${doc.id}`}
              icon={glyphOf("file")}
              label={doc.title}
              /* ⚠️ THE VERSION IS SHOWN, because it is what is being agreed to
                 and because somebody asked again after a change deserves to see
                 that it changed. */
              under={`Version ${doc.version}${doc.binds === "tenant" ? " · for your workspace" : ""}`}
              onOpen={() => { setReading(doc); }}
            />
          ))}
        </Group>

        <Button
          variant="primary"
          size="lg"
          fullWidth
          isPending={busy}
          onPress={() => { void agree(); }}
        >
          {one ? "Agree" : "Agree to all"}
        </Button>

        {/* ⚠️ SIGNING OUT IS NOT A WAY THROUGH AND IS NOT PRETENDING TO BE. It
            is here because somebody who reached this on the wrong account has
            nowhere else to press. */}
        <Button
          variant="ghost"
          size="lg"
          fullWidth
          isDisabled={busy}
          onPress={() => { void leave().then(() => location.assign("/")); }}
        >
          Sign out
        </Button>
      </div>

      {/* ⚠️ A TRAY RATHER THAN A DIALOG: the screen behind is still the subject,
          because reading is a step on the way to answering it (see `overlay`). */}
      <Tray
        title={reading?.title ?? ""}
        isOpen={reading !== null}
        onOpenChange={(open) => { if (!open) setReading(null); }}
        actions={(
          <Button variant="ghost" onPress={() => { setReading(null); }}>Close</Button>
        )}
      >
        {reading ? (
          <div className={`flex flex-col ${SPACE.snug}`}>
            <p className={TYPE.note}>Version {reading.version}</p>
            <Await
              of={book}
              waiting={<TextWaiting lines={10} />}
              then={(held) => {
                const doc = held[reading.id];
                if (doc?.text) return <Document text={doc.text} />;
                /* ⚠️ A DOCUMENT HOSTED SOMEWHERE ELSE IS A LINK, AND SAYING SO
                   IS THE HONEST ANSWER. We do not hold its words, so pretending
                   to show them would be showing a blank sheet. */
                const away = doc?.url ?? reading.url;
                return away ? (
                  <Button variant="secondary" onPress={() => { window.open(away, "_blank", "noopener"); }}>
                    Read it on the web
                  </Button>
                ) : (
                  <p className={TYPE.body}>This one is not published here yet.</p>
                );
              }}
            />
          </div>
        ) : null}
      </Tray>
    </Arrival>
  );
}

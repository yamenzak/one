/**
 * YOUR DATA — take a copy, or destroy it.
 *
 * ⚠️ THE TWO ANSWERS THIS SCREEN GIVES ARE THE ONES NOBODY CAN CHECK. "Here is
 * everything we hold" and "it is all gone" are sentences a person has to take on
 * trust, so the screen's job is to say precisely what was walked and what was
 * found — the count of places looked in, not only the ones that had something.
 * A list of what happened to be there is indistinguishable from a walk that
 * skipped half the deployment.
 *
 * ⚠️ AND BOTH ARE REACHABLE WHILE SOMEBODY IS SHUT OUT OF EVERYTHING ELSE.
 * Holding the terms over a person is fair; holding their data over them is not,
 * so the acceptance wall offers this screen's two acts by name.
 *
 * ⚠️ THE COPY IS ASKED FOR AND ARRIVES BY POST, WHICH IT DID NOT. This screen
 * used to fetch the dossier and save it straight out of the browser — so the
 * most complete object this deployment can produce about one person came out of
 * an open tab, with a session as the whole of the access control. The ask now
 * sends a link to the registered address; following it, signed in, is what
 * hands the file over. Both halves are needed and neither is enough.
 *
 * ⚠️ AND BOTH ACTS ASK TWICE. Deleting always did; taking a copy did not, and it
 * is the act that posts a link to somebody's whole record — one stray press on a
 * shared laptop and it is in a mailbox, having spent the week's only ask.
 */

import { useEffect, useState } from "react";
import { Button } from "@heroui/react";
import {
  Confirm, Group, NoteRow, Screen, notice, useShown,
} from "@engine/design";
import { dayIn, sayDate, type Instant, type Problem } from "@engine/kernel";
import { api } from "../api.js";
import { claimFromUrl } from "../nav.js";
import { useSession } from "../session.js";
import { Trouble } from "@engine/design";

interface Dossier {
  readonly at: string;
  readonly held: readonly { readonly of: string; readonly rows: readonly unknown[] }[];
  readonly lookedAndEmpty: readonly string[];
}

interface Forgotten {
  readonly closed: readonly string[];
  readonly deleted: readonly { readonly table: string; readonly rows: number }[];
  readonly lookedIn: number;
}

export function Data() {
  const reader = useShown();
  const { leave } = useSession();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [took, setTook] = useState<Dossier | null>(null);
  /* ⚠️ `null` UNTIL IT IS KNOWN, never `false`. A button that says "you asked
     recently" for the length of a round trip is a wrong answer wearing a loading
     state's excuse — and one that says the opposite is worse. */
  const [nextAt, setNextAt] = useState<string | null | undefined>(undefined);

  const askWhen = async () => {
    const out = await api.get<{ nextAt: string | null }>("me.export.when");
    if (out.ok) setNextAt(out.value.nextAt);
  };

  /* ⚠️ THE DOWNLOAD IS A SAVE THE PAGE MAKES FROM AN ANSWER IN HAND. A second
     address to fetch it from would be a second authorisation question about the
     most complete object this deployment can produce. */
  const save = (data: Dossier) => {
    /* ⚠️ Revoked on the next tick rather than left to the collector — a blob URL
       held open is the whole export sitting in memory for the life of the tab. */
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    /* ⚠️ THE DAY IN THE FILENAME IS THEIRS, not UTC's. A file saved at 23:30 in
       Berlin named with yesterday's date is a file somebody cannot find. */
    a.download = `your-data-${dayIn(reader, data.at as Instant)}.json`;
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); }, 0);
  };

  /*
    ⚠️ THE LINK IS SPENT ON ARRIVAL, WHICH IS WHY THIS RUNS ON MOUNT. Somebody
    following it from their mail has already decided; asking them to press again
    on landing would be a second confirmation of a thing they confirmed in the
    letter, and the token is single-use either way.
  */
  useEffect(() => {
    void askWhen();
    /* ⚠️ READ ONCE AND TAKEN OUT OF THE ADDRESS — see `claimFromUrl`. Left
       there it is a single-use secret in history, in a bookmark and in the next
       screenshot, and the router owns the address. */
    const take = claimFromUrl("take");
    if (!take) return;
    setBusy(true);
    void api.post<Dossier>("me.export", { take }).then((out) => {
      setBusy(false);
      if (!out.ok) {
        /* ⚠️ ONE REFUSAL FOR EXPIRED, SPENT AND WRONG — see `me.export`. What a
           person can DO about all three is the same, so the sentence is about
           asking again rather than about which it was. */
        setProblem(out.problem);
        return;
      }
      setTook(out.value);
      save(out.value);
      notice.ok("Copy downloaded.");
    });
  }, []);

  const ask = async () => {
    setBusy(true);
    setProblem(null);
    const out = await api.post<{ sentTo: string }>("me.export.ask", {});
    setBusy(false);
    if (!out.ok) { setProblem(out.problem); void askWhen(); return; }
    setSentTo(out.value.sentTo);
    void askWhen();
    notice.ok(`Link sent to ${out.value.sentTo}.`);
  };

  const destroy = async () => {
    setBusy(true);
    setProblem(null);
    const out = await api.post<Forgotten>("me.forget", {});
    setBusy(false);
    if (!out.ok) { setProblem(out.problem); return; }
    /* ⚠️ The session went with the account, so there is nothing to sign out OF —
       this only makes the page agree with the server. */
    await leave();
    notice.ok(out.value.closed.length
      ? `Deleted, and ${out.value.closed.length} workspace(s) closed with you.`
      : "Deleted.");
    location.assign("/");
  };

  const waiting = typeof nextAt === "string";

  return (
    <Screen shape="detail">
      {problem ? <Trouble problem={problem} /> : null}

      {/*
        ⚠️ THE SAME SHAPE AS THE CARD BELOW IT, AND FOR THE SAME REASON. This was
        an `ActionRow` — which carries no chevron by design, because it does
        something rather than going somewhere — so a neutral one is an ordinary
        row of words with nothing at all saying it can be pressed. The card under
        it already says what a section IS and offers the act as a button; two
        cards side by side, one of them with an invisible control, is the reader
        being asked to work out which of them is a control.
      */}
      <Group
        label="Take a copy"
        under="Everything we hold about you, as one file"
        does={waiting
          /* ⚠️ DISABLED WITH THE DATE ON IT, NOT HIDDEN. A control that vanishes
             for a week is a feature somebody concludes was removed. */
          ? (
            <Button variant="secondary" isDisabled>
              {`Ask again ${sayDate(reader, nextAt as Instant)}`}
            </Button>
          )
          : (
            <Confirm
              trigger={(
                <Button slot="trigger" variant="secondary" isDisabled={busy || nextAt === undefined}>
                  {busy ? "Working…" : "Email me a link"}
                </Button>
              )}
              title="Email your copy?"
              act={{ label: "Send the link", tone: "primary", onDo: () => { void ask(); } }}
            >
              We will post a link to your registered address. It works once, expires in
              a day, and you will need to be signed in to follow it — so the file only
              reaches somebody who holds both your mailbox and your account. You can ask
              again in a week.
            </Confirm>
          )}
      >
        <NoteRow>
          Your account, every workspace you are in, and your own records in each.
        </NoteRow>
        {sentTo ? <NoteRow>{`Sent to ${sentTo}. Check your email.`}</NoteRow> : null}
        {took ? (
          /* ⚠️ WHAT WAS LOOKED IN, NOT ONLY WHAT WAS FOUND. The empty places are
             the half that makes the count mean something. */
          <NoteRow>
            {`${took.held.length} kind(s) of record, out of `
              + `${took.held.length + took.lookedAndEmpty.length} places looked in.`}
          </NoteRow>
        ) : null}
      </Group>

      {/*
        ⚠️ A HEADING, A LINE AND A BUTTON — see `Group.does`. This was a
        forty-two word paragraph over a red row: the whole consequence of the
        act, printed where somebody is scrolling past it, above a control that
        did not look like one. The card says what the section IS and offers the
        act; what exactly goes is said in the two-step, where somebody has
        already decided to read.

        ⚠️ AND THE DETAIL DID NOT GET SHORTER, IT MOVED. Nothing a person needed
        was cut — it is one press later, at the moment they are actually
        deciding, which is the only moment they read it.
      */}
      <Group
        label="Delete everything"
        under="This cannot be undone"
        does={(
          <Confirm
            trigger={<Button slot="trigger" variant="danger-soft">Delete my account</Button>}
            title="Delete everything?"
            act={{ label: "Delete", onDo: () => { void destroy(); } }}
          >
            Your account, your place in every workspace and your own records go, along
            with the encrypted facts held for you. A workspace only you can run closes
            with you; records that belong to a workspace stay, with your name unwritten
            from them. There is no way back — take a copy first if you want one.
          </Confirm>
        )}
      >
        {/* ⚠️ ONE SENTENCE, BECAUSE THE CARD IS NOT WHERE THIS IS DECIDED. What
            exactly goes, and what survives, is four lines of consequence — read
            here it is scrolled past, read in the two-step it is read. A card
            with a `does` and nothing else would be a button with a box drawn
            round it, which is the shape `You.tsx` already refuses. */}
        <NoteRow>
          Your account, your places in every workspace, and everything held about you.
        </NoteRow>
      </Group>
    </Screen>
  );
}

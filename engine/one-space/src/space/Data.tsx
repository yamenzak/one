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
 * ⚠️ THE COPY IS A DOWNLOAD THE PAGE MAKES, NOT A LINK. It is assembled from the
 * answer already in hand — a second address would be a second authorisation
 * question about the most complete object this deployment can produce.
 */

import { useState } from "react";
import { Button } from "@heroui/react";
import {
  ActionRow, Confirm, Group, NoteRow, Screen, glyphOf, notice, useShown,
} from "@engine/design";
import { dayIn, type Instant, type Problem } from "@engine/kernel";
import { api } from "../api.js";
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
  const [took, setTook] = useState<Dossier | null>(null);

  const copy = async () => {
    setBusy(true);
    setProblem(null);
    const out = await api.get<Dossier>("me.export");
    setBusy(false);
    if (!out.ok) { setProblem(out.problem); return; }
    setTook(out.value);

    /* ⚠️ Revoked on the next tick rather than left to the collector — a blob URL
       held open is the whole export sitting in memory for the life of the tab. */
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(out.value, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    /* ⚠️ THE DAY IN THE FILENAME IS THEIRS, not UTC's. A file saved at 23:30 in
       Berlin named with yesterday's date is a file somebody cannot find. */
    a.download = `your-data-${dayIn(reader, out.value.at as Instant)}.json`;
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); }, 0);
    notice.ok("Copy downloaded.");
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

  return (
    <Screen shape="detail">
      {problem ? <Trouble problem={problem} /> : null}

      <Group label="Take a copy" under="Everything we hold about you, as one file">
        <ActionRow
          icon={glyphOf("file")}
          label={busy ? "Gathering…" : "Download my data"}
          under="Your account, every workspace you are in, and your own records in each"
          onDo={() => { void copy(); }}
        />
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
            trigger={<Button variant="danger-soft">Delete my account</Button>}
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

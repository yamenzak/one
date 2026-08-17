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
import {
  ActionRow, Confirm, Group, NoteRow, Prose, Screen, glyphOf, notice,
} from "@engine/design";
import type { Problem } from "@engine/kernel";
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
    a.download = `your-data-${out.value.at.slice(0, 10)}.json`;
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

      <Group label="Delete everything" under="This cannot be undone">
        <Prose>
          Your account, your place in every workspace, your own records and the encrypted
          facts held for you are deleted. A workspace only you can run is closed with you.
          Records that belong to a workspace stay, with your name unwritten from them.
        </Prose>
        <Confirm
          trigger={<ActionRow label="Delete my account" tone="danger" />}
          title="Delete everything?"
          act={{ label: "Delete", onDo: () => { void destroy(); } }}
        >
          There is no way back from this. Take a copy first if you want one.
        </Confirm>
      </Group>
    </Screen>
  );
}

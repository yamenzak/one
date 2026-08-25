/**
 * PEOPLE — the roster, and the one screen with faces on it.
 *
 * ⚠️ AN INVITED PERSON HAS NO ACCOUNT AND SO NO FACE. `whoFace` seeds from an
 * account id, which somebody who has not arrived does not have — a generated
 * face for them would be a picture of nobody. They keep the initial until they
 * sign in, which is also the honest signal that they have not.
 *
 * ⚠️ AND THE TABLE HAS TO SAY IT TOO. The row shape carried an "Invited" chip
 * and the columns did not, so on a desktop — where a roster is actually managed
 * — somebody who never accepted was indistinguishable from somebody who did.
 * Two shapes of one list are two chances to leave a fact out of one of them.
 *
 * ⚠️ THE TRAYS ARE CONTROLLED AND THE LIST OPENS THEM. A tray with its own
 * trigger would put a "Manage" button in the corner of every row and leave the
 * row itself inert beside it, which is the opposite of what a roster should feel
 * like — see `Tray`'s own note. Inviting is the screen's primary act; opening
 * somebody is the row.
 */

import * as React from "react";
import { Button, Chip } from "@heroui/react";
import {
  Agree, Faces, FieldRow, Group, Listing, NoteRow, OneOf, Orb, Screen, Stack, TextInput, Tray,
  glyphOf, notice, whoFace, type Loaded,
} from "@engine/design";
import type { Person } from "./sample.js";

const ROLES = [
  { id: "writer", label: "Writer", help: "Can write and publish" },
  { id: "reader", label: "Reader", help: "Can read everything, write nothing" },
] as const;

export function People({ title, of, again, onInvite, onOpen }: {
  /** ⚠️ The declared label — see `screens/index.tsx`. */
  readonly title?: string;
  readonly of: Loaded<readonly Person[]>;
  readonly again?: () => void;
  readonly onInvite: () => void;
  readonly onOpen: (who: Person) => void;
}) {
  const [inviting, setInviting] = React.useState(false);
  const [open, setOpen] = React.useState<Person | null>(null);
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<string | null>("writer");
  const [told, setTold] = React.useState(true);
  /* ⚠️ THE CHOSEN IDS ARE THE SCREEN'S, NOT THE LIST'S — see `ListingProps`. A
     list that held its own would keep somebody chosen after a filter removed
     them, and the act would then run over a row nobody can see. */
  const [chosen, setChosen] = React.useState<readonly string[]>([]);

  return (
    <>
      <Screen
        shape="list"
        title={title}
        does={{ label: "Invite somebody", onDo: () => { setInviting(true); onInvite(); } }}
        of={of}
        again={again}
        isNothing={(rows) => rows.length === 0}
        nothing={{
          icon: glyphOf("people"),
          says: "Nobody here yet",
          under: "Invite somebody by email — they join by signing in as that address",
        }}
        then={(rows) => (
          <Stack space="roomy">
            {/* ⚠️ THE ROSTER TWICE IS NOT WHAT THIS IS. The list below is who
                each person is; the pile is HOW MANY, as one object — the fact
                somebody wants before they read a single name, and the one thing
                a list of twelve rows cannot say at a glance. */}
            <Group label="Everybody here" icon={glyphOf("people")}>
              <NoteRow>
                <Faces
                  of={rows.map((p) => ({
                    id: p.id,
                    name: p.name,
                    ...(p.pending ? {} : { face: whoFace(p.id) }),
                  }))}
                />
              </NoteRow>
            </Group>

            <Listing
            label="People"
            of={{ status: "ready", data: rows }}
            rowKey={(p) => p.id}
            onOpen={(p) => { setOpen(p); onOpen(p); }}
            says={{ icon: glyphOf("people"), nothing: "Nobody here yet" }}
            /* ⚠️ ONE DEFINITION, BOTH SHAPES — a menu at the end of the row on a
               phone and the last column on a desk. Written per shape they drift,
               and neither side can see the other. */
            acts={(p) => [
              { id: "resend", label: "Send the invitation again", onDo: () => undefined },
              { id: "role", label: "Change what they can do", onDo: () => { setOpen(p); } },
              { id: "remove", label: "Remove from the workspace", tone: "danger", onDo: () => undefined },
            ]}
            chosen={chosen}
            onChoose={setChosen}
            bulk={[
              { id: "reader", label: "Make readers", onDo: () => { setChosen([]); } },
              { id: "remove", label: "Remove", tone: "danger", onDo: () => { setChosen([]); } },
            ]}
            asRow={(p) => ({
              name: p.name,
              face: p.pending ? undefined : whoFace(p.id),
              under: p.email,
              aside: p.pending
                ? <Chip color="warning" variant="soft"><Chip.Label>Invited</Chip.Label></Chip>
                : undefined,
            })}
            cols={[
              { id: "name", label: "Name", cell: (p) => p.name },
              { id: "email", label: "Email", cell: (p) => p.email },
              {
                id: "role", label: "In Ground",
                cell: (p) => (
                  <Chip color={p.role === "writer" ? "accent" : "default"} variant="soft">
                    <Chip.Label>{p.role}</Chip.Label>
                  </Chip>
                ),
              },
              {
                id: "state", label: "Joined",
                cell: (p) => (p.pending
                  ? <Chip color="warning" variant="soft"><Chip.Label>Invited</Chip.Label></Chip>
                  : p.since),
                by: (a, b) => a.since.localeCompare(b.since),
              },
              {
                id: "wrote", label: "Notes", numeric: true,
                cell: (p) => p.wrote,
                by: (a, b) => a.wrote - b.wrote,
              },
            ]}
            />
          </Stack>
        )}
      />

      {/* ⚠️ THE ORB IS THE FACE AT THE ONE SIZE WHERE IT IS A PORTRAIT rather
          than a marker, so it belongs where somebody is looking AT one person —
          never in a row, where four of them become wallpaper. A tray opened from
          the roster is exactly that place. */}
      <Tray
        isOpen={open !== null}
        onOpenChange={(next) => { if (!next) setOpen(null); }}
        title={open?.name ?? "Somebody"}
        actions={
          <Button variant="tertiary" onPress={() => setOpen(null)}>Close</Button>
        }
      >
        {open ? (
          <Stack space="roomy">
            {open.pending ? null : <Orb of={whoFace(open.id)} size={200} />}
            <Group label="In this workspace">
              <FieldRow label="Email" value={open.email} />
              <FieldRow label="What they can do" value={open.role === "writer" ? "Write and publish" : "Read only"} />
              <FieldRow label="Notes written" value={open.wrote} />
              <FieldRow
                label={open.pending ? "Invited" : "Joined"}
                value={open.since}
              />
            </Group>
          </Stack>
        ) : null}
      </Tray>

      <Tray
        isOpen={inviting}
        onOpenChange={setInviting}
        title="Invite somebody"
        actions={
          <Button
            variant="primary"
            isDisabled={!email.includes("@")}
            onPress={() => { setInviting(false); notice.ok("Invited."); }}
          >
            Send the invitation
          </Button>
        }
      >
        <Stack space="roomy">
          <TextInput
            label="Email"
            kind="email"
            value={email}
            onChange={setEmail}
            placeholder="somebody@example.com"
            help="They join by signing in as this address — there is nothing to accept"
            name="email"
            autoComplete="email"
          />
          <OneOf label="What they can do" value={role} onChange={setRole} options={ROLES} />
          <Agree
            label="Tell them by email"
            value={told}
            onChange={setTold}
            help="Off, they will find the workspace next time they sign in"
          />
        </Stack>
      </Tray>
    </>
  );
}

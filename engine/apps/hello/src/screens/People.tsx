/**
 * PEOPLE — the roster, and the one screen with faces on it.
 *
 * ⚠️ AN INVITED PERSON HAS NO ACCOUNT AND SO NO FACE. `whoFace` seeds from an
 * account id, which somebody who has not arrived does not have — a generated
 * face for them would be a picture of nobody. They keep the initial until they
 * sign in, which is also the honest signal that they have not.
 */

import * as React from "react";
import { Chip } from "@heroui/react";
import { Listing, Screen, whoFace, type Loaded } from "@engine/design";
import type { Person } from "./sample.js";

export function People({ title, of, again, onInvite, onOpen }: {
  /** ⚠️ The declared label — see `screens/index.tsx`. */
  readonly title?: string;
  readonly of: Loaded<readonly Person[]>;
  readonly again?: () => void;
  readonly onInvite: () => void;
  readonly onOpen: (who: Person) => void;
}) {
  return (
    <Screen
      shape="list"
      title={title}
      does={{ label: "Invite somebody", onDo: onInvite }}
      of={of}
      again={again}
      isNothing={(rows) => rows.length === 0}
      nothing={{
        says: "Nobody here yet",
        under: "Invite somebody by email — they join by signing in as that address",
      }}
      then={(rows) => (
        <Listing
          label="People"
          of={{ status: "ready", data: rows }}
          rowKey={(p) => p.id}
          onOpen={onOpen}
          says={{ nothing: "Nobody here yet" }}
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
              id: "role", label: "In Hello",
              cell: (p) => (
                <Chip color={p.role === "writer" ? "accent" : "default"} variant="soft">
                  <Chip.Label>{p.role}</Chip.Label>
                </Chip>
              ),
            },
          ]}
        />
      )}
    />
  );
}

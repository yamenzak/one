/**
 * WHO IT COMES FROM.
 *
 * ⚠️ THIS IS THE LAST STEP OF THE ONE WORKFLOW THE REORDER REPORT EXISTS FOR.
 * That screen can already say what to buy and how long the shelf lasts; without
 * this it cannot say who to ring — so the decision it worked out is finished in
 * somebody's head, in a different app, or not at all.
 *
 * ⚠️ AND A LEAD TIME HERE IS THEIRS, NOT THE WORKSPACE'S. The setting under
 * Preferences is the slowest supplier a place has; applied to a next-day
 * consumable it orders a month of stock every time one dips. A number on the row
 * is what makes the reorder list right per line rather than right on average.
 *
 * ⚠️ NO PRICES, DELIBERATELY. What a workspace pays is a commercial relationship
 * this product has no business holding — the moment it does, an import, an
 * export and a screen all carry it.
 */

import * as React from "react";
import { Button } from "@heroui/react";
import {
  Group, NavRow, NoteRow, Screen, Section, Stack, TextInput, Tray, glyphOf,
  type Loaded,
} from "@engine/design";

export interface Supplier {
  readonly id: string;
  readonly name: string;
  readonly contact: string;
  readonly email: string;
  readonly phone: string;
  readonly account: string;
  /** ⚠️ `null` where nobody has said — which is not "delivers today". */
  readonly leadDays: number | null;
  readonly note: string;
  /** How many products name them. Read-only, and the reason to keep a row. */
  readonly products: number;
}

export interface SuppliersProps {
  readonly title?: string;
  readonly of: Loaded<readonly Supplier[]>;
  /** ⚠️ The workspace's own, so a blank lead time can say what it falls back to. */
  readonly standingDays: number;
  readonly editing: Supplier | null;
  readonly busy: boolean;
  readonly again: () => void;
  readonly onOpen: (of: Supplier) => void;
  readonly onNew: () => void;
  readonly onClose: () => void;
  readonly onSave: (of: Supplier) => void;
}

/** ⚠️ A blank row, so "add" and "edit" are one form rather than two. */
export const NOBODY: Supplier = {
  id: "", name: "", contact: "", email: "", phone: "", account: "",
  leadDays: null, note: "", products: 0,
};

/*
  ⚠️ THE TWO FACTS A BUYER READS, IN THAT ORDER. How long they take decides when
  to order; how to reach them decides what happens next. Everything else on the
  row is filing.
*/
const under = (of: Supplier, standingDays: number): string => [
  of.leadDays === null
    ? `${standingDays} days (the workspace's)`
    : of.leadDays === 1 ? "next day" : `${of.leadDays} days`,
  of.contact,
  of.phone || of.email,
].filter(Boolean).join(" · ");

export function Suppliers({
  title, of, standingDays, editing, busy, again, onOpen, onNew, onClose, onSave,
}: SuppliersProps) {
  return (
    <>
      <Screen
        shape="list"
        title={title}
        under="Who things come from, and how long they take"
        of={of}
        again={again}
        does={{ op: "supplier.create", label: "Add a supplier", icon: glyphOf("add"), onDo: onNew }}
        isNothing={(rows) => rows.length === 0}
        nothing={{
          icon: glyphOf("box"),
          says: "No suppliers yet",
          under: "Add one, or import a spreadsheet with a supplier column and they appear here",
        }}
        then={(rows) => (
          <Section label="Suppliers">
            <Group>
              {rows.map((row) => (
                <NavRow
                  key={row.id}
                  icon={glyphOf("box")}
                  label={row.name}
                  under={under(row, standingDays)}
                  /* ⚠️ HOW MANY PRODUCTS NAME THEM, because a supplier nothing
                     comes from is a row to delete and there is no other way to
                     tell. */
                  aside={row.products === 1 ? "1 product" : `${row.products} products`}
                  onOpen={() => { onOpen(row); }}
                />
              ))}
            </Group>
          </Section>
        )}
      />
      {editing ? (
        <SupplierTray
          of={editing}
          standingDays={standingDays}
          busy={busy}
          onClose={onClose}
          onSave={onSave}
        />
      ) : null}
    </>
  );
}

function SupplierTray({ of, standingDays, busy, onClose, onSave }: {
  readonly of: Supplier;
  readonly standingDays: number;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onSave: (of: Supplier) => void;
}) {
  const [said, setSaid] = React.useState<Supplier>(of);
  const set = <K extends keyof Supplier>(key: K, value: Supplier[K]) =>
    { setSaid((was) => ({ ...was, [key]: value })); };

  /*
    ⚠️ THE LEAD TIME IS HELD AS TEXT, BECAUSE BLANK IS A REAL ANSWER AND ZERO IS
    A DIFFERENT ONE. A number control has nowhere to put "nobody has asked them",
    so the empty box would arrive as `0` — and a supplier who delivers today
    takes every product they supply off the reorder list until the shelf is
    empty.
  */
  const [days, setDays] = React.useState(of.leadDays === null ? "" : String(of.leadDays));
  const asked = days.trim() === "" ? null : Math.max(0, Math.trunc(Number(days)));
  const daysOk = days.trim() === "" || (Number.isFinite(Number(days)) && Number(days) >= 0);

  return (
    <Tray
      isOpen
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={of.id ? of.name || "Supplier" : "Add a supplier"}
      actions={(
        <Button
          slot="close"
          variant="primary"
          isDisabled={busy || said.name.trim() === "" || !daysOk}
          onPress={() => { onSave({ ...said, name: said.name.trim(), leadDays: asked }); }}
        >
          {of.id ? "Save" : "Add them"}
        </Button>
      )}
    >
      <Stack space="roomy">
        <TextInput label="Name" value={said.name} onChange={(v) => set("name", v)} />
        {/* ⚠️ A PERSON RATHER THAN A DEPARTMENT, because "who to ask for" is what
            somebody says on the phone and it is the fact nobody can look up. */}
        <TextInput
          label="Who to ask for"
          value={said.contact}
          onChange={(v) => set("contact", v)}
        />
        <TextInput label="Phone" value={said.phone} onChange={(v) => set("phone", v)} />
        <TextInput
          label="Email" kind="email" value={said.email} onChange={(v) => set("email", v)}
        />
        <TextInput
          label="Our account"
          value={said.account}
          onChange={(v) => set("account", v)}
          help="What they call you. It goes on the order."
        />
        {/* ⚠️ THE HELP LINE SAYS WHAT BLANK MEANS, because a person who leaves a
            box empty deserves to know which of the two answers they gave. */}
        <TextInput
          label="A delivery takes"
          value={days}
          onChange={setDays}
          after="days"
          error={daysOk ? undefined : "Days, as a number"}
          help={`Leave it blank to use the workspace's ${standingDays}.`}
        />
        <TextInput label="Note" value={said.note} onChange={(v) => set("note", v)} />
        {of.products
          ? <NoteRow>{of.products === 1 ? "1 product" : `${of.products} products`} come from them</NoteRow>
          : null}
      </Stack>
    </Tray>
  );
}

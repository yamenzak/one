/**
 * STARTING A WORKSPACE — the only place one is made.
 *
 * ⚠️ THIS SCREEN EXISTS ON THE SETUP DOOR AND NOWHERE ELSE. Offered inside a
 * workspace, it invites somebody who followed a colleague's link to start a
 * second one — which a previous platform shipped, on that workspace's own
 * branded sign-in page. The runtime refuses `me.tenant.create` anywhere else;
 * this is the surface half of the same rule.
 *
 * ⚠️ THE SLUG IS THE ADDRESS, so it is validated as a DNS label and the person
 * is shown the address they are choosing. Changing it later changes where their
 * workspace lives, which is why it is asked for once, plainly, up front.
 *
 * ⚠️ AND THE COUNTRY IS A FACT ABOUT THE BUSINESS, NEVER ABOUT A PERSON (D6). It
 * is what the records' placement is derived from, and the residency promise is
 * made to the business — so it is theirs to declare.
 */

import { useMemo, useState } from "react";
import {
  Button, ComboBox, Description, FieldError, Form, Input, Label, ListBox, TextField,
} from "@heroui/react";
import type { Problem } from "@quad/kernel";
import { EEA, slugOk } from "@quad/kernel";
import { api } from "../api.js";
import { byName } from "../countries.js";
import { accountUrl, tenantUrl, type Where } from "../door.js";
import { Refusal, Sheet } from "../ui.js";

/** ⚠️ From the name, but only until somebody types their own — a slug that
    silently follows the name is a slug that changes under an edit. */
const slugFrom = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

export function NewWorkspace({ where }: { readonly where: Where }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [chosen, setChosen] = useState(false);
  const [country, setCountry] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);

  const countries = useMemo(() => byName(), []);
  const address = chosen ? slug : slugFrom(name);
  const addressOk = address.length > 0 && slugOk(address);

  const create = async () => {
    setBusy(true);
    setProblem(null);
    const out = await api.post<{ slug: string }>("me.tenant.create", {
      name: name.trim(), slug: address, country,
    });
    setBusy(false);
    if (!out.ok) return setProblem(out.problem);
    /* ⚠️ Straight in. A "workspace created" screen with a link on it is a step
       whose only content is congratulating somebody. */
    location.assign(tenantUrl(out.value.slug, where, location));
  };

  return (
    <Sheet
      title="Start a workspace"
      lead="A workspace is a business — invite everybody else once it exists"
    >
      {problem ? <Refusal problem={problem} /> : null}

      <Form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void create(); }}>
        <TextField isRequired fullWidth name="name" value={name} onChange={setName} isDisabled={busy}>
          <Label>What is it called?</Label>
          <Input autoFocus placeholder="Northwind Fitness" />
        </TextField>

        <TextField
          fullWidth
          name="slug"
          value={address}
          onChange={(next) => { setChosen(true); setSlug(next); }}
          isDisabled={busy}
          isInvalid={address.length > 0 && !addressOk}
        >
          <Label>Its address</Label>
          <Input placeholder="northwind" />
          {address.length > 0 && !addressOk
            ? (
              <FieldError>
                Letters, numbers and hyphens only — it is a web address, so it has to be one.
              </FieldError>
            )
            : <Description>{address || "…"}.{where.root}</Description>}
        </TextField>

        <ComboBox
          isRequired
          selectedKey={country}
          onSelectionChange={(key) => setCountry(key === null ? null : String(key))}
          isDisabled={busy}
        >
          <Label>Where is the business?</Label>
          <ComboBox.InputGroup>
            <Input placeholder="Search countries…" />
            <ComboBox.Trigger />
          </ComboBox.InputGroup>
          {/* ⚠️ Said before it is chosen, not discovered afterwards: where the
              records live follows from this answer. */}
          <Description>
            {country && EEA.includes(country)
              ? "Records for this workspace stay in the EU."
              : "This decides where the workspace's records are kept."}
          </Description>
          <ComboBox.Popover>
            <ListBox>
              {countries.map((c) => (
                <ListBox.Item key={c.code} id={c.code} textValue={c.name}>
                  {c.name}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </ComboBox.Popover>
        </ComboBox>

        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            variant="primary"
            isPending={busy}
            isDisabled={!name.trim() || !addressOk || !country}
          >
            Create it
          </Button>
          <Button
            variant="ghost"
            isDisabled={busy}
            onPress={() => { location.assign(accountUrl(where, location)); }}
          >
            Back to your workspaces
          </Button>
        </div>
      </Form>
    </Sheet>
  );
}

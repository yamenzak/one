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

import { useEffect, useMemo, useState } from "react";
import { Button, Form } from "@heroui/react";
import type { Problem } from "@engine/kernel";
/* ⚠️ Aliased — this screen's state is called `problem` too. See SignIn. */
import { EEA, slugOk, problem as raise, refusedOn } from "@engine/kernel";
import { PROBLEMS } from "../problems.js";
import { api } from "../api.js";
import { byName } from "../countries.js";
import { accountUrl, here, tenantUrl, type Where } from "../door.js";
import {
  Arrival, AsideRoute, Group, Lookup, SPACE, TextInput, ToggleRow, Trouble, appFace,
} from "@engine/design";

/** What this deployment offers — read, never written down here. See `me.products`. */
interface Product {
  readonly id: string;
  readonly name: string;
  readonly mark: string;
}

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

  /*
    ⚠️ `null` UNTIL IT IS KNOWN, AND THE CARD IS NOT DRAWN UNTIL THEN. An empty
    array seeded as a starting value renders "no products" as a fact for the
    length of the round trip — a wrong answer wearing a loading state's excuse.
  */
  const [products, setProducts] = useState<readonly Product[] | null>(null);
  /* ⚠️ `null` UNTIL THE CATALOGUE ARRIVES, FOR THE SAME REASON AS THE LIST ABOVE.
     An empty array here is a claim — "nothing is ticked" — made before there is
     anything to tick, and the button reads it as a form somebody left blank. */
  const [want, setWant] = useState<readonly string[] | null>(null);

  useEffect(() => {
    void (async () => {
      const out = await api.get<{ items: readonly Product[] }>("me.products");
      /*
        ⚠️ A CATALOGUE THAT WOULD NOT LOAD IS NOT AN EMPTY CATALOGUE. Returning
        here left `products` at its waiting value forever — so the card that
        picks what the workspace starts with never appeared, and founding
        proceeded with nothing chosen. Nothing failed visibly; the question was
        simply never asked, which is the worse half of the same fault.
      */
      if (!out.ok) { setProblem(out.problem); return; }
      setProblem(null);
      setProducts(out.value.items);
      /*
        ⚠️ EVERY PRODUCT IS TICKED, BECAUSE ONE MEMBERSHIP BUYS ALL OF THEM. The
        plans are the deployment's and their entitlement keys are the UNION of
        every app's — Solo's own line is "everything we make" — so a workspace
        that lands with one product switched on is not a workspace that saved
        money, it is one that was quietly given less than it paid for.

        ⚠️ THIS TOOK THE FIRST ONE, AND THE DAY A SECOND PRODUCT WAS REGISTERED
        THAT STOPPED BEING THE SAME THING. With one product in the catalogue,
        "the first" and "all of them" are indistinguishable and the card below
        stands down; with two, founding began asking a question and pre-answering
        it with half the answer. Nothing failed — the new workspace simply had a
        destination missing from its bar, and no screen anywhere said why.

        ⚠️ SO THE CARD IS AN UNTICK RATHER THAN A CHOICE. Somebody who knows they
        will never keep stock turns it off here or later; the default is what the
        membership actually includes.
      */
      setWant(out.value.items.map((p) => p.id));
    })();
  }, []);

  const countries = useMemo(() => byName(), []);
  const address = chosen ? slug : slugFrom(name);
  const addressOk = address.length > 0 && slugOk(address);

  const create = async () => {
    /*
      ⚠️ EVERY MISSING FIELD AT ONCE, EACH AGAINST ITS OWN INPUT. This was a
      chain that stopped at the first one and put its sentence in a banner over
      the form — so somebody with three empty fields fixed one, pressed the
      button, and was told about the next. `Problem.fields` is the channel for
      exactly this, and `platform.invalid` is what it is: the values are wrong,
      and which ones is in `fields`.
    */
    const fields: Record<string, string> = {};
    if (!name.trim()) fields["name"] = "Give the workspace a name";
    if (!addressOk) fields["slug"] = "Letters, numbers and hyphens only";
    if (!country) fields["country"] = "Say where the business is";
    if (!want?.length) fields["apps"] = "Choose at least one";
    if (Object.keys(fields).length) {
      setProblem(raise(PROBLEMS, "platform.invalid", {}, { fields }));
      return;
    }
    setBusy(true);
    setProblem(null);
    const out = await api.post<{ slug: string }>("me.tenant.create", {
      name: name.trim(), slug: address, country, apps: want ?? [],
    });
    setBusy(false);
    if (!out.ok) return setProblem(out.problem);
    /* ⚠️ Straight in. A "workspace created" screen with a link on it is a step
       whose only content is congratulating somebody. */
    location.assign(tenantUrl(out.value.slug, where, location));
  };

  return (
    <Arrival
      name="Start a workspace"
      claim="A business, with everybody in it. Invite them once it exists."
      aside={(
        <AsideRoute
          says="Already have one?"
          label="Go to your workspaces"
          href={accountUrl(where, here())}
        />
      )}
    >
      {problem ? <Trouble problem={problem} /> : null}

      <Form className={`flex flex-col ${SPACE.snug}`} onSubmit={(e) => { e.preventDefault(); void create(); }}>
        {/* ⚠️ NO `isRequired`, WHICH IS WHAT DRAWS THE RED ASTERISK. Every field
            on this screen is required — a marker beside all three says nothing
            except that the product marks things, and it is the same noise that
            was removed from the sign-in. What is missing is said when somebody
            presses the button, once, in words. */}
        <TextInput
          label="What is it called?"
          name="name"
          value={name}
          onChange={setName}
          disabled={busy}
          autoFocus
          placeholder="Northwind Fitness"
          error={refusedOn(problem, "name")}
        />

        <TextInput
          label="Its address"
          name="slug"
          value={address}
          onChange={(next) => { setChosen(true); setSlug(next); }}
          disabled={busy}
          placeholder="northwind"
          /* ⚠️ WHILE TYPING IT IS THE LIVE CHECK; AFTER A PRESS IT IS THE
             REFUSAL. Both are the same sentence about the same input, so they
             share one slot rather than stacking two messages under it. */
          error={address.length > 0 && !addressOk
            ? "Letters, numbers and hyphens only — it is a web address, so it has to be one."
            : refusedOn(problem, "slug")}
          /* ⚠️ THE PREVIEW IS AN ADDRESS OR IT IS NOTHING. With the field empty
             it rendered `….localhost`, which is not a URL, is not a hint, and is
             the first thing on the screen that looks broken. Nothing is said
             until there is something to say. */
          help={address ? `${address}.${where.root}` : "This is where the workspace will live"}
        />

        {/* ⚠️ Said before it is chosen, not discovered afterwards: where the
            records live follows from this answer. */}
        <Lookup
          label="Where is the business?"
          value={country}
          onChange={setCountry}
          disabled={busy}
          placeholder="Search countries…"
          options={countries.map((c) => ({ id: c.code, label: c.name }))}
          error={refusedOn(problem, "country")}
          help={country && EEA.includes(country)
            ? "Records for this workspace stay in the EU."
            : "This decides where the workspace's records are kept."}
        />

        {/*
          ⚠️ THE PRODUCTS, AND ONLY WHERE THERE IS A CHOICE. This deployment used
          to found every workspace with one hardcoded product whatever anybody
          came for, and the only way to change it afterwards was to ask us.

          ⚠️ ONE PRODUCT MEANS NO CARD. A question with a single answer, already
          ticked, is a step somebody has to read to discover it is not a step.
          ⚠️ AND NOTHING IS DRAWN WHILE THE LIST IS UNKNOWN — see `products`.
        */}
        {products && products.length > 1 ? (
          <Group
            label="Everything is included"
            under="Turn off what you will not use. You can change this later"
          >
            {products.map((p) => (
              <ToggleRow
                key={p.id}
                /* ⚠️ THE PRODUCT'S OWN FACE, not a category glyph — a list of
                   products under identical cogs is a list where the label is the
                   only thing telling them apart. */
                face={appFace(p.id, p.mark)}
                label={p.name}
                value={want?.includes(p.id) ?? false}
                isDisabled={busy}
                onChange={(on) => setWant((held) => (on
                  ? [...(held ?? []), p.id]
                  : (held ?? []).filter((id) => id !== p.id)))}
              />
            ))}
          </Group>
        ) : null}

        {/* ⚠️ Live at rest, like every other primary here. Disabled until three
            fields are right, it is a grey slab for the whole time somebody is
            filling the form in — and it never says which of the three is the
            one holding it back. */}
        <Button type="submit" variant="primary" size="lg" fullWidth isPending={busy}>
          Create it
        </Button>
      </Form>
    </Arrival>
  );
}

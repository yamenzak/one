/**
 * THE SETUP DOOR — where a workspace is made, and the only place one is.
 *
 * ⚠️ THE OPERATION HAS EXISTED SINCE THE RUNTIME DID AND NOTHING CALLED IT.
 * `identity.workspace.create` writes the directory, places the tenant in a
 * region, founds its first membership and refuses an address nobody was let into
 * — verified, audited, tested, and reachable only from a test harness. That is
 * the same failure the door was written to close, one door along: the whole of
 * this platform is behind having a workspace, and there was no way to get one.
 *
 * ⚠️ IT IS ON THE PRODUCT'S OWN `setup.` HOST, NOT IN THE ACCOUNT CENTRE, and
 * that is a fact about workers rather than about navigation. The account centre
 * is served by one worker; every product is a different one with its own regional
 * bindings and its own schema, and it cannot reach them. So the account centre
 * says who may open what and hands over; this screen is what they arrive at.
 *
 * ⚠️ AND THERE IS NO PLAN STEP HERE. Choosing what to pay is a write against a
 * workspace that does not exist yet — `billing.choose` resolves its tenant from
 * the host, and this host has none. A workspace with no plan arrives read-only
 * with reason `setup` and the product asks there, on its own address, where the
 * answer can actually be recorded. A plan picker on this screen would be a
 * question asked one origin too early, and the way that fails is a choice
 * silently not saved.
 */

import { useEffect, useState, type ElementType, type ReactNode } from "react";
import type { Problem } from "@one/kernel";
import { slugProblem } from "@one/kernel";
import { Button } from "./button.js";
import { Choose, type Option } from "./choose.js";
import { Field } from "./field.js";
import { Card, Item } from "./list.js";
import { Screen, Section, Title } from "./screen.js";

/* ------------------------------------------------------------------ the address --- */

/**
 * WHAT SOMEBODY CALLED IT, AS A DNS LABEL.
 *
 * ⚠️ PURE, BECAUSE THIS IS THE PART THAT IS WRONG QUIETLY. "Haddad Strength &
 * Co." has an ampersand, a full stop and two spaces in it, and every one of them
 * is a hostname somebody would be refused for after typing a name that looked
 * perfectly reasonable. Derived here, the suggestion is always legal; checked
 * only on the server, the first thing a new customer meets is a refusal.
 *
 * ⚠️ IT NEVER PRODUCES A LEADING OR TRAILING HYPHEN, which is the one shape a
 * naive replace gets wrong and the one a DNS label may not have.
 */
export function slugFrom(name: string): string {
  return name
    .toLowerCase()
    /* ⚠️ ESCAPED RATHER THAN WRITTEN OUT. A character class of literal combining
       marks is invisible in every editor and survives one careless save. */
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/g, "");
}

/* ------------------------------------------------------------------------ wire --- */

/** Where a region is, in words somebody chooses between. */
export interface Place {
  readonly id: string;
  readonly label: string;
  /** One line, only where the label leaves a real question. */
  readonly detail?: string;
}

export interface SetupWire {
  /** `identity.workspace.create`. Resolves to the new address or to a refusal. */
  create(input: { slug: string; name: string; region?: string }): Promise<{ slug: string } | Problem>;
}

const isProblem = (v: unknown): v is Problem =>
  typeof v === "object" && v !== null && "code" in v && "title" in v;

/**
 * ⚠️ A REFUSAL BELONGS UNDER THE FIELD THAT CAUSED IT, AND ONLY THAT ONE. Two of
 * the four this route can answer with name a field somebody is looking at — a
 * taken address, an illegal one — and two do not: being let in is not something
 * retyping fixes, and neither is a region this deployment does not have. Sending
 * all four to the same place gets one of the pairs wrong whichever place is
 * chosen, which is why this is a function rather than a `catch`.
 */
export const fieldOf = (problem: Problem): "slug" | null => {
  const named = (problem as unknown as { readonly meta?: { readonly field?: unknown } }).meta?.field;
  return named === "slug" ? "slug" : null;
};

/* ---------------------------------------------------------------------- screen --- */

export interface SetupProps {
  /** The product this door belongs to — the name over it, as everywhere else. */
  readonly product: string;
  /** `kova.4dl.app`. What the address somebody picks will sit under. */
  readonly root: string;
  /**
   * ⚠️ WHERE IT MAY BE PUT, AND ONE IS THE ORDINARY CASE. A deployment with a
   * single region has nothing to ask, and a picker with one option is a question
   * with one answer — the same rule the account centre's hand-off follows.
   */
  readonly places?: readonly Place[];
  readonly wire: SetupWire;
  /** Called with the address that now exists. The caller owns the hand-over. */
  readonly onMade: (slug: string) => void;
  readonly Heading?: ElementType;
}

export function SetupScreen({ product, root, places = [], wire, onMade, Heading = "h1" }: SetupProps): ReactNode {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  /*
    ⚠️ THE ADDRESS FOLLOWS THE NAME UNTIL SOMEBODY TOUCHES IT, AND THEN NEVER
    AGAIN. A field that keeps re-deriving overwrites what was deliberately typed
    on the next keystroke somewhere else — which reads as the form fighting back,
    and is the single most common defect in this exact pattern.
  */
  const [own, setOwn] = useState(false);
  const [place, setPlace] = useState(places[0]?.id ?? "");
  const [picking, setPicking] = useState(false);
  const [wrong, setWrong] = useState<string | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [making, setMaking] = useState(false);

  useEffect(() => { if (!own) setSlug(slugFrom(name)); }, [name, own]);

  const make = async () => {
    const wanted = slug.trim();
    /*
      ⚠️ CHECKED WITH THE SERVER'S OWN FUNCTION, not with a second regular
      expression that agrees today. `slugProblem` is in the kernel precisely so
      the field and the route cannot drift; a rule copied into a screen is a rule
      that says an address is fine and is then refused by the only opinion that
      counts.
    */
    const bad = wanted.length === 0 ? "Pick an address" : slugProblem(wanted, []);
    if (bad) { setWrong(bad === "not a valid address" ? "Letters, numbers and hyphens only." : "That address is taken."); return; }
    setWrong(null);
    setProblem(null);
    setMaking(true);
    const made = await wire.create({ slug: wanted, name: name.trim(), ...(place ? { region: place } : {}) });
    setMaking(false);
    if (isProblem(made)) {
      if (fieldOf(made) === "slug") { setWrong(made.detail ?? made.title); return; }
      setProblem(made);
      return;
    }
    onMade(made.slug);
  };

  const here = places.find((p) => p.id === place);

  return (
    /* ⚠️ THE SAME FRAME AND THE SAME WEATHER AS THE DOOR, because it is the same
       arrival — a person one screen further into the same five minutes. */
    <Screen leave="none" name={`Start on ${product}`} sky="silk"
      title={<Title as={Heading}>Name your workspace</Title>}
      lede="The name can change later. The address cannot."
    >
      <Section>
        <form className="form" onSubmit={(e) => { e.preventDefault(); void make(); }}>
          <Field
            label="What it is called"
            value={name}
            onValue={(next) => { setName(next); setWrong(null); }}
            autoFocus
            autoCapitalize="words"
            enterKeyHint="next"
            clearable
          />
          {/*
            ⚠️ THE WHOLE HOSTNAME IS SHOWN, AND IT IS UNDER THE FIELD RATHER THAN
            AFTER IT. This is a public address people will type and link to, and a
            field showing `my-gym` alone reads as a nickname — which is how
            somebody picks one they would not have chosen written out. Placed as
            the form's next child it sat exactly as far from the field as from the
            button, which made a line about the address read as a line about
            pressing Create.
          */}
          <Field
            label="Its address"
            value={slug}
            onValue={(next) => { setOwn(true); setSlug(slugFrom(next)); setWrong(null); }}
            wrong={wrong}
            under={slug ? `${slug}.${root}` : `your-address.${root}`}
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
          />

          {/*
            ⚠️ ONLY WHERE THERE IS SOMETHING TO CHOOSE, AND ABOVE THE BUTTON. Where
            a workspace's records live is decided once and never edited afterwards,
            so it belongs beside the address — the other permanent answer here. Put
            after the form it sat BELOW the control that commits it, which is a
            permanent decision somebody presses past without reading.
          */}
          {places.length > 1 ? (
            <Card>
              {/* ⚠️ NO ICON, AND THE REASON IS WRITTEN IN `icon.tsx`. There is no
                  glyph that means a place: a globe and a ring of stars were both
                  tried, both were shapes a drawing library happened to have doing
                  duty as emblems, and both went. A region is a label. */}
              <Item
                title="Where its records are kept"
                detail={here?.label ?? "Choose"}
                onGo={() => setPicking(true)}
              />
            </Card>
          ) : null}

          {problem ? (
            <p className="note wrong" role="alert">
              <strong>{problem.title}</strong>
              {problem.detail ? <> {problem.detail}</> : null}
              <span className="note-ref">{problem.ref}</span>
            </p>
          ) : null}

          <div className="actions">
            <Button tone="loud" wide type="submit" data-state={making ? "working" : undefined} disabled={making || !slug}>
              {making ? "Creating" : "Create workspace"}
            </Button>
          </div>
        </form>
      </Section>

      <Choose<string>
        open={picking}
        title="Where its records are kept"
        options={places.map((p): Option<string> => ({ value: p.id, label: p.label, ...(p.detail ? { detail: p.detail } : {}) }))}
        value={place}
        onPick={(next) => setPlace(next)}
        onClose={() => setPicking(false)}
      />
    </Screen>
  );
}

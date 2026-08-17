/**
 * THIS WORKSPACE'S IDENTITY — one brand, every app under it (D22).
 *
 * ⚠️ IT IS REACHED FROM THE WORKSPACE AND NOT FROM A PRODUCT, which is the whole
 * correction. A business with three of our products has ONE logo, one colour and
 * one tile on a phone; a brand edited inside a product would be three editors,
 * three places to change it, and two of them stale the week after the first.
 *
 * ⚠️ AND A PERSONAL WORKSPACE SEES THE OFFER RATHER THAN A LOCKED EDITOR. Hiding
 * the row would leave "become a business" as a fact somebody has to be told;
 * drawing the controls and refusing every save is a screen that lies. The empty
 * state carries the way forward, which is what an empty state is for.
 */

import * as React from "react";
import { Button } from "@heroui/react";
import { field, mayBrand, type Kind, type Theme } from "@engine/kernel";
import {
  BrandTile, Center, ControlRow, Field, Group, Row, Screen, Stack, TextInput, ToggleRow,
  notice, ready,
} from "@engine/design";
import { api } from "../api.js";
import { useLoad } from "./data.js";

/**
 * ⚠️ THE TOKENS A WORKSPACE EDITS, DECLARED — so each gets the control its kind
 * implies, from the one renderer every settings screen uses.
 *
 * ⚠️ AND THE MARK IS NOT A COLOUR, SO IT IS NOT UNDER "COLOUR". It was, and that
 * one misfiling is most of what made the card read as crammed: a group named for
 * one kind of thing, holding three of them and a text field. The mark is what
 * the TILE says, so it belongs beside the tile.
 */
const COLOURS = {
  ground: field.colour({ label: "Behind everything", holds: "none" }),
  ink: field.colour({ label: "Words and marks", holds: "none" }),
  accent: field.colour({ label: "What draws the eye", holds: "none" }),
} as const;

const MARK = field.text({
  label: "Letter", holds: "none", max: 2,
  help: "One or two characters. Your initial if you leave it",
});

/** What `brand.read` answers. */
interface BrandAnswer {
  readonly kind: Kind;
  readonly branding: {
    readonly theme: Theme;
    readonly surfaces: readonly string[];
    readonly ourMark?: boolean;
  } | null;
  readonly surfaces: readonly string[];
}

/**
 * ⚠️ THE SURFACES A WORKSPACE MAY BRAND ARE THE PLATFORM'S CLOSED SET, and their
 * words are here because a wire value is not copy (DESIGN.md). `shell` on a
 * screen is a key somebody has to translate.
 */
const SAID: Readonly<Record<string, { readonly label: string; readonly under: string }>> = {
  shell: { label: "The app itself", under: "Colour, and your mark in the corner" },
  email: { label: "Email", under: "Anything sent from here" },
  documents: { label: "Documents", under: "Anything printed or downloaded" },
  "sign-in": { label: "Signing in", under: "The page before anybody is in" },
  public: { label: "Public pages", under: "Anything people outside can open" },
  "app-icons": { label: "The installed app", under: "The tile on a home screen" },
};

export function Brand({ name, slug }: {
  readonly name: string;
  readonly slug: string;
}) {
  const of = useLoad<BrandAnswer>("brand.read");
  return (
    <Screen
      shape="detail"
      of={of.of}
      again={of.again}
      then={(answer) => <Editor name={name} slug={slug} answer={answer} again={of.again} />}
    />
  );
}

function Editor({ name, slug, answer, again }: {
  readonly name: string;
  readonly slug: string;
  readonly answer: BrandAnswer;
  readonly again: () => void;
}) {
  /* ⚠️ ASKED, NEVER COMPARED. The screen and the gate read one function, so a
     screen cannot come to offer what a route refuses — and the day what
     commercial buys changes, this file does not have to be found. */
  const commercial = mayBrand(answer.kind);

  const [theme, setTheme] = React.useState<Theme>(answer.branding?.theme ?? {});
  const [surfaces, setSurfaces] = React.useState<readonly string[]>(
    answer.branding?.surfaces ?? [],
  );

  /*
    ⚠️ A SAVE BUTTON, BECAUSE THE SERVER MAY REFUSE. An unreadable pair is
    refused rather than warned about (`refuseTheme`), so a control applying on
    every keystroke would roll back while somebody was still typing the second
    colour of the pair.
  */
  const save = async () => {
    const out = await api.post("brand.write", { theme, surfaces });
    if (!out.ok) { notice.fail(out.problem.title); return; }
    notice.ok("Saved.");
    again();
  };

  /*
    ⚠️ A PERSONAL WORKSPACE IS A LEGITIMATE NOTHING FOR THIS SCREEN, and saying
    so through `isNothing` rather than returning an empty state as content is
    what puts it in the middle of the page. Drawn as content it sits under the
    heading with the viewport blank beneath it, which reads as a page that
    stopped loading.
  */
  if (!commercial) {
    return (
      <Screen
        shape="detail"
        of={ready(false)}
        isNothing={() => true}
        nothing={{
          says: "This is for business workspaces",
          under: `Make ${name} a business and it carries your logo, your colour and your icon across every app here. It cannot be undone.`,
          does: <Become name={name} slug={slug} again={again} />,
        }}
      />
    );
  }

  return (
    <Stack space="roomy">
      {/* ⚠️ THE TILE FIRST, BECAUSE IT IS WHAT IS BEING DECIDED. Controls above a
          preview make somebody change a value and go looking for the result. */}
      {/* ⚠️ THE TILE IS NOT A ROW, SO IT IS NOT IN A CARD OF ROWS. It is one
          object being decided, centred, with air around it — `Center` owns that
          and a hand-written `py-6` inside a `Group` does not. */}
      <Group label="On a home screen" under="What your staff will look for">
        <Center space="roomy">
          <BrandTile
            name={name}
            ground={theme.ground || "#111113"}
            ink={theme.ink || "#f4f4f5"}
            glyph={theme.mark}
          />
        </Center>
        <ControlRow label={MARK.label} under={MARK.help}>
          <Field
            bare
            name="mark"
            spec={MARK}
            value={theme.mark ?? ""}
            onChange={(value) => setTheme((was) => ({ ...was, mark: String(value ?? "") }))}
          />
        </ControlRow>
      </Group>

      {/* ⚠️ `ControlRow` PER TOKEN, WHICH IS WHAT THE SHAPE IS FOR — its own
          header names a colour as the case it exists to carry. Raw `Field`s in a
          `Stack` gave three inline triggers and one stacked text field in one
          card: four controls, two grammars, no row height in common and no
          column the labels shared. */}
      <Group label="Colour" under="Refused if the pair is too close to read">
        {(Object.keys(COLOURS) as (keyof typeof COLOURS)[]).map((key) => (
          <ControlRow key={key} label={COLOURS[key].label}>
            <Field
              bare
              name={key}
              spec={COLOURS[key]}
              value={theme[key] ?? ""}
              onChange={(value) => setTheme((was) => ({ ...was, [key]: String(value ?? "") }))}
            />
          </ControlRow>
        ))}
      </Group>

      {/* ⚠️ THE PLATFORM'S SET, NARROWED BY WHAT THE APPS HERE ACTUALLY HAVE —
          the server answers that intersection, so a workspace is never offered a
          surface that would change nothing anywhere. */}
      {/* ⚠️ ROWS GO STRAIGHT INTO THE CARD. A `Stack` around them adds a gap
          between things a card already separates by rhythm, so the run reads as
          three cards' worth of spacing inside one card. */}
      <Group label="Where it shows" under="Only what the apps here have">
        {answer.surfaces.map((id) => (
          <ToggleRow
            key={id}
            label={SAID[id]?.label ?? id}
            under={SAID[id]?.under}
            value={surfaces.includes(id)}
            onChange={(on) => setSurfaces((was) =>
              on ? [...was, id] : was.filter((s) => s !== id))}
          />
        ))}
      </Group>

      <Row>
        <Button variant="primary" onPress={() => void save()}>Save</Button>
      </Row>
    </Stack>
  );
}

/**
 * ⚠️ THE WAY OUT OF THE EMPTY STATE, WHICH LIVES INSIDE IT. Sending somebody to
 * another screen to type a legal name would be a second destination for a
 * decision with one field in it.
 *
 * ⚠️ AND IT IS ONE WAY, SAID BEFORE IT IS PRESSED rather than in a confirmation
 * afterwards. A dialog asking "are you sure" about something already decided is
 * a speed bump; the sentence over the button is what somebody actually reads.
 */
function Become({ name, slug, again }: {
  readonly name: string;
  readonly slug: string;
  readonly again: () => void;
}) {
  const [legalName, setLegalName] = React.useState("");

  const become = async () => {
    const out = await api.post("me.tenant.commercial", { slug, legalName });
    if (!out.ok) { notice.fail(out.problem.title); return; }
    notice.ok(`${name} is a business.`);
    again();
  };

  return (
    <Stack space="snug">
      <TextInput
        label="Legal name"
        value={legalName}
        onChange={setLegalName}
        help="Who is trading. It goes on invoices and on anything we are bound by."
      />
      <Row>
        <Button
          variant="primary"
          isDisabled={!legalName.trim()}
          onPress={() => void become()}
        >
          Make it a business
        </Button>
      </Row>
    </Stack>
  );
}

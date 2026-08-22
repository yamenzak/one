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
import { field, mayBrand, type Kind, type Problem, type Theme } from "@engine/kernel";
import {
  BrandTile, Center, EditRow, Group, PickFile, Row, Screen, Stack, TextInput, ToggleRow,
  glyphOf, notice, ready,
} from "@engine/design";
import { api } from "../api.js";
import { useLoad } from "./data.js";

/**
 * ⚠️ THREE FIELDS, AND ALL THREE ARE THE TILE'S. There was a fourth — an accent
 * — and it painted the INTERFACE: the ground behind every page, the wash on
 * every card, the one coloured thing on a screen. What a screen is made of is
 * the product's, chosen by whoever designed the screen; what a workspace owns is
 * where its own NAME appears. So these are not "your colours", they are the
 * square of colour their staff will look for on a phone, and the labels say so.
 */
const TILE = {
  ground: field.colour({ label: "Tile colour", holds: "none" }),
  ink: field.colour({ label: "Letter colour", holds: "none" }),
} as const;

const MARK = field.text({
  label: "Letter", holds: "none", max: 2,
  help: "One or two characters. Your initial if you leave it",
});

/**
 * ⚠️ WHERE A REPLY GOES, WHICH IS NOT WHERE THE LETTER CAME FROM. Mail is
 * delivered on the strength of a domain set up to send it, so the `From:` is the
 * deployment's one verified address and cannot be a workspace's — but everything
 * a business tells its own people has somewhere it wants the answer, and without
 * this every reply lands in a mailbox nobody reads.
 */
const REPLY = field.email({
  label: "Where replies go", holds: "contact",
  help: "Left empty, a reply goes nowhere anybody reads",
});

/** What `brand.read` answers. */
interface BrandAnswer {
  readonly kind: Kind;
  readonly branding: {
    readonly theme: Theme;
    readonly surfaces: readonly string[];
    readonly ourMark?: boolean;
    readonly replyTo?: string;
  } | null;
  readonly surfaces: readonly string[];
  /** ⚠️ Whether there is one and how big — never the bytes, which the browser
      is already caching from `/icon.png`. */
  readonly icon: { readonly width: number; readonly bytes: number } | null;
}

/**
 * ⚠️ THE SURFACES A WORKSPACE MAY BRAND ARE THE PLATFORM'S CLOSED SET, and their
 * words are here because a wire value is not copy (DESIGN.md). `sign-in` on a
 * screen is a key somebody has to translate.
 */
const SAID: Readonly<Record<string, { readonly label: string; readonly under: string }>> = {
  email: { label: "Email", under: "Anything sent from here" },
  documents: { label: "Documents", under: "Anything printed or downloaded" },
  "sign-in": { label: "Signing in", under: "The page before anybody is in" },
  public: { label: "Public pages", under: "Anything people outside can open" },
  "app-icons": { label: "The installed app", under: "The tile on a home screen" },
};

/**
 * ⚠️ A REFUSED SWITCH HAS NOWHERE ELSE TO SAY SO, which is `settings.tsx`'s
 * argument one screen over. Every other row opens a sheet and the refusal
 * renders in it; a toggle applied instantly, so the sentence goes where instant
 * failures go rather than nowhere.
 */
const flip = async (said: Promise<Problem | null>): Promise<void> => {
  const why = await said;
  if (why) notice.fail(why.title);
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

/**
 * ⚠️ EXPORTED FOR ONE REASON: SO IT CAN BE LOOKED AT. `Brand` fetches, so a test
 * of it is a test of `useLoad`; the editor takes its answer as a prop, so it can
 * be rendered and read. This screen was rewritten twice — onto the row grammar,
 * then onto the edit sheet — with nothing rendering it either time, which is a
 * screen changed by inference from a neighbouring one.
 */
export function Editor({ name, slug, answer, again }: {
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
  const [replyTo, setReplyTo] = React.useState(answer.branding?.replyTo ?? "");
  const [icon, setIcon] = React.useState(answer.icon ?? null);
  const [sending, setSending] = React.useState(false);

  /*
    ⚠️ THE BYTES GO AS THE BODY, NOT INSIDE JSON. Base64 in a field would be a
    third larger and would have to be decoded before anything could look at the
    file's own header — and the header is what says whether this is a PNG at all,
    which is the one thing a `content-type` from a browser cannot be trusted for.

    ⚠️ AND THE PREVIEW IS CACHE-BUSTED BY THE NEW SIZE. `/icon.png` is served
    with five minutes of caching, which is right for every visitor and wrong for
    the one person who has just changed it — they would upload a logo and watch
    the old one stay.
  */
  const upload = async (bytes: ArrayBuffer): Promise<void> => {
    setSending(true);
    const out = await api.post<{ icon: { width: number; bytes: number } }>(
      "brand.icon", bytes, { contentType: "image/png" });
    setSending(false);
    if (!out.ok) {
      /* ⚠️ THE FIELD SENTENCE IF THERE IS ONE — `setIcon` answers six different
         refusals and each is a different thing to do next. */
      notice.fail(out.problem.fields?.icon ?? out.problem.title);
      return;
    }
    setIcon(out.value.icon);
    notice.ok("Saved.");
    again();
  };

  const clear = async (): Promise<void> => {
    setSending(true);
    const out = await api.post("brand.icon", { clear: true });
    setSending(false);
    if (!out.ok) return notice.fail(out.problem.title);
    setIcon(null);
    notice.ok("Removed.");
    again();
  };

  /*
    ⚠️ ONE ROW AT A TIME, AND THE SCREEN'S SAVE BUTTON IS GONE WITH IT. It was
    there because the server refuses an unreadable ground/ink pair rather than
    warning about it, and a control applying on every keystroke would have rolled
    back while somebody was still typing the second colour of the pair. A sheet
    answers that better than a page-level Save did: the change is deliberate, it
    lands whole, and the refusal appears against the colour that caused it
    instead of over a card of four controls with no way to tell which.

    ⚠️ NOTHING IS COMMITTED LOCALLY UNTIL THE SERVER TAKES IT. Optimism here
    would leave the row showing a colour the workspace does not have, and the
    sheet is still open holding the draft, so there is nothing to preserve by
    guessing.
  */
  const write = async (next: {
    readonly theme?: Theme;
    readonly surfaces?: readonly string[];
    readonly replyTo?: string;
  }): Promise<Problem | null> => {
    const body = {
      theme: next.theme ?? theme,
      surfaces: next.surfaces ?? surfaces,
      replyTo: next.replyTo ?? replyTo,
    };
    const out = await api.post("brand.write", body);
    /* ⚠️ THE WHOLE REFUSAL, NOT ITS TITLE. `refuseTheme` answers "that pair is
       too close to read" with a detail saying which two — narrowing it to one
       line here would throw away the half that says what to do. */
    if (!out.ok) return out.problem;
    setTheme(body.theme);
    setSurfaces(body.surfaces);
    setReplyTo(body.replyTo);
    notice.ok("Saved.");
    again();
    return null;
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
          icon: glyphOf("workspace"),
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
      <Group label="On a home screen" under="What your staff look for. A pair too close to read is refused">
        <Center space="roomy">
          {/* ⚠️ THE UPLOAD IS SHOWN AS THE TILE, NOT BESIDE IT. A preview that
              kept drawing the letter while a logo was stored would be a screen
              disagreeing with the phone it is describing. */}
          {icon ? (
            <img
              src={`/icon.png?v=${icon.bytes}`}
              alt=""
              width={96}
              height={96}
              className="size-24 rounded-2xl"
            />
          ) : (
            <BrandTile
              name={name}
              ground={theme.ground || "#111113"}
              ink={theme.ink || "#f4f4f5"}
              glyph={theme.mark}
            />
          )}
        </Center>

        {/*
          ⚠️ THE PICKER IS THE LIBRARY'S — see `PickFile`. It checks the type and
          the size before a byte is sent, which is the difference between being
          told your logo is a JPEG now and being told it after an upload; the
          server checks both again, because a client check is a courtesy.
        */}
        <PickFile
          accept={["image/png"]}
          most={128 * 1024}
          says={icon ? "Replace your icon" : "Add your own icon"}
          under={`A square PNG, ${256}–${1024} pixels a side. PNG only — an SVG can carry script, and this is served from your own address.`}
          busy={sending}
          onPick={upload}
          onClear={icon ? clear : undefined}
        />

        {/* ⚠️ THE LETTER STAYS, AND IS NOT HIDDEN BEHIND THE UPLOAD. It is what
            a browser tab shows (the SVG sets it — a Worker has no font), so it
            is still the mark somebody sees most often. */}
        <EditRow
          spec={MARK}
          name="mark"
          value={theme.mark ?? ""}
          onSave={(value) => write({ theme: { ...theme, mark: String(value ?? "") } })}
        />

        {/* ⚠️ THE TWO COLOURS ARE IN THIS CARD AND NOT IN ONE OF THEIR OWN. They
            are what the square above is made of — a "Colour" group beside a
            "On a home screen" group was two cards for one object, and the second
            one read as though it were about the app.

            ⚠️ THE SWATCH AND THE HEX ARE WHAT THE ROW SAYS; THE PICKER IS BEHIND
            THE PENCIL. Applied on a keystroke, against a server that refuses a
            pair it cannot read, the row rolls back while somebody is still
            typing the second colour of the pair. */}
        {(Object.keys(TILE) as (keyof typeof TILE)[]).map((key) => (
          <EditRow
            key={key}
            spec={TILE[key]}
            name={key}
            value={theme[key] ?? ""}
            onSave={(value) => write({ theme: { ...theme, [key]: String(value ?? "") } })}
          />
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
            /* ⚠️ A SWITCH SAVES ITSELF — see `edit.tsx`. It is its own value and
               one press undoes it, so a sheet around it would be two presses to
               say a thing the row already says. */
            onChange={(on) => void flip(write({
              surfaces: on ? [...surfaces, id] : surfaces.filter((s) => s !== id),
            }))}
          />
        ))}
      </Group>

      {/*
        ⚠️ ONLY WHERE A PRODUCT HERE ACTUALLY SENDS MAIL — the same rule as the
        surfaces above it, answered by the server. An address collected from a
        workspace whose products send nothing is a field that changes nothing.

        ⚠️ AND IT IS UNDER THE SWITCH RATHER THAN BESIDE IT, because that is what
        it does: a reply address takes effect where a workspace's email is theirs,
        so a card offering it with the switch off would collect an address and
        quietly not use it.
      */}
      {answer.surfaces.includes("email")
        ? (
          <Group
            label="Email"
            under={surfaces.includes("email")
              ? "What your people write back to"
              : "Turn Email on above and this is what replies go to"}
          >
            <EditRow
              spec={REPLY}
              name="replyTo"
              value={replyTo}
              onSave={(value) => write({ replyTo: String(value ?? "") })}
            />
          </Group>
        )
        : null}
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

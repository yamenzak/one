/**
 * THE FOUR BLOCKS THAT ARE ONLY EVER SEEN INSIDE A PRODUCT, ON ONE PAGE.
 *
 * ⚠️ A GRID, A RAIL, A VOCABULARY AND A BARCODE ARE ALL SHIPPED AND ALL BURIED.
 * Each is drawn on exactly one screen of one app, behind a sign-in, in a state
 * that needs a workspace with content in it — so "does the library have one" is
 * a question nobody could answer by looking. This specimen is the answer, and it
 * is a mount rather than a static render because two of the four only exist once
 * something has run: the rail's paging is a scroll listener, and the vocabulary
 * is a field somebody types into.
 *
 * ⚠️ IT IS NOT A GALLERY OF EVERY EXPORT AND MUST NOT BECOME ONE. `showcase`
 * already refuses an export nothing draws; what this is for is the handful whose
 * only rendering is somewhere a photograph cannot reach.
 *
 * ⚠️ THE BARCODE IS `onScreen`, WHICH IS THE ONE PROP TO GET RIGHT HERE. On
 * paper a symbol is ink on white whatever the theme; in an interface it follows
 * the interface, and a white card in a dark form is a hole. Both are `Bars` —
 * this shows the interface one.
 */

import * as React from "react";
import { createRoot } from "react-dom/client";
import {
  Bars, Glass, Grid, Group, Rail, Screen, Section, Stack, Tags, TileGrid, Words, glyphOf,
} from "../../src/index.js";

const KNOWN = [
  { id: "pricing", label: "Pricing" },
  { id: "onboarding", label: "Onboarding" },
  { id: "retention", label: "Retention" },
  { id: "roadmap", label: "Roadmap" },
];

/**
 * ⚠️ STAND-INS FOR PHOTOGRAPHS, AND THEY SAY SO. The harness has no network and
 * the question being asked is about the GRID — how a card that leads with a
 * picture sits beside three others, what the glass over it covers, where the
 * words land — which a plausible rectangle answers exactly as well as a real
 * shelf does. A committed JPEG would be a binary in the repository whose only
 * job is to be a colour.
 */
const shot = (from: string, to: string): string =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200">`
    + `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">`
    + `<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>`
    + `</linearGradient></defs>`
    + `<rect width="320" height="200" fill="url(%23g)"/>`
    + `<rect x="0" y="132" width="320" height="6" fill="#00000022"/>`
    + `<rect x="0" y="168" width="320" height="6" fill="#00000022"/>`
    + `<rect x="36" y="96" width="52" height="40" rx="4" fill="#ffffff26"/>`
    + `<rect x="96" y="86" width="44" height="50" rx="4" fill="#ffffff1c"/>`
    + `<rect x="150" y="104" width="60" height="32" rx="4" fill="#ffffff22"/>`
    + `</svg>`,
  )}`;

const SHELVES = [
  { id: "a", label: "Rack A", under: "Cold room · 12 lines",
    src: shot("#5b6b7a", "#2a3440"), alt: "Steel shelving in a cold room", over: "4 °C" },
  { id: "b", label: "Rack B", under: "Dry store · 31 lines",
    src: shot("#8a7358", "#3d3226"), alt: "Wooden shelving in a dry store", over: "Ambient" },
  { id: "c", label: "Bench", under: "Prep · 6 lines",
    src: shot("#6d7f6a", "#2c3a2b"), alt: "A steel prep bench", over: "In use" },
  { id: "d", label: "Freezer", under: "Cold room · 9 lines",
    src: shot("#6a7b8c", "#243040"), alt: "A chest freezer seen from above", over: "−18 °C" },
] as const;

const TILES = ["Pricing", "Onboarding", "Retention", "Roadmap", "Hiring", "Support"]
  .map((label, i) => ({
    id: label.toLowerCase(),
    label,
    under: `${(i + 2) * 3} notes`,
    icon: glyphOf("note"),
    onOpen: () => undefined,
  }));

function Specimen() {
  const [words, setWords] = React.useState<readonly string[]>(["Pricing", "Retention"]);
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    const id = requestAnimationFrame(() => { setReady(true); });
    return () => { cancelAnimationFrame(id); };
  }, []);

  return (
    <Screen shape="list">
      <div {...(ready ? { "data-ready": "true" } : {})}>
        <Stack space="roomy">
          <Section label="A grid of marks">
            {/* ⚠️ `TileGrid` IS THE ONE WITH A SHAPE; `Grid` IS THE ARRANGEMENT.
                Both are here because they are asked about as one thing and are
                not: a tile brings its own surface, mark and foot, and a grid
                will lay out whatever it is handed. */}
            <TileGrid tiles={TILES} />
          </Section>

          <Section label="A grid of photographs">
            {/*
              ⚠️ THE SAME QUESTION WITH A PICTURE IN IT, AND IT IS A DIFFERENT
              COMPONENT. A tile is a mark, a name and a line — the shape a
              destination grid wants. A card that LEADS with a photograph is the
              thing itself, so the picture reaches the card's own corners
              (`CARD_LEAD`) and the words sit under it. Laying those out is
              `Grid`'s job, which is why it takes whatever it is handed rather
              than a spec.
            */}
            <Grid min="14rem">
              {SHELVES.map((one) => (
                <Group
                  key={one.id}
                  label={one.label}
                  under={one.under}
                  media={{
                    src: one.src,
                    alt: one.alt,
                    over: <Glass label={one.over} />,
                    act: <Glass label="Save this one" icon={glyphOf("star")} only onDo={() => undefined} />,
                  }}
                />
              ))}
            </Grid>
          </Section>

          <Section label="A carousel">
            {/* ⚠️ THE LABEL IS WHAT TURNS A SCROLLER INTO A CAROUSEL. Without it
                `Rail` is a row that scrolls; with it, it counts its own pages,
                says which one is showing and offers a step either way on a
                pointer device. */}
            <Rail label="pinned note">
              {KNOWN.map((one) => (
                <Group key={one.id} label={one.label} under="Updated two days ago">
                  <p>Three people have this open.</p>
                </Group>
              ))}
            </Rail>
          </Section>

          {/*
            ⚠️ TWO CARDS, NOT ONE, AND THE FIRST DRAFT'S SINGLE CARD IS WHY. The
            manager and the display ARE two components — `Words` is what somebody
            edits a vocabulary with, `Tags` is the same set worn read-only on
            every other surface — and stacked inside one card they read as one
            control that has printed its own answer back underneath itself. What
            makes the distinction legible is the thing that separates every other
            pair in this product: a surface each.
          */}
          <Section label="A vocabulary — editing it">
            <Group label="What this note is filed under">
              <Words
                label="Topics"
                value={words}
                onChange={setWords}
                known={KNOWN}
                placeholder="Type a topic"
              />
            </Group>
          </Section>

          <Section label="A vocabulary — wearing it">
            <Group label="Filed under" under="The same set, everywhere it is only read">
              <Tags label="Filed under" items={words.map((w) => ({ id: w, label: w }))} />
            </Group>
          </Section>

          <Section label="A barcode">
            <Group label="EAN-13" under="Drawn from the digits, in the interface's own ink">
              <Bars of="5901234123457" mm={48} onScreen />
            </Group>
          </Section>
        </Stack>
      </div>
    </Screen>
  );
}

createRoot(document.getElementById("root")!).render(<Specimen />);

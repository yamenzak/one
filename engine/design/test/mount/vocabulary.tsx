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
  Bars, Grid, Group, Rail, Screen, Section, Stack, Tags, TileGrid, Words, glyphOf,
} from "../../src/index.js";

const KNOWN = [
  { id: "pricing", label: "Pricing" },
  { id: "onboarding", label: "Onboarding" },
  { id: "retention", label: "Retention" },
  { id: "roadmap", label: "Roadmap" },
];

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
          <Section label="A grid">
            {/* ⚠️ `TileGrid` IS THE ONE WITH A SHAPE; `Grid` IS THE ARRANGEMENT.
                Both are here because they are asked about as one thing and are
                not: a tile brings its own surface, mark and foot, and a grid
                will lay out whatever it is handed. */}
            <TileGrid tiles={TILES} />
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

          <Section label="A vocabulary">
            <Group label="What this note is filed under">
              {/* ⚠️ THE MANAGER AND THE DISPLAY ARE TWO COMPONENTS, and that is
                  the distinction the pair exists to keep. `Words` is the control
                  somebody edits a vocabulary with; `Tags` is the same set worn
                  read-only, which is what every OTHER surface showing them
                  wants. One component doing both is how a detail screen ends up
                  with a text field on it. */}
              <Words
                label="Topics"
                value={words}
                onChange={setWords}
                known={KNOWN}
                placeholder="Type a topic"
              />
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

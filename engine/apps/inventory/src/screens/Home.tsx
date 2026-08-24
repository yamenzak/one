/**
 * HOME — what is on the shelf, what is waiting, and the way in to the rest.
 *
 * ⚠️ A HOME SCREEN IS NOT A SUMMARY OF THE APP, IT IS THE ANSWER TO "IS
 * EVERYTHING ALL RIGHT". Somebody opening an inventory in the morning wants two
 * things in the first second — how much is on the shelf, and what has gone wrong
 * while they were away — and every other block here is subordinate to those.
 * A dashboard that leads with a chart makes them read a picture to find out
 * whether there is anything to do.
 *
 * ⚠️ THE QUICK ROW IS WHAT THE BAR DOES NOT ALREADY HOLD. A shortcut to
 * something a thumb reaches in one tap from every screen in the product is a
 * second answer to the same question, and the pair drift the day either moves.
 * Scanning and counting are destinations; adding a product, printing, importing
 * and the people it is bought from are not, so those are the ones offered here.
 *
 * ⚠️ AND THE ROW HOLDS FOUR, NOT AS TASTE BUT AS ARITHMETIC — `QuickActions`
 * draws four and DROPS a fifth without a word, because at 80px with a 24px gap
 * five do not fit a phone. So adding one here means removing one, which is why
 * receiving is now reached from Stock: "put some of this away" is thought of
 * while looking at the shelf, and the catalogue has to exist before anything
 * can go on it.
 *
 * ⚠️ AND A NUMBER NOBODY MAY SEE IS `null`, NEVER `0`. "Nothing is waiting" and
 * "you are not allowed to know" are opposite sentences, and a zero prints the
 * first over the second — so a counter with no sight of the production runs is
 * told everything has been released.
 *
 * ⚠️ ONE HERO, AND IT IS THE SHELF. The recorded share is the number Reports
 * leads with, and it is the right hero THERE — a screen about whether the
 * numbers mean anything. Here it is a stat beside two others, because two
 * display-sized figures on one screen is no hero at all.
 */

import {
  Await, ChartPanel, ChartWaiting, FigureWaiting, Group, Guide, Hero, HeroWaiting, LineChart, NavRow,
  NoteRow, Num,
  QuickActions, Screen, Section, SeeAll, Stack, Stat, StatRow, glyphOf,
  useFigures, useGate, type Loaded,
} from "@engine/design";
import type { Raised } from "@engine/kernel";
import { INVENTORY } from "../index.js";

/**
 * What the workspace is holding, right now.
 *
 * ⚠️ `null` IS "NOT THIS PERSON'S TO KNOW", THE SAME AS IN `Needs`. All three
 * are separate read keys and the platform answers with the ones the caller
 * holds — absent, never nought — so a role built by hand without `product:read`
 * gets a figure with no caption rather than a confident "0 products".
 */
export interface Shelf {
  /**
   * ⚠️ LINES, NOT A QUANTITY. Three kilograms and two boxes do not add up to
   * five of anything, so the only number a mixed catalogue can put in one figure
   * is how many product-and-place rows have something on them.
   */
  readonly lines: number | null;
  readonly products: number | null;
  readonly places: number | null;
}

/**
 * WHAT IS WAITING FOR SOMEBODY.
 *
 * ⚠️ `null` IS "NOT THIS PERSON'S TO KNOW" — see the header. Every one of these
 * is behind a different permission, and the three are read separately for that
 * reason rather than assembled into one number that would be wrong for anybody
 * who holds two of the three.
 */
export interface Needs {
  /** Batches past their date, and items due a service. */
  readonly due: number | null;
  /** Counts somebody opened and has not closed. */
  readonly counts: number | null;
  /** Runs finished and not yet released. */
  readonly runs: number | null;
}

/** The movements, summarised — the same read Reports draws in full. */
export interface Moving {
  /** How much of what left was actually scanned out, 0–1. */
  readonly share: number;
  readonly out: number;
  readonly short: number;
  /** How many lines the reorder list says to buy. */
  readonly buy: number;
  readonly daily: readonly { readonly day: string; readonly quantity: number }[];
}

export interface HomeProps {
  readonly title?: string;
  /**
   * ⚠️ THE WORKSPACE'S OWN WORDS FOR WHAT IT KEEPS — the profile's one visible
   * consequence. A setting that changed nothing but a form's default is one
   * nobody can tell they set.
   */
  readonly said: string;
  readonly of: Loaded<Shelf>;
  readonly again: () => void;
  readonly needs: Needs;
  /**
   * ⚠️ `null` WHERE THE MOVEMENTS ARE NOT THIS PERSON'S TO READ. The history is
   * its own grant: somebody who may see a balance has not necessarily been given
   * the record of how it got there, and asking anyway would put a refusal on the
   * first screen of the product.
   */
  readonly moving: Loaded<Moving> | null;
  /** The checklist, on both axes — a setup step is the workspace's, a first scan is theirs. */
  /** ⚠️ `null` until the answer is back — see `Guide`. Empty is a claim. */
  readonly raised: Raised | null;
  readonly held: ReadonlySet<string>;
  /** Where a step sends them. The guide's links are routes. */
  readonly onGo: (route: string) => void;

  /**
   * ⚠️ THE FIRST THING SOMEBODY DOES, AND IT OPENS A SHEET RATHER THAN GOING
   * ANYWHERE. Adding the thing you are holding is never the journey you were
   * on — see `Register`.
   */
  readonly onRegister: () => void;
  readonly onLabels: () => void;
  readonly onImport: () => void;
  readonly onSuppliers: () => void;
  readonly onDue: () => void;
  readonly onCounts: () => void;
  readonly onRuns: () => void;
  readonly onReports: () => void;
  readonly onStart: () => void;
}

export function Home({
  title, said, of, again, needs, moving, raised, held, onGo,
  onRegister, onLabels, onImport, onSuppliers,
  onDue, onCounts, onRuns, onReports, onStart,
}: HomeProps) {
  const figures = useFigures();
  /*
    ⚠️ THE ROLE AND THE PLAN REFUSE FOR DIFFERENT REASONS, AND ONLY ONE OF THEM
    HIDES A CONTROL. A person whose role does not include the catalogue is being
    told it is not theirs; a workspace whose PLAN does not include imports is
    being told to buy something, and hiding that is a feature nobody can find —
    so the control stands and the screen it leads to explains.
  */
  const stops = useGate("product.import");
  const mayCatalogue = held.has("product:write");
  /* ⚠️ EACH ONE ASKS FOR WHAT ITS OWN SCREEN ASKS FOR, and the names are the
     manifest's rather than a guess at them. A shortcut gated on a key the
     destination does not use is a control that appears for people it refuses and
     hides from people it would have served. */
  const acts = [
    /*
      ⚠️ FIRST, BECAUSE A CATALOGUE COMES BEFORE ANYTHING CAN BE PUT ON A SHELF.
      It took Receive's place here rather than sitting beside it: `QuickActions`
      draws four and silently drops a fifth, and receiving has its own door on
      Stock — which is where "put some of this away" is actually thought of.
    */
    /*
      ⚠️ THE NOUN, NOT THE SENTENCE. A quick action's label gets a 64px column
      under a circle at note size — about nine characters — and "Add a product"
      is thirteen. The row beside it is nouns already (Labels, Import,
      Suppliers); the plus in the circle is the verb, and the word underneath
      says what it is a plus for.
    */
    mayCatalogue
      ? { id: "register", label: "Product", icon: glyphOf("add"), onDo: onRegister }
      : null,
    held.has("location:read")
      ? { id: "labels", label: "Labels", icon: glyphOf("tag"), onDo: onLabels }
      : null,
    mayCatalogue && stops !== "permission"
      ? { id: "import", label: "Import", icon: glyphOf("file"), onDo: onImport }
      : null,
    mayCatalogue
      ? { id: "suppliers", label: "Suppliers", icon: glyphOf("people"), onDo: onSuppliers }
      : null,
  ].filter((one) => one !== null);

  const waiting: readonly {
    readonly id: string; readonly label: string; readonly icon: string;
    readonly n: number; readonly onOpen: () => void;
  }[] = [
    needs.due !== null
      ? { id: "due", label: "Running out", icon: "alert", n: needs.due, onOpen: onDue }
      : null,
    needs.counts !== null
      ? { id: "counts", label: "Counts open", icon: "check", n: needs.counts, onOpen: onCounts }
      : null,
    needs.runs !== null
      ? { id: "runs", label: "Runs to release", icon: "list", n: needs.runs, onOpen: onRuns }
      : null,
  ].filter((one) => one !== null);

  return (
    /*
      ⚠️ NO TITLE AND NO STRAPLINE, AND THAT IS THE DECISION THE REST OF THE
      SCREEN HANGS ON. Every other screen in the product leads with its name
      because somebody navigated to it; nobody navigates to home, they arrive
      there — the crown already says where they are, and a heading plus two lines
      of explanation is the width of the screen spent telling somebody something
      they knew before they unlocked the phone. What goes in that space instead
      is the number they opened the app for.
    */
    <Screen shape="board">
      <Stack space="roomy">
        {/*
          ⚠️ THE FIGURE FLOATS. It is not in a card, and the card is what every
          version of this had: a lit ground, and then an opaque grey rectangle
          laid over the lit part of it with the number inside. What a card buys is
          separation from what is around it, and nothing is around this — it is
          the top of the screen, on the world, which is the one place in a product
          where the ambience is the container.

          ⚠️ AND THE ACTS RIDE UNDER IT RATHER THAN BESIDE IT. Look at the number,
          then do something about it: one gesture, so no heading between them and
          no second surface under them.
        */}
        <Await
          of={of}
          waiting={<HeroWaiting acts={acts.length} />}
          again={again}
          then={(shelf) => (
            <Hero
              eyebrow="On the shelf"
              /* ⚠️ A DASH, NOT A NOUGHT, FOR A SHELF NOBODY GAVE THIS PERSON
                 THE KEY TO. Zero is a fact about the workspace and this is a
                 fact about the reader — and the two look identical in a figure
                 this size. `count` goes with it: there is no number to run up
                 to. */
              value={shelf.lines ?? "—"}
              count={shelf.lines !== null}
              /* ⚠️ AND THE CAPTION IS DROPPED WHOLE RATHER THAN HALF-WRITTEN.
                 "11 places" alone under a figure reads as what the figure is
                 of, which it is not. */
              identifier={shelf.products === null || shelf.places === null
                ? undefined
                : `${figures.grouped(shelf.products)}`
                + `${shelf.products === 1 ? " product in " : " products in "}`
                + `${figures.grouped(shelf.places)}`
                + `${shelf.places === 1 ? " place" : " places"}`}
              under={acts.length ? <QuickActions actions={acts} /> : null}
            />
          )}
        />

        {/*
          ⚠️ THE ONE BLOCK SOMEBODY OPENS THIS PRODUCT FOR, AND IT IS ABOVE
          EVERYTHING THAT EXPLAINS THE BUSINESS. A number that has run out, a
          count left half done and a batch nobody released are three different
          people's Monday; the charts below are nobody's.
        */}
        {waiting.length
          ? (
            <Section label="What needs you">
              <Group>
                {waiting.map((one) => (
                  <NavRow
                    key={one.id}
                    icon={glyphOf(one.icon)}
                    label={one.label}
                    /* ⚠️ THE COUNT IS THE ROW'S SUBJECT, so it goes where every
                       other number in this product goes — packed right, in the
                       column the eye already runs down. A count inside the label
                       would put it at a different x on every row. */
                    aside={<Num value={one.n} />}
                    onOpen={one.onOpen}
                  />
                ))}
                {waiting.every((one) => one.n === 0)
                  ? (
                    <NoteRow icon={glyphOf("check")}>
                      Nothing is waiting. Everything counted is where it should be
                    </NoteRow>
                  )
                  : null}
              </Group>
            </Section>
          )
          : null}

        {/*
          ⚠️ ONE BLOCK, AND IT SURVIVES THE CHECKLIST. `Guide` draws nothing once
          a workspace has finished, which is right — a list that stays after it is
          done is a permanent reminder of something already handled — but the
          screen it belongs to is not only a checklist. The ladder is the one
          decision this product cannot make for anybody and is worth re-reading a
          year in, so the way to it is a row under the same heading rather than a
          second "Getting started" further down the page, which is what the first
          draft had: the same two words twice in one screenful.
        */}
        <Section label="Getting started" under="Three things, and the product works">
          <Guide book={INVENTORY.guide ?? {}} raised={raised} held={held} onGo={onGo} />
          <Group>
            <NavRow icon={glyphOf("star")} label="What each step is for" onOpen={onStart} />
          </Group>
        </Section>

        {moving
          ? (
            <Section label="How it is going">
              <Await
                of={moving}
                /* ⚠️ SHAPED LIKE WHAT IS COMING: three figures and a plot, not
                   three rows. A placeholder with the wrong geometry is a layout
                   that jumps, which is worse than one that was briefly blank. */
                waiting={(
                  <Stack space="snug">
                    <Group><FigureWaiting count={3} /></Group>
                    <Group><ChartWaiting /></Group>
                  </Stack>
                )}
                then={(went) => (
                  <Stack space="snug">
                    <Group>
                      <StatRow>
                        {/* ⚠️ THE HONEST ONE FIRST. How much left is a fact about
                            the business; how much of it anybody wrote down is
                            what says whether the other two mean anything. */}
                        <Stat
                          label="Recorded"
                          value={Math.round(went.share * 100)}
                          suffix="%"
                        />
                        <Stat label="Left the shelves" value={went.out} />
                        <Stat label="Found short" value={went.short} upIsGood={false} />
                      </StatRow>
                      {went.buy
                        ? (
                          <NoteRow icon={glyphOf("alert")}>
                            {went.buy === 1
                              ? "One line runs out before a delivery would land"
                              : `${figures.grouped(went.buy)} lines run out before a delivery would land`}
                          </NoteRow>
                        )
                        : (
                          <NoteRow icon={glyphOf("check")}>
                            Everything lasts longer than a delivery takes
                          </NoteRow>
                        )}
                    </Group>

                    <ChartPanel label="What left, day by day" under="The last thirty days">
                      <LineChart
                        describes="What left the shelves each day"
                        series={[{
                          id: "left",
                          label: "Left",
                          subject: true,
                          points: went.daily.map((one, i) => ({ x: i, y: one.quantity })),
                        }]}
                        zero
                      />
                    </ChartPanel>

                    {/* ⚠️ THE WAY ON, AT THE END OF WHAT IT CONTINUES. Everything
                        above is the report's own numbers cut down to what fits a
                        home screen; the row that opens the whole thing belongs
                        under them rather than in a menu somewhere else. */}
                    <SeeAll label="Everything that moved" onOpen={onReports} />
                  </Stack>
                )}
              />
            </Section>
          )
          : null}

      </Stack>
    </Screen>
  );
}

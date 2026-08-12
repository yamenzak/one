/**
 * YOUR VAULT — everything held about you, everyone who can see it, and who has.
 *
 * ⚠️ THIS FILE KNOWS WHAT A FACT IS FOR EXACTLY NOWHERE. Every name, every reason,
 * every recommendation and every sentence about what a derivation cannot reveal is
 * copied out of a declaration — the app's manifest for why it wants a thing, the
 * fact registry for what the thing is. The screen lays them out. That is the whole
 * design: an app that declares a thirteenth fact gets a thirteenth row here, with
 * its own explanation, without this file being opened.
 *
 * ⚠️ SO IT IS ORGANISED BY WORKSPACE, NOT BY FACT, because that is the question
 * somebody actually has. "Who knows my weight" is answered by a list of facts;
 * "what does this studio know about me" is the one people ask, and it is the one
 * they can act on — a workspace is a relationship you can end.
 *
 * ⚠️ AN ITEM IS A SWITCH ONLY WHERE IT HAS TWO RUNGS, and the want says how many.
 * A fact an app merely computes with has one meaningful setting either side of
 * off, so a switch is the honest control. A fact it wants the VALUE of can also be
 * held at "the assistant, no people" — a rung somebody chooses deliberately, and
 * one a boolean spends without asking. Whichever it is, the line underneath says
 * in the workspace's own name what is true right now.
 *
 * ⚠️ AND THE THIRD QUESTION IS THE ONE NO PRODUCT ANSWERS. What is held, who can
 * see it — and who HAS. A permission list says what could happen; somebody
 * deciding whether to keep sharing wants to know what did.
 */

import { useState, type ElementType, type ReactNode } from "react";
import type { Problem, Reach, Wanted, WantedHere } from "@one/kernel";
import { Face } from "../avatar.js";
import { Lockup } from "../brand/mark.js";
import { Chip } from "../chip.js";
import { Choose, type Option } from "../choose.js";
import { Disclose } from "../disclose.js";
import { About, Onward } from "../icon.js";
import { Blank, Card, Item as Row, Pill, Waiting } from "../list.js";
import { Screen, Section } from "../screen.js";
import { Sheet } from "../sheet.js";
import { Flip } from "../switch.js";

/**
 * ⚠️ THE VAULT'S OWN LIGHT, and it is the same number the card on the account
 * home carries. A place is recognised by being lit the way it was lit the last
 * time you were in it, so the two are one value or they are two places.
 */
export const VAULT_TINT = 268;

/**
 * ⚠️ THE KERNEL RESOLVES AND THE WIRE FORMATS, and the expiry is where the two
 * meet. A `Wanted` carries a real instant, because that is what a comparison
 * against "now" needs; a screen carries "1 December", because that is what
 * somebody deciding whether to extend needs — and a component that formatted it
 * would be a component that had to be told a locale and a time zone to render a
 * list. Everything else on the item is the declaration, verbatim.
 */
export type Item = Omit<Wanted, "expiresAt" | "readings"> & {
  readonly expiresAt: string | null;
  /* ⚠️ THE READINGS ARE SPOKEN TOO, and leaving them out of this is how one row
     comes to render a raw instant. A reading carries its OWN grant and its own
     expiry — resolved separately by the kernel — so a type that formatted only
     the top level typechecked while the one row somebody had set an end date on
     showed a timestamp. */
  readonly readings: readonly (Omit<Wanted["readings"][number], "expiresAt"> & {
    readonly expiresAt: string | null;
  })[];
};

/** A workspace, and every want the app behind it declared. */
export interface Where extends Omit<WantedHere, "items"> {
  readonly items: readonly Item[];
  readonly name: string;
  readonly appName: string;
  /** The workspace's own mark, or the generated face standing in for one. */
  readonly face?: string;
  /** The product, for the fallback's colour. Never shown as a word. */
  readonly product?: string;
}

export interface Looked {
  readonly fact: string;
  readonly label: string;
  /**
   * ⚠️ THE WORKSPACE IT WAS READ IN, NOT THE PRODUCT. "Kova" is true of half this
   * list and answers nothing; "Haddad Strength" is the place somebody can act on,
   * and it is the same name the group above this section is filed under — so the
   * two halves of the screen are talking about one thing. Where a read had no
   * workspace behind it, this is the app.
   */
  readonly where: string;
  /** Its own mark, or the generated face standing in for one. */
  readonly face?: string;
  /** The product, for the fallback's colour. Never shown as a word. */
  readonly product?: string;
  /** Who looked. Absent where the app itself was computing and no person saw it. */
  readonly who?: string;
  readonly on: string;
  readonly times: number;
}

/** A fact somebody recorded that no workspace has asked for. */
export interface Kept {
  readonly fact: string;
  readonly label: string;
}

export interface VaultScreenProps {
  /** ⚠️ `null` is not answered yet; `[]` is answered and empty. */
  readonly wheres: readonly Where[] | null;
  readonly kept: readonly Kept[] | null;
  readonly looks: readonly Looked[] | null;
  /**
   * ⚠️ ONE WRITE FOR EVERY CONTROL ON THE SCREEN, so a row cannot grow a second
   * shape. `reach` is the rung it becomes; `self` is off.
   */
  readonly onSet: (
    at: { readonly appId: string; readonly tenantId: string | null; readonly fact: string; readonly reach: Reach },
  ) => Promise<Problem | null>;
  readonly onBack: () => void;
  readonly Heading?: ElementType;
}

/* --------------------------------------------------------------------- copy */

/**
 * WHAT IS TRUE RIGHT NOW, IN AS FEW WORDS AS IT TAKES.
 *
 * ⚠️ IT SAYS "HERE", BECAUSE THE GROUP ABOVE IT ALREADY SAID WHERE. Naming the
 * workspace in every sentence put its face and its name five times down one card,
 * under a header carrying both — and each line then wrapped around a chip it did
 * not need. The chip earns its place where the list is FLAT and mixes workspaces,
 * which is what "Who has looked" is; inside a group filed under one name it is
 * the row repeating what the row above it already says.
 *
 * ⚠️ AND IT SAYS WHAT IS TRUE, NOT WHAT WOULD HAPPEN IF YOU FLIPPED IT. A line
 * describing the other state reads as the current one to anybody skimming, which
 * on a screen about disclosure is the worst error available.
 *
 * ⚠️ THE RUNG IS PASSED IN RATHER THAN READ OFF THE ITEM, so the sentence and
 * the control are one statement. Reading `item.reach` here left the switch ON
 * above the words "Not shared." for the length of a round trip.
 *
 * ⚠️ SHORT ENOUGH TO BE READ, WHICH IS THE ONLY WAY IT WORKS. These ran to two
 * clauses each — "Used for calculations here. Nobody at Haddad Strength can see
 * the value itself." — and a column of them is a wall nobody reads, so the screen
 * conveys nothing at all.
 */
export function meaning(item: Item, reach: Reach): string {
  const said =
    reach === "self" ? "Not shared."
    : reach === "compute" ? "Calculations only. Nobody here sees it."
    : reach === "agent" ? "The assistant only. Nobody here sees it."
    : "Everyone here can see it.";
  /* ⚠️ THE EXPIRY IS PART OF THE SENTENCE, not a pill beside it. As a pill it
     competed with the control for one line and truncated the name to an ellipsis;
     and it is not a separate fact — it is when the clause before it stops. */
  return item.expiresAt === null ? said : `${said} Until ${item.expiresAt}.`;
}

/**
 * ⚠️ THE RUNGS, IN THE PERSON'S OWN INTEREST RATHER THAN THE SYSTEM'S. Each line
 * says who ends up able to read the thing — "compute" and "agent" are
 * indistinguishable to anybody who has not been told, and somebody choosing
 * between four unexplained words picks the one they recognise.
 */
const RUNGS: readonly Option<Reach>[] = [
  { value: "self", label: "Only you", detail: "Nobody else, and nothing computed from it" },
  { value: "compute", label: "Calculations only", detail: "Used to work things out. Nobody is shown it" },
  { value: "agent", label: "The assistant", detail: "A model answering you may read it. No person" },
  { value: "staff", label: "People there", detail: "Anybody with a role in this workspace" },
];

const RUNG: Record<Reach, string> = Object.fromEntries(
  RUNGS.map((r) => [r.value, r.label]),
) as Record<Reach, string>;

/* --------------------------------------------------------------------- view */

export function VaultScreen({ wheres, kept, looks, onSet, onBack, Heading = "h1" }: VaultScreenProps): ReactNode {
  const [about, setAbout] = useState<{ item: Item; where: string } | null>(null);

  return (
    <Screen
      leave="up"
      onLeave={onBack}
      /* ⚠️ THE SAME TWO DEVICES THE ACCOUNT CENTRE NAMES ITSELF WITH — its own
         light and its own lockup — because this is a place of the same order and
         not a settings page inside one.

         ⚠️ SILK, LIKE EVERY PAGE, AND THE HUE IS WHAT DIFFERS. The card on the
         account home is aurora because aurora is what still reads as light at
         card size; a page is wide enough for the ribbons, and using the card's
         variant here made a full-width field of magenta rather than a light
         somewhere off the screen. Same variant as the surface it was opened
         from, one number moved — which is the whole of how a place is told
         from another place. */
      sky="silk"
      tint={VAULT_TINT}
      name="Vault"
      title={<Heading className="page-title"><Lockup word="Vault" /></Heading>}
      lede="What each place you belong to can know about you, and what it cannot."
    >
      <Section>
        {wheres === null ? <Waiting rows={3} /> : wheres.length === 0 ? (
          <Blank title="Nothing is asking for anything">
            When an app wants to know something about you it will ask, and it will
            appear here for you to change your mind about.
          </Blank>
        ) : (
          <Card>
            {wheres.map((w) => {
              const on = w.items.filter((i) => i.granted).length;
              return (
                <Disclose
                  key={`${w.appId}:${w.tenantId ?? ""}`}
                  mark={<Face kind="workspace" src={w.face} name={w.name} tone={w.product} className="well alive" />}
                  title={w.name}
                  detail={w.appName}
                  /* ⚠️ TWO NUMBERS, SO THE WHOLE ROW IS READABLE CLOSED. "2 of 5"
                     answers both halves of the question somebody came with — how
                     much have I given, and how much was asked. */
                  said={<span className="disclose-count">{on} of {w.items.length}</span>}
                >
                  {w.items.map((item) => (
                    <Ask
                      key={item.fact}
                      item={item}
                      where={w.name}
                      onOpen={() => setAbout({ item, where: w.name })}
                      onSet={(reach) => onSet({
                        appId: w.appId, tenantId: w.tenantId, fact: item.fact, reach,
                      })}
                      /* ⚠️ THE SAME WRITE, KEYED ON THE READING. A grant over a
                         reading is stored under the reading's own id, which is
                         exactly how `mayDerive` looks it up. */
                      onReading={(reading, reach) => onSet({
                        appId: w.appId, tenantId: w.tenantId, fact: reading, reach,
                      })}
                    />
                  ))}
                </Disclose>
              );
            })}
          </Card>
        )}
      </Section>

      {/*
        ⚠️ WHAT NOBODY ASKED FOR IS STILL YOURS, and it is on the screen for the
        person this whole thing is built for: somebody who has left every workspace
        they were in. A vault that listed only what an app wanted would go empty at
        exactly the moment it became the only copy.
      */}
      {kept !== null && kept.length > 0 ? (
        <Section name="Yours alone">
          <Card>
            {kept.map((k) => (
              <Row key={k.fact} title={k.label} detail="Recorded. Nothing is asking for it." />
            ))}
          </Card>
        </Section>
      ) : null}

      <Section name="Who has looked">
        {looks === null ? <Waiting rows={3} /> : looks.length === 0 ? (
          <Blank title="Nobody has read anything of yours">
            This fills in as soon as somebody does, and it is kept whether or not
            you are still sharing with them.
          </Blank>
        ) : (
          <Card>
            {looks.map((l, i) => (
              <Row
                key={`${l.fact}:${l.where}:${l.on}:${i}`}
                title={l.label}
                detail={
                  <>
                    {/* ⚠️ THE SAME OBJECT THAT APPEARS IN THE GROUP ABOVE, face
                        included. As bare words the reader had to match a name they
                        read here to a planet they saw thirty rows up — which is
                        the exact work the chip exists to remove. */}
                    <Chip face={<Face kind="workspace" src={l.face} name={l.where} tone={l.product} />}>
                      {l.where}
                    </Chip>
                    {/* ⚠️ THE PERSON IS NAMED BESIDE IT, NOT INSTEAD OF IT. Both
                        matter and they are different questions: a coach read this,
                        and they read it at that studio. Showing only the person
                        loses the one thing somebody can end. */}
                    {l.who ? `${l.who} · ` : null}
                    {l.on}
                    {/* ⚠️ ONCE IS NOT WORTH A COUNT. "4 times" is information;
                        "1 times" is a template showing through. */}
                    {l.times > 1 ? <Pill>{l.times} times</Pill> : null}
                  </>
                }
              />
            ))}
          </Card>
        )}
      </Section>

      <AboutSheet at={about} onClose={() => setAbout(null)} />
    </Screen>
  );
}

/**
 * ONE THING AN APP WOULD LIKE TO KNOW, AND WHERE IT STANDS.
 *
 * ⚠️ A BLOCK, NOT A ROW, AND THAT IS THE SECOND TIME. Built as a row — name and
 * sentence on the left, switch on the right — the sentence gets about half a
 * phone, so "Your goal" wraps to five lines and then truncates to an ellipsis
 * while the switch sits in white space. The name and the control share the top
 * line because both are short and fixed; the sentence gets the full width
 * underneath, because it is the only part whose length is not knowable.
 *
 * ⚠️ AND THE EXPLAIN MARK IS BESIDE THE NAME, NOT BESIDE THE SWITCH. Next to the
 * control it reads as part of the control — somebody reaching for one lands on
 * the other, and the two do opposite things.
 */
const Ask = ({ item, where, onOpen, onSet, onReading }: {
  readonly item: Item;
  readonly where: string;
  readonly onOpen: () => void;
  readonly onSet: (reach: Reach) => Promise<Problem | null>;
  readonly onReading: (reading: string, reach: Reach) => Promise<Problem | null>;
}): ReactNode => {
  const [choosing, setChoosing] = useState(false);
  /*
    ⚠️ THE SENTENCE MOVES WITH THE CONTROL, AND THAT TOOK OWNING THE RUNG HERE.
    The switch is optimistic — it has to be, a control that waits for a round trip
    feels broken — but the line underneath read the prop, which only changes when
    a refetch lands. So flipping something on left the switch reading ON above the
    words "Not shared.", for as long as the network took. Two contradictory
    statements about one disclosure is worse than either of them alone.

    ⚠️ IT IS AN OVERLAY, NOT A COPY. `pending ?? item.reach` means the moment the
    server's answer arrives the row is showing the server's answer — a copy taken
    at mount would keep showing what this tab did, and quietly disagree with
    another tab, the sheet, and the route.
  */
  const [pending, setPending] = useState<Reach | null>(null);
  const reach = pending ?? item.reach;
  const granted = reach !== "self";
  /* ⚠️ THE SAME WRITE FOR BOTH CONTROLS, so neither can grow its own rollback.
     A refusal puts the row back on the prop rather than on a remembered value. */
  const set = (next: Reach) => {
    setPending(next);
    return onSet(next).then((problem) => {
      if (problem) setPending(null);
      return problem;
    });
  };
  /*
    ⚠️ A SWITCH ONLY WHERE THERE ARE TWO RUNGS, and the want says how many. A fact
    an app only computes with has one meaningful setting either side of off, so a
    switch is the honest control. A fact it wants the value of can also be held at
    "the assistant, no people" — and a boolean spends that rung without asking:
    somebody who chose it in the consent sheet would see a switch reading ON, and
    turning it off and on again would silently re-grant at the top of the ladder.
  */
  const binary = item.rungs.length === 2;
  return (
    <>
    <div className="share">
      <span className="share-name">{item.label}</span>
      <button
        type="button"
        className="share-about press"
        aria-label={`Why ${item.label.toLowerCase()} is asked for`}
        onClick={onOpen}
      >
        <About />
      </button>
      {/* ⚠️ NEEDED HERE IS A FACT ABOUT THE APP, so it sits with the name rather
          than in the sentence about what is disclosed. It is the app's claim that
          a refusal takes a feature away, and it is the only claim on this screen
          an app makes about itself. */}
      {item.required ? <span className="share-needed">Needed here</span> : null}
      {binary ? (
        <Flip
          on={granted}
          onChange={(next) => set(next ? item.asks : "self")}
          label={`Share ${item.label.toLowerCase()} with ${where}`}
        />
      ) : (
        /* ⚠️ IT NAMES THE RUNG IT IS AT, so the control is readable without being
           opened — a button saying only "Change" makes somebody press it to learn
           what they already chose. */
        <button type="button" className="share-rung press" onClick={() => setChoosing(true)}>
          <span>{RUNG[reach]}</span>
          <Onward className="chevron" />
        </button>
      )}
      <span className="share-said">{meaning(item, reach)}</span>
      {binary ? null : (
        <Choose
          open={choosing}
          title={item.label}
          options={RUNGS.filter((r) => item.rungs.includes(r.value))}
          value={reach}
          onPick={set}
          onClose={() => setChoosing(false)}
        />
      )}
    </div>
    {/*
      ⚠️ A READING IS ITS OWN CONTROL, because it is its own grant. Shown only
      inside the explain sheet it was readable and not changeable, so a trend
      granted once could be narrowed only by the app asking again — and the
      derivation is the whole reason somebody chose this fact's setting in the
      first place. Indented under the fact, because what it discloses is bounded
      by what the fact allows.
    */}
    {item.readings.map((r) => (
      <Reads key={r.id} reading={r} where={where} onSet={(reach) => onReading(r.id, reach)} />
    ))}
    </>
  );
};

/**
 * ⚠️ IT SAYS WHAT IT HIDES, ON THE ROW. A reading's whole claim is that it
 * discloses less than its input — and the registry refuses an empty `hides`, so
 * that sentence is never a reassurance somebody typed. Putting it one press away
 * behind the explain mark would leave the row saying only that something is
 * shared, which is the half that is not the point.
 */
const Reads = ({ reading, where, onSet }: {
  readonly reading: Item["readings"][number];
  readonly where: string;
  readonly onSet: (reach: Reach) => Promise<Problem | null>;
}): ReactNode => {
  const [choosing, setChoosing] = useState(false);
  const binary = reading.rungs.length === 2;
  return (
    <div className="share reads">
      <span className="share-name">{reading.label}</span>
      {binary ? (
        <Flip
          on={reading.granted}
          onChange={(next) => onSet(next ? reading.asks : "self")}
          label={`Share ${reading.label.toLowerCase()} with ${where}`}
        />
      ) : (
        <button type="button" className="share-rung press" onClick={() => setChoosing(true)}>
          <span>{RUNG[reading.reach]}</span>
          <Onward className="chevron" />
        </button>
      )}
      {/* ⚠️ WHAT IT SHOWS, HERE; WHAT IT CANNOT SHOW, IN THE SHEET. Both on the
          row ran to four lines under a control, and the second sentence — the one
          that is the whole reassurance — is where a reader had already stopped. */}
      <span className="share-said">{reading.says}</span>
      {binary ? null : (
        <Choose
          open={choosing}
          title={reading.label}
          options={RUNGS.filter((x) => reading.rungs.includes(x.value))}
          value={reading.reach}
          onPick={onSet}
          onClose={() => setChoosing(false)}
        />
      )}
    </div>
  );
};

/**
 * WHY IT IS BEING ASKED FOR — the app's own words, and the platform's.
 *
 * ⚠️ EVERY SENTENCE IN HERE IS A DECLARATION READ ALOUD. The app said what it
 * wants the thing for; the fact registry said what the platform recommends and
 * why; a derivation said what it cannot reveal. None of it is written here, which
 * is what makes this sheet correct for an app nobody has built yet.
 */
const AboutSheet = ({ at, onClose }: {
  readonly at: { readonly item: Item; readonly where: string } | null;
  readonly onClose: () => void;
}): ReactNode => (
  <Sheet open={at !== null} dismissible label={at ? `Why ${at.item.label.toLowerCase()} is asked for` : ""} onClose={onClose}>
    {at === null ? null : <AboutBody item={at.item} />}
  </Sheet>
);

/**
 * ⚠️ THE BODY IS SEPARATE FROM THE PRESENTATION, and the reason is that a portal
 * renders nothing outside a browser. Welded to the sheet, every sentence in here —
 * which is the whole point of the sheet — would be unreachable by any check, and
 * "the screen writes no copy of its own" would be a claim rather than a property.
 */
export const AboutBody = ({ item }: { readonly item: Item }): ReactNode => {
  return (
      <div className="about">
        <h2 className="sheet-title">{item.label}</h2>

        {/* ⚠️ EVERY SENTENCE BELOW IS A DECLARATION READ ALOUD — the app's reason,
            the platform's recommendation and what a derivation cannot reveal. The
            three blocks that used to sit between them were prose written here:
            what "on" would reach, what happens if it is off, and a closing
            reassurance. All three restated what the row already said, in more
            words, on the one surface that has to be read to be worth opening. */}
        <p className="about-why">{item.why}</p>

        {item.recommend ? (
          <p className="about-line">
            <span className="about-key">Suggested</span>
            {RUNG[item.recommend]}
            {item.because ? ` — ${item.because}` : null}
          </p>
        ) : null}

        {/* ⚠️ A DERIVATION STATES WHAT IT CANNOT REVEAL, IN WRITING, and the
            registry refuses an empty one — so this is never a reassurance somebody
            typed to make a screen feel safe. It is here rather than on the row
            because it is the sentence somebody checks the arithmetic against, and
            that is a thing you open a sheet to do. */}
        {item.readings.map((r) => (
          <div className="about-reading" key={r.id}>
            <p className="about-line"><span className="about-key">{r.label}</span>{r.says}</p>
            <p className="about-hides">{r.hides}</p>
          </div>
        ))}
      </div>
  );
};


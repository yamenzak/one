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
  readonly appName: string;
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
 * WHAT THE CURRENT STATE MEANS, IN THE WORKSPACE'S OWN NAME.
 *
 * ⚠️ IT NAMES THE PLACE RATHER THAN THE ROLE. "Not shared with your coach" is one
 * product's word for the person on the other side, and this screen stands over a
 * studio, a clinic and a company's staff list alike. "Nobody at Haddad Strength"
 * is both true everywhere and more precise — it is the actual boundary.
 *
 * ⚠️ AND IT SAYS WHAT IS TRUE NOW, not what would happen if you flipped it. A
 * line that describes the other state reads as the current one to anybody
 * skimming, which on a screen about disclosure is the worst available error.
 */
function meaning(item: Item, where: string): string {
  if (!item.granted) {
    return item.need === "compute"
      ? `Kept to you. Not used for anything here, and nobody at ${where} can see it.`
      : `Kept to you. Nobody at ${where} can see it.`;
  }
  const now =
    item.reach === "compute" ? `Used for calculations here. Nobody at ${where} can see the value itself.`
    : item.reach === "agent" ? `The assistant can use it. Nobody at ${where} can see it.`
    : `People at ${where} can see it.`;
  /* ⚠️ THE EXPIRY IS PART OF THE SENTENCE, not a pill beside it. As a pill it
     competed with the switch for the same line and truncated the name to an
     ellipsis; and it is not a separate fact anyway — "until December" is when the
     sentence above it stops being true. */
  return item.expiresAt === null ? now : `${now.replace(/\.$/, "")}, until ${item.expiresAt}.`;
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
                key={`${l.fact}:${l.appName}:${l.on}:${i}`}
                title={l.label}
                detail={
                  <>
                    <Chip>{l.who ?? l.appName}</Chip>
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
          on={item.granted}
          onChange={(next) => onSet(next ? item.asks : "self")}
          label={`Share ${item.label.toLowerCase()} with ${where}`}
        />
      ) : (
        /* ⚠️ IT NAMES THE RUNG IT IS AT, so the control is readable without being
           opened — a button saying only "Change" makes somebody press it to learn
           what they already chose. */
        <button type="button" className="share-rung press" onClick={() => setChoosing(true)}>
          <span>{RUNG[item.reach]}</span>
          <Onward className="chevron" />
        </button>
      )}
      <span className="share-said">{meaning(item, where)}</span>
      {binary ? null : (
        <Choose
          open={choosing}
          title={item.label}
          options={RUNGS.filter((r) => item.rungs.includes(r.value))}
          value={item.reach}
          onPick={onSet}
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
      <span className="share-said">
        {reading.granted
          ? `${reading.says} ${reading.hides}`
          : `Not shared. ${reading.says}`}
      </span>
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
    {at === null ? null : <AboutBody item={at.item} where={at.where} />}
  </Sheet>
);

/**
 * ⚠️ THE BODY IS SEPARATE FROM THE PRESENTATION, and the reason is that a portal
 * renders nothing outside a browser. Welded to the sheet, every sentence in here —
 * which is the whole point of the sheet — would be unreachable by any check, and
 * "the screen writes no copy of its own" would be a claim rather than a property.
 */
export const AboutBody = ({ item, where }: {
  readonly item: Item;
  readonly where: string;
}): ReactNode => {
  const at = { item, where };
  return (
      <div className="about">
        <h2 className="sheet-title">{at.item.label}</h2>
        <p className="about-why">{at.item.why}</p>

        {/* ⚠️ WHAT IT WOULD ACTUALLY REACH, spelled out, because "on" is not a
            quantity. The same switch means arithmetic on one row and a person
            reading it on the next. */}
        <p className="about-line">
          <span className="about-key">Switched on</span>
          {at.item.need === "compute"
            ? `Used to work things out. The value itself stays here — nobody at ${at.where} sees it.`
            : `People at ${at.where} can read it.`}
        </p>

        {at.item.recommend ? (
          <p className="about-line">
            <span className="about-key">Suggested</span>
            {RUNG[at.item.recommend]}
            {at.item.because ? ` — ${at.item.because}` : null}
          </p>
        ) : null}

        {at.item.required ? (
          <p className="about-line">
            <span className="about-key">If it is off</span>
            Something here stops working. Everything else carries on.
          </p>
        ) : (
          <p className="about-line">
            <span className="about-key">If it is off</span>
            Nothing breaks. This part just has less to go on.
          </p>
        )}

        {/* ⚠️ A DERIVATION STATES WHAT IT CANNOT REVEAL, IN WRITING, and the
            registry refuses an empty one — so this is never a reassurance
            somebody typed to make a screen feel safe. */}
        {at.item.readings.map((r) => (
          <div className="about-reading" key={r.id}>
            <p className="about-line"><span className="about-key">{r.label}</span>{r.says}</p>
            <p className="about-hides">{r.hides}</p>
          </div>
        ))}

        <p className="about-foot">
          You can switch this off at any time. What was worked out before you did
          is already theirs, and switching off does not delete what you recorded.
        </p>
      </div>
  );
};


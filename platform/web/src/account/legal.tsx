/**
 * CONSENT AND LEGAL — what you have agreed to, per product, and who else receives
 * what each of them holds.
 *
 * ⚠️ EVERY SHAPE HERE IS THE KERNEL'S. `Doc` WRAPS a `LegalDoc` rather than
 * restating it, and the disclosure is `Subprocessor` and `Transfer` as declared.
 * The previous version of this screen described its own versions of those and got
 * three of them wrong — `purpose`, `region`, `basis`, none of which anything has
 * ever sent — and it rendered convincingly because the fixtures were written to
 * match. `scripts/wire.test.mjs` is why that cannot happen from here again.
 *
 * ⚠️ A PRODUCT IS A ROW THAT GOES SOMEWHERE, NOT A THING THAT UNFOLDS. Built as a
 * disclosure it was readable closed and wrong in two ways: a product with four
 * documents and a disclosure of its own is a PLACE, and unfolding one pushed the
 * next product half a screen down — so a person in three of them was reading a
 * list that moved under them. The hub is now a list of destinations, which is what
 * every other hub in this account centre is.
 *
 * ⚠️ AND EACH ONE IS AN ADDRESS. `routes.ts` gives every screen here a path, so a
 * refusal that says "there is something to read first" can send somebody to the
 * document rather than to the top of a settings surface.
 *
 * ⚠️ THE DISCLOSURE IS A DESTINATION, NOT A TABLE UNDER EVERY GROUP. It was five
 * label/value rows plus two foldouts BENEATH EACH PRODUCT'S documents, and the
 * answer somebody came for — does anything leave, is any of it sensitive — was
 * assembled by reading a table. It is one row now whose second line IS the answer.
 *
 * ⚠️ THE ONLY THING THAT CAN BE PRESSED TO AGREE IS AN OUTSTANDING DOCUMENT, and
 * only from inside it. A consent screen whose every row is actionable teaches that
 * agreeing is something you do repeatedly and casually, which is the reflex a
 * ledger exists to be evidence against.
 */

import type { ElementType, ReactNode } from "react";
import type { DataCategory, LegalDoc, Problem, Receiving, Subprocessor } from "@one/kernel";
import { SPECIAL_CATEGORIES } from "@one/kernel";
/* ⚠️ THE SHAPES COME FROM THE SEAM, which is the module `scripts/wire.test.mjs`
   holds to the kernel. A screen that declared its own would be outside the one
   check that exists to stop it inventing a field. */
import type { Doc, Product } from "./wire.js";
import type { Where } from "./routes.js";
import { Lockup } from "../brand/mark.js";
import { jurisdictionOf } from "@one/kernel";
import { Away } from "../away.js";
import { Mark } from "../mark.js";
import { Button } from "../button.js";
import { useCommit } from "../commit.js";
import { Global, Guard, Others, Paper, Tick, Union } from "../icon.js";
import { Blank, Card, Entry, Item, Waiting } from "../list.js";
import { Screen, Section, Title } from "../screen.js";

export interface LegalScreenProps {
  /**
   * ⚠️ ONE ROW PER PRODUCT, because a person belongs to several and each asks
   * different things of them. `legal.list` answers for the app serving the
   * request, which on the account centre is whichever one happens to be behind
   * that door — so this takes what every app PUBLISHED, resolved against the
   * roles this person actually holds in each.
   *
   * ⚠️ AND THE FIRST ONE MAY NOT BE A PRODUCT AT ALL. An empty `appId` is how the
   * runtime says "this is the deployment" — the account itself, which exists
   * before any product, outlives all of them, and holds the vault.
   *
   * Null until known. `[]` is "you are in no product", which is a fact.
   */
  readonly products: readonly Product[] | null;
  readonly onGo: (to: Where) => void;
  readonly onBack: () => void;
  readonly Heading?: ElementType;
}

/* ---------------------------------------------------------------- the hub --- */

export function LegalScreen({ products, onGo, onBack, Heading = "h1" }: LegalScreenProps): ReactNode {
  /* ⚠️ THE ACCOUNT IS TAKEN OUT BY ITS EMPTY `appId`, not by position. It arrives
     first today; a list that assumed so would put a product under the lockup the
     day anything reorders. */
  const account = products?.find((p) => p.appId === "") ?? null;
  const rest = products?.filter((p) => p.appId !== "") ?? [];

  return (
    <Screen leave="up" onLeave={onBack} name="Consent and legal"
      title={<Title as={Heading}>Consent and legal</Title>}
      lede="What you have agreed to, and who else receives what is held here."
    >
      {products === null ? <Section><Waiting /></Section> : (
        <>
          {/* ⚠️ NAMED BY THE LOCKUP, WHICH IS THE PLATFORM'S ONE DEVICE FOR "this
              belongs to the account". Set as words it is a fourth product with a
              longer name, in a list whose whole point is that this one is a
              different order of thing — it exists before any product and outlives
              all of them. */}
          {account ? (
            <Section name={<Lockup word="Account" />}>
              <Card>
                {account.docs.map((d) => (
                  <DocRow key={d.doc.id} of={d}
                    onGo={() => onGo({ at: "document", product: "", document: d.doc.id })} />
                ))}
                <WhoRow of={account} onGo={() => onGo({ at: "receiving", product: "" })} />
              </Card>
            </Section>
          ) : null}

          {rest.length === 0
            ? (
              /* ⚠️ ONLY WHERE THE ACCOUNT ITSELF SAID NOTHING EITHER. With the
                 account's own terms above it, "nothing to agree to" flatly
                 contradicts the card the reader is looking at; what is empty is
                 the PRODUCTS, and that is a sentence about products. */
              account ? null : (
                <Section>
                  <Blank title="Nothing to agree to">
                    You are not in any product that asks you to accept anything.
                  </Blank>
                </Section>
              )
            )
            : (
              <Section name="Products">
                <Card>
                  {rest.map((p) => (
                    /* ⚠️ NAMED BY THE PRODUCT, NOT BY THE WORKSPACE. An acceptance
                       is recorded per account, so somebody in two studios of the
                       same product has one obligation — listing it under each
                       would show two rows that tick together.

                       ⚠️ AND THE NAME IS SET AS A NAME. In the text face it is a
                       row about a word; in the brand face it is the product,
                       recognised before it is read. */
                    <Item
                      key={p.appId}
                      title={p.appName}
                      titleAs="wordmark"
                      detail={held(p.roles)}
                      sign={<span className="disclose-count">{state(p)}</span>}
                      onGo={() => onGo({ at: "product", product: p.appId })}
                    />
                  ))}
                </Card>
              </Section>
            )}
        </>
      )}
    </Screen>
  );
}

/* ------------------------------------------------------------ one product --- */

/**
 * ONE PRODUCT'S DOCUMENTS, AND WHO ELSE ITS RECORDS REACH.
 *
 * ⚠️ THE PRODUCT NAMES THE SCREEN, IN THE BRAND FACE. It is the one place a
 * product's identity appears in this surface at title size, and setting it in the
 * reading face would make it a heading about a word rather than the product.
 */
export function ProductScreen({ of, onGo, onBack, Heading = "h1" }: {
  readonly of: Product;
  readonly onGo: (to: Where) => void;
  readonly onBack: () => void;
  readonly Heading?: ElementType;
}): ReactNode {
  const isAccount = of.appId === "";
  return (
    <Screen leave="up" onLeave={onBack} name={of.appName}
      title={isAccount
        ? <Heading className="page-title"><Lockup word="Account" /></Heading>
        : <Title as={Heading}><span className="wordmark-title">{of.appName}</span></Title>}
      /* ⚠️ THE ROLES ARE THE LEDE BECAUSE THEY ARE WHY THIS LIST IS THIS LIST. The
         same product asks different things of an owner and of a client, and a
         person reading four documents is owed the sentence that says which set
         they are looking at. */
      lede={isAccount
        ? "Held for having an account, whether or not you use any product."
        : `What this product asks of you as ${held(of.roles).toLowerCase()}.`}
    >
      <Section>
        <Card>
          {of.docs.map((d) => (
            <DocRow key={d.doc.id} of={d}
              onGo={() => onGo({ at: "document", product: of.appId, document: d.doc.id })} />
          ))}
          <WhoRow of={of} onGo={() => onGo({ at: "receiving", product: of.appId })} />
        </Card>
      </Section>
    </Screen>
  );
}

/* ------------------------------------------------------------------ rows --- */

/** One document, wherever it is listed. Three callers, one row. */
const DocRow = ({ of, onGo }: { readonly of: Doc; readonly onGo: () => void }): ReactNode => (
  <Item
    icon={<Paper />}
    /* ⚠️ AMBER, NOT RED, AND ONLY ON WHAT IS UNFINISHED. Red is what the row that
       closes an account wears; a document waiting to be read is not that kind of
       thing. */
    tone={of.outstanding ? "warn" : undefined}
    title={of.doc.title}
    detail={said(of) || undefined}
    onGo={onGo}
  />
);

/**
 * ⚠️ THE SAME SHAPE AS A DOCUMENT, AT THE END OF THE SAME CARD, because it is the
 * other half of one question: this is what you agreed to, and this is who else
 * gets it.
 *
 * ⚠️ AND A PRODUCT THAT HAS NOT PUBLISHED ONE SAYS SO RATHER THAN VANISHING. A
 * row that predates the column is a real state; rendering nothing makes it
 * indistinguishable from a product that shares with nobody, which is the opposite
 * claim.
 */
const WhoRow = ({ of, onGo }: { readonly of: Product; readonly onGo: () => void }): ReactNode =>
  of.receiving === null
    ? <Item icon={<Others />} title="Who else sees this" detail="Not published yet" />
    : <Item icon={<Others />} title="Who else sees this" detail={counted(of.receiving)} onGo={onGo} />;

/**
 * ⚠️ FOUR STATES, AND THE MIDDLE ONE IS WHY THIS IS NOT A BOOLEAN. "Accepted an
 * earlier version" is what everybody sees the day terms change, and it is neither
 * "you agreed" nor "you never did" — collapsing it into either misreports the
 * record on precisely the day the record matters.
 */
export const said = (d: Doc): string =>
  d.outstanding
    ? (d.acceptedOn ? "New version" : "Not accepted")
    /* ⚠️ AND A DOCUMENT NOBODY IS ASKED FOR SAYS NOTHING AT ALL, rather than
       explaining an absence nobody had noticed. */
    : d.acceptedOn ? `Accepted ${d.acceptedOn}` : "";

/**
 * ⚠️ THE STATE OF A WHOLE PRODUCT, IN TWO WORDS, so the row is worth pressing or
 * not. It counts what is OWED rather than what is agreed: "3 of 4" is a fraction
 * whose remainder may be documents nobody ever has to accept, and the number a
 * person is looking for is how many are waiting on them.
 *
 * ⚠️ "Up to date" RATHER THAN "Agreed", because it is also true of a product that
 * has never asked this person for anything.
 */
export const state = (p: Product): string => {
  const owed = p.docs.filter((d) => d.outstanding).length;
  return owed === 0 ? "Up to date" : `${owed} to read`;
};

/**
 * ⚠️ THE ROLES, SPOKEN, because they are what decides which documents are owed —
 * the same person is a client in one studio and an owner in another, and reads a
 * different set for it. Sentence case rather than the stored word, which is a
 * registry key.
 */
export const held = (roles: readonly string[]): string => {
  const said = roles.map((r, i) => (i === 0 ? r.charAt(0).toUpperCase() + r.slice(1) : r));
  /* ⚠️ COMMAS UNTIL THE LAST ONE. Somebody is realistically two things in a
     product and occasionally three; joining every one with "and" reads as a chant
     rather than a list. */
  return said.length < 2 ? said.join("") : `${said.slice(0, -1).join(", ")} and ${said.at(-1)}`;
};

/* ---------------------------------------------------------- who gets it --- */

/**
 * ⚠️ HOW A TRANSFER IS COVERED, IN WORDS. The declaration is `eea | adequacy |
 * sccs | dpf`, which is the vocabulary a questionnaire asks in and nobody speaks.
 * The mapping lives here rather than in the manifest because it is a translation,
 * not a fact — the fact is the code, and it is what the record still carries.
 */
const SAFEGUARD: Readonly<Record<Subprocessor["safeguard"], string>> = {
  eea: "Stays in Europe",
  adequacy: "A country Europe has judged adequate",
  sccs: "Standard contractual clauses",
  dpf: "EU–US Data Privacy Framework",
};

/**
 * ⚠️ THE CATEGORIES ARE A CLOSED SET AND ARE SPOKEN, not printed. `identity` and
 * `usage` are the schema's words; a person reads "who you are" and "what you did
 * here".
 */
const CATEGORY: Readonly<Record<DataCategory, string>> = {
  identity: "who you are", contact: "how to reach you", credential: "how you sign in",
  financial: "what was charged", usage: "what you did here", content: "what you wrote",
  location: "where you were", device: "your device",
  health: "your health", biometric: "your biometrics", genetic: "your genetics",
  racial: "your ethnicity", political: "your politics", religious: "your religion",
  union: "union membership", sexlife: "your sex life",
  criminal: "criminal matters",
};

/**
 * ⚠️ THE THREE NUMBERS EVERY SENTENCE ON THIS SUBJECT IS MADE OF, counted once.
 * The row's two words and the screen's sentence are two readings of one count; as
 * two counts they can disagree, and a summary that disagrees with the list under
 * it is worse than no summary.
 */
const tally = (of: Receiving): { all: number; out: number; special: boolean } => ({
  all: of.transfers.length,
  out: of.transfers.filter((t) => t.safeguard !== "eea").length,
  special: of.transfers.some((t) => t.special),
});

/** The row's line: the shortest true answer. */
export const counted = (of: Receiving): string => {
  const { all, out } = tally(of);
  if (all === 0) return "Nobody else";
  return `${all} ${all === 1 ? "company" : "companies"}${out === 0 ? "" : ` · ${out} outside Europe`}`;
};

/**
 * ⚠️ THE ANSWER AS A SENTENCE, WHICH IS WHAT REPLACED THE TABLE. "Stored in",
 * "Companies with access" and "Leaves Europe" were three rows a reader had to
 * assemble into this, and the first of them was a claim the payload cannot
 * support: it carried the regions this PRODUCT can be deployed in, under a label
 * saying where THIS PERSON'S data is.
 */
export const receives = (of: Receiving): string => {
  const { all, out, special } = tally(of);
  if (all === 0) return "Nothing here is shared with any other company.";
  const who = all === 1 ? "One company receives something" : `${all} companies receive something`;
  const where = out === 0 ? "None of it leaves Europe."
    : out === all ? (all === 1 ? "It is outside Europe." : "All of them are outside Europe.")
      : `${out} of them ${out === 1 ? "is" : "are"} outside Europe.`;
  return `${who}. ${where}${special ? " Some of it is sensitive." : ""}`;
};

/**
 * EVERY COMPANY THAT RECEIVES SOMETHING.
 *
 * ⚠️ IT WAS A WALL AND THE WALL WAS THE CONTENT. Each company printed a name, four
 * lines of role, three category lozenges, three lines of grey place-and-safeguard
 * text and two bare blue links — about twelve lines each, four times over, under a
 * seven-line paragraph naming the controller. Everything on it was true and none of
 * it was readable, which is the specific failure of putting a RECORD on a screen
 * instead of an ANSWER.
 *
 * ⚠️ SO A COMPANY IS A ROW AND THE RECORD IS BEHIND IT. The row carries the mark,
 * the name, and the one line a person came for — what they do and whether it
 * leaves. Everything a questionnaire wants is one press away, where somebody who
 * wants it will find it and nobody else has to read past it.
 *
 * ⚠️ AND THE CONTROLLER IS A SENTENCE, NOT A FIELD. A paragraph as the value of a
 * settings row is a paragraph nobody reads in the one place they should.
 */
export function ReceivingScreen({ of, onOpen, onBack, Heading = "h1" }: {
  readonly of: Product;
  /** ⚠️ A recipient's own record. Absent means the rows do not go anywhere. */
  readonly onOpen?: (to: string) => void;
  readonly onBack: () => void;
  readonly Heading?: ElementType;
}): ReactNode {
  /* ⚠️ NEVER RENDERED WITHOUT ONE — the row that opens this is not pressable
     where nothing has published. Narrowed here rather than asserted, because an
     assertion is the thing that turns a missing row into a blank screen. */
  const r = of.receiving;
  if (r === null) return null;

  const byId = new Map(r.subprocessors.map((p) => [p.id, p]));

  return (
    <Screen leave="up" onLeave={onBack} name="Who else sees this"
      title={<Title as={Heading}>Who else sees this</Title>}
      /* ⚠️ THE ANSWER IS THE LEDE. A screen whose first line is a heading and
         whose second is a table asks the reader to do the summarising. */
      lede={receives(r)}
    >
      {r.transfers.length ? (
        /*
          ⚠️ ONE LIST, BUILT FROM `transfers` RATHER THAN FROM `subprocessors`, and
          the difference is honesty. A subprocessor's `receives` is what THEY
          declare; a transfer's `categories` is that crossed with what this product
          actually holds — so a company claiming `financial` in an app with none
          cannot make its own row look larger than it is.
        */
        <Section>
          <Card>
            {r.transfers.map((t) => {
              const sub = byId.get(t.to);
              return (
                <Item
                  key={t.to}
                  mark={<Mark kind="company" logo={sub?.mark} name={t.name} />}
                  title={t.name}
                  /*
                    ⚠️ THE DECLARED LABEL, NOT THE DECLARATION. `role` is a full
                    sentence written for a record; on a row it was five wrapped
                    lines per company with the name clipped to make room. `does` is
                    the same thing in four words, declared beside it and held to a
                    length — because a screen cutting somebody else's sentence in
                    half is the same class of invention as writing it.

                    ⚠️ AND NO CAPSULE. Every company here leaves Europe, so one on
                    every row distinguishes nothing — the rule a standing already
                    lives by. The count is in the lede; the safeguard is on the
                    record this row opens.
                  */
                  detail={sub?.does}
                  onGo={onOpen ? () => onOpen(t.to) : undefined}
                />
              );
            })}
          </Card>
        </Section>
      ) : null}

      {/* ⚠️ WHO IS RESPONSIBLE IS LAST AND IS PROSE. It is the answer to a
          different question from "who else sees this" — one a person asks once and
          a regulator asks always — and as the first card on the screen its seven
          lines were what a reader met before anything they came for. */}
      <Section name="Responsible for your data">
        <div className="prose prose-quiet">
          <p>{r.controller}</p>
        </div>
        <p className="prose-away"><Away href={`mailto:${r.contact}`}>{r.contact}</Away></p>
      </Section>

      {Object.keys(r.inference).length ? (
        /* ⚠️ PER REGION, BECAUSE RESIDENCY IS NOT ONLY STORAGE. Choosing a region
           chooses where records are STORED; which models a generation reaches is a
           separate answer, and publishing the two together is what lets somebody
           choose knowing both. */
        <Section name="Where answers are generated">
          <Card>
            {Object.entries(r.inference).flatMap(([binding, byRegion]) =>
              Object.entries(byRegion).map(([region, ids]) => (
                <Region key={`${binding}:${region}`} region={region}
                  said={ids.length === 0
                    ? "Nothing is generated here"
                    : ids.map((id) => byId.get(id)?.name ?? id).join(", ")} />
              )),
            )}
          </Card>
        </Section>
      ) : null}
    </Screen>
  );
}

/**
 * ONE RECIPIENT'S WHOLE RECORD.
 *
 * ⚠️ THIS IS WHERE THE QUESTIONNAIRE LIVES. Everything a compliance review asks
 * for — every category, the place, the safeguard, their processing terms and their
 * own published certifications — on a screen somebody opened on purpose, rather
 * than in a column everybody else has to read past.
 */
export function RecipientScreen({ of, sub, onBack, Heading = "h1" }: {
  readonly of: Product;
  readonly sub: string;
  readonly onBack: () => void;
  readonly Heading?: ElementType;
}): ReactNode {
  const r = of.receiving;
  const who = r?.subprocessors.find((p) => p.id === sub);
  const transfer = r?.transfers.find((t) => t.to === sub);
  if (!r || !who) return null;

  return (
    <Screen leave="up" onLeave={onBack} name={who.name}
      title={<Title as={Heading}>{who.name}</Title>}
      lede={who.role}
    >
      <Section>
        <Card className="entries">
          {/* ⚠️ SPOKEN, NOT PRINTED. `identity` and `usage` are the schema's words;
              a person reads "who you are" and "what you did here" — and as a
              sentence rather than a stack of lozenges, because a set of things is
              a sentence and a reader parsing capsules is doing the screen's work. */}
          <Entry label="What they get">{spoken(transfer?.categories ?? [])}</Entry>
          <Entry label="Where they process it">{who.where}</Entry>
          <Entry label="What covers it">{SAFEGUARD[who.safeguard]}</Entry>
        </Card>
      </Section>

      {/* ⚠️ THEIR LINKS, NOT COPIES OF WHAT IS BEHIND THEM. A certification list
          changes on their schedule; a copy in this repository is wrong the first
          time one lapses, in the most damaging place available — a compliance
          claim we made about somebody else. */}
      <Section name="What they publish">
        <Card>
          <Item icon={<Paper />} title="Their processing terms" away={who.terms} />
          {who.trust ? <Item icon={<Guard />} title="Their certifications" away={who.trust} /> : null}
        </Card>
      </Section>
    </Screen>
  );
}

/**
 * ⚠️ A SET OF THINGS IS A SENTENCE. Rendered as capsules, seventeen possible
 * values three-or-four to a row became a stack of grey lozenges a reader had to
 * parse — and the question they actually have, "is my health data in there", was
 * answered by scanning rather than by reading. Spoken, it is one line.
 */
export const spoken = (of: readonly DataCategory[]): string => {
  const said = of.map((c) => CATEGORY[c] ?? c);
  if (said.length === 0) return "Nothing";
  const joined = said.length === 1 ? said[0]! : `${said.slice(0, -1).join(", ")} and ${said.at(-1)}`;
  /* ⚠️ SENTENCE CASE, BECAUSE IT IS A VALUE AND NOT A FRAGMENT. The categories are
     written as phrases — "who you are" — which read correctly inside a sentence
     and as a lower-case start under a label. */
  const one = joined.charAt(0).toUpperCase() + joined.slice(1);
  /* ⚠️ ARTICLE 9 IS NAMED IN THE SENTENCE, not marked on a lozenge. A badge saying
     something here is sensitive does not say WHICH, and a reader looking for one
     word finds it faster in a line than in a colour. */
  return of.some((c) => SPECIAL_CATEGORIES.includes(c)) ? `${one} — some of it sensitive` : one;
};

/** Where records are kept, as a row. */
const Region = ({ region, said }: { readonly region: string; readonly said: string }): ReactNode => {
  const known = jurisdictionOf(region);
  return (
    <Item
      icon={region === "eu" ? <Union /> : <Global />}
      title={known?.name ?? region}
      detail={said}
    />
  );
};

/* ------------------------------------------------------------ one of them --- */

/**
 * ONE DOCUMENT, READ.
 *
 * ⚠️ THE TEXT IS THE SCREEN. No card, no rows — a legal document inside a settings
 * list reads as a form field containing a novel.
 *
 * ⚠️ THE AGREEMENT IS AT THE END, WHICH IS THE POINT. A button at the top is one
 * pressed before reading; at the bottom it is one pressed after scrolling past the
 * text, which is the only version of this that is worth anything as evidence.
 */
export function DocScreen({ item, onAccept, onBack, Heading = "h1" }: {
  readonly item: Doc;
  readonly onAccept: () => Promise<Problem | null>;
  readonly onBack: () => void;
  readonly Heading?: ElementType;
}): ReactNode {
  /* ⚠️ THE SAME LIFECYCLE EVERY OTHER WRITE HERE USES. A local boolean is shorter
     and cannot express a refusal or the moment it landed, and carries neither the
     haptic nor the sound. */
  const { state: at, run, reset } = useCommit(onAccept, onBack);
  const problem = at.at === "failed" ? at.problem : null;
  const { doc } = item;

  return (
    <Screen leave="up" onLeave={onBack} name={doc.title}
      title={<Title as={Heading}>{doc.title}</Title>}
      /* ⚠️ THE VERSION IS ON THE SCREEN, because a consent is recorded against a
         version and a document that does not say which cannot be checked against
         the record. */
      lede={`Version ${doc.version}`}
    >
      {/* ⚠️ WHAT MOVED, ABOVE THE TEXT, AND ONLY FOR SOMEBODY WHO AGREED BEFORE.
          Versioning was already real and silent: the ledger re-asks everybody the
          day a version changes, and what they were shown was the same wall of text
          with a different number on it. Somebody re-agreeing without being told
          what changed is a signature collected rather than a consent given.

          ⚠️ AND IT IS NOT SHOWN TO A FIRST READER. To somebody who has never
          accepted anything here, "what changed" is a diff against a document they
          have not read — noise at the top of the thing they are meant to read. */}
      {doc.changed && item.acceptedOn ? (
        <Section>
          <p className="changed">
            <span className="changed-what">What changed</span>
            {doc.changed}
          </p>
        </Section>
      ) : null}

      <Section>
        {doc.body ? <div className="prose">{paragraphs(doc.body)}</div> : null}
        {doc.url ? (
          /* ⚠️ A LINK OUT IS A LINK OUT AND SAYS SO. Rendering the operative
             document's address as more of this page is how somebody agrees to a
             summary believing they read the contract. */
          <p className="prose-away">
            <Away href={doc.url}>Open the full document</Away>
          </p>
        ) : null}
      </Section>

      {item.outstanding ? (
        <Section>
          {problem ? (
            /* ⚠️ WHERE THE PRESS WAS, NOT IN A TOAST. A refusal that travels to the
               corner is read after somebody has navigated away from its cause. */
            <p className="note wrong" role="alert">
              <strong>{problem.title}</strong>
              {problem.detail ? <> {problem.detail}</> : null}
              <span className="note-ref">{problem.ref}</span>
            </p>
          ) : null}
          <Button
            tone="loud" wide
            data-state={at.at}
            disabled={at.at === "working" || at.at === "done"}
            onClick={() => { reset(); void run(); }}
            sign={at.at === "done" ? <Tick className="button-sign" size={21} /> : undefined}
          >
            {at.at === "working" ? "Recording" : at.at === "done" ? "Agreed"
              : problem?.retryable ? "Try again" : "I agree"}
          </Button>
        </Section>
      ) : item.acceptedOn ? (
        /* ⚠️ THE SAME PLACE ANSWERS THE SAME QUESTION IN BOTH STATES. */
        <Section><p className="prose-said">Accepted {item.acceptedOn}.</p></Section>
      ) : null}
    </Screen>
  );
}

/* ---------------------------------------------------------- before you go --- */

/** One thing somebody still owes, and which product is asking. */
export interface Owed {
  readonly product: string;
  readonly productName: string;
  readonly doc: LegalDoc;
  /** ⚠️ Whether they held an earlier version — the difference between "new" and "never". */
  readonly seenBefore: boolean;
}

/**
 * WHAT STANDS BETWEEN SOMEBODY AND USING THE PRODUCT.
 *
 * ⚠️ THE SERVER ALREADY REFUSED, AND THIS IS THE SURFACE FOR IT. Every write with
 * an outstanding document comes back `platform.consent_required` — so without a
 * screen, a person met an error on whatever they happened to be doing, with a code
 * naming documents and no way to reach one. A refusal that names what is missing
 * and cannot take you to it is a dead end with a citation.
 *
 * ⚠️ IT IS NOT A DIALOG AND IT IS NOT DISMISSIBLE HERE. Everything a person can
 * still do — sign out, read, leave, export, close the account — is on a lane the
 * gate exempts, so this is not a wall around the product: it is the one thing they
 * have to do first, shown as a place rather than as a sheet that keeps returning.
 *
 * ⚠️ AND IT SAYS WHICH ARE NEW VERSIONS. "You agreed to this before and it has
 * changed" is a different sentence from "you have never agreed to this", and on
 * the day terms are republished it is the sentence everybody is owed.
 */
export function MustAcceptScreen({ owed, onGo, onLeave, Heading = "h1" }: {
  readonly owed: readonly Owed[];
  readonly onGo: (to: Where) => void;
  /** ⚠️ Never "cancel". The way out of this screen is out of the product. */
  readonly onLeave: () => void;
  readonly Heading?: ElementType;
}): ReactNode {
  const again = owed.some((o) => o.seenBefore);
  return (
    <Screen leave="dismiss" onLeave={onLeave} name="Before you continue"
      sky="silk"
      title={<Title as={Heading}>{again ? "Something has changed" : "Before you continue"}</Title>}
      lede={again
        ? "One of the documents you agreed to has been republished. Please read what changed."
        : "There is something to read and agree to first. Everything else is waiting for you."}
    >
      <Section>
        <Card>
          {owed.map((o) => (
            <Item
              key={`${o.product}:${o.doc.id}`}
              icon={<Paper />}
              tone="warn"
              title={o.doc.title}
              /* ⚠️ THE PRODUCT IS ON THE ROW because this list crosses them: the
                 account's own terms and a studio's sit in one card, and which is
                 asking is the first thing a reader wants. */
              detail={`${o.productName} · ${o.seenBefore ? "New version" : "Not accepted"}`}
              onGo={() => onGo({ at: "document", product: o.product, document: o.doc.id })}
            />
          ))}
        </Card>
      </Section>

      {/* ⚠️ LEAVING IS ALWAYS ALLOWED, AND IT IS SAID HERE RATHER THAN IMPLIED.
          The exit lane survives every gate in the platform for exactly this
          reason: a person who does not agree must be able to take their account
          and go, and a screen that only offers agreement is one that pretends
          otherwise. */}
      <Section>
        <p className="note">
          You do not have to agree. You can download everything we hold and close
          your account instead — both still work from here.
        </p>
      </Section>
    </Screen>
  );
}

/**
 * ⚠️ BLANK LINES ARE PARAGRAPHS, AND NOTHING ELSE IS MARKUP. A declared document
 * is text somebody wrote in a manifest, so rendering it as HTML would make every
 * manifest a way into every reader's page for the sake of bold headings.
 */
export const paragraphs = (body: string): readonly ReactNode[] =>
  body.split(/\n\s*\n/).map((p, i) => <p key={i}>{p.trim()}</p>);

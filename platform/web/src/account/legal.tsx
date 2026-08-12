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
 * ⚠️ THE DISCLOSURE IS A DESTINATION, NOT A TABLE UNDER EVERY GROUP. It was five
 * label/value rows plus two more foldouts BENEATH EACH PRODUCT'S documents, so a
 * person in three products met eleven blocks alternating between two visual
 * languages, and the answer they came for — does anything leave, is any of it
 * sensitive — was assembled by reading a table. It is one row now, whose second
 * line IS the answer, and pressing it opens the evidence. That is the same rule
 * the vault's groups and the preferences hub already live by: a summary has to be
 * worth NOT opening.
 *
 * ⚠️ AND A PRODUCT IS A DISCLOSURE, OPENED BY WHAT IT OWES. Somebody with nothing
 * outstanding wants one line per product saying so; somebody who owes a document
 * wants it in front of them. `openAtFirst` on exactly the products with something
 * outstanding is both, with no second list of the same rows — which is what a
 * "needs your attention" section at the top would have been, ticking in two places
 * at once.
 *
 * ⚠️ THE ONLY THING THAT CAN BE PRESSED TO AGREE IS AN OUTSTANDING DOCUMENT.
 * Everything else reports. A consent screen whose every row is actionable teaches
 * that agreeing is something you do repeatedly and casually, which is the reflex a
 * ledger exists to be evidence against.
 *
 * ⚠️ TWO LEVELS OF DISCLOSURE, AND THE SECOND IS NOT THE ARTICLE 30 RECORD.
 * `protection.record` computes one, and it is `workspace:close` — it is about the
 * DEPLOYMENT, for a regulator, and it belongs on the operator door. What a person
 * gets here is the same public declaration at two depths: the sentence, then every
 * recipient with what they receive and how the transfer is covered.
 */

import { useState, type ElementType, type ReactNode } from "react";
import type { DataCategory, Problem, Receiving, Subprocessor } from "@one/kernel";
import { SPECIAL_CATEGORIES } from "@one/kernel";
/* ⚠️ THE SHAPES COME FROM THE SEAM, which is the module `scripts/wire.test.mjs`
   holds to the kernel. A screen that declared its own would be outside the one
   check that exists to stop it inventing a field. */
import type { Doc, Product } from "./wire.js";
import { Lockup } from "../brand/mark.js";
import { Button } from "../button.js";
import { useCommit } from "../commit.js";
import { Disclose } from "../disclose.js";
import { Others, Paper, Tick } from "../icon.js";
import { Blank, Card, Entry, Item, Waiting } from "../list.js";
import { Screen, Section, Title } from "../screen.js";
import { Stack } from "../stack.js";

export interface LegalScreenProps {
  /**
   * ⚠️ ONE GROUP PER PRODUCT, because a person belongs to several and each asks
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
  readonly onAccept: (id: string, version: string) => Promise<Problem | null>;
  readonly onBack: () => void;
  readonly Heading?: ElementType;
}

/**
 * ⚠️ WHERE A LEVEL IS, AS ONE STRING, and the two kinds are prefixed rather than
 * held in two pieces of state. A document id and an app id are both opaque and
 * both could be `terms`; two states would also let both be set at once, which is
 * a screen with no defined answer to what it is showing.
 */
const DOC = "doc:", WHO = "who:";

export function LegalScreen({
  products, onAccept, onBack, Heading = "h1",
}: LegalScreenProps): ReactNode {
  const [at, setAt] = useState<string | null>(null);

  const reading = at?.startsWith(DOC)
    ? products?.flatMap((p) => p.docs).find((d) => d.doc.id === at.slice(DOC.length)) ?? null
    : null;
  const showing = at?.startsWith(WHO)
    ? products?.find((p) => p.appId === at.slice(WHO.length)) ?? null
    : null;

  /* ⚠️ THE ACCOUNT IS TAKEN OUT BY ITS EMPTY `appId`, not by position. It arrives
     first today; a list that assumed so would put a product under the lockup the
     day anything reorders. */
  const account = products?.find((p) => p.appId === "") ?? null;
  const rest = products?.filter((p) => p.appId !== "") ?? [];

  return (
    <Stack at={at}>
      {reading
        ? (
          <DocScreen
            item={reading}
            onAccept={() => onAccept(reading.doc.id, reading.doc.version)}
            onBack={() => setAt(null)}
            Heading={Heading}
          />
        )
        : showing
          ? <ReceivingScreen of={showing} onBack={() => setAt(null)} Heading={Heading} />
          : (
            <Screen leave="up" onLeave={onBack} name="Consent and legal"
              title={<Title as={Heading}>Consent and legal</Title>}
              lede="What you have agreed to, and who else receives what is held here."
            >
              {products === null ? <Section><Waiting /></Section> : (
                <>
                  {/* ⚠️ NAMED BY THE LOCKUP, WHICH IS THE PLATFORM'S ONE DEVICE FOR
                      "this belongs to the account". Set as words it is a fourth
                      product with a longer name, in a list whose whole point is
                      that this one is a different order of thing — it exists
                      before any product and outlives all of them. */}
                  {account ? (
                    <Section name={<Lockup word="Account" />}>
                      <Card>
                        {account.docs.map((d) => (
                          <DocRow key={d.doc.id} of={d} onGo={() => setAt(DOC + d.doc.id)} />
                        ))}
                        <WhoRow of={account} onGo={() => setAt(WHO + account.appId)} />
                      </Card>
                    </Section>
                  ) : null}

                  {rest.length === 0
                    ? (
                      /* ⚠️ ONLY WHERE THE ACCOUNT ITSELF SAID NOTHING EITHER. With
                         the account's own terms above it, "nothing to agree to" is
                         a flat contradiction of the card the reader is looking at;
                         what is empty is the PRODUCTS, and that is a sentence about
                         products. */
                      account
                        ? null
                        : (
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
                            /* ⚠️ NAMED BY THE PRODUCT, NOT BY THE WORKSPACE. An
                               acceptance is recorded per account, so somebody in
                               two studios of the same product has one obligation —
                               listing it under each would show two rows that tick
                               together. */
                            <Disclose
                              key={p.appId}
                              title={p.appName}
                              detail={held(p.roles)}
                              said={<span className="disclose-count">{state(p)}</span>}
                              /* ⚠️ OPEN WHERE SOMETHING IS OWED. A product settled
                                 years ago is one line saying so; the one asking for
                                 something is the reason this screen was opened. */
                              openAtFirst={p.docs.some((d) => d.outstanding)}
                            >
                              {p.docs.map((d) => (
                                <DocRow key={d.doc.id} of={d} onGo={() => setAt(DOC + d.doc.id)} />
                              ))}
                              <WhoRow of={p} onGo={() => setAt(WHO + p.appId)} />
                            </Disclose>
                          ))}
                        </Card>
                      </Section>
                    )}
                </>
              )}
            </Screen>
          )}
    </Stack>
  );
}

/* ------------------------------------------------------------------ rows --- */

/** One document, wherever it is listed. Two callers, one row. */
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
 * gets it. As a card of its own under every group it read as a second subject and
 * doubled the length of the screen.
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
 * ⚠️ THE STATE OF A WHOLE PRODUCT, IN TWO WORDS, so the row is worth not opening.
 * It counts what is OWED rather than what is agreed: "3 of 4" would be a fraction
 * whose remainder may be documents nobody ever has to accept, and the number a
 * person is looking for is how many are waiting on them.
 *
 * ⚠️ "Up to date" RATHER THAN "Agreed", because it is also true of a product that
 * has never asked this person for anything. A product with four documents none of
 * which are owed of a client is not a product they agreed to four things in.
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
     product and occasionally three; joining every one with "and" reads as a
     chant rather than a list. */
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
 * ⚠️ ONE PER CATEGORY, MARKED WHERE IT IS ARTICLE 9. Set as a comma list these are
 * prose to be parsed, and the question a person has — "is my health data in
 * there" — is answered by scanning rather than by reading to the end.
 *
 * ⚠️ THE SPECIAL SET IS THE KERNEL'S, not a list repeated here. `SPECIAL_CATEGORIES`
 * is what `transfersOf` marks a transfer by, so a screen keeping its own copy is
 * how the tag and the row it is on come to disagree.
 */
const Tags = ({ of }: { readonly of: readonly DataCategory[] }): ReactNode => (
  <span className="tags">
    {of.map((c) => (
      <span key={c} className="tag" data-special={SPECIAL_CATEGORIES.includes(c) ? "" : undefined}>
        {CATEGORY[c] ?? c}
      </span>
    ))}
  </span>
);

/**
 * EVERY COMPANY THAT RECEIVES SOMETHING, AND WHAT COVERS IT.
 *
 * ⚠️ A SCREEN, BECAUSE IT IS THE EVIDENCE. Folded under a product's documents it
 * competed with them for the same card and forced its own rows into a shape meant
 * for values; on its own it can answer in a sentence and then show the list, which
 * is the order somebody reading it asks in.
 */
export function ReceivingScreen({ of, onBack, Heading = "h1" }: {
  readonly of: Product;
  readonly onBack: () => void;
  readonly Heading?: ElementType;
}): ReactNode {
  /* ⚠️ NEVER RENDERED WITHOUT ONE — the row that opens this is not pressable
     where nothing has published. Narrowed here rather than asserted, because an
     assertion is the thing that turns a missing row into a blank screen. */
  const r = of.receiving;
  if (r === null) return null;

  /* ⚠️ The one thing a transfer does not carry: what they DO for us. */
  const roleOf = new Map(r.subprocessors.map((p) => [p.id, p.role]));
  const nameOf = new Map(r.subprocessors.map((p) => [p.id, p.name]));

  return (
    <Screen leave="up" onLeave={onBack} name="Who else sees this"
      title={<Title as={Heading}>Who else sees this</Title>}
      /* ⚠️ THE ANSWER IS THE LEDE. A screen whose first line is a heading and
         whose second is a table asks the reader to do the summarising. */
      lede={receives(r)}
    >
      <Section>
        <Card className="entries">
          <Entry label="Responsible for your data">{r.controller}</Entry>
          <Entry label="Who to write to">{r.contact}</Entry>
        </Card>
      </Section>

      {r.transfers.length ? (
        /*
          ⚠️ ONE LIST, BUILT FROM `transfers` RATHER THAN FROM `subprocessors`,
          and the difference is honesty. A subprocessor's `receives` is what THEY
          declare; a transfer's `categories` is that crossed with what this product
          actually holds — so a company claiming `financial` in an app with none
          cannot make its own row look larger than it is.

          ⚠️ AND THERE IS NOT A SECOND SECTION FOR WHAT CROSSES A BORDER. There
          was, and it listed every recipient including the ones whose safeguard is
          `eea` — a heading reading "what actually leaves" above two companies that
          do not. Whether it leaves is a property of the row, said on the row.
        */
        <Section name="What each one gets">
          <Card>
            {r.transfers.map((t) => (
              /*
                ⚠️ WHO, THEN WHAT THEY DO, THEN WHAT THEY GET, THEN WHERE AND UNDER
                WHAT. Four facts on one dot-separated line is a sentence somebody
                has to parse; the categories are a set and now read as one.

                ⚠️ AND IT IS A RECORD RATHER THAN AN `Entry`. As a field the
                company's NAME was the quiet label and its job description was the
                value — which inverts the one thing somebody scanning "who has my
                data" is scanning for.

                ⚠️ NO "Sensitive" BADGE ON THE ROW. Article 9 is marked on the
                category that IS Article 9, which is the word a reader is looking
                for — a badge at the end of the line says the same thing a second
                time and does not say which one. The sentence at the top still
                carries it, because up there nothing names a category at all.
              */
              <div className="party" key={t.to}>
                <span className="party-name">{t.name}</span>
                <span className="party-role">{roleOf.get(t.to)}</span>
                <Tags of={t.categories} />
                <span className="party-where">{t.where} · {SAFEGUARD[t.safeguard]}</span>
              </div>
            ))}
          </Card>
        </Section>
      ) : null}

      {Object.keys(r.inference).length ? (
        /* ⚠️ PER REGION, BECAUSE RESIDENCY IS NOT ONLY STORAGE. Choosing a region
           chooses where records are STORED; which models a generation reaches is a
           separate answer, and publishing them together is what lets somebody
           choose knowing both.

           ⚠️ AND THE REGION IS THE LABEL RATHER THAN A CLAIM ABOUT WHERE ANYBODY
           LIVES. It is the id as declared, which is honest here — "in this region,
           these" — and was not when the same string sat under "Stored in". */
        /* DEFER(one-188) stage:7 — a region has no human name anywhere in the
           platform, and this payload carries the app's offered regions rather than
           the reader's own. Both have to move together, or a prettier word would
           be a screen inventing where somebody's data is. */
        <Section name="Where answers are generated">
          <Card className="entries">
            {Object.entries(r.inference).flatMap(([binding, byRegion]) =>
              Object.entries(byRegion).map(([region, ids]) => (
                <Entry key={`${binding}:${region}`} label={region}>
                  {ids.length === 0
                    ? "Nothing generated here"
                    : ids.map((id) => nameOf.get(id) ?? id).join(", ")}
                </Entry>
              )),
            )}
          </Card>
        </Section>
      ) : null}
    </Screen>
  );
}

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
      <Section>
        {doc.body ? <div className="prose">{paragraphs(doc.body)}</div> : null}
        {doc.url ? (
          /* ⚠️ A LINK OUT IS A LINK OUT AND SAYS SO. Rendering the operative
             document's address as more of this page is how somebody agrees to a
             summary believing they read the contract. */
          <p className="prose-away">
            <a href={doc.url} target="_blank" rel="noreferrer">Open the full document</a>
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

/**
 * ⚠️ BLANK LINES ARE PARAGRAPHS, AND NOTHING ELSE IS MARKUP. A declared document
 * is text somebody wrote in a manifest, so rendering it as HTML would make every
 * manifest a way into every reader's page for the sake of bold headings.
 */
export const paragraphs = (body: string): readonly ReactNode[] =>
  body.split(/\n\s*\n/).map((p, i) => <p key={i}>{p.trim()}</p>);

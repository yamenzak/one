/**
 * CONSENT AND LEGAL — what this product asked you to agree to, and who else
 * receives what it holds.
 *
 * ⚠️ EVERY SHAPE HERE IS THE KERNEL'S. `Doc` WRAPS a `LegalDoc` rather than
 * restating it, and the disclosure is `Subprocessor` and `Transfer` as declared.
 * The previous version of this screen described its own versions of those and got
 * three of them wrong — `purpose`, `region`, `basis`, none of which anything has
 * ever sent — and it rendered convincingly because the fixtures were written to
 * match. `scripts/wire.test.mjs` is why that cannot happen from here again.
 *
 * ⚠️ TWO LEVELS, AND THE SECOND IS NOT THE ARTICLE 30 RECORD. `protection.record`
 * computes one, and it is `workspace:close` — it is about the DEPLOYMENT, for a
 * regulator, and it belongs on the operator door. What a person gets here is the
 * same public declaration at two depths: the answer, then every recipient with
 * what they receive and how the transfer is covered.
 *
 * ⚠️ THE ONLY THING THAT CAN BE PRESSED IS AN OUTSTANDING DOCUMENT. Everything
 * else reports. A consent screen whose every row is actionable teaches that
 * agreeing is something you do repeatedly and casually, which is the reflex a
 * ledger exists to be evidence against.
 */

import { useState, type ElementType, type ReactNode } from "react";
import type { DataCategory, Problem, Receiving, Subprocessor } from "@one/kernel";
import { SPECIAL_CATEGORIES } from "@one/kernel";
/* ⚠️ THE SHAPES COME FROM THE SEAM, which is the module `scripts/wire.test.mjs`
   holds to the kernel. A screen that declared its own would be outside the one
   check that exists to stop it inventing a field. */
import type { Doc, Product } from "./wire.js";
import { Button } from "../button.js";
import { useCommit } from "../commit.js";
import { Disclose } from "../disclose.js";
import { Paper, Tick } from "../icon.js";
import { Blank, Card, Entry, Item, Pill, Waiting } from "../list.js";
import { Screen, Section, Title } from "../screen.js";
import { Stack } from "../stack.js";

export interface LegalScreenProps {
  /**
   * ⚠️ ONE SECTION PER PRODUCT, because a person belongs to several and each asks
   * different things of them. `legal.list` answers for the app serving the
   * request, which on the account centre is whichever one happens to be behind
   * that door — so this takes what every app PUBLISHED, resolved against the
   * roles this person actually holds in each.
   *
   * Null until known. `[]` is "you are in no product", which is a fact.
   */
  readonly products: readonly Product[] | null;
  readonly onAccept: (id: string, version: string) => Promise<Problem | null>;
  readonly onBack: () => void;
  readonly Heading?: ElementType;
}

export function LegalScreen({
  products, onAccept, onBack, Heading = "h1",
}: LegalScreenProps): ReactNode {
  const [reading, setReading] = useState<string | null>(null);
  const open = products?.flatMap((p) => p.docs).find((d) => d.doc.id === reading) ?? null;

  return (
    <Stack at={open ? open.doc.id : null}>
      {open
        ? (
          <DocScreen
            item={open}
            onAccept={() => onAccept(open.doc.id, open.doc.version)}
            onBack={() => setReading(null)}
            Heading={Heading}
          />
        )
        : (
          <Screen leave="up" onLeave={onBack} name="Consent and legal"
            title={<Title as={Heading}>Consent and legal</Title>}
            lede="What you have agreed to, and who else receives what is held here."
          >
            {products === null
              ? <Section><Waiting /></Section>
              : products.length === 0
                ? (
                  <Section>
                    <Blank title="Nothing to agree to">
                      You are not in any product that asks you to accept anything.
                    </Blank>
                  </Section>
                )
                : products.map((p) => (
                  /* ⚠️ NAMED BY THE PRODUCT, NOT BY THE WORKSPACE. An acceptance is
                     recorded per account, so somebody in two studios of the same
                     product has one obligation — listing it under each would show
                     two rows that tick together. */
                  <Section key={p.appId} name={p.appName}>
                    <Card>
                      {p.docs.map((d) => (
                        <Item
                          key={d.doc.id}
                          icon={<Paper />}
                          /* ⚠️ AMBER, NOT RED, AND ONLY ON WHAT IS UNFINISHED. Red is
                             what the row that closes an account wears; a document
                             waiting to be read is not that kind of thing. */
                          tone={d.outstanding ? "warn" : undefined}
                          title={d.doc.title}
                          detail={said(d) || undefined}
                          onGo={() => setReading(d.doc.id)}
                        />
                      ))}
                    </Card>
                    {/* ⚠️ THIS PRODUCT'S OWN RECIPIENTS, UNDER THIS PRODUCT'S
                        DOCUMENTS. One app's disclosure shown under every app's
                        documents told somebody in three products about the one
                        behind whichever door they came through. */}
                    {p.receiving ? <Receivers of={p.receiving} /> : null}
                  </Section>
                ))}

          </Screen>
        )}
    </Stack>
  );
}

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
 * here". Article 9 is not marked with a colour here — it is marked on the
 * TRANSFER, which is the row a reviewer reads first.
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
 * ⚠️ ONE PER CATEGORY, MARKED WHERE IT IS ARTICLE 9. Set as a comma list these are
 * prose to be parsed, and the question a person has — "is my health data in
 * there" — is answered by scanning rather than by reading to the end.
 *
 * ⚠️ THE SPECIAL SET IS THE KERNEL'S, not a list repeated here. `SPECIAL_CATEGORIES`
 * is what `transfersOf` marks a transfer by, so a screen keeping its own copy is
 * how the tag and the badge on the same row come to disagree.
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
 * ⚠️ THE SUMMARY IS THE ANSWER; THE LIST IS THE EVIDENCE. Somebody opening this
 * wants "who has my data and is any of it leaving Europe" — three lines. The
 * recipient-by-recipient detail is what a compliance team asks for and what a
 * person who does not trust the summary goes to, so it is one tap away rather
 * than absent or first.
 */
const Receivers = ({ of }: { readonly of: Receiving }): ReactNode => {
  /* ⚠️ COUNTED FROM THE DECLARATION, never typed beside it — a summary that can
     disagree with the list under it is worse than no summary. */
  const leaving = of.transfers.filter((t) => t.safeguard !== "eea");
  const special = of.transfers.some((t) => t.special);
  const byId = new Map(of.subprocessors.map((p) => [p.id, p.name]));
  /* ⚠️ The one thing a transfer does not carry: what they DO for us. */
  const roleOf = new Map(of.subprocessors.map((p) => [p.id, p.role]));

  return (
    <>
      <Card className="entries">
        <Entry label="Responsible for your data">{of.controller}</Entry>
        <Entry label="Who to write to">{of.contact}</Entry>
        {/*
          ⚠️ THE REGION IDS AS DECLARED, because there is no human name for one
          anywhere in the platform — `RegionId` is a bare string. Mapping
          `eu-central` to "Germany" here would be a screen inventing a fact about
          where somebody's data physically is, which is the one field a residency
          question is asked about. The recipients below carry real place names,
          and those are declared.
        */}
        {/* DEFER(one-188) stage:7 — a region has no human name. Every surface that
            shows one shows an id, and any prettier answer would have to be
            invented by whichever screen wanted it. */}
        <Entry label="Stored in">{of.regions.join(", ")}</Entry>
        <Entry label="Companies with access">{of.subprocessors.length}</Entry>
        {/* ⚠️ THE QUESTION EVERY PERSON AND EVERY QUESTIONNAIRE ASKS, answered in
            one row. "None" is a real answer and has to be given rather than
            implied by the row being missing. */}
        <Entry label="Leaves Europe">
          {leaving.length === 0 ? "No" : `Yes — ${leaving.length} of ${of.transfers.length}`}
          {/* ⚠️ A MARK ON A VALUE, NOT A ROW OF ITS OWN. Article 9 qualifies a
              transfer that is already listed; its own row would be the same fact
              stated twice and countable once. */}
          {special ? <Pill urgent>Includes sensitive data</Pill> : null}
        </Entry>
      </Card>

      {of.transfers.length ? (
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
        <Disclose title="Every company, and what it gets" said={String(of.transfers.length)}>
          <Card className="entries">
            {of.transfers.map((t) => (
              /*
                ⚠️ WHAT THEY DO, THEN WHAT THEY GET, THEN WHERE AND UNDER WHAT.
                Four facts on one dot-separated line is a sentence somebody has to
                parse; the categories are a set and now read as one.

                ⚠️ AND THE ROW'S "Sensitive" BADGE IS GONE WITH THEM. Article 9 is
                marked on the category that IS Article 9, which is the word a
                reader is looking for — a badge at the end of the line says the
                same thing a second time and does not say which one. The summary
                above still carries it, because up there nothing names a category
                at all.
              */
              <Entry key={t.to} label={t.name}>
                <span className="party">
                  <span className="party-role">{roleOf.get(t.to)}</span>
                  <Tags of={t.categories} />
                  <span className="party-where">{t.where} · {SAFEGUARD[t.safeguard]}</span>
                </span>
              </Entry>
            ))}
          </Card>
        </Disclose>
      ) : null}

      {Object.keys(of.inference).length ? (
        <Disclose title="Which models your region reaches" said={String(Object.keys(of.inference).length)}>
          <Card className="entries">
            {/* ⚠️ PER REGION, BECAUSE RESIDENCY IS NOT ONLY STORAGE. Choosing a
                region chooses where records are STORED; which models a generation
                reaches is a separate answer, and publishing them together is what
                lets somebody choose knowing both. */}
            {Object.entries(of.inference).flatMap(([binding, byRegion]) =>
              Object.entries(byRegion).map(([region, ids]) => (
                <Entry key={`${binding}:${region}`} label={region}>
                  {ids.length === 0
                    ? "Nothing generated here"
                    : ids.map((id) => byId.get(id) ?? id).join(", ")}
                </Entry>
              )),
            )}
          </Card>
        </Disclose>
      ) : null}
    </>
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
  const { state, run, reset } = useCommit(onAccept, onBack);
  const problem = state.at === "failed" ? state.problem : null;
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
            data-state={state.at}
            disabled={state.at === "working" || state.at === "done"}
            onClick={() => { reset(); void run(); }}
            sign={state.at === "done" ? <Tick className="button-sign" size={21} /> : undefined}
          >
            {state.at === "working" ? "Recording" : state.at === "done" ? "Agreed"
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

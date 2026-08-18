/**
 * DATA & TRUST — what is held, who touches it, and the ways out.
 *
 * ⚠️ SAID PLAINLY OR NOT AT ALL. The legal documents and the sub-processor list
 * come from the manifests, so they cannot drift from what the products actually
 * do. The account-wide actions — export, leaving, closing — live at the account
 * centre because they are about YOU everywhere, and this screen says so instead
 * of duplicating them behind a second door.
 */

import {
  Documents, Group, NavRow, Nothing, Screen, Section, SubProcessors, WhereItLives,
  distinguishing, glyphOf,
} from "@engine/design";
import { DocumentList } from "../legal.js";
import { KEEPS_RESIDENCY } from "@engine/kernel";
import type { Where } from "../door.js";
import { accountUrl } from "../door.js";
import type { CentreView } from "./data.js";

export function Trust({ view, where }: {
  readonly view: CentreView;
  readonly where: Where | null;
}) {
  /* ⚠️ THE PRODUCT'S OWN, WHICH IS USUALLY NONE. Terms, the privacy notice and
     the data processing agreement bind the company rather than a feature, so
     they are the DEPLOYMENT's — and this screen listed only the per-app books,
     found them empty, and drew no documents at all. The three everybody had
     agreed to were readable at the wall once and nowhere afterwards. */
  const documented = view.apps.filter((a) => Object.keys(a.documents).length > 0);
  const processing = view.apps.filter((a) => Object.keys(a.processors).length > 0);
  const housed = view.apps.filter((a) => Object.keys(a.needs ?? {}).length > 0);

  return (
    /* ⚠️ `detail` — one subject (what is held about you here) and its facts.
       Nothing on it is a primary action: the account-wide ways out live at the
       account, and the row below is a way THERE rather than a thing done here. */
    <Screen shape="detail">
      <>
          {/* ⚠️ THE DEPLOYMENT'S OWN, FIRST, AND IN THE SAME LIST THE WALL DRAWS
              — `DocumentList` reads them from `me.agreements` and opens each in a
              sheet, so agreeing to something and re-reading it later are the same
              surface rather than two that can disagree. */}
          <Section
            label="The documents"
            under="What One promises, and what you agreed to"
          >
            <DocumentList />
          </Section>
          {documented.map((app) => (
            /* ⚠️ THE HEADING NAMES THE BLOCK, NOT THE BLOCK AND ITS OWNER. Two
               em-dashed compounds per product is a heading somebody parses
               rather than reads, and on a workspace with one product the half
               before the dash distinguished nothing at all. */
            <Section key={app.id} label={distinguishing(documented, app.name) ?? "The documents"}>
              <Documents documents={Object.values(app.documents)} onOpen={() => {}} />
            </Section>
          ))}
          {processing.map((app) => (
            <Section
              key={app.id}
              label={distinguishing(processing, app.name) ?? "Who else touches the data"}
              under="Every third party a fact can reach, named"
            >
              <SubProcessors book={app.processors} />
            </Section>
          ))}
          {/*
            ⚠️ WHERE IT ACTUALLY SITS, BESIDE WHO ELSE TOUCHES IT. "Your data is
            stored in the EU" is the half of a privacy notice that is normally a
            sentence somebody wrote — here it is derived from the same
            declaration the reconciler provisions from, so a store that cannot be
            pinned to a region says so instead of being quietly omitted.
          */}
          {housed.map((app) => (
            <Section
              key={app.id}
              label={distinguishing(housed, app.name) ?? "Where it is kept"}
              under="Every store a fact can reach, and whether it stays in one region"
            >
              <WhereItLives needs={app.needs ?? {}} keeps={KEEPS_RESIDENCY} />
            </Section>
          ))}
          {/* ⚠️ The deployment's documents are always there, so this is about
              what the PRODUCTS add. */}
          {!documented.length && !processing.length && !housed.length
            ? <Nothing says="Nothing to disclose" under="No product here names a document or a third party" />
            : null}
      </>

      {/* ⚠️ A ROW, NOT A BUTTON IN A CARD OF ITS OWN (DESIGN.md §4). Exporting,
          ending sessions and closing an account cover every workspace, so they
          live at the account rather than being copied behind each one — and
          saying so is what this row is for. */}
      <Group>
        <NavRow
          icon={glyphOf("person")}
          label="Your account"
          under="Export, sessions and closing, for every workspace at once"
          onOpen={() => { if (where) location.assign(accountUrl(where, location)); }}
        />
      </Group>
    </Screen>
  );
}

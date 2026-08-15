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
  Documents, Group, NavRow, Nothing, Screen, Section, SubProcessors, distinguishing, glyphOf,
} from "@quad/web";
import type { Where } from "../door.js";
import { accountUrl } from "../door.js";
import type { CentreView } from "./data.js";

export function Trust({ view, where }: {
  readonly view: CentreView;
  readonly where: Where | null;
}) {
  const documented = view.apps.filter((a) => Object.keys(a.documents).length > 0);
  const processing = view.apps.filter((a) => Object.keys(a.processors).length > 0);

  return (
    /* ⚠️ `detail` — one subject (what is held about you here) and its facts.
       Nothing on it is a primary action: the account-wide ways out live at the
       account, and the row below is a way THERE rather than a thing done here. */
    <Screen shape="detail">
      <>
          {documented.map((app) => (
            /* ⚠️ THE HEADING NAMES THE BLOCK, NOT THE BLOCK AND ITS OWNER. Two
               em-dashed compounds per product is a heading somebody parses
               rather than reads, and on a workspace with one product the half
               before the dash distinguished nothing at all. */
            <Section key={app.id} label={distinguishing(documented, app.name) ?? "The documents"}>
              <Documents documents={Object.values(app.documents)} outstanding={[]} onAccept={() => {}} />
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
          {!documented.length && !processing.length
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

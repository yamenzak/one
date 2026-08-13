/**
 * ONE WORKSPACE'S OWN SETTINGS — rendered from what it declares, not from a form.
 *
 * ⚠️ THIS SCREEN WRITES NO CONTROL OF ITS OWN, which is the whole of it. The
 * manifest declares the label, the kind, the range, the choices and the help
 * line; `settings.read` sends that beside the values, deliberately, so that a
 * setting added to a manifest appears here and one removed stops appearing —
 * neither needing a second edit anywhere. What was missing for the whole of
 * stage 4 was the twenty lines in `declared.tsx` that turn one into the other.
 *
 * ⚠️ AND IT IS IN THE HUB RATHER THAN INSIDE THE PRODUCT, because the workspace
 * list is here and this is what a row on it opens. It is the same argument the
 * account centre makes about preferences: the place you manage a thing is the
 * place you can see all of them.
 */

import type { ElementType, ReactNode } from "react";
import type { Problem } from "@one/kernel";
import { Screen, Title } from "../screen.js";
import { DeclaredSettings, type Declaration, type Values } from "./declared.js";

export interface SettingsProps {
  /** What this workspace is called, for the one line under the title. */
  readonly workspace: string;
  readonly declared: Declaration;
  /** ⚠️ Null until known. `{}` is a workspace that has chosen nothing, which is real. */
  readonly values: Values | null;
  readonly onSet: (key: string, value: string | number | boolean) => Promise<Problem | null>;
  /** ⚠️ Absent means every key. See `DeclaredProps.mayWrite`. */
  readonly mayWrite?: (key: string) => boolean;
  readonly onBack: () => void;
  readonly Heading?: ElementType;
}

export function SettingsScreen({
  workspace, declared, values, onSet, mayWrite, onBack, Heading = "h1",
}: SettingsProps): ReactNode {
  return (
    <Screen leave="up" onLeave={onBack} name="Settings" sky="silk"
      title={<Title as={Heading}>Settings</Title>}
      lede={`What ${workspace} has chosen about itself.`}
    >
      {/*
        ⚠️ A DEPLOYMENT THAT DECLARES NOTHING GETS NOTHING, and says so rather
        than drawing an empty card. Every app gets branding and a mail signature
        from the platform, so this is the state of a product that has switched
        even those off — rare, and worth being honest about rather than showing
        a screen whose whole content is a heading.
      */}
      {Object.keys(declared).length === 0 ? (
        <p className="note">This product declares no settings.</p>
      ) : (
        <DeclaredSettings declared={declared} values={values} onSet={onSet} {...(mayWrite ? { mayWrite } : {})} />
      )}
    </Screen>
  );
}

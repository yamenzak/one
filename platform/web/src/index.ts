/**
 * WHAT AN APP MOUNTS.
 *
 * ⚠️ IT WAS DECLARED AND ABSENT. `package.json` has pointed at this file since the
 * package was created and nothing was here — which nothing noticed, because the
 * only consumer so far is a preview that imports the source directly. The first
 * app to write `from "@one/web"` would have failed to resolve, in a build, with a
 * message about a missing file rather than about a missing barrel.
 *
 * ⚠️ EVERYTHING IS RE-EXPORTED FROM ONE PLACE AND NOTHING IS RENAMED HERE. A
 * barrel that renames is a second vocabulary for the same components, and the
 * first time a screen and a document disagree about what something is called, it
 * is this file that made the disagreement possible.
 *
 * ⚠️ THE STYLESHEETS ARE EXPORTED AS TEXT, NOT IMPORTED FOR EFFECT. An app owns
 * its document; the platform hands over the rules and the app decides where they
 * go — which is what lets the same screens render in a worker's HTML, in a
 * preview page, and in a bundler that has never heard of CSS imports.
 */

/* The vocabulary, as text an app inlines. */
export { UI_CSS } from "./ui.css.js";
export { MOTION_CSS } from "./motion.css.js";
export { SKY_CSS, SKIES, type Sky } from "./sky.css.js";
export { TYPE_CSS } from "./brand/type.css.js";
export { MARK_CSS } from "./brand/mark.css.js";
export { HUB_CSS } from "./hub/hub.css.js";

/* The way in. */
export { Door, nextDoor, waitFrom, type DoorAt, type DoorProps, type DoorStep, type DoorWire } from "./door.js";
export { ProveIt, ProveItBody, needsProof, NEEDS_PROOF, type ProveItProps } from "./prove.js";
export { SetupScreen, slugFrom, fieldOf, type Place, type SetupProps, type SetupWire } from "./setup.js";
export {
  browserCeremony, outcomeOf, registerPasskey, signInWithPasskey,
  type Asserted, type Attempt, type Ceremony, type RegisterOffer, type Registered, type SignInOffer,
} from "./passkey.js";

/* The pieces every screen is made of. */
export { Away } from "./away.js";
export { Button, RoundButton } from "./button.js";
export { Chip, Pill, type PillTone } from "./capsule.js";
export { Choose, type Option } from "./choose.js";
export { Confirm } from "./confirm.js";
export { Disclose } from "./disclose.js";
export { Field } from "./field.js";
export { Blank, Card, Entry, Item, Unset, Waiting } from "./list.js";
export { Crown, HUES, type CrownProps } from "./crown.js";
export { Tiles, Quick, type Act, type Tile, type TilesProps } from "./tiles.js";
export { Mark, type MarkKind, type MarkSize, type MarkTone } from "./mark.js";
export { Screen, Section, Title } from "./screen.js";
export { Sheet } from "./sheet.js";
export { Stack, directionOf, type Move } from "./stack.js";
export { SwitchRow } from "./switch.js";
export { ValueEditor, type EditableField } from "./editor.js";
export { useCommit, type Commit } from "./commit.js";
export { configureFeedback, feel, FEEDBACK_DEFAULT } from "./feedback.js";
export * as Icon from "./icon.js";

/*
  The hub — Account Center, Workspaces and Marketplace — and the consent sheet an
  app raises.

  ⚠️ THE AREA IS "Workspaces" RATHER THAN "Workspace Hub", and the surface it sits
  in is the Hub. Two hubs, one inside the other, is a name that has to be
  disambiguated every time it is said — and the area is a list of the workspaces
  somebody is in, which is what the plural already says.
*/
export { Hub } from "./hub/hub.js";
export { HubHome, type HubHomeProps, type Person } from "./hub/home.js";
export { AccountScreen, type AccountProps } from "./hub/account.js";
export {
  DeclaredSettings, groupsOf, shownAs,
  type Declaration, type Declared, type DeclaredProps, type Values,
} from "./hub/declared.js";
export { SettingsScreen, type SettingsProps } from "./hub/settings.js";
export { WorkspaceScreen, amountOf, type Resolved, type WorkspaceProps } from "./hub/workspace.js";
export {
  ConsoleScreen, KeysScreen, CatalogueScreen, saidAs as keySaidAs,
  type CatalogueProps, type ConsoleProps, type Key, type KeysProps, type Product as ConsoleProduct,
} from "./hub/console.js";
export { WorkspacesScreen, type Workspace, type WorkspacesProps, type Product as WorkspaceProduct } from "./hub/workspaces.js";
export { MarketScreen, ShelfScreen, type Sellable } from "./hub/market.js";
export { PlanScreen, standsAs, type Holding, type PlanProps } from "./hub/plan.js";
export { priceOf, money, dayOf, type Included, type Money, type Plan } from "./hub/offer.js";
export { CreditsScreen, CreditsRow, saidAs, type Balance, type Pack, type Movement } from "./hub/credits.js";
export { AccountDetails } from "./hub/details.js";
export { SignInMethods, type Device, type Passkey } from "./hub/signin.js";
export { PreferencesScreen, type Preferences } from "./hub/preferences.js";
export { VaultScreen, KeptHere, meaning, readAs } from "./hub/vault.js";
export {
  LegalScreen, ProductScreen, ReceivingScreen, RecipientScreen, DocScreen, MustAcceptScreen,
} from "./hub/legal.js";
export { ExportScreen, type Taken } from "./hub/export.js";
export { CloseAccountScreen } from "./hub/close.js";
export { ACCOUNT_SEGMENT, keyOf, parseWhere, pathOf, upFrom, type Where } from "./hub/routes.js";
export { ConsentSheet, ConsentBody, AskForIt, type Asked } from "./consent.js";

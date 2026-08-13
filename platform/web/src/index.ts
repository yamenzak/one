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
export { ACCOUNT_CSS } from "./account/account.css.js";

/* The way in. */
export { Door, nextDoor, waitFrom, type DoorAt, type DoorProps, type DoorStep, type DoorWire } from "./door.js";
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
export { Mark, type MarkKind, type MarkSize, type MarkTone } from "./mark.js";
export { Screen, Section, Title } from "./screen.js";
export { Sheet } from "./sheet.js";
export { Stack, directionOf, type Move } from "./stack.js";
export { SwitchRow } from "./switch.js";
export { ValueEditor, type EditableField } from "./editor.js";
export { useCommit, type Commit } from "./commit.js";
export { configureFeedback, feel, FEEDBACK_DEFAULT } from "./feedback.js";
export * as Icon from "./icon.js";

/* The account centre, and the consent sheet an app raises. */
export { AccountCenter } from "./account/center.js";
export { AccountHome, type AccountHomeProps } from "./account/home.js";
export { AccountDetails } from "./account/details.js";
export { SignInMethods, type Device, type Passkey } from "./account/signin.js";
export { PreferencesScreen, type Preferences } from "./account/preferences.js";
export { VaultScreen, KeptHere, meaning, readAs } from "./account/vault.js";
export {
  LegalScreen, ProductScreen, ReceivingScreen, RecipientScreen, DocScreen, MustAcceptScreen,
} from "./account/legal.js";
export { ExportScreen, type Taken } from "./account/export.js";
export { CloseAccountScreen } from "./account/close.js";
export { ACCOUNT_SEGMENT, keyOf, parseWhere, pathOf, upFrom, type Where } from "./account/routes.js";
export { ConsentSheet, ConsentBody, AskForIt, type Asked } from "./consent.js";

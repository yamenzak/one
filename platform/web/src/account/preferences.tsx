/**
 * PREFERENCES — how one person wants to be read to, and answered.
 *
 * ⚠️ THESE TRAVEL WITH THE ACCOUNT, NOT WITH A WORKSPACE, and that is a decision
 * rather than a filing convenience. A coach who thinks in kilograms and a client
 * who thinks in pounds are both right, in the same studio, about the same barbell
 * — so a workspace-level choice is one that is wrong for somebody by
 * construction. Somebody in two studios does not change how they read a weight
 * when they switch.
 *
 * ⚠️ A HUB OF CATEGORIES, EACH A SCREEN. Preferences is the one surface in a
 * product that only ever grows, and it grows sideways: notifications, region,
 * privacy and accessibility have nothing to do with each other and each arrives
 * whole. A flat list absorbs the first two and then has to be split anyway — at
 * which point every setting somebody had learned the position of has moved.
 *
 * ⚠️ AND THE HUB READS AS A SUMMARY, WHICH IS WHAT EARNS IT. Every row carries
 * what is currently set, so the whole configuration can be read without opening
 * anything. A hub whose rows are only names is a menu, and a menu between
 * somebody and five settings is a tax.
 *
 * ⚠️ A SWITCH FOR WHAT IS ON OR OFF; A SHEET FOR ONE OF A FEW. Neither has a save
 * button, because in both the choice IS the action. What that costs is a way to
 * fail, which is why both hand back a `Problem` and put themselves back.
 */

import { useState, type ElementType, type ReactNode } from "react";
import type { Problem } from "@one/kernel";
import { Choose, type Option } from "../choose.js";
import { Buzz, Light, Measure, Sound, Tongue } from "../icon.js";
import { Card, Item } from "../list.js";
import { Screen, Title } from "../screen.js";
import { Stack } from "../stack.js";
import { SwitchRow } from "../switch.js";

export type Theme = "system" | "light" | "dark";
export type Units = "metric" | "imperial";
export type Language = "en" | "de";

export interface Preferences {
  readonly theme: Theme;
  readonly units: Units;
  readonly language: Language;
  readonly sound: boolean;
  readonly haptics: boolean;
}

/** ⚠️ ONE WRITE FOR EVERY SETTING, so a screen cannot grow a second shape. */
export type SetPreference =
  <K extends keyof Preferences>(key: K, value: Preferences[K]) => Promise<Problem | null>;

export interface PreferencesScreenProps {
  readonly prefs: Preferences;
  readonly onSet: SetPreference;
  readonly onBack: () => void;
  readonly Heading?: ElementType;
}

/* ⚠️ THE OPTIONS ARE DATA, and their copy says what the choice DOES rather than
   naming it twice. "System — follows your device" is the only one of the three
   that needs explaining, so it is the only one that has a line. */
const THEMES: readonly Option<Theme>[] = [
  { value: "system", label: "System", detail: "Follows your device" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const UNITS: readonly Option<Units>[] = [
  { value: "metric", label: "Metric", detail: "Kilograms, centimetres, kilometres" },
  { value: "imperial", label: "Imperial", detail: "Pounds, inches, miles" },
];

/*
  ⚠️ EACH LANGUAGE IS NAMED IN ITSELF. "German" is only useful to somebody who
  already reads English, which is precisely not the person looking for it.
*/
const LANGUAGES: readonly Option<Language>[] = [
  { value: "en", label: "English" },
  { value: "de", label: "Deutsch" },
];

const NAME = {
  theme: Object.fromEntries(THEMES.map((o) => [o.value, o.label])) as Record<Theme, string>,
  units: Object.fromEntries(UNITS.map((o) => [o.value, o.label])) as Record<Units, string>,
  language: Object.fromEntries(LANGUAGES.map((o) => [o.value, o.label])) as Record<Language, string>,
};

/**
 * ⚠️ ASKED OF THE BROWSER, ONCE, AT MODULE SCOPE. Whether a device can vibrate is
 * a fact about the device rather than about a render, and asking per render is a
 * question with the same answer every time.
 */
const canVibrate = typeof navigator !== "undefined" && typeof navigator.vibrate === "function";

/**
 * ⚠️ THE SUMMARY LINE NAMES WHAT IS ON, not how many things are. "2 of 3" is a
 * count of settings somebody would still have to open the screen to identify.
 */
function feedbackSummary(prefs: Preferences): string {
  const on = [canVibrate && prefs.haptics ? "Vibration" : null, prefs.sound ? "Sound" : null].filter(Boolean);
  if (on.length === 2) return "Vibration and sound";
  return on[0] ?? "Off";
}

export function PreferencesScreen({ prefs, onSet, onBack, Heading = "h1" }: PreferencesScreenProps): ReactNode {
  const [where, setWhere] = useState<"appearance" | "reading" | "feedback" | null>(null);
  const back = () => setWhere(null);
  const inner = { prefs, onSet, onBack: back, Heading };

  /* ⚠️ A LEVEL OF ITS OWN, NESTED INSIDE THE ONE THAT BROUGHT US HERE. A stack
     only knows its own step, so a category travels onward from the hub exactly
     the way the hub travelled onward from the account — one movement, declared
     once, and this screen never learns how deep it is. */
  return (
    <Stack at={where}>
      {where === "appearance" ? <AppearanceScreen {...inner} /> :
       where === "reading" ? <ReadingScreen {...inner} /> :
       where === "feedback" ? <FeedbackScreen {...inner} /> :
       <PreferencesHub prefs={prefs} onGo={setWhere} onBack={onBack} Heading={Heading} />}
    </Stack>
  );
}

function PreferencesHub({ prefs, onGo, onBack, Heading }: {
  readonly prefs: Preferences;
  readonly onGo: (to: "appearance" | "reading" | "feedback") => void;
  readonly onBack: () => void;
  readonly Heading: ElementType;
}): ReactNode {
  return (
    <Screen
      leave="up"
      onLeave={onBack}
      name="Preferences"
      title={<Title as={Heading}>Preferences</Title>}
      lede="How you read things, and how the app answers."
    >
      <Card>
        <Item
          icon={<Light />}
          title="Appearance"
          detail={NAME.theme[prefs.theme]}
          onGo={() => onGo("appearance")}
        />
        {/* ⚠️ TWO VALUES, ONE LINE, in the order the rows appear behind it — so
            the summary is read as a list of what is set rather than as a sentence
            that has to be parsed. */}
        <Item
          icon={<Tongue />}
          title="Language and units"
          detail={`${NAME.language[prefs.language]} · ${NAME.units[prefs.units]}`}
          onGo={() => onGo("reading")}
        />
        <Item
          icon={<Buzz />}
          title="Feedback"
          detail={feedbackSummary(prefs)}
          onGo={() => onGo("feedback")}
        />
      </Card>
    </Screen>
  );
}

/* ------------------------------------------------------------ the categories */

/** The hub has already decided the heading level; a category cannot omit it. */
type Inner = PreferencesScreenProps & { readonly Heading: ElementType };

function AppearanceScreen({ prefs, onSet, onBack, Heading }: Inner): ReactNode {
  const [choosing, setChoosing] = useState(false);
  return (
    <Screen
      leave="up"
      onLeave={onBack}
      name="Appearance"
      title={<Title as={Heading}>Appearance</Title>}
      lede="How the app looks, everywhere you sign in."
    >
      <Card>
        {/* ⚠️ THE CURRENT VALUE IS THE DETAIL LINE, which is what makes a list of
            choices readable without opening any of them. A row that says only
            "Theme" is a row somebody has to press to learn anything. */}
        <Item icon={<Light />} title="Theme" detail={NAME.theme[prefs.theme]} onGo={() => setChoosing(true)} />
      </Card>
      <Choose
        open={choosing} title="Theme" options={THEMES} value={prefs.theme}
        onPick={(v) => onSet("theme", v)} onClose={() => setChoosing(false)}
      />
    </Screen>
  );
}

function ReadingScreen({ prefs, onSet, onBack, Heading }: Inner): ReactNode {
  const [choosing, setChoosing] = useState<"language" | "units" | null>(null);
  return (
    <Screen
      leave="up"
      onLeave={onBack}
      name="Language and units"
      title={<Title as={Heading}>Language and units</Title>}
      lede="The words, and the numbers they come with."
    >
      <Card>
        <Item icon={<Tongue />} title="Language" detail={NAME.language[prefs.language]} onGo={() => setChoosing("language")} />
        <Item icon={<Measure />} title="Units" detail={NAME.units[prefs.units]} onGo={() => setChoosing("units")} />
      </Card>
      <Choose
        open={choosing === "language"} title="Language" options={LANGUAGES} value={prefs.language}
        onPick={(v) => onSet("language", v)} onClose={() => setChoosing(null)}
      />
      <Choose
        open={choosing === "units"} title="Units" options={UNITS} value={prefs.units}
        onPick={(v) => onSet("units", v)} onClose={() => setChoosing(null)}
      />
    </Screen>
  );
}

function FeedbackScreen({ prefs, onSet, onBack, Heading }: Inner): ReactNode {
  return (
    <Screen
      leave="up"
      onLeave={onBack}
      name="Feedback"
      title={<Title as={Heading}>Feedback</Title>}
      lede="What happens when a save comes back."
    >
      <Card>
        {/*
          ⚠️ HAPTICS IS ON AND SOUND IS OFF, AND THE ROWS SAY SO RATHER THAN
          LEAVING IT TO BE DISCOVERED. An interface that makes a noise nobody
          chose is the most complained-about behaviour there is; a tick you feel
          is silent and is what every native app on the device already does.

          ⚠️ AND THE VIBRATION ROW TELLS THE TRUTH ABOUT THIS DEVICE rather than
          carrying a caveat everybody has to read. Safari implements no vibration
          on any iOS version, so on an iPhone this was a control that changed a
          stored value and did nothing anybody could feel — the same lie as a
          switch that silently fails.
        */}
        <SwitchRow
          icon={<Buzz />}
          title="Vibration"
          detail={canVibrate ? "A tick when a save lands." : "This browser cannot vibrate."}
          on={canVibrate && prefs.haptics}
          disabled={!canVibrate}
          onChange={(next) => onSet("haptics", next)}
        />
        {/* ⚠️ IT REFERS BACK RATHER THAN REPEATING. Naming the same moments twice
            in adjacent rows reads as boilerplate, and the second line is where a
            reader stops reading. */}
        <SwitchRow
          icon={<Sound />}
          title="Sound"
          detail="A note at the same moments."
          on={prefs.sound}
          onChange={(next) => onSet("sound", next)}
        />
      </Card>
    </Screen>
  );
}

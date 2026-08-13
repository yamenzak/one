/**
 * WHAT A WORKSPACE CHOOSES ABOUT ITSELF — declared, not scattered.
 *
 * Layer 2. Imports primitives only.
 *
 * ⚠️ THIS IS NOT CONFIG, AND THE TWO ARE OPPOSITE IN EVERY RESPECT. Config is
 * the DEPLOYMENT's — one Stripe key, one mail provider, set by an operator, the
 * same for everybody. A setting is one WORKSPACE's — its name, its colour, how
 * long a lapsed customer keeps access — set by its owner and different for every
 * tenant on the deployment. Merging them would put a studio's accent colour and
 * a live secret key behind the same read.
 *
 * ⚠️ AND IT IS DECLARED BY THE MANIFEST RATHER THAN BY A SCREEN. A settings
 * screen written by hand is a form somebody has to remember to add a control to,
 * a write endpoint somebody has to remember to validate, and a default somebody
 * has to remember to apply in three readers. Declaring the setting produces all
 * three, and a value that is not declared cannot be written at all — which is
 * what stops a workspace's settings becoming a free-form bag nobody can migrate.
 */

/* ------------------------------------------------------------ declaration --- */

export type SettingKind = "text" | "number" | "bool" | "enum" | "media" | "colour";

export interface SettingDef {
  /** In the words of whoever sets it. */
  readonly label: string;
  readonly kind: SettingKind;
  /**
   * ⚠️ REQUIRED, AND IT IS WHAT MAKES A SETTING SAFE TO READ. A workspace that
   * has never opened the settings screen has no row, and a reader that finds
   * none has to decide what to do — three readers, three decisions, and the one
   * that guesses differently is the bug. The declaration decides once.
   */
  readonly fallback: string | number | boolean;
  /** For `enum`. Ignored otherwise. */
  readonly values?: readonly string[];
  /** For `number`. */
  readonly min?: number;
  readonly max?: number;
  /**
   * ⚠️ WHO MAY CHANGE IT, AND IT DEFAULTS TO NOBODY-IN-PARTICULAR RATHER THAN
   * EVERYBODY. A setting with no permission named is written by anyone holding
   * the workspace's settings permission, which is the ordinary case; naming one
   * narrows it, and the narrowing is for the settings that cost money or take
   * something away.
   */
  readonly write?: string;
  /** One line under the control. What this actually changes. */
  readonly help?: string;
}

export type SettingsSpec = Readonly<Record<string, SettingDef>>;

/* --------------------------------------------------------------- branding --- */

/**
 * ⚠️ EVERY APP GETS THESE THREE, AND THEY ARE THE PLATFORM'S BECAUSE THE SHELL
 * RENDERS THEM.
 *
 * A workspace's name, mark and accent are read before anything else on every
 * request — they are what the sign-in screen wears, which is a screen that
 * exists before there is a session to resolve an app's own settings with. An app
 * that declared its own would be declaring three keys the platform then has to
 * guess the names of.
 *
 * ⚠️ AND THE ACCENT IS ONE COLOUR, NOT A PALETTE. A tenant given a palette gives
 * itself an unreadable one; a tenant given one hue gets a theme derived from it
 * that still passes contrast in both schemes. The restriction is the feature.
 */
export const BRANDING: SettingsSpec = {
  "brand.name": {
    label: "What this workspace is called",
    kind: "text",
    fallback: "",
    help: "Shown on the sign-in screen and in the messages you send. Empty means the product's own name.",
  },
  "brand.mark": {
    label: "Logo",
    kind: "media",
    fallback: "",
    help: "Shown beside the name. A square image reads best at the sizes it appears in.",
  },
  "brand.accent": {
    label: "Accent colour",
    kind: "colour",
    fallback: "",
    /*
      ⚠️ ONE HUE. The theme is derived from it and checked for contrast in both
      light and dark, which is a promise that cannot be kept about a palette
      somebody assembled by hand.
    */
    help: "One colour. Everything else is derived from it so it stays readable in both light and dark.",
  },
};

/* --------------------------------------------------------------- sending --- */

/**
 * ⚠️ THE SIGN-OFF IS THE PLATFORM'S KEY BECAUSE THE PLATFORM IS THE SENDER.
 *
 * Every message leaves from the deployment's own address — one verified sender
 * for the whole platform, which is what makes a new product inherit mail that
 * works instead of a plausible-looking address that bounces. The cost of that is
 * that a customer's inbox shows the deployment, not the business they know, so
 * the business has to be able to say who it is inside the message. An app
 * declaring its own key for that would be an app guessing at a name the runtime
 * then has to look up.
 */
export const SENDING: SettingsSpec = {
  "mail.signature": {
    label: "How your messages sign off",
    kind: "text",
    fallback: "",
    help: "Added to the end of emails this workspace sends. Empty means no sign-off.",
  },
  /**
   * ⚠️ THE LETTERHEAD, AND IT WRAPS RATHER THAN REPLACES. `{body}` is where the
   * message goes, and `refuseLetter` demands it — a layout without one sends the
   * same empty page to every customer for ever, and looks completely fine in the
   * editor that saved it.
   *
   * ⚠️ AND IT REACHES ONLY WHAT A WORKSPACE MAY ALREADY PHRASE. The platform
   * writing to a workspace about its own arrears stays plain, because a business
   * that could wrap that in its own layout could bury it.
   */
  "mail.letterhead": {
    label: "Your email layout",
    kind: "text",
    fallback: "",
    help: "HTML wrapped round the messages you send. Use {title}, {body} and {signature}. Empty sends plain text.",
  },
};

/* ------------------------------------------------------------- validation --- */

/** Why a value may not be stored under this key. */
export type SettingRefusal = "unknown" | "kind" | "range" | "choice" | "colour";

/**
 * ⚠️ AN UNDECLARED KEY IS REFUSED, which is the whole reason this is a registry
 * rather than a table with a `key` column. A store that accepted anything is a
 * bag of strings nobody can migrate, nobody can render, and nobody can tell the
 * live entries from the abandoned ones in.
 */
export function refuseSetting(spec: SettingsSpec, key: string, value: unknown): SettingRefusal | null {
  const def = spec[key];
  if (!def) return "unknown";

  switch (def.kind) {
    case "bool":
      return typeof value === "boolean" ? null : "kind";
    case "number": {
      if (typeof value !== "number" || !Number.isFinite(value)) return "kind";
      if (def.min !== undefined && value < def.min) return "range";
      if (def.max !== undefined && value > def.max) return "range";
      return null;
    }
    case "enum":
      if (typeof value !== "string") return "kind";
      return (def.values ?? []).includes(value) ? null : "choice";
    case "colour": {
      if (typeof value !== "string") return "kind";
      /*
        ⚠️ A HEX TRIPLE OR NOTHING. Anything a CSS parser would take is also a
        way to put a `url(...)` or a variable reference into a stylesheet this
        product renders for other people — which is a stored injection wearing a
        colour picker's clothes. Empty means "use the product's own".
      */
      return value === "" || /^#[0-9a-fA-F]{6}$/.test(value) ? null : "colour";
    }
    case "media":
    case "text":
      return typeof value === "string" ? null : "kind";
  }
}

/**
 * The value a workspace has, or the one it was declared with.
 *
 * ⚠️ THE FALLBACK IS APPLIED HERE AND NOWHERE ELSE. Three readers each deciding
 * what an absent row means is three decisions, and the one that differs is the
 * bug nobody finds — a lapse policy read as "never" in the sweep and "14 days"
 * on the screen that shows it.
 */
export function settingsOf(
  spec: SettingsSpec,
  stored: Readonly<Record<string, string>>,
): Readonly<Record<string, string | number | boolean>> {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, def] of Object.entries(spec)) {
    const raw = stored[key];
    if (raw === undefined || raw === "") { out[key] = def.fallback; continue; }
    out[key] = def.kind === "number" ? Number(raw) : def.kind === "bool" ? raw === "true" : raw;
  }
  return out;
}

/* --------------------------------------------------------------- refusals --- */

export interface SettingsProblem {
  readonly key: string;
  readonly why: string;
}

/**
 * Everything decidable about a settings registry before anybody opens a screen.
 *
 * ⚠️ EVERY ONE OF THESE IS A CONTROL THAT RENDERS AND CANNOT BE USED, which is
 * worse than one that is absent: somebody will keep trying.
 */
export function settingsProblems(spec: SettingsSpec): readonly SettingsProblem[] {
  const out: SettingsProblem[] = [];
  for (const [key, def] of Object.entries(spec)) {
    if (def.kind === "enum" && !(def.values ?? []).length) {
      out.push({ key, why: "is a choice with nothing to choose from" });
    }
    if (def.kind === "enum" && def.values?.length && !def.values.includes(String(def.fallback))) {
      out.push({ key, why: `falls back to "${String(def.fallback)}", which is not one of its choices` });
    }
    /*
      ⚠️ A FALLBACK OF THE WRONG TYPE IS THE ONE THAT TRAVELS FURTHEST. It is
      read by every workspace that has not set the value — which on the day a
      setting ships is all of them — so a number declared with a string fallback
      is `NaN` everywhere at once.
    */
    const expected = def.kind === "number" ? "number" : def.kind === "bool" ? "boolean" : "string";
    if (typeof def.fallback !== expected) {
      out.push({ key, why: `falls back to a ${typeof def.fallback} where its kind needs a ${expected}` });
    }
    if (def.kind === "number" && def.min !== undefined && def.max !== undefined && def.min > def.max) {
      out.push({ key, why: "has a minimum above its maximum, so no value is acceptable" });
    }
  }
  return out;
}

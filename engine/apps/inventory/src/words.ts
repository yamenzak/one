/**
 * WHAT THIS WORKSPACE CALLS THINGS.
 *
 * ⚠️ A PROFILE CHANGES WHAT IS SHOWN AND NEVER WHAT IS POSSIBLE. That is the
 * whole promise: a garage that grows into a business turns things on and nothing
 * is migrated, because a profile was never a code path. What it is, concretely,
 * is two things — what a new product starts as, and the WORDS — and this is the
 * second.
 *
 * ⚠️ AND THE WORDS ARE NOT DECORATION. A hospital pharmacist reading "shelf"
 * where they mean "ward stock" is reading somebody else's product; a kitchen
 * reading "location" where it means "walk-in" is reading a database. The model
 * underneath is identical, which is exactly why the noun can differ.
 *
 * ⚠️ WHO MAY DO WHAT IS NOT HERE, AND THAT IS DELIBERATE. Composing roles is a
 * governance act under `member:manage`; this is a product setting under
 * `tenant:manage`. A setting that quietly rewrote a roster's permissions would
 * be a product update minting access, so the app OFFERS shapes
 * (`access.presets`) and the workspace adopts them from the people screen.
 *
 * Pure. No I/O, no DOM.
 */

export const PROFILES = [
  "home", "clinic", "hospital", "workshop", "kitchen", "lab", "warehouse", "office",
] as const;

export type Profile = (typeof PROFILES)[number];

/**
 * ⚠️ FOUR NOUNS AND NOT FORTY. Every one of these appears on a heading somebody
 * reads all day; a vocabulary big enough to rename every string is a translation
 * file with a settings screen, which drifts the day a screen is added and reads
 * half in one dialect. What is here is what a person in that setting would
 * notice was wrong.
 */
export interface Words {
  /** Where things are kept. Singular. */
  readonly place: string;
  /** What a delivery of one thing is. Singular. */
  readonly batch: string;
  /** What a person on the floor DOES all day, as a verb phrase. */
  readonly taking: string;
  /** What this workspace is for, in one line. It is the getting-started lead. */
  readonly said: string;
}

const SHELF: Words = {
  place: "Shelf", batch: "Delivery", taking: "Take something",
  said: "What is where, and how many.",
};

export const WORDS: Readonly<Record<Profile, Words>> = {
  home: {
    ...SHELF,
    said: "Everything you own, findable. No counting unless you want to.",
  },
  clinic: {
    place: "Room", batch: "Lot", taking: "Use something",
    said: "Stock, lots and expiry dates, with a record of who used what.",
  },
  hospital: {
    place: "Ward", batch: "Lot", taking: "Use something",
    said: "Ward stock and theatre trays, with the release rail behind them.",
  },
  workshop: {
    place: "Bay", batch: "Delivery", taking: "Take something",
    said: "Consumables, tools and what each job used.",
  },
  kitchen: {
    place: "Store", batch: "Delivery", taking: "Use something",
    said: "What is in date, what is opened, and what to order.",
  },
  lab: {
    place: "Bench", batch: "Lot", taking: "Use something",
    said: "Reagents by lot, with hazards on every decanted bottle.",
  },
  warehouse: {
    place: "Bin", batch: "Pallet", taking: "Pick something",
    said: "Locations, counts and what leaves.",
  },
  office: {
    ...SHELF,
    said: "Supplies and equipment, and who has the laptop.",
  },
};

/**
 * ⚠️ READ DEFENSIVELY, BECAUSE A SETTING IS A STORED STRING. A workspace on a
 * profile a later build removed must read as the plain one rather than as a
 * screen with `undefined` where its headings go.
 */
export const wordsFor = (profile: unknown): Words =>
  WORDS[String(profile) as Profile] ?? WORDS.home;

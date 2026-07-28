/**
 * The "Finish setting up" card has to land you on a screen that can fix what it
 * is complaining about.
 *
 * `profileGaps` returns one flat list, but the nine fields it can report live on
 * two different screens. The card sent everyone to /profile, where six of the
 * nine are not editable: you tapped a card asking for your primary goal and
 * arrived at a form offering name, date of birth and height.
 *
 * These tests bind the routing rule to the REAL gap producer, so adding a field
 * to `profileGaps` without deciding which screen owns it fails here rather than
 * silently routing users to a page that cannot help them.
 */

import { describe, expect, it } from "vitest";
import { profileGaps } from "@kova/domain";
import { PROFILE_GAPS, gapDestination } from "./screens/client/Today.js";

/** Nothing filled in — the state a freshly invited client is actually in. */
const ALL_GAPS = profileGaps({ gender: null, dateOfBirth: null, heightCm: null, prefs: {} });

describe("the setup card routes to the screen that owns the gap", () => {
  it("a brand-new client goes to Preferences, which owns most of what's missing", () => {
    expect(ALL_GAPS.length).toBe(9);
    expect(gapDestination(ALL_GAPS).href).toBe("/preferences");
  });

  it("once only profile fields remain, it switches to Profile", () => {
    const profileOnly = profileGaps({
      gender: null, dateOfBirth: null, heightCm: null,
      prefs: { targetWeightKg: 70, primaryGoal: "lose_weight", activityLevel: "moderate", workoutsPerWeek: 3, mealsPerDay: 3, workoutLocation: "gym" },
    });
    expect(profileOnly).toEqual(["gender", "dateOfBirth", "height"]);
    expect(gapDestination(profileOnly).href).toBe("/profile");
  });

  it("one preference gap is enough to send you to Preferences, even alongside profile gaps", () => {
    // The reported case: the card said "primary goal" and opened a form without one.
    expect(gapDestination(["gender", "dateOfBirth", "height", "goal"]).href).toBe("/preferences");
    expect(gapDestination(["goal"]).href).toBe("/preferences");
  });

  it("every gap `profileGaps` can emit is assigned to a screen", () => {
    // The guard that matters: a NEW field added to profileGaps and not listed in
    // PROFILE_GAPS would silently be treated as a preference. That is the right
    // default (Preferences owns six of nine) but it must be a decision, not an
    // accident — so this asserts the split still covers exactly what exists.
    const PREFERENCE_GAPS = ["targetWeight", "goal", "activityLevel", "workoutsPerWeek", "mealsPerDay", "workoutLocation"];
    const known = new Set([...PROFILE_GAPS, ...PREFERENCE_GAPS]);
    const unassigned = ALL_GAPS.filter((g) => !known.has(g));
    expect(unassigned, "gap with no owning screen — add it to PROFILE_GAPS or PREFERENCE_GAPS").toEqual([]);
    // …and neither list has drifted to name a gap that no longer exists.
    const real = new Set(ALL_GAPS);
    expect([...known].filter((g) => !real.has(g)), "listed gap that profileGaps never emits").toEqual([]);
  });

  it("the label follows the destination", () => {
    expect(gapDestination(ALL_GAPS).label).toBe("Complete your preferences");
    expect(gapDestination(["height"]).label).toBe("Complete your profile");
  });
});

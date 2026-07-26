/**
 * First-run entry point, kept at its historical path so nothing that imports
 * `screens/Start` has to move. The screen itself now lives in
 * `screens/onboarding/StudioOnboarding.tsx`: a three-step wizard (name the studio
 * → choose a plan → start the trial) rather than the single thin card this used to
 * be.
 *
 * Two things deliberately changed shape here:
 *  • The "Joining as a client? Ask your coach to invite <email>" card is gone.
 *    This screen is now exclusively for someone setting up a business, and that
 *    card was also obsolete: `/api/context` auto-links an invited client record,
 *    auto-accepts a staff invitation, and adopts a sole membership, so an invited
 *    person never lands here at all.
 *  • Choosing a plan is mandatory (the free tier is retired), which is why the
 *    flow is multi-step and why it needs a pre-tenant plans endpoint.
 */

export { StudioOnboarding as Start } from "./onboarding/StudioOnboarding.js";

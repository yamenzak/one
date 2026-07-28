/**
 * The two deep routes the door model needs.
 *
 * `SIGN_IN_PATH` is the OWNER sign-in, and it lives on the SETUP door
 * (`setup.kova.4dl.app/studio/sign-in`) — where a studio is created, and where an
 * owner who already has one signs in to finish or resume it. It used to sit on the
 * shared platform host to stop that host being an end-user signup surface; the
 * host taxonomy now does that structurally (the root refuses to send a sign-in
 * code at all), so this path survives because it is a public URL in shipped
 * marketing HTML. Keep it stable, and keep `apps/www/build.mjs` in lockstep.
 *
 * `ONBOARDING_PATH` hosts the first-run studio wizard. It is a real URL rather
 * than pure session state so a half-finished onboarding can be resumed by reload
 * (main.tsx renders the wizard on this path even once a tenant EXISTS, which is
 * the case right after step 1 creates the studio).
 */
export const SIGN_IN_PATH = "/studio/sign-in";
export const ONBOARDING_PATH = "/studio/setup";

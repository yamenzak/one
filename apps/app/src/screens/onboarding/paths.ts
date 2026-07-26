/**
 * The two deep routes the platform host's entry rework introduces.
 *
 * `SIGN_IN_PATH` is Mossa's OWN sign-in, moved off `/` so the platform host stops
 * being an end-user signup surface (see PlatformGate.tsx). It is linked from the
 * marketing site (`apps/www/build.mjs`) and from the gate itself, and nothing
 * else — that is what makes it effectively unreachable to someone who wandered in.
 * Keep it stable: it is a public URL in shipped marketing HTML and emails.
 *
 * `ONBOARDING_PATH` hosts the first-run studio wizard. It is a real URL rather
 * than pure session state so a half-finished onboarding can be resumed by reload
 * (main.tsx renders the wizard on this path even once a tenant EXISTS, which is
 * the case right after step 1 creates the studio).
 */
export const SIGN_IN_PATH = "/studio/sign-in";
export const ONBOARDING_PATH = "/studio/setup";

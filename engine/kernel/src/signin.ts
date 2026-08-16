/**
 * THE SHAPE OF A SIGN-IN CODE — the four facts the server and the page must
 * agree on.
 *
 * ⚠️ THESE ARE HERE RATHER THAN BESIDE THE CODE THAT ISSUES THEM BECAUSE BOTH
 * SIDES READ THEM. A form drawing six boxes against a server issuing eight is a
 * screen that cannot accept a valid code, and it fails as "that code is wrong" —
 * a sentence pointing at the person rather than at the mismatch. Nothing else
 * about identity belongs in the kernel: issuing, hashing and spending are I/O.
 */

/** ⚠️ Long enough that guessing is hopeless against the ceiling below, short
    enough to be read off a phone and typed. */
export const CODE_DIGITS = 6;

export const CODE_LIFE_MS = 5 * 60 * 1000;

/** ⚠️ A code with unlimited attempts is a six-digit password. */
export const CODE_TRIES = 5;

/** ⚠️ And a cooldown, so somebody else's inbox is not a place to flood. */
export const CODE_COOLDOWN_MS = 60 * 1000;

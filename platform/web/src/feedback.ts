/**
 * FEEDBACK — a tick you feel and a note you hear, for the two moments that have
 * an answer.
 *
 * ⚠️ IT FIRES ON A RESULT, NEVER ON A PRESS. A press already has feedback: the
 * control moved because the finger moved. What has no feedback is the moment a
 * round trip comes back — which is the moment the person has looked away, and the
 * only moment worth spending an interruption on. Two notes, and there will not be
 * a third without a moment that earns it.
 *
 * ⚠️ SOUND IS OFF UNTIL SOMEBODY ASKS FOR IT. An interface that makes a noise
 * nobody chose is the most complained-about behaviour there is, and the person
 * who finds out in a meeting does not go looking for the setting, they stop using
 * the feature. Haptics is the other way round: it is silent, it is what every
 * native app on the device already does, and it is what a phone in a pocket can
 * actually perceive — so it is on.
 *
 * ⚠️ HAPTICS IS ANDROID-ONLY ON THE WEB, and that is a fact about the platform
 * rather than a gap here. Safari implements no `navigator.vibrate` at all, on any
 * iOS version, so an iPhone gets the sound or it gets nothing. Every workaround
 * for it is a hidden form control triggering a side effect, which is a trick that
 * breaks on the next release and takes the save with it.
 *
 * ⚠️ THE SOUND IS SYNTHESISED, NOT A FILE. An asset is a request that can fail, a
 * decode that can be slow and a byte cost on a page that already inlines its
 * fonts — for two hundred milliseconds of sine wave. It is also why there is no
 * silent-first-play problem: nothing has to load before the first save.
 */

export interface FeedbackSettings {
  readonly haptics: boolean;
  readonly sound: boolean;
}

export const FEEDBACK_DEFAULT: FeedbackSettings = { haptics: true, sound: false };

/** The two moments. `done` is a result arriving; `wrong` is one refusing. */
export type Note = "done" | "wrong";

/*
  ⚠️ CONFIGURED ONCE BY THE APP RATHER THAN THREADED AS A PROP. This is a
  device-wide preference — it is true of the person, not of the sheet they happen
  to be in — and passing it through four components to reach a callback is how a
  screen ends up being the one that forgot.
*/
let settings: FeedbackSettings = FEEDBACK_DEFAULT;

// DEFER(one-180) stage:7 — the switch for these on Preferences. Until it exists
// the app can only configure them at boot, so nobody can turn the sound on.
export const configureFeedback = (next: FeedbackSettings): void => { settings = next; };
export const feedbackSettings = (): FeedbackSettings => settings;

/*
  ⚠️ ONE CONTEXT, MADE ON FIRST USE AND KEPT. A browser caps how many audio
  contexts a page may have, and a new one per note reaches that cap in a session
  of ordinary editing — after which nothing plays and nothing says why.
*/
let audio: AudioContext | undefined;
let refused = false;

/** Frequencies in Hz, and how long the note rings for. */
const NOTES: Record<Note, { readonly partials: readonly number[]; readonly seconds: number; readonly gain: number }> = {
  /* A rising pair, which is what "that worked" sounds like in every interface
     anybody has already learned one from. */
  done: { partials: [1318.5, 1975.5], seconds: 0.19, gain: 0.05 },
  /* Lower, single, shorter. Not a buzzer: a refusal is already on the screen in
     words, and this only has to say LOOK. */
  wrong: { partials: [311.1], seconds: 0.13, gain: 0.05 },
};

/** Milliseconds. A pattern for `wrong`, one tick for `done`. */
const BUZZ: Record<Note, number | readonly number[]> = { done: 11, wrong: [9, 55, 9] };

export function feel(note: Note): void {
  if (settings.haptics) buzz(note);
  if (settings.sound) ring(note);
}

function buzz(note: Note): void {
  const api = typeof navigator === "undefined" ? undefined : navigator;
  if (typeof api?.vibrate !== "function") return;
  /* ⚠️ IT THROWS BEHIND A PERMISSIONS POLICY, in an iframe that has not been
     granted it — which is where an embedded preview of this very page runs. */
  try { api.vibrate(BUZZ[note] as number | number[]); } catch { /* not allowed here */ }
}

function ring(note: Note): void {
  if (refused || typeof window === "undefined") return;
  try {
    audio ??= new AudioContext();
    /* Suspended until the page has been interacted with. A save always follows a
       press, so by the time this runs there has been one. */
    if (audio.state === "suspended") void audio.resume();
    const { partials, seconds, gain } = NOTES[note];
    const at = audio.currentTime;
    for (const [i, hz] of partials.entries()) {
      const osc = audio.createOscillator();
      const level = audio.createGain();
      osc.type = "sine";
      osc.frequency.value = hz;
      /* ⚠️ AN ENVELOPE, NOT A SWITCH. A gain that starts and stops at full level
         clicks at both ends, and the click is louder than the note. */
      level.gain.setValueAtTime(0.0001, at);
      level.gain.exponentialRampToValueAtTime(gain / (i + 1), at + 0.012);
      level.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
      osc.connect(level).connect(audio.destination);
      osc.start(at + i * 0.055);
      osc.stop(at + i * 0.055 + seconds + 0.02);
    }
  } catch {
    /* No audio on this device, or the context was refused. Asking again every
       time would be a thrown exception per save for the rest of the session. */
    refused = true;
  }
}

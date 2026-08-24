/**
 * A SOUND AND A BUZZ — the two channels a screen has when nobody is looking at it.
 *
 * ⚠️ THIS EXISTS BECAUSE OF THE SCANNER, AND THE SCANNER IS THE ARGUMENT. Somebody
 * counting a shelf is looking at the SHELF: the phone is held at arm's length,
 * angled at a label, and whatever the screen says about the read arrives in
 * peripheral vision at best. Every hardware scanner ever made beeps, and it beeps
 * because that is the only channel that reaches somebody whose eyes are on the
 * work.
 *
 * ⚠️ AND THE THREE OUTCOMES MUST SOUND DIFFERENT, WHICH IS THE WHOLE POINT. One
 * beep for everything is a beep that means "something happened" — so a person
 * scanning the same box twice hears success, walks on, and finds out at the end
 * of the aisle. Read, read-again and refused are three different things to do
 * next, so they are three different sounds.
 *
 * ⚠️ SYNTHESISED, NOT SAMPLED. An audio file is bytes in a bundle that a phone in
 * a basement downloads over a bad connection, for a hundred milliseconds of tone —
 * and it is a second asset pipeline, a second cache question and a second thing to
 * get the volume of wrong. Three oscillators cost nothing and are tuned in code
 * where the reason for each number can be written down.
 *
 * ⚠️ THE CONTEXT IS BUILT ON THE FIRST PLAY, NEVER AT IMPORT. Browsers refuse an
 * `AudioContext` created outside a gesture and leave it `suspended` for ever — so
 * one made when the module loads is silent forever on the surface that needs it,
 * and it is silent in a way nothing reports. Made on the first press, it is made
 * inside the gesture that authorises it.
 *
 * ⚠️ AND BOTH CHANNELS ARE BEST-EFFORT BY CONSTRUCTION. A device with no vibrator,
 * a browser with no Web Audio, a tab denied autoplay, a phone on silent: none of
 * those is a failure this can report or a person can act on, and all of them still
 * leave the screen saying what happened. Sound is the SECOND channel, never the
 * only one.
 */

/* ------------------------------------------------------------------ notes --- */

/**
 * ⚠️ WHAT HAPPENED, IN THREE WORDS THAT ARE NOT PRODUCT WORDS. This package has
 * no nouns (see the README), so these are named for the SHAPE of the outcome
 * rather than for barcodes: `yes` is the thing worked, `again` is it worked and
 * you have already done it, `no` is it did not.
 */
export type Beep = "yes" | "again" | "no";

/**
 * ⚠️ THE PITCHES ARE A DECISION, NOT A DEFAULT. Rising means done, falling means
 * refused, and repeating the same note twice means "again" — a grammar people
 * already know from every checkout in the world, so nobody has to learn it.
 *
 * ⚠️ AND `no` IS THE LOW ONE AND THE LONG ONE. A refusal that is shorter or
 * higher than a success is a refusal somebody hears as a success in a noisy room,
 * which is the only place any of this is heard.
 */
const NOTES: Readonly<Record<Beep, {
  /** Hz, in order. More than one is a sequence, not a chord. */
  readonly hz: readonly number[];
  /** Seconds per note. */
  readonly each: number;
  /** ⚠️ Milliseconds of vibration, in the `navigator.vibrate` pattern shape. */
  readonly buzz: readonly number[];
}>> = {
  /* ⚠️ ONE SHORT HIGH NOTE — the supermarket beep, and deliberately so. */
  yes: { hz: [1_760], each: 0.07, buzz: [18] },
  /* ⚠️ TWO OF THE SAME NOTE, LOWER. The repetition IS the meaning: it says "that
     again" without a second vocabulary, and it is unmistakable from one beep even
     through a warehouse. */
  again: { hz: [880, 880], each: 0.06, buzz: [14, 60, 14] },
  /* ⚠️ FALLING, AND LONGER THAN BOTH. Down is refused in every culture that has a
     doorbell; the extra length is what carries it over machinery. */
  no: { hz: [420, 300], each: 0.12, buzz: [70] },
};

/* ---------------------------------------------------------------- the horn --- */

interface Maker { new (): AudioContext }

/**
 * ⚠️ ONE CONTEXT FOR THE LIFE OF THE TAB, LAZILY. A context per beep exhausts the
 * per-page limit after a few dozen scans and then every later one is silent — on
 * the surface where somebody scans two hundred things in an afternoon, which is
 * exactly the surface where nobody would connect the silence to the count.
 */
let horn: AudioContext | null = null;

const hornFor = (): AudioContext | null => {
  if (horn) return horn;
  const Made = (globalThis as { AudioContext?: Maker; webkitAudioContext?: Maker }).AudioContext
    ?? (globalThis as { webkitAudioContext?: Maker }).webkitAudioContext;
  if (!Made) return null;
  try {
    horn = new Made();
    return horn;
  } catch {
    /* ⚠️ A BROWSER THAT REFUSES ONE IS A BROWSER WITH NO SOUND, and that is a
       fact about the device rather than a fault to report. */
    return null;
  }
};

/* ------------------------------------------------------------------ saying --- */

/**
 * SAY WHAT HAPPENED, IN THE TWO CHANNELS THAT REACH SOMEBODY NOT LOOKING.
 *
 * ⚠️ IT NEVER THROWS AND NEVER AWAITS. A caller is inside a decode loop or a
 * press handler; a rejected promise there would surface as an unhandled rejection
 * on every scan in a room too dark to read a label, and an `await` would put an
 * audio graph on the path of the thing somebody is waiting for.
 */
export function say(beep: Beep, quiet = false): void {
  const of = NOTES[beep];

  /*
    ⚠️ THE BUZZ FIRST, BECAUSE IT IS THE ONE THAT SURVIVES A SILENT PHONE. A
    warehouse phone is on silent more often than not, and `vibrate` is not gated
    by the ringer switch on Android. It is absent on iOS entirely, which is a
    reason to send both rather than to choose.
  */
  try {
    (navigator as { vibrate?: (pattern: number | readonly number[]) => boolean })
      .vibrate?.([...of.buzz]);
  } catch { /* ⚠️ A device with no vibrator is not a fault. */ }

  if (quiet) return;

  const at = hornFor();
  if (!at) return;

  /* ⚠️ RESUMED EVERY TIME, NOT ONCE. A context is suspended again whenever the
     tab goes to the background — which is every time somebody answers a message
     mid-count — and one resumed only at creation is silent from then on. */
  if (at.state === "suspended") void at.resume().catch(() => undefined);

  let when = at.currentTime;
  for (const hz of of.hz) {
    const tone = at.createOscillator();
    const level = at.createGain();
    /* ⚠️ A SINE, BECAUSE EVERY OTHER WAVE IS HARSH AT THIS LENGTH. A square wave
       is the obvious "beep" and it is unpleasant two hundred times an hour. */
    tone.type = "sine";
    tone.frequency.value = hz;

    /*
      ⚠️ THE ENVELOPE IS NOT DECORATION — IT IS WHY THIS DOES NOT CLICK. An
      oscillator started and stopped at full gain steps the waveform from zero,
      and a step is a click on every speaker ever made. A ramp up over four
      milliseconds and down to a near-zero floor removes it, and the floor is
      near-zero rather than zero because `exponentialRampToValueAtTime` cannot
      reach it.
    */
    level.gain.setValueAtTime(0.0001, when);
    level.gain.exponentialRampToValueAtTime(0.22, when + 0.004);
    level.gain.exponentialRampToValueAtTime(0.0001, when + of.each);

    tone.connect(level).connect(at.destination);
    tone.start(when);
    tone.stop(when + of.each);
    /* ⚠️ A GAP BETWEEN NOTES, so "again" is two beeps rather than one long one. */
    when += of.each + 0.045;
  }
}

/**
 * ⚠️ HERE SO A SURFACE CAN WAKE THE SOUND INSIDE THE GESTURE THAT AUTHORISES IT.
 * The first beep of a scanning session is the one that matters most and it is the
 * one a browser is most likely to swallow — the decode loop is not a gesture, so
 * a context first built there starts suspended. Called from the press that opens
 * the camera, every read after it is audible.
 */
export function wakeSound(): void {
  const at = hornFor();
  if (at?.state === "suspended") void at.resume().catch(() => undefined);
}

/**
 * Board announcements — persistent audio (BLUEPRINT §boards, §21).
 *
 * A queue call's chime + spoken clip must OUTLIVE the board widget. The widget
 * is torn down and rebuilt on every scene rebuild (a slide advance on the
 * timeline clock), so if its audio lived there the clock would cut announcements
 * mid-sentence. This owns one long-lived AudioContext for the chime, plays the
 * spoken clip on a detached <audio>, and — crucially — ducks the music bed for
 * the whole announcement (the same courtesy audio ads already get), so the voice
 * is never buried under the music. One instance per screen, created in main.ts.
 */
export class Announcer {
  private ctx: AudioContext | null = null;
  /** Ref-count so overlapping calls don't lift the duck early. */
  private ducks = 0;

  /** @param onDuck lower (true) / restore (false) the music bed volume. */
  constructor(private readonly onDuck?: (ducked: boolean) => void) {}

  private duckInc(): void {
    if (this.ducks++ === 0) this.onDuck?.(true);
  }
  private duckDec(): void {
    if (this.ducks > 0 && --this.ducks === 0) this.onDuck?.(false);
  }

  /** A short two-tone ding on the shared, long-lived context. No music duck —
   *  used on its own for chime-only calls and room/score changes. */
  chime(): void {
    try {
      this.ctx ??= new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const ctx = this.ctx;
      if (ctx.state === "suspended") void ctx.resume().catch(() => {});
      const now = ctx.currentTime;
      for (const [i, freq] of [880, 1320].entries()) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        const t = now + i * 0.16;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.25, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.18);
      }
    } catch {
      /* audio blocked until a user gesture — the visual flash still fires */
    }
  }

  /**
   * Announce a call: ding, duck the music, then speak the fetched clip (repeated
   * if configured) and lift the duck when the last repeat ends. `getClip` is
   * resolved *after* the ding so the chime is instant; a null result (voice off /
   * fetch failed) degrades to chime-only. Self-contained, so a scene rebuild
   * can't interrupt it.
   */
  announce(getClip?: () => Promise<{ url: string; repeat: number } | null>): void {
    this.duckInc();
    this.chime();
    if (!getClip) {
      window.setTimeout(() => this.duckDec(), 700); // brief duck for the ding
      return;
    }
    getClip()
      .then((clip) => {
        if (!clip || !clip.url) {
          window.setTimeout(() => this.duckDec(), 400);
          return;
        }
        window.setTimeout(() => this.play(clip.url, clip.repeat), 480); // let the ding land
      })
      .catch(() => window.setTimeout(() => this.duckDec(), 400));
  }

  /** Play one MP3, repeated up to `times`, lifting the music duck at the end. */
  private play(url: string, times: number): void {
    let left = Math.min(3, Math.max(1, times));
    const a = new Audio(url);
    const done = () => this.duckDec();
    a.addEventListener("ended", () => {
      left -= 1;
      if (left > 0) window.setTimeout(() => void a.play().catch(done), 500);
      else done();
    });
    a.addEventListener("error", done);
    void a.play().catch(done);
  }
}

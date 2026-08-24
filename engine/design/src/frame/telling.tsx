/**
 * WHAT JUST HAPPENED, SAID ONCE, WHEREVER IT HAPPENED.
 *
 * ⚠️ THIS EXISTS BECAUSE THE PRODUCT HAD NO WAY TO SAY ANYTHING. Every guard
 * about silence in this repository is about a FAILURE — `problem` not being
 * bypassed, a refusal reaching the screen — and none of them covers the case
 * that was actually reported: a form somebody filled in for five minutes, a
 * button that ran, and nothing at all on the screen afterwards. The write had
 * failed and the handler was `if (!made.ok) return;`.
 *
 * ⚠️ AND THE SUCCESS SIDE IS THE HALF EVERYONE FORGETS. A navigation after a
 * write is not a confirmation — somebody who lands on a product's screen cannot
 * tell "it saved and brought me here" from "it did nothing and I was already
 * here". Six uploads that take fifteen seconds with no progress are
 * indistinguishable from a dead button, which is exactly what it was called.
 *
 * ⚠️ IT IS ONE SURFACE AND ONE VOCABULARY, MOUNTED BY `Shell`, so an app gets it
 * without wiring anything — which is the whole reason it is here and not in a
 * product. Four apps each growing their own toast is four rhythms, four
 * placements and four ideas of what an error looks like.
 *
 * ⚠️ THREE STATES AND NO MORE. `working` (with a share, where the caller knows
 * one), `did` and `failed`. A fourth — "info" — is the one that turns an
 * announcement channel into a stream of things nobody asked about, and once it
 * exists every screen has a reason to use it.
 *
 * ⚠️ AND IT SPEAKS THROUGH THE SAME CHANNELS THE READER DOES (`feedback.tsx`).
 * Somebody holding a phone at a shelf is not looking at it; the buzz and the
 * beep are the part they get, and the sentence is for when they look back.
 *
 * ⚠️ IT LIVES IN `frame/` BECAUSE IT PINS TO AN EDGE, and `chrome.test.mjs`
 * refuses that anywhere else — correctly. A second thing stuck to the viewport
 * is a second chrome whatever it is called: it competes with the nav for the
 * same corner, it has to know the same safe-area inset, and the day one of those
 * numbers moves only one of them follows. `Renewal` is the neighbour that
 * already made this argument, and this takes the same two tokens it does.
 */

import * as React from "react";
import { CircleCheck, TriangleAlert } from "lucide-react";
import type { Problem } from "@engine/kernel";
import { Button } from "@heroui/react";
import { say } from "../parts/feedback.js";
import { TYPE } from "../tokens/type.js";
import { ISLAND_PAD, NAV_SPACE, SPACE } from "../tokens/metrics.js";
import { MOTION } from "../tokens/motion.js";

/* -------------------------------------------------------------- the words --- */

export type TellingKind = "working" | "did" | "failed";

export interface Told {
  readonly kind: TellingKind;
  readonly says: string;
  /** The line under it — a problem's own sentence, or what is left to do. */
  readonly under?: string;
  /** 0–1 while working, where the caller can count. Absent is indeterminate. */
  readonly share?: number;
}

export interface Telling {
  /**
   * ⚠️ THE ONLY ONE THAT DOES NOT CLEAR ITSELF. Work ends when the caller says
   * it ended, in a `did` or a `failed` — a timer here would make a slow upload
   * look finished while it was still running.
   */
  working: (says: string, share?: number) => void;
  did: (says: string, under?: string) => void;
  /**
   * ⚠️ A `Problem` RATHER THAN A STRING, so the sentence is the one the runtime
   * already wrote. A caller composing its own is a caller inventing wording for
   * a refusal it did not make, and the two drift.
   */
  failed: (problem: Problem, says?: string) => void;
  /** ⚠️ For a caller that started work and then had nothing to report. */
  quiet: () => void;
}

/*
  ⚠️ A NO-OP DEFAULT RATHER THAN A THROW. A component rendered outside a `Shell`
  — a test specimen, a fragment in the proving ground — should draw, not crash;
  and a screen whose announcements go nowhere in a harness is not a fault worth
  failing a render over. The GUARD is what makes sure a real app has one.
*/
const NOTHING: Telling = {
  working: () => {}, did: () => {}, failed: () => {}, quiet: () => {},
};

const Channel = React.createContext<Telling>(NOTHING);

/** ⚠️ Everything that acts calls this. See `TellingProvider`. */
export const useTelling = (): Telling => React.useContext(Channel);

/* ------------------------------------------------------------ the surface --- */

/**
 * ⚠️ HOW LONG A FINISHED SENTENCE STAYS. Long enough to read at arm's length
 * after looking back at the phone, short enough that it is gone before it
 * becomes furniture. A failure holds longer because it is the one somebody has
 * to act on — and it is dismissible, which the success is not worth being.
 */
const HOLDS = { did: 3200, failed: 6000 } as const;

const MARK: Readonly<Record<TellingKind, React.ReactNode>> = {
  working: null,
  did: <CircleCheck />,
  failed: <TriangleAlert />,
};

export function TellingProvider({ children }: { readonly children: React.ReactNode }) {
  const [told, setTold] = React.useState<Told | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const hold = React.useCallback((next: Told | null, forMs?: number) => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    setTold(next);
    if (forMs) timer.current = setTimeout(() => { setTold(null); }, forMs);
  }, []);

  React.useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const channel = React.useMemo<Telling>(() => ({
    working: (says, share) => {
      hold({ kind: "working", says, ...(share === undefined ? {} : { share }) });
    },
    did: (says, under) => {
      /* ⚠️ HEARD AS WELL AS SEEN — see the header. */
      say("yes");
      hold({ kind: "did", says, ...(under === undefined ? {} : { under }) }, HOLDS.did);
    },
    failed: (problem, says) => {
      say("no");
      hold({
        kind: "failed",
        says: says ?? problem.title,
        /*
          ⚠️ THE RUNTIME'S OWN SENTENCE, NOT A RESTATEMENT. `Problem` already
          carries the line that says what to do about it, written where the
          refusal was made; a caller writing its own here is a second answer that
          drifts from the first and is worse, because it knows less.
        */
        ...(problem.detail ? { under: problem.detail } : {}),
      }, HOLDS.failed);
    },
    quiet: () => { hold(null); },
  }), [hold]);

  return (
    <Channel.Provider value={channel}>
      {children}
      <Said of={told} onGo={() => { hold(null); }} />
    </Channel.Provider>
  );
}

/**
 * ⚠️ ABOVE THE FOOT AND BELOW NOTHING, WHICH IS WHERE A THUMB IS NOT. A bar
 * across the top is the notification shade on a phone and the browser's own
 * chrome on a desktop; across the bottom it lands under the nav island and the
 * screen's one action, which are the two things it must never cover.
 *
 * ⚠️ AND IT IS `fixed`, NOT `sticky`. The page it belongs to scrolls; the
 * announcement is about the LAST THING SOMEBODY DID, which does not have a place
 * in the document.
 */
function Said({ of, onGo }: { readonly of: Told | null; readonly onGo: () => void }) {
  if (!of) return null;
  const mark = MARK[of.kind];
  return (
    <div
      /* ⚠️ `NAV_SPACE` IS THE ROOM THE BAR ALREADY RESERVES, so this sits on top
         of the nav's own reserve rather than inventing a second number — the two
         would drift the first time a safe-area inset changed. */
      className={`pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center ${NAV_SPACE}`}
      /* ⚠️ `polite`, NEVER `assertive`. A progress line read out over whatever
         somebody is doing is a screen reader shouting about an upload. */
      aria-live="polite"
    >
      <div
        data-arrive="note"
        /* ⚠️ THE ISLAND'S OWN INSET, for `Renewal`'s reason — a pill floating
           over the foot is the shape the docked action already has, and a pair
           picked here is a pair `metrics.test.mjs` refuses and is right to. */
        className={`pointer-events-auto flex max-w-[min(28rem,calc(100vw-2rem))] items-start
                    ${SPACE.snug} ${ISLAND_PAD} rounded-2xl bg-[var(--overlay)]`}
        style={{ transition: MOTION.enter }}
      >
        {mark ? <span className="mt-0.5 shrink-0 [&>svg]:size-5">{mark}</span> : null}
        <div className={`flex min-w-0 flex-col ${SPACE.hair}`}>
          <span className={TYPE.label}>{of.says}</span>
          {of.under ? <span className={TYPE.note}>{of.under}</span> : null}
          {/*
            ⚠️ A COUNTED SHARE WHERE THERE IS ONE, AND NOTHING WHERE THERE IS NOT.
            An indeterminate bar under a determinate job is the thing that makes a
            six-photograph upload look stuck at the same place for fifteen
            seconds — which is what "the save button does nothing" was.
          */}
          {of.kind === "working" && of.share !== undefined ? (
            <span
              role="progressbar"
              aria-valuenow={Math.round(of.share * 100)}
              className="mt-1 h-1 w-full overflow-hidden rounded-full bg-[var(--default)]"
            >
              <span
                className="block h-full rounded-full bg-[var(--on)]"
                style={{ width: `${Math.max(0, Math.min(1, of.share)) * 100}%`, transition: MOTION.enter }}
              />
            </span>
          ) : null}
        </div>
        {/* ⚠️ ONLY A FAILURE IS DISMISSIBLE. A success clears itself and a
            working state ends when the work does; a close on either is a control
            that competes with the thing somebody is actually doing. */}
        {of.kind === "failed" ? (
          <Button size="sm" variant="ghost" aria-label="Dismiss" onPress={onGo}>✕</Button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * THE CROWN — the one row every screen has, and the socket a screen claims it
 * through.
 *
 * ⚠️ ONE CROWN, AND ITS SHAPE IS ITS SLOTS. Lead is a face XOR a way out; the
 * middle is a name XOR a search; the trail is two actions and one act. Both
 * refusals THROW, because a crown that quietly drops a slot is a control whose
 * shape depends on what somebody happened to pass.
 *
 * ⚠️ AND THIS FILE DRAWS THE CHROME, WHICH `shape.test.mjs` NAMES. Everything
 * else is a caller: no screen draws its own crown, and one that wants a
 * different one publishes a claim to the socket instead.
 */

import * as React from "react";
import type { Tone } from "@engine/kernel";
import { Button, Card } from "@heroui/react";
import { ON_SCENE } from "../tokens/ambience.js";
import { TYPE } from "../tokens/type.js";
import {
  BAND_PAD, CROWN, CROWN_CHIP, CROWN_HERO_PAD, CROWN_SIZE, GUTTER, HEAD_GAP, ICON, SAFE_TOP, SPACE, TITLE_PAD, WIDTH,
} from "../tokens/metrics.js";
import type { Width } from "../tokens/metrics.js";

/* ⚠️ The crown's own height, for the one caller that must match it. */
export { CROWN };
import { MOTION, transition, useStill } from "../tokens/motion.js";
import { Face, type FaceOf } from "../parts/face.js";
import { Mark, type MarkOf } from "./arrival.js";
import { Hint, Pip } from "../parts/beside.js";
import { Band, type Bleed } from "./page.js";
import { Spacer } from "../parts/arrange.js";

export function LeaveChip({ leave = "back", label, onDo }: {
  readonly leave?: "back" | "dismiss";
  readonly label?: string;
  readonly onDo: () => void;
}) {
  const says = label ?? (leave === "dismiss" ? "Close" : "Back");
  return (
    /* ⚠️ NO CHIP — the hem behind the crown is what holds it now. It carried
       `data-chrome` so it stayed findable over whatever scrolled past; a fill
       on the one control every screen has, purely for contrast, is the shape
       the hem removes everywhere else too. */
    <Hint says={says}>
      <Button
        isIconOnly
        size={CROWN_SIZE}
        variant="ghost"
        aria-label={says}
        onPress={onDo}
      >
        <span className="flex items-center" style={{ ["--icon" as string]: `${ICON.crown}px` }}>
          {leave === "dismiss" ? <X /> : <Back />}
        </span>
      </Button>
    </Hint>
  );
}

/**
 * ⚠️ ONE THRESHOLD, NOT A SCROLL-LINKED FRACTION. Driving the swap off a
 * continuous offset means a state update per frame and a title that is half
 * faded for as long as somebody's finger is still — which reads as a rendering
 * fault rather than as a transition. A boolean crossed once, animated by CSS, is
 * the same effect with none of that.
 *
 * ⚠️ THE HYSTERESIS IS THE POINT. Coming back UP has a lower threshold than
 * going down, so a page resting exactly on the boundary cannot oscillate — which
 * a single value does, visibly, on any list whose last item is near the fold.
 */
function useScrolledPast(down = 56, up = 32): boolean {
  const [past, setPast] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setPast((was) => (was ? scrollY > up : scrollY > down));
    onScroll();
    addEventListener("scroll", onScroll, { passive: true });
    return () => removeEventListener("scroll", onScroll);
  }, [down, up]);

  return past;
}


/** ⚠️ Drawn here for the same reason `Lens` is — no icon library in this layer. */
const X = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
  </svg>
);

const Back = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M19 12H5" strokeLinecap="round" />
    <path d="m12 19-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);


/* ------------------------------------------------------------------ crown --- */

/**
 * ONE ROW OVER EVERY SCREEN IN THE PRODUCT.
 *
 *     ( lead )( middle                        )( also )( does )
 *
 * ⚠️ THERE WERE FOUR OF THESE AND THEY WERE ONE SHAPE. `Crown` (a mark, a name,
 * an `aside`), `AppCrown` (a face, a search, two actions), `PageCrown`'s row (a
 * back control, a collapsing title, two actions) and — the one nobody could
 * find — a hand-rolled `<header>` inside the Shell. Every one of them was
 * something on the left, something in the middle and controls on the right, at
 * four slightly different heights, with four spacings and four answers to what
 * a secondary action looks like. That is not four components; it is one
 * component written four times, which is why the Shell's copy was the only one
 * that scrolled away and the only one with a rule under it.
 *
 * ⚠️ SO THE SHAPE IS THE SLOTS, AND THERE IS NO `kind` PROP. What a crown IS
 * falls out of what it was handed: a face leads where you are somewhere, a way
 * out leads where you can leave, the middle is a name or a search. A variant
 * enum would be a fifth way to say the same thing and the first place the four
 * would start drifting apart again.
 *
 * ⚠️ THE ROW IS ONE HEIGHT, ALWAYS, AND THAT IS THE POINT OF UNIFYING IT.
 * `CROWN` is the row and `CROWN_SIZE` is every control in it, so a crown with a
 * face, a search and two actions is four things of exactly one size on one
 * baseline. The old set drew a 32px avatar beside a 44px field beside a 36px
 * chip, which is the single clearest tell that a header was assembled rather
 * than designed.
 *
 * ⚠️ AND NOTHING HERE IS A SURFACE EXCEPT `find` AND `does`. The hem behind the
 * crown is the background (`data-hem`), so a control needs a fill only when the
 * fill MEANS something: a field has to look like somewhere to type, and the one
 * act a screen is for has to look like the answer. Everything else is ink.
 */
export interface CrownProps {
  /* ------------------------------------------------------------- the lead --- */
  /**
   * WHOSE SCREEN THIS IS — the account, and it opens OneSpace.
   *
   * ⚠️ IDENTITY OR A WAY OUT, NEVER BOTH, and the refusal is loud. A crown with
   * a face AND a back arrow has two leading controls of equal weight and no
   * answer to which one leaves — which is a decision the caller has to make,
   * not one this can average.
   */
  readonly who?: {
    readonly name: string;
    readonly face?: FaceOf;
    readonly onOpen?: () => void;
    /** ⚠️ A dot, never a count — see `Island`. */
    readonly unread?: boolean;
  };
  /** ⚠️ Absent means there is nowhere to go, which is a real state — a surface
      opened as the page itself has nothing underneath it. */
  readonly back?: () => void;
  /**
   * ⚠️ THE WAY OUT IS A PROPERTY OF WHERE THIS SCREEN SITS, NOT A CHOICE. The
   * root of a presented surface is DISMISSED and gets an ×; a screen one level
   * inside is left UPWARDS and gets an arrow. Two screens get that right by
   * hand and the third gets it wrong.
   */
  readonly leave?: "back" | "dismiss";
  readonly backLabel?: string;

  /* ----------------------------------------------------------- the middle --- */
  /**
   * WHERE YOU ARE. A name, optionally with a mark and a second line.
   *
   * ⚠️ A NAME OR A `find`, NEVER BOTH. They are the same slot — the widest one,
   * the one somebody's eye lands in — and a header carrying a title AND a search
   * field has neither of them wide enough to be either.
   */
  readonly name?: string;
  /**
   * THE LOGO, BEFORE THE NAME — the deployment's, or a product's.
   *
   * ⚠️ THE MARK ALONE, NEVER THE LOCKUP. A crown row is 44px and the name is
   * already set beside it, so a wordmark here would be the same word twice at
   * two sizes. The lockup is for a door, where the logo is the subject.
   *
   * ⚠️ AND ONLY WHERE THE SURFACE IS OURS. A workspace's crown says the
   * workspace's name; stamping our mark on it would put our brand over
   * somebody's own.
   */
  readonly mark?: MarkOf;
  /**
   * ⚠️ ONE LINE, AND ONLY WHERE IT SAYS SOMETHING THE NAME DOES NOT. A second
   * line in a 64px row is what turned the shell's crown into a block of text
   * beside two circles — see the Shell.
   */
  readonly under?: string;
  /**
   * ⚠️ THE NAME ARRIVES ON SCROLL RATHER THAN BEING THERE. A page's name is both
   * the biggest thing on it and something you still need four screens down, and
   * one element cannot be both — so the display heading lives in the content and
   * this is the compact copy that replaces it once it has gone. `false` on a
   * destination, where the name is simply where you are.
   */
  readonly collapses?: boolean;
  /**
   * THE WIDE SLOT — what somebody is looking for on this destination.
   *
   * ⚠️ A DECLARATION, NOT A NODE, for the reason `who` is one. Handing the
   * widest, most-seen element in the product arbitrary children is how it
   * becomes whatever the third caller needed that afternoon.
   */
  readonly find?: { readonly label: string; readonly onOpen: () => void };

  /* ------------------------------------------------------------ the trail --- */
  /**
   * ⚠️ QUIET, AND AT MOST TWO. A third fits on a wide phone and falls off a
   * narrow one, which is a layout that is correct on the device it was built on.
   * The ceiling is the TYPE rather than a slice, so a third is a compile error
   * and the conversation about which two matter happens where it should.
   */
  readonly also?: readonly [] | readonly [Slot] | readonly [Slot, Slot];
  /**
   * ⚠️ THE ONE THING THIS SCREEN IS FOR, and the only filled control up here.
   * Icon-only, because it sits in a row of icons; the label is its accessible
   * name rather than text beside the glyph.
   */
  readonly does?: {
    readonly label: string;
    readonly icon?: React.ReactNode;
    readonly onDo: () => void;
    readonly tone?: "danger";
    readonly disabled?: boolean;
    /** ⚠️ Why it is disabled, where there is a reason — see `Slot.why`. */
    readonly why?: string;
    /**
     * ⚠️ WIDE SCREENS ONLY, FOR THE ACT THAT IS DOCKED BELOW `md`. A `Screen`
     * hands the same act to this crown and to a bar above the thumb and shows
     * exactly one of them; without this the phone gets both, six inches apart,
     * saying the same thing. A destination's own act leaves it unset — there is
     * no dock under it to defer to.
     */
    readonly wide?: boolean;
  };

  readonly bleed?: Bleed;
  readonly width?: Width;
  /** ⚠️ Gone, kept as a no-op so callers still compile — see the hem. */
  readonly ruled?: boolean;
}

export interface Slot {
  readonly id: string;
  readonly label: string;
  readonly icon: React.ReactNode;
  readonly onDo: () => void;
  /**
   * ⚠️ A DOT, NEVER A COUNT, AND IT GOES ON THE CONTROL IT COUNTS. The inbox
   * used to draw a numbered chip in the crown while the nav drew a dot — two
   * answers to "something happened" in one product, and the numbered one was
   * a differently-shaped control in a row of identical ones. What the chrome
   * owes is that something is waiting, not how much; the number is on the
   * screen the control opens.
   */
  readonly dot?: boolean;
  /** ⚠️ Reserved for a primary that destroys. Rare, and never a default. */
  readonly tone?: "danger";
  readonly disabled?: boolean;
  /**
   * ⚠️ WHY IT IS DISABLED, WHERE THERE IS A REASON WORTH GIVING. A greyed
   * control with no explanation is the product declining and refusing to say
   * what would change it — and up here there is room for a tooltip and no room
   * for a line of prose, so the reason goes in the one place a crown has.
   */
  readonly why?: string;
}

export function Crown({
  who, back, leave = "back", backLabel,
  name, mark, under, collapses = false, find,
  also = [], does, bleed = "hold", width = "read",
}: CrownProps) {
  const past = useScrolledPast();
  /* ⚠️ A collapsing name is HIDDEN until it is needed, and it is `aria-hidden`
     because the display heading in the content is the page's real name. Two
     elements carrying the same words is a duplicate to anybody navigating by
     headings. */
  const showName = !collapses || past;

  if (who && back) {
    throw new Error("A crown leads with a face or with a way out, never both.");
  }
  if (name && find) {
    throw new Error("A crown's middle is a name or a search, never both.");
  }

  return (
    <header data-hem="top" className={`sticky top-0 z-10 w-full ${SAFE_TOP}`}>
      <Band bleed={bleed} width={width}>
        <div className={`flex items-center ${SPACE.snug} ${CROWN}`}>
          {/* ------------------------------------------------------- lead --- */}
          {who ? (
            /* ⚠️ NO `data-chrome` — a face carries its own ground, so a chip
               behind it is a plate behind a plate. */
            <Hint says={who.onOpen ? "Your account" : who.name}>
              <Button
                isIconOnly
                size={CROWN_SIZE}
                variant="ghost"
                aria-label={who.onOpen ? "Your account" : who.name}
                isDisabled={!who.onOpen}
                onPress={who.onOpen ?? (() => undefined)}
              >
                <Pip on={Boolean(who.unread)}>
                  {/* ⚠️ `row`, NOT `chip`, AND THIS IS THE HEIGHT BUG. Every
                      control here is 44px and every hit box matched — but the
                      MARKS inside them did not: a 32px avatar beside a 44px
                      field beside a 44px filled disc is three visual sizes in a
                      row of four, which is what "the heights are inconsistent"
                      actually looks like. `metrics.ts` says it outright — a face
                      is 40px, and the crown looked empty until it was — and the
                      crown was the one place still asking for the small one. */}
                  <Face of={who.face} name={who.name} size="row" />
                </Pip>
              </Button>
            </Hint>
          ) : null}
          {back ? <LeaveChip leave={leave} label={backLabel} onDo={back} /> : null}

          {/* ----------------------------------------------------- middle --- */}
          {find ? (
            /* ⚠️ THE ONE CHIP THAT KEEPS ITS SURFACE, and it is not an exception
               to the hem — the rule is about the CAUSE. A field with no
               affordance in it is a label; the fill and the lens together are
               what make a row of words read as somewhere to type, and neither
               is doing contrast work. */
            <Button
              size={CROWN_SIZE}
              variant="tertiary"
              data-chrome="true"
              className={`grow justify-start ${SPACE.tight}`}
              onPress={find.onOpen}
            >
              <Lens />
              {/* ⚠️ `text-muted` at the CONTROL's size, not `TYPE.note` — a
                  placeholder is secondary in colour, and the note role is 14px,
                  so the words inside a 44px field came out a step smaller than
                  the field. */}
              <span className="text-muted">{find.label}</span>
            </Button>
          ) : null}

          {name ? (
            <div
              {...(collapses ? { "aria-hidden": "true" as const } : {})}
              className={`flex min-w-0 grow items-center ${SPACE.tight}`}
              style={{
                opacity: showName ? 1 : 0,
                transform: showName ? "none" : "translateY(0.375rem)",
                transition: showName ? MOTION.enter : MOTION.exit,
              }}
            >
              {/* ⚠️ `nav`, WHICH IS THE SMALLEST STEP, because the mark sits
                  beside a 14px label rather than carrying the row. Sized up it
                  becomes the subject of a header whose subject is where you
                  are. It is decorative here — the name says it in words. */}
              {mark ? <Mark of={mark} size="nav" /> : null}
              <span className="flex min-w-0 flex-col">
                <strong className={`truncate ${TYPE.label}`}>{name}</strong>
                {under ? <span className={`truncate ${TYPE.note}`}>{under}</span> : null}
              </span>
            </div>
          ) : null}

          {/* ⚠️ Pushes the trail right on a crown whose middle is empty — a
              collapsed page name leaves the row with nothing to stretch. */}
          {!find && !name ? <Spacer /> : null}

          {/* ------------------------------------------------------ trail --- */}
          {also.map((a) => (
            /* ⚠️ THE SHARPEST HINT IN THE PRODUCT. These glyphs are the APP's —
               nobody has seen them before — and this is the one row on every
               screen. The `aria-label` said what they do and everybody not using
               a screen reader got a shape. */
            <Hint key={a.id} says={a.label}>
              <Button
                isIconOnly
                size={CROWN_SIZE}
                variant="ghost"
                aria-label={a.label}
                onPress={a.onDo}
              >
                <Pip on={Boolean(a.dot)}>
                  {/* ⚠️ `.button` SIZES ITS OWN SVGS to `size-5 sm:size-4`, so
                      the same crown drew 20px glyphs on a phone and 16px ones on
                      a desktop — a control that changes size with the window, in
                      the one row that is meant to be the product's constant. */}
                  <span
                    className="flex items-center"
                    style={{ ["--icon" as string]: `${ICON.crown}px` }}
                  >
                    {a.icon}
                  </span>
                </Pip>
              </Button>
            </Hint>
          ))}
          {does ? (
            /* ⚠️ ICON-ONLY WHERE THERE IS A GLYPH, LABELLED WHERE THERE IS
               NOT. An `isIconOnly` button handed no icon is a 44px empty
               lozenge — which typechecks, renders, and is unpressable-looking.
               The label is the accessible name either way. */
            /* ⚠️ THE REASON BEATS THE NAME. A disabled control's label is
               already visible or already its `aria-label`; what is not knowable
               without being told is why pressing it would do nothing. */
            <Hint says={does.why ?? does.label} when={Boolean(does.icon) || Boolean(does.why)}>
              <Button
                className={does.wide ? "hidden md:flex" : undefined}
                isIconOnly={Boolean(does.icon)}
                size={CROWN_SIZE}
                variant={does.tone === "danger" ? "danger" : "primary"}
                isDisabled={does.disabled}
                /* ⚠️ ONLY WHERE THE GLYPH IS THE WHOLE CONTROL. A button whose
                   visible text IS its name does not take an `aria-label` — that
                   is the name said twice, once to a screen reader and once to
                   anybody counting the words in the markup. */
                aria-label={does.icon ? does.label : undefined}
                onPress={does.onDo}
              >
                <span
                  className="flex items-center"
                  style={{ ["--icon" as string]: `${ICON.crown}px` }}
                >
                  {does.icon ?? does.label}
                </span>
              </Button>
            </Hint>
          ) : null}
        </div>
      </Band>
    </header>
  );
}

/* ----------------------------------------------------------- crown socket --- */

/**
 * WHERE A SCREEN'S CROWN GOES WHEN SOMETHING ABOVE IT ALREADY HAS ONE.
 *
 * ⚠️ TWO CROWNS WOULD STACK, AND NOTHING WAS STOPPING THEM. A `Shell` draws the
 * product's crown; a `Screen` draws its own. Nothing mounts an app screen inside
 * a shell yet (`mountScreen` has no callers), so the collision has never been
 * seen — which is exactly the state a thing is in the day before it ships.
 *
 * ⚠️ "PROVIDES ONE" IS NOT "RENDERS ONE", AND THE DIFFERENCE DECIDES THE WHOLE
 * BEHAVIOUR. Every `Screen` renders a crown, so a shell that stood down whenever
 * one appeared would never draw its own again — the account, the workspace and
 * the inbox would be gone from every screen in the product. What distinguishes
 * the two cases is a WAY OUT:
 *
 *   a SUB-PAGE has one. It is somewhere you went, its crown carries the way
 *   back and its name, and the product's chrome is one tap behind it. The
 *   shell's crown stands down.
 *
 *   a DESTINATION has none. It IS the product, the nav already says which one,
 *   and its name belongs in the content as a heading. The shell's crown stands,
 *   and the screen hands it the two things a crown can carry that a heading
 *   cannot — its actions.
 *
 * That is what a phone has always done with a pushed view, and it is the only
 * split under which nothing is lost at either end.
 *
 * ⚠️ THE HANDLERS ARE WRAPPED, NOT PUBLISHED. What crosses the socket is a
 * SIGNATURE of primitives plus callbacks that read a ref — so a screen whose
 * `onDo` closes over fresh state does not have to publish again to be correct,
 * and publishing does not loop on a new object identity every render. Both are
 * failure modes of the obvious version and neither is visible in a screenshot.
 */
export interface CrownClaim {
  /** ⚠️ Present means a sub-page: the socket's own crown stands down. */
  readonly back?: () => void;
  readonly leave?: "back" | "dismiss";
  readonly title: string;
  /**
   * ⚠️ THE LINE UNDER THE NAME, AND A SUB-PAGE HAS NOWHERE ELSE TO PUT IT. A
   * destination under a standing shell crown draws its own heading and its own
   * `under` in the content; a sub-page draws neither, so a fact its screen
   * declared — how much is on the shelf, which rack it is on — is simply lost
   * unless it travels with the name.
   */
  readonly under?: string;
  readonly also: readonly Slot[];
  readonly does?: CrownProps["does"];
}

const CrownSocket = React.createContext<((claim: CrownClaim | null) => void) | null>(null);

/**
 * WHICH CROWN WINS, AND WHAT IS IN IT — the whole rule, as a function.
 *
 * ⚠️ IT IS PURE BECAUSE THE BRANCH IS THE DESIGN. Left as a ternary inside the
 * shell's JSX it is two crowns that have to agree about widths, hems and the
 * order of a merged trail, checkable only by rendering a shell around a screen
 * and reading the markup. As a function it is four assertions.
 */
export function crownFor(claim: CrownClaim | null, product: {
  readonly who: CrownProps["who"];
  /**
   * ⚠️ THE MIDDLE IS THE APP'S SEARCH, AND IT USED TO BE THE WORKSPACE'S NAME.
   * A name in the chrome answers a question nobody was asking: the door already
   * says which workspace, the brand already says it in colour, and the person
   * chose it a moment ago. What a working screen wants in the widest slot it
   * has is somewhere to type. An app with no search leaves it empty and the
   * trail moves left, which is a crown with less in it rather than a gap.
   */
  readonly find?: CrownProps["find"];
  readonly also: readonly Slot[];
}): CrownProps {
  /* ⚠️ A WAY OUT IS WHAT MAKES IT A SUB-PAGE — see `useCrownSocket`. */
  if (claim?.back) {
    return {
      /*
        ⚠️ `collapses: false`, AND IT WAS `true` — WHICH LEFT A SUB-PAGE WITH NO
        NAME AT ALL. `collapses` means "the content carries this name in full, so
        hide the small copy until it scrolls away", and it is right for
        `PageCrown`, which draws both. A socketed sub-page draws neither: `Screen`
        renders its heading in content only when there is NO way out (a
        destination under a standing shell crown), precisely because a sub-page's
        crown is supposed to be the one place its name appears. Both halves were
        individually correct and together they meant every sub-page inside a
        Shell was a back arrow, two action chips and nothing saying where you
        were — until you scrolled, on a page that often has nothing to scroll.
      */
      back: claim.back, leave: claim.leave, name: claim.title, under: claim.under,
      collapses: false,
      also: claim.also.slice(0, 2) as unknown as readonly [Slot, Slot],
      does: claim.does,
    };
  }
  return {
    who: product.who,
    find: product.find,
    /*
      ⚠️ THE SCREEN'S ACTIONS COME FIRST AND THE PRODUCT'S FILL WHAT IS LEFT. A
      destination's own acts are what somebody came to the screen to do; the
      inbox is always there and can afford to be the one that falls off a full
      row. Ordered the other way, a screen with two actions of its own would
      show neither.
    */
    also: [...(claim?.also ?? []), ...product.also].slice(0, 2) as unknown as readonly [Slot, Slot],
    does: claim?.does,
  };
}

/**
 * ⚠️ A SOCKET IS OFFERED, NEVER REQUIRED. A `Screen` outside one — OneSpace, a
 * door, a presented surface — draws its own crown exactly as before, and this
 * whole mechanism is invisible to it.
 */
export function CrownSocketProvider({ onClaim, children }: {
  readonly onClaim: (claim: CrownClaim | null) => void;
  readonly children: React.ReactNode;
}) {
  return <CrownSocket.Provider value={onClaim}>{children}</CrownSocket.Provider>;
}

/**
 * Publishes this screen's crown to whatever is above it, and reports whether
 * anything took it.
 */
export function useCrownSocket(claim: CrownClaim): boolean {
  const publish = React.useContext(CrownSocket);
  const latest = React.useRef(claim);
  latest.current = claim;

  /* ⚠️ PRIMITIVES ONLY. A signature over the callbacks would change on every
     render of the caller and republish forever. */
  const sig = JSON.stringify([
    claim.title, claim.under, Boolean(claim.back), claim.leave,
    claim.also.map((a) => [a.id, a.label, Boolean(a.dot)]),
    claim.does ? [claim.does.label, Boolean(claim.does.disabled), claim.does.tone] : null,
  ]);

  const stable = React.useMemo<CrownClaim>(() => {
    const now = () => latest.current;
    return {
      title: now().title,
      under: now().under,
      leave: now().leave,
      back: now().back ? () => now().back?.() : undefined,
      also: now().also.map((a) => ({ ...a, onDo: () => {
        now().also.find((b) => b.id === a.id)?.onDo();
      } })),
      does: now().does ? { ...now().does!, onDo: () => now().does?.onDo() } : undefined,
    };
    /* ⚠️ The signature IS the dependency — see above. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  React.useLayoutEffect(() => {
    if (!publish) return;
    publish(stable);
    /* ⚠️ RELEASED ON THE WAY OUT, or the crown of a screen somebody has left
       stays over the one they are on. */
    return () => publish(null);
  }, [publish, stable]);

  return publish !== null;
}

/* -------------------------------------------------------------- page head --- */

/**
 * A PAGE'S CROWN AND ITS NAME — the row, plus the display heading under it.
 *
 * ⚠️ THIS IS `Crown` PLUS A BLOCK, NOT A SECOND CROWN. The row here is the same
 * component every other surface uses; what this adds is the part that is not
 * chrome at all — the big name, the subject's title card, and whatever scope row
 * sits under them. Keeping those in the crown is what made a "crown" mean two
 * different heights depending on which one you rendered.
 *
 * ⚠️ AND THE NAME IS IN TWO PLACES ON PURPOSE, SHOWN ONE AT A TIME. At rest it
 * is a display heading in the content, where it is the first thing read; once it
 * has scrolled away it comes back small in the crown, where it costs one line
 * and answers "what am I in" without anybody scrolling up to ask. A header that
 * pins the LARGE title spends a fifth of a phone on a word; one that pins
 * nothing leaves somebody four cards deep with a back arrow to nowhere named.
 *
 * ⚠️ THE HANDOVER IS SEQUENCED, NOT A CROSS-FADE. `MOTION.exit` is shorter than
 * `MOTION.enter`, so the large title is gone before the compact one arrives and
 * the two are never both legible in one frame — which is what reading two sizes
 * of the same word at once looks like, and it is the tell that separates this
 * from a naive opacity swap.
 */
export function PageCrown({
  title, face, back, backLabel, leave = "back", also = [], does, under,
  bleed = "edge", width = "work",
}: {
  readonly title: string;
  /**
   * ⚠️ THE SUBJECT THIS PAGE IS ABOUT, AND `Layout` IS WHAT SUPPLIES IT. Not a
   * decoration and not a thumbnail: the picture at the size of the screen with
   * the name across it is a TITLE CARD, and it is the one composition that says
   * "here" rather than "about here". The ground under it is the same subject's
   * own world, from the same declaration — see `Layout`.
   */
  readonly face?: FaceOf;
  /**
   * ⚠️ A CROWN TAKES THE SHAPE OF WHAT IT CROWNS, AND THE DEFAULT IS ONLY A
   * DEFAULT. Edge-bled, the heading sits against the page's own gutter, which is
   * right over content that is also edge-bled. Over a HELD column it is wrong by
   * however wide the screen is: OneSpace's crown put "Money" 240px to the left of
   * the bill it names, which reads as two pages sharing one scroll.
   */
  readonly bleed?: Bleed;
  readonly width?: Width;
  readonly back?: () => void;
  readonly backLabel?: string;
  readonly leave?: "back" | "dismiss";
  readonly also?: readonly [] | readonly [Slot] | readonly [Slot, Slot];
  /**
   * ⚠️ THE PRIMARY ACTION, ALREADY DECIDED. A `Screen` hands the SAME act to
   * this and to its docked bar and shows exactly one of them by breakpoint
   * (`screen.tsx`); declaring it twice is how the crown comes to say "Invite"
   * while the bar says "Add somebody".
   */
  readonly does?: CrownProps["does"];
  /**
   * ⚠️ THE ROW THAT SCROLLS AWAY WITH THE TITLE — a scope picker, a date range.
   * It belongs to the heading rather than to the content, and pinning it would
   * put two rows of chrome over every page.
   */
  readonly under?: React.ReactNode;
}) {
  const past = useScrolledPast();

  return (
    <>
      <Crown
        bleed={bleed}
        width={width}
        back={back}
        backLabel={backLabel}
        leave={leave}
        name={title}
        collapses
        also={also}
        does={does}
      />

      {/* ⚠️ THE PADDING IS BELOW THE HEADING, NOT AROUND IT. The crown above
          already sets the top; `BAND_PAD` here would double it and push the
          title down the screen. What was missing is air UNDER the block. */}
      <Band bleed={bleed} width={width}>
        {face
          ? (
            /*
              ⚠️ THE SUBJECT IS THE SCREEN, AND THE NAME SITS ON IT. A page about
              one named thing that has a picture of itself does not need a
              heading ABOVE a thumbnail — that is a caption over an icon. The
              picture at the size of the screen with the name across it is a
              title card, and it is the one composition that says "here".

              ⚠️ THE NAME IS ON A GRID CELL, NOT ABSOLUTELY POSITIONED. Both
              share one cell, so the block is as tall as the orb and the content
              under it never has to know a hero happened.
            */
            <div
              className={`grid ${TITLE_PAD}`}
              style={{ opacity: past ? 0 : 1, transition: past ? MOTION.exit : MOTION.enter }}
            >
              <span
                className="col-start-1 row-start-1 justify-self-center"
                style={{ gridArea: "1 / 1" }}
              >
                <Face of={face} hero />
              </span>
              {/* ⚠️ NO SCRIM, AND THAT WAS TRIED FIRST. A wash under the name to
                  hold its contrast over a lit sphere is the obvious move and it
                  is visible: the plate is wider than the planet, so its edges sit
                  on plain sky as two dark patches either side of the world. What
                  holds the type is WEIGHT, the mask, and `ON_SCENE` — a halo in
                  the ground's OWN colour, which has no shape and dims nothing. */}
              <span
                /* ⚠️ `relative` IS NOT COSMETIC HERE. The orb carries a
                   `mask-image`, and a mask CREATES A STACKING CONTEXT — so the
                   picture paints after in-flow content and the name vanished
                   behind a planet with nothing in the DOM to show for it. */
                className={`relative col-start-1 row-start-1 self-center justify-self-center w-full
                  flex flex-col items-center text-center ${SPACE.tight} ${CROWN_HERO_PAD}`}
                /* ⚠️ ON THE WRAPPER, BECAUSE `text-shadow` INHERITS. */
                style={{ gridArea: "1 / 1", textShadow: ON_SCENE }}
              >
                <h1 className={TYPE.wordmark}>{title}</h1>
                {under}
              </span>
            </div>
          )
          : (
            <div className={`flex flex-col ${HEAD_GAP} ${TITLE_PAD}`}>
              <h1
                className={TYPE.display}
                style={{ opacity: past ? 0 : 1, transition: past ? MOTION.exit : MOTION.enter }}
              >
                {title}
              </h1>
              {under}
            </div>
          )}
      </Band>
    </>
  );
}

const Lens = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" strokeLinecap="round" />
  </svg>
);

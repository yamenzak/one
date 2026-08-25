/**
 * THE CARD GROUP AND ITS ROWS — the unit almost every screen is made of.
 *
 * ⚠️ ONE OBSERVATION DRIVES THIS WHOLE FILE: in a product that reads well,
 * essentially every screen is a stack of card groups, each holding rows of one
 * of a handful of shapes. Settings, a profile, a payee list, a document index, a
 * balance breakdown — the same two components with different rows in them. The
 * moment each screen builds its own list, they drift, and the drift is not
 * fixable later because nobody can point at which one is wrong.
 *
 * ⚠️ SO THE ROWS ARE A CLOSED SET, AND THAT IS THE POINT. Seven shapes cover
 * everything below; an eighth is a decision somebody makes on purpose, in
 * review, having failed to fit it into the seven. A component library with
 * thirty row types has no row types.
 *
 * ⚠️ GROUPING CARRIES MEANING, AND A LABEL IS ONLY ADDED WHEN IT DOES NOT. Two
 * cards with a gap between them already say "these are different kinds of
 * thing"; a heading over each is the same information twice, and it pushes
 * everything below the fold. A `Group` therefore takes an OPTIONAL label.
 *
 * ⚠️ NOTHING HERE SETS A COLOUR, A RADIUS OR A BORDER. The card is HeroUI's
 * `Card`, the switch is its `Switch`, the avatar is its `Avatar` — so a
 * workspace's branding reaches all of it, and none of it has to be revisited
 * when the library changes its mind about a shadow (D7).
 */

import * as React from "react";
import { Button, Card, Chip, Label, Skeleton, Switch } from "@heroui/react";
import { Pencil } from "lucide-react";
import type { Tone } from "@engine/kernel";
import { sayMoneyParts } from "@engine/kernel";
import { TYPE } from "../tokens/type.js";
import {
  CARD_LEAD, CARD_MEDIA, CARD_OTHERS, CARD_ROWS, CONTROL_SHARE, CROWN_SIZE, HEAD_GAP, ICON, INSET,
  GLASS_PAD, LEAD, NUDGE,
  QUICK_PILL, TILE_PAD,
  QUICK_CIRCLE, ROW, SPACE,
  TILE,
} from "../tokens/metrics.js";
import type { Inset } from "../tokens/metrics.js";
import { ARRIVE, arriveAt } from "../tokens/motion.js";
/* ⚠️ ONE MOUNTER — `scene.test.mjs` keeps `worldCss` and `data-field` to
   `page.tsx`, and `useScenery` is the door it hands out. A card painting its own
   would get the picture and none of what the engine learns next. */
import { useScenery } from "../frame/page.js";
import type { Sky } from "../scene/index.js";
import { useBones } from "./bones.js";
import { Knob, NamedAlready } from "./forms.js";
import { Face, type FaceOf } from "./face.js";
import { Hint } from "./beside.js";
import { Tally } from "./tally.js";
import { useShown } from "./said.js";

/* ------------------------------------------------------------------ group --- */

export interface GroupProps {
  /** ⚠️ Only where the grouping does not already say it — see the header. */
  readonly label?: string;
  /**
   * ⚠️ WHEN THE CARD IS ABOUT A SUBJECT, THE HEADING SHOWS IT. A column of
   * per-product cards headed by nothing but the product's name is a report —
   * six identical headings differing in one word, which is what somebody has to
   * read rather than see. A mark beside the name makes it a section they can
   * find by looking.
   */
  readonly face?: FaceOf;
  /**
   * One line under the label, for a group whose consequence is not obvious.
   *
   * ⚠️ A NODE, BECAUSE A CARD'S VERDICT IS THE ONE LINE THAT WEARS A TONE. It
   * was a `string`, so the sentence that says a lane is half-configured or a
   * store is draining had to be the same grey as every description on the
   * screen — the ink is the only channel a monochrome product has for "this one
   * is the problem", and a heading is exactly where it earns its keep. Still a
   * LINE: it renders inside a `<p>`, so a block element here is invalid markup
   * that browsers silently reparent.
   */
  readonly under?: React.ReactNode;
  /**
   * ONE SMALL ANNOTATION AT THE FAR END OF THE HEADING ROW — a delta, a count, a
   * period picker.
   *
   * ⚠️ IT WRAPS RATHER THAN SHRINKING. A slot beside a heading is `shrink-0` in
   * every first draft, and the first real filter put in one — a five-segment
   * period — then held its full width at 390, ran past the screen edge and cut
   * its last segment off. A slot that only works while it is empty is not a
   * slot, so the row wraps and a wide aside takes the line under the heading.
   */
  readonly aside?: React.ReactNode;
  /**
   * ONE CONTROL IN THE HEADING, ACTING ON THE WHOLE CARD.
   *
   * ⚠️ IT IS NOT `aside`, AND THE DIFFERENCE IS WHAT THE THING DOES RATHER THAN
   * WHERE IT SITS. An aside ANNOTATES — a delta, a count, a period picker — so
   * it wraps under the heading when it will not fit, which is right for a fact
   * and wrong for a switch: a control that moves to its own line reads as
   * belonging to the first row rather than to the card. This one is `shrink-0`
   * and stays on the heading line.
   *
   * ⚠️ AND THE SHAPE IT EXISTS FOR IS THE SWITCHED CARD — a heading, a switch
   * beside it, and rows under it that the switch turns on and off. Every
   * reference has one; the vocabulary had `ToggleRow`, which puts the switch on
   * a row INSIDE the card and so says it governs that row alone.
   */
  readonly control?: React.ReactNode;
  /**
   * ⚠️ A PHOTOGRAPH THE CARD LEADS WITH — see `CardMedia`. It is the object the
   * card is about, at the card's own full width, with the rows under it.
   *
   * ⚠️ A PICTURE OF THE THING BEATS A PICTURE OF THE CATEGORY, and that is the
   * whole reason this is a slot rather than a caller's `<img>`: the bleed, the
   * aspect, the two overlay corners and the glass on them are four decisions
   * that come out differently every time somebody makes them at a call site.
   */
  readonly media?: CardMedia;
  /**
   * ONE ACTION AT THE FOOT OF THE CARD, AS A REAL BUTTON.
   *
   * ⚠️ A CARD WITH SOMETHING TO DO ABOUT IT IS A SHAPE THE VOCABULARY DID NOT
   * HAVE, and its absence is what turned the delete-my-account card into a
   * paragraph with a red sentence under it. `ActionRow` is right for a
   * destructive item in a LIST of items — the grammar every settings screen
   * uses — and wrong as the only thing in a card, where nothing around it says
   * a row is pressable. A button says so by being one.
   *
   * ⚠️ AND IT IS A NODE RATHER THAN A LABEL AND A HANDLER, because the action
   * that most often belongs here opens a two-step: what goes in the slot is a
   * `Confirm` whose trigger is the button. A `{label, onDo}` prop would make
   * that the one case the slot could not hold.
   */
  readonly does?: React.ReactNode;
  /**
   * ⚠️ ITS PLACE IN A SEQUENCE OF BLOCKS, WHICH IS THE ONLY STAGGER THERE IS.
   * Pass the index within a screen's sections and they arrive in reading order;
   * leave it off and the block arrives on its own. Capped at six steps — see
   * `arriveAt`.
   */
  readonly at?: number;
  /**
   * ⚠️ A CARD MAY WEAR A WORLD, AND IT IS THE SAME ENGINE A PAGE USES. Not a
   * gradient, not a texture: a family and a seed, through `useScenery`, so the
   * grain, the matte, the drift and both reduced-motion opt-outs all reach it —
   * and so a workspace's brand does too. `Place` reached for this by stamping
   * `data-sky` by hand, which got it the page's own ground repainted inside the
   * card (`--world-ground` is an inherited custom property, so the attribute
   * matched a rule whose value was the page's) and a family name — `veil` —
   * that the engine has not had since it was rewritten.
   *
   * ⚠️ SPARINGLY. AMBIENCE.md's rule is the whole of it: ambience everywhere is
   * ambience nowhere. A card earns a ground when it is a destination or a
   * result, never when it is four rows of settings.
   */
  readonly sky?: Sky;
  /** ⚠️ Which one of the family — see `PageProps.seedling`. */
  readonly seedling?: string;
  readonly children?: React.ReactNode;
}

/**
 * ⚠️ THE BLOCK ARRIVES, NOT ITS ROWS, AND THIS IS THE WHOLE ANTI-JUNGLE RULE.
 * Twelve rows each easing in on their own delay is the effect everybody builds
 * once and nobody enjoys twice: the list takes half a second to become readable
 * and the eye is dragged down it rather than allowed to scan. A card is ONE
 * thing arriving, its rows are its contents, and a screen of four cards reads as
 * four beats. `arriveAt` is offered for exactly that — a stagger BETWEEN blocks,
 * capped, never within one.
 */
/**
 * ⚠️ A CARD INSIDE A CARD, AND WHY IT IS THE LIBRARY'S PROBLEM RATHER THAN THE
 * SCREEN'S. Two cards nest and the result is not a visible mistake — both are
 * the same colour, so what somebody sees is ONE card whose first row starts
 * twice as far down as every other card in the product, which reads as a
 * spacing bug in the row rather than as a second card. Measured on the legal
 * screen: 2 nested cards there, 0 everywhere else, and nothing failed.
 *
 * ⚠️ AND IT HAPPENS FOR A GOOD REASON EVERY TIME. A rendered list owns a `Group`
 * so it can be dropped onto a screen on its own; a screen owns a `Group` so it
 * can head the block. Both are right, and the composition of two right decisions
 * is the defect — which is exactly the kind a call-site fix does not prevent
 * from coming back.
 */
const InCard = React.createContext(false);

/* ----------------------------------------------------------------- glass --- */

/**
 * A CONTROL OR A LABEL THAT STANDS ON A PHOTOGRAPH.
 *
 * ⚠️ IT IS THE THIRD CASE, AND THE OTHER TWO ARE BOTH STILL RIGHT. Chrome is
 * glass because content passes under it; an in-flow control is OPAQUE from the
 * tier ladder, because nothing moves behind it and a translucent grey over a
 * coloured ground reads as grime (`QuickActions` has the measurement). What
 * neither covers is a control standing on an IMAGE: opaque, it is a grey blob
 * hiding the picture it is about, and from the ladder its legibility depends on
 * what somebody happened to upload.
 *
 * ⚠️ SO IT IS THE DOCK'S OWN MATERIAL, SEEN THROUGH — dark plate, light ink,
 * both themes, because what is behind it is not the theme. The rule is in
 * `ambienceStylesheet` beside the plate's, for the D7 reason every fill in this
 * package is: a component that names a colour is a component a workspace's
 * branding never reaches.
 *
 * ⚠️ AND THE SHAPE IS DECIDED BY WHAT IS IN IT, NOT BY A PROP. A glyph alone is
 * a circle — the round buttons over every viewfinder in the references — and
 * anything with a word in it is a pill. A `shape` prop here would let a caller
 * put "Cooling Mood" in a circle, which is the one arrangement neither of those
 * two shapes survives.
 */
export function Glass({ icon, label, only, onDo }: {
  readonly icon?: React.ReactNode;
  /**
   * ⚠️ ALWAYS PRESENT, EVEN WHERE IT IS NOT DRAWN. On a circle it is the
   * accessible name and the tooltip; a glyph on a photograph with no name is
   * the least guessable control in any product, because the picture behind it
   * supplies no context a mark can lean on.
   */
  readonly label: string;
  /**
   * ⚠️ DRAW THE MARK ALONE — the round form. It is a request rather than an
   * inference from a missing label, because `label` is never missing.
   */
  readonly only?: true;
  readonly onDo?: () => void;
}) {
  const round = Boolean(icon) && only === true;
  /* ⚠️ THE MARK IS A FIXED BOX, NOT A GLYPH LEFT TO SET ITS OWN LINE. Measured:
     a caption with an icon came out 36px tall beside one without at 32, and they
     sat two pixels apart vertically — a 20px svg's line box is taller than a
     20px line of text. `size-5` makes the box the same 20px either way. */
  const mark = icon
    ? (
      <span
        aria-hidden="true"
        className="flex size-5 shrink-0 items-center justify-center"
        style={{ ["--icon" as string]: `${ICON.row}px` }}
      >{icon}</span>
    )
    : null;

  /* ⚠️ NOT A BUTTON WHEN IT DOES NOTHING. A caption rendered as a `Button` is a
     control in the accessibility tree that refuses every press, and on a phone
     it takes a tap that was meant for the card under it. */
  if (!onDo) {
    return (
      <span
        data-glass="true"
        className={`inline-flex items-center ${SPACE.tight} ${GLASS_PAD} ${TYPE.note}`}
      >
        {mark}
        {label}
      </span>
    );
  }

  /* ⚠️ THE NAME IS THE TOOLTIP AS WELL AS THE LABEL, AND IT IS THE ROUND FORM
     THAT NEEDS ONE. A mark on a photograph has no context to lean on: the
     surrounding pixels are somebody's shelf, so nothing near it hints at what it
     does the way a word in a row above it would. */
  if (round) {
    return (
      <Hint says={label}>
        <Button
          data-glass="true"
          /* ⚠️ `ghost`, BECAUSE THE FILL IS THE GLASS'S. Any other variant paints
             its own surface over the material and the blur then sits behind an
             opaque plate, which is the cost with none of the effect. */
          variant="ghost"
          isIconOnly
          aria-label={label}
          className={`${QUICK_CIRCLE} shrink-0`}
          onPress={onDo}
        >{mark}</Button>
      </Hint>
    );
  }

  return (
    <Button
      data-glass="true"
      /* ⚠️ `ghost` — see the round form above. */
      variant="ghost"
      /* ⚠️ A CONTROL IS 44px AND A CAPTION IS 32, AND THAT IS THE ONE PLACE THE
         TWO GLASS HEIGHTS DIFFER. A caption is not a target; a pill somebody
         presses is, and 44 is the floor this file opens by naming. Two heights
         with a reason each, rather than the three the first draft had — 32, 36
         and 44, none of them chosen. */
      className={`shrink-0 ${QUICK_PILL}`}
      onPress={onDo}
    >
      {mark}
      {label}
    </Button>
  );
}

/**
 * ⚠️ A PHOTOGRAPH THE CARD LEADS WITH, AND THE TWO SLOTS ON IT ARE WHERE THE
 * REFERENCES PUT THEM. `over` is the bottom-left — what the picture IS, in
 * words, where a caption goes on every photograph anybody has ever printed —
 * and `act` is the top-right, which is the one corner a thumb reaches on a phone
 * without covering the subject.
 */
export interface CardMedia {
  readonly src: string;
  /**
   * ⚠️ REQUIRED, AND NOT DEFAULTED TO THE CARD'S LABEL. A picture of a shelf
   * under a heading that says "Rack A" is described twice to a screen reader and
   * once to everybody else; what it needs is what is IN it, which only the caller
   * knows. Empty string is the correct answer for a picture that is decoration.
   */
  readonly alt: string;
  /** ⚠️ Chips, bottom-left — see `CardMedia`. */
  readonly over?: React.ReactNode;
  /** ⚠️ One control, top-right — see `CardMedia`. */
  readonly act?: React.ReactNode;
}

const Media = ({ of }: { readonly of: CardMedia }) => (
  /* ⚠️ THE PICTURE IS THE CARD'S FULL WIDTH — see `CARD_LEAD`. A photograph
     inset by the card's gutter is a picture in a frame, which is a different
     object from a card that IS the thing it is about. */
  /* ⚠️ `data-media` IS WHAT GIVES IT THE CARD'S RADIUS — see `ambienceStylesheet`.
     A component that names its own would be one a workspace's branding never
     reaches (D7), and this radius has to track the card's rather than be typed
     beside it. */
  <div data-media="true" className={`relative ${CARD_LEAD} ${CARD_MEDIA} overflow-hidden`}>
    <img src={of.src} alt={of.alt} className="size-full object-cover" />
    {of.act
      ? <div className="absolute right-3 top-3 flex">{of.act}</div>
      : null}
    {of.over
      ? (
        <div className={`absolute inset-x-3 bottom-3 flex flex-wrap items-center ${SPACE.tight}`}>
          {of.over}
        </div>
      )
      : null}
  </div>
);

export function Group(
  { label, under, face, aside, control, media, at, sky, seedling, does, children }: GroupProps,
) {
  /* ⚠️ CALLED BEFORE THE BRANCH, because it is a hook — and its answer is
     discarded when nested, which is correct: a world belongs to the card, and
     the card here is somebody else's. */
  const own = useScenery({ sky, seedling, reach: "card" });
  const nested = React.useContext(InCard);

  /*
    ⚠️ THE INNER ONE STANDS DOWN RATHER THAN THROWING, because every nesting
    this codebase actually has is a waiting state or a rendered list inside a
    card — `RowsWaiting` inside a `Group`, a `Listing` inside a section — and
    each of those wants precisely this: its rows, in the card that is already
    there. A throw would be correct about the shape and would take working
    screens down over a spacing question.

    ⚠️ THE LABEL SURVIVES AS A HEADING IN THE FLOW. Dropping it would make a
    nested group silently lose the one thing it was given, which is a worse
    failure than the one this fixes.
  */
  if (nested) {
    return (
      <>
        {label || aside || control ? (
          <div className={`flex flex-wrap items-baseline justify-between ${ROW.gap} ${ROW.pad}`}>
            <div className={`flex min-w-0 flex-col ${SPACE.hair}`}>
              {label ? <h3 className={TYPE.group}>{label}</h3> : null}
              {under ? <p className={TYPE.note}>{under}</p> : null}
            </div>
            {aside}
            {control ? <span className="shrink-0 self-center">{control}</span> : null}
          </div>
        ) : null}
        {children}
        {does ? <div className={`flex ${ROW.pad}`}>{does}</div> : null}
      </>
    );
  }

  return (
    /* ⚠️ THE WORLD'S VARIABLES GO ON OUR OWN ELEMENT AND THE ATTRIBUTE GOES ON
       THE CARD, which needs no wrapper because this section is already here. A
       `style` on a library component overrides the theme outright and `heroui`
       refuses one; custom properties INHERIT, so setting them a level out and
       stamping `data-sky` on the card is the same paint through the theme's own
       channel rather than around it. */
    <section
      {...ARRIVE}
      className={`flex flex-col ${HEAD_GAP}`}
      style={{ ...(at === undefined ? undefined : arriveAt(at)), ...own.css }}
    >
      {label || aside || control ? (
        /* ⚠️ THE MARK IS BESIDE THE HEADING BLOCK, NOT ABOVE IT, so the label
           and its line under stay one thing and the mark reads as belonging to
           both. `chip` because a heading is not a row — a 40px plate here would
           be taller than the two lines beside it.

           ⚠️ AND THE ROW WRAPS, so the aside takes the line under a heading it
           cannot fit beside rather than pushing it off the screen. */
        /* ⚠️ THE CONTROL IS OUTSIDE THE WRAPPING ROW, NOT THE LAST THING IN IT —
           see `GroupProps.control`. Inside, `flex-wrap` sent it to its own line
           the moment the heading and the switch together exceeded the card:
           measured at 390 with a two-word state beside it, which is most of
           them. What wraps is the heading and its aside; the control stands
           beside the pair. */
        <div className={`flex items-center ${ROW.gap}`}>
          <div className={`flex grow flex-wrap items-center justify-between ${ROW.gap}`}>
            <div className={`flex min-w-0 items-center ${ROW.gap}`}>
              {face && label ? <Face of={face} name={label} size="chip" /> : null}
              <div className={`flex min-w-0 flex-col ${SPACE.hair}`}>
                {label ? <h2 className={TYPE.group}>{label}</h2> : null}
                {under ? <p className={TYPE.note}>{under}</p> : null}
              </div>
            </div>
            {aside}
          </div>
          {control ? <span className="shrink-0">{control}</span> : null}
        </div>
      ) : null}
      {/* ⚠️ THE WORLD GOES ON THE CARD ITSELF, not on a wrapper — the layers are
          the card's own pseudo-elements and they take its radius (`inherit`),
          which is what stops a rounded card being square where its ground is. */}
      <Card className={CARD_ROWS} {...(own.css ? own.attrs : {})}>
        {own.field}
        {/* ⚠️ `gap-0` — `.card__content` ships `gap-1`, so four pixels sat
            between every row ON TOP of the separator that already says where
            one ends. A rule with air either side of it is a rule you notice. */}
        <Card.Content className="gap-0">
          {/* ⚠️ THE PICTURE IS OUTSIDE `CARD_OTHERS`, so it does not take a
              row's vertical inset — it supplies its own, by having none. A
              photograph with 12px of card above it is the framed-picture shape
              `CARD_LEAD` exists to prevent, arriving through the spacing rule
              rather than through the gutter. */}
          {media ? <Media of={media} /> : null}
          {/* ⚠️ `CARD_OTHERS` — a child that is not a row is given a row's
              inset, so two pickers in a card are spaced like two rows rather
              than jammed together. See the token. */}
          <InCard.Provider value>
            <div className={`flex flex-col ${CARD_OTHERS}`}>{children}</div>
          </InCard.Provider>
          {/* ⚠️ THE FOOT IS THE CARD'S OWN INSET AGAIN, so a button there sits
              exactly where a row's text does and the card reads as one block
              rather than as a card with something bolted under it. */}
          {does ? <div className={`flex ${ROW.pad}`}>{does}</div> : null}
        </Card.Content>
      </Card>
    </section>
  );
}

/**
 * ⚠️ A CARD'S ROWS ARE SEPARATED BY RHYTHM, NOT BY A LINE — and this is the last
 * edge in the product to go. Every other border and shadow was banned long ago
 * (`ground.test.mjs`'s `edges:`), and the row rule survived on the argument that
 * a list needs dividing. It does not: a row is 24px from its neighbour and 4px
 * from its own second line, and a six-to-one ratio is what says "these two lines
 * are one thing and that is another". The line adds nothing the spacing has not
 * already said.
 *
 * ⚠️ AND IT WAS ASYMMETRIC, WHICH IS WHAT MADE IT LOOK HAND-ASSEMBLED. It was
 * inset 52px on the left to clear the glyph and flush to the card on the right,
 * so every list ended in a hairline that started in the middle of the row and
 * ran off the edge. Fixing the inset would have produced a tidier line; the
 * question was whether to draw one at all.
 *
 * ⚠️ SO A BREAK BETWEEN TWO RUNS IS A SECOND CARD, which the `Group` grammar
 * already had — the workspace screen separates what you come back to from what
 * you set up once exactly that way. It reads as two things because it IS two
 * things, at every size, with no rule to align to anything.
 */

/* --------------------------------------------------------------- identity --- */

/**
 * WHO THIS IS — a face, a name, and one line under it, centred.
 *
 * ⚠️ THE FACE IS THE HEADING ON AN ACCOUNT SURFACE. A screen about a person
 * given a display heading has two things naming it: the word "Account" and the
 * person's own face, one of which somebody recognises instantly and the other
 * of which they have to read. Every product that shows a person a screen about
 * themselves needs this, which is why it is here and not in OneSpace.
 *
 * ⚠️ AND IT IS CENTRED, WHICH ALMOST NOTHING ELSE HERE IS. A centred block says
 * "this is about you" the way a left-aligned one cannot — it is the one place
 * on any screen where the subject is the reader.
 */
/**
 * WHAT A WORKSPACE LOOKS LIKE ON A HOME SCREEN.
 *
 * ⚠️ THE ONE PLACE THAT DRAWS AN INSTALLED TILE, so the preview in an editor and
 * the icon a worker serves cannot disagree. They were always going to be built
 * twice — a swatch beside a colour picker, and the real thing in a manifest —
 * and two drawings of one artwork is how somebody picks a colour, installs the
 * app, and finds a different tile on the phone.
 *
 * ⚠️ AND IT IS THE ONLY COMPONENT HERE THAT TAKES COLOURS, WHICH IS NOT A BREACH
 * OF THE FILE'S RULE BUT ITS EXCEPTION STATED. Everything else takes its paint
 * from the theme so a workspace's branding reaches it; this one IS the branding,
 * being chosen, before it has been applied to anything. A tile that read the
 * current theme would show what the workspace looks like now, which is exactly
 * what somebody editing it is not asking about.
 */
export function BrandTile({ name, ground, ink, glyph, size = "panel" }: {
  readonly name: string;
  readonly ground: string;
  readonly ink: string;
  /** One or two characters. Falls back to the name's initial. */
  readonly glyph?: string;
  readonly size?: "chip" | "panel";
}) {
  const box = size === "panel" ? TILE.panel : TILE.chip;
  return (
    <span
      /* ⚠️ A LABEL RATHER THAN THE GLYPH, because a screen reader announcing "N"
         tells nobody anything. The name is what the tile means. */
      role="img"
      aria-label={name}
      className={`flex shrink-0 items-center justify-center ${box}`}
      style={{ background: ground, color: ink }}
    >
      <span aria-hidden="true" className="leading-none">
        {glyph || name.trim().charAt(0).toUpperCase() || "·"}
      </span>
    </span>
  );
}

/**
 * ONE CHOSEN COLOUR, AT READING SIZE.
 *
 * ⚠️ THE SECOND COMPONENT THAT TAKES A COLOUR, AND FOR `BrandTile`'S REASON. A
 * row saying what a colour is set to has to draw that colour; taking it from the
 * theme would draw the colour the workspace has now, which is the one thing
 * somebody reading the row is not asking about.
 *
 * ⚠️ AND IT IS NEVER THE WHOLE ANSWER. A disc alone cannot say "not set", and a
 * near-black disc on a dark card is a hole rather than a value — so the hex is
 * written beside it wherever this is used.
 */
export function Swatch({ colour, label }: {
  readonly colour: string;
  /** What it sets, for anybody not looking at it. */
  readonly label: string;
}) {
  return (
    <span
      role="img"
      aria-label={`${label} — ${colour}`}
      /* ⚠️ A RING IN `currentColor`, BECAUSE THIS DESIGN HAS NO BORDER TOKEN —
         `--border` is `transparent` on purpose (see `ground.ts`). Without one, a
         white swatch on a light card and a near-black one on a dark card are
         invisible, which reads as a rendering fault rather than as a value. The
         row's own ink is themed, so this needs no second definition per theme. */
      className={`inline-block shrink-0 ring-1 ring-current/20 ${TILE.chip}`}
      style={{ background: colour }}
    />
  );
}

export function Identity({ name, under, aside, face }: {
  readonly name: string;
  readonly under?: string;
  /** A chip beside the line under — a role, a standing, a plan. */
  readonly aside?: React.ReactNode;
  /**
   * ⚠️ WHO OR WHAT THIS IS, NOT A PICTURE OF IT. `whoFace(accountId)`,
   * `placeFace(slug)`, `appFace(id)` — one resolver draws all of them, so the
   * same subject cannot wear a different face on two screens (`face.tsx`). The
   * initial stands in until a caller says.
   */
  readonly face?: FaceOf;
}) {
  return (
    <div className={`flex flex-col items-center text-center ${SPACE.snug}`}>
      {/* ⚠️ `panel` IS THE LARGEST OF THE THREE, AND THE SIZE IS THE ONLY THING
          this surface decides about the face. Which picture, whether it moves
          and what stands in when there is no identity are all `face.tsx`'s. */}
      <Face of={face} name={name} size="panel" />
      <div className={`flex flex-col items-center ${SPACE.hair}`}>
        <strong className={TYPE.title}>{name}</strong>
        {under || aside ? (
          <span className={`flex flex-wrap items-center justify-center ${SPACE.tight}`}>
            {under ? <span className={TYPE.note}>{under}</span> : null}
            {aside}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ place --- */

/**
 * A PLACE — a destination that is somewhere to GO rather than something to SET.
 *
 * ⚠️ A PLACE IS NOT A BIG ROW, AND THAT IS THE WHOLE DISTINCTION. A row says
 * "somewhere to go and change something"; a place says "somewhere". The
 * difference is carried by the light, by the size of the name, and by the fact
 * that the entire card is the target — a button inside one would be a second
 * thing to hit on a surface that is already the offer.
 *
 * ⚠️ THE ONLY THING THAT VARIES BETWEEN PLACES IS THE TONE. Same ambience, same
 * shape, one token moved — so three places on one screen read as three of the
 * same kind of thing rather than as three designs. Given free rein each would
 * grow its own gradient and the screen would stop being a set.
 *
 * ⚠️ AND THE FOOT IS THE ONE FACT THAT SAVES OPENING IT. `null` is not known
 * yet and waits; a value speaks; `undefined` draws no foot at all. Somebody
 * with four workspaces told "None yet" for the length of a round trip is a
 * wrong answer wearing a loading state's excuse.
 */
export function Place({ name, said, foot, face, sky = "glow", at, onOpen }: {
  readonly name: string;
  /** What this place IS, in a line. Never a list of its contents. */
  readonly said: string;
  /**
   * ⚠️ WHAT THIS PLACE IS, NOT A PICTURE OF IT — `appFace`/`placeFace`. A
   * chooser of products with nothing but two lines of text on each card is a
   * list of paragraphs: the one thing somebody scans for is which product, and
   * a name in prose is slower to find than a mark.
   */
  readonly face?: FaceOf;
  readonly foot?: React.ReactNode | null;
  /**
   * ⚠️ A DESTINATION EARNS A GROUND — see `GroupProps.sky`. It seeds on the
   * place's own NAME, so a shelf of them is a row of different worlds in one
   * material rather than the same picture repeated.
   */
  readonly sky?: Sky;
  /** Its place in a sequence of blocks — the only stagger there is. */
  readonly at?: number;
  readonly onOpen: () => void;
}) {
  const own = useScenery({ sky, seedling: `place|${name}`, reach: "card" });
  return (
    /* ⚠️ THE ARRIVAL IS ON THE BLOCK, NOT ON THE CONTROL. An inline style on a
       library component beats every token, so branding stops reaching it — and
       a place is one thing arriving, which is what a wrapper says. */
    /* ⚠️ The world's variables here and the attribute on the card — see `Group`. */
    <div {...ARRIVE} style={{ ...(at === undefined ? undefined : arriveAt(at)), ...own.css }}>
      {/*
        ⚠️ THE WORLD IS BUILT BY THE ENGINE, NOT NAMED IN AN ATTRIBUTE. This
        stamped `data-sky="veil"` — a family the engine has not had since it was
        rewritten, when nine hand-drawn grounds became one seeded `glow`. The
        attribute still matched the ground rules, and `--world-ground` is an
        inherited custom property, so every card quietly repainted the PAGE's
        own world at card size: never wrong-looking, never right either, and
        identical on all three cards.
      */}
      {/* ⚠️ `CARD_ROWS`, LIKE EVERY OTHER CARD. This named no inset at all, so it
          took the library's `p-4` — and the span inside it added `PAD` on top,
          which is two box insets stacked inside one box. The tile's contents sat
          32px from its edge while every row in the product sits at 16, so a
          shelf of places did not line up with the cards above or below it and
          nothing said which of the two paddings was the wrong one. */}
      <Card className={CARD_ROWS} {...(own.css ? own.attrs : {})}>
        {own.field}
        <Card.Content>
          {/* ⚠️ THE WHOLE CARD IS THE TARGET, and it is a real Button — the
              focus ring, the pressed state and every keyboard behaviour come
              with it, none of which is visible in a screenshot and all of which
              is visible to somebody not using a mouse. */}
          <Button
            variant="ghost"
            className={`justify-start ${ROW.free} ${ROW.wrap} ${ROW.flush} ${ROW.press}`}
            onPress={onOpen}
          >
            {/* ⚠️ `ROW.pad`, NOT `PAD` — the card supplies the gutter (`ROW.flush`),
                so what is left for the contents is a row's vertical rhythm and
                nothing else. A tile is a row that reads top-down, not a card
                inside a card. */}
            <span className={`flex w-full min-w-0 flex-col items-start text-left ${SPACE.tight} ${ROW.pad}`}>
              {/* ⚠️ ABOVE THE NAME, NOT BESIDE IT. A lead beside two lines of
                  text turns the card into a tall row; a place is a destination
                  and reads top-down, which is what makes it different from
                  the rows under it. */}
              {face ? <span className={NUDGE.under}><Face of={face} name={name} /></span> : null}
              <span className={TYPE.section}>{name}</span>
              <span className={TYPE.note}>{said}</span>
              {foot !== undefined ? (
                <span className={`flex w-full items-center justify-between ${NUDGE.over}`}>
                  {foot === null
                    ? <Skeleton className="h-4 w-24" />
                    : <span className={TYPE.label}>{foot}</span>}
                  <span aria-hidden="true" className={TYPE.note}>›</span>
                </span>
              ) : null}
            </span>
          </Button>
        </Card.Content>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------- rows --- */

interface RowBase {
  /** A glyph, kept small and optical inside the lead's chip. */
  readonly icon?: React.ReactNode;
  /**
   * ⚠️ A SUBJECT IN THE LEAD, WHERE A GLYPH WOULD OTHERWISE GO — and it WINS,
   * because a row about a person or a product should show that person or that
   * product rather than a category icon. Every per-product screen picked one
   * glyph for the whole list, so a workspace with six products was six identical
   * cogs and the label was the only thing telling them apart.
   */
  readonly face?: FaceOf;
  readonly label: string;
  /**
   * ⚠️ ONE LINE, AND NO FULL STOP — see `tone.ts`.
   *
   * ⚠️ AND IT MAY CARRY A MARK. A string cannot hold the seal that says a
   * document was agreed, and the alternative — a chip in `aside` — puts the
   * status on the far side of the row from the sentence it qualifies. The tone
   * check reads the literal strings a screen writes, so a node here is outside
   * what it can see: keep the words in the string parts.
   */
  readonly under?: React.ReactNode;
}

/**
 * ⚠️ `items-start text-left` IS THE FIX FOR THE RAGGED COLUMN. HeroUI's `Button`
 * centres its children, so a two-line row rendered its label centred over its
 * description — every list in the product had a soft, wandering left edge, and
 * it read as amateur without being nameable. `justify-start` on the button is
 * not enough: the block itself has to align its own lines.
 */
/* ⚠️ `label` IS A NODE SO THE PLACEHOLDER CAN BE THE SAME BODY. A row's bones
   used to rebuild this span — and picked `SPACE.tight` where this uses
   `SPACE.hair`, which is the copying mistake one level further down. */
const Body = ({ label, under }: {
  readonly label: React.ReactNode; readonly under?: React.ReactNode;
}) => (
  <span className={`flex min-w-0 grow flex-col items-start text-left ${SPACE.hair}`}>
    <span className={TYPE.label}>{label}</span>
    {under ? <span className={TYPE.note}>{under}</span> : null}
  </span>
);

/**
 * ⚠️ A FIXED BOX, so every label in a list starts at the same x — see `LEAD`.
 * A face and the glyph chip are the same 40px, which is why one can stand in for
 * the other without the text column moving.
 */
const Lead = ({ icon, face }: { readonly icon?: React.ReactNode; readonly face?: FaceOf }) =>
  face
    ? <Face of={face} />
    : icon
    /* ⚠️ THE SIZE IS SET ON THE BOX, NOT ASKED OF THE ICON. Every icon library
       reads `width`/`height` from its own props, so a caller who forgets one
       draws at whatever the default is — and a list with two icon sizes in it is
       the thing that reads as unfinished. Fixing it here means a caller cannot
       get it wrong. */
    ? (
      <span
        aria-hidden="true"
        data-chip="true"
        className={LEAD}
        style={{ ["--icon" as string]: `${ICON.row}px` }}
      >
        {icon}
      </span>
    )
    : null;

/**
 * ⚠️ A ROW THAT GOES SOMEWHERE IS A BUTTON, NOT A DIV WITH AN onClick. The
 * difference is the focus ring, the pressed state, the disabled semantics and
 * every keyboard behaviour React Aria gives us — none of which is visible in a
 * screenshot, all of which is visible to somebody using a keyboard or a screen
 * reader.
 */
export interface NavRowProps extends RowBase {
  /**
   * ⚠️ OPTIONAL, BECAUSE A ROW IS ALSO A TRIGGER. Used as a `Tray` or `Confirm`
   * trigger the press is react-aria's — the row opens the sheet and the sheet
   * owns what happens. Requiring a handler there means passing a function that
   * does nothing, which is a lie in the shape of a prop.
   */
  readonly onOpen?: () => void;
  /**
   * ⚠️ SAY SO WHEN THE PRESS IS SOMEBODY ELSE'S. A row handed to `Tray` or
   * `Confirm` as their trigger is pressable and has no `onOpen` of its own —
   * react-aria supplies the press through context — so without this it would be
   * drawn as the fact it is not.
   *
   * ⚠️ AND FORGETTING IT IS LOUD, WHICH IS THE WHOLE REASON THE FLAG IS HERE
   * RATHER THAN INFERRED. A trigger missing it renders inert and the sheet does
   * not open on the first press anybody tries. The state it replaces was silent:
   * a row with no destination drew a chevron, took a press, and did nothing.
   */
  readonly opens?: boolean;
  /** A count, a status, a value — whatever sits before the chevron. */
  readonly aside?: React.ReactNode;
  readonly isDisabled?: boolean;
}

/**
 * ⚠️ THE CHEVRON IS THE PROMISE THAT SOMETHING IS BEHIND THIS, AND A ROW THAT
 * CANNOT KEEP IT MUST NOT MAKE IT. It was drawn unconditionally, so a row with
 * no destination rendered as a button, took a press and did nothing — eight of
 * them shipped across three console screens, and the first anybody knew was
 * somebody pressing "64 new models" and staying where they were.
 *
 * ⚠️ SO A ROW THAT LEADS NOWHERE IS NOT A BUTTON EITHER. Losing only the chevron
 * would leave a focusable control with press styling and no behaviour, which is
 * the same lie one layer down — worse for anybody arriving by keyboard, who
 * would tab to it.
 */
export function NavRow({ icon, face, label, under, aside, onOpen, opens, isDisabled }: NavRowProps) {
  const leads = !!onOpen || !!opens;
  /*
    ⚠️ THE ROW'S OWN BOX, WITH BARS IN IT. The placeholder this replaced wrote
    `ROW.gap ROW.tap ROW.pad` out for itself and came to 72px against this row's
    80 — 24px short over three rows, which is a list that shifts up when it
    lands. Sharing the element rather than the class names is what makes that
    impossible rather than unlikely.
  */
  const bones = useBones();
  /*
    ⚠️ THE ROW'S OWN SPAN, ITS OWN `Lead` AND ITS OWN `Body` — bars instead of
    words, and nothing else different. Every version of this that rebuilt the
    structure got a number wrong: the placeholder it replaced wrote out
    `ROW.gap ROW.pad ROW.tap` and came 8px short a row, and the first attempt at
    this one rebuilt `Body` and picked `SPACE.tight` where `Body` uses
    `SPACE.hair`. There is no amount of care that fixes copying; there is only
    not copying.

    ⚠️ AND A BAR IS `1lh`, WHICH IS THE LINE IT SITS IN. A fixed `h-4` is
    shorter than a line of `TYPE.label` and a fixed `h-3` than one of
    `TYPE.note` — 8px a row, on every list. `lh` is the element's own computed
    line box, so it stays right if a role's size or leading ever changes.
  */
  const inside = bones
    ? (
      <span className={`flex w-full items-center ${ROW.gap} ${ROW.pad} ${ROW.tap}`}>
        {/* ⚠️ THE LEAD'S OWN BOX, NOT A CIRCLE THE RIGHT SIZE. `LEAD` is what
            `Lead` wears, so the bones lead cannot be a different diameter than
            the glyph it stands in for. */}
        {icon || face ? <Skeleton className={LEAD} /> : null}
        <Body
          label={<Skeleton className="block h-[1lh] w-2/5 rounded-full" />}
          under={under ? <Skeleton className="block h-[1lh] w-3/5 rounded-full" /> : undefined}
        />
      </span>
    )
    : (
    <span className={`flex w-full items-center ${ROW.gap} ${ROW.pad} ${ROW.tap}`}>
      <Lead icon={icon} face={face} />
      <Body label={label} under={under} />
      <span className={`flex shrink-0 items-center ${SPACE.tight}`}>
        {aside}
        {leads ? <span aria-hidden="true" className={TYPE.note}>›</span> : null}
      </span>
    </span>
  );

  /* ⚠️ A FACT KEEPS THE ROW'S GEOMETRY AND LOSES ITS AFFORDANCES, so a list that
     mixes the two still reads as one list rather than as two shapes. */
  if (!leads) {
    return (
      <div data-row className={`flex w-full ${ROW.free} ${ROW.wrap} ${ROW.flush}`}>{inside}</div>
    );
  }

  return (
    <Button data-row variant="ghost" className={`justify-start ${ROW.free} ${ROW.wrap} ${ROW.flush} ${ROW.press} ${ROW.tap}`} isDisabled={isDisabled} onPress={onOpen}>
      {inside}
    </Button>
  );
}

/** A row that DOES something rather than going somewhere — so, no chevron. */
export function ActionRow({ icon, face, label, under, onDo, tone = "neutral" }: RowBase & {
  /**
   * ⚠️ OPTIONAL, BECAUSE A ROW IS ALSO A TRIGGER. Used inside `Confirm` the
   * press is react-aria's — the row opens the dialogue and the dialogue owns
   * the act. Requiring a handler there means passing a function that does
   * nothing, which is a lie in the shape of a prop.
   */
  readonly onDo?: () => void; readonly tone?: Tone;
}) {
  return (
    /*
      ⚠️ DANGER IS A VOICE, NOT A FILL. The filled `danger` variant is for the
      confirming button INSIDE a `Confirm` — the one place a person is already
      reading carefully. As a row in a list it was a full-bleed red slab jammed
      against the card's own corners, which reads as an alarm going off on a
      settings page. A destructive row is the ordinary row shape with the words
      in the danger tone — the grammar every settings screen anybody trusts
      already uses — and the two-step it opens is where the red button lives.
    */
    <Button
      data-row
      variant="ghost"
      className={`justify-start ${ROW.free} ${ROW.wrap} ${ROW.flush} ${ROW.press} ${ROW.tap}`}
      onPress={onDo}
    >
      {/* ⚠️ `data-ink`, NEVER `text-danger` — see `TONE_CSS`. The utility is the
          library's raw fill colour and it is short of the contrast floor as ink;
          the attribute is the channel that was tuned against every surface a
          row lands on. */}
      <span
        className={`flex w-full items-center ${ROW.gap} ${ROW.pad} ${ROW.tap}`}
        {...(tone === "danger" ? { "data-ink": "danger" } : {})}
      >
        <Lead icon={icon} face={face} />
        <Body label={label} under={under} />
      </span>
    </Button>
  );
}

/**
 * ⚠️ THE SWITCH IS THE CONTROL AND THE WHOLE ROW IS ITS LABEL. Rendering the
 * text outside the `Switch` makes a row where tapping the words does nothing —
 * which on a phone is most of the row.
 */
export function ToggleRow({ icon, face, label, under, value, onChange, isDisabled }: RowBase & {
  readonly value: boolean;
  readonly onChange: (next: boolean) => void;
  readonly isDisabled?: boolean;
}) {
  return (
    /* ⚠️ THE BREATHING ROOM IS ON OUR WRAPPER, NOT ON THE SWITCH. Padding is a
       component's own density; setting it here would be restyling the library,
       and the restyle guard is right to refuse it. */
    <div data-row className={`flex w-full ${ROW.pad} ${ROW.tap} items-center`}>
    <Switch
      className="w-full"
      isSelected={value}
      isDisabled={isDisabled}
      onChange={onChange}
    >
      {/*
        ⚠️ THE WHOLE ROW IS `Switch.Content`, AND THAT IS WHAT MAKES THE ROW
        PRESSABLE. It renders the `<label>` carrying the input; anything outside
        it — including the track, which is where everybody aims — is a picture.
        See `SettledSwitch` for the shape and why the library's own anatomy
        snippet is wrong.

        ⚠️ `justify-between` MOVED HERE WITH IT. On the root it laid out the
        content and the control as two children; the control is one child now, so
        the row's two ends are inside. Without it the text takes the full width
        and the switch wraps to a second line, which reads as a broken row.

        ⚠️ AND THE TEXT IS NOT WRAPPED IN A `<Label>` any more — a `<label>`
        inside the content's own `<label>` is invalid, and the inner one takes
        presses that belong to the row.
      */}
      <Switch.Content className={`w-full flex-row justify-between items-center ${ROW.gap}`}>
        {/* ⚠️ `min-w-0 grow` SO A LONG LABEL TRUNCATES RATHER THAN PUSHING THE
            SWITCH OFF THE ROW. A flex child's default minimum is its content, so
            without it the text refuses to shrink and the control is what gives
            way — which on a phone is the whole point of the row. */}
        <span className={`flex min-w-0 grow items-center ${ROW.gap}`}>
          <Lead icon={icon} face={face} />
          <Body label={label} under={under} />
        </span>
        <Knob />
      </Switch.Content>
    </Switch>
    </div>
  );
}

/**
 * A LABEL, WHAT IT MEANS, AND THE CONTROL THAT SETS IT.
 *
 * ⚠️ THE EIGHTH SHAPE, AND IT IS THE ONE EVERY SETTINGS SCREEN NEEDS. `ToggleRow`
 * is this specialised to a switch; everything that is not a switch — a choice, a
 * number, a key, a colour — had nowhere to go, so three separate components each
 * drew a CARD per setting with a title, a description and a full-width form
 * control inside it. That is the grammar of a wizard step, repeated once per
 * row, and a screen of twelve of them is twelve cards deep.
 *
 * ⚠️ THE ROW WRAPS RATHER THAN TRUNCATES, AND THE FLOOR IS WHAT MAKES IT. A
 * control pinned to the corner with `shrink-0` beside a growing label shortens
 * the LABEL — "A plan was published" becomes "A plan was pu…" so that two
 * switches can stay on one line, which is the wrong thing to give up. With a
 * floor under the words the control drops to its own line instead, on a phone
 * only, where there is genuinely no room for both.
 */
export function ControlRow({ icon, face, label, under, wide, children }: RowBase & {
  /** ⚠️ For a control that needs the width whatever the screen is — a textarea. */
  readonly wide?: boolean;
  readonly children: React.ReactNode;
}) {
  return (
    <div data-row className={`flex flex-wrap items-center ${ROW.gap} ${ROW.pad} ${ROW.tap}`}>
      <Lead icon={icon} face={face} />
      {/* ⚠️ THE FLOOR IS A FEW WORDS, NOT A COLUMN. At 12rem it was wider than
          most labels, so on a phone EVERY control dropped to a line of its own
          and a list of six settings came out twelve rows tall. The words wrap
          before the control moves; the control moves only when even that will
          not fit. */}
      <span className="flex min-w-32 grow"><Body label={label} under={under} /></span>
      {/* ⚠️ CAPPED, OR THE ROW WRAPS AND THE CARD LOSES ITS RHYTHM. A text or
          number field ships `w-full` and takes the whole row, pushing the label
          under its floor — measured as heights of 64, 100, 67 and 100 in one
          card on a phone, and 64, 64, 67, 64 on the desktop it was built on. See
          `CONTROL_SHARE`. */}
      {/* ⚠️ THE CONTROL DOES NOT SAY THE NAME AGAIN — see `NamedAlready`. This
          row IS the label, so a control rendering its own put every field's name
          on the screen twice. */}
      <span className={wide ? "w-full" : `shrink-0 ${CONTROL_SHARE}`}>
        <NamedAlready>{children}</NamedAlready>
      </span>
    </div>
  );
}

/**
 * A stored fact and the way to change it.
 *
 * ⚠️ THE LABEL IS ABOVE THE VALUE AND QUIETER THAN IT. The value is what
 * somebody came to read; a layout that gives the two equal weight makes them
 * scan every row twice.
 */
export function FieldRow({ label, value, under, onEdit }: {
  readonly label: string;
  readonly value: React.ReactNode;
  /**
   * ⚠️ WHY IT IS THE WAY IT IS, UNDER THE VALUE RATHER THAN OVER IT. A row
   * that cannot be changed has a reason — a plan that does not cover it — and
   * that reason is read after the fact it explains, not before.
   */
  readonly under?: React.ReactNode;
  /** ⚠️ Absent means genuinely not editable — never a disabled pencil, which
      invites somebody to go looking for how to enable it. */
  readonly onEdit?: () => void;
}) {
  return (
    <div data-row className={`flex items-center ${ROW.gap} ${ROW.pad} ${ROW.still}`}>
      <span className={`flex min-w-0 grow flex-col items-start text-left ${SPACE.hair}`}>
        <span className={TYPE.note}>{label}</span>
        <span className={`flex min-w-0 items-center ${SPACE.tight} ${TYPE.body}`}>{value}</span>
        {under ? <span className={TYPE.note}>{under}</span> : null}
      </span>
      {onEdit ? (
        /*
          ⚠️ AN ICON, NOT THE WORD "CHANGE". Every row on a settings card carries
          one, so the word is the same six characters repeated down the whole
          column — a rail of noise that the eye has to read past to reach the
          values, which are the reason the screen exists. The name is on the
          control for anybody not looking at it.
        */
        <span className="shrink-0">
          <Hint says={`Change ${label.toLowerCase()}`}>
            <Button
              variant="ghost"
              isIconOnly
              aria-label={`Change ${label.toLowerCase()}`}
              onPress={onEdit}
            >
              <Pencil aria-hidden="true" />
            </Button>
          </Hint>
        </span>
      ) : null}
    </div>
  );
}

/**
 * A person, with what last happened between you.
 *
 * ⚠️ THE TRAILING META IS TIME, NOT AN ACTION. A list of people is scanned for
 * "when", and putting a button there makes every row a decision.
 */
export function PersonRow({ name, under, when, unread, aside, goes, face, onOpen }: {
  readonly name: string;
  readonly under?: string;
  readonly when?: string;
  readonly unread?: number;
  /**
   * ⚠️ THE CORNER'S THIRD SHAPE, FOR A STATE RATHER THAN A COUNT. `when` and
   * `unread` cover a conversation; a row that is a WORKSPACE has neither and
   * does have a standing — "needs attention" is not a number and not a time.
   * Drawn last, so time then count then state reads left to right.
   */
  readonly aside?: React.ReactNode;
  /**
   * ⚠️ WHETHER TO PROMISE WHAT IS BEHIND IT. A roster row opens a person and
   * its corner is a TIME, so a chevron there would be a third thing in a corner
   * that already has two. A row that is purely a destination — a workspace in a
   * list of workspaces — has an empty corner and sits beside rows that do draw
   * one, and the missing chevron reads as the row being different rather than
   * as the corner being busy.
   */
  readonly goes?: boolean;
  /** ⚠️ WHO OR WHAT, NOT A PICTURE — see `Identity` and `face.tsx`. */
  readonly face?: FaceOf;
  readonly onOpen: () => void;
}) {
  return (
    <Button data-row variant="ghost" className={`justify-start ${ROW.free} ${ROW.wrap} ${ROW.flush} ${ROW.press} ${ROW.tap}`} onPress={onOpen}>
      <span className={`flex w-full items-center ${ROW.gap} ${ROW.pad} ${ROW.tap}`}>
        <Face of={face} name={name} />
        <Body label={name} under={under} />
        {/* ⚠️ `Chip`, NOT `Badge`, AND THE DIFFERENCE IS NOT COSMETIC. A HeroUI
            `Badge` is POSITIONED — it expects a `Badge.Anchor` around the thing
            it marks. Standing alone it takes itself out of the flow, so the
            count landed on top of the time beside it instead of under it. The
            library's own docs say to use `Chip` for a standalone label; this is
            the one place in the tree that did not. */}
        {/* ⚠️ ON ONE LINE, NOT STACKED. Two lines of trailing meta need more
            height than the row has, so the count sat on the separator below it —
            and a row that grows to fit its own corner breaks the rhythm of every
            row beside it. Time then count, in the reading direction. */}
        <span className={`flex shrink-0 items-center ${SPACE.tight}`}>
          {when ? <span className={TYPE.note}>{when}</span> : null}
          {unread ? (
            <Chip color="accent" variant="primary" size="sm">
              <Chip.Label>{unread}</Chip.Label>
            </Chip>
          ) : null}
          {aside}
          {goes ? <span aria-hidden="true" className={TYPE.note}>›</span> : null}
        </span>
      </span>
    </Button>
  );
}

/**
 * A named thing and an amount.
 *
 * ⚠️ `tabular-nums` VIA `TYPE.label`'s SIBLING — see `TYPE.figure`. A column of
 * proportional digits ripples, and the reader ends up doing the arithmetic on
 * the ripple rather than on the values.
 */
export function AmountRow({ icon, face, label, under, amount, aside, mark, tone = "neutral", onOpen }: RowBase & {
  /**
   * ⚠️ A NODE, BECAUSE AN AMOUNT IS NOT ALWAYS A STRING. A credit figure wears a
   * currency mark that is drawn rather than typed (`Credits`), and a row that
   * only took text would force every such balance to be assembled beside this
   * component instead of inside it — which is how one list ends up with two
   * grammars for the same column.
   */
  readonly amount: React.ReactNode;
  /**
   * ⚠️ AFTER THE AMOUNT, AND IT IS A CONTROL RATHER THAN A SECOND FACT. A price
   * list somebody maintains needs a way to take a row off the shelf, and the
   * alternative was a third column on a phone or a card per item.
   */
  readonly aside?: React.ReactNode;
  /**
   * ⚠️ THE EXCEPTION, AND IT GOES BEFORE THE AMOUNT SO THE AMOUNTS LINE UP.
   * Everything after the growing label is packed to the right, so anything that
   * appears on one row in four and sits AFTER the amount pushes that row's
   * amount left by its own width — measured on the price list, where comparing
   * the four numbers is the entire reason they are in a column.
   *
   * ⚠️ WHICH SIDE A THING GOES ON IS DECIDED BY HOW OFTEN IT APPEARS, NOT BY
   * WHETHER IT IS A CHIP OR A BUTTON. `aside` is for what every row of a list
   * has; this is for what one row has — a state chip, and equally a control
   * that only some rows can offer. A run's "Unfreeze" belongs to the frozen
   * item alone and went in `aside`, which moved that row's verdict out of the
   * column the other three were read in.
   */
  readonly mark?: React.ReactNode;
  readonly tone?: Tone;
  readonly onOpen?: () => void;
}) {
  const inner = (
    <span className={`flex w-full items-center ${ROW.gap} ${ROW.pad} ${ROW.tap}`}>
      <Lead icon={icon} face={face} />
      <Body label={label} under={under} />
      {mark}
      <span className={`shrink-0 ${TYPE.label} tabular-nums`} data-ink={tone}>{amount}</span>
      {aside}
      {onOpen ? <span aria-hidden="true" className={TYPE.note}>›</span> : null}
    </span>
  );
  return onOpen
    ? <Button data-row variant="ghost" className={`justify-start ${ROW.free} ${ROW.wrap} ${ROW.flush} ${ROW.press} ${ROW.tap}`} onPress={onOpen}>{inner}</Button>
    : <div data-row className="flex w-full">{inner}</div>;
}

/* ---------------------------------------------------------------- clusters --- */

/**
 * THE CIRCULAR SHORTCUTS UNDER A HERO.
 *
 * ⚠️ THREE OR FOUR, AND THEY ARE THE THINGS SOMEBODY CAME TO DO IN A HURRY —
 * report a fraud, replace a card, stop a device. A fifth turns a row of
 * decisions into a menu, and a menu belongs in a `Group`.
 */
export function QuickActions({ actions }: {
  readonly actions: readonly {
    readonly id: string; readonly label: string;
    readonly icon: React.ReactNode; readonly onDo: () => void;
  }[];
}) {
  /* ⚠️ THE CLUSTER'S OWN CONTAINER AND THE COLUMN'S OWN WIDTH, so a placeholder
     cannot wrap at a different point than the row it stands in. What it cannot
     share is the circle — see `QUICK_CIRCLE`. */
  const bones = useBones();
  return (
    /* ⚠️ Four must FIT a phone. At 80px wide with a 24px gap they came to 392px
       against 390 available, so the fourth wrapped to its own line — which reads
       as a mistake rather than as a row. */
    /* ⚠️ NO VERTICAL PADDING OF ITS OWN. A cluster is spaced by whatever it sits
       in; carrying its own pad on top of that container's gap is how a hero came
       to have eighty pixels of nothing under it. */
    <div className={`flex flex-wrap items-start justify-center ${SPACE.snug}`}>
      {actions.slice(0, 4).map((a) => (
        <div key={a.id} className={`flex w-16 flex-col items-center ${SPACE.tight}`}>
          {bones
            ? (
              <>
                {/* ⚠️ THE CIRCLE'S OWN DIAMETER, NAMED ONCE. A bar guessed at
                    `size-10` beside a `lg` button is 4px short, four times over,
                    and the row under it lands high — so the size comes from the
                    same token the control takes. */}
                <Skeleton className={`${QUICK_CIRCLE} rounded-full`} />
                <span className={`${TYPE.note} w-full text-center`}>
                  <Skeleton className="block h-[1lh] w-full rounded-full" />
                </span>
              </>
            )
            : (
          /* no-hint: the label is a sibling under the circle, so a tooltip
             would float the same word an inch above where it already is. */
          <Button
            /* ⚠️ `isIconOnly` MAKES IT A CIRCLE. Without it a `Button` is
               `w-fit px-4`, so a 22px glyph comes out in a 54×44 lozenge — four
               of them in a row read as four buttons somebody forgot to finish,
               against the row of equal circles this is modelled on. */
            isIconOnly
            size={CROWN_SIZE}
            /* ⚠️ `tertiary`, NOT `secondary`, AND THE DIFFERENCE IS THE WHOLE
               ICON PROBLEM. `.button--secondary` sets
               `--button-fg: var(--accent-soft-foreground)` — so every glyph in
               the product was tinted by the brand, and a tinted glyph is one
               that stops reading the moment the ground behind it moves. A mark
               that is timeless is a NEUTRAL mark on a translucent ground; the
               colour belongs to the ground, never to the thing on it.
               `tertiary` is the same fill with no foreground override. */
            variant="tertiary"
            /* ⚠️ NO GLASS, AND ITS PRESENCE HERE WAS A RULE BROKEN TWICE OVER.
               Glass is for CHROME — the crown, the island — things content
               passes UNDER, which is what the blur exists to keep legible.
               These chips scroll WITH the page: nothing ever moves behind
               them, so the blur bought nothing and the translucent fill cost
               plenty — 76% of a grey tier laid over the light ambience is a
               desaturated wash on a coloured ground, which the eye reads as
               grime rather than as a surface. An in-flow control is OPAQUE,
               from the tier ladder, where its visibility is guarded
               arithmetic rather than whatever the gradient behind it does. */
            aria-label={a.label}
            onPress={a.onDo}
          >{a.icon}</Button>
              )}
          {bones ? null : <span className={`${TYPE.note} text-center`}>{a.label}</span>}
        </div>
      ))}
    </div>
  );
}

/**
 * ⚠️ `auto-fit` WITH A MINIMUM, NOT A COLUMN COUNT. A grid declared as "four
 * across" needs a breakpoint for every width it does not fit, and is wrong on
 * the first device nobody tested.
 */
/**
 * ⚠️ ONE GRID, NAMED, BECAUSE THE PLACEHOLDER USED TO WRITE ITS OWN. `TilesWaiting`
 * laid out at `minmax(min(8rem, 100%), 1fr)` against this `min(6rem, 45%)`, so
 * six tiles measured 236px in three columns and waited behind 360px in two —
 * half a screen taller, in the wrong shape, and the page jumped 124px when the
 * content landed. Two copies of a grid is two grids.
 */
const TILES = "repeat(auto-fit, minmax(min(6rem, 45%), 1fr))";

/**
 * ⚠️ AND A DEEP TILE NEEDS A WIDER COLUMN, WHICH IS THE HALF THAT IS EASY TO
 * FORGET. A name, a line under it and a state chip in a 110px column is three
 * words on three lines each — so the shallow grid puts three across and this one
 * puts two, which is what every reference does with a device or a routine.
 *
 * ⚠️ AND THE FLOOR IS MEASURED AGAINST THE CARD, NOT THE SCREEN. The reading
 * column is 326px at a 390px phone, so a 10rem floor asks for 332 with the gap
 * and `auto-fit` answers with ONE column — a two-across grid that is one-across
 * on every phone, which looks like a deliberate list rather than a bug.
 */
const DEEP_TILES = "repeat(auto-fit, minmax(min(8.5rem, 100%), 1fr))";

/**
 * ONE CELL OF A `TileGrid` — and the four optional halves are what make it a
 * block rather than a labelled glyph.
 *
 * ⚠️ THE GRID USED TO BE A MARK AND A WORD, WHICH IS ONE THING A TILE CAN BE
 * AND NOT THE COMMON ONE. Every grid worth copying is a mark or a PHOTOGRAPH,
 * a control in the corner, a name, a line saying what it is, and a foot saying
 * what state it is in — a device, a routine, a saved report. Built out of the
 * old tile, each of those needed a `<div>` at the call site, and five call sites
 * produce five spacings.
 */
export interface TileSpec {
  readonly id: string;
  readonly label: string;
  /** ⚠️ One line under the name — what it is, never what it does. */
  readonly under?: string;
  readonly icon?: React.ReactNode;
  /**
   * ⚠️ A PICTURE OF THE THING, WHICH BEATS A PICTURE OF THE KIND. Wins over
   * `icon` where both are given: a grid of photographs is scanned, a grid of
   * identical category marks is read.
   */
  readonly face?: FaceOf;
  /**
   * ⚠️ THE CORNER CONTROL, AND IT IS WHY THE TILE IS NOT A BUTTON ANY MORE. A
   * switch inside a `<button>` is a control inside a control: the press lands on
   * whichever the browser decided, invalid markup either way, and on a phone the
   * toggle and the destination are the same 44px. The tile's body is the
   * destination and this stands beside it.
   */
  readonly control?: React.ReactNode;
  /** ⚠️ The state, at the foot — a chip, a count, an amount. */
  readonly foot?: React.ReactNode;
  readonly onOpen: () => void;
}

/**
 * ⚠️ THE DEPTH IS DECIDED BY THE TILES, NOT BY A PROP, so a grid and the bones
 * it waits behind cannot disagree — which is the fault `TILE.tall` was made a
 * token to prevent. A caller that could pass `deep` could pass the wrong one.
 */
const deepIn = (tiles: readonly TileSpec[]): boolean =>
  tiles.some((t) => t.under || t.foot || t.face || t.control);

export function TileGrid({ tiles }: { readonly tiles: readonly TileSpec[] }) {
  /* ⚠️ THE SAME CONTAINER, SO THE COLUMNS CANNOT DISAGREE. What a placeholder
     has to get right is where the content will BE, and for a grid that is the
     column count — which is a property of this element and nothing else. */
  const bones = useBones();
  const deep = deepIn(tiles);
  return (
    <div
      className={`grid ${SPACE.snug}`}
      style={{ gridTemplateColumns: deep ? DEEP_TILES : TILES }}
    >
      {bones
        ? tiles.map((t) => (
          /* ⚠️ TWO ELEMENTS RATHER THAN A TERNARY IN THE CLASS, so the height
             is a token a reader — and `heroui.test.mjs` — can resolve. A
             placeholder whose geometry is computed is a placeholder nothing can
             check against the thing it stands in for. */
          deep
            ? <Skeleton key={t.id} className={`${TILE.deep} w-full rounded-2xl`} />
            : <Skeleton key={t.id} className={`${TILE.tall} w-full rounded-2xl`} />
        ))
        : tiles.map((t) => (
          /*
            ⚠️ A WRAPPER, BECAUSE THE CONTROL MUST NOT BE INSIDE THE BUTTON — see
            `TileSpec.control`. The fill and the corner belong to the wrapper so
            the tile is ONE surface with two pressable regions on it, rather than
            a control floating over a second one.
          */
          <div
            key={t.id}
            /* ⚠️ `min-w-0` OR THE LONGEST WORD DECIDES THE COLUMN COUNT. A grid
               item's `min-width` is `auto`, which is its MIN-CONTENT — so one
               tile whose line under reads "Everything written here" set a
               248px floor and `auto-fit` answered with one column, on a grid
               told to fit at 160. The symptom is a two-across grid that is
               one-across on exactly the screens that have descriptions. */
            className={`relative flex ${deep ? TILE.deep : TILE.tall} w-full min-w-0 flex-col`}
          >
            <Button
              /* ⚠️ `tertiary` — the glyph is never brand-coloured. See QuickActions. */
              variant="tertiary"
              /* ⚠️ THE FILL IS THE SURFACE TIER, NOT THE CONTROL TIER — a tile
                 is a card you press. The rule lives in `ambience.ts` beside the
                 chip and the pill, for the same D7 reason.

                 ⚠️ AND IT IS ON THE BUTTON RATHER THAN ON THE WRAPPER, because
                 the rule sets `--button-bg`: moved out to the div it matched an
                 element that reads no such variable, and the whole grid came
                 out as unfilled text. */
              data-tile="true"
              /* ⚠️ `w-full` OR THE CELL IS EQUAL AND THE TILE IS NOT. `.button`
                 is `w-fit`, so a grid of equal 1fr columns held tiles sized to
                 their own labels — "Beds", "Staff" and "Rounds" came out 162,
                 156 and 198 wide, in a grid that had already made room for three
                 identical ones. */
              /* ⚠️ NO `ROW.free` HERE, AND ITS PRESENCE IS WHAT BROKE THE GRID.
                 `h-auto` and `h-full` are the same property at the same
                 specificity, so the later rule won and every tile sized to its
                 own content: measured at 148, 127, 80 and 83 tall inside four
                 192px cells, which is why half a grid read as boxes and half as
                 lozenges. A tile is not a row and does not want a row's escape
                 from the library's fixed height — it wants its cell. */
              className={`size-full flex-col items-start justify-start ${SPACE.tight}`
                + ` ${ROW.wrap} ${TILE_PAD} text-left`}
              onPress={t.onOpen}
            >
              {/* ⚠️ THE MARK CARRIES THE TILE. A 16px glyph in a 96px square is
                  a tile that is mostly empty, and a grid of them reads as
                  placeholder art. `.button` sizes its own svgs, so the size is
                  set on the box. */}
              {t.face
                ? <Face of={t.face} name={t.label} size="panel" />
                : (
                  <span aria-hidden="true" style={{ ["--icon" as string]: `${ICON.tile}px` }}>
                    {t.icon}
                  </span>
                )}
              {/* ⚠️ THE NAME SITS AT THE FOOT OF WHAT IS LEFT, so a tile with a
                  line under it and one without still align their names — a grid
                  where every second label is 20px higher is what "some of these
                  have a description" looks like when the mark is top-aligned and
                  nothing claims the slack. */}
              <span className={`mt-auto flex min-w-0 flex-col ${SPACE.hair}`}>
                {/* ⚠️ `label`, NOT `note`. A tile's word IS the tile — muting it
                    makes a grid of grey words under marks nobody can name. */}
                <span className={TYPE.label}>{t.label}</span>
                {t.under ? <span className={TYPE.note}>{t.under}</span> : null}
                {t.foot}
              </span>
            </Button>
            {/*
              ⚠️ A SIBLING OF THE BUTTON, NEVER A CHILD — see `TileSpec.control`.
              A switch inside a `<button>` is a control inside a control: the
              press lands on whichever the browser decided, it is invalid markup
              either way, and on a phone the toggle and the destination are the
              same 44px.
            */}
            {t.control
              ? <div className="absolute right-2 top-2 z-10 flex">{t.control}</div>
              : null}
          </div>
        ))}
    </div>
  );
}

/*
  ⚠️ `Nothing` MOVED TO `state.tsx`, and the move is the argument. It lived here
  beside the surfaces, on a `Card`, with its own note saying it must never be
  shown while we are still looking — a rule a component cannot keep about
  itself, because whoever renders it decides when. It is one of four outcomes
  now, and `Await` is what chooses between them.
*/

/* ------------------------------------------------------------------ money --- */

/**
 * AN AMOUNT, WITH ITS FRACTION SET SMALLER THAN ITS WHOLE.
 *
 * ⚠️ THIS IS THE ONE TYPOGRAPHIC DEVICE THAT MAKES A BALANCE READ AS A BALANCE.
 * `€1,051.70` at one size is a number; `€1,051` with a smaller `.70` is a sum of
 * money, because the eye lands on the part that matters and treats the rest as
 * precision. Every product that handles money well does this, and it is
 * invisible until you put the two side by side.
 *
 * ⚠️ AND IT IS `tabular-nums` WHEREVER IT APPEARS, so a column of amounts lines
 * up on the decimal. Proportional digits make a list ripple, and the reader ends
 * up comparing the ripple rather than the values.
 *
 * ⚠️ THE SIGN IS A TONE, NOT A COLOUR. Money coming in is `success`, going out
 * is neutral — never red, which is for something being wrong. A product that
 * paints every outgoing payment red tells somebody their groceries were a fault.
 */
export function Money({ minor, currency, size = "display", tone = "neutral", count = false }: {
  /** ⚠️ Minor units, as an integer. A float here is a rounding error later. */
  readonly minor: number;
  /**
   * ⚠️ THE ISO CODE, NOT A SYMBOL. It defaulted to `"€"` — so every call site
   * that forgot it printed euros over whatever the workspace is actually billed
   * in, and there is no reading of a price in the wrong currency that is not a
   * lie. `Intl` turns the code into the symbol the READER expects, on the side
   * they expect it, which no default here could do.
   */
  readonly currency: string;
  /**
   * ⚠️ `display` IS THE DEFAULT BECAUSE THAT IS WHERE MONEY GOES. Every call site
   * in the product puts this in a hero, and defaulting to the row size meant the
   * number a whole screen was built around rendered at the same 24px as the
   * heading above it. A default that is wrong at every call site is not a
   * default, it is a step everybody has to remember.
   */
  readonly size?: "display" | "figure" | "label";
  readonly tone?: Tone;
  /**
   * ⚠️ OFF UNLESS ASKED, EVEN THOUGH THIS DEFAULTS TO `display`. An amount in a
   * hero is the one number a screen is about and should count; the same
   * component renders every row in a transaction list, and twelve of those
   * counting at once is the noise `tally.tsx` exists to refuse. The size cannot
   * decide it either — a `display` amount inside a card is still not the screen.
   */
  readonly count?: boolean;
}) {
  const shown = useShown();
  /*
    ⚠️ THE PIECES COME FROM `Intl`, NOT FROM ARITHMETIC. This split the amount
    with `% 100` and pinned the symbol in front — which is wrong for the yen
    (no minor unit), wrong in Germany (symbol last, comma for a decimal), and
    wrong for a Briton reading a dollar price (`US$`, not `$`). See
    `sayMoneyParts`.
  */
  const part = sayMoneyParts(shown, minor, currency);
  const sign = part.sign || (tone === "success" && minor > 0 ? "+" : "");
  const big = size === "display" ? TYPE.display : size === "figure" ? TYPE.figure : TYPE.label;

  /* ⚠️ THE GROUPED WHOLE IS WHAT COUNTS, SO THE TALLY IS HANDED THE STRING. It
     used to be given a number and told to `toLocaleString()` it — the browser's
     convention rather than the reader's, which is the whole bug one layer
     down. */
  return (
    <span className={`${big} tabular-nums`} data-ink={tone}>
      {sign}{part.before}
      {/* ⚠️ THE WHOLE UNITS COUNT AND THE FRACTION DOES NOT. Cents ticking
          through 99 values is a slot machine; the pounds are what somebody is
          reading and the pence are precision that should simply be there. */}
      <Tally value={Math.floor(Math.abs(minor) / 100)} format={() => part.whole} count={count} />
      {/* ⚠️ EMPTY FOR A CURRENCY WITH NO MINOR UNIT, rather than `.00` — a yen
          price with two decimals is a price nobody in Japan has ever seen. */}
      {part.fraction ? <span className={TYPE.minor}>{part.fraction}</span> : null}
      {part.after}
    </span>
  );
}

/* ------------------------------------------------------------- more rows --- */

/**
 * A VALUE SOMEBODY CAME TO COPY.
 *
 * ⚠️ AN IBAN IS NOT READ, IT IS TAKEN. Rendering one as ordinary text makes
 * somebody select twenty characters on a phone, and they will get it wrong. The
 * value is the control.
 */
export function CopyRow({ label, value, onCopy }: {
  readonly label: string;
  readonly value: string;
  readonly onCopy: (value: string) => void;
}) {
  return (
    <div data-row className={`flex items-center ${ROW.gap} ${ROW.pad} ${ROW.still}`}>
      <span className={`flex min-w-0 grow flex-col items-start text-left ${SPACE.hair}`}>
        <span className={TYPE.note}>{label}</span>
        {/* ⚠️ MONO, BECAUSE THIS IS AN IDENTIFIER RATHER THAN A WORD. A seal
            number or an IBAN is copied, quoted down a phone and compared
            character by character, which is the one job a fixed-width face is
            genuinely better at — see `TYPE.code`. */}
        <span className={`${TYPE.code} break-all`}>{value}</span>
      </span>
      <span className="shrink-0">
        <Button variant="ghost" aria-label={`Copy ${label.toLowerCase()}`} onPress={() => onCopy(value)}>
          Copy
        </Button>
      </span>
    </div>
  );
}

/**
 * SOMETHING TRUE THAT IS NOT A CONTROL.
 *
 * ⚠️ THIS IS THE ONE PLACE PROSE BELONGS, AND IT TAKES ITS FULL STOPS. A
 * deposit-protection notice is two sentences and reads as sentences; a caption
 * under a label is not, and takes none. The distinction is what `tone.ts`
 * enforces, and having a component for each is what stops somebody splitting the
 * difference.
 */
export function NoteRow({ icon, face, children }: {
  readonly icon?: React.ReactNode;
  readonly face?: FaceOf;
  readonly children: React.ReactNode;
}) {
  return (
    /* ⚠️ `note`, NOT `body`, BECAUSE IT IS ONE. At body size a note sits INSIDE
       a card of rows whose own second lines are notes — so the explanation was
       louder than the rows it explains, and a card ended in what reads as a
       paragraph of prose. A note is the quiet line at the bottom. */
    <div data-row className={`flex items-start ${ROW.gap} ${ROW.pad}`}>
      <Lead icon={icon} face={face} />
      <p className={TYPE.note}>{children}</p>
    </div>
  );
}

/**
 * SOMETHING ON OFFER, WITH THE WAY IN BESIDE IT.
 *
 * ⚠️ A TRAILING BUTTON RATHER THAN A CHEVRON, AND THE DIFFERENCE IS A PROMISE. A
 * chevron says "there is more to read"; a button says "this starts now". Using
 * one for the other is how somebody ends up in a flow they were browsing.
 */
export function OfferRow({ icon, face, label, under, offer }: RowBase & {
  readonly offer: { readonly label: string; readonly onDo: () => void };
}) {
  return (
    <div data-row className={`flex items-center ${ROW.gap} ${ROW.pad} ${ROW.tap}`}>
      <Lead icon={icon} face={face} />
      <Body label={label} under={under} />
      <span className="shrink-0">
        <Button variant="secondary" onPress={offer.onDo}>{offer.label}</Button>
      </span>
    </div>
  );
}

/**
 * ONE OF THE THINGS THAT HAS TO HAPPEN.
 *
 * ⚠️ NO CHEVRON AND NO CONTROL: a step is a statement, and making it look
 * pressable invites somebody to press it and find nothing. What makes it a list
 * rather than prose is that each item is one thing, with its own qualifier
 * underneath.
 */
export function StepRow({ icon, face, label, under }: RowBase) {
  return (
    <div data-row className={`flex items-start ${ROW.gap} ${ROW.pad} ${ROW.still}`}>
      <Lead icon={icon} face={face} />
      <Body label={label} under={under} />
    </div>
  );
}

/**
 * ⚠️ THE WAY OUT OF A TRUNCATED LIST, AT THE BOTTOM OF THE CARD THAT TRUNCATED
 * IT. Anywhere else and it is a link to somewhere; here it is the answer to the
 * question the list just raised.
 */
export function SeeAll({ label = "See all", onOpen }: {
  readonly label?: string; readonly onOpen: () => void;
}) {
  return (
    <div className="flex justify-center">
      <Button variant="ghost" onPress={onOpen}>{label}</Button>
    </div>
  );
}



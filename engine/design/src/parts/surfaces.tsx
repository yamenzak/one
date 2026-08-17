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
import { TYPE } from "../tokens/type.js";
import {
  CARD_ROWS, CONTROL_SHARE, CROWN_SIZE, HEAD_GAP, ICON, INSET, LEAD, NUDGE, PAD, ROW, SPACE,
  TILE,
} from "../tokens/metrics.js";
import type { Inset } from "../tokens/metrics.js";
import { ARRIVE, arriveAt } from "../tokens/motion.js";
/* ⚠️ ONE MOUNTER — `scene.test.mjs` keeps `worldCss` and `data-field` to
   `page.tsx`, and `useScenery` is the door it hands out. A card painting its own
   would get the picture and none of what the engine learns next. */
import { useScenery } from "../frame/page.js";
import type { Sky } from "../scene/index.js";
import { Face, type FaceOf } from "./face.js";
import { Hint } from "./beside.js";
import { Tally } from "./tally.js";

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
  /** One line under the label, for a group whose consequence is not obvious. */
  readonly under?: string;
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
export function Group({ label, under, face, at, sky, seedling, children }: GroupProps) {
  const own = useScenery({ sky, seedling, reach: "card" });
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
      {label ? (
        /* ⚠️ THE MARK IS BESIDE THE HEADING BLOCK, NOT ABOVE IT, so the label
           and its line under stay one thing and the mark reads as belonging to
           both. `chip` because a heading is not a row — a 40px plate here would
           be taller than the two lines beside it. */
        <div className={`flex items-center ${ROW.gap}`}>
          {face ? <Face of={face} name={label} size="chip" /> : null}
          <div className={`flex min-w-0 flex-col ${SPACE.hair}`}>
            <h2 className={TYPE.section}>{label}</h2>
            {under ? <p className={TYPE.note}>{under}</p> : null}
          </div>
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
          <div className="flex flex-col">{children}</div>
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
export function Place({ name, said, foot, face, tone = "neutral", sky = "glow", at, onOpen }: {
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
  readonly tone?: Tone;
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
      <Card {...(own.css ? own.attrs : {})} data-tone={tone}>
        {own.field}
        <Card.Content>
          {/* ⚠️ THE WHOLE CARD IS THE TARGET, and it is a real Button — the
              focus ring, the pressed state and every keyboard behaviour come
              with it, none of which is visible in a screenshot and all of which
              is visible to somebody not using a mouse. */}
          <Button
            variant="ghost"
            className={`w-full justify-start ${ROW.free} ${ROW.wrap} ${ROW.flush}`}
            onPress={onOpen}
          >
            <span className={`flex w-full min-w-0 flex-col items-start text-left ${SPACE.tight} ${PAD}`}>
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
  /** ⚠️ ONE LINE, AND NO FULL STOP — see `tone.ts`. */
  readonly under?: string;
}

/**
 * ⚠️ `items-start text-left` IS THE FIX FOR THE RAGGED COLUMN. HeroUI's `Button`
 * centres its children, so a two-line row rendered its label centred over its
 * description — every list in the product had a soft, wandering left edge, and
 * it read as amateur without being nameable. `justify-start` on the button is
 * not enough: the block itself has to align its own lines.
 */
const Body = ({ label, under }: { readonly label: string; readonly under?: string }) => (
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
  /** A count, a status, a value — whatever sits before the chevron. */
  readonly aside?: React.ReactNode;
  readonly isDisabled?: boolean;
}

export function NavRow({ icon, face, label, under, aside, onOpen, isDisabled }: NavRowProps) {
  return (
    <Button variant="ghost" className={`w-full justify-start ${ROW.free} ${ROW.wrap} ${ROW.flush} ${ROW.tap}`} isDisabled={isDisabled} onPress={onOpen}>
      <span className={`flex w-full items-center ${ROW.gap} ${ROW.pad} ${ROW.tap}`}>
        <Lead icon={icon} face={face} />
        <Body label={label} under={under} />
        <span className={`flex shrink-0 items-center ${SPACE.tight}`}>
          {aside}
          {/* ⚠️ The chevron is the promise that something is behind this. A row
              without one that navigates is a row people do not press. */}
          <span aria-hidden="true" className={TYPE.note}>›</span>
        </span>
      </span>
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
      variant="ghost"
      className={`w-full justify-start ${ROW.free} ${ROW.wrap} ${ROW.flush} ${ROW.tap}`}
      onPress={onDo}
    >
      <span
        className={`flex w-full items-center ${ROW.gap} ${ROW.pad} ${ROW.tap}${tone === "danger" ? " text-danger" : ""}`}
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
    <div className={`flex w-full ${ROW.pad} ${ROW.tap} items-center`}>
    <Switch
      /* ⚠️ `justify-between` IS THE WHOLE FIX. Without it the content takes the
         full width and the control wraps to a second line — which reads as a
         broken row rather than as a switch. That is what it looked like the
         first time it was RENDERED rather than described. */
      className={`w-full flex-row justify-between items-center ${ROW.gap}`}
      isSelected={value}
      isDisabled={isDisabled}
      onChange={onChange}
    >
      <Switch.Content className="grow">
        <span className={`flex items-center ${ROW.gap}`}>
          <Lead icon={icon} face={face} />
          <Label><Body label={label} under={under} /></Label>
        </span>
      </Switch.Content>
      <Switch.Control><Switch.Thumb /></Switch.Control>
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
    <div className={`flex flex-wrap items-center ${ROW.gap} ${ROW.pad} ${ROW.tap}`}>
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
      <span className={wide ? "w-full" : `shrink-0 ${CONTROL_SHARE}`}>{children}</span>
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
    <div className={`flex items-center ${ROW.gap} ${ROW.pad} ${ROW.still}`}>
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
    <Button variant="ghost" className={`w-full justify-start ${ROW.free} ${ROW.wrap} ${ROW.flush} ${ROW.tap}`} onPress={onOpen}>
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
export function AmountRow({ icon, face, label, under, amount, aside, tone = "neutral", onOpen }: RowBase & {
  readonly amount: string;
  /**
   * ⚠️ AFTER THE AMOUNT, AND IT IS A CONTROL RATHER THAN A SECOND FACT. A price
   * list somebody maintains needs a way to take a row off the shelf, and the
   * alternative was a third column on a phone or a card per item.
   */
  readonly aside?: React.ReactNode;
  readonly tone?: Tone;
  readonly onOpen?: () => void;
}) {
  const inner = (
    <span className={`flex w-full items-center ${ROW.gap} ${ROW.pad} ${ROW.tap}`}>
      <Lead icon={icon} face={face} />
      <Body label={label} under={under} />
      <span className={`shrink-0 ${TYPE.label} tabular-nums`} data-tone={tone}>{amount}</span>
      {aside}
      {onOpen ? <span aria-hidden="true" className={TYPE.note}>›</span> : null}
    </span>
  );
  return onOpen
    ? <Button variant="ghost" className={`w-full justify-start ${ROW.free} ${ROW.wrap} ${ROW.flush} ${ROW.tap}`} onPress={onOpen}>{inner}</Button>
    : <div className="flex w-full">{inner}</div>;
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
          {/* no-hint: the label is a sibling under the circle, so a tooltip
              would float the same word an inch above where it already is. */}
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
          <span className={`${TYPE.note} text-center`}>{a.label}</span>
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
export function TileGrid({ tiles }: {
  readonly tiles: readonly {
    readonly id: string; readonly label: string;
    readonly icon: React.ReactNode; readonly onOpen: () => void;
  }[];
}) {
  return (
    <div
      className={`grid ${SPACE.snug}`}
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(6rem, 45%), 1fr))" }}
    >
      {tiles.map((t) => (
        <Button
          key={t.id}
          /* ⚠️ `tertiary` — the glyph is never brand-coloured. See QuickActions. */
          variant="tertiary"
          /* ⚠️ AND THE FILL IS THE SURFACE TIER, NOT THE CONTROL TIER — a tile
             is a card you press. The rule lives in `ambience.ts` beside the
             chip and the pill, for the same D7 reason. */
          data-tile="true"
          /* ⚠️ `w-full` OR THE CELL IS EQUAL AND THE TILE IS NOT. `.button` is
             `w-fit`, so a grid of equal 1fr columns held tiles sized to their
             own labels — "Beds", "Staff" and "Rounds" came out 162, 156 and 198
             wide, in a grid that had already made room for three identical
             ones. A row of tiles at three widths is the same fault as a crown of
             lozenges: the container was right and nothing filled it. */
          className={`w-full flex-col h-28 ${SPACE.tight}`}
          onPress={t.onOpen}
        >
          {/* ⚠️ THE MARK CARRIES THE TILE. A 16px glyph in a 96px square is a
              tile that is mostly empty, and a grid of them reads as placeholder
              art. `.button` sizes its own svgs, so the size is set on the box. */}
          <span aria-hidden="true" style={{ ["--icon" as string]: `${ICON.tile}px` }}>
            {t.icon}
          </span>
          {/* ⚠️ `label`, NOT `note`. A tile's word IS the tile — muting it makes
              a grid of grey words under marks nobody can name. */}
          <span className={TYPE.label}>{t.label}</span>
        </Button>
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
export function Money({ amount, currency = "€", size = "display", tone = "neutral", count = false }: {
  /** ⚠️ Minor units, as an integer. A float here is a rounding error later. */
  readonly amount: number;
  readonly currency?: string;
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
  const sign = amount < 0 ? "−" : tone === "success" ? "+" : "";
  const part = String(Math.abs(amount) % 100).padStart(2, "0");
  const big = size === "display" ? TYPE.display : size === "figure" ? TYPE.figure : TYPE.label;

  return (
    <span className={`${big} tabular-nums`} data-tone={tone}>
      {sign}{currency}
      {/* ⚠️ THE WHOLE UNITS COUNT AND THE FRACTION DOES NOT. Cents ticking
          through 99 values is a slot machine; the pounds are what somebody is
          reading and the pence are precision that should simply be there. */}
      <Tally
        value={Math.floor(Math.abs(amount) / 100)}
        format={(n) => n.toLocaleString()}
        count={count}
      />
      <span className={TYPE.minor}>.{part}</span>
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
    <div className={`flex items-center ${ROW.gap} ${ROW.pad} ${ROW.still}`}>
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
    <div className={`flex items-start ${ROW.gap} ${ROW.pad}`}>
      <Lead icon={icon} face={face} />
      <p className={TYPE.body}>{children}</p>
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
    <div className={`flex items-center ${ROW.gap} ${ROW.pad} ${ROW.tap}`}>
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
    <div className={`flex items-start ${ROW.gap} ${ROW.pad} ${ROW.still}`}>
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


/* ------------------------------------------------------------------ sheet --- */

/**
 * ONE CARD, CENTRED, WITH A HEADING AND A COLUMN UNDER IT.
 *
 * ⚠️ IT WAS AN APP'S OWN FURNITURE, IN A FILE CALLED `ui.tsx`, and that file's
 * own header recorded that two of its three pieces had already left for this
 * package. A titled card with a stacked body is not a fact about any product —
 * it is what a 404, a confirmation and a one-question screen all are — so the
 * third piece was the last of a pattern, not an exception to it.
 *
 * ⚠️ PLACEMENT, NOTHING ELSE. The moment it sets a colour or a radius it becomes
 * a surface a workspace's branding does not reach, and nobody finds out until
 * somebody with a strong brand asks why one page still looks like ours.
 */
export function Sheet({ title, lead, children }: {
  readonly title: string;
  /** One line under the title. What this is, or what just happened. */
  readonly lead?: string;
  readonly children: React.ReactNode;
}) {
  return (
    <Card className="w-full max-w-lg">
      <Card.Header>
        <Card.Title>{title}</Card.Title>
        {lead ? <Card.Description>{lead}</Card.Description> : null}
      </Card.Header>
      <Card.Content>
        {/* ⚠️ THE GAP COMES FROM THE SCALE, NOT FROM HERE. It was `gap-4`, which
            is not a step on it — so a sheet's rows sat a pixel apart from every
            other stack in the product, defensibly, and nobody could point at
            which one was wrong. */}
        <div className={`flex flex-col ${SPACE.snug}`}>{children}</div>
      </Card.Content>
    </Card>
  );
}

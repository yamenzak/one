/**
 * THE LAYOUT — the five archetypes, and the patterns they are assembled from.
 *
 * ⚠️ A SCREEN SAYS WHAT IT IS AND GETS ITS SHAPE. `<Page archetype="crown">`
 * decides the top, the sky, how far the light reaches, whether a section header
 * sits inside its card and what the title looks like. None of those is a prop,
 * because every one of them is the same decision made differently on the screen
 * somebody was not thinking about.
 *
 * ⚠️ THE WRONG TOP ON AN ARCHETYPE IS THROWN, NOT RENDERED. A `Crown` on a list
 * page is a screen about one number that has no number — it renders, it looks
 * plausible in isolation, and it is only wrong next to the four screens it is
 * supposed to match. So each top carries the archetype it belongs to and `Page`
 * refuses the mismatch, the way `Button` refuses a reasonless refusal.
 */

import { createContext, useContext, type ReactNode } from "react";
import { LIMIT, SHAPE, type Archetype } from "../archetype.js";
import { MASKED, type Sky } from "../sky.js";
import { borrow, SIZE, TONE } from "../borrowed.js";
import { Text } from "./primitives.js";

/* ------------------------------------------------------------------ page --- */

/**
 * ⚠️ THE ARCHETYPE TRAVELS DOWN RATHER THAN BEING PASSED ACROSS. A `Section`
 * cannot see what page it is on, which is precisely why "the header goes inside
 * the card only on a feed" was a rule that kept being broken — the information it
 * needed was not where the decision was made.
 */
const PageContext = createContext<Archetype | null>(null);

/** ⚠️ Anything with an archetype-shaped top declares which one it belongs to. */
type Top = { readonly forArchetype: Archetype };

export interface PageProps {
  readonly archetype: Archetype;
  /** ⚠️ A page may name a MASK, never a ground. `pageProblems` is the check. */
  readonly sky?: Sky;
  readonly top?: ReactNode;
  readonly children?: ReactNode;
}

export function Page({ archetype, sky, top, children }: PageProps) {
  const shape = SHAPE[archetype];
  if (!shape) throw new Error(`Page: "${archetype}" is not an archetype`);

  /*
    ⚠️ THE MISMATCH IS FATAL BECAUSE IT IS INVISIBLE. A wrong top renders
    perfectly well and only reads as wrong beside the other four screens — which
    is the one place nobody looks while building one.
  */
  /*
    ⚠️ A FEED HAS AN APP BAR; WHAT IT DOES NOT HAVE IS A HERO. Refusing every
    top was the first version and it was wrong in the direction that matters —
    it made the one archetype whose top IS an app bar unable to have one.
  */
  const declared = (top as { type?: Partial<Top> } | null)?.type?.forArchetype;
  if (declared && archetype === "feed") {
    throw new Error(`Page: a ${declared} hero on a feed — a feed is independent sections under an app bar`);
  }
  if (declared && declared !== archetype) {
    throw new Error(`Page: a ${declared} top on a ${archetype} page — the top is what the screen IS`);
  }

  /* ⚠️ A page may name a MASK; the ground belongs to the shape. */
  const drawn = sky ?? shape.sky;
  const masked = MASKED.includes(drawn);

  return (
    <PageContext.Provider value={archetype}>
      <div data-one="page" data-archetype={archetype}>
        {/*
          ⚠️ THE LIGHT IS BEHIND EVERYTHING AND HAS NO BOTTOM EDGE. `--solid` and
          `--reach` come from the SHAPE, not from the page: how far the light
          survives is a fact about what kind of screen this is.
        */}
        <div
          data-one="sky"
          data-sky={drawn}
          {...(masked ? { "data-masked": "" } : {})}
          aria-hidden="true"
          style={{ "--solid": `${shape.solid}%`, "--reach": `${shape.reach}%` } as Record<string, string>}
        />
        {top ? <div data-one="hero" data-top={shape.top}>{top}</div> : null}
        {/* ⚠️ `body` is the stagger's parent — the entering children are counted
            by nth-CHILD of this element, so it may never gain a wrapper. */}
        <div data-one="body">{children}</div>
      </div>
    </PageContext.Provider>
  );
}

/* -------------------------------------------------------------- app bar --- */

export interface AppBarProps {
  /** ⚠️ Back and close are different promises: one goes up, one abandons. */
  readonly leading?: "back" | "close";
  readonly onLeading?: () => void;
  readonly title?: string;
  readonly action?: ReactNode;
}

/**
 * ⚠️ A CIRCLE IN THE CORNER, NOT A BAR. On a screen with a hero the top belongs
 * to the hero, so the chrome floats over the light instead of drawing a band
 * across it — which is the same rule as §5.4, one element up.
 */
export const AppBar = ({ leading, onLeading, title, action }: AppBarProps) => (
  <div data-one="app-bar">
    {leading ? (
      <button type="button" data-one="app-bar-leading" data-glyph={leading} onClick={onLeading} aria-label={leading === "back" ? "Back" : "Close"} />
    ) : <span data-one="app-bar-spacer" />}
    {title ? <Text role="subtitle">{title}</Text> : <span data-one="app-bar-spacer" />}
    <span data-one="app-bar-action">{action}</span>
  </div>
);

/* --------------------------------------------------------------- amount --- */

export interface AmountProps {
  /** Already formatted for the reader's locale — this component never formats. */
  readonly whole: string;
  /** ⚠️ Smaller, because a balance is read as a magnitude and the cents are noise. */
  readonly fraction?: string;
  readonly prefix?: string;
}

export const Amount = ({ whole, fraction, prefix }: AmountProps) => (
  /* ⚠️ Tabular figures, always. A number that reflows as it ticks is a bug. */
  <span data-one="amount" data-numeric="">
    {prefix ? <span data-one="amount-prefix">{prefix}</span> : null}
    {whole}
    {fraction ? <span data-one="amount-fraction">{fraction}</span> : null}
  </span>
);

/* --------------------------------------------------------- quick actions --- */

export interface QuickAction {
  readonly id: string;
  readonly icon: string;
  /** ⚠️ Always beneath the circle. A quick action is never a bare glyph. */
  readonly label: string;
  readonly onPress?: () => void;
}

/**
 * ⚠️ FOUR, AND THE FIFTH IS THROWN. Past four this stops being a row of quick
 * actions and becomes a toolbar — the circles shrink under the hit-area floor and
 * the labels start truncating, both of which read as a rendering fault rather
 * than as the limit it is.
 */
export function QuickActions({ actions }: { readonly actions: readonly QuickAction[] }) {
  if (actions.length > LIMIT.quickActions) {
    throw new Error(`QuickActions: ${actions.length} — past ${LIMIT.quickActions} a row of quick actions is a toolbar`);
  }
  return (
    <div data-one="quick-actions" data-count={actions.length}>
      {actions.map((a) => (
        <button key={a.id} type="button" data-one="quick-action" onClick={a.onPress}>
          <span data-one="quick-action-well" data-icon={a.icon} aria-hidden="true" />
          <Text role="caption">{a.label}</Text>
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ tops --- */

export interface CrownProps {
  readonly eyebrow?: string;
  readonly amount: ReactNode;
  readonly under?: ReactNode;
  readonly actions?: readonly QuickAction[];
  readonly bar?: ReactNode;
}

/** A · the screen is about ONE NUMBER, so the number is the screen's title. */
export function Crown({ eyebrow, amount, under, actions, bar }: CrownProps) {
  return (
    <>
      {bar}
      <div data-one="crown">
        {eyebrow ? <Text role="caption" muted>{eyebrow}</Text> : null}
        {amount}
        {under ? <span data-one="crown-under">{under}</span> : null}
      </div>
      {actions ? <QuickActions actions={actions} /> : null}
    </>
  );
}
Crown.forArchetype = "crown" as const;

export interface TopicProps {
  readonly icon?: string;
  readonly title: string;
  readonly actions?: readonly QuickAction[];
  readonly bar?: ReactNode;
}

/** B · the screen is about ONE SUBJECT: a centred title over a pattern. */
export function Topic({ icon, title, actions, bar }: TopicProps) {
  return (
    <>
      {bar}
      <div data-one="topic">
        {icon ? <span data-one="topic-icon" data-icon={icon} aria-hidden="true" /> : null}
        <h1 data-one="topic-title">{title}</h1>
      </div>
      {actions ? <QuickActions actions={actions} /> : null}
    </>
  );
}
Topic.forArchetype = "topic" as const;

export interface PageTitleProps {
  readonly title: string;
  /** A list's one affordance. ⚠️ Never a hero: search is a tool, not a subject. */
  readonly search?: string;
  readonly bar?: ReactNode;
}

/** C · the screen is a LIST. No hero — there is no one number and no topic. */
export function PageTitle({ title, search, bar }: PageTitleProps) {
  return (
    <>
      {bar}
      <h1 data-one="page-title">{title}</h1>
      {search ? (
        <div data-one="search" className={borrow("field")}>
          <span data-one="search-icon" data-icon="search" aria-hidden="true" />
          <Text role="body" muted>{search}</Text>
        </div>
      ) : null}
    </>
  );
}
PageTitle.forArchetype = "title" as const;

export interface IdentityProps {
  /** ⚠️ Initials, never a generic silhouette: one is a person, the other is a gap. */
  readonly initials: string;
  readonly name: string;
  readonly detail?: string;
  readonly action?: ReactNode;
  readonly bar?: ReactNode;
}

/** D · the screen is about ONE PERSON, so it is centred on their face. */
export function Identity({ initials, name, detail, action, bar }: IdentityProps) {
  return (
    <>
      {bar}
      <div data-one="identity">
        <span data-one="face" aria-hidden="true">{initials}</span>
        <h1 data-one="identity-name">{name}</h1>
        {detail ? <Text role="caption" muted>{detail}</Text> : null}
        {action ? <span data-one="identity-action">{action}</span> : null}
      </div>
    </>
  );
}
Identity.forArchetype = "identity" as const;

/* -------------------------------------------------------------- sections --- */

export interface SectionProps {
  readonly title?: string;
  /** ⚠️ The total goes on the RIGHT of the header, never under the title. */
  readonly total?: ReactNode;
  /**
   * ⚠️ INSIDE THE CARD ONLY ON A FEED, where the card IS the section rather than
   * a list the section contains. Anywhere else the title becomes an item in the
   * list it names, and this throws rather than drawing it.
   */
  readonly inside?: boolean;
  /** The foot of a feed card: one way further in, never a row of links. */
  readonly more?: string;
  readonly onMore?: () => void;
  readonly children?: ReactNode;
  /** ⚠️ A scroller is the one thing that leaves the page inset. See §5.7. */
  readonly bleed?: boolean;
}

export function Section({ title, total, inside, more, onMore, children, bleed }: SectionProps) {
  const archetype = useContext(PageContext);
  if (inside && archetype && !SHAPE[archetype].headerInside) {
    throw new Error(`Section: a header inside the card is a feed pattern — on a ${archetype} page the title becomes an item in the list it names`);
  }

  const header = title ? (
    <div data-one="section-header" data-placement={inside ? "inside" : "outside"}>
      <Text role="subtitle">{title}</Text>
      {total ? <span data-one="section-total">{total}</span> : null}
    </div>
  ) : null;

  return (
    <section data-one="section" data-bleed={bleed ? "" : undefined}>
      {inside ? null : header}
      <div data-one="section-card" className={borrow("card")}>
        {inside ? header : null}
        {children}
        {more ? (
          <button type="button" data-one="section-more" onClick={onMore}>
            <Text role="body">{more}</Text>
          </button>
        ) : null}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- patterns --- */

/** ⚠️ A bare outline glyph — the lead for a SETTING, which has no value. */
export const Glyph = ({ icon }: { readonly icon: string }) => (
  <span data-one="glyph" data-icon={icon} aria-hidden="true" />
);

/** ⚠️ A filled medallion — the lead for a THING WITH A VALUE. Never both, per list. */
export const Medallion = ({ icon, initials }: { readonly icon?: string; readonly initials?: string }) => (
  <span data-one="medallion" data-icon={icon} aria-hidden="true">{initials}</span>
);

export interface BadgeProps {
  readonly children: ReactNode;
  readonly tone?: keyof typeof TONE;
  readonly size?: keyof typeof SIZE;
}

export const Badge = ({ children, tone, size = "sm" }: BadgeProps) => (
  <span data-one="badge" className={borrow("badge", [tone && `-${TONE[tone]}`, SIZE[size]])} data-tone={tone}>
    {children}
  </span>
);

export interface TileProps {
  readonly id: string;
  readonly icon: string;
  readonly label: string;
  readonly onPress?: () => void;
}

/**
 * ⚠️ FOUR ACROSS, AND THE FIFTH IS THROWN. Past four a tile is smaller than the
 * hit-area floor — and a grid of targets people miss reads as a broken screen
 * rather than as too many of them.
 */
export function TileGrid({ tiles, across = LIMIT.tilesAcross }: { readonly tiles: readonly TileProps[]; readonly across?: number }) {
  if (across > LIMIT.tilesAcross) {
    throw new Error(`TileGrid: ${across} across — past ${LIMIT.tilesAcross} a tile is smaller than the hit-area floor`);
  }
  return (
    <div data-one="tile-grid" data-across={across} style={{ "--across": String(across) } as Record<string, string>}>
      {tiles.map((t) => (
        <button key={t.id} type="button" data-one="tile" onClick={t.onPress}>
          <span data-one="tile-face" data-icon={t.icon} aria-hidden="true" />
          <Text role="caption">{t.label}</Text>
        </button>
      ))}
    </div>
  );
}

export interface SegmentedProps {
  readonly options: readonly { readonly id: string; readonly label: string }[];
  readonly at: string;
  readonly onGo?: (id: string) => void;
}

/**
 * ⚠️ ONE INDICATOR THAT TRAVELS, NOT TWO PILLS CROSS-FADING. The index is a
 * variable on the track, so the movement is continuous — cross-fading reads as
 * two separate things happening rather than as one thing moving.
 */
export function Segmented({ options, at, onGo }: SegmentedProps) {
  const index = Math.max(0, options.findIndex((o) => o.id === at));
  return (
    <div
      data-one="segmented"
      role="tablist"
      style={{ "--at": String(index), "--of": String(options.length) } as Record<string, string>}
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          data-one="segment"
          aria-selected={o.id === at}
          onClick={() => onGo?.(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * ⚠️ THE ONE THING THAT LEAVES THE PAGE INSET. Its first item lines up with
 * everything above it and its last is cut, which is what says there is more. A
 * scroller that fits inside the inset looks like a row that failed to fill.
 */
export const Scroller = ({ label, children }: { readonly label: string; readonly children: ReactNode }) => (
  <div data-one="scroller" role="group" aria-label={label}>{children}</div>
);

export interface PromoProps {
  readonly title: string;
  readonly detail?: string;
  readonly action?: ReactNode;
}

/** ⚠️ A lit card, and the only one: two promos on a screen is an advertisement. */
export const Promo = ({ title, detail, action }: PromoProps) => (
  <div data-one="promo" className={borrow("card")}>
    <span data-one="promo-body">
      <Text role="subtitle">{title}</Text>
      {detail ? <Text role="caption" muted>{detail}</Text> : null}
    </span>
    {action}
  </div>
);

/**
 * WHAT THE CENTRE KNOWS — the bootstrap, and the one way it loads anything.
 *
 * ⚠️ THE PAGE HOLDS NO MANIFEST. Screens, settings, notification types and
 * legal documents all arrive from `centre.view`, because the deployment is the
 * only thing that holds the manifests — one bundle serves every product.
 *
 * ⚠️ `Loaded` EVERYWHERE, `[]` NOWHERE. A failed load is a problem with a
 * sentence, never an empty list wearing a loading state's excuse.
 */

import { useCallback, useEffect, useState } from "react";
import type {
  AreaBook, DocumentBook, Gate, GuideBook, Instant, MilestoneBook, NotificationBook, Offline,
  Outcome, ScreenSpec, SettingBook, NeedBook, SubProcessorBook,
} from "@engine/kernel";
import { notice, ready, trouble, waiting, type Loaded, type Undo } from "@engine/design";
import { api, forget, known, whenWritten } from "../api.js";
import { keyOf } from "../offline.js";

/* ----------------------------------------------------------------- shapes --- */

export interface CentreApp {
  readonly id: string;
  readonly name: string;
  readonly mark: string;
  /** ⚠️ The product's own colour, and the product's alone — see `AppSpec.hue`. */
  readonly hue?: string;
  readonly screens: readonly ScreenSpec[];
  readonly settings: SettingBook;
  /**
   * ⚠️ WHAT THIS WORKSPACE CHOSE, FOR THE SETTINGS A FLOW STARTS FROM — and for
   * no others. The line above is the DECLARATIONS, which is what the settings
   * screen draws; this is the resolved answer, which is what a story needs to
   * open a step already filled in. Absent for an app whose stories start at
   * nothing, which is most of them.
   */
  readonly chose?: Readonly<Record<string, unknown>>;
  /** ⚠️ The pages those rows live on — see `AreaDef`. */
  readonly settingAreas: AreaBook;
  readonly notifications: NotificationBook;
  readonly documents: DocumentBook;
  readonly processors: SubProcessorBook;
  /** ⚠️ Where its records actually sit — see `WhereItLives`. */
  readonly needs: NeedBook;
  /** ⚠️ The checklist and the milestones. What is TICKED is `guide.view`. */
  readonly guide: GuideBook;
  readonly milestones: MilestoneBook;
  /** What THIS caller may do in this app, resolved by the one resolver (D15). */
  readonly permissions: readonly string[];
  /** The role names on offer — declared and this workspace's own. */
  readonly roles: readonly string[];
  /** What a package may sell here. */
  readonly sellable: readonly string[];
  /** ⚠️ What a phone may do with each of its operations with no signal. */
  readonly offline?: Readonly<Record<string, Offline>>;
  /** ⚠️ What each write says when it worked, and what it makes stale. */
  readonly outcomes?: Readonly<Record<string, Outcome>>;
  /**
   * ⚠️ WHICH OPERATIONS SPEND CREDITS — see `meteredIds`. A screen cannot work
   * this out: what makes one metered is a field on a declaration the browser
   * never holds. Absent is "none of them", which is where a client that forgets
   * the field lands and is also true of most products.
   */
  readonly metered?: readonly string[];
  /**
   * ⚠️ WHICH GATE WOULD STOP AN OPERATION, FOR THIS CALLER — the server's own
   * walk, so a control a screen draws and a route the gate refuses cannot come
   * apart. ABSENT MEANS ALLOWED: only what is blocked travels, which is also
   * where a client that forgets the field lands.
   */
  readonly may?: Readonly<Record<string, Gate>>;
}

export interface CentreView {
  /* ⚠️ The KIND travels with the name, because the chrome decides what to offer
     from it (`reachable`) — asked separately it would be a second round trip on
     the one read every screen in a workspace stands on. */
  readonly tenant: {
    readonly name: string;
    readonly slug: string;
    readonly kind?: "personal" | "commercial";
    /*
      ⚠️ NO THEME TRAVELS HERE, AND THAT IS THE DESIGN. A workspace's brand is
      its NAMEPLATE — the tile on a phone, the letterhead on its mail — and it is
      resolved where those are SERVED (`installableFor`). It reached `:root` once,
      which made the ground behind every page, the wash on every card and the one
      coloured thing on a screen a value somebody picked in a settings card, so
      nothing above them could be composed against anything. What a screen is
      made of is the product's `hue`.
    */
    /** ⚠️ `false` takes our mark off. Ours to answer, never a product's. */
    readonly ourMark?: boolean;
  };
  readonly you: {
    readonly accountId: string;
    readonly email: string | null;
    readonly platformRole: string | null;
    readonly appRoles: Readonly<Record<string, string>>;
    readonly platform: readonly string[];
  };
  readonly apps: readonly CentreApp[];
}

export interface MemberLine {
  readonly id: string;
  /** ⚠️ The person across every workspace — see `member.list`. Empty until claimed. */
  readonly accountId: string;
  readonly email: string;
  readonly platformRole: string;
  readonly appRoles: Readonly<Record<string, string>>;
  readonly accepted: boolean;
  /**
   * ⚠️ WHERE THEY WORK, PER PRODUCT (`reach.ts`). An app ABSENT from this book is
   * the whole workspace — which is what almost every row says, and what every
   * membership that predates the column says. An app present with an empty list
   * is nowhere.
   */
  readonly reach: Readonly<Record<string, readonly string[]>>;
}

/** One part of a workspace somebody can be narrowed to — see `member.places`. */
export interface PlaceLine {
  readonly id: string;
  readonly name: string;
  /** Its parent, where the places nest. A grant to a parent covers this. */
  readonly within?: string;
}

export interface PackageLine {
  readonly id: string;
  readonly app: string;
  readonly name: string;
  readonly priceCents: number;
  readonly currency: string;
  readonly periodDays: number;
  readonly graceDays: number;
  readonly grants: readonly string[];
  readonly oncePer?: boolean;
}

export interface HoldingLine {
  readonly packageId: string;
  readonly name: string;
  readonly state: "active" | "grace" | "lapsed";
  readonly paidUntil: string | null;
}

/**
 * ⚠️ ONE MEMBERSHIP, SO ONE PLAN AND ONE WALLET. The products are a list beside
 * the bill rather than N bills stacked — a per-product answer is three emails on
 * three days from what looks like three companies.
 */
export interface MoneyView {
  readonly plan: { readonly id: string; readonly name: string; readonly kind: string } | null;
  readonly status: string | null;
  /**
   * ⚠️ WHEN IT WAS GIVEN, AND `null` WHEN IT WAS BOUGHT. The two look identical
   * on every screen without it — and only one of them has an invoice behind it,
   * a card that can decline, and a subscription there is anything to manage.
   */
  readonly given: {
    readonly at: import("@engine/kernel").Instant;
    readonly until: import("@engine/kernel").Instant | null;
  } | null;
  readonly plans: readonly import("@engine/kernel").PlanSpec[];
  readonly packs: readonly import("@engine/kernel").PackDef[];
  readonly entitlements: Readonly<Record<string, import("@engine/kernel").EntitlementDef>>;
  readonly apps: readonly {
    readonly id: string; readonly name: string; readonly mark: string;
  }[];
  readonly bill: {
    readonly lines: readonly { readonly appId: string; readonly planId: string; readonly price: number; readonly currency: string }[];
    readonly total: number;
    readonly currency: string;
  };
  /** ⚠️ Two balances that obey opposite rules — see `Wallet`. */
  readonly wallet: {
    readonly granted: number; readonly bought: number; readonly held: number;
    readonly spendable: number; readonly owedMilli: number; readonly owing: boolean;
  };
  readonly storage: {
    readonly used: number; readonly included: number;
    readonly creditsPerGbMonth: number; readonly owedMilli: number;
  };
  /** ⚠️ The standing top-up, including why it last failed — see `AutoTopUp`. */
  readonly armed: {
    readonly packId: string | null; readonly below: number;
    readonly at: string | null; readonly error: string | null;
  };
  readonly spent: readonly { readonly appId: string | null; readonly credits: number }[];
  readonly statement: readonly {
    readonly at: string; readonly delta: number; readonly reason: string;
    readonly appId: string | null;
  }[];
  readonly mixed: boolean;
}

export interface InboxView {
  readonly items: readonly {
    readonly id: string; readonly type: string; readonly title: string;
    readonly link: string | null; readonly tone: string; readonly at: string;
    readonly seen: boolean;
    /*
      ⚠️ WHICH WORKSPACE, ON THE ACCOUNT DOOR ONLY. `me.inbox` merges every
      workspace this person is in, so without it the list is a column of
      sentences about work with no way to tell which of four places any of them
      is about — which is worse than four inboxes, not better. A workspace's own
      inbox omits both: naming the workspace on every row of its own screen is
      the heading repeated N times.
    */
    readonly where?: string;
    readonly slug?: string;
  }[];
  readonly unseen: number;
}

/* ------------------------------------------------------------------ loads --- */

/**
 * WHAT WAS LAST TRUE, SO A SCREEN ALREADY VISITED DRAWS AT ONCE.
 *
 * ⚠️ THE ANSWERS ARE THE DOOR'S NOW, AND THERE IS ONE OF THEM. This file held a
 * `Map` of its own keyed the same way `api.ts` keys a request — two caches for
 * one question, reachable only from the screens that happened to import this
 * page. A product mounted beside them got neither, wrote its own hook, and paid
 * for every answer again on every navigation. The store moved to the door
 * because the KEY is the door's: an operation and its input identify an answer,
 * and that is the one place both are in hand.
 */
/**
 * One remote answer, with a way to ask again — the shape every screen reads.
 *
 * ⚠️ IT SHOWS WHAT IT HAS AND THEN CATCHES UP. A screen that can be drawn is
 * drawn; the request still goes out and the answer replaces it when it lands. So
 * a revisit is instant and still correct, and a first visit is exactly what it
 * was.
 *
 * ⚠️ AND `again` NO LONGER BLANKS THE SCREEN, which is what made every save look
 * like a page reload. Re-reading after a write reset the state to `waiting`, so
 * the list under the control somebody had just used vanished into a skeleton and
 * came back a round trip later — with a long list, scrolled somewhere else. The
 * data stays up while the new answer is on its way.
 */
export function useLoad<T>(id: string | null, input?: Record<string, string>): {
  readonly of: Loaded<T>;
  readonly again: () => void;
  /**
   * ⚠️ SET ONLY WHEN THIS DEVICE ANSWERED — see `Ok.stale`. A screen that
   * ignores it draws what it always drew; one that reads it can say how old the
   * answer is, which is the whole difference between a number somebody can trust
   * and one nobody can date.
   */
  readonly stale?: Instant;
} {
  /* ⚠️ READ SYNCHRONOUSLY, WHICH IS WHAT MAKES A REVISIT INSTANT. Awaiting the
     cache would paint one frame of skeleton over an answer the tab already
     holds, which is the blank navigation this whole mechanism exists to end. */
  /* ⚠️ `null` IS "NOTHING TO ASK FOR", AND IT WAITS FOR EVER ON PURPOSE. A hook
     cannot be called conditionally, so a screen that needs an answer only when
     its declaration asks for one has to say so here — and the honest state for a
     read nobody made is the one every unanswered read is in. What must never
     happen is `ready` with nothing in it, which is a confident empty answer. */
  const [of, set] = useState<Loaded<T>>(() => {
    if (id === null) return waiting();
    const had = known<T>(id, input);
    return had === undefined ? waiting() : ready(had);
  });
  const [stale, setStale] = useState<Instant | undefined>(undefined);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (id === null) return;
    let live = true;
    /* ⚠️ ONLY WHERE THERE IS NOTHING TO SHOW. Blanking over an answer we already
       hold is the reload this exists to end. */
    set((was) => {
      if (was.status === "ready") return was;
      const had = known<T>(id, input);
      return had === undefined ? waiting() : ready(had);
    });

    void api.get<T>(id, input).then((got) => {
      if (!live) return;
      if (got.ok) {
        setStale(got.stale);
        set(ready(got.value));
        return;
      }
      /*
        ⚠️ A FAILED REFRESH OVER DATA WE HAVE IS NOT A REFUSAL SCREEN. Replacing
        a list somebody is reading with "something went wrong" because a poll
        lost the network takes the product away over a fault that has already
        passed. A failure is only SHOWN while there is nothing to show — the same
        rule every polling screen in this repository follows.
      */
      if (known<T>(id, input) === undefined) set(trouble(got.problem));
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, id === null ? "" : keyOf(id, input), tick]);

  return { of, again: useCallback(() => setTick((n) => n + 1), []), stale };
}

/**
 * ⚠️ WHAT A WRITE INVALIDATES, WHEN IT IS NOT WHAT THE WRITER IS LOOKING AT. A
 * screen re-reads itself through `again`; this is for the answers ELSEWHERE that
 * the same write changed — so the next screen to ask does not draw a remembered
 * answer that is now wrong.
 */
export { forget };

/**
 * ⚠️ IT READS, IT DOES NOT PAINT. This hook once also wrote a workspace's
 * colours onto `:root` on every screen under it. Nothing here does that any
 * more and nothing should: a page's colour is `AppSpec.hue`, applied by `Page`
 * on the page element, so a screen can be designed against a value that was
 * chosen by whoever designed it.
 */
export const useCentre = () => useLoad<CentreView>("centre.view");

/**
 * ⚠️ THE DEVICE'S OWN CALENDAR DAY, AND IT IS READ HERE RATHER THAN SENT. A
 * shelf life is counted where the shelf is: the worker has no way to know what
 * day it is where somebody is standing, and its own calendar would call a box
 * expired the evening before it is — or, west of Greenwich, current for a few
 * more hours after it is not.
 *
 * ⚠️ ONE HOME, BECAUSE TWO WOULD BE TWO CALENDARS. A screen fills a form from
 * it and a reversal fills its input from it; a second copy is a second place for
 * the padding, the timezone and the January-the-first edge to be got right.
 */
export const today = (): string => {
  const at = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
};

/**
 * THE WAY BACK, RESOLVED AGAINST THE ANSWER THE WRITE JUST GAVE — see
 * `Outcome.back`.
 *
 * ⚠️ IT GOES THROUGH THE DOOR, WHICH IS WHY THE PRESS CAN BE REFUSED. Reversing
 * in the browser would draw a balance the server never agreed to, on the one
 * press where being wrong costs a recount — so this posts the reversing
 * operation and lets its own rules answer. `stock.undo` refuses somebody else's
 * movement, one that is no longer the last on its line, and one from an hour
 * ago; none of that is the button's to know, and all of it reaches the person
 * as the ordinary problem the door raises.
 *
 * ⚠️ AND A FIELD THE ANSWER DOES NOT CARRY WITHDRAWS THE OFFER RATHER THAN
 * SENDING AN EMPTY ONE. `refuseApp` refuses a `back` whose fills name nothing
 * the operation answers, so this is the belt — but the braces have to be a
 * missing BUTTON and not a button that fails, because the press is the moment
 * somebody has already decided they made a mistake.
 */
const backOf = (outcome: Outcome, answer: unknown): Undo | undefined => {
  const back = outcome.back;
  if (!back) return undefined;
  const said = (answer ?? {}) as Record<string, unknown>;
  const input: Record<string, unknown> = {};
  for (const [name, from] of Object.entries(back.from)) {
    const value = from === "today" ? today() : said[from.said];
    if (value === undefined || value === null || value === "") return undefined;
    input[name] = value;
  }
  return {
    says: back.says,
    /* ⚠️ THE ANSWER IS DROPPED ON PURPOSE. The reversal declares its OWN outcome
       — "Taken back." — which this same handler raises when it returns, so
       reading its answer here would be a second sentence about one press. */
    run: () => { void api.post(back.operation, input); },
  };
};

/**
 * WHAT A WRITE SAYS, AND WHAT IT MAKES STALE — installed once, here.
 *
 * ⚠️ HERE RATHER THAN IN THE DOOR, because both halves belong to this file's
 * neighbours: the sentence is the design system's to draw and the held answers
 * are this file's to drop. The door knows WHEN a write worked and must not learn
 * what a toast is.
 *
 * ⚠️ AND AT MODULE SCOPE, DELIBERATELY. Every screen imports this file, so the
 * install happens once and nobody has to remember it in a provider — which is
 * the failure mode the whole seam exists to avoid: a confirmation that works on
 * the screens somebody wired and is silent on the rest.
 */
whenWritten((outcome, answer) => {
  /* ⚠️ THE TONE DECIDES THE CHANNEL. A `warning` outcome shown as a success is
     the product telling somebody that something went well when the operation
     said otherwise. `neutral` and `info` are ordinary confirmations. */
  if (outcome.tone === "danger") notice.fail(outcome.message);
  else if (outcome.tone === "warning") notice.warn(outcome.message);
  /* ⚠️ AND ONLY A CONFIRMATION CARRIES THE WAY BACK — see `notice`. A warning
     already says the write did something other than what was asked, and
     offering to reverse THAT is offering to reverse an unknown. */
  else notice.ok(outcome.message, backOf(outcome, answer));
  /* ⚠️ THE READS THE WRITE MADE STALE, WHEREVER THEY ARE. A screen re-reads
     itself; this is for the answers ELSEWHERE that the same write changed, which
     is the half no screen can do for itself. */
  for (const id of outcome.invalidates ?? []) forget(id);
});

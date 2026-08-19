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
  AreaBook, DocumentBook, NotificationBook, ScreenSpec, SettingBook, NeedBook, SubProcessorBook,
} from "@engine/kernel";
import { ready, trouble, waiting, type Loaded } from "@engine/design";
import { api } from "../api.js";

/* ----------------------------------------------------------------- shapes --- */

export interface CentreApp {
  readonly id: string;
  readonly name: string;
  readonly mark: string;
  readonly screens: readonly ScreenSpec[];
  readonly settings: SettingBook;
  /** ⚠️ The pages those rows live on — see `AreaDef`. */
  readonly settingAreas: AreaBook;
  readonly notifications: NotificationBook;
  readonly documents: DocumentBook;
  readonly processors: SubProcessorBook;
  /** ⚠️ Where its records actually sit — see `WhereItLives`. */
  readonly needs: NeedBook;
  /** What THIS caller may do in this app, resolved by the one resolver (D15). */
  readonly permissions: readonly string[];
  /** The role names on offer — declared and this workspace's own. */
  readonly roles: readonly string[];
  /** What a package may sell here. */
  readonly sellable: readonly string[];
}

export interface CentreView {
  /* ⚠️ The KIND travels with the name, because the chrome decides what to offer
     from it (`reachable`) — asked separately it would be a second round trip on
     the one read every screen in a workspace stands on. */
  readonly tenant: {
    readonly name: string;
    readonly slug: string;
    readonly kind?: "personal" | "commercial";
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
 * ⚠️ WITHOUT IT EVERY NAVIGATION IS A BLANK SCREEN, INCLUDING GOING BACK. The
 * answer is re-fetched from scratch each time the hook mounts, so returning to a
 * list you were reading two seconds ago showed the skeleton again and waited on
 * a round trip to redraw what the browser had just painted. That is most of what
 * "every navigation takes time" is: not the request being slow, but nothing
 * being shown while it happens.
 *
 * ⚠️ AND IT IS PER TAB, DELIBERATELY. A `Map` in the module lives as long as the
 * page does and dies with it, so nothing here has to be invalidated on sign-out
 * by hand — a reload is what ends a session, and a reload is what empties this.
 */
const held = new Map<string, unknown>();

/** ⚠️ One key for one question, so two screens asking it share the answer. */
const askedFor = (id: string, input?: Record<string, string>): string =>
  `${id}:${JSON.stringify(input ?? {})}`;

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
export function useLoad<T>(id: string, input?: Record<string, string>): {
  readonly of: Loaded<T>;
  readonly again: () => void;
} {
  const key = askedFor(id, input);
  const [of, set] = useState<Loaded<T>>(() =>
    (held.has(key) ? ready(held.get(key) as T) : waiting()));
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    /* ⚠️ ONLY WHERE THERE IS NOTHING TO SHOW. Blanking over an answer we already
       hold is the reload this exists to end. */
    set((was) => (was.status === "ready" ? was
      : held.has(key) ? ready(held.get(key) as T) : waiting()));

    void api.get<T>(id, input).then((got) => {
      if (!live) return;
      if (got.ok) { held.set(key, got.value); set(ready(got.value)); return; }
      /*
        ⚠️ A FAILED REFRESH OVER DATA WE HAVE IS NOT A REFUSAL SCREEN. Replacing
        a list somebody is reading with "something went wrong" because a poll
        lost the network takes the product away over a fault that has already
        passed. A failure is only SHOWN while there is nothing to show — the same
        rule every polling screen in this repository follows.
      */
      if (!held.has(key)) set(trouble(got.problem));
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, key, tick]);

  return { of, again: useCallback(() => setTick((n) => n + 1), []) };
}

/**
 * ⚠️ WHAT A WRITE INVALIDATES, WHEN IT IS NOT WHAT THE WRITER IS LOOKING AT. A
 * screen re-reads itself through `again`; this is for the answers ELSEWHERE that
 * the same write changed — so the next screen to ask does not draw a remembered
 * answer that is now wrong.
 */
export const forget = (id?: string): void => {
  if (!id) { held.clear(); return; }
  for (const key of [...held.keys()]) if (key.startsWith(`${id}:`)) held.delete(key);
};

export const useCentre = () => useLoad<CentreView>("centre.view");

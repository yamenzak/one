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

export interface MoneyView {
  readonly apps: readonly {
    readonly id: string; readonly name: string; readonly mark: string;
    readonly planId: string | null; readonly status: string | null;
    readonly plans: readonly import("@engine/kernel").PlanSpec[];
    readonly entitlements: Readonly<Record<string, import("@engine/kernel").EntitlementDef>>;
  }[];
  readonly bill: {
    readonly lines: readonly { readonly appId: string; readonly planId: string; readonly price: number; readonly currency: string }[];
    readonly total: number;
    readonly currency: string;
  };
  readonly balance: { readonly spendable: number };
}

export interface InboxView {
  readonly items: readonly {
    readonly id: string; readonly type: string; readonly title: string;
    readonly link: string | null; readonly tone: string; readonly at: string;
    readonly seen: boolean;
  }[];
  readonly unseen: number;
}

/* ------------------------------------------------------------------ loads --- */

/** One remote answer, with a way to ask again — the shape every screen reads. */
export function useLoad<T>(id: string, input?: Record<string, string>): {
  readonly of: Loaded<T>;
  readonly again: () => void;
} {
  const [of, set] = useState<Loaded<T>>(waiting());
  const [tick, setTick] = useState(0);
  const key = JSON.stringify(input ?? {});

  useEffect(() => {
    let live = true;
    set(waiting());
    void api.get<T>(id, input).then((got) => {
      if (!live) return;
      set(got.ok ? ready(got.value) : trouble(got.problem));
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, key, tick]);

  return { of, again: useCallback(() => setTick((n) => n + 1), []) };
}

export const useCentre = () => useLoad<CentreView>("centre.view");

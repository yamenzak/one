/**
 * THE BELL, THE INBOX, AND WHAT SOMEBODY WANTS TO BE INTERRUPTED BY.
 *
 * ⚠️ A MECHANISM WITH NO SURFACE IS THE FAILURE THIS PLATFORM WAS STARTED OVER,
 * and it had happened again here: the algebra, the store, the dispatch and the
 * four operations were all written and there was nowhere a person could look. A
 * notification reachable at an endpoint is a notification nobody receives.
 *
 * ⚠️ THE ROW IS RENDERED FROM THE TYPE, NEVER FROM STORED TEXT. What the server
 * sends is a title already rendered from the registry and this workspace's own
 * words — so a studio that fixes a typo fixes it in every row, and an inbox is
 * not a museum of every phrasing anybody has tried.
 *
 * ⚠️ AND THE PREFERENCES ARE CATEGORIES, NOT TYPES. A per-type screen is a list
 * nobody maintains: every notification added later arrives switched to whatever
 * the default is, and somebody who carefully turned eleven things off has a
 * twelfth they never asked for. The per-type list below is READ-ONLY — it says
 * where each one currently reaches, which is the question the two-level design
 * creates and has to be able to answer.
 */

import { useState, type ElementType, type ReactNode } from "react";
import type { Problem } from "@one/kernel";
import { Pill } from "../capsule.js";
import { Bell, Gifted, Guard, Letter, Sparkle, Tick, Wallet } from "../icon.js";
import { Blank, Card, Item, Unset, Waiting } from "../list.js";
import { Screen, Section, Title } from "../screen.js";
import { SwitchRow } from "../switch.js";
import { Button } from "../button.js";

/** One notification, as `inbox.list` answers. */
export interface Notice {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly body?: string;
  readonly icon: string;
  readonly category: string;
  readonly at: string;
  readonly read: boolean;
  /** Where it opens. Resolved by the app's own shell, never by a path here. */
  readonly open: { readonly collection?: string; readonly rowId?: string };
}

/**
 * ⚠️ THE REGISTRY'S ICON NAMES, MAPPED ONCE, WITH A BELL AS THE FALLBACK. An app
 * may name any icon it likes and this package draws a closed set — so the
 * mapping has to be total, and the fallback has to be the one shape that means
 * "a notification" rather than a blank space where a glyph should be.
 */
type Glyph = (p: { readonly size?: number }) => ReactNode;

const GLYPHS: Readonly<Record<string, Glyph>> = {
  card: Wallet, wallet: Wallet, gift: Gifted, sparkle: Sparkle,
  shield: Guard, check: Tick, letter: Letter, bell: Bell,
};

export const iconFor = (name: string): Glyph => GLYPHS[name] ?? Bell;

/** ⚠️ The category in the words of whoever reads it. An unknown one prints itself. */
export const categoryOf = (category: string): string =>
  ({ billing: "Money", activity: "Activity", action: "Needs you", service: "Service" })[category] ?? category;

export interface InboxProps {
  /** ⚠️ Null until known. An empty inbox and a pending fetch are different facts. */
  readonly rows: readonly Notice[] | null;
  readonly unread: number;
  readonly onRead: (id?: string) => Promise<Problem | null>;
  readonly onOpen: (notice: Notice) => void;
  readonly onGo: () => void;
  readonly onBack: () => void;
  readonly Heading?: ElementType;
}

export function InboxScreen({ rows, unread, onRead, onOpen, onGo, onBack, Heading = "h1" }: InboxProps): ReactNode {
  return (
    <Screen leave="up" onLeave={onBack} name="Notifications" sky="silk"
      title={<Title as={Heading}>Notifications</Title>}
      lede={unread > 0 ? `${unread} unread` : undefined}
      /* ⚠️ Offered only where there is something to do. "Mark all read" over an
         empty inbox is a control that reports success for doing nothing. */
      action={unread > 0 ? <Button tone="quiet" onClick={() => void onRead()}>Mark all read</Button> : undefined}
    >
      <Section>
        {rows === null ? <Waiting rows={4} /> : rows.length === 0 ? (
          <Blank title="Nothing yet">
            Anything this product needs to tell you arrives here, whether or not you asked to be emailed.
          </Blank>
        ) : (
          <Card>
            {rows.map((notice) => {
              const Glyph = iconFor(notice.icon);
              return (
                <Item
                  key={notice.id}
                  icon={<Glyph />}
                  title={notice.title}
                  detail={
                    <>
                      {notice.body ?? categoryOf(notice.category)}
                      {/* ⚠️ UNREAD IS A MARK ON THE ROW, not a different row. A
                          list where half the entries are styled differently is
                          one the eye reads as two lists. */}
                      {notice.read ? null : <Pill tone="quiet">New</Pill>}
                    </>
                  }
                  onGo={() => { void onRead(notice.id); onOpen(notice); }}
                />
              );
            })}
          </Card>
        )}
      </Section>

      <Section>
        <Card>
          <Item title="What interrupts you" detail="Which of these reach your email and your devices" onGo={onGo} />
        </Card>
      </Section>
    </Screen>
  );
}

/* ------------------------------------------------------------ the choices --- */

/** One type, with where it currently reaches — as `inbox.preferences` answers. */
export interface Reaching {
  readonly type: string;
  readonly category: string;
  readonly icon: string;
  readonly title: string;
  readonly reaching: readonly string[];
  /** What the workspace permits. Shorter than `reaching` is never possible. */
  readonly allowed: readonly string[];
}

export interface NoticePrefs {
  readonly muted: readonly string[];
  readonly email: boolean;
  readonly push: boolean;
}

export interface ChoicesProps {
  /** ⚠️ Null until known. */
  readonly prefs: NoticePrefs | null;
  readonly types: readonly Reaching[] | null;
  /** What this DEPLOYMENT can deliver. A channel not in it is not offered. */
  readonly channels: readonly string[];
  readonly onSet: (prefs: NoticePrefs) => Promise<Problem | null>;
  /**
   * ⚠️ ABSENT MEANS THIS BROWSER CANNOT BE SUBSCRIBED — no push on the
   * deployment, or a browser that does not do push at all. Then there is no
   * switch, rather than a switch that silently does nothing, which is exactly
   * what got this channel deleted from the platform the first time.
   */
  readonly onPush?: (on: boolean) => Promise<Problem | null>;
  readonly onBack: () => void;
  readonly Heading?: ElementType;
}

const CATEGORIES: readonly { readonly id: string; readonly label: string; readonly detail: string }[] = [
  { id: "billing", label: "Money", detail: "Charges, refunds, plans and limits" },
  { id: "activity", label: "Activity", detail: "Somebody did something you would want to know about" },
  { id: "service", label: "Service", detail: "Maintenance, incidents and releases" },
];

/** ⚠️ Where one type reaches, in words. Empty is the workspace's decision, said. */
export const reachSaid = (row: Reaching): string => {
  if (row.allowed.length === 0) return "Turned off for this workspace";
  const beyond = row.reaching.filter((c) => c !== "inbox");
  return beyond.length === 0 ? "Here only" : `Here and by ${beyond.join(" and ")}`;
};

export function NoticeChoices({
  prefs, types, channels, onSet, onPush, onBack, Heading = "h1",
}: ChoicesProps): ReactNode {
  const [busy, setBusy] = useState(false);
  const set = async (next: Partial<NoticePrefs>) => {
    if (!prefs) return;
    setBusy(true);
    await onSet({ ...prefs, ...next });
    setBusy(false);
  };

  return (
    <Screen leave="up" onLeave={onBack} name="What interrupts you" sky="silk"
      title={<Title as={Heading}>What interrupts you</Title>}
      lede="Everything still arrives in your notifications. This is only about what reaches you elsewhere."
    >
      <Section name="Where">
        {prefs === null ? <Waiting rows={2} /> : (
          <Card>
            <SwitchRow
              title="Email" detail="To the address you sign in with" icon={<Letter />}
              on={prefs.email} disabled={busy || !channels.includes("email")}
              onChange={(on) => void set({ email: on })}
            />
            {/*
              ⚠️ THE DEVICE SWITCH IS ABSENT WHERE THERE IS NOTHING TO SUBSCRIBE
              TO. A deployment with no push keys, or a browser that does not do
              push, gets no row — never a row that does nothing.
            */}
            {onPush && channels.includes("push") ? (
              <SwitchRow
                title="This device" detail="Even when the tab is closed" icon={<Bell />}
                on={prefs.push} disabled={busy}
                onChange={(on) => void onPush(on)}
              />
            ) : null}
          </Card>
        )}
      </Section>

      {/*
        ⚠️ CATEGORIES, NOT TYPES — see the header. And `action` is not on the list
        at all: it is the category meaning nothing proceeds until somebody does
        something, and a switch for it is a way to make the product silently stop
        working for whoever pressed it.
      */}
      <Section name="What">
        {prefs === null ? <Waiting rows={3} /> : (
          <Card>
            {CATEGORIES.map((c) => (
              <SwitchRow
                key={c.id} title={c.label} detail={c.detail}
                on={!prefs.muted.includes(c.id)} disabled={busy}
                onChange={(on) => void set({
                  muted: on ? prefs.muted.filter((m) => m !== c.id) : [...prefs.muted, c.id],
                })}
              />
            ))}
          </Card>
        )}
      </Section>

      {/*
        ⚠️ READ-ONLY, AND DERIVED FROM WHAT THIS PERSON MAY DO. Somebody who
        cannot read a check-in has no business being shown a row for "a check-in
        was filed" — a list of every type a product has is one where most rows
        mean nothing to most readers.
      */}
      <Section name="Everything you are told">
        {types === null ? <Waiting rows={4} /> : types.length === 0 ? (
          <Blank title="Nothing reaches you here">
            Your workspace has not switched anything on that your role would receive.
          </Blank>
        ) : (
          <Card>
            {types.map((row) => {
              const Glyph = iconFor(row.icon);
              return (
                <Item
                  key={row.type} icon={<Glyph />} title={row.title}
                  detail={categoryOf(row.category)}
                  action={row.allowed.length === 0
                    ? <Unset>Off</Unset>
                    : <span className="value">{reachSaid(row)}</span>}
                />
              );
            })}
          </Card>
        )}
      </Section>
    </Screen>
  );
}

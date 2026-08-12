/**
 * YOUR VAULT — everything held about you, everyone who can see it, and who has.
 *
 * ⚠️ THREE QUESTIONS, AND EVERY PRODUCT ANSWERS AT MOST THE FIRST. What is held
 * about me; who can see each part; and who has actually looked. The third is the
 * one that turns a settings screen into something worth opening — a permission
 * list says what COULD happen, and a person deciding whether to keep sharing
 * wants to know what DID.
 *
 * ⚠️ IT IS THE ACCOUNT'S, NOT AN APP'S, so it answers on `id.` with no workspace
 * anywhere. Somebody reviewing what they have shared is the person most likely
 * to have left every workspace they were in — and a screen that needed one would
 * be unreachable for exactly them.
 *
 * ⚠️ NO ICON COLUMN ON ANY OF THESE LISTS. Every row would carry the same glyph,
 * which is a column repeating what the section heading already said — and both
 * candidates were borrowed meanings: a shield is protection and a download arrow
 * is a download.
 *
 * ⚠️ A LAPSED GRANT IS SHOWN, NOT HIDDEN. "It ran out" and "I never gave it" are
 * the two answers somebody most wants to tell apart, and filtering the first out
 * makes them the same screen.
 */

import { useState, type ElementType, type ReactNode } from "react";
import type { Problem } from "@one/kernel";
import { Chip } from "../chip.js";
import { Confirm } from "../confirm.js";
import { Blank, Card, Item, Pill, Unset, Waiting } from "../list.js";
import { Screen, Section, Title } from "../screen.js";
import type { Reach } from "../consent.js";

export interface Grant {
  readonly appId: string;
  readonly appName: string;
  /** The workspace, where the grant is narrowed to one. */
  readonly where?: string;
  readonly reach: Reach;
  /** ⚠️ Null is "until I change it", which is a real answer rather than absence. */
  readonly until: string | null;
  readonly live: boolean;
}

export interface Held {
  readonly fact: string;
  readonly label: string;
  /** ⚠️ Whether anything is recorded. The VALUE is not on this screen. */
  readonly held: boolean;
  readonly grants: readonly Grant[];
}

export interface Looked {
  readonly fact: string;
  readonly label: string;
  readonly appName: string;
  /** Who looked. Absent where the app itself was computing and no person saw it. */
  readonly who?: string;
  readonly on: string;
  readonly times: number;
}

export interface VaultScreenProps {
  /** ⚠️ `null` is not answered yet; `[]` is answered and empty. */
  readonly held: readonly Held[] | null;
  readonly looks: readonly Looked[] | null;
  readonly onOpen: (fact: string) => void;
  readonly onStop: (fact: string, appId: string) => Promise<Problem | null>;
  readonly onBack: () => void;
  readonly Heading?: ElementType;
}

const NAME: Record<Reach, string> = {
  self: "Only you", compute: "Calculations only", agent: "The assistant", staff: "People there",
};

export function VaultScreen({ held, looks, onOpen, onStop, onBack, Heading = "h1" }: VaultScreenProps): ReactNode {
  const [stopping, setStopping] = useState<{ fact: string; label: string; appId: string; appName: string } | null>(null);

  /*
    ⚠️ SHARED FIRST, THEN THE REST. A list ordered by the registry buries the
    three things somebody actually came to check under nine they have never
    filled in — and this screen is opened when somebody wants to stop something,
    which is a thing they are already sharing.
  */
  const shared = (held ?? []).filter((h) => h.grants.some((g) => g.live));
  const rest = (held ?? []).filter((h) => !h.grants.some((g) => g.live));

  return (
    <Screen
      leave="up"
      onLeave={onBack}
      name="Your vault"
      title={<Title as={Heading}>Your vault</Title>}
      lede="What is held about you, and who can see it. Nothing here belongs to an app."
    >
      <Section name="Shared right now">
        {held === null ? <Waiting rows={3} /> : shared.length === 0 ? (
          <Blank title="You are not sharing anything">
            Everything here is yours alone until you say otherwise. An app that
            wants something will ask, and you can say no.
          </Blank>
        ) : (
          <Card>
            {shared.flatMap((h) =>
              h.grants.filter((g) => g.live).map((g) => (
                <Item
                  key={`${h.fact}:${g.appId}:${g.where ?? ""}`}
                  title={h.label}
                  detail={
                    <>
                      <Chip>{g.where ? `${g.appName} · ${g.where}` : g.appName}</Chip>
                      {NAME[g.reach]}
                      {/* ⚠️ AN EXPIRY IS SHOWN AS A DATE, not as "expires soon".
                          Somebody deciding whether to extend needs the day. */}
                      {g.until ? <Pill>Until {g.until}</Pill> : null}
                    </>
                  }
                  action={
                    <button
                      type="button"
                      className="pill press"
                      onClick={() => setStopping({ fact: h.fact, label: h.label, appId: g.appId, appName: g.appName })}
                    >
                      Stop
                    </button>
                  }
                />
              )),
            )}
          </Card>
        )}
      </Section>

      <Section name="Everything else">
        {held === null ? <Waiting rows={4} /> : (
          <Card>
            {rest.map((h) => (
              <Item
                key={h.fact}
                title={h.label}
                /* ⚠️ WHETHER ANYTHING IS RECORDED, never what it is. This screen
                   is about who can see things; showing the values here would put
                   somebody's whole body on one scrollable page. */
                detail={h.held ? "Recorded · shared with nobody" : <Unset>Nothing recorded</Unset>}
                onGo={() => onOpen(h.fact)}
              />
            ))}
          </Card>
        )}
      </Section>

      {/*
        ⚠️ THE THIRD QUESTION, AND THE ONE NO PRODUCT ANSWERS. A permission list
        says what COULD happen; this says what did. One row per reader per fact
        per day — a row per read would be a write on every render, which is a
        cost somebody eventually turns off, and a log that is off is worth
        nothing at all.
      */}
      <Section name="Who has looked">
        {looks === null ? <Waiting rows={3} /> : looks.length === 0 ? (
          <Blank title="Nobody has read anything of yours">
            This fills in as soon as somebody does, and it is kept whether or not
            you are still sharing with them.
          </Blank>
        ) : (
          <Card>
            {looks.map((l, i) => (
              <Item
                key={`${l.fact}:${l.appName}:${l.on}:${i}`}
                title={l.label}
                detail={
                  <>
                    <Chip>{l.who ?? l.appName}</Chip>
                    {l.on}
                    {/* ⚠️ ONCE IS NOT WORTH A COUNT. "4 times" is information;
                        "1 times" is a template showing through. */}
                    {l.times > 1 ? <Pill>{l.times} times</Pill> : null}
                  </>
                }
              />
            ))}
          </Card>
        )}
      </Section>

      {/*
        ⚠️ A PLAIN PRESS, NOT A TYPED CONFIRMATION. Stopping is reversible in one
        tap and takes nothing away — friction here would train people to tick
        through the ones that matter. What it does need is a sentence saying what
        stops working, because that is the part somebody cannot see.
      */}
      <Confirm
        open={stopping !== null}
        title={`Stop sharing ${stopping?.label ?? ""}?`}
        lede={
          <>
            <Chip>{stopping?.appName}</Chip> will stop being able to read it from
            the next time it looks. Anything it worked out from it before now is
            already theirs, and this does not delete what you recorded.
          </>
        }
        verb="Stop sharing"
        onConfirm={async () => (stopping ? onStop(stopping.fact, stopping.appId) : null)}
        onClose={() => setStopping(null)}
      />
    </Screen>
  );
}

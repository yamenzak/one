/**
 * HOW YOU READ A DATE, A TIME, A NUMBER AND A MEASUREMENT.
 *
 * ⚠️ IT FOLLOWS THE PERSON, NOT THE WORKSPACE, which is why it is here and not
 * in any product's settings. Somebody in three workspaces reads dates one way,
 * and filing this per workspace would be the same choice made three times,
 * disagreeing with itself, with a new workspace starting by getting it wrong.
 *
 * ⚠️ EVERY CONTROL DEFAULTS TO "SAME AS THIS DEVICE", AND MOST PEOPLE NEVER OPEN
 * THIS SCREEN. The browser already knows the language, the region and the zone
 * and is right about all three for almost everybody; this exists for the
 * minority who are travelling, who moved, or whose employer set their laptop to
 * the wrong country.
 *
 * ⚠️ AND IT SHOWS THE ANSWER WHILE THEY CHOOSE. Every one of these settings is
 * invisible until it is applied to something, so a picker with no example beside
 * it asks somebody to predict what "dmy" does to their screen. The preview is
 * the whole reason this is a screen rather than four rows in a list.
 *
 * ⚠️ THERE IS NO LANGUAGE CONTROL YET, DELIBERATELY. Offering one would promise
 * a translated interface, and every string in this product is English — so the
 * language stays the device's, which is what decides month names and nothing
 * else. See `docs/stages.json`, stage 50.
 */

import * as React from "react";
import { useState } from "react";
import {
  Amount, Choice, Clock, Dated, Group, Lookup, Money, Num, Presenting, SPACE, Screen, Section,
  Size, Stack, TYPE, When, notice, useShown,
} from "@engine/design";
import {
  DEFAULT_PRESENTATION, instant, type Machine, type Presentation,
} from "@engine/kernel";
import { api } from "../api.js";
import { useSession } from "../session.js";
import { byName } from "../countries.js";

/* ⚠️ ONE OPTION LIST PER CONTROL, and "auto" is the first entry in every one —
   it is the default and it is what somebody comes back to. */
const SAME = "auto";

const ORDERS = [
  { id: SAME, label: "Same as the region" },
  { id: "dmy", label: "Day, month, year" },
  { id: "mdy", label: "Month, day, year" },
  { id: "ymd", label: "Year, month, day" },
];

const CLOCKS = [
  { id: SAME, label: "Same as the region" },
  { id: "24", label: "24-hour" },
  { id: "12", label: "12-hour" },
];

const UNITS = [
  { id: SAME, label: "Same as the region" },
  { id: "metric", label: "Metric", help: "Kilograms, centimetres, kilometres" },
  { id: "imperial", label: "Imperial", help: "Pounds, inches, miles" },
];

/**
 * ⚠️ ASKED OF THE RUNTIME RATHER THAN LISTED. The zone list is data that changes
 * — Europe/Kyiv was added in 2022 — and a table here would be this file holding
 * an opinion about geopolitics that goes stale. A runtime too old to answer
 * falls back to the one zone that is always right, which is the device's.
 */
const zones = (): readonly string[] => {
  try {
    const of = (Intl as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    return of ? of("timeZone") : [];
  } catch { return []; }
};

export function Formats() {
  const { me, refresh } = useSession();
  const person = me && me !== "nobody" ? me : null;
  const stored = person?.presentation ?? DEFAULT_PRESENTATION;

  /*
    ⚠️ THE FORM HOLDS WHAT IS ON SCREEN AND THE SERVER HOLDS THE TRUTH. Bound
    straight to the loaded answer, a picker cannot be moved — and the preview
    below has to repaint on the choice rather than on the round trip, which is
    the point of the screen.
  */
  const [want, setWant] = useState<Presentation>(stored);
  const here = useShown();

  /* ⚠️ THE PREVIEW IS THE REAL ELEMENTS UNDER A SECOND `Presenting`, resolved
     from what is PICKED rather than from what is saved — so the examples repaint
     on the choice rather than on the round trip, and they are drawn by the same
     components every other screen uses rather than by a preview that could
     disagree with them. */
  const machine: Machine = { locale: here.locale, zone: here.zone };

  const set = async (next: Presentation) => {
    setWant(next);
    const out = await api.post("me.presentation", { presentation: next });
    if (!out.ok) {
      /* ⚠️ ROLLED BACK TO WHAT THE SERVER HOLDS, not left showing a value it
         refused — a control displaying a setting that did not save is the
         silent failure `useConfirmedState` exists to prevent. */
      setWant(stored);
      notice.fail(out.problem.title);
      return;
    }
    notice.ok("Saved.");
    void refresh();
  };

  const countries = [
    { id: SAME, label: "Same as this device" },
    ...byName().map((c) => ({ id: c.code, label: c.name })),
  ];

  const timeZones = [
    { id: SAME, label: "Same as this device" },
    ...zones().map((z) => ({ id: z, label: z.replace(/_/g, " ") })),
  ];

  return (
    /* ⚠️ `settings` — every control saves itself, so the shape refuses a primary
       action outright (`screen.tsx`). */
    <Screen shape="settings">
      <Group
        label="Where you are"
        under="It decides the separators, the date order and where a currency sits"
      >
        <Lookup
          label="Region"
          value={want.region}
          options={countries}
          onChange={(region) => void set({ ...want, region })}
        />
        <Lookup
          label="Time zone"
          help="What today means, and every time on every screen"
          value={want.zone}
          options={timeZones}
          onChange={(zone) => void set({ ...want, zone })}
        />
      </Group>

      <Group label="How it is written">
        <Choice
          label="Dates"
          value={want.dateOrder}
          options={ORDERS}
          onChange={(dateOrder) => void set({ ...want, dateOrder: dateOrder as never })}
        />
        <Choice
          label="Clock"
          value={want.clock}
          options={CLOCKS}
          onChange={(clock) => void set({ ...want, clock: clock as never })}
        />
        <Choice
          label="Measurements"
          value={want.units}
          options={UNITS}
          onChange={(units) => void set({ ...want, units: units as never })}
        />
      </Group>

      <Presenting of={want} machine={machine}><Preview /></Presenting>
    </Screen>
  );
}

/**
 * ⚠️ THE SAME VALUE IN EVERY SHAPE THE PRODUCT DRAWS, so the consequence of a
 * choice is on screen beside the control that made it. Two of these — the price
 * and the weight — are the ones people get wrong when guessing: a region moves a
 * currency symbol across the number, and it is not obvious that it would.
 *
 * ⚠️ AND IT IS THE REAL ELEMENTS. A preview built from the `say*` functions
 * would be a second renderer that could drift from the one the product uses, and
 * the whole promise of the screen is that what is shown here is what will be
 * shown everywhere.
 */
function Preview() {
  const now = instant();
  return (
    <Section label="What that looks like">
      <Stack space="tight">
        <Line says="A date"><Dated at={now} length="long" /></Line>
        <Line says="In a column"><Dated at={now} length="numeric" /></Line>
        <Line says="A time"><Clock at={now} /></Line>
        {/* ⚠️ WHAT A LIST OF THINGS THAT HAPPENED WILL SAY OVER TODAY'S — see
            the inbox. It is the one example here that is not a format at all
            but a WORD, and somebody changing their zone is changing which day
            it names. */}
        <Line says="In the inbox"><When at={now} now={now} /></Line>
        <Line says="A number"><Num value={1234567.5} places={2} /></Line>
        <Line says="A price"><Money minor={123456} currency="EUR" size="label" /></Line>
        <Line says="A weight"><Amount base={82000} measure="mass" /></Line>
        <Line says="A distance"><Amount base={5000} measure="distance" /></Line>
        <Line says="A file"><Size bytes={5 * 1024 ** 3} /></Line>
      </Stack>
    </Section>
  );
}

/* ⚠️ `SPACE`, NOT A CHOSEN GAP — see `metrics.ts`. A row that picks its own
   rhythm is a row that does not match the ones above it. */
const Line = ({ says, children }: {
  readonly says: string;
  readonly children: React.ReactNode;
}) => (
  <div className={`flex items-baseline justify-between ${SPACE.roomy}`}>
    <span className={TYPE.note}>{says}</span>
    {children}
  </div>
);

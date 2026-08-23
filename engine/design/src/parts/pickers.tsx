/**
 * THE TWO FIELD KINDS THAT COST MORE THAN THE REST OF THE PRODUCT PUT TOGETHER.
 *
 * ⚠️ A GENERIC RENDERER IMPORTS EVERY KIND IT CAN DRAW, AND THAT IS THE WHOLE
 * PROBLEM. `field.tsx` answers "a declared field becomes a control" for any
 * kind, so a static import of each one puts all of them in the module graph of
 * anything that can render a field — which is every screen, which is the entry
 * chunk. A calendar and a colour picker were downloaded, parsed and compiled
 * before the LOADING CURTAIN could draw, on every visit to every app on this
 * engine, including screens with no form on them at all.
 *
 * ⚠️ AND IT IS THESE TWO BECAUSE THEY WERE MEASURED, not because they look
 * heavy. Attributed through the source map by emitted bytes, HeroUI's calendar
 * alone was the single largest module in the bundle at 53 KB; with the colour
 * area, the hue slider, the date segments and `@internationalized/date` behind
 * them the two kinds were 154 KB of a 1,354 KB entry. Everything else a field
 * can be — a switch, a select, a number, a box to type in — is small and is
 * drawn on nearly every screen, so splitting it would buy a round trip and save
 * nothing.
 *
 * ⚠️ ONE MODULE FOR BOTH, NOT ONE EACH. They share the overlay, focus and
 * collection machinery underneath; split further, the second kind on a screen
 * pays a second round trip for code the first already fetched.
 *
 * ⚠️ THE VALUES STILL CROSS AS STRINGS. A hex string and an ISO date are what
 * is STORED; the picker's own `Color` and `DateValue` objects are a rendering
 * detail and must not reach a manifest's setting.
 */

import * as React from "react";
import {
  Calendar, ColorArea, ColorField, ColorPicker, ColorSlider, ColorSwatch,
  DateField, DatePicker, DateRangePicker, Label, RangeCalendar,
} from "@heroui/react";
import { parseDate, parseDateTime } from "@internationalized/date";
import type { DateValue } from "@internationalized/date";
import { TYPE } from "../tokens/type.js";
import { Naming, Tail } from "./forms.js";

/**
 * ⚠️ WHAT BOTH NEED, AND `tail` IS ONE OF THEM. The help text and the refusal
 * under a control are `field.tsx`'s to compose — one tail for every kind is what
 * makes a refusal look the same under a date picker as under a text box — so it
 * arrives already built rather than being assembled twice.
 */
export interface PickerProps {
  readonly label: string;
  readonly value: unknown;
  readonly onChange: (value: unknown) => void;
  readonly disabled?: boolean;
  /** ⚠️ The value has not arrived. Distinct from empty — see `field.tsx`. */
  readonly pending?: boolean;
  readonly bare?: boolean;
  readonly invalid?: boolean;
  readonly tail: React.ReactNode;
}

/**
 * A COLOUR IS THE LIBRARY'S COLOUR PICKER.
 *
 * ⚠️ THIS KIND FELL THROUGH TO THE TEXT CASE ONCE, so a workspace's brand
 * colour was a box holding `#2563eb`, to be typed correctly by somebody who
 * already knows hex. The next attempt was a native `<input type="color">`, which
 * is a swatch and nothing else — no presets, no keyboard channel entry, and a
 * dialogue belonging to the operating system rather than to this product.
 */
export function Colour(
  { label, value, onChange, disabled, pending, bare, tail }: PickerProps,
) {
  return (
    <ColorPicker
      value={typeof value === "string" && value ? value : "#000000"}
      onChange={(next) => onChange(next.toString("hex"))}
    >
      {/* ⚠️ THE TRIGGER TAKES THE DISABLED STATE, because react-aria's
          `ColorPicker` is state and has no interactive surface of its own —
          the trigger is the button, and it is what a person can press. */}
      <ColorPicker.Trigger isDisabled={disabled || pending}>
        <ColorSwatch size="lg" />
        {bare ? null : <Label>{label}</Label>}
        {/* ⚠️ THE VALUE IN WORDS, BECAUSE A SWATCH CANNOT SAY "UNSET". An
            empty colour falls back to `#000000` above — it has to, the picker
            needs one — and a black disc is indistinguishable from a black
            somebody chose. On a dark card it is not even a disc: it is a hole.
            So the hex is written beside it, and when there is nothing it says
            so.

            ⚠️ AND IT STAYS IN `bare`, WHERE THE LABEL DOES NOT. `bare` drops
            the NAME because the row beside it already said that; the VALUE is
            the one thing a trailing control is for. Dropping both left a
            settings row whose entire answer was a coloured disc. */}
        <span className={TYPE.note}>
          {typeof value === "string" && value ? value : "Not set"}
        </span>
      </ColorPicker.Trigger>
      <ColorPicker.Popover>
        <ColorArea
          aria-label={`${label} — saturation and brightness`}
          className="max-w-full"
          colorSpace="hsb"
          xChannel="saturation"
          yChannel="brightness"
        >
          <ColorArea.Thumb />
        </ColorArea>
        <ColorSlider aria-label={`${label} — hue`} channel="hue" colorSpace="hsb">
          <ColorSlider.Track><ColorSlider.Thumb /></ColorSlider.Track>
        </ColorSlider>
        {/* ⚠️ The hex field stays, because a brand colour is usually one
            somebody was GIVEN rather than one they are choosing. */}
        <ColorField aria-label={`${label} — hex`}>
          <ColorField.Group variant="secondary">
            <ColorField.Prefix><ColorSwatch size="xs" /></ColorField.Prefix>
            <ColorField.Input />
          </ColorField.Group>
        </ColorField>
      </ColorPicker.Popover>
      {/* ⚠️ THE ONE KIND WHOSE TAIL IS OUTSIDE ITS TRIGGER, because the trigger
          is a swatch and a sentence does not belong inside it. */}
      {tail}
    </ColorPicker>
  );
}

/**
 * A DAY, OR A MOMENT, AS THE LIBRARY'S DATE PICKER.
 *
 * ⚠️ A TEXT BOX ASKING FOR A DATE GETS `12/03` FROM HALF OF EUROPE and the other
 * half of it from everywhere else; a native `<input type="date">` fixes the
 * ambiguity and hands the calendar to the operating system, which is a different
 * product appearing inside this one.
 */
export function DayPicker(
  { kind, label, value, onChange, disabled, pending, bare, invalid, tail }:
  PickerProps & { readonly kind: "day" | "instant" },
) {
  return (
    <DatePicker
      value={asDate(value, kind)}
      granularity={kind === "day" ? "day" : "minute"}
      isDisabled={disabled || pending}
      isInvalid={invalid}
      onChange={(next) => onChange(next ? next.toString() : null)}
      aria-label={bare ? label : undefined}
    >
      {bare ? null : <Label>{label}</Label>}
      <DateField.Group fullWidth>
        <DateField.Input>{(segment) => <DateField.Segment segment={segment} />}</DateField.Input>
        <DateField.Suffix>
          <DatePicker.Trigger><DatePicker.TriggerIndicator /></DatePicker.Trigger>
        </DateField.Suffix>
      </DateField.Group>
      {tail}
      <DatePicker.Popover>
        <Calendar aria-label={label}>
          <Calendar.Header>
            <Calendar.YearPickerTrigger>
              <Calendar.YearPickerTriggerHeading />
              <Calendar.YearPickerTriggerIndicator />
            </Calendar.YearPickerTrigger>
            <Calendar.NavButton slot="previous" />
            <Calendar.NavButton slot="next" />
          </Calendar.Header>
          <Calendar.Grid>
            <Calendar.GridHeader>
              {(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}
            </Calendar.GridHeader>
            <Calendar.GridBody>{(date) => <Calendar.Cell date={date} />}</Calendar.GridBody>
          </Calendar.Grid>
          <Calendar.YearPickerGrid>
            <Calendar.YearPickerGridBody>
              {({ year }) => <Calendar.YearPickerCell year={year} />}
            </Calendar.YearPickerGridBody>
          </Calendar.YearPickerGrid>
        </Calendar>
      </DatePicker.Popover>
    </DatePicker>
  );
}

/**
 * ⚠️ AN UNPARSEABLE STORED VALUE IS `null`, NOT A THROW. `parseDate` raises on
 * anything that is not exactly its format, and a row written before this kind
 * existed would take the whole screen down rather than show one empty field.
 */
function asDate(value: unknown, kind: "day" | "instant"): DateValue | null {
  if (typeof value !== "string" || !value) return null;
  try {
    return kind === "day" ? parseDate(value) : parseDateTime(value.replace(/Z$/, ""));
  } catch {
    return null;
  }
}

/* -------------------------------------------------------- the form's two --- */

/**
 * ONE DATE, ON A FORM.
 *
 * ⚠️ `DayField` AND `DayPicker`, BECAUSE `Dated` AND `When` ARE TAKEN. `said.tsx`
 * has both — they SAY a date, in words, and these two collect one. Two
 * components under one name in one package is a barrel where the second wins
 * silently, and a document that attributes one of them to the wrong file.
 *
 * ⚠️ UNCONTROLLED, REPORTING ISO — the one exception to `forms.tsx`'s controlled
 * rule, and the reason is this module's whole subject: constructing a calendar
 * value from a string needs `@internationalized/date`, and a dependency for that
 * conversion belongs to the app that wants a controlled date rather than to
 * every consumer of this package.
 */
export function DayField({ label, help, error, disabled, onChange }: {
  readonly label: string;
  readonly help?: string;
  readonly error?: string;
  readonly disabled?: boolean;
  /** `YYYY-MM-DD`, or null when cleared. */
  readonly onChange: (iso: string | null) => void;
}) {
  return (
    <DateField
      isDisabled={disabled}
      isInvalid={error !== undefined}
      onChange={(v) => onChange(v ? v.toString() : null)}
    >
      <Naming>{label}</Naming>
      <DateField.Group>
        <DateField.Input>
          {(segment) => <DateField.Segment segment={segment} />}
        </DateField.Input>
      </DateField.Group>
      <Tail help={help} error={error} />
    </DateField>
  );
}

/**
 * TWO DATES — the custom half of a period.
 *
 * ⚠️ REPORTED ONLY WHEN BOTH ENDS ARE IN. A half-entered range is not a period,
 * and handing one on would redraw the figure over a span the person is still in
 * the middle of choosing.
 */
export function Ranged({ label, disabled, onChange }: {
  readonly label: string;
  readonly disabled?: boolean;
  readonly onChange: (dates: { readonly from: string; readonly to: string }) => void;
}) {
  return (
    <DateRangePicker
      isDisabled={disabled}
      onChange={(v) => {
        if (!v?.start || !v.end) return;
        onChange({ from: v.start.toString(), to: v.end.toString() });
      }}
    >
      <Label className="sr-only">{label}</Label>
      <DateField.Group fullWidth>
        <DateField.Input slot="start">
          {(segment) => <DateField.Segment segment={segment} />}
        </DateField.Input>
        <DateRangePicker.RangeSeparator />
        <DateField.Input slot="end">
          {(segment) => <DateField.Segment segment={segment} />}
        </DateField.Input>
        <DateField.Suffix>
          <DateRangePicker.Trigger>
            <DateRangePicker.TriggerIndicator />
          </DateRangePicker.Trigger>
        </DateField.Suffix>
      </DateField.Group>
      <DateRangePicker.Popover>
        <RangeCalendar aria-label={label}>
          <RangeCalendar.Header>
            <RangeCalendar.YearPickerTrigger>
              <RangeCalendar.YearPickerTriggerHeading />
              <RangeCalendar.YearPickerTriggerIndicator />
            </RangeCalendar.YearPickerTrigger>
            <RangeCalendar.NavButton slot="previous" />
            <RangeCalendar.NavButton slot="next" />
          </RangeCalendar.Header>
          <RangeCalendar.Grid>
            <RangeCalendar.GridHeader>
              {(day) => <RangeCalendar.HeaderCell>{day}</RangeCalendar.HeaderCell>}
            </RangeCalendar.GridHeader>
            <RangeCalendar.GridBody>
              {(date) => <RangeCalendar.Cell date={date} />}
            </RangeCalendar.GridBody>
          </RangeCalendar.Grid>
          <RangeCalendar.YearPickerGrid>
            <RangeCalendar.YearPickerGridBody>
              {({ year }) => <RangeCalendar.YearPickerCell year={year} />}
            </RangeCalendar.YearPickerGridBody>
          </RangeCalendar.YearPickerGrid>
        </RangeCalendar>
      </DateRangePicker.Popover>
    </DateRangePicker>
  );
}

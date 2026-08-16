/**
 * EVERY WAY A PERSON TELLS THE PRODUCT SOMETHING, DECIDED ONCE.
 *
 * ⚠️ ONE GRAMMAR ACROSS EVERY CONTROL. Each control here takes the same four
 * sentences — `label` (what this is), `help` (what to know before answering),
 * `error` (why the answer was refused), `disabled` (why it cannot be answered
 * now) — and renders them in the same places. A form where the error sits in a
 * different spot per field is a form where a refusal gets missed; the grammar
 * is the feature, the widgets are plumbing.
 *
 * ⚠️ THE ERROR IS A SENTENCE THE CALLER OWNS. These controls never validate;
 * the kernel and the route decide what is acceptable, and the words arrive
 * here ready to show. A control that invents "invalid input" is a control that
 * argues with the server about what is wrong.
 *
 * ⚠️ CONTROLLED, AND `undefined` MEANS NOT KNOWN YET. The same rule as
 * `field.tsx`: a control whose value has not arrived renders as pending rather
 * than as empty — a switch showing "off" while loading is a wrong answer
 * wearing a loading state's excuse. The two date/time controls are the one
 * exception (uncontrolled, reporting ISO strings), because constructing their
 * calendar values requires a library this package deliberately does not
 * depend on.
 *
 * ⚠️ A SECRET IS NEVER RENDERED BACK — `SecretInput` shows whether one is
 * stored; the value has one direction. See `field.tsx`.
 */

import * as React from "react";
import {
  Checkbox, CheckboxGroup, ComboBox, DateField, DateRangePicker, Description, FieldError, Input, InputGroup,
  InputOTP, Label, ListBox, NumberField, Radio, RadioGroup, REGEXP_ONLY_DIGITS, SearchField,
  RangeCalendar, Select, Slider, Tag, TagGroup, TextArea, TextField, TimeField, ToggleButton,
  ToggleButtonGroup,
} from "@heroui/react";
import { CODE_SLOT, SPACE } from "../tokens/metrics.js";

/* ⚠️ The code box's height, beside the control that sets it. */
export { CODE_SLOT };

/* ---------------------------------------------------------------- grammar --- */

/** The four sentences every control speaks. See the header. */
export interface Said {
  readonly label: string;
  readonly help?: string;
  /** Why the value was refused — the caller's words, shown under the control. */
  readonly error?: string;
  readonly disabled?: boolean;
}

/** One thing a person can pick. `help` is the line under it, where the control shows one. */
export interface Option {
  readonly id: string;
  readonly label: string;
  readonly help?: string;
}

const said = (p: Said) => ({
  isDisabled: p.disabled === true,
  isInvalid: p.error !== undefined,
});

/** The help line and the refusal, in that order, wherever the control puts its tail. */
const Tail = ({ help, error }: Pick<Said, "help" | "error">) => (
  <>
    {help ? <Description>{help}</Description> : null}
    {error ? <FieldError>{error}</FieldError> : null}
  </>
);

/* ------------------------------------------------------------------- text --- */

/**
 * ⚠️ `name` AND `autoFocus` ARE MECHANICS, NOT SENTENCES, WHICH IS WHY THEY ARE
 * HERE AND NOT IN `Said`. They are also the whole reason two screens went round
 * this grammar: the sign-in and the workspace wizard each hand-built a
 * `TextField` + `Label` + `Input` because the shared control could not be
 * focused on arrival or named for a form. A grammar missing a mechanic is a
 * grammar that gets bypassed, and once bypassed its label, help, error and
 * disabled placement are all decided again, by hand, on the two screens a person
 * meets first.
 */
export interface TextInputProps extends Said {
  /** `undefined` = not known yet; the control renders pending. */
  readonly value: string | undefined;
  readonly onChange: (value: string) => void;
  readonly kind?: "text" | "email" | "url" | "tel";
  readonly placeholder?: string;
  /** Something before/after the text — a glyph, a unit, a fixed prefix. */
  readonly before?: React.ReactNode;
  readonly after?: React.ReactNode;
  /** For form submission, and for a browser that fills things in. */
  readonly name?: string;
  readonly autoComplete?: string;
  /** ⚠️ One per screen. Two fields both claiming the caret is a race. */
  readonly autoFocus?: boolean;
}

export function TextInput({
  value, onChange, kind = "text", placeholder, before, after, name, autoComplete, autoFocus, ...p
}: TextInputProps) {
  const pending = value === undefined;
  return (
    <TextField
      fullWidth
      name={name}
      value={value ?? ""}
      onChange={onChange}
      type={kind === "text" ? undefined : kind}
      {...said(p)}
      isDisabled={p.disabled === true || pending}
    >
      <Label>{p.label}</Label>
      {before || after ? (
        <InputGroup>
          {before ? <InputGroup.Prefix>{before}</InputGroup.Prefix> : null}
          <InputGroup.Input autoFocus={autoFocus} autoComplete={autoComplete} placeholder={placeholder} />
          {after ? <InputGroup.Suffix>{after}</InputGroup.Suffix> : null}
        </InputGroup>
      ) : (
        <Input autoFocus={autoFocus} autoComplete={autoComplete} placeholder={placeholder} />
      )}
      <Tail help={p.help} error={p.error} />
    </TextField>
  );
}

/** ⚠️ ONE DIRECTION. What it shows is whether a value is stored — never the value. */
export function SecretInput({ set, onChange, ...p }: Said & {
  readonly set: boolean | undefined;
  readonly onChange: (value: string) => void;
}) {
  const pending = set === undefined;
  return (
    <TextField
      defaultValue=""
      onChange={onChange}
      type="password"
      {...said(p)}
      isDisabled={p.disabled === true || pending}
    >
      <Label>{p.label}</Label>
      <Input placeholder={set ? "Stored. Type to replace it." : undefined} autoComplete="off" />
      <Tail help={p.help} error={p.error} />
    </TextField>
  );
}

export function LongText({ value, onChange, placeholder, ...p }: Said & {
  readonly value: string | undefined;
  readonly onChange: (value: string) => void;
  readonly placeholder?: string;
}) {
  const pending = value === undefined;
  return (
    <TextField value={value ?? ""} onChange={onChange} {...said(p)} isDisabled={p.disabled === true || pending}>
      <Label>{p.label}</Label>
      <TextArea placeholder={placeholder} />
      <Tail help={p.help} error={p.error} />
    </TextField>
  );
}

export function SearchInput({ value, onChange, placeholder, ...p }: Omit<Said, "error"> & {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly placeholder?: string;
}) {
  return (
    <SearchField value={value} onChange={onChange} isDisabled={p.disabled === true} aria-label={p.label}>
      <SearchField.Group>
        <SearchField.SearchIcon />
        <SearchField.Input placeholder={placeholder ?? p.label} />
        <SearchField.ClearButton />
      </SearchField.Group>
      {p.help ? <Description>{p.help}</Description> : null}
    </SearchField>
  );
}

/* ---------------------------------------------------------------- numbers --- */

export interface NumberInputProps extends Said {
  readonly value: number | undefined;
  readonly onChange: (value: number) => void;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  /** Intl format for the rendered value — a unit, a percentage. */
  readonly format?: Intl.NumberFormatOptions;
}

export function NumberInput({ value, onChange, min, max, step, format, ...p }: NumberInputProps) {
  const pending = value === undefined;
  return (
    <NumberField
      value={value ?? Number.NaN}
      onChange={onChange}
      minValue={min}
      maxValue={max}
      step={step}
      formatOptions={format}
      {...said(p)}
      isDisabled={p.disabled === true || pending}
    >
      <Label>{p.label}</Label>
      <NumberField.Group>
        <NumberField.DecrementButton />
        <NumberField.Input />
        <NumberField.IncrementButton />
      </NumberField.Group>
      <Tail help={p.help} error={p.error} />
    </NumberField>
  );
}

/**
 * ⚠️ MONEY IS A NUMBER FIELD WITH ITS CURRENCY BAKED IN, not a text field with
 * a regex. The browser formats it, parses localized typing, and refuses what a
 * hand-rolled parser would have mangled — `1.000,50` is a number in Berlin.
 */
export function MoneyInput({ currency, ...rest }: Omit<NumberInputProps, "format"> & {
  readonly currency: string;
}) {
  return <NumberInput {...rest} format={{ style: "currency", currency }} />;
}

export function Dial({ value, onChange, min = 0, max = 100, step = 1, format, ...p }: Said & {
  readonly value: number | undefined;
  readonly onChange: (value: number) => void;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly format?: Intl.NumberFormatOptions;
}) {
  const pending = value === undefined;
  return (
    <Slider
      value={value ?? min}
      onChange={(next) => onChange(Array.isArray(next) ? (next[0] ?? min) : next)}
      minValue={min}
      maxValue={max}
      step={step}
      formatOptions={format}
      isDisabled={p.disabled === true || pending}
    >
      <Label>{p.label}</Label>
      <Slider.Output />
      <Slider.Track>
        <Slider.Fill />
        <Slider.Thumb />
      </Slider.Track>
      {p.help ? <Description>{p.help}</Description> : null}
    </Slider>
  );
}

/* ---------------------------------------------------------------- choices --- */

export function Choice({ value, onChange, options, placeholder, ...p }: Said & {
  readonly value: string | undefined | null;
  readonly onChange: (id: string) => void;
  readonly options: readonly Option[];
  readonly placeholder?: string;
}) {
  const pending = value === undefined;
  return (
    <Select
      selectedKey={value ?? null}
      onSelectionChange={(key) => { if (key !== null) onChange(String(key)); }}
      placeholder={placeholder ?? "Choose one"}
      {...said(p)}
      isDisabled={p.disabled === true || pending}
    >
      <Label>{p.label}</Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {options.map((o) => (
            <ListBox.Item key={o.id} id={o.id} textValue={o.label}>
              {o.label}
              {o.help ? <Description>{o.help}</Description> : null}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
      <Tail help={p.help} error={p.error} />
    </Select>
  );
}

/**
 * ⚠️ A LOOKUP IS A CHOICE WITH TOO MANY OPTIONS TO SCROLL. Same options shape,
 * same grammar; the difference is that typing narrows. Past a dozen options,
 * `Choice` is the wrong control and this is the right one.
 */
export function Lookup({ value, onChange, options, placeholder, name, autoFocus, ...p }: Said & {
  readonly value: string | undefined | null;
  readonly onChange: (id: string) => void;
  readonly options: readonly Option[];
  readonly placeholder?: string;
  readonly name?: string;
  readonly autoFocus?: boolean;
}) {
  const pending = value === undefined;
  return (
    <ComboBox
      name={name}
      selectedKey={value ?? null}
      onSelectionChange={(key) => { if (key !== null) onChange(String(key)); }}
      {...said(p)}
      isDisabled={p.disabled === true || pending}
    >
      <Label>{p.label}</Label>
      <ComboBox.InputGroup>
        <Input autoFocus={autoFocus} placeholder={placeholder ?? "Type to search"} />
        <ComboBox.Trigger />
      </ComboBox.InputGroup>
      <ComboBox.Popover>
        <ListBox>
          {options.map((o) => (
            <ListBox.Item key={o.id} id={o.id} textValue={o.label}>
              {o.label}
              {o.help ? <Description>{o.help}</Description> : null}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </ComboBox.Popover>
      <Tail help={p.help} error={p.error} />
    </ComboBox>
  );
}

/** One yes/no with its consequences beside it — terms, consent, an irreversible flag. */
export function Agree({ value, onChange, ...p }: Said & {
  readonly value: boolean | undefined;
  readonly onChange: (value: boolean) => void;
}) {
  const pending = value === undefined;
  return (
    <Checkbox
      isSelected={value === true}
      onChange={onChange}
      {...said(p)}
      isDisabled={p.disabled === true || pending}
    >
      <Checkbox.Content>
        <Checkbox.Control>
          <Checkbox.Indicator />
        </Checkbox.Control>
        {p.label}
      </Checkbox.Content>
      <Tail help={p.help} error={p.error} />
    </Checkbox>
  );
}

export function Picks({ value, onChange, options, ...p }: Said & {
  readonly value: readonly string[] | undefined;
  readonly onChange: (ids: readonly string[]) => void;
  readonly options: readonly Option[];
}) {
  const pending = value === undefined;
  return (
    <CheckboxGroup
      value={[...(value ?? [])]}
      onChange={(next) => onChange(next)}
      {...said(p)}
      isDisabled={p.disabled === true || pending}
    >
      <Label>{p.label}</Label>
      {p.help ? <Description>{p.help}</Description> : null}
      {options.map((o) => (
        <Checkbox key={o.id} value={o.id}>
          <Checkbox.Content>
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            {o.label}
          </Checkbox.Content>
          {o.help ? <Description>{o.help}</Description> : null}
        </Checkbox>
      ))}
      {p.error ? <FieldError>{p.error}</FieldError> : null}
    </CheckboxGroup>
  );
}

export function OneOf({ value, onChange, options, ...p }: Said & {
  readonly value: string | undefined | null;
  readonly onChange: (id: string) => void;
  readonly options: readonly Option[];
}) {
  const pending = value === undefined;
  return (
    <RadioGroup
      value={value ?? null}
      onChange={(next) => onChange(next)}
      {...said(p)}
      isDisabled={p.disabled === true || pending}
    >
      <Label>{p.label}</Label>
      {p.help ? <Description>{p.help}</Description> : null}
      {options.map((o) => (
        <Radio key={o.id} value={o.id}>
          <Radio.Content>
            <Radio.Control>
              <Radio.Indicator />
            </Radio.Control>
            {o.label}
          </Radio.Content>
          {o.help ? <Description>{o.help}</Description> : null}
        </Radio>
      ))}
      {p.error ? <FieldError>{p.error}</FieldError> : null}
    </RadioGroup>
  );
}

/**
 * ⚠️ SEGMENTS ARE FOR A CHOICE WORN ON THE SURFACE — a view, a period, a mode —
 * never for data entry. Two to five options, every label short, and one is
 * always selected: a segmented control with nothing chosen is a question the
 * screen is asking itself.
 */
export function Segmented({ value, onChange, options, ...p }: Omit<Said, "help" | "error"> & {
  readonly value: string;
  readonly onChange: (id: string) => void;
  readonly options: readonly Option[];
}) {
  return (
    <ToggleButtonGroup
      aria-label={p.label}
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={[value]}
      onSelectionChange={(keys) => {
        const first = [...keys][0];
        if (first !== undefined) onChange(String(first));
      }}
      isDisabled={p.disabled === true}
      /* ⚠️ IT DIVIDES A PHONE AND SITS AT ITS OWN SIZE ON A DESKTOP. At its
         intrinsic width a five-segment control is ~363px, which is wider than
         the column left inside a 390px screen — so it ran past the edge with its
         last segment cut off, in the one place a filter is most likely to
         appear. Below `sm` the group fills and the segments share it; from `sm`
         it goes back to being content-sized, because a filter stretched across a
         desktop panel is a control pretending to be a toolbar. */
      className="w-full sm:w-auto"
    >
      {options.map((o, i) => (
        <ToggleButton key={o.id} id={o.id} className="grow basis-0 sm:grow-0 sm:basis-auto">
          {i > 0 ? <ToggleButtonGroup.Separator /> : null}
          {o.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}

/** Chosen things, worn as a row. Removable where `onRemove` is given. */
export function Tags({ items, onRemove, ...p }: Omit<Said, "error"> & {
  readonly items: readonly Option[];
  readonly onRemove?: (id: string) => void;
}) {
  return (
    <TagGroup
      aria-label={p.label}
      onRemove={onRemove ? (keys) => { for (const k of keys) onRemove(String(k)); } : undefined}
    >
      <Label>{p.label}</Label>
      <TagGroup.List>
        {items.map((o) => (
          <Tag key={o.id} id={o.id} textValue={o.label}>
            {o.label}
            {onRemove ? <Tag.RemoveButton /> : null}
          </Tag>
        ))}
      </TagGroup.List>
      {p.help ? <Description>{p.help}</Description> : null}
    </TagGroup>
  );
}

/* ------------------------------------------------------------- when --- */

/**
 * ⚠️ UNCONTROLLED, REPORTING ISO — the one exception to the controlled rule,
 * and the header says why: constructing a calendar value from a string needs
 * `@internationalized/date`, and a dependency for that conversion belongs to
 * the app that wants a controlled date, not to every consumer of this package.
 */
export function DateInput({ onChange, ...p }: Said & {
  /** `YYYY-MM-DD`, or null when cleared. */
  readonly onChange: (iso: string | null) => void;
}) {
  return (
    <DateField onChange={(v) => onChange(v ? v.toString() : null)} {...said(p)}>
      <Label>{p.label}</Label>
      <DateField.Group>
        <DateField.Input>
          {(segment) => <DateField.Segment segment={segment} />}
        </DateField.Input>
      </DateField.Group>
      <Tail help={p.help} error={p.error} />
    </DateField>
  );
}

export function TimeInput({ onChange, ...p }: Said & {
  /** `HH:MM[:SS]`, or null when cleared. */
  readonly onChange: (iso: string | null) => void;
}) {
  return (
    <TimeField onChange={(v) => onChange(v ? v.toString() : null)} {...said(p)}>
      <Label>{p.label}</Label>
      <TimeField.Group>
        <TimeField.Input>
          {(segment) => <TimeField.Segment segment={segment} />}
        </TimeField.Input>
      </TimeField.Group>
      <Tail help={p.help} error={p.error} />
    </TimeField>
  );
}

/* ------------------------------------------------------------------- code --- */

/**
 * THE EMAILED CODE, AND THE BOXES ARE COUNTED RATHER THAN WRITTEN OUT.
 *
 * ⚠️ THE NUMBER OF BOXES IS THE SERVER'S, AND WRITING THEM OUT BREAKS THAT. The
 * screen this came from opened by saying so — "a form drawing six against a
 * server issuing eight refuses every valid code and blames the person while
 * doing it" — and then drew six `<InputOTP.Slot index={0..5}>` by hand under the
 * sentence. `maxLength` was already the kernel's constant, so raising it would
 * have left a six-box form silently unable to accept anything. The slots are
 * derived from `digits` here, which is the only version where that comment is
 * true.
 *
 * ⚠️ AND THE BOXES SPAN THE FORM, LIKE EVERY OTHER CONTROL ON IT. At their
 * intrinsic size they sit two thirds of the way across, under a full-width
 * button and over another — a row that stops short reads as a control that
 * failed to size itself rather than as a decision.
 */
export function CodeEntry({ digits, value, onChange, onDone, autoFocus, ...p }: Omit<Said, "label"> & {
  readonly digits: number;
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** Fired when the last box is filled — the code is complete, so submit. */
  readonly onDone?: () => void;
  readonly autoFocus?: boolean;
  /**
   * ⚠️ `sr-only`, ALWAYS, AND THAT IS WHY IT IS NOT IN `Said`. Whatever screen
   * this is on has already said which inbox to look in, in a sentence; a second
   * "the code we sent to …" over the boxes is the same fact twice. It stays in
   * the accessibility tree because the boxes on their own are N unnamed inputs.
   */
  readonly label?: string;
}) {
  /* ⚠️ TWO GROUPS FOR ANYTHING LONGER THAN FOUR, ONE BELOW. A six-figure code
     reads as two threes and an eight as two fours; a five reads as three and
     two. Four or fewer is a single run — a separator there is punctuation
     between two digits and one. */
  const split = digits > 4 ? Math.ceil(digits / 2) : digits;
  const groups: readonly (readonly [number, number])[] = split === digits
    ? [[0, digits]]
    : [[0, split], [split, digits]];
  return (
    <InputOTP
      autoFocus={autoFocus}
      maxLength={digits}
      pattern={REGEXP_ONLY_DIGITS}
      value={value}
      onChange={onChange}
      onComplete={onDone}
      isDisabled={p.disabled === true}
      className="w-full"
      aria-label={p.label ?? "Your code"}
    >
      {groups.map(([from, to], at) => (
        <React.Fragment key={from}>
          {at > 0 ? <InputOTP.Separator /> : null}
          {/* ⚠️ THE GROUPS GROW AND THE SLOTS SHARE THEM, so the boxes divide
              the width instead of a further one being invented for it. */}
          <InputOTP.Group className="grow">
            {Array.from({ length: to - from }, (_, i) => (
              <InputOTP.Slot key={from + i} index={from + i} className={`grow ${CODE_SLOT}`} />
            ))}
          </InputOTP.Group>
        </React.Fragment>
      ))}
    </InputOTP>
  );
}

/* ----------------------------------------------------------------- period --- */

/**
 * A stretch of time, both ends inclusive, as `YYYY-MM-DD`.
 *
 * ⚠️ NOT `Span` — the chart engine already has one, and its is `{min, max}` of
 * NUMBERS. Two types called the same thing across one package's public surface
 * is a compile error today and, if either ever loosened, a plot drawn over an
 * axis it was never given.
 */
export interface Dates {
  readonly from: string;
  readonly to: string;
}

/**
 * The named stretches, in the order they are offered.
 *
 * ⚠️ NAMED FIRST, DATES SECOND, BECAUSE THAT IS WHAT PEOPLE ACTUALLY WANT. Every
 * report question is "how are we doing lately" long before it is "between the
 * 3rd and the 19th"; a control that opens on a calendar makes the common answer
 * two taps and a decision. The exact case is one more option, not the default.
 */
export const PERIODS = [
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
] as const;

export type PeriodId = (typeof PERIODS)[number]["id"] | "custom";

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const DAY = 86_400_000;

/**
 * ⚠️ UTC THROUGHOUT, AND `Date.UTC` RATHER THAN `new Date(text)`. Parsing a
 * `YYYY-MM-DD` string gives midnight UTC but reading it back through the local
 * getters gives the previous day for anybody west of Greenwich — so a report run
 * in New York would start and end one day early, every time, and look right to
 * whoever wrote it.
 *
 * ⚠️ AND BOTH ENDS ARE INCLUSIVE, SO "7 DAYS" REACHES BACK SIX. Off by one here
 * is a week that is eight days long, which nothing surfaces except a total that
 * quietly disagrees with the one beside it.
 */
export function spanOf(id: PeriodId, today: string): Dates {
  const [y, m, d] = today.split("-").map(Number) as [number, number, number];
  const now = Date.UTC(y, m - 1, d);
  switch (id) {
    case "7d": return { from: iso(now - 6 * DAY), to: today };
    case "30d": return { from: iso(now - 29 * DAY), to: today };
    case "month": return { from: iso(Date.UTC(y, m - 1, 1)), to: today };
    case "year": return { from: iso(Date.UTC(y, 0, 1)), to: today };
    /* ⚠️ A custom span is the caller's; there is nothing to compute. */
    case "custom": return { from: today, to: today };
  }
}

/**
 * THE PERIOD A FIGURE IS SHOWING — one row, above the plot.
 *
 * ⚠️ THIS SLOT EXISTED BEFORE ANYTHING FILLED IT. `ChartPanel.aside` was
 * documented as "a range picker, a filter" while the product had neither, so two
 * screens carried a crown action labelled "Date range" wired to nothing and one
 * put a ghost button reading "This month" above a figure. A slot with no
 * component to put in it is answered by hand, differently, every time.
 *
 * ⚠️ THE CALENDAR IS UNCONTROLLED AND REPORTS ISO STRINGS, for the same reason
 * `DateInput` is: constructing its values needs `@internationalized/date`, and
 * that dependency belongs to an app that wants a controlled calendar rather than
 * to every consumer of this package. Choosing a NAMED period therefore cannot
 * move the calendar — which is correct rather than a compromise, because a named
 * period IS the answer and the calendar is what you open when it is not.
 */
export function PeriodInput({ value, onChange, today, label = "Period", ...p }: Omit<Said, "label"> & {
  readonly value: PeriodId;
  /** The chosen period, and the dates it resolves to. */
  readonly onChange: (id: PeriodId, dates: Dates) => void;
  /** `YYYY-MM-DD`. Passed in so the resolution is a pure function of it. */
  readonly today: string;
  readonly label?: string;
}) {
  return (
    /* ⚠️ THE GAP COMES FROM `SPACE`, NOT FROM A NUMBER. The calendar appears
       under the segments only for the exact case, so this is one thing said in
       two parts rather than two things in a column — `tight` is that pair. */
    <div className={`flex flex-col ${SPACE.tight}`}>
      <Segmented
        label={label}
        value={value}
        onChange={(id) => onChange(id as PeriodId, spanOf(id as PeriodId, today))}
        options={[...PERIODS.map((x) => ({ id: x.id as string, label: x.label })), { id: "custom", label: "Dates" }]}
        disabled={p.disabled}
      />
      {value === "custom" ? (
        /* ⚠️ VERBOSE ON PURPOSE, AND WRITTEN ONCE. A range picker is a field
           group, a separator, a trigger, a popover and a calendar with its own
           header and grid — thirty lines of composition that every screen
           wanting a date range would otherwise write again, slightly
           differently. That is the whole argument for it being here. */
        <DateRangePicker
          isDisabled={p.disabled === true}
          /* ⚠️ REPORTED ONLY WHEN BOTH ENDS ARE IN. A half-entered range is not
             a period, and handing one on would redraw the figure over a span
             the person is still in the middle of choosing. */
          onChange={(v) => {
            if (!v?.start || !v.end) return;
            onChange("custom", { from: v.start.toString(), to: v.end.toString() });
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
      ) : null}
    </div>
  );
}

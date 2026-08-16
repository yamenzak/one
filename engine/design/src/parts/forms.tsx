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
  Checkbox, CheckboxGroup, ComboBox, DateField, Description, FieldError, Input, InputGroup,
  InputOTP, Label, ListBox, NumberField, Radio, RadioGroup, REGEXP_ONLY_DIGITS, SearchField,
  Select, Slider, Tag, TagGroup, TextArea, TextField, TimeField, ToggleButton, ToggleButtonGroup,
} from "@heroui/react";
import { CODE_SLOT } from "../tokens/metrics.js";

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

export interface TextInputProps extends Said {
  /** `undefined` = not known yet; the control renders pending. */
  readonly value: string | undefined;
  readonly onChange: (value: string) => void;
  readonly kind?: "text" | "email" | "url" | "tel";
  readonly placeholder?: string;
  /** Something before/after the text — a glyph, a unit, a fixed prefix. */
  readonly before?: React.ReactNode;
  readonly after?: React.ReactNode;
}

export function TextInput({ value, onChange, kind = "text", placeholder, before, after, ...p }: TextInputProps) {
  const pending = value === undefined;
  return (
    <TextField
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
          <InputGroup.Input placeholder={placeholder} />
          {after ? <InputGroup.Suffix>{after}</InputGroup.Suffix> : null}
        </InputGroup>
      ) : (
        <Input placeholder={placeholder} />
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
export function Lookup({ value, onChange, options, placeholder, ...p }: Said & {
  readonly value: string | undefined | null;
  readonly onChange: (id: string) => void;
  readonly options: readonly Option[];
  readonly placeholder?: string;
}) {
  const pending = value === undefined;
  return (
    <ComboBox
      selectedKey={value ?? null}
      onSelectionChange={(key) => { if (key !== null) onChange(String(key)); }}
      {...said(p)}
      isDisabled={p.disabled === true || pending}
    >
      <Label>{p.label}</Label>
      <ComboBox.InputGroup>
        <Input placeholder={placeholder ?? "Type to search"} />
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
    >
      {options.map((o, i) => (
        <ToggleButton key={o.id} id={o.id}>
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

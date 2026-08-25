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
  Button,
  Checkbox, CheckboxGroup, ComboBox, Description, FieldError, Input, InputGroup,
  InputOTP, Label, ListBox, NumberField, Radio, RadioGroup, REGEXP_ONLY_DIGITS, SearchField,
  Select, Skeleton, Slider, Tag, TagGroup, TextArea, TextField, TimeField, ToggleButton,
  ToggleButtonGroup,
} from "@heroui/react";
import { dayOf, instant } from "@engine/kernel";
import { CODE_SLOT, SPACE } from "../tokens/metrics.js";

/**
 * ⚠️ EVERY DATE SURFACE ARRIVES IN ONE CHUNK — see `pickers.tsx`. A calendar
 * named in this file is a calendar in the entry of every app on the engine,
 * because this is where `TextInput` lives and `TextInput` is on every screen.
 * That is how the range picker on a report came to be downloaded before a phone
 * could paint its loading curtain.
 */
const DayField = React.lazy(() =>
  import("./pickers.js").then((m) => ({ default: m.DayField })));
const Ranged = React.lazy(() =>
  import("./pickers.js").then((m) => ({ default: m.Ranged })));

/** ⚠️ A control-height box, so the form does not jump when the chunk lands. */
const Waiting = () => <Skeleton className="h-10 w-full rounded-xl" />;

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

/* ------------------------------------------------------------ named twice --- */

/**
 * ⚠️ A ROW THAT ALREADY PRINTED THE NAME, so the control inside it must not
 * print it again. `ControlRow` exists precisely to put a label beside a control,
 * and every control here renders its own — so the pair reads "Name / Name",
 * "Brand / Brand", "Barcode / Barcode" down a card, which on the import screen
 * was seven fields each named twice.
 *
 * ⚠️ A CONTEXT RATHER THAN A PROP, BECAUSE THE DEFAULT HAS TO REACH THE CONTROL.
 * A `hideLabel` on every call site is a thing to remember at every call site,
 * and the one somebody forgets looks exactly like a screen nobody has opened.
 *
 * ⚠️ AND HIDDEN, NEVER DROPPED. The label is what a screen reader announces the
 * control as; removing it leaves a select somebody navigating by keyboard cannot
 * identify, which is a worse fault than the one this fixes and an invisible one.
 */
const Named = React.createContext(false);

export function NamedAlready({ children }: { readonly children: React.ReactNode }) {
  return <Named.Provider value>{children}</Named.Provider>;
}

/**
 * ⚠️ EXPORTED FOR THE SAME REASON `Tail` IS. The date surfaces live in
 * `pickers.tsx` so their calendar stays out of the entry chunk, and a label that
 * knows about `Named` is exactly what keeps a control in a settings ROW from
 * printing its own name under the row that already said it.
 */
export function Naming({ children }: { readonly children: React.ReactNode }) {
  return <Label className={React.useContext(Named) ? "sr-only" : undefined}>{children}</Label>;
}

/**
 * The help line and the refusal, in that order, wherever the control puts its tail.
 *
 * ⚠️ EXPORTED, BECAUSE THE DECLARED-FIELD RENDERER NEEDS THE SAME TWO LINES.
 * `rendered/field.tsx` draws a control from a `FieldSpec` rather than from these
 * props, and it had no refusal slot at all — so a `Problem` naming a field was
 * rendered as a title over the form and the sentence about the value never
 * appeared under the value. A second copy of this would be a second answer to
 * "where does a refusal go".
 */
export const Tail = ({ help, error }: Pick<Said, "help" | "error">) => (
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
  /**
   * ⚠️ WHAT ENTER MEANS, WHERE THE FIELD HAS ONE OBVIOUS NEXT STEP. A search
   * box, a code to look up, a name to add — every one of them is a field
   * somebody types into and presses Enter, and without this the key does
   * nothing at all, which reads as a control that ignored them.
   *
   * ⚠️ AND IT IS WHAT MAKES A HANDHELD SCANNER WORK WITH NO CODE AT ALL. Most
   * warehouse scanners are keyboard wedges: they type the code into whatever
   * has the caret and press Enter. A field that answers Enter is a scanner
   * integration; one that does not is a device that appears to be broken.
   */
  readonly onSubmit?: () => void;
}

export function TextInput({
  value, onChange, kind = "text", placeholder, before, after, name, autoComplete,
  autoFocus, onSubmit, ...p
}: TextInputProps) {
  const pending = value === undefined;
  /* ⚠️ ON THE INPUT RATHER THAN ON A `<form>`. Nothing in this product is a form
     element — the submit is a control the screen's shape places — so a form
     wrapped round one field would be a second submit path with its own
     navigation behaviour. */
  const enter = onSubmit
    ? (e: React.KeyboardEvent) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      onSubmit();
    }
    : undefined;
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
      <Naming>{p.label}</Naming>
      {before || after ? (
        <InputGroup>
          {before ? <InputGroup.Prefix>{before}</InputGroup.Prefix> : null}
          <InputGroup.Input autoFocus={autoFocus} autoComplete={autoComplete} placeholder={placeholder} onKeyDown={enter} />
          {after ? <InputGroup.Suffix>{after}</InputGroup.Suffix> : null}
        </InputGroup>
      ) : (
        <Input autoFocus={autoFocus} autoComplete={autoComplete} placeholder={placeholder} onKeyDown={enter} />
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
      <Naming>{p.label}</Naming>
      <Input placeholder={set ? "Stored. Type to replace it." : undefined} autoComplete="off" />
      <Tail help={p.help} error={p.error} />
    </TextField>
  );
}

export function LongText({ value, onChange, placeholder, rows, ...p }: Said & {
  readonly value: string | undefined;
  readonly onChange: (value: string) => void;
  readonly placeholder?: string;
  /**
   * ⚠️ HOW TALL IT OPENS, AND IT IS NOT COSMETIC. A field for three paragraphs
   * that opens at one line is a field somebody writes one line in — the control
   * is the brief. The two long-form fields in the catalogue (a description, the
   * storage and handling notes) were both drawn at the default and both were
   * filled in as a sentence.
   */
  readonly rows?: number;
}) {
  const pending = value === undefined;
  return (
    <TextField value={value ?? ""} onChange={onChange} {...said(p)} isDisabled={p.disabled === true || pending}>
      <Naming>{p.label}</Naming>
      <TextArea placeholder={placeholder} {...(rows === undefined ? {} : { rows })} />
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
      <Naming>{p.label}</Naming>
      {/*
        ⚠️ `h-auto`, BECAUSE THE GROUP IS SHORTER THAN WHAT IS INSIDE IT ON A
        PHONE. HeroUI's group is a hard `h-9` with `overflow-hidden`, and its
        button is `h-10 md:h-9` — so above the breakpoint everything is 36 and
        agrees, and on a phone a 40px button and a 40px input sit in a 36px box
        and are CLIPPED, top and bottom. Measured: group 364x36 holding a 284x40
        input. Letting the group take its children's height is the fix at every
        width, rather than pinning a second number that has to track theirs.
      */}
      <NumberField.Group className="h-auto">
        <NumberField.DecrementButton />
        {/*
          ⚠️ THE VALUE SITS BETWEEN THE TWO CONTROLS, NOT WELDED TO ONE OF THEM.
          The input is `text-start` by default, which is right for a field
          somebody types a sentence into and wrong for a stepper: measured at a
          phone's width the number was hard against the minus with 244px of
          nothing before the plus, so the control read as a text box that
          happened to have buttons rather than as a stepper.

          ⚠️ AND `tabular-nums` SO STEPPING DOES NOT SHUFFLE THE DIGITS. Going
          249 → 250 → 251 under somebody's thumb moves every glyph in a
          proportional face, which reads as the number redrawing rather than
          incrementing.
        */}
        <NumberField.Input className="text-center tabular-nums" />
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
  /**
   * ⚠️ AN ISO CODE, NEVER A SYMBOL — `EUR`, not `€`. And the trap is next door:
   * `Money`, which DISPLAYS an amount, takes the symbol, because it prints the
   * string verbatim. Two props called `currency` on the two money components,
   * meaning opposite things.
   */
  readonly currency: string;
}) {
  /*
    ⚠️ REFUSED HERE RATHER THAN FOUR FRAMES INSIDE `Intl`. Passing the symbol
    throws `Invalid currency code : €` out of `NumberFormatter`, which names
    neither this component nor the screen that called it — the first render of
    the ground's form did exactly that, and the stack was entirely library code. This
    is the same failure with the caller's name on it.
  */
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error(
      `MoneyInput needs an ISO currency code — "EUR", not "${currency}". ` +
      `\`Money\` is the one that takes a symbol.`,
    );
  }
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
      <Naming>{p.label}</Naming>
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
      <Naming>{p.label}</Naming>
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
 * ⚠️ THE CURRENT VALUE, IN THE LIST, WHETHER OR NOT THE CALLER PUT IT THERE.
 * Shared by every control that resolves a KEY against a collection — see
 * `Lookup`. Exported so a test can ask the question without mounting anything.
 */
export const withValue = (
  options: readonly Option[], value: string | undefined | null,
): readonly Option[] => {
  const held = (value ?? "").trim();
  if (!held || options.some((o) => o.id === held)) return options;
  /* ⚠️ FIRST, because it is the current answer and the rest are alternatives. */
  return [{ id: held, label: held }, ...options];
};

/**
 * ⚠️ A LOOKUP IS A CHOICE WITH TOO MANY OPTIONS TO SCROLL. Same options shape,
 * same grammar; the difference is that typing narrows. Past a dozen options,
 * `Choice` is the wrong control and this is the right one.
 *
 * ⚠️ AND IT HOLDS A VALUE ITS OPTIONS DO NOT, WHICH IT DID NOT AND WHICH IS
 * INVISIBLE. `selectedKey` is resolved against the COLLECTION: a key React Aria
 * cannot find in the list renders as an EMPTY input, silently. So a caller that
 * set a value outside the list — a model's answer, a value restored from a
 * record, a unit some other workspace uses — had a control showing a placeholder
 * over state that was correctly full.
 *
 * ⚠️ IT WAS PHOTOGRAPHED ON THE UNIT FIELD. A model read "30 Filmtabletten" off
 * a box and answered `unit`; the field offers what the WORKSPACE already uses,
 * which on a new workspace is nothing; `setUnit` ran, the form was complete, and
 * the person saw an empty box and a placeholder. Then it saved a value they had
 * never seen — which is worse than losing it.
 *
 * ⚠️ SO THE VALUE IS ALWAYS IN THE LIST. Folding it in is the whole fix: the key
 * resolves, the input shows it, and the dropdown shows it as the current choice
 * with everything else under it. The comment at the unit call site already
 * promised this ("anything typed, so a new unit costs nothing"); the control had
 * never been able to do it.
 *
 * ⚠️ AND `own` IS WHAT MAKES TYPING ONE POSSIBLE, WHICH FOLDING THE VALUE IN DID
 * NOT. A selection-only combo box has one source of truth and it is the SELECTED
 * KEY, so text matching no option selects nothing — and React Aria then restores
 * the input to the selection on blur. Typing a word nobody had used before
 * therefore vanished the moment the field lost focus, under help that said "or
 * type your own": the fix above made an existing value visible, and this is what
 * lets a new one be given at all.
 *
 * ⚠️ IT IS OPT-IN BECAUSE HALF OF THESE MUST REFUSE. A unit is a word a person
 * may coin; a supplier, a location and a plan are rows that exist or do not, and
 * a control that quietly accepted a name for one of those would send an id
 * nothing can resolve. So the caller says which kind it is.
 */
export function Lookup({
  value, onChange, options, placeholder, name, autoFocus, own = false, ...p
}: Said & {
  readonly value: string | undefined | null;
  readonly onChange: (id: string) => void;
  readonly options: readonly Option[];
  readonly placeholder?: string;
  readonly name?: string;
  readonly autoFocus?: boolean;
  /** ⚠️ A word the list does not offer is an answer, not a mistake. */
  readonly own?: boolean;
}) {
  const pending = value === undefined;
  const shown = withValue(options, value);
  return (
    <ComboBox
      name={name}
      allowsCustomValue={own}
      /* ⚠️ THE INPUT IS THE ANSWER WHERE A NEW WORD IS ALLOWED, and the selection
         is the answer where it is not — two different sources of truth for two
         different questions. Wiring both in `own` mode is what keeps a picked row
         and a typed word landing in the same place. */
      {...(own
        ? { inputValue: value ?? "", onInputChange: onChange }
        : { selectedKey: value ?? null })}
      onSelectionChange={(key) => {
        if (key === null) return;
        /* ⚠️ THE LABEL, NOT THE KEY, WHERE THE INPUT IS THE ANSWER. The box shows
           the label; storing the id would leave the two disagreeing about what
           was chosen, and the disagreement only shows up on the next render. */
        const picked = shown.find((o) => o.id === String(key));
        onChange(own ? picked?.label ?? String(key) : String(key));
      }}
      {...said(p)}
      isDisabled={p.disabled === true || pending}
    >
      <Naming>{p.label}</Naming>
      <ComboBox.InputGroup>
        <Input autoFocus={autoFocus} placeholder={placeholder ?? "Type to search"} />
        <ComboBox.Trigger />
      </ComboBox.InputGroup>
      <ComboBox.Popover>
        <ListBox>
          {shown.map((o) => (
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
      <Naming>{p.label}</Naming>
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
      <Naming>{p.label}</Naming>
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
export function Segmented({ value, onChange, options, ...p }: Omit<Said, "error"> & {
  readonly value: string;
  readonly onChange: (id: string) => void;
  readonly options: readonly Option[];
}) {
  const group = (
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
         desktop panel is a control pretending to be a toolbar.

         ⚠️ `self-start` IS WHAT MAKES `w-auto` MEAN ANYTHING HERE. A card lays
         its children out in a column and a column stretches them, so an auto
         width is still the card's width — measured at 976px inside a desk-wide
         card, with the library's own `justify-center` then floating four
         segments in the middle of a thousand pixels of nothing. The intent
         above was written and did not happen. */
      className="w-full flex-wrap sm:w-auto sm:flex-nowrap"
    >
      {options.map((o, i) => (
        <ToggleButton key={o.id} id={o.id} className="grow basis-0 sm:grow-0 sm:basis-auto">
          {i > 0 ? <ToggleButtonGroup.Separator /> : null}
          {o.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );

  /* ⚠️ THE LABEL IS DRAWN, AND IT WAS THE ONE CONTROL HERE THAT DROPPED IT. Every
     other control in this file renders `Naming`; this one put `p.label` in an
     `aria-label` and nowhere else, so a screen with TWO of them one above the
     other — the label sheet picks a subject and then a kind — showed two rows of
     unnamed buttons and the words the author wrote reached nobody looking at it.

     ⚠️ AND `NamedAlready` STILL HIDES IT, which is what makes drawing it safe
     rather than a regression on every row that already prints the name. Same
     context, same rule, same as its nine neighbours. */
  return (
    <div className={`flex w-full flex-col ${SPACE.tight} sm:w-auto sm:self-start`}>
      <Naming>{p.label}</Naming>
      {group}
      <Tail help={p.help} />
    </div>
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
      <Naming>{p.label}</Naming>
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

/* -------------------------------------------------------------- words --- */

/**
 * A VOCABULARY: THE WORDS ALREADY IN USE HERE, PLUS ANY NEW ONE — ONE CONTROL.
 *
 * ⚠️ THIS REPLACES FOUR CONTROLS THAT WERE ONE QUESTION. The shape it supersedes
 * was a `Tags` display, a text field, an Add button, and a stack of rows listing
 * the words the workspace already uses — a third of a phone screen, four tab
 * stops, and a person who has to work out that the rows and the field do the
 * same thing by different means. "What do you file this under" is one question
 * and deserves one control.
 *
 * ⚠️ THE KNOWN WORDS ARE OFFERED, NEVER ENFORCED, AND THAT IS THE ENTIRE POINT
 * OF SHOWING THEM. Typed free, a catalogue collects "Cleaning", "Cleaning
 * products" and "Janitorial" across three mornings — all defensible, and between
 * them they make the catalogue unfilterable by the thing it was filed under. A
 * word already in use is one press; a new one costs typing. Nothing is refused.
 *
 * ⚠️ AND THE OFFER NARROWS AS YOU TYPE, WHICH IS WHAT MAKES IT USABLE PAST
 * TWENTY WORDS. Unfiltered, a workspace with sixty kinds shows an arbitrary
 * eight and the person types the fifty-ninth from memory — the collision this
 * exists to prevent, reached by the control that was supposed to prevent it.
 *
 * ⚠️ NOTHING TYPED IS LOST TO A PRESS OF Enter ON A WORD THAT ALREADY EXISTS.
 * Enter takes the FIELD's text, not the first suggestion: a person who typed
 * "Gloves" meaning to create it, over a list showing "Glove liners", gets what
 * they typed. The suggestions are pressed, never defaulted into.
 */
export function Words({ value, onChange, known = [], placeholder, most = 8, ...p }:
  Omit<Said, "error"> & {
    readonly value: readonly string[];
    readonly onChange: (next: readonly string[]) => void;
    /** ⚠️ What this workspace already files things under. */
    readonly known?: readonly Option[];
    readonly placeholder?: string;
    /** ⚠️ How many to offer with nothing typed. A vocabulary is not a list. */
    readonly most?: number;
  }) {
  const [word, setWord] = React.useState("");
  const said = word.trim();

  /* ⚠️ CASE-INSENSITIVE THROUGHOUT, because `box` and `Box` are one word and a
     catalogue that thinks otherwise is the fault this control exists to fix. */
  const has = (one: string) => value.some((held) => held.toLowerCase() === one.toLowerCase());

  const add = (one: string) => {
    const trimmed = one.trim();
    if (!trimmed || has(trimmed)) { setWord(""); return; }
    onChange([...value, trimmed]);
    setWord("");
  };

  const offer = known
    .filter((one) => !has(one.label))
    .filter((one) => !said || one.label.toLowerCase().includes(said.toLowerCase()))
    .slice(0, most);

  /* ⚠️ OFFERED ONLY WHERE IT WOULD ADD SOMETHING NEW. A "create" chip beside a
     word the workspace already has is two ways to do one thing, and the person
     cannot tell which of them they just used. */
  const novel = Boolean(said) && !has(said)
    && !known.some((one) => one.label.toLowerCase() === said.toLowerCase());

  return (
    <div className={`flex flex-col ${SPACE.tight}`}>
      {/* ⚠️ BUILT ON `Tags` RATHER THAN BESIDE IT. What is chosen is drawn the
          same way here as everywhere else in the product, and a removal behaves
          the way a removal behaves — this control adds the way IN, not a second
          way to wear a word. */}
      {value.length
        ? (
          <Tags
            label={p.label}
            items={value.map((one) => ({ id: one, label: one }))}
            onRemove={(id) => { onChange(value.filter((one) => one !== id)); }}
          />
        )
        : <Naming>{p.label}</Naming>}

      <TextInput
        label=""
        value={word}
        onChange={setWord}
        placeholder={placeholder}
        onSubmit={() => { add(said); }}
        help={p.help}
      />

      {/* ⚠️ CHIPS RATHER THAN ROWS, AND THE WIDTH IS THE ARGUMENT. Eight rows are
          eight lines down a phone for eight words averaging nine characters; as
          chips they are two lines, and a vocabulary read at a glance is a
          vocabulary somebody uses instead of typing past. */}
      {novel || offer.length
        ? (
          <div className={`flex flex-wrap ${SPACE.tight}`}>
            {novel
              ? (
                <Button size="sm" variant="primary" onPress={() => { add(said); }}>
                  {/* ⚠️ THE WORD ITSELF, NOT "Add". A button labelled with what it
                      makes is a button nobody has to press to find out. */}
                  {`Add “${said}”`}
                </Button>
              )
              : null}
            {offer.map((one) => (
              <Button
                key={one.id}
                size="sm"
                variant="secondary"
                onPress={() => { add(one.label); }}
              >
                {one.label}
              </Button>
            ))}
          </div>
        )
        : null}
    </div>
  );
}

/* ------------------------------------------------------------- when --- */

/**
 * ⚠️ UNCONTROLLED, REPORTING ISO — the one exception to the controlled rule,
 * and the header says why: constructing a calendar value from a string needs
 * `@internationalized/date`, and a dependency for that conversion belongs to
 * the app that wants a controlled date, not to every consumer of this package.
 */
/**
 * ⚠️ UNCONTROLLED, REPORTING ISO — the one exception to the controlled rule, and
 * `pickers.tsx` says why: constructing a calendar value from a string needs
 * `@internationalized/date`, and a dependency for that conversion belongs to the
 * app that wants a controlled date, not to every consumer of this package.
 *
 * ⚠️ AND THE BOUNDARY IS HERE RATHER THAN AROUND THE FORM. Without one of its
 * own this suspended into whatever boundary happened to be above it — which in a
 * form is every other control on it, blanked together, and in a string render is
 * a thrown "component suspended while responding to synchronous input".
 */
export function DateInput({ onChange, ...p }: Said & {
  /** `YYYY-MM-DD`, or null when cleared. */
  readonly onChange: (iso: string | null) => void;
}) {
  return (
    <React.Suspense fallback={<Waiting />}>
      <DayField {...p} onChange={onChange} />
    </React.Suspense>
  );
}

export function TimeInput({ onChange, ...p }: Said & {
  /** `HH:MM[:SS]`, or null when cleared. */
  readonly onChange: (iso: string | null) => void;
}) {
  return (
    <TimeField onChange={(v) => onChange(v ? v.toString() : null)} {...said(p)}>
      <Naming>{p.label}</Naming>
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

/* ⚠️ `dayOf`, NOT A SLICE. These are day KEYS being shifted by whole days, which
   is the one place the UTC date is the right answer — and saying so with the
   kernel's own function is what distinguishes it from the six screens that cut a
   person's timestamp the same way and named the wrong day. */
const iso = (ms: number) => dayOf(instant(new Date(ms)));
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
        /* ⚠️ A RANGE PICKER IS A FIELD GROUP, A SEPARATOR, A TRIGGER, A POPOVER
           AND A CALENDAR WITH ITS OWN HEADER AND GRID — thirty lines of
           composition every screen wanting a date range would otherwise write
           again, slightly differently. That is the whole argument for it being
           in this package, and `pickers.tsx` is why it is not in this CHUNK. */
        <React.Suspense fallback={<Waiting />}>
          <Ranged
            label={label}
            disabled={p.disabled === true}
            onChange={(dates) => onChange("custom", dates)}
          />
        </React.Suspense>
      ) : null}
    </div>
  );
}

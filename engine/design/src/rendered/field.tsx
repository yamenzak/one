/**
 * A DECLARED FIELD BECOMES A CONTROL.
 *
 * ⚠️ THE KIND CHOOSES THE COMPONENT, AND NOTHING ELSE DOES. A settings screen
 * that picked its own control per row would be a screen where two products
 * offer the same choice differently — and, worse, where a new field kind
 * silently renders as a text box that accepts anything.
 *
 * ⚠️ A SECRET IS NEVER RENDERED BACK. What it shows is whether it is set; the
 * value has one direction. A stored key returned into a form is a credential
 * handed to every script in the page and to whatever the browser saved.
 *
 * ⚠️ AND `null` IS NOT `false`. A control whose value has not arrived yet
 * renders as pending rather than as off — a switch that shows "off" while it is
 * still loading is a wrong answer wearing a loading state's excuse, and somebody
 * will act on it.
 */

import * as React from "react";
import type { FieldSpec } from "@engine/kernel";
import {
  Description, Input, Label, ListBox, NumberField, Select, Skeleton, Switch,
  TextArea, TextField,
} from "@heroui/react";
import { sentence } from "../tokens/type.js";
import { SPACE } from "../tokens/metrics.js";
import { Tail } from "../parts/forms.js";
import type { PickerProps } from "../parts/pickers.js";

/**
 * ⚠️ THE TWO EXPENSIVE KINDS ARE FETCHED WHEN ONE IS DRAWN, AND THIS IS THE ONE
 * PLACE THAT DECIDES IT. A generic renderer imports every kind it can draw, so
 * naming a calendar and a colour picker here put both in the module graph of
 * every screen that can render a field — which is all of them. Measured: 154 KB
 * of a 1,354 KB entry chunk, downloaded, parsed and compiled before the loading
 * curtain could draw. See `pickers.tsx` for why it is these two and no others.
 *
 * ⚠️ TWO DECLARATIONS, ONE MODULE, ONE ROUND TRIP. Both resolve from the same
 * chunk, so a form with a date and a colour on it fetches once.
 */
const Colour = React.lazy(() =>
  import("../parts/pickers.js").then((m) => ({ default: m.Colour })));
const DayPicker = React.lazy(() =>
  import("../parts/pickers.js").then((m) => ({ default: m.DayPicker })));

/**
 * ⚠️ THE CONTROL'S OWN SHAPE WHILE ITS CODE ARRIVES, not a spinner and not
 * nothing. A field that occupies no room until its chunk lands makes the form
 * under it jump; these are the two bars `FormWaiting` draws, which is what every
 * control in `forms.tsx` measures.
 */
const Arriving = ({ bare }: { readonly bare?: boolean }) => (
  <div className={`flex flex-col ${SPACE.tight}`} role="status" aria-label="Loading control">
    {bare ? null : <Skeleton className="h-4 w-28 rounded-full" />}
    <Skeleton className="h-10 w-full rounded-xl" />
  </div>
);

/**
 * ⚠️ THE SUSPENSE BOUNDARY IS PER FIELD, NOT PER FORM. One boundary around the
 * whole form would blank every control on it — including the ones already
 * rendered — for as long as one lazy chunk took to arrive.
 */
const Awaited = (
  { bare, children }: { readonly bare?: boolean; readonly children: React.ReactNode },
) => <React.Suspense fallback={<Arriving bare={bare} />}>{children}</React.Suspense>;

export interface FieldProps {
  readonly name: string;
  readonly spec: FieldSpec;
  /** ⚠️ `undefined` means not known yet. See the header. */
  readonly value: unknown;
  readonly onChange: (value: unknown) => void;
  readonly disabled?: boolean;
  /** For a secret: whether one is stored. The value itself never arrives. */
  readonly set?: boolean;
  /**
   * ⚠️ THE CONTROL ALONE, FOR A ROW THAT ALREADY SAID WHAT IT IS. A settings
   * list puts the name and its explanation on the left and the control at the
   * end; rendering the library's `Label` and `Description` in there too says
   * everything twice, once quietly and once again quieter. The label is not
   * dropped — it becomes the control's `aria-label`, because a bare `Select` in
   * a row is nameless to anybody not looking at it.
   */
  readonly bare?: boolean;
  /**
   * ⚠️ WHY THIS VALUE WAS REFUSED, UNDER THIS CONTROL. `Problem.fields` carries
   * a message per input for exactly this, and a screen that renders only the
   * title puts "that does not look right" over a form without saying which
   * input it is about. Read it with `refusedOn` rather than reaching into the
   * optional chain per caller.
   */
  readonly error?: string;
}

export function Field({ name, spec, value, onChange, disabled, set, bare, error }: FieldProps) {
  const label = spec.label;
  const help = bare ? undefined : spec.help;
  const pending = value === undefined;
  /* ⚠️ ONE TAIL FOR EVERY KIND, so a refusal looks the same under a select as
     under a text box — and so a kind added later cannot forget to render one. */
  const tail = <Tail help={help} error={error} />;
  const invalid = error !== undefined;

  switch (spec.kind) {
    case "bool":
      return (
        <Switch
          /* ⚠️ A COLUMN, BECAUSE THE TAIL IS UNDERNEATH RATHER THAN BESIDE. The
             root is a row by default, which put the help text and the refusal in
             line with the switch and pushed the whole field sideways. */
          className="flex-col items-start"
          isSelected={value === true}
          isDisabled={disabled || pending}
          isInvalid={invalid}
          onChange={(next) => onChange(next)}
        >
          {/* ⚠️ THE CONTROL IS INSIDE THE CONTENT — see `SettledSwitch`. And the
              help and the refusal are SIBLINGS of it, which is what the library
              asks for: they are not part of the thing you press, and inside the
              label a refusal becomes another target that toggles the switch. */}
          <Switch.Content>
            <Switch.Control><Switch.Thumb /></Switch.Control>
            {label}
          </Switch.Content>
          {tail}
        </Switch>
      );

    case "enum":
      return (
        <Select
          selectedKey={value === undefined ? null : String(value)}
          isDisabled={disabled || pending}
          onSelectionChange={(key) => onChange(key)}
          isInvalid={invalid}
          placeholder="Choose one"
          aria-label={bare ? label : undefined}
        >
          {bare ? null : <Label>{label}</Label>}
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {/*
                ⚠️ AN OPTION IS AN ID AND A PERSON READS A WORD. `comfortable`
                and `not_started` are wire values, and they were rendered
                verbatim — a settings row saying "comfortable" in the middle of
                a screen where every other word is capitalised reads as a bug.
                `labels` is the app's own naming (kg, lb, RGB — things sentence
                case would get wrong); `sentence` is what happens when it says
                nothing, and it is right far more often than the raw id.
              */}
              {(spec.values ?? []).map((option) => {
                const said = spec.labels?.[option] ?? sentence(option);
                return (
                  <ListBox.Item key={option} id={option} textValue={said}>
                    {said}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                );
              })}
            </ListBox>
          </Select.Popover>
          {tail}
        </Select>
      );

    case "number":
    case "money":
      return (
        <NumberField
          value={typeof value === "number" ? value : Number.NaN}
          isDisabled={disabled || pending}
          minValue={spec.min}
          maxValue={spec.max}
          isInvalid={invalid}
          onChange={(next) => onChange(next)}
          aria-label={bare ? label : undefined}
        >
          {bare ? null : <Label>{label}</Label>}
          <Input />
          {tail}
        </NumberField>
      );

    /*
      ⚠️ BOTH OF THESE ARRIVE IN THEIR OWN CHUNK — see the top of this file and
      `pickers.tsx`. What stays here is the DECISION that the kind makes the
      control; what moved is the control, because two of them cost more than
      everything else this renderer can draw put together.
    */
    case "colour":
      return (
        <Awaited bare={bare}>
          <Colour {...picker({ label, value, onChange, disabled, pending, bare, invalid, tail })} />
        </Awaited>
      );

    case "day":
    case "instant":
      return (
        <Awaited bare={bare}>
          <DayPicker
            kind={spec.kind}
            {...picker({ label, value, onChange, disabled, pending, bare, invalid, tail })}
          />
        </Awaited>
      );

    case "long":
      return (
        <TextField
          value={typeof value === "string" ? value : ""}
          isDisabled={disabled || pending}
          isInvalid={invalid}
          onChange={(next) => onChange(next)}
          aria-label={bare ? label : undefined}
        >
          {/* ⚠️ `bare` REACHES HERE TOO. It did not, so a textarea in a sheet
              whose title is already the field's name printed that name again
              directly under it — the one thing `bare` exists to prevent, missed
              because a textarea is the one kind that never sat in a row. */}
          {bare ? null : <Label>{label}</Label>}
          <TextArea />
          {tail}
        </TextField>
      );

    default:
      return (
        <TextField
          name={name}
          value={typeof value === "string" ? value : ""}
          isDisabled={disabled || pending}
          type={spec.kind === "email" ? "email" : spec.kind === "url" ? "url" : "text"}
          isInvalid={invalid}
          onChange={(next) => onChange(next)}
          aria-label={bare ? label : undefined}
        >
          {bare ? null : <Label>{label}</Label>}
          <Input placeholder={set ? "Stored. Type to replace it." : undefined} />
          {tail}
        </TextField>
      );
  }
}

/**
 * ⚠️ THE PROPS BOTH PICKERS TAKE, ASSEMBLED ONCE. Spreading a literal at each
 * call site is two lists that have to agree, and the one that drifts is the one
 * whose kind nobody opened this week.
 */
const picker = (of: PickerProps): PickerProps => of;

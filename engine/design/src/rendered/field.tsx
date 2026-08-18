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

import type { FieldSpec } from "@engine/kernel";
import {
  Calendar, ColorArea, ColorField, ColorPicker, ColorSlider, ColorSwatch,
  DateField, DatePicker, Description, Input, Label, ListBox, NumberField, Select, Switch,
  TextArea, TextField,
} from "@heroui/react";
import { parseDate, parseDateTime } from "@internationalized/date";
import type { DateValue } from "@internationalized/date";
import { TYPE, sentence } from "../tokens/type.js";
import { Tail } from "../parts/forms.js";

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
          isSelected={value === true}
          isDisabled={disabled || pending}
          isInvalid={invalid}
          onChange={(next) => onChange(next)}
        >
          <Switch.Control><Switch.Thumb /></Switch.Control>
          <Switch.Content>
            <Label>{label}</Label>
            {tail}
          </Switch.Content>
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
      ⚠️ A COLOUR IS THE LIBRARY'S COLOUR PICKER. This kind is declared and fell
      through to the text case, so a workspace's brand colour was a box holding
      `#2563eb`, to be typed correctly by somebody who already knows hex. The
      first fix was a native `<input type="color">`, which is a swatch and
      nothing else — no presets, no keyboard channel entry, and a browser
      dialogue that belongs to the operating system rather than to this product.
      `ColorPicker` is a swatch trigger over an area, a hue slider and a hex
      field, themed like everything else (D7).

      ⚠️ THE VALUE CROSSES AS A HEX STRING, because that is what is stored. The
      picker's own `Color` object is a rendering detail and must not reach a
      manifest's setting.
    */
    case "colour":
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
                empty colour falls back to `#000000` above — it has to, the
                picker needs one — and a black disc is indistinguishable from a
                black somebody chose. On a dark card it is not even a disc: it
                is a hole. So the hex is written beside it, and when there is
                nothing it says so.

                ⚠️ AND IT STAYS IN `bare`, WHERE THE LABEL DOES NOT. `bare` drops
                the NAME because the row beside it already said that; the VALUE
                is the one thing a trailing control is for. Dropping both left a
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
          {/* ⚠️ THE ONE KIND WHOSE TAIL IS OUTSIDE ITS TRIGGER, because the
              trigger is a swatch and a sentence does not belong inside it. */}
          {tail}
        </ColorPicker>
      );

    /*
      ⚠️ AND A DAY IS THE LIBRARY'S DATE PICKER, for the same reason. A text box
      asking for a date gets `12/03` from half of Europe and the other half of it
      from everywhere else; a native `<input type="date">` fixes the ambiguity
      and hands the calendar to the operating system, which is a different
      product appearing inside this one.

      ⚠️ AN UNPARSEABLE STORED VALUE IS `null`, NOT A THROW. `parseDate` raises
      on anything that is not exactly its format, and a row written before this
      kind existed would take the whole screen down rather than show one empty
      field.
    */
    case "day":
    case "instant":
      return (
        <DatePicker
          value={asDate(value, spec.kind)}
          granularity={spec.kind === "day" ? "day" : "minute"}
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

/** ⚠️ See the `day` case — a stored value this cannot read is empty, never a throw. */
function asDate(value: unknown, kind: "day" | "instant"): DateValue | null {
  if (typeof value !== "string" || !value) return null;
  try {
    return kind === "day" ? parseDate(value) : parseDateTime(value.replace(/Z$/, ""));
  } catch {
    return null;
  }
}

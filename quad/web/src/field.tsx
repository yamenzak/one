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

import type { FieldSpec } from "@quad/kernel";
import {
  Description, Input, Label, ListBox, NumberField, Select, Switch, TextArea, TextField,
} from "@heroui/react";

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
}

export function Field({ name, spec, value, onChange, disabled, set, bare }: FieldProps) {
  const label = spec.label;
  const help = bare ? undefined : spec.help;
  const pending = value === undefined;

  switch (spec.kind) {
    case "bool":
      return (
        <Switch
          isSelected={value === true}
          isDisabled={disabled || pending}
          onChange={(next) => onChange(next)}
        >
          <Switch.Control><Switch.Thumb /></Switch.Control>
          <Switch.Content>
            <Label>{label}</Label>
            {help ? <Description>{help}</Description> : null}
          </Switch.Content>
        </Switch>
      );

    case "enum":
      return (
        <Select
          selectedKey={value === undefined ? null : String(value)}
          isDisabled={disabled || pending}
          onSelectionChange={(key) => onChange(key)}
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
              {(spec.values ?? []).map((option) => (
                <ListBox.Item key={option} id={option} textValue={option}>
                  {option}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
          {help ? <Description>{help}</Description> : null}
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
          onChange={(next) => onChange(next)}
          aria-label={bare ? label : undefined}
        >
          {bare ? null : <Label>{label}</Label>}
          <Input />
          {help ? <Description>{help}</Description> : null}
        </NumberField>
      );

    /*
      ⚠️ A COLOUR IS A SWATCH. This kind is declared, and it fell through to the
      text case — so a workspace's brand colour was a box containing `#2563eb`,
      to be typed correctly by somebody who already knows hex. The library ships
      no colour component at 3.2.4, so this is its own `Input` with the native
      type: a real swatch, a real picker, and the theme still owns the box.
    */
    case "colour":
      return (
        <TextField
          value={typeof value === "string" ? value : "#000000"}
          isDisabled={disabled || pending}
          onChange={(next) => onChange(next)}
          aria-label={bare ? label : undefined}
        >
          {bare ? null : <Label>{label}</Label>}
          {/* ⚠️ SIZED, OR THE SWATCH IS A LINE. A native colour input paints its
              swatch in the content box, and the library's input is a full-width
              text field one line tall — so the colour came out as a 3px rule
              floating in a wide empty box. A swatch is a square you can see. */}
          <Input type="color" className="h-9 w-16" />
          {help ? <Description>{help}</Description> : null}
        </TextField>
      );

    /*
      ⚠️ AND A DATE IS A DATE FIELD, for the same reason and with the same
      remedy. A text box asking for a day gets `12/03` from half of Europe and
      the other half of it from everywhere else.
    */
    case "day":
    case "instant":
      return (
        <TextField
          value={typeof value === "string" ? value : ""}
          isDisabled={disabled || pending}
          onChange={(next) => onChange(next)}
          aria-label={bare ? label : undefined}
        >
          {bare ? null : <Label>{label}</Label>}
          <Input type={spec.kind === "day" ? "date" : "datetime-local"} />
          {help ? <Description>{help}</Description> : null}
        </TextField>
      );

    case "long":
      return (
        <TextField
          value={typeof value === "string" ? value : ""}
          isDisabled={disabled || pending}
          onChange={(next) => onChange(next)}
        >
          <Label>{label}</Label>
          <TextArea />
          {help ? <Description>{help}</Description> : null}
        </TextField>
      );

    default:
      return (
        <TextField
          name={name}
          value={typeof value === "string" ? value : ""}
          isDisabled={disabled || pending}
          type={spec.kind === "email" ? "email" : spec.kind === "url" ? "url" : "text"}
          onChange={(next) => onChange(next)}
          aria-label={bare ? label : undefined}
        >
          {bare ? null : <Label>{label}</Label>}
          <Input placeholder={set ? "Stored. Type to replace it." : undefined} />
          {help ? <Description>{help}</Description> : null}
        </TextField>
      );
  }
}

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
}

export function Field({ name, spec, value, onChange, disabled, set }: FieldProps) {
  const label = spec.label;
  const help = spec.help;
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
        >
          <Label>{label}</Label>
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
        >
          <Label>{label}</Label>
          <Input />
          {help ? <Description>{help}</Description> : null}
        </NumberField>
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
        >
          <Label>{label}</Label>
          <Input placeholder={set ? "Stored. Type to replace it." : undefined} />
          {help ? <Description>{help}</Description> : null}
        </TextField>
      );
  }
}

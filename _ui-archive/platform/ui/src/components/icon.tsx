/**
 * THE ICON — a name from a closed set, drawn at the size its position decides.
 *
 * ⚠️ AN ICON NEVER CARRIES A SIZE OR A COLOUR. Both come from where it is
 * standing: 20px in a row's lead, 21 in a quick action, 16 as a chevron — the
 * five roles of §5.2. A `size` prop is the same glyph at two sizes on two
 * screens, which is what makes a set look assembled rather than drawn.
 *
 * ⚠️ AND AN ICON IS NEVER ALONE EXCEPT WHERE THE TARGET IS LEARNED. The app bar
 * and the tab bar are the two exceptions; everywhere else a label travels with
 * it, which is enforced by the components that take one.
 */

import { ICONS, type IconName } from "../icons.js";

export type { IconName };

export interface IconProps {
  readonly name: IconName;
  /**
   * ⚠️ ONLY WHEN THE ICON IS THE WHOLE MEANING. A glyph beside its own label is
   * decoration and is hidden; one standing alone in an app bar is the label.
   */
  readonly label?: string;
}

/**
 * ⚠️ THE MOTION IS ON THE ELEMENT, NOT IN THIS COMPONENT. `data-icon` is what
 * the choreographer animates when the control around it is pressed — the
 * component holds a role, never a timeline, exactly like everything else here.
 */
export function Icon({ name, label }: IconProps) {
  return (
    <svg
      data-one="icon"
      data-icon={name}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      /*
        ⚠️ THE GEOMETRY IS A STRING, AND THAT IS SAFE HERE IN A WAY IT ALMOST
        NEVER IS. It comes from `icons.ts`, which is generated from a package and
        re-derived by a test — it is not user input, cannot be reached from a
        prop, and the alternative is parsing twenty-two path sets into React
        elements at every render for no gain.
      */
      dangerouslySetInnerHTML={{ __html: ICONS[name] }}
    />
  );
}

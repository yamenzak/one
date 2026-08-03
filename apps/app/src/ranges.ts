/**
 * The date windows Kova's analytics endpoints accept as presets.
 *
 * `value` is the wire value (`/api/progress?range=30d`), `days` is what the
 * shared `RangePicker` counts back from today when it needs the same window as
 * dates — they have to agree, which is why they are written together here
 * rather than one in the control and one in the route.
 *
 * A custom window is NOT in this list: it is `start`/`end` on the query string,
 * resolved and clamped server-side by `resolveRange` (@kova/domain).
 */
import type { RangePresetDef } from "@4dl/ui";

export const RANGE_PRESETS: readonly RangePresetDef[] = [
  { value: "7d", label: "7d", days: 7 },
  { value: "30d", label: "30d", days: 30 },
  { value: "90d", label: "90d", days: 90 },
];

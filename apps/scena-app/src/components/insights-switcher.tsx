/**
 * INSIGHTS' TWO PARTS.
 *
 * A `SegmentedControl`, not a `SectionSwitcher` — the opposite call from the
 * Library, and for the reason §7 gives: below five sections a rail keeps
 * one-tap switching and still labels the active one, and "Analytics" and
 * "Alerts" are two short words that fit at any width. The switcher's two-tap
 * cost only buys something when the labels do not fit.
 *
 * Two components for two counts is not an inconsistency; it is the rule the
 * language states, applied twice.
 */

import { useNavigate } from "react-router-dom";
import { SegmentedControl } from "@4dl/ui";

export function InsightsSwitcher({ current }: { current: "analytics" | "alerts" }) {
  const navigate = useNavigate();
  return (
    <SegmentedControl
      fill
      className="mb-3"
      options={[
        { value: "analytics", label: "Analytics" },
        { value: "alerts", label: "Alerts" },
      ]}
      value={current}
      onChange={(v) => navigate(`/${v}`)}
    />
  );
}

/**
 * THE LIBRARY'S SIX KINDS, in one control.
 *
 * The old sidebar spelled these out as six rows under a "Building blocks"
 * heading — which was the sidebar admitting they are one destination with six
 * parts. They are one destination now, and this is how you move between them.
 *
 * ── Why `SectionSwitcher` and not a segmented control ───────────────────────
 *
 * Kova's Library uses a `SegmentedControl` because it has FOUR short labels
 * (Exercises · Foods · Templates · Content). Scena has six, and they are
 * "Slide playlists", "Music playlists", "Widget profiles" — six cells across a
 * phone is 68px each, which truncates every one of them to a syllable and puts
 * the hit area under §12's 44px floor.
 *
 * `SectionSwitcher` is the component for exactly that: past ~five sections the
 * rail stops working, so the sections move INTO the header and open as a list
 * with real labels, tones and a line each saying what is inside. Its own
 * docstring draws the line at five; this is six.
 *
 * ── It belongs to the LIST, not to the page ─────────────────────────────────
 *
 * Rendered inside each list, in both its page and its pane form — never above
 * the `Shape`. Two reasons, and the second is the load-bearing one:
 *
 *   · It is what you are switching. Opening a playlist and then changing the
 *     library kind is not a thing anyone does; changing kind while LOOKING at a
 *     list is the whole interaction.
 *   · A `Shape` needs a bounded box, and a header above it would have to be
 *     subtracted from that height by hand — the exact arithmetic that collapsed
 *     the first two-pane and cost four photographs to find. Inside the pane
 *     there is nothing to subtract.
 */

import { useNavigate } from "react-router-dom";
import { SectionSwitcher, type SectionDef } from "@4dl/ui";
import { Layers, LayoutGrid, Megaphone, Music, Rss, Image as ImageIcon } from "lucide-react";

export type LibraryKind = "playlists" | "music" | "profiles" | "media" | "feeds" | "ads";

/**
 * The hints are not filler. A person who has just arrived cannot tell a widget
 * profile from a slide playlist from the names, and the menu is the one place
 * with room to say — which is most of the argument for the menu over a rail.
 */
const SECTIONS: SectionDef<LibraryKind>[] = [
  { value: "playlists", label: "Slide playlists", icon: Layers, tone: "blocks", hint: "The visual loop a channel plays" },
  { value: "music", label: "Music playlists", icon: Music, tone: "channel", hint: "Clock-synced background audio" },
  { value: "profiles", label: "Widget profiles", icon: LayoutGrid, tone: "fleet", hint: "Overlay scenes — clock, weather, feeds" },
  { value: "media", label: "Media library", icon: ImageIcon, tone: "boards", hint: "Every uploaded and generated asset" },
  { value: "feeds", label: "Sources", icon: Rss, tone: "insights", hint: "RSS, an API, a sheet, the weather" },
  { value: "ads", label: "Ads", icon: Megaphone, tone: "warning", hint: "Scheduled interrupts between slides" },
];

export function LibrarySwitcher({ current }: { current: LibraryKind }) {
  const navigate = useNavigate();
  return (
    <SectionSwitcher
      sections={SECTIONS}
      value={current}
      onChange={(v) => navigate(`/${v}`)}
      title="Library"
      menuTitle="Go to"
      className="mb-3"
    />
  );
}

/**
 * Queue-caller (token display) variant metadata (§20). The live number comes
 * from the board DO; this is the shared list of display layouts. Several show
 * previously-called numbers, which the board widget draws from `recent[]`.
 */

import { type Config, str } from "./types.js";

export type QueueVariant = "solo" | "recent" | "grid" | "strip";

export const QUEUE_VARIANTS: { id: QueueVariant; label: string }[] = [
  { id: "solo", label: "Solo — the current number, large" },
  { id: "recent", label: "Recent — current + previous list" },
  { id: "grid", label: "Grid — ticket → counter board" },
  { id: "strip", label: "Strip — current + last few" },
];

export function queueVariant(config: Config): QueueVariant {
  const v = str(config.variant, "solo");
  return (["solo", "recent", "grid", "strip"] as const).includes(v as QueueVariant) ? (v as QueueVariant) : "solo";
}

/**
 * UI-layer twin of the pure `@mossa/domain` attention registry (mirrors
 * `notif-ui.ts` / `metric-coding.ts`): maps each attention type to an icon +
 * tone. Domain owns severity/permission/copy; presentation lives here.
 */

import { Target, Moon, ClipboardList, FlaskConical, ArrowLeftRight, Clock, CircleAlert, CircleUser, type LucideIcon, type Tone } from "@mossa/ui";
import type { AttentionType, AttentionSeverity } from "@mossa/domain";

export interface AttentionCoding { icon: LucideIcon; tone: Tone }

export const ATTENTION_CODING: Record<AttentionType, AttentionCoding> = {
  goal_stale: { icon: Target, tone: "nutrition" },
  client_quiet: { icon: Moon, tone: "danger" },
  checkin_unanswered: { icon: ClipboardList, tone: "cardio" },
  lab_review: { icon: FlaskConical, tone: "lab" },
  swap_pending: { icon: ArrowLeftRight, tone: "activity" },
  access_expiring: { icon: Clock, tone: "warning" },
  access_expired: { icon: CircleAlert, tone: "danger" },
  profile_incomplete: { icon: CircleUser, tone: "neutral" },
};

const DEFAULT: AttentionCoding = { icon: CircleAlert, tone: "neutral" };

export function attentionCoding(type: AttentionType): AttentionCoding {
  return ATTENTION_CODING[type] ?? DEFAULT;
}

/** Severity → a Badge tone, for the roster row rollup. */
export const SEVERITY_TONE: Record<AttentionSeverity, Tone> = {
  urgent: "danger",
  warn: "warning",
  info: "neutral",
};

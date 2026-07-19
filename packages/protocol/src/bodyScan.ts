/**
 * Camera body-scan payloads (SPEC §8.5). The nude frame NEVER leaves the device
 * — the app extracts circumferences + a de-identified silhouette contour
 * on-device and submits only those. The api recomputes the body-fat estimate
 * server-side from the circumferences (never trusting a client-sent %).
 */

import { z } from "zod";
import { LocalDate } from "./logs.js";

const cm = z.number().positive().max(300);

/** Circumferences derived on-device from the front + side silhouette (cm). */
export const BodyScanCircumferences = z.object({
  neckCm: cm,
  waistCm: cm,
  hipsCm: cm.nullish(),
  chestCm: cm.nullish(),
});
export type BodyScanCircumferences = z.infer<typeof BodyScanCircumferences>;

/** A normalized (0..1) outline polygon — non-photographic, stored only on
 *  consent, and used to redraw + morph-animate the silhouette across dates. */
const Contour = z.array(z.tuple([z.number(), z.number()])).max(600);

export const SubmitBodyScan = z.object({
  date: LocalDate,
  weightKg: z.number().positive().max(500),
  circumferences: BodyScanCircumferences,
  /** Optional de-identified outlines, stored only when the user opts in. */
  contourFront: Contour.nullish(),
  contourSide: Contour.nullish(),
  storeSilhouette: z.boolean().default(false),
});
export type SubmitBodyScan = z.infer<typeof SubmitBodyScan>;

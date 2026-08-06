/**
 * Screen-takeover presets + tone metadata (§12). A full-screen takeover isn't
 * always an emergency — it can be an everyday notice ("closed", "back soon",
 * "welcome"). Presets fill the message + tone in one tap; the tone drives the
 * on-screen look (background + icon), mirrored by the player's EmergencyOverlay.
 */
import type { OverrideTone } from "./api.js";
import { Siren, TriangleAlert, Info, Megaphone, PartyPopper, type LucideIcon } from "lucide-react";

export interface ToneUi {
  label: string;
  /** Header accent (Tailwind bg-*), used on the modal bar. */
  header: string;
  /** A CSS gradient that mirrors the player treatment, for the live preview. */
  gradient: string;
  icon: LucideIcon;
  /** True for tones that warrant the destructive (two-thought) confirm styling. */
  urgent: boolean;
}

export const TONE_UI: Record<OverrideTone, ToneUi> = {
  alarm: { label: "Alarm", header: "bg-red-600", gradient: "radial-gradient(circle at 50% 40%, #f0483f, #7f1d1d)", icon: Siren, urgent: true },
  warning: { label: "Warning", header: "bg-amber-500", gradient: "radial-gradient(circle at 50% 40%, #f5a524, #92590e)", icon: TriangleAlert, urgent: true },
  info: { label: "Info", header: "bg-blue-600", gradient: "radial-gradient(circle at 50% 40%, #4f8cf7, #1e3a8a)", icon: Info, urgent: false },
  neutral: { label: "Neutral", header: "bg-slate-600", gradient: "radial-gradient(circle at 50% 40%, #55617a, #1e2635)", icon: Megaphone, urgent: false },
  success: { label: "Positive", header: "bg-emerald-600", gradient: "radial-gradient(circle at 50% 40%, #34c569, #14532d)", icon: PartyPopper, urgent: false },
};

export const TONE_ORDER: OverrideTone[] = ["alarm", "warning", "info", "neutral", "success"];

export interface OverridePreset {
  id: string;
  category: "emergency" | "notice";
  label: string;
  title: string;
  body: string;
  tone: OverrideTone;
}

export const OVERRIDE_PRESETS: OverridePreset[] = [
  // Emergency
  { id: "evacuate", category: "emergency", label: "Evacuate", title: "Evacuate now", body: "Proceed calmly to the nearest exit and follow staff instructions.", tone: "alarm" },
  { id: "fire", category: "emergency", label: "Fire alarm", title: "Fire alarm", body: "Leave the building immediately by the nearest exit.", tone: "alarm" },
  { id: "lockdown", category: "emergency", label: "Lockdown", title: "Lockdown", body: "Stay inside, lock doors, and remain quiet until the all-clear.", tone: "warning" },
  { id: "shelter", category: "emergency", label: "Shelter in place", title: "Shelter in place", body: "Move away from windows and await further instructions.", tone: "warning" },
  { id: "weather", category: "emergency", label: "Severe weather", title: "Severe weather warning", body: "Move to a designated safe area now.", tone: "warning" },
  // Notices
  { id: "closed", category: "notice", label: "Closed", title: "We're closed", body: "Please check back during our opening hours.", tone: "neutral" },
  { id: "backsoon", category: "notice", label: "Back soon", title: "Back in a few minutes", body: "We'll be right with you — thanks for your patience.", tone: "neutral" },
  { id: "opening", category: "notice", label: "Opening soon", title: "Opening soon", body: "Doors open shortly. Thanks for waiting.", tone: "info" },
  { id: "maintenance", category: "notice", label: "Maintenance", title: "Temporarily unavailable", body: "This display is undergoing maintenance.", tone: "neutral" },
  { id: "event", category: "notice", label: "Private event", title: "Private event", body: "This space is reserved. Thanks for understanding.", tone: "info" },
  { id: "welcome", category: "notice", label: "Welcome", title: "Welcome!", body: "We're glad you're here.", tone: "success" },
];

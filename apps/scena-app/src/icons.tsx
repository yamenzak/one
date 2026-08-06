/** Nav + UI icons, lifted from the prototype's inline SVGs. */

import type { ReactNode } from "react";

const s = (children: ReactNode) => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
    {children}
  </svg>
);

export const icons: Record<string, ReactNode> = {
  team: s(
    <>
      <circle cx="7.5" cy="7" r="2.5" />
      <path d="M3 16c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" />
      <path d="M13.5 6.2a2.3 2.3 0 0 1 0 4.3M14 12.4c1.9.4 3 1.8 3 3.6" />
    </>,
  ),
  screens: s(
    <>
      <rect x="2.5" y="4" width="15" height="10" rx="1.5" />
      <line x1="7" y1="17" x2="13" y2="17" />
      <line x1="10" y1="14" x2="10" y2="17" />
    </>,
  ),
  channels: s(
    <>
      <rect x="3" y="4" width="14" height="3" rx="1" />
      <rect x="3" y="9" width="14" height="3" rx="1" />
      <rect x="3" y="14" width="14" height="2" rx="1" />
    </>,
  ),
  playlists: s(
    <>
      <path d="M10 2.5 17 6l-7 3.5L3 6l7-3.5z" />
      <path d="M3 10l7 3.5L17 10" />
      <path d="M3 14l7 3.5L17 14" />
    </>,
  ),
  widgets: s(
    <>
      <rect x="3" y="3" width="6" height="6" rx="1.5" />
      <rect x="11" y="3" width="6" height="6" rx="1.5" />
      <rect x="3" y="11" width="6" height="6" rx="1.5" />
      <rect x="11" y="11" width="6" height="6" rx="1.5" />
    </>,
  ),
  boards: s(
    <>
      <rect x="3" y="4" width="14" height="12" rx="2" />
      <circle cx="10" cy="10" r="2.4" />
    </>,
  ),
  feeds: s(
    <>
      <circle cx="5.5" cy="14.5" r="1.6" />
      <path d="M4 9.5a6.5 6.5 0 0 1 6.5 6.5" />
      <path d="M4 5a11 11 0 0 1 11 11" />
    </>,
  ),
  analytics: s(
    <>
      <rect x="3" y="10" width="3.5" height="7" rx="1" />
      <rect x="8.2" y="6" width="3.5" height="11" rx="1" />
      <rect x="13.4" y="3" width="3.5" height="14" rx="1" />
    </>,
  ),
  alerts: s(
    <>
      <path d="M10 3 3 16h14L10 3z" />
      <line x1="10" y1="8" x2="10" y2="11.5" />
      <circle cx="10" cy="13.7" r="0.4" fill="currentColor" />
    </>,
  ),
  billing: s(
    <>
      <rect x="2.5" y="5" width="15" height="10" rx="2" />
      <line x1="2.5" y1="8.5" x2="17.5" y2="8.5" />
    </>,
  ),
  music: s(
    <>
      <path d="M7 15V5l9-2v10" />
      <circle cx="5" cy="15" r="2" />
      <circle cx="14" cy="13" r="2" />
    </>,
  ),
  ads: s(
    <>
      <path d="M4 8v4h3l4 3V5L7 8H4z" />
      <path d="M14 7.5a3.5 3.5 0 0 1 0 5" />
    </>,
  ),
  ai: s(
    <>
      <path d="M10 3l1.6 4.4L16 9l-4.4 1.6L10 15l-1.6-4.4L4 9l4.4-1.6L10 3z" />
    </>,
  ),
  media: s(
    <>
      <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
      <circle cx="7" cy="8" r="1.5" />
      <path d="M3 14l4-3.5 3 2.5 3-3 4 4" />
    </>,
  ),
  admin: s(
    <>
      <path d="M10 2.5l6 2.2v4.5c0 3.6-2.5 6.6-6 8.3-3.5-1.7-6-4.7-6-8.3V4.7l6-2.2z" />
    </>,
  ),
  settings: s(
    <>
      <circle cx="10" cy="10" r="2.6" />
      <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4" />
    </>,
  ),
  plus: (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="10" y1="4" x2="10" y2="16" />
      <line x1="4" y1="10" x2="16" y2="10" />
    </svg>
  ),
  emergency: (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M10 3 3 16h14L10 3z" />
      <line x1="10" y1="8" x2="10" y2="11.5" />
    </svg>
  ),
  back: (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
      <polyline points="12,5 7,10 12,15" />
    </svg>
  ),
};

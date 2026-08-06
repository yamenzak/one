/** Palette icons for each widget type, keyed by the registry's `icon` id. */

import type { ReactNode } from "react";

const svg = (children: ReactNode) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

export const WIDGET_ICONS: Record<string, ReactNode> = {
  text: svg(
    <>
      <path d="M5 6h14M5 6v-1M19 6v-1M12 6v13M9 19h6" />
    </>,
  ),
  clock: svg(
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" />
    </>,
  ),
  date: svg(
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 9h16M8 3v4M16 3v4" />
    </>,
  ),
  ticker: svg(
    <>
      <rect x="3" y="8" width="18" height="8" rx="1.5" />
      <path d="M6 12h5M14 12h1.5" />
    </>,
  ),
  weather: svg(
    <>
      <circle cx="8" cy="9" r="3" />
      <path d="M7 17.5a3.5 3.5 0 0 1 .5-6.96A5 5 0 0 1 18 12.5a3.5 3.5 0 0 1-.5 6.98H8" />
    </>,
  ),
  stack: svg(
    <>
      <rect x="4" y="4" width="16" height="10" rx="2" />
      <path d="M6.5 17.5h11M8 20.5h8" />
    </>,
  ),
  queue: svg(
    <>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M9 12h6" strokeWidth="2.4" />
    </>,
  ),
  nowplaying: svg(
    <>
      <path d="M9 17V6l10-2v9" />
      <circle cx="6.5" cy="17" r="2.5" />
      <circle cx="16.5" cy="15" r="2.5" />
    </>,
  ),
  rooms: svg(
    <>
      <rect x="3" y="6" width="8" height="6" rx="1" />
      <rect x="13" y="6" width="8" height="6" rx="1" />
      <rect x="3" y="14" width="8" height="4" rx="1" />
      <rect x="13" y="14" width="8" height="4" rx="1" />
    </>,
  ),
  door: svg(
    <>
      <rect x="6" y="3" width="12" height="18" rx="1.5" />
      <circle cx="14.5" cy="12" r="1" fill="currentColor" stroke="none" />
    </>,
  ),
  score: svg(
    <>
      <rect x="3" y="5" width="18" height="12" rx="2" />
      <path d="M12 5v12" />
      <path d="M7 20h10" strokeWidth="2" />
    </>,
  ),
  rect: svg(<rect x="4" y="6" width="16" height="12" rx="2.5" />),
  circle: svg(<circle cx="12" cy="12" r="8" />),
  triangle: svg(<path d="M12 4.5 21 19.5H3z" />),
  line: svg(<path d="M4 12h16" strokeWidth="2.4" />),
  image: svg(
    <>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M4 16l4.5-4 4 3.5L16 12l4 4" />
    </>,
  ),
  countdown: svg(
    <>
      <circle cx="12" cy="13" r="7" />
      <path d="M12 13V9.5M9.5 4h5M12 4v2" />
    </>,
  ),
  metric: svg(
    <>
      <path d="M4 19V5M4 19h16" />
      <path d="M8 15l3-4 3 2.5L20 7" strokeWidth="1.9" />
    </>,
  ),
  menu: svg(
    <>
      <path d="M4 7h9M4 12h9M4 17h6" />
      <path d="M17 7h3M17 12h3M17 17h3" strokeWidth="2" />
    </>,
  ),
  qr: svg(
    <>
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <path d="M14 14h3v3M20 14v6h-6M17 20v.01" strokeWidth="1.9" />
    </>,
  ),
  html: svg(
    <>
      <path d="M9 8l-4 4 4 4M15 8l4 4-4 4" />
    </>,
  ),
  logo: svg(
    <>
      <rect x="3" y="6" width="18" height="12" rx="2.5" />
      <path d="M8 15l2.5-3 2 2L15 11l3 4" strokeWidth="1.9" />
      <circle cx="9" cy="10" r="1.3" />
    </>,
  ),
  cta: svg(
    <>
      <rect x="4" y="9" width="16" height="12" rx="2.5" />
      <rect x="8" y="13" width="3.4" height="3.4" rx="0.6" />
      <path d="M13.5 13h2.8M13.5 16.4h1.6" strokeWidth="1.7" />
      <path d="M12 3l1.3 2.7 2.9.3-2.2 2 .6 2.8L12 9.5 9.4 10.8l.6-2.8-2.2-2 2.9-.3z" strokeWidth="1.5" />
    </>,
  ),
};

export function widgetIcon(id: string): ReactNode {
  return WIDGET_ICONS[id] ?? WIDGET_ICONS.rect;
}

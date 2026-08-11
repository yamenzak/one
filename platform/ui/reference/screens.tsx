/**
 * THE FIVE ARCHETYPES, PHOTOGRAPHED FROM THE SHIPPED CODE.
 *
 * ⚠️ NOT SHIPPED CODE, AND NOTHING MAY IMPORT IT. This is the review harness:
 * it renders `@one/ui`'s real components through `@one/ui`'s real stylesheet and
 * writes an HTML file to photograph. Everything it adds of its own is the frame
 * around the screens — a phone-sized box and a caption — because a screenshot of
 * a 390pt design at browser width proves nothing about a 390pt design.
 *
 * ⚠️ AND IT RENDERS THE PACKAGE, NOT A COPY OF IT. `build.mjs` beside this file
 * is the PROTOTYPE the numbers were measured from, and a prototype that keeps
 * being photographed is a prototype the shipped code is free to drift from. This
 * one imports `../src`, so a defect in the photograph is a defect in the product.
 *
 * Run: `pnpm dlx tsx screens.tsx` from this directory, then photograph
 * `shipped.html` at 2× in both themes.
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import {
  Amount, AppBar, Badge, Button, Crown, DEFAULT_BRAND, Glyph, Identity, Medallion, Page, PageTitle,
  Promo, Row, Scroller, Section, Segmented, sheetFor, TileGrid, Topic, type Brand,
} from "../src/index.js";

/* ⚠️ Three tenants chosen to be AWKWARD rather than pretty — a blue, a green
   whose hue collides with the success tone, and a mid-lightness saturated
   orange, which is the case a hand-tuned palette fails. */
const TENANTS: Brand[] = [
  DEFAULT_BRAND,
  { ...DEFAULT_BRAND, accent: "#0b7a5a", ambience: { hue: 155, intensity: 0.045 } },
  { ...DEFAULT_BRAND, accent: "#e8590c", ambience: { hue: 32, intensity: 0.05 } },
];

const money = (whole: string, fraction: string) => <Amount prefix="$" whole={whole} fraction={fraction} />;

/* ══ A · CROWN — the screen is about ONE NUMBER. */
const crown = (
  <Page
    archetype="crown"
    top={
      <Crown
        bar={<AppBar leading="close" action={<Badge tone="accent">Pro</Badge>} />}
        eyebrow="Studio balance"
        amount={money("12,480", ".50")}
        under={<span>+$1,204 this month</span>}
        actions={[
          { id: "invoice", icon: "plus", label: "Invoice" },
          { id: "payout", icon: "send", label: "Pay out" },
          { id: "packages", icon: "box", label: "Packages" },
          { id: "more", icon: "dots", label: "More" },
        ]}
      />
    }
  >
    <Section title="Recent" total="4 today">
      <Row lead={<Medallion initials="MK" />} title="Marion Keller" detail="12-week strength" value="$240.00" onOpen={() => undefined} />
      <Row lead={<Medallion initials="AT" />} title="Aya Tanaka" detail="Nutrition only" value="$96.00" onOpen={() => undefined} />
      <Row lead={<Medallion initials="RS" />} title="Rui Santos" detail="Renewed" value="$180.00" onOpen={() => undefined} />
    </Section>
    <Promo title="Add a second coach" detail="Your plan covers three seats." action={<Button kind="quiet">Invite</Button>} />
  </Page>
);

/* ══ B · TOPIC — the screen is about ONE SUBJECT. */
const topic = (
  <Page
    archetype="topic"
    top={
      <Topic
        bar={<AppBar leading="back" />}
        icon="shield"
        title="Security"
        actions={[
          { id: "passkey", icon: "key", label: "Passkeys" },
          { id: "devices", icon: "phone", label: "Devices" },
          { id: "sessions", icon: "clock", label: "Sessions" },
        ]}
      />
    }
  >
    <Section title="Sign in">
      <Row lead={<Glyph icon="key" />} title="Passkeys" detail="2 registered" onOpen={() => undefined} />
      <Row lead={<Glyph icon="mail" />} title="Email codes" value="On" onOpen={() => undefined} />
    </Section>
    <Section title="Studio">
      <Row lead={<Glyph icon="users" />} title="Staff" value="3 seats" onOpen={() => undefined} />
      <Row lead={<Glyph icon="lock" />} title="Step-up codes" value={null} onOpen={() => undefined} />
    </Section>
  </Page>
);

/* ══ C · TITLE — the screen is a LIST. No hero: no one number and no subject. */
const title = (
  <Page
    archetype="title"
    top={<PageTitle bar={<AppBar leading="back" action={<Badge>24</Badge>} />} title="Clients" search="Search clients" />}
  >
    <Section title="Active" total="18">
      <Row lead={<Medallion initials="MK" />} title="Marion Keller" detail="Trains Mon · Wed · Fri" value="Week 6" onOpen={() => undefined} />
      <Row lead={<Medallion initials="AT" />} title="Aya Tanaka" detail="Nutrition only" value="Week 2" onOpen={() => undefined} />
      <Row lead={<Medallion initials="RS" />} title="Rui Santos" detail="Trains Tue · Thu" value="Week 11" onOpen={() => undefined} />
    </Section>
    <Section title="Lapsing" total="2">
      <Row lead={<Medallion initials="JD" />} title="Jonah Devlin" detail="3 days left" value={null} onOpen={() => undefined} />
    </Section>
  </Page>
);

/* ══ D · IDENTITY — the screen is about ONE PERSON. */
const identity = (
  <Page
    archetype="identity"
    top={
      <Identity
        bar={<AppBar leading="close" action={<Button kind="quiet">Edit</Button>} />}
        initials="MK"
        name="Marion Keller"
        detail="Client since March · Week 6 of 12"
        action={<Button kind="primary">Message</Button>}
      />
    }
  >
    <Section title="This week" total="4 of 5">
      <Row lead={<Glyph icon="dumbbell" />} title="Lower body" detail="Yesterday" value="Done" />
      <Row lead={<Glyph icon="apple" />} title="Nutrition" detail="2,140 kcal average" value="On track" />
    </Section>
    <Section title="What they can do">
      <Row lead={<Glyph icon="chart" />} title="Strength report" value="Included" />
      <Row lead={<Glyph icon="camera" />} title="Body scan" value={null} />
    </Section>
  </Page>
);

/* ══ E · FEED — independent sections, each carded with its own header INSIDE. */
const feed = (
  <Page archetype="feed" top={<AppBar title="Kova" action={<Badge tone="danger">3</Badge>} />}>
    <Section title="Today" inside more="See all" onMore={() => undefined}>
      <Row lead={<Medallion initials="MK" />} title="Marion logged a set" detail="Back squat · 5 × 5" value="9:12" />
      <Row lead={<Medallion initials="AT" />} title="Aya logged lunch" detail="620 kcal" value="12:40" />
    </Section>
    <Section title="At risk" inside more="Open retention" onMore={() => undefined}>
      <Row lead={<Medallion initials="JD" />} title="Jonah Devlin" detail="No activity for 9 days" value={null} />
    </Section>
    <Section title="Coaches" bleed>
      <Scroller label="Coaches">
        {["AL", "MK", "RS", "JD", "AT"].map((who) => (
          <span key={who} data-one="scroller-item"><Medallion initials={who} /></span>
        ))}
      </Scroller>
    </Section>
    <Section title="Load" inside>
      <Segmented options={[{ id: "week", label: "Week" }, { id: "month", label: "Month" }]} at="week" />
      <TileGrid
        tiles={[
          { id: "plans", icon: "list", label: "Plans" },
          { id: "meals", icon: "apple", label: "Meals" },
          { id: "media", icon: "image", label: "Media" },
          { id: "reports", icon: "chart", label: "Reports" },
        ]}
      />
    </Section>
  </Page>
);

const SCREENS = [
  ["A · crown", crown],
  ["B · topic", topic],
  ["C · title", title],
  ["D · identity", identity],
  ["E · feed", feed],
] as const;

/*
  ⚠️ THE FRAME IS THE HARNESS'S, AND IT IS THE ONLY CSS HERE. A 390 × 844 box, a
  caption, and a scroll clip — everything inside it is the package's own sheet.
  Anything else added here would be a fix that exists in the photograph and not
  in the product.
*/
const FRAME = `
  body { margin: 0; background: #0e0e10; font-family: -apple-system, "SF Pro Text", Inter, system-ui, sans-serif; }
  .stage { display: flex; gap: 28px; padding: 28px; align-items: flex-start; }
  .cap { color: #8b8d95; font: 500 12px/1 ui-monospace, monospace; padding: 0 0 10px 2px; letter-spacing: .06em; text-transform: uppercase; }
  .phone { inline-size: 390px; block-size: 844px; overflow: hidden; position: relative; border-radius: 22px;
           display: flex; flex-direction: column; background: var(--canvas); color: var(--canvas-ink); }
  .phone > [data-one='page'] { flex: 1; min-block-size: 0; overflow-y: auto; }
  .chrome-clock { flex: none; display: flex; justify-content: space-between; padding: 14px 22px 4px;
            font: 600 15px/1 system-ui; position: relative; z-index: 2; color: var(--canvas-ink); }
  [data-one='scroller-item'] { display: block; }
`;

const page = (brand: Brand, theme: "light" | "dark"): string => `<!doctype html>
<meta charset="utf8">
<html data-theme="${theme}"><head><style>
${existsSync("node_modules/daisyui/daisyui.css") ? readFileSync("node_modules/daisyui/daisyui.css", "utf8") : "/* daisyUI absent — the objects fall back to our own sheet */"}
${sheetFor(brand)}
${FRAME}
</style></head>
<body><div class="stage">
${SCREENS.map(([cap, node]) => `<div><div class="cap">${cap}</div><div class="phone"><div class="chrome-clock"><span>9:41</span><span>5G</span></div>${renderToStaticMarkup(node as never)}</div></div>`).join("\n")}
</div></body></html>`;

for (const [i, brand] of TENANTS.entries()) {
  for (const theme of ["dark", "light"] as const) {
    const name = `shipped-${i}-${theme}.html`;
    writeFileSync(new URL(name, import.meta.url), page(brand, theme));
    console.log(`wrote ${name}`);
  }
}

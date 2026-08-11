/**
 * THE SCREENS THE HARNESSES SHARE.
 *
 * ⚠️ NOT SHIPPED CODE, AND NOTHING IN `src` MAY IMPORT IT. Two harnesses
 * photograph these — the still one beside this file and the live page — and a
 * second copy of the screens is a second design: one gets a fix and the other
 * keeps being the picture somebody looks at.
 */

import React from "react";
import {
  Amount, AppBar, Badge, Button, Crown, Glyph, Identity, Medallion, Page, PageTitle,
  Promo, Row, Scroller, Section, Segmented, TileGrid, Topic,
} from "../src/index.js";

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
          { id: "more", icon: "dots" as const, label: "More" },
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

export const SCREENS = [
  ["A · crown", crown],
  ["B · topic", topic],
  ["C · title", title],
  ["D · identity", identity],
  ["E · feed", feed],
] as const;
